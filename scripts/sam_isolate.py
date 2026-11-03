"""
SAM (Segment Anything, ONNX via rembg model files) helper used to split a
retail box from the flacon when the two objects overlap in the Qogita photo.
The flacon pixels are never repainted - SAM only produces a better mask.
"""
import os

import cv2
import numpy as np
import onnxruntime as ort
from skimage.feature import peak_local_max

MODEL_DIR = os.path.join(os.path.expanduser("~"), ".rembg", "models", "sam")
ENC = "sam_vit_b_01ec64.encoder.quant.onnx"
DEC = "sam_vit_b_01ec64.decoder.quant.onnx"
BASE = "https://github.com/danielgatis/rembg/releases/download/v0.0.0/"
INPUT_H, INPUT_W = 684, 1024

_enc = _dec = None


def _ensure_models():
    import requests
    os.makedirs(MODEL_DIR, exist_ok=True)
    for f in (ENC, DEC):
        p = os.path.join(MODEL_DIR, f)
        if os.path.exists(p) and os.path.getsize(p) > 1_000_000:
            continue
        r = requests.get(BASE + f, stream=True, timeout=120, verify=False)
        r.raise_for_status()
        with open(p + ".part", "wb") as o:
            for chunk in r.iter_content(1 << 20):
                o.write(chunk)
        os.replace(p + ".part", p)


def _load():
    global _enc, _dec
    if _enc is None:
        _ensure_models()
        opts = ort.SessionOptions()
        _enc = ort.InferenceSession(os.path.join(MODEL_DIR, ENC), sess_options=opts)
        _dec = ort.InferenceSession(os.path.join(MODEL_DIR, DEC), sess_options=opts)
    return _enc, _dec


class Embedding:
    def __init__(self, rgb):
        enc, _ = _load()
        h, w = rgb.shape[:2]
        self.h, self.w = h, w
        self.scale = min(INPUT_W / w, INPUT_H / h)
        M = np.array([[self.scale, 0, 0], [0, self.scale, 0]], np.float32)
        canvas = cv2.warpAffine(rgb, M, (INPUT_W, INPUT_H), flags=cv2.INTER_LINEAR)
        self.embedding = enc.run(None, {enc.get_inputs()[0].name: canvas.astype(np.float32)})[0]

    def masks_for_point(self, x, y, negatives=()):
        """Return [(bool_mask, predicted_iou)] for a positive click at (x, y)
        (plus optional negative clicks placed on other objects)."""
        _, dec = _load()
        pts = [[x * self.scale, y * self.scale]] + [[nx * self.scale, ny * self.scale] for nx, ny in negatives] + [[0.0, 0.0]]
        coords = np.array([pts], np.float32)
        labels = np.array([[1] + [0] * len(negatives) + [-1]], np.float32)
        masks, ious, _ = dec.run(None, {
            "image_embeddings": self.embedding,
            "point_coords": coords,
            "point_labels": labels,
            "mask_input": np.zeros((1, 1, 256, 256), np.float32),
            "has_mask_input": np.zeros(1, np.float32),
            "orig_im_size": np.array([INPUT_H, INPUT_W], np.float32),
        })
        out = []
        ch, cw = int(self.h * self.scale), int(self.w * self.scale)
        for m, iou in zip(masks[0], ious[0]):
            m = (m[:ch, :cw] > 0).astype(np.uint8)
            m = cv2.resize(m, (self.w, self.h), interpolation=cv2.INTER_NEAREST).astype(bool)
            out.append((m, float(iou)))
        return out


def _largest_component(mask):
    n, lab, stats, _ = cv2.connectedComponentsWithStats(mask.astype(np.uint8), connectivity=8)
    if n <= 1:
        return None
    i = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    return lab == i


def _hull_mask(mask):
    cnts, _ = cv2.findContours(mask.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    out = np.zeros(mask.shape, np.uint8)
    if cnts:
        pts = np.vstack(cnts)
        cv2.fillConvexPoly(out, cv2.convexHull(pts), 1)
    return out.astype(bool)


def boxness(mask):
    """High for the rectangular retail box, low for a flacon with neck/cap."""
    ys, xs = np.where(mask)
    w, h = xs.max() - xs.min() + 1, ys.max() - ys.min() + 1
    solidity = mask.sum() / float(w * h)
    widths = mask.sum(axis=1)
    widths = widths[widths > 0].astype(np.float32)
    cv = float(widths.std() / (widths.mean() + 1e-6))
    return solidity + (0.35 - min(cv, 0.35)) * 0.6


def _best_mask(emb, x, y, negatives, grown, union_area):
    """Prefer the largest *whole-object* mask among confident SAM outputs."""
    cands = []
    for m, iou in emb.masks_for_point(int(x), int(y), negatives=negatives):
        m = _largest_component(m & grown)
        if m is None:
            continue
        a = m.sum()
        if a < 0.05 * union_area or a > 0.85 * union_area:
            continue
        cands.append((m, iou, a))
    if not cands:
        return None
    top = max(c[1] for c in cands)
    good = [c for c in cands if c[1] >= max(0.8, top - 0.1)] or cands
    m, iou, _ = max(good, key=lambda c: c[2])
    return m, iou


def _fill_holes(mask):
    cnts, _ = cv2.findContours(mask.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    out = np.zeros(mask.shape, np.uint8)
    cv2.drawContours(out, cnts, -1, 1, -1)
    return out.astype(bool)


def split_objects(rgb, union):
    """
    Segment the two dominant objects (retail box + flacon) with SAM.
    1st object: click on the thickest part of the foreground.
    2nd object: click on the thickest part of what is left after removing the 1st.
    Returns [mask1, mask2] (bool arrays) or [] when no clean split was found.
    """
    h, w = union.shape
    union_area = int(union.sum())
    emb = Embedding(rgb)
    grown = cv2.dilate(union.astype(np.uint8), np.ones((5, 5), np.uint8)).astype(bool)

    dist = cv2.distanceTransform(union.astype(np.uint8), cv2.DIST_L2, 5)
    y1, x1 = np.unravel_index(int(np.argmax(dist)), dist.shape)
    r1 = _best_mask(emb, x1, y1, [], grown, union_area)
    if r1 is None:
        return []
    m1 = _fill_holes(r1[0])

    residual = union & ~cv2.dilate(m1.astype(np.uint8), np.ones((9, 9), np.uint8)).astype(bool)
    residual = cv2.morphologyEx(residual.astype(np.uint8), cv2.MORPH_OPEN, np.ones((5, 5), np.uint8)).astype(bool)
    residual = _largest_component(residual)
    if residual is None or residual.sum() < 0.06 * union_area:
        return []
    dist2 = cv2.distanceTransform(residual.astype(np.uint8), cv2.DIST_L2, 5)
    y2, x2 = np.unravel_index(int(np.argmax(dist2)), dist2.shape)
    r2 = _best_mask(emb, x2, y2, [(x1, y1)], grown, union_area)
    if r2 is None:
        return []
    m2 = _fill_holes(r2[0])
    if (m1 & m2).sum() / float((m1 | m2).sum()) > 0.5:
        return []
    return [m1, m2]
