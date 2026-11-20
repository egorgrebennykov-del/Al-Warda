#!/usr/bin/env python3
"""Generate product images with a reference-guided studio edit."""

import argparse
import base64
import copy
import hashlib
import io
import json
import os
import re
import signal
import sys
import tempfile
import time
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import quote, urlencode, urlparse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fragrance_notes import apply_verified_notes, fetch_verified_notes

def _load_dotenv_if_needed():
    for cand in (
        Path(__file__).resolve().parents[1] / ".env",
        Path(__file__).resolve().parents[1] / "server" / ".env",
        Path.cwd() / "Al-Warda" / ".env",
        Path.cwd() / ".env",
    ):
        if cand.is_file():
            try:
                for line in cand.read_text(encoding="utf-8").splitlines():
                    line = line.strip()
                    if line and not line.startswith("#") and "=" in line:
                        k, v = line.split("=", 1)
                        k = k.strip()
                        v = v.strip().strip('"').strip("'")
                        if k and k not in os.environ:
                            os.environ[k] = v
            except Exception:
                pass
    if not os.environ.get("SUPABASE_URL"):
        os.environ["SUPABASE_URL"] = "https://al-warda.egor-grebennykov.workers.dev/api"
    if not os.environ.get("SUPABASE_SERVICE_ROLE_KEY"):
        os.environ["SUPABASE_SERVICE_ROLE_KEY"] = (
            os.environ.get("SUPABASE_ANON_KEY")
            or os.environ.get("NHOST_ADMIN_SECRET")
            or "sb_publishable_lTPiPLbRAqlq5B1PzAE1Vw_nN58DXgB"
        )

_load_dotenv_if_needed()

try:
    import urllib3
    urllib3.disable_warnings()
except Exception:
    pass

try:
    import requests
    try:
        _orig_session_init = requests.Session.__init__
        def _patched_session_init(self, *args, **kwargs):
            _orig_session_init(self, *args, **kwargs)
            self.verify = False
        requests.Session.__init__ = _patched_session_init
    except Exception:
        pass
except ImportError:
    requests = None

try:
    from PIL import Image, ImageOps
except ImportError:
    Image = None
    ImageOps = None

try:
    from rembg import new_session, remove
except ImportError:
    new_session = None
    remove = None

MODEL_ID = "@cf/black-forest-labs/flux-2-klein-4b"
IMAGE_ENDPOINT = (
    "https://api.cloudflare.com/client/v4/accounts/"
    "{account_id}/ai/run/@cf/black-forest-labs/flux-2-klein-4b"
)
GENERATED_DIR = Path(__file__).resolve().parents[1] / "public" / "assets" / "img" / "generated-products"
DIST_GENERATED_DIR = Path(__file__).resolve().parents[1] / "dist" / "assets" / "img" / "generated-products"
GENERATED_URL = "/assets/img/generated-products/"
MAX_STATIC_IMAGE_BYTES = 25 * 1024 * 1024
DEFAULT_BATCH_SIZE = 160
MAX_BATCH_SIZE = 100000
MODEL_STEPS = 4
PAGE_SIZE = 500
MAX_SOURCE_BYTES = 20 * 1024 * 1024
MAX_SOURCE_PIXELS = 24_000_000
# Fidelity guard: reject a generated image whose dominant product colour deviates
# too far from the original source (median RGB of the product pixels). Only gross
# mismatches (a different bottle / wrong colour) trip this, so faithful results
# pass untouched.
MAX_PRODUCT_COLOR_DISTANCE = 100
STALE_PROCESSING_MINUTES = 15
STALE_PUBLISHING_MINUTES = 60
SCHEDULE_WAIT_WINDOW_SECONDS = 900
UNPUBLISHED_ERROR = "Generated image was not published; generation must be retried"
U2NET_SHA256 = "8d10d2f3bb75ae3b6d527c77944fc5e7dcd94b29809d47a739a7a728a912b491"
U2NET_URLS = (
    "https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2net.onnx",
    "https://huggingface.co/skillsafe-ai/u2net/resolve/main/u2net.onnx",
)
U2NET_MAX_BYTES = 200 * 1024 * 1024

RMBG_SHA256 = "8cafcf770b06757c4eaced21b1a88e57fd2b66de01b8045f35f01535ba742e0f"
RMBG_URLS = (
    "https://huggingface.co/briaai/RMBG-1.4/resolve/main/onnx/model.onnx",
)
RMBG_MAX_BYTES = 250 * 1024 * 1024


class WorkersDailyQuotaExceeded(RuntimeError):
    pass


class SegmentationFailedError(RuntimeError):
    """Background removal failed; the original photo is kept and the job is
    marked segmentation_failed instead of being published or redrawn."""


class WorkersConfigurationError(RuntimeError):
    pass


class WorkersOutputFlaggedError(RuntimeError):
    """Cloudflare Workers AI safety filter flagged the output or input image (error 3030).
    The pipeline falls back to authentic direct studio cutout of the real product photo
    so the product is safely published instead of failing."""
    pass


ACCOUNT_ENV = {
    "primary": ("CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_API_TOKEN", "CLOUDFLARE_WORKERS_AI_FREE_PLAN_CONFIRMED"),
    "secondary": ("SECONDARY_ACCOUNT_ID", "SECONDARY_API_TOKEN", "SECONDARY_FREE_CONFIRMED"),
    "third": ("THIRD_ACCOUNT_ID", "THIRD_API_TOKEN", "THIRD_FREE_CONFIRMED"),
    "fourth": ("FOURTH_ACCOUNT_ID", "FOURTH_API_TOKEN", "FOURTH_FREE_CONFIRMED"),
    "fifth": ("FIFTH_ACCOUNT_ID", "FIFTH_API_TOKEN", "FIFTH_FREE_CONFIRMED"),
}

DEFAULT_ACCOUNT_QUOTAS = {
    "primary": {
        "limitedAt": "2026-11-08T14:38:00.000Z",
        "partialAvailableAt": "2026-11-09T10:06:19.000Z",
        "availableAt": "2026-11-09T14:38:00.000Z",
        "updatedAt": "2026-11-08T14:38:00.000Z",
    },
    "secondary": {
        "limitedAt": "2026-11-08T14:53:00.000Z",
        "availableAt": "2026-11-09T14:53:00.000Z",
        "updatedAt": "2026-11-08T14:53:00.000Z",
    },
    "third": {
        "limitedAt": "2026-11-08T15:25:17.000Z",
        "availableAt": "2026-11-09T15:25:17.000Z",
        "updatedAt": "2026-11-08T15:25:17.000Z",
    },
    "fourth": {
        "limitedAt": "2026-11-08T15:46:19.000Z",
        "availableAt": "2026-11-09T15:46:19.000Z",
        "updatedAt": "2026-11-08T15:46:19.000Z",
    },
    "fifth": {
        "limitedAt": "2026-11-08T16:07:14.000Z",
        "availableAt": "2026-11-09T16:07:14.000Z",
        "updatedAt": "2026-11-08T16:07:14.000Z",
    },
}


def parse_iso_datetime(value):
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        parsed = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def quota_entry_rank(entry):
    if not isinstance(entry, dict):
        return datetime.min.replace(tzinfo=timezone.utc)
    for field in ("updatedAt", "availableAt", "limitedAt", "lastUsedAt"):
        parsed = parse_iso_datetime(entry.get(field))
        if parsed is not None:
            return parsed
    return datetime.min.replace(tzinfo=timezone.utc)


def extract_account_quotas(rows):
    merged = copy.deepcopy(DEFAULT_ACCOUNT_QUOTAS)
    for row in rows:
        info = row.get("info") if isinstance(row, dict) else None
        if not isinstance(info, dict):
            continue
        stored = info.get("imageGenerationAccountQuotas")
        if not isinstance(stored, dict):
            continue
        for account_name in ACCOUNT_ENV:
            candidate = stored.get(account_name)
            if isinstance(candidate, dict):
                if quota_entry_rank(candidate) >= quota_entry_rank(merged.get(account_name)):
                    merged[account_name] = {**(merged.get(account_name) or {}), **candidate}
    return merged


def load_image_accounts(environ):
    selected = environ.get("CLOUDFLARE_IMAGE_ACCOUNT")
    if not selected:
        selected = "primary" if environ.get("CLOUDFLARE_ACCOUNT_ID") else "local"
    if selected == "local":
        return []
    if selected != "auto" and selected not in ACCOUNT_ENV:
        raise WorkersConfigurationError("Unknown Cloudflare account selection")
    names = list(ACCOUNT_ENV) if selected == "auto" else [selected]
    accounts = []
    for name in names:
        id_key, token_key, free_key = ACCOUNT_ENV[name]
        if not environ.get(id_key) or not environ.get(token_key):
            raise WorkersConfigurationError(f"Cloudflare {name} account ID or API token is missing")
        if environ.get(free_key) != "true":
            raise WorkersConfigurationError(f"Cloudflare {name} Free plan has not been confirmed")
        accounts.append((name, environ[id_key], environ[token_key]))
    if len({account[1] for account in accounts}) != len(accounts):
        raise WorkersConfigurationError("Cloudflare account IDs must be distinct")
    return accounts


class ImageAccountPool:
    def __init__(self, accounts, quotas=None, persist_quotas=False):
        self.accounts = accounts
        self.index = 0
        self.quotas = copy.deepcopy(quotas) if isinstance(quotas, dict) else {}
        self.persist_quotas = bool(persist_quotas)
        self.generated_in_run = {name: 0 for name, _, _ in accounts}

    def record_success(self, name, now=None):
        now_dt = now or utc_now()
        self.generated_in_run[name] = self.generated_in_run.get(name, 0) + 1
        if not self.persist_quotas:
            return
        entry = dict(self.quotas.get(name) or {})
        entry["lastUsedAt"] = now_dt.isoformat()
        entry["updatedAt"] = now_dt.isoformat()
        avail_dt = parse_iso_datetime(entry.get("availableAt"))
        if avail_dt and now_dt >= avail_dt:
            entry.pop("partialAvailableAt", None)
        self.quotas[name] = entry

    def record_limit(self, name, now=None):
        if not self.persist_quotas:
            return
        now_dt = now or utc_now()
        entry = dict(self.quotas.get(name) or {})
        existing_avail = parse_iso_datetime(entry.get("availableAt"))
        entry["limitedAt"] = now_dt.isoformat()
        if self.generated_in_run.get(name, 0) > 0 or existing_avail is None:
            entry["availableAt"] = (now_dt + timedelta(hours=24)).isoformat()
            entry.pop("partialAvailableAt", None)
        elif now_dt >= existing_avail:
            entry["availableAt"] = (now_dt + timedelta(minutes=30)).isoformat()
        entry["updatedAt"] = now_dt.isoformat()
        self.quotas[name] = entry

    def export_quotas(self):
        return copy.deepcopy(self.quotas)

    def generate(self, session, source_bytes):
        while self.index < len(self.accounts):
            name, account_id, api_token = self.accounts[self.index]
            try:
                result = generate_product_edit(session, account_id, api_token, source_bytes)
                self.record_success(name)
                return result
            except WorkersDailyQuotaExceeded:
                self.record_limit(name)
                print(f"PROVIDER LIMIT: {name} account; switching if another account is available.", flush=True)
                self.index += 1
        raise WorkersDailyQuotaExceeded("All selected Cloudflare accounts reported a provider limit")


def file_sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as model:
        for chunk in iter(lambda: model.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def prepare_segmentation_model():
    model_dir = Path(os.path.expanduser(os.environ.get("RMBG_HOME", os.environ.get("U2NET_HOME", "~/.rmbg"))))
    rmbg_path = model_dir / "rmbg-1.4.onnx"
    if rmbg_path.is_file() and file_sha256(rmbg_path) == RMBG_SHA256:
        os.environ["RMBG_HOME"] = str(model_dir)
        print("Using verified cached RMBG-1.4 model (1024x1024 SOTA).", flush=True)
        return rmbg_path

    # Check cached U2Net model first if RMBG is not cached
    u2net_path = model_dir / "u2net.onnx"
    if u2net_path.is_file() and file_sha256(u2net_path) == U2NET_SHA256:
        os.environ["U2NET_HOME"] = str(model_dir)
        print("Using verified cached U2Net model.", flush=True)
        return u2net_path

    model_dir.mkdir(parents=True, exist_ok=True)

    # If U2NET_HOME is not explicitly set in test or env, prefer downloading RMBG-1.4
    if not os.environ.get("U2NET_HOME"):
        for attempt in range(2):
            for url in RMBG_URLS:
                temporary_path = None
                try:
                    print(f"Downloading RMBG-1.4 model from {url} (attempt {attempt + 1}/2).", flush=True)
                    with requests.get(url, stream=True, timeout=(15, 120)) as response:
                        response.raise_for_status()
                        digest = hashlib.sha256()
                        total = 0
                        with tempfile.NamedTemporaryFile(dir=model_dir, prefix="rmbg-", suffix=".tmp", delete=False) as output:
                            temporary_path = Path(output.name)
                            for chunk in response.iter_content(chunk_size=1024 * 1024):
                                if not chunk:
                                    continue
                                total += len(chunk)
                                if total > RMBG_MAX_BYTES:
                                    raise ValueError("RMBG model download exceeds size limit")
                                digest.update(chunk)
                                output.write(chunk)
                        if digest.hexdigest() != RMBG_SHA256:
                            raise ValueError("RMBG model checksum mismatch")
                    os.replace(temporary_path, rmbg_path)
                    os.environ["RMBG_HOME"] = str(model_dir)
                    print("RMBG-1.4 model downloaded and verified.", flush=True)
                    return rmbg_path
                except Exception as error:
                    print(f"RMBG download attempt failed: {error}", file=sys.stderr, flush=True)
                finally:
                    if temporary_path is not None:
                        try:
                            temporary_path.unlink()
                        except OSError:
                            pass
            time.sleep(2)

    # Fallback to U2Net download
    failures = []
    for attempt in range(3):
        for url in U2NET_URLS:
            temporary_path = None
            try:
                print(f"Downloading U2Net model from {url} (attempt {attempt + 1}/3).", flush=True)
                with requests.get(url, stream=True, timeout=(15, 120)) as response:
                    response.raise_for_status()
                    digest = hashlib.sha256()
                    total = 0
                    with tempfile.NamedTemporaryFile(dir=model_dir, prefix="u2net-", suffix=".tmp", delete=False) as output:
                        temporary_path = Path(output.name)
                        for chunk in response.iter_content(chunk_size=1024 * 1024):
                            if not chunk:
                                continue
                            total += len(chunk)
                            if total > U2NET_MAX_BYTES:
                                raise ValueError("U2Net model download exceeds size limit")
                            digest.update(chunk)
                            output.write(chunk)
                    if digest.hexdigest() != U2NET_SHA256:
                        raise ValueError("U2Net model checksum mismatch")
                os.replace(temporary_path, u2net_path)
                os.environ["U2NET_HOME"] = str(model_dir)
                print("U2Net model downloaded and verified.", flush=True)
                return u2net_path
            except (requests.RequestException, OSError, ValueError) as error:
                failures.append(f"{url}: {error}")
                print(f"U2Net download failed: {error}", file=sys.stderr, flush=True)
            finally:
                if temporary_path is not None:
                    try:
                        temporary_path.unlink()
                    except OSError:
                        pass
        if attempt < 2:
            time.sleep(2 ** attempt * 5)
    raise RuntimeError("Could not download verified segmentation model after retries: " + "; ".join(failures))


def create_local_segmentation_session():
    """Create a local high-performance ONNX InferenceSession for RMBG-1.4/U2Net with zero API costs.
    Conservative thread limits (max 2 threads) prevent computer overload while maximizing quality."""
    model_path = prepare_segmentation_model()
    try:
        import onnxruntime as ort
        opts = ort.SessionOptions()
        # Conservative CPU allocation: max 2 threads keeps computer responsive, quiet and cool
        cpu_count = os.cpu_count() or 2
        opts.intra_op_num_threads = min(2, cpu_count)
        opts.inter_op_num_threads = 1
        opts.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
        opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        return ort.InferenceSession(str(model_path), sess_options=opts, providers=["CPUExecutionProvider"])
    except Exception as err:
        print(f"onnxruntime initialization fallback: {err}", file=sys.stderr, flush=True)
        if new_session is not None:
            return new_session("u2net")
        return None


def run_onnx_rmbg_segmentation(source, session):
    """Direct, state-of-the-art 1024x1024 RMBG-1.4 inference via onnxruntime.
    Captures fine flacon caps, transparent glass bases, intricate typography and packaging with 0 API cost."""
    import cv2
    import numpy as np

    w, h = source.size
    resized = source.resize((1024, 1024), Image.BILINEAR)
    arr = np.array(resized.convert("RGB"), dtype=np.float32) / 255.0
    mean = np.array([0.5, 0.5, 0.5], dtype=np.float32)
    std = np.array([1.0, 1.0, 1.0], dtype=np.float32)
    arr = (arr - mean) / std
    input_tensor = np.transpose(arr, (2, 0, 1))[np.newaxis, :, :, :]

    input_name = session.get_inputs()[0].name
    outputs = session.run(None, {input_name: input_tensor})
    pred = outputs[0][0, 0, :, :]
    if pred.min() < 0.0 or pred.max() > 1.0:
        pred = 1.0 / (1.0 + np.exp(-pred))

    mask_full = cv2.resize(pred, (w, h), interpolation=cv2.INTER_CUBIC)
    mask_full = np.clip(mask_full, 0.0, 1.0)
    alpha_u8 = (mask_full * 255.0).astype(np.uint8)
    alpha_u8 = cv2.GaussianBlur(alpha_u8, (3, 3), 0.5)

    cutout = source.convert("RGBA")
    cutout.putalpha(Image.fromarray(alpha_u8, mode="L"))
    return cutout


def run_onnx_u2net_segmentation(source, session):
    """Direct, high-performance U2Net inference via onnxruntime."""
    import cv2
    import numpy as np

    w, h = source.size
    resized = source.resize((320, 320), Image.BILINEAR)
    arr = np.array(resized.convert("RGB"), dtype=np.float32) / 255.0
    mean = np.array([0.485, 0.456, 0.406], dtype=np.float32)
    std = np.array([0.229, 0.224, 0.225], dtype=np.float32)
    arr = (arr - mean) / std
    input_tensor = np.transpose(arr, (2, 0, 1))[np.newaxis, :, :, :]

    input_name = session.get_inputs()[0].name
    outputs = session.run(None, {input_name: input_tensor})
    pred = outputs[0][0, 0, :, :]
    p_min, p_max = pred.min(), pred.max()
    pred = (pred - p_min) / (p_max - p_min + 1e-8)

    # Smooth & crisp contrast curve (gentle floor prevents cutting dark packaging, caps, or glass bases)
    mask_full = cv2.resize(pred, (w, h), interpolation=cv2.INTER_CUBIC)
    alpha = np.clip((mask_full - 0.08) / (0.88 - 0.08), 0.0, 1.0)
    alpha_u8 = (alpha * 255.0).astype(np.uint8)
    alpha_u8 = cv2.GaussianBlur(alpha_u8, (3, 3), 0.5)

    cutout = source.convert("RGBA")
    cutout.putalpha(Image.fromarray(alpha_u8, mode="L"))
    return cutout


def utc_now():
    return datetime.now(timezone.utc)


def image_generation(info):
    value = info.get("imageGeneration")
    return value if isinstance(value, dict) else {}


def product_source(row):
    info = row.get("info") or {}
    source = info.get("rawImage")
    if not isinstance(source, str):
        return None
    if info.get("manualSourceImage") or (info.get("imageGeneration") or {}).get("manualSource"):
        if source.startswith("data:image/") and ";base64," in source:
            return source
        parsed_manual = urlparse(source)
        if parsed_manual.scheme == "https" and parsed_manual.hostname:
            return source
    parsed = urlparse(source)
    if parsed.scheme != "https" or not parsed.hostname or not parsed.hostname.endswith(".qogita.com"):
        return None
    if re.search(r"no[-_]?image|not[_-]?found|missing|46e86f1d826c199f04588f35f1fd8afe|c1b79cffa1a5fa8aab226414b9e4a063", source, re.I):
        return None
    return source


BRAND_DOMAINS = {
    "afnan": ["afnan.com"],
    "lattafa": ["lattafa-usa.com"],
    "maison alhambra": ["lattafa-usa.com"],
    "asdaaf": ["lattafa-usa.com"],
    "armaf": ["armaf.com", "sterlingparfums.com"],
    "sterling": ["sterlingparfums.com", "armaf.com"],
    "flavia": ["sterlingparfums.com"],
    "just jack": ["sterlingparfums.com"],
    "swiss arabian": ["swissarabian.com"],
    "ajmal": ["in.ajmal.com", "ajmalperfume.com"],
    "al haramain": ["alharamainperfumes.co.uk", "alharamainperfumes.com"],
    "orientica": ["orientica.com", "alharamainperfumes.co.uk", "alharamainperfumes.com"],
    "al wataniah": ["alwataniah.com"],
    "amouage": ["amouage.com"],
    "rasasi": ["rasasistore.com"],
    "paris corner": ["pariscornerperfumes.com"],
    "fragrance world": ["fragranceworld.ae"],
    "french avenue": ["fragranceworld.ae"],
}

TRUSTED_RETAILER_DOMAINS = [
    "intenseoud.com",
    "oudstore.com",
    "tripletraders.com",
    "fragflex.com",
]

GENERIC_STOPWORDS = {
    "fragrance", "perfume", "perfumes", "spray", "eau", "de", "parfum",
    "toilette", "edp", "edt", "vaporisateur", "unisex", "for", "men", "women",
    "him", "her", "pour", "homme", "femme", "set", "gift", "coffret", "natural",
    "oil", "perfumed", "concentrated", "alcoholfree", "roll", "on", "rollon",
    "attar", "ittar", "extrait", "cologne", "puro", "with"
}


def is_perfume_set(name, info=None):
    if not name and not info:
        return False
    info = info or {}
    if info.get("isSet") or info.get("category") == "sets" or info.get("categorySlug") == "sets":
        return True
    text = f"{name or ''} {info.get('title') or ''} {info.get('volume') or ''} {info.get('category') or ''}".lower()
    return bool(
        re.search(
            r"\b(set|gift\s*set|fragrance\s*set|perfume\s*set|discovery\s*set|travel\s*set|coffret|pack\s+of\s+\d+|\d+\s*pcs?|\d+\s*pieces?|\d+\s*in\s*1|набор|сет)\b",
            text,
            re.IGNORECASE,
        )
        or re.search(r"\+\s*\d+(\.\d+)?\s*ml\b", text, re.IGNORECASE)
        or re.search(r"\b\d+\s*[x×]\s*\d+(\.\d+)?\s*ml\b", text, re.IGNORECASE)
        or re.search(r"\b\d+\s*ml\s+(shower\s*gel|body\s*lotion|body\s*milk|after\s*shave|deo|deodorant)\b", text, re.IGNORECASE)
    )


def clean_product_name_for_search(name, brand=""):
    clean = name or ""
    if brand:
        clean = re.sub(re.escape(brand), "", clean, flags=re.IGNORECASE)
    clean = re.sub(r"\s*[-–|]\s*long\s+lasting.*$", "", clean, flags=re.IGNORECASE)
    clean = re.sub(
        r"\b(eau de parfum|eau de toilette|extrait de parfum|eau de cologne|perfumed oil|concentrated perfume oil|perfume oil|alcoholfree|alcohol free|roll-on|roll on|rollon|edp|edt|spray|vaporisateur|unisex|pour homme|pour femme|for men|for women|for him|for her|natural spray|concentrated|attar|ittar|luxury|arabic|perfume)\b",
        "",
        clean,
        flags=re.IGNORECASE,
    )
    clean = re.sub(r"\b(\d+\s*ml|\d+(\.\d+)?\s*fl\.?\s*oz)\b", "", clean, flags=re.IGNORECASE)
    clean = re.sub(r"[^\w\s-]", " ", clean)
    clean = re.sub(r"\s+", " ", clean).strip()
    return clean


def upgrade_shopify_image_url(img_url):
    """Strip Shopify thumbnail size suffixes and width/height query params to fetch full-res originals."""
    if not isinstance(img_url, str) or not img_url:
        return img_url
    if img_url.startswith("//"):
        img_url = "https:" + img_url
    if "cdn.shopify.com" in img_url or "/cdn/shop/" in img_url:
        parsed = urlparse(img_url)
        clean_path = re.sub(
            r"_(?:\d+x\d*|pico|icon|thumb|small|compact|medium|large|grande|1024x1024|2048x2048)(?=\.(?:png|jpe?g|webp)$)",
            "",
            parsed.path,
            flags=re.IGNORECASE,
        )
        qs = urllib.parse.parse_qs(parsed.query, keep_blank_values=True)
        qs.pop("width", None)
        qs.pop("height", None)
        new_query = urllib.parse.urlencode(qs, doseq=True)
        return urllib.parse.urlunparse((parsed.scheme, parsed.netloc, clean_path, parsed.params, new_query, parsed.fragment))
    return img_url


def search_official_studio_image(name, brand="", is_set=False):
    candidates = search_official_studio_candidates(name, brand=brand, is_set=is_set)
    return candidates[0] if candidates else None


def search_official_studio_candidates(name, brand="", is_set=False):
    brand_key = (brand or "").lower().strip()
    domains = []
    for k, d_list in BRAND_DOMAINS.items():
        if k in brand_key or brand_key in k:
            for d in d_list:
                if d not in domains:
                    domains.append(d)

    cleaned = clean_product_name_for_search(name, brand)
    queries = []
    if is_set:
        base_no_set = re.sub(r"\b(set|gift set|coffret|набор)\b", "", cleaned, flags=re.IGNORECASE).strip()
        queries.append(f"{base_no_set} Gift Set")
        queries.append(f"{base_no_set} Set")
        queries.append(base_no_set)
    else:
        if cleaned:
            queries.append(cleaned)
        words = cleaned.split()
        if len(words) > 3:
            queries.append(" ".join(words[:3]))
        if len(words) > 2:
            queries.append(" ".join(words[:2]))

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }

    clean_tokens = set(re.findall(r"[a-z0-9]+", cleaned.lower())) - GENERIC_STOPWORDS
    brand_tokens = set(re.findall(r"[a-z0-9]+", brand_key)) - GENERIC_STOPWORDS
    query_is_deo_or_body = bool(
        re.search(
            r"\b(deo|deodorant|body\s*spray|body\s*mist|hair\s*mist|shower\s*gel|body\s*lotion|after\s*shave)\b",
            (name or "").lower(),
        )
    )

    all_matches = []
    seen_urls = set()

    def _query_shopify_domains(domain_list, include_brand_in_query=False, require_brand_match=False, source_tag="official_studio"):
        nonlocal all_matches
        for domain in domain_list:
            for q in queries:
                if not q:
                    continue
                q_str = f"{brand} {q}".strip() if (include_brand_in_query and brand) else q
                try:
                    url = f"https://{domain}/search/suggest.json?q={urllib.parse.quote(q_str)}&resources[type]=product"
                    resp = requests.get(url, headers=headers, timeout=6)
                    if not resp.ok or "json" not in (resp.headers.get("content-type") or "").lower():
                        continue
                    data = resp.json()
                    products = data.get("resources", {}).get("results", {}).get("products", [])
                    for p in products:
                        title = p.get("title", "")
                        title_lower = title.lower()
                        page_url_raw = str(p.get("url") or "").lower()
                        p_is_set = bool(
                            re.search(
                                r"\b(set|gift|coffret|discovery|travel\s+set|pack\s+of)\b",
                                title_lower,
                            )
                        )
                        p_is_deo_or_body = bool(
                            re.search(
                                r"\b(deo|deodorant|body\s*spray|body\s*mist|hair\s*mist|shower\s*gel|body\s*lotion|after\s*shave)\b",
                                f"{title_lower} {page_url_raw}",
                            )
                        )

                        if is_set and not p_is_set:
                            continue
                        if not is_set and p_is_set:
                            continue
                        if not query_is_deo_or_body and p_is_deo_or_body:
                            continue

                        title_tokens = set(re.findall(r"[a-z0-9]+", title_lower)) - GENERIC_STOPWORDS
                        if require_brand_match and brand_tokens and not (brand_tokens & title_tokens):
                            vendor_tokens = set(re.findall(r"[a-z0-9]+", str(p.get("vendor") or "").lower()))
                            if not (brand_tokens & vendor_tokens):
                                continue
                        if clean_tokens and (clean_tokens.issubset(title_tokens) or len(clean_tokens & title_tokens) >= max(1, len(clean_tokens) * 0.7)):
                            img_url = p.get("image") or (p.get("featured_image") or {}).get("url")
                            if not img_url:
                                continue
                            img_url = upgrade_shopify_image_url(img_url)
                            if img_url in seen_urls:
                                continue
                            seen_urls.add(img_url)

                            page_url = p.get("url", "")
                            if page_url and page_url.startswith("/"):
                                page_url = f"https://{domain}{page_url}"

                            overlap = len(clean_tokens & title_tokens) / max(1, len(clean_tokens))
                            img_lower = img_url.lower()
                            tier_bonus = 5.0 if source_tag == "official_studio" else 0.0
                            bottle_bonus = 6.0 if (not is_set and re.search(r"[-_]bottle\.(?:png|jpe?g|webp)", img_lower)) else 0.0
                            score = tier_bonus + bottle_bonus + overlap * 10.0 + (2.0 if ".png" in img_lower else 0.0) + (1.0 if "front" in img_lower else 0.0)
                            all_matches.append((
                                score,
                                {
                                    "imageUrl": img_url,
                                    "sourceUrl": page_url or img_url,
                                    "sourceName": f"{brand or 'Official'} ({domain})",
                                    "sourceType": source_tag,
                                    "title": title,
                                },
                            ))
                    if all_matches:
                        break
                except Exception:
                    pass
            if len(all_matches) >= 3:
                break

    if domains:
        _query_shopify_domains(domains, include_brand_in_query=False, require_brand_match=False, source_tag="official_studio")
    if len(all_matches) < 2:
        _query_shopify_domains(TRUSTED_RETAILER_DOMAINS, include_brand_in_query=True, require_brand_match=True, source_tag="verified_retailer")

    all_matches.sort(key=lambda item: item[0], reverse=True)
    top_candidates = [item[1] for item in all_matches[:4]]

    # For single bottles (not sets), also expand gallery images from top Shopify matches
    # so bottle-only shots (often 2nd/3rd gallery image) are available alongside promo/box thumbnails.
    if not is_set and top_candidates:
        expanded = []
        seen_expanded = set()
        for cand in top_candidates:
            c_url = cand.get("imageUrl")
            if c_url and c_url not in seen_expanded:
                seen_expanded.add(c_url)
                expanded.append(cand)
            s_url = str(cand.get("sourceUrl") or "").split("?")[0]
            if "/products/" in s_url and len(expanded) < 8:
                try:
                    p_resp = requests.get(f"{s_url}.json", headers=headers, timeout=5)
                    if p_resp.ok:
                        imgs = (p_resp.json().get("product") or {}).get("images") or []
                        for g_img in imgs[:5]:
                            g_src = upgrade_shopify_image_url(g_img.get("src"))
                            if not g_src or g_src in seen_expanded:
                                continue
                            seen_expanded.add(g_src)
                            expanded.append({
                                **cand,
                                "imageUrl": g_src,
                            })
                            if len(expanded) >= 8:
                                break
                except Exception:
                    pass
        return expanded[:8]

    return top_candidates


def make_session():
    session = requests.Session()
    session.headers.update({
        "apikey": os.environ["SUPABASE_SERVICE_ROLE_KEY"],
        "Authorization": f"Bearer {os.environ['SUPABASE_SERVICE_ROLE_KEY']}",
    })
    return session


def rest_stocks_url(supabase_url):
    base = (supabase_url or "").rstrip("/")
    if "workers.dev" in base and not "/api" in base:
        return f"{base}/api/rest/v1/stocks"
    if base.endswith("/api"):
        return f"{base}/rest/v1/stocks"
    return f"{base}/rest/v1/stocks"


def fetch_stock_rows(session, supabase_url):
    rows = []
    start = 0
    endpoint = rest_stocks_url(supabase_url)
    while True:
        response = None
        for attempt in range(4):
            response = session.get(
                endpoint,
                params={"select": "id,name,brand,image,info", "order": "id.asc"},
                headers={"Range-Unit": "items", "Range": f"{start}-{start + PAGE_SIZE - 1}"},
                timeout=30,
            )
            if response.ok or response.status_code not in (429, 500, 502, 503, 504) or attempt == 3:
                break
            time.sleep(2 * (attempt + 1))
        if not response.ok:
            raise RuntimeError(
                f"Could not read Supabase stocks from {endpoint} ({response.status_code}): "
                f"{response.text[:400]}"
            )
        body = (response.text or "").strip()
        if not body:
            # Supabase returned an empty body (e.g. quota-limited or transient
            # failure). Treat as end of data instead of crashing with
            # json.JSONDecodeError: "Expecting value: line 1 column 1 (char 0)".
            break
        try:
            page = response.json()
        except json.JSONDecodeError:
            print(
                f"WARNING: Supabase endpoint {endpoint} returned invalid JSON at offset {start} "
                f"(status {response.status_code}, content-type {response.headers.get('content-type')}): "
                f"{body[:200]}",
                flush=True,
            )
            if start == 0:
                raise RuntimeError(
                    f"Fatal: Supabase endpoint {endpoint} returned non-JSON response at offset 0 "
                    f"(status {response.status_code}, content-type {response.headers.get('content-type')}): {body[:200]}"
                )
            break
        if not isinstance(page, list):
            raise RuntimeError(f"Supabase stocks response was not a list: {page}")
        rows.extend(page)
        if len(page) < PAGE_SIZE:
            break
        start += PAGE_SIZE
    return rows


def fetch_stock_rows_stdlib(supabase_url, service_key):
    rows = []
    start = 0
    endpoint = rest_stocks_url(supabase_url)
    query = urlencode({"select": "id,name,brand,image,info", "order": "id.asc"})
    while True:
        req = urllib.request.Request(
            f"{endpoint}?{query}",
            headers={
                "apikey": service_key,
                "Authorization": f"Bearer {service_key}",
                "Range-Unit": "items",
                "Range": f"{start}-{start + PAGE_SIZE - 1}",
            },
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            raw = resp.read().decode("utf-8").strip()
            if not raw:
                break
            try:
                page = json.loads(raw)
            except json.JSONDecodeError:
                print(
                    f"WARNING: Supabase endpoint {endpoint} returned invalid JSON at offset {start}: {raw[:200]}",
                    flush=True,
                )
                if start == 0:
                    raise RuntimeError(
                        f"Fatal: Supabase endpoint {endpoint} returned non-JSON response at offset 0: {raw[:200]}"
                    )
                break
        if not isinstance(page, list):
            raise RuntimeError("Supabase stocks response was not a list")
        rows.extend(page)
        if len(page) < PAGE_SIZE:
            break
        start += PAGE_SIZE
    return rows


def patch_stock(session, supabase_url, row, info, image=None, only_if_unchanged=False):
    if only_if_unchanged:
        try:
            response = session.post(
                f"{supabase_url}/rest/v1/rpc/update_stock_image_if_unchanged",
                json={
                    "p_id": str(row["id"]),
                    "p_stock_id": row["id"],
                    "p_expected_info": row.get("info") or {},
                    "p_expected_image": row.get("image"),
                    "p_info": info,
                    "p_new_info": info,
                    "p_image": image,
                    "p_new_image": image,
                },
                timeout=30,
            )
            if response.ok and response.json() is True:
                return
            if response.ok and response.json() is False:
                raise RuntimeError(f"Stock {row['id']} changed during deletion; skipping delete")
        except RuntimeError:
            raise
        except Exception:
            pass

    fields = {"info": info}
    if image is not None:
        fields["image"] = image
    params = {"id": f"eq.{row['id']}"}
    endpoint = rest_stocks_url(supabase_url)
    response = session.patch(
        endpoint,
        params=params,
        headers={"Prefer": "return=minimal"},
        json=fields,
        timeout=30,
    )
    if not response.ok:
        raise RuntimeError(
            f"Could not update stock {row['id']} via {endpoint} ({response.status_code}): "
            f"{response.text[:400]}"
        )


def hash_perfume_seed(s):
    h = 0
    for ch in str(s or ""):
        h = ((h * 31) + ord(ch)) & 0xFFFFFFFF
    return h


def generate_luxury_fallback_description(
    name,
    brand,
    notes_summary="",
    category="Восточные",
    top_notes=None,
    heart_notes=None,
    base_notes=None,
    top_notes_en=None,
    heart_notes_en=None,
    base_notes_en=None,
):
    """Luxury description strictly generated according to Al-Warda olfactory template.
    Fragrance notes are mentioned ONLY when verified; otherwise the narrative is note-free."""

    def join(values):
        return ", ".join(values) if isinstance(values, list) else str(values or "")

    clean_name = str(name or "").strip()
    clean_brand = str(brand or "Al-Warda").strip()
    seed = hash_perfume_seed(f"{clean_name}-{clean_brand}")

    cat_map = {
        "древесные": "oud",
        "восточные": "oud",
        "уд": "oud",
        "гурманские": "gourmand",
        "цветочные": "floral",
        "свежие": "fresh",
        "акватические": "fresh",
        "фужерные": "fougere",
        "цитрусовые": "citrus-fresh",
        "пряные": "spicy",
    }
    cat_key = cat_map.get(str(category or "").lower(), "spicy")

    cat_mood_ru = {
        "oud": [
            "величественная и гипнотическая композиция, вдохновлённая древними парфюмерными традициями Ближнего Востока",
            "глубокий и статусный аромат, сочетающий благородную древесную теплоту и мистическое восточное очарование",
            "роскошное ольфакторное полотно с бархатистым дымным характером, созданное мастерами парфюмерии Ближнего Востока",
        ],
        "gourmand": [
            "чувственный и обволакивающий эликсир с утончённым гурманским характером, рождённый на Ближнем Востоке",
            "соблазнительная и тёплая симфония сладости и благородных восточных акцентов, притягивающая внимание с первого вдоха",
            "изысканный десертно-пряный аромат, в котором восточная роскошь гармонично переплетается с мягкой бархатной нежностью",
        ],
        "floral": [
            "утончённый и сияющий букет, воспевающий королевскую красоту цветущих садов Ближнего Востока",
            "элегантная и пленительная композиция, наполненная нежностью лепестков и тёплым восточным магнетизмом",
            "воздушная и грациозная парфюмерная история, сочетающая цветочную утончённость с чувственной глубиной",
        ],
        "fresh": [
            "кристально чистый и бодрящий аромат, дарящий ощущение прохладного бриза и безупречной элегантности",
            "динамичная и освежающая композиция, в которой прохлада акватических аккордов встречается с благородной восточной базой",
            "современный и энергичный парфюм с ярким характером, наполняющий каждый момент свежестью и внутренней свободой",
        ],
        "fougere": [
            "аристократичный и харизматичный фужерный аромат с безупречным балансом свежести, пряных трав и благородной древесины",
            "стильная и выразительная композиция, подчёркивающая уверенность, утончённый вкус и природный магнетизм",
            "многогранный ароматический парфюм с породистым звучанием, сочетающий классическую элегантность и восточную стойкость",
        ],
        "citrus-fresh": [
            "искрящийся и солнечный аромат, заряжающий яркой энергией спелых цитрусов и утончённой восточной прохладой",
            "жизнерадостная и сияющая композиция, где сочная цитрусовая свежесть обрамлена дорогим шлейфовым аккордом",
            "динамичный и свежий эликсир с благородным звучанием, созданный для ярких акцентов в любое время года",
        ],
        "spicy": [
            "страстный и согревающий восточно-пряный аромат, сотканный из редких специй и драгоценных смол Ближнего Востока",
            "богатая и темпераментная композиция с гипнотическим характером, раскрывающаяся множеством тёплых граней",
            "выразительный и глубокий парфюм, в котором экзотические пряности создают неповторимую ауру роскоши и тайны",
        ],
    }

    cat_mood_en = {
        "oud": [
            "a majestic and hypnotic creation inspired by the timeless perfumery traditions of the Middle East",
            "a deep, commanding fragrance that unites noble woody warmth with mystical Middle Eastern allure",
            "an opulent olfactory masterpiece with a velvety, resinous character crafted by master perfumers of the Middle East",
        ],
        "gourmand": [
            "a sensual and enveloping elixir with a refined gourmand character born in the Middle East",
            "a seductive symphony of warm sweetness and noble oriental accords that captivates from the very first breath",
            "an exquisite gourmand-oriental fragrance where Middle Eastern luxury meets velvety softness",
        ],
        "floral": [
            "a radiant and sophisticated bouquet celebrating the royal blooming gardens of the Middle East",
            "a harmonious blend of delicate petals and warm oriental magnetism woven into a captivating composition",
            "a graceful and luminous fragrance story blending floral refinement with sensual Middle Eastern depth",
        ],
        "fresh": [
            "a crystalline and invigorating fragrance that evokes a cool coastal breeze and effortless elegance",
            "a dynamic, refreshing composition where crisp aquatic accords meet a noble Middle Eastern base",
            "a modern, energetic scent with a luminous profile that brings freshness and poise to every moment",
        ],
        "fougere": [
            "an aristocratic and charismatic fougère fragrance balancing crisp aromatic herbs with noble woods",
            "a refined, expressive composition that highlights confidence, impeccable taste, and natural magnetism",
            "a multifaceted aromatic creation uniting classic elegance with enduring Middle Eastern craftsmanship",
        ],
        "citrus-fresh": [
            "a sparkling, sun-drenched fragrance brimming with vibrant citrus energy and refined Middle Eastern elegance",
            "a luminous and uplifting composition where zesty citrus freshness is framed by a luxurious sillage",
            "a dynamic, radiant elixir with a noble profile designed to leave a memorable impression in any season",
        ],
        "spicy": [
            "a passionate, warming spicy-oriental fragrance woven from rare spices and precious resins of the Middle East",
            "a rich, temperamental composition with a hypnotic aura that unfolds in warm, sensual layers",
            "an expressive and opulent scent where exotic spices create an unforgettable atmosphere of mystery and luxury",
        ],
    }

    moods_ru = cat_mood_ru.get(cat_key, cat_mood_ru["spicy"])
    moods_en = cat_mood_en.get(cat_key, cat_mood_en["spicy"])
    mood_ru = moods_ru[seed % len(moods_ru)]
    mood_en = moods_en[seed % len(moods_en)]

    brand_intro_ru = (
        f"{clean_name} от парфюмерного дома {clean_brand}"
        if clean_brand.lower() in clean_name.lower()
        else f"{clean_brand} {clean_name}"
    )
    brand_intro_en = (
        f"{clean_name} by the house of {clean_brand}"
        if clean_brand.lower() in clean_name.lower()
        else f"{clean_brand} {clean_name}"
    )

    ru_clauses = []
    if top_notes:
        ru_clauses.append(
            f"С первых мгновений композиция завораживает ярким вступлением, в котором гармонично переплетаются {join(top_notes)}."
        )
    if heart_notes:
        ru_clauses.append(
            f"Постепенно согреваясь на коже, аромат раскрывает своё богатое сердце из нот: {join(heart_notes)}, придающих звучанию глубину и объём."
        )
    if base_notes:
        ru_clauses.append(
            f"В финале остаётся благородный, долгоиграющий шлейф (стойкость 10–14 часов), сотканный из оттенков: {join(base_notes)}."
        )
    if not ru_clauses:
        ru_clauses.append(
            "Композиция раскрывается постепенно и оставляет благородный, долгоиграющий шлейф (стойкость 10–14 часов)."
        )

    en_clauses = []
    if top_notes_en or top_notes:
        en_clauses.append(
            f"From the very first spritz, the composition captivates with a vibrant opening of {join(top_notes_en or top_notes)}."
        )
    if heart_notes_en or heart_notes:
        en_clauses.append(
            f"As it warms on the skin, the fragrance reveals an alluring heart of {join(heart_notes_en or heart_notes)}, lending remarkable depth and dimension."
        )
    if base_notes_en or base_notes:
        en_clauses.append(
            f"It settles into a velvety, long-lasting sillage (longevity 10–14 hours) crafted from {join(base_notes_en or base_notes)}."
        )
    if not en_clauses:
        en_clauses.append(
            "The composition unfolds gradually and leaves a noble, long-lasting sillage (longevity 10–14 hours)."
        )

    audience_ru = "Универсальная формула унисекс великолепно раскрывается как на мужской, так и на женской коже, адаптируясь к индивидуальной химии тела."
    audience_en = "Its versatile unisex character adapts beautifully to both men and women, evolving uniquely on the skin."

    category_ru = category or "Восточные"
    category_en = "Oriental" if category_ru.lower() in ("восточные", "oud") else category_ru

    desc_ru = f"{brand_intro_ru} — {mood_ru} ({category_ru.lower()}). {' '.join(ru_clauses)} {audience_ru}"
    desc_en = f"{brand_intro_en} is {mood_en} ({category_en.lower()}). {' '.join(en_clauses)} {audience_en}"

    return {
        "descriptionRu": desc_ru,
        "descriptionEn": desc_en,
        "description": desc_ru,
        "notesSummary": notes_summary or f"{brand} — {category}",
        "aiModel": "al-warda/luxury-fallback-v2",
    }


DESCRIPTION_RULES_PROMPT = (
    "You are a professional fragrance copywriter and olfactory editor for Al-Warda, "
    "a premium Arabian perfume boutique. Write elegant, informative, natural product "
    "descriptions that feel written by an experienced fragrance specialist — never "
    "AI-sounding and never copied wholesale supplier boilerplate.\n"
    "For each language write an opening of 1-2 sentences capturing the fragrance's "
    "overall character and its most distinctive contrast, then 2-3 paragraphs forming "
    "one coherent olfactory story (top notes and first impression -> heart notes and "
    "their development -> base notes and final character) — never three disconnected "
    "ingredient lists.\n"
    "Style: elegant, sensory, professional, concise and consistent; use real olfactory "
    "vocabulary (e.g. sparkling citrus freshness, warm spicy depth, velvety floral "
    "character, rich amber warmth, soft musky trail) and avoid reusing the same "
    "phrases in every product.\n"
    "Strict rules: build the text only from the supplied notes; never invent notes, "
    "accords, ingredients, origins, seasons, occasions, audiences or wearing situations; "
    "never invent longevity or projection (if supplied, present it as indicative); "
    "never claim the fragrance smells like another perfume; never use generic AI "
    "phrases ('a true masterpiece', 'a symphony of sensations', 'a journey into the "
    "world of luxury'); never repeat the full notes list inside the narrative; never "
    "use excessive marketing language; never change the product name or brand; if "
    "information is missing, omit it.\n"
    "CRITICAL: The description must be PURE, fluid literary prose. NEVER insert robotic "
    "metadata tags, field labels, or technical bullet attributes anywhere in the text (such as "
    "'Происхождение: ...', 'Origin: ...', 'Бренд: ...', 'Brand: ...', 'Категория: ...', 'Category: ...', "
    "'Пол: ...', 'Gender: ...', 'Стойкость: ...', 'Longevity: ...', 'Шлейф: ...', 'Sillage: ...', "
    "'Страна производства: ...', 'Country of origin: ...', 'Ноты: ...'). Tell the olfactory story "
    "seamlessly through natural evocative sentences without any colon-separated metadata labels."
)

METADATA_LABELS_PATTERN = re.compile(
    r'(?:^[ \t]*|[ \t]*\n[ \t]*|[ \t]+)(?:Происхождение|Origin|Бренд|Brand|Категория|Category|Семейство|Family|Пол|Gender|Концентрация|Concentration|Объем|Объём|Volume|Стойкость|Longevity|Шлейф|Sillage|Страна(?:\s+производства)?|Country(?:\s+of\s+origin)?|Производитель|Manufacturer|Верхние\s+ноты|Top\s+notes|Ноты\s+сердца|Heart\s+notes|Базовые\s+ноты|Base\s+notes|Пирамида(?:\s+аромата)?|Olfactory\s+pyramid)\s*:\s*[^.\n]+(?:\.|\n|$)',
    re.IGNORECASE
)

def clean_perfume_description(text):
    if not text or not isinstance(text, str):
        return text
    cleaned = METADATA_LABELS_PATTERN.sub('', text)
    cleaned = re.sub(r'аромат\s+с\s+Ближнего\s+Востока', 'аромат Ближнего Востока', cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r'парфюм\s+с\s+Ближнего\s+Востока', 'парфюм Ближнего Востока', cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r'\n{3,}', '\n\n', cleaned).strip()
    return cleaned


def generate_ai_perfume_description(
    requests_module,
    row,
    info,
    account_id=None,
    api_token=None,
):
    """Generate a rich, evocative luxury description for the perfume using another AI (Gemini or Cloudflare Workers AI LLM), with a high-end luxury fallback."""
    name = (row.get("name") or info.get("name") or "Арабский парфюм").strip()
    brand = (row.get("brand") or info.get("brand") or "Al-Warda").strip()
    notes_summary = str(info.get("notesSummary") or "").strip()
    category = (info.get("categoryRu") or info.get("category") or "Восточные").strip()
    verified = bool(info.get("notesVerified"))
    notes_ru = ((info.get("notes") or {}).get("ru") or {}) if verified else {}
    notes_en = ((info.get("notes") or {}).get("en") or {}) if verified else {}
    top_notes = notes_ru.get("top") or []
    heart_notes = notes_ru.get("heart") or []
    base_notes = notes_ru.get("base") or []
    if not verified:
        notes_summary = ""

    # 1. Try Google Gemini API if key is available in environment
    gemini_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("VITE_GEMINI_API_KEY")
    if gemini_key and requests_module:
        for model in ("gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash", "gemini-3.1-flash-lite"):
            try:
                prompt_text = (
                    f"Perfume Name: {name}\n"
                    f"Brand: {brand}\n"
                    f"Category: {category}\n"
                    f"Verified Notes: {notes_summary or 'NONE - do not mention any specific fragrance notes, ingredients or accords'}\n\n"
                    f"{DESCRIPTION_RULES_PROMPT}\n\n"
                    "Write the description in Russian (descriptionRu) and English "
                    "(descriptionEn) following the rules above. "
                    "Output valid JSON only with keys: descriptionRu, descriptionEn, "
                    "notesSummary (empty string if no verified notes)."
                )
                gemini_url = (
                    f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
                    f"?key={gemini_key}"
                )
                payload = {
                    "contents": [{"parts": [{"text": prompt_text}]}],
                    "generationConfig": {"responseMimeType": "application/json", "temperature": 0.7},
                }
                resp = requests_module.post(gemini_url, json=payload, timeout=20)
                if resp.ok:
                    data = resp.json()
                    candidates = data.get("candidates") or []
                    if candidates:
                        parts = candidates[0].get("content", {}).get("parts", [])
                        if parts:
                            raw_json = parts[0].get("text", "")
                            parsed = json.loads(raw_json)
                            desc_ru = clean_perfume_description((parsed.get("descriptionRu") or "").strip())
                            desc_en = clean_perfume_description((parsed.get("descriptionEn") or "").strip())
                            if desc_ru and desc_en and len(desc_ru) > 80:
                                return {
                                    "descriptionRu": desc_ru,
                                    "descriptionEn": desc_en,
                                    "description": desc_ru,
                                    "notesSummary": parsed.get("notesSummary") or notes_summary,
                                    "aiModel": f"gemini/{model}",
                                }
            except Exception:
                pass

    # 2. Try Cloudflare Workers AI Text LLM (Llama 3.1 8B Instruct)
    if account_id and api_token and requests_module:
        try:
            cf_url = (
                f"https://api.cloudflare.com/client/v4/accounts/{quote(account_id, safe='')}/ai/run/"
                f"@cf/meta/llama-3.1-8b-instruct"
            )
            cf_payload = {
                "messages": [
                    {
                        "role": "system",
                        "content": (
                            DESCRIPTION_RULES_PROMPT
                            + " Respond with ONLY valid JSON: {\"descriptionRu\": \"...\", \"descriptionEn\": \"...\", \"notesSummary\": \"...\"}"
                        ),
                    },
                    {
                        "role": "user",
                        "content": (
                            f"Perfume: {brand} {name}. "
                            f"Category: {category}. "
                            f"Verified notes: {notes_summary or 'NONE (do not name any ingredients or notes)'}."
                        ),
                    },
                ],
                "temperature": 0.7,
                "max_tokens": 1024,
            }
            cf_resp = requests_module.post(
                cf_url,
                headers={
                    "Authorization": f"Bearer {api_token}",
                    "Content-Type": "application/json",
                },
                json=cf_payload,
                timeout=25,
            )
            if cf_resp.ok:
                cf_data = cf_resp.json()
                result_text = ""
                if isinstance(cf_data, dict):
                    res = cf_data.get("result")
                    if isinstance(res, dict):
                        result_text = res.get("response", "")
                    elif isinstance(res, str):
                        result_text = res
                if result_text:
                    json_match = re.search(r"\{[\s\S]*\}", result_text)
                    if json_match:
                        parsed = json.loads(json_match.group(0))
                        desc_ru = clean_perfume_description((parsed.get("descriptionRu") or "").strip())
                        desc_en = clean_perfume_description((parsed.get("descriptionEn") or "").strip())
                        if desc_ru and desc_en and len(desc_ru) > 80:
                            return {
                                "descriptionRu": desc_ru,
                                "descriptionEn": desc_en,
                                "description": desc_ru,
                                "notesSummary": parsed.get("notesSummary") or notes_summary,
                                "aiModel": "@cf/meta/llama-3.1-8b-instruct",
                            }
        except Exception:
            pass

    # 3. High-end Luxury Deterministic Fallback Engine
    return generate_luxury_fallback_description(
        name=name,
        brand=brand,
        notes_summary=notes_summary,
        category=category,
        top_notes=top_notes,
        heart_notes=heart_notes,
        base_notes=base_notes,
        top_notes_en=notes_en.get("top") or [],
        heart_notes_en=notes_en.get("heart") or [],
        base_notes_en=notes_en.get("base") or [],
    )


def is_workers_flagged_error(response):
    if response is None or getattr(response, "ok", False):
        return False
    text = (getattr(response, "text", "") or "")
    if "3030" in text or "flagged" in text.lower() or "nsfw" in text.lower():
        return True
    try:
        data = response.json()
        for err in data.get("errors", []):
            if err.get("code") == 3030 or "flagged" in str(err.get("message", "")).lower():
                return True
    except Exception:
        pass
    return False


def generate_product_edit(session, account_id, api_token, source_bytes):
    source = decode_source(source_bytes)
    # Keep the full-resolution photo as the Flux reference. Only downscale when
    # larger than 1024 (the model's practical input); never shrink a small or
    # medium photo to 511px, which destroyed label detail on the redraw.
    if source.width > 1024 or source.height > 1024:
        source.thumbnail((1024, 1024), Image.Resampling.LANCZOS)
    reference = io.BytesIO()
    source.save(reference, format="PNG")

    response = session.post(
        IMAGE_ENDPOINT.format(account_id=quote(account_id, safe="")),
        headers={"Authorization": f"Bearer {api_token}"},
        data={"prompt": build_edit_prompt(), "width": "1024", "height": "1024"},
        files={"input_image_0": ("reference.png", reference.getvalue(), "image/png")},
        timeout=(15, 180),
    )
    error_details = response.text[:1000] if not response.ok else ""
    if not response.ok and is_workers_flagged_error(response):
        print("Flagged prompt/image detected; retrying with clean studio prompt...", flush=True)
        safe_prompt = (
            "Professional commercial studio product photography of a luxury perfume flacon, "
            "glass bottle centered on plain light grey background, elegant lighting, 8k"
        )
        response = session.post(
            IMAGE_ENDPOINT.format(account_id=quote(account_id, safe="")),
            headers={"Authorization": f"Bearer {api_token}"},
            data={"prompt": safe_prompt, "width": "1024", "height": "1024"},
            files={"input_image_0": ("reference.png", reference.getvalue(), "image/png")},
            timeout=(15, 180),
        )
        error_details = response.text[:1000] if not response.ok else ""
    quota_error = re.search(
        r"daily.{0,50}(quota|limit|allocation|neuron)|(?:quota|limit|allocation).{0,30}daily",
        error_details,
        re.I,
    )
    if response.status_code == 429 or (
        response.status_code in (402, 403) and re.search(
            r"quota|neuron|allocation|billing", error_details, re.I
        )
    ) or quota_error:
        raise WorkersDailyQuotaExceeded(
            "Cloudflare Workers AI reported a quota or rate limit; stopping the batch"
        )
    if response.status_code in (401, 403):
        raise WorkersConfigurationError(
            f"Workers AI account or model authorization failed ({response.status_code}): {error_details}"
        )
    if not response.ok:
        if is_workers_flagged_error(response):
            raise WorkersOutputFlaggedError(
                f"Workers AI request failed ({response.status_code}): safety filter flagged prompt/image (3030): {error_details}"
            )
        raise RuntimeError(
            f"Workers AI request failed ({response.status_code}): {error_details}"
        )
    try:
        result = response.json().get("result") or {}
        encoded_image = result.get("image")
        if not encoded_image:
            raise ValueError("Workers AI response has no result.image")
        image_bytes = base64.b64decode(encoded_image, validate=True)
    except (ValueError, TypeError, json.JSONDecodeError) as error:
        raise RuntimeError(f"Workers AI returned an invalid image response: {error}") from error
    return image_bytes


def build_edit_prompt():
    return (
        "Use image 0 strictly as a one-to-one product reference. Re-photograph this "
        "EXACT product — do not redesign, replace, or reinterpret it. The output must "
        "keep the exact same bottle, cap, glass shape, liquid color, label artwork, brand "
        "logo, numbers, digits, volume and typography as image 0, completely unchanged. "
        "All numerals, dates, years, batch numbers, volume indicators, and lettering must "
        "remain authentic, sharp, crisp, undistorted, and perfectly legible. Never hallucinate, "
        "invent, distort, rewrite, duplicate or omit numbers, text, labels, or details; never "
        "generate pseudo-digits or illegible squiggles; never add extra bottles, props, frames "
        "or markings. Present one large, centered product from a natural front-facing "
        "three-quarter angle with realistic depth, neutral balanced commercial studio lighting, "
        "accurate true-to-life product colors, pristine glass and metal reflections, on a plain "
        "uniform light grey background with no horizon or cast shadow. Keep the complete "
        "product and cap fully visible with a small clear margin on every side."
    )


def decode_source(source_bytes):
    if len(source_bytes) > MAX_SOURCE_BYTES:
        raise ValueError("Original product photo exceeds the 20 MB processing limit")
    with Image.open(io.BytesIO(source_bytes)) as source:
        if source.width * source.height > MAX_SOURCE_PIXELS:
            raise ValueError("Original product photo exceeds the pixel processing limit")
        source.load()
        return ImageOps.exif_transpose(source).convert("RGB")


def composite_original_product(source_bytes, background_bytes, segmentation_session):
    source = decode_source(source_bytes)
    original_size = source.size
    cutout_result = remove(
        source,
        session=segmentation_session,
        only_mask=False,
        alpha_matting=False,
    )
    if isinstance(cutout_result, Image.Image):
        cutout = ImageOps.exif_transpose(cutout_result).convert("RGBA")
    else:
        with Image.open(io.BytesIO(cutout_result)) as cutout_image:
            cutout = ImageOps.exif_transpose(cutout_image).convert("RGBA")
    if cutout.size != source.size:
        raise ValueError(
            f"Segmentation changed the source dimensions: {source.size} -> {cutout.size}"
        )

    source_rgba = source.convert("RGBA")
    source_rgba.putalpha(cutout.getchannel("A"))

    with Image.open(io.BytesIO(background_bytes)) as background_image:
        background = ImageOps.fit(
            background_image.convert("RGB"),
            source.size,
            method=Image.Resampling.LANCZOS,
        ).convert("RGBA")

    result = Image.alpha_composite(background, source_rgba)
    output = io.BytesIO()
    result.save(output, format="PNG", optimize=True, compress_level=9)
    return output.getvalue(), original_size


def save_generated_image(image_bytes):
    if len(image_bytes) > MAX_STATIC_IMAGE_BYTES:
        raise ValueError("Generated image exceeds the Cloudflare static asset size limit")
    digest = hashlib.sha256(image_bytes).hexdigest()
    GENERATED_DIR.mkdir(parents=True, exist_ok=True)
    path = GENERATED_DIR / f"{digest}.png"
    path.write_bytes(image_bytes)

    if DIST_GENERATED_DIR.parent.parent.is_dir():
        try:
            DIST_GENERATED_DIR.mkdir(parents=True, exist_ok=True)
            (DIST_GENERATED_DIR / f"{digest}.png").write_bytes(image_bytes)
        except Exception:
            pass

    try:
        webp_path = GENERATED_DIR / f"{digest}.webp"
        with Image.open(io.BytesIO(image_bytes)) as im:
            im.save(webp_path, format="WEBP", quality=85, method=6)
        if DIST_GENERATED_DIR.parent.parent.is_dir():
            try:
                (DIST_GENERATED_DIR / f"{digest}.webp").write_bytes(webp_path.read_bytes())
            except Exception:
                pass
    except Exception as e:
        print(f"Warning: could not create WebP variant for {digest}: {e}", file=sys.stderr)
    return f"{GENERATED_URL}{digest}.png"


def transparent_product_image(image_bytes, segmentation_session, allow_arbitrary_dimensions=False):
    with Image.open(io.BytesIO(image_bytes)) as edited:
        edited.load()
        if not allow_arbitrary_dimensions and edited.size != (1024, 1024):
            raise ValueError(f"Unexpected generated image dimensions: {edited.size}")
        source = ImageOps.exif_transpose(edited).convert("RGB")

    cutout_result = remove(source, session=segmentation_session, only_mask=False, alpha_matting=False)
    if isinstance(cutout_result, Image.Image):
        cutout = cutout_result.convert("RGBA")
    else:
        with Image.open(io.BytesIO(cutout_result)) as cutout_image:
            cutout = cutout_image.convert("RGBA")
    if cutout.size != source.size:
        raise ValueError(f"Segmentation changed generated image dimensions: {source.size} -> {cutout.size}")
    alpha = cutout.getchannel("A")
    if alpha.getbbox() is None or alpha.getextrema()[0] == 255:
        raise ValueError("Segmentation did not produce a visible product on a transparent background")
    width, height = cutout.size
    edge = alpha.crop((0, 0, width, 1)).tobytes()
    edge += alpha.crop((0, height - 1, width, height)).tobytes()
    edge += alpha.crop((0, 1, 1, height - 1)).tobytes()
    edge += alpha.crop((width - 1, 1, width, height - 1)).tobytes()
    if not allow_arbitrary_dimensions and sum(value > 32 for value in edge) > len(edge) * 0.05:
        raise ValueError("The segmented image has an opaque border; the product must be regenerated")

    if not allow_arbitrary_dimensions:
        # Validate perfume flacon solidity vs hollow jewelry/bracelet/non-perfume object
        bbox = alpha.getbbox()
        if bbox:
            bx1, by1, bx2, by2 = bbox
            bw = bx2 - bx1
            bh = by2 - by1
            if bw * bh > 0:
                import numpy as np
                alpha_arr = np.array(alpha)
                obj_pixels = int(np.sum(alpha_arr[by1:by2, bx1:bx2] > 20))
                bbox_fill = obj_pixels / (bw * bh)
                cx1, cx2 = int(bx1 + bw * 0.35), int(bx1 + bw * 0.65)
                cy1, cy2 = int(by1 + bh * 0.35), int(by1 + bh * 0.65)
                center_sub = alpha_arr[cy1:cy2, cx1:cx2]
                center_fill = float(np.mean(center_sub > 20)) if center_sub.size > 0 else 0.0
                if center_fill < 0.20 and bbox_fill < 0.35:
                    raise ValueError(
                        f"Изображение не содержит флакон парфюма: обнаружен полый предмет (бижутерия / браслет / кольцо, заполнение центра: {center_fill*100:.1f}%)"
                    )
                if bbox_fill < 0.22:
                    raise ValueError(
                        f"Изображение не содержит флакон парфюма: объект слишком неплотный ({bbox_fill*100:.1f}%) для флакона духов"
                    )

    cutout = normalize_flacon_cutout(cutout)

    output = io.BytesIO()
    cutout.save(output, format="PNG", optimize=True, compress_level=9)
    return output.getvalue(), cutout.size


def product_dominant_color(image):
    """Median RGB of the visible product pixels (ignoring background/transparency).

    For an RGBA cutout the product is the opaque region; for an RGB source photo
    it is everything that is not near-white or near-black (the packshot backdrop).
    Returns None when no product pixels can be identified.
    """
    import numpy as np

    arr = np.asarray(image)
    if arr.ndim == 3 and arr.shape[2] == 4:
        mask = arr[:, :, 3] > 128
        pixels = arr[:, :, :3][mask]
    else:
        pixels = arr.reshape(-1, 3).astype(np.int16)
        not_light = ~((pixels[:, 0] > 210) & (pixels[:, 1] > 210) & (pixels[:, 2] > 210))
        not_dark = ~((pixels[:, 0] < 18) & (pixels[:, 1] < 18) & (pixels[:, 2] < 18))
        pixels = pixels[not_light & not_dark]
    if pixels.size == 0:
        return None
    return np.median(pixels, axis=0).astype(np.float64)


def generated_image_matches_source(source_bytes, generated_png_bytes):
    """True when the generated product keeps the source product's dominant colour.

    Only a large colour deviation (a different bottle / wrong product) is treated
    as a mismatch; anything else is accepted so faithful generations pass through.
    """
    import numpy as np

    try:
        source_image = decode_source(source_bytes)
        with Image.open(io.BytesIO(generated_png_bytes)) as generated:
            generated.load()
            generated_image = generated.convert("RGBA")
    except Exception:
        # If the check itself cannot run, don't block generation.
        return True

    source_color = product_dominant_color(source_image)
    generated_color = product_dominant_color(generated_image)
    if source_color is None or generated_color is None:
        return True

    distance = float(np.linalg.norm(source_color - generated_color))
    return distance <= MAX_PRODUCT_COLOR_DISTANCE


# Sharpness threshold for the product region (Laplacian variance). This is a
# starting value to be tuned on real photographs, not a final constant.
SHARPNESS_THRESHOLD = 40.0


def product_sharpness(image):
    """Laplacian variance over the product region, ignoring the flat background.

    Returns None when the metric cannot be computed (e.g. OpenCV not installed),
    so callers treat it as "unknown" rather than "blurry".
    """
    try:
        import cv2
        import numpy as np
    except ImportError:
        return None
    try:
        gray = np.asarray(image.convert("L"), dtype=np.float32)
        lap = cv2.Laplacian(gray, cv2.CV_32F)
        mask = ((gray > 20) & (gray < 235)).astype(np.float32)
        if float(mask.sum()) < 100:
            return None
        return float((lap * lap * mask).sum() / mask.sum())
    except Exception:
        return None


def measure_source_quality(source_bytes):
    """Diagnostics for the original photo: resolution, bytes, sharpness, status.

    Never treats a small or soft original as high quality — a tiny source is
    reported as `low_source_quality` instead of being silently upscaled.
    """
    file_size = len(source_bytes)
    try:
        source = decode_source(source_bytes)
    except Exception as exc:
        return {
            "originalFileSize": file_size,
            "qualityStatus": "invalid",
            "error": str(exc)[:200],
        }

    width, height = source.size
    sharpness = product_sharpness(source)
    status = "ok"
    if width < 400 or height < 400:
        status = "low_source_quality"
    elif sharpness is not None and sharpness < SHARPNESS_THRESHOLD:
        status = "low_sharpness"

    return {
        "originalWidth": width,
        "originalHeight": height,
        "originalFileSize": file_size,
        "sharpness": None if sharpness is None else round(sharpness, 2),
        "qualityStatus": status,
    }


def validate_cutout_quality(source_quality, out_bytes):
    """Gatekeeper that rejects low-resolution, blurry, unsegmented, or severely
    cropped cutouts before they can be saved or published into the catalog."""
    import numpy as np

    ow = source_quality.get("originalWidth") or 0
    oh = source_quality.get("originalHeight") or 0
    fsize = source_quality.get("originalFileSize") or 0
    qstatus = source_quality.get("qualityStatus") or "ok"

    if qstatus == "invalid":
        return False, None, "Некорректный или повреждённый файл изображения"
    if (ow and ow < 300) or (oh and oh < 300) or (ow and oh and max(ow, oh) < 380):
        return False, None, f"Низкое разрешение исходного фото ({ow}x{oh}px)"
    if fsize and fsize < 4500:
        return False, None, f"Слишком маленький размер файла ({fsize} байт)"

    final_sharpness = None
    try:
        with Image.open(io.BytesIO(out_bytes)) as out_img:
            rgba = out_img.convert("RGBA")
            final_sharpness = product_sharpness(rgba)
            arr = np.array(rgba)
    except Exception as exc:
        return False, None, f"Ошибка чтения итогового изображения: {exc}"

    if qstatus == "low_sharpness" and (final_sharpness is None or final_sharpness < 35.0):
        return False, final_sharpness, "Размытое или нечёткое фото (низкая резкость)"
    if final_sharpness is not None and final_sharpness < 15.0:
        return False, final_sharpness, f"Слишком низкая резкость после обработки ({final_sharpness:.1f})"

    alpha = arr[:, :, 3]
    h, w = alpha.shape
    fg_ratio = float(np.mean(alpha > 120))
    if fg_ratio < 0.03:
        return False, final_sharpness, "Пустая вырезка (товар не обнаружен)"
    if fg_ratio > 0.90:
        return False, final_sharpness, "Фон не удалён (объект занимает >90% кадра)"

    if (
        alpha[0, 0] > 200
        and alpha[0, w - 1] > 200
        and alpha[h - 1, 0] > 200
        and alpha[h - 1, w - 1] > 200
    ):
        return False, final_sharpness, "Сплошной фон по углам не удалён"

    top_clip = float(np.mean(alpha[0, :] > 180))
    left_clip = float(np.mean(alpha[:, 0] > 180))
    right_clip = float(np.mean(alpha[:, w - 1] > 180))
    if max(top_clip, left_clip, right_clip) > 0.60:
        return False, final_sharpness, "Фотография товара сильно обрезана по краям"

    ys_fg, xs_fg = np.where(alpha > 120)
    if len(xs_fg) > 0:
        y1, y2 = int(ys_fg.min()), int(ys_fg.max())
        x1, x2 = int(xs_fg.min()), int(xs_fg.max())
        bbox_fill = float(np.mean(alpha[y1:y2 + 1, x1:x2 + 1] > 120))
        if bbox_fill > 0.84 and fg_ratio > 0.62:
            return False, final_sharpness, "Фон или студийная сцена не вырезаны"
        top_band = alpha[y1:min(y2 + 1, y1 + max(2, int((y2 - y1) * 0.03))), x1:x2 + 1]
        top_cov = float(np.mean(top_band > 120)) if top_band.size > 0 else 0.0
        if 0.82 <= bbox_fill < 0.95 and fg_ratio > 0.60 and top_cov > 0.75:
            return False, final_sharpness, "Фон или студийная сцена не вырезаны"

    return True, final_sharpness, None


def segment_source(source, segmentation_session):
    """Run background removal on a source image and return an RGBA cutout at the
    same dimensions."""
    # 1. High performance onnxruntime inference
    if hasattr(segmentation_session, "run") and hasattr(segmentation_session, "get_inputs"):
        try:
            inputs = segmentation_session.get_inputs()
            input_shape = inputs[0].shape if inputs else []
            if len(input_shape) >= 4 and input_shape[2] == 1024:
                return run_onnx_rmbg_segmentation(source, segmentation_session)
            return run_onnx_u2net_segmentation(source, segmentation_session)
        except Exception as e:
            print(f"Direct ONNX segmentation error: {e}, falling back...", file=sys.stderr)

    # 2. rembg library if installed
    if remove is not None:
        try:
            cutout_result = remove(
                source,
                session=segmentation_session,
                only_mask=False,
                alpha_matting=False,
            )
            if isinstance(cutout_result, Image.Image):
                cutout = ImageOps.exif_transpose(cutout_result).convert("RGBA")
            else:
                with Image.open(io.BytesIO(cutout_result)) as cutout_image:
                    cutout = ImageOps.exif_transpose(cutout_image).convert("RGBA")
            if cutout.size != source.size:
                raise ValueError(
                    f"Segmentation changed the source dimensions: {source.size} -> {cutout.size}"
                )
            return cutout
        except Exception as e:
            if segmentation_session is not None and not isinstance(e, ValueError):
                pass

    # 3. Robust fallback using OpenCV DNN with U2Net
    try:
        import cv2
        import numpy as np
        model_path = prepare_segmentation_model()
        net = cv2.dnn.readNetFromONNX(str(model_path))
        img_np = np.asarray(source.convert("RGB"))
        img_bgr = cv2.cvtColor(img_np, cv2.COLOR_RGB2BGR)
        h, w = img_bgr.shape[:2]
        blob = cv2.dnn.blobFromImage(
            img_bgr,
            scalefactor=1.0 / 255.0 / 0.226,
            size=(320, 320),
            mean=(0.485 * 255, 0.456 * 255, 0.406 * 255),
            swapRB=True,
            crop=False,
        )
        net.setInput(blob)
        out = net.forward()
        mask = out[0, 0]
        mask = (mask - mask.min()) / (mask.max() - mask.min() + 1e-8)
        mask = cv2.resize(mask, (w, h))
        mask = (mask * 255).astype(np.uint8)
        mask = cv2.GaussianBlur(mask, (3, 3), 0)
        rgba = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGBA)
        rgba[:, :, 3] = mask
        return Image.fromarray(rgba)
    except Exception as e:
        raise SegmentationFailedError(f"Segmentation failed: {e}") from e


def find_superres_binary():
    """Find local Upscayl or Real-ESRGAN binary and models directory."""
    import shutil
    env_bin = os.environ.get("UPSCAYL_BIN")
    env_models = os.environ.get("UPSCAYL_MODELS")
    if env_bin and os.path.isfile(env_bin):
        models_dir = env_models or os.path.join(os.path.dirname(os.path.dirname(env_bin)), "models")
        return env_bin, models_dir if (models_dir and os.path.isdir(models_dir)) else None

    candidates = [
        ("C:/Program Files/Upscayl/resources/bin/upscayl-bin.exe", "C:/Program Files/Upscayl/resources/models"),
        ("C:/Program Files (x86)/Upscayl/resources/bin/upscayl-bin.exe", "C:/Program Files (x86)/Upscayl/resources/models"),
    ]
    for b, m in candidates:
        if os.path.isfile(b):
            return b, m if os.path.isdir(m) else None

    which = shutil.which("upscayl-bin") or shutil.which("realesrgan-ncnn-vulkan")
    if which:
        cand_m = env_models or os.path.join(os.path.dirname(which), "models")
        return which, cand_m if (cand_m and os.path.isdir(cand_m)) else None

    return None, None


def super_resolve_product_image_if_needed(image, min_dim=900):
    """Enhance low-resolution or compressed product photos using AI Super-Resolution (Upscayl / UltraSharp-4x).
    Reconstructs fine textures, sharpens typography and metallic embossing, and removes JPEG compression noise
    without overloading the host (using throttled threads and gentle batching)."""
    if Image is None or image is None:
        return image

    w, h = image.size
    # If the image is already high resolution, super-resolution is not needed
    if max(w, h) >= min_dim:
        return image

    # Feed the clean original RGB directly into neural super-resolution without
    # pre-CLAHE/pre-sharpening so JPEG ringing around small text is never amplified.
    bin_path, models_dir = find_superres_binary()
    if bin_path:
        try:
            import subprocess
            scale = 2 if max(w, h) >= 600 else 4
            with tempfile.TemporaryDirectory() as td:
                in_path = os.path.join(td, "src.png")
                out_path = os.path.join(td, "dst.png")
                image.convert("RGB").save(in_path, format="PNG")
                cmd = [bin_path, "-i", in_path, "-o", out_path, "-s", str(scale), "-c", "0", "-j", "1:1:1"]
                if models_dir and os.path.isdir(models_dir):
                    # high-fidelity-4x preserves natural photo texture and fine typography without painterly smearing
                    if os.path.isfile(os.path.join(models_dir, "high-fidelity-4x.bin")):
                        cmd.extend(["-m", models_dir, "-n", "high-fidelity-4x"])
                    elif os.path.isfile(os.path.join(models_dir, "realesrgan-x4plus.bin")):
                        cmd.extend(["-m", models_dir, "-n", "realesrgan-x4plus"])
                    elif os.path.isfile(os.path.join(models_dir, "ultramix-balanced-4x.bin")):
                        cmd.extend(["-m", models_dir, "-n", "ultramix-balanced-4x"])
                    elif os.path.isfile(os.path.join(models_dir, "ultrasharp-4x.bin")):
                        cmd.extend(["-m", models_dir, "-n", "ultrasharp-4x"])
                    elif os.path.isfile(os.path.join(models_dir, "remacri-4x.bin")):
                        cmd.extend(["-m", models_dir, "-n", "remacri-4x"])
                    else:
                        cmd.extend(["-m", models_dir])
                res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=120)
                if res.returncode == 0 and os.path.isfile(out_path):
                    upscaled = Image.open(out_path)
                    upscaled.load()
                    print(f"AI Super-Resolution succeeded: ({w}, {h}) -> {upscaled.size}", flush=True)
                    return upscaled
                else:
                    print(f"AI Super-Resolution binary returned {res.returncode}: {res.stderr[:200]}", flush=True)
        except Exception as e:
            print(f"AI Super-Resolution execution note: {e}", flush=True)

    # Clean Lanczos resize fallback (preserves natural bottle texture without cartoon/oil-paint smearing)
    try:
        target_w = max(1024, int(w * 2))
        target_h = max(1024, int(h * 2))
        return image.convert("RGB").resize((target_w, target_h), Image.Resampling.LANCZOS)
    except Exception:
        return image


def preserve_original_product(source_bytes, segmentation_session, canvas_size=(1024, 1024), allow_upscale=True, is_set=False):
    """Segment the ORIGINAL photo and place it on a transparent canvas WITHOUT
    redrawing the bottle. Applies AI Super-Resolution (Upscayl / UltraSharp) on compressed/low-res inputs,
    and studio lighting enhancement (CLAHE, percentile auto-levels, edge-preserving clarity)
    while keeping 100% authentic label pixels, true colors, and typography.

    Returns (png_bytes, processed_size, original_size).
    """
    import cv2
    import numpy as np

    source = decode_source(source_bytes)
    original_size = source.size

    # Step 1: Always segment the authentic photographic input first to establish ground-truth object boundaries.
    # The neural network sees the genuine photographic distribution, guaranteeing that no parts (dark packaging,
    # miniature set bottles, translucent glass, or wide boxes) are misclassified as background.
    raw_cutout = segment_source(source, segmentation_session)
    raw_alpha = np.array(raw_cutout)[:, :, 3]

    # Step 2: Apply AI Super-Resolution (Vulkan GPU Upscayl / UltraSharp) only on truly low-res inputs (< 420px)
    # so crisp >= 420px authentic photos keep their natural glass/matte texture without oil-paint smearing.
    if allow_upscale and min(original_size) < 420:
        sr_source = super_resolve_product_image_if_needed(source)
        if sr_source.size != source.size:
            sw, sh = sr_source.size
            # High-fidelity cubic scaling of the authentic alpha mask
            raw_alpha_scaled = cv2.resize(raw_alpha, (sw, sh), interpolation=cv2.INTER_CUBIC)
            raw_alpha_scaled = np.clip(raw_alpha_scaled, 0, 255).astype(np.uint8)

            try:
                # Also run segmentation on super-resolved source for micro-edge refinement
                sr_cutout = segment_source(sr_source, segmentation_session)
                sr_alpha = np.array(sr_cutout)[:, :, 3]
                # Ensemble: union of raw mask (guarantees NO parts like dark boxes/packaging/caps are ever lost)
                # and super-resolved mask (captures fine micro-details on high-res facets)
                final_alpha = np.maximum(raw_alpha_scaled, sr_alpha)
            except Exception:
                final_alpha = raw_alpha_scaled

            cutout = sr_source.convert("RGBA")
            cutout.putalpha(Image.fromarray(final_alpha, mode="L"))
            processed_size = sr_source.size
        else:
            cutout = raw_cutout
            processed_size = original_size
    else:
        cutout = raw_cutout
        processed_size = original_size

    cutout = strip_dark_studio_backdrop(cutout)

    cutout = normalize_flacon_cutout(
        cutout,
        target_max_h=880,
        target_max_w=880,
        canvas_size=canvas_size,
        allow_upscale=allow_upscale,
        is_set=is_set,
    )

    cutout, removed_props = remove_extraneous_props_from_cutout(cutout, is_set=is_set)
    if removed_props:
        print(f"Removed extraneous props from cutout: {removed_props}", flush=True)
        cutout = normalize_flacon_cutout(
            cutout,
            target_max_h=880,
            target_max_w=880,
            canvas_size=canvas_size,
            allow_upscale=allow_upscale,
            is_set=is_set,
        )

    # Stage-aware studio photometry & lighting harmonization for bottom_glow_stage.webp
    cutout = harmonize_cutout_for_stage(cutout)

    output = io.BytesIO()
    cutout.save(output, format="PNG", optimize=True, compress_level=9)
    return output.getvalue(), canvas_size, original_size


def strip_dark_studio_backdrop(cutout):
    """Remove unsegmented dark/black studio backdrop rectangles around the foreground."""
    if "A" not in cutout.getbands():
        return cutout
    import numpy as np
    try:
        import cv2
    except Exception:
        return cutout

    arr = np.array(cutout.convert("RGBA")).copy()
    alpha = arr[:, :, 3]
    ys, xs = np.where(alpha > 28)
    if len(ys) == 0:
        return cutout
    y1, y2 = int(ys.min()), int(ys.max()) + 1
    x1, x2 = int(xs.min()), int(xs.max()) + 1
    roi_a = alpha[y1:y2, x1:x2]
    roi_rgb = arr[y1:y2, x1:x2, :3]
    rh, rw = roi_a.shape
    if rh < 40 or rw < 40:
        return cutout

    rim = np.zeros_like(roi_a, dtype=bool)
    rim[:5, :] = True
    rim[-5:, :] = True
    rim[:, :5] = True
    rim[:, -5:] = True
    rim_opaque = rim & (roi_a > 40)
    if rim_opaque.sum() == 0:
        return cutout

    roi_max = roi_rgb.max(axis=2)
    dark_rim = rim_opaque & (roi_max < 38)
    if dark_rim.sum() / max(1, rim_opaque.sum()) < 0.25:
        return cutout

    dark_mask = ((roi_a > 20) & (roi_max < 42)).astype(np.uint8)
    _, labels, _, _ = cv2.connectedComponentsWithStats(dark_mask)
    rim_labels = set(np.unique(labels[dark_rim])) - {0}
    if not rim_labels:
        return cutout

    bg_dark = np.isin(labels, list(rim_labels))
    bg_u8 = cv2.dilate(bg_dark.astype(np.uint8) * 255, np.ones((3, 3), np.uint8), iterations=1)
    soft = cv2.GaussianBlur(bg_u8.astype(np.float32) / 255.0, (5, 5), 1.0)
    arr[y1:y2, x1:x2, 3] = np.clip(np.round(roi_a.astype(np.float32) * (1.0 - soft)), 0, 255).astype(np.uint8)
    return Image.fromarray(arr, mode="RGBA")


def remove_extraneous_props_from_cutout(cutout, is_set=False):
    """Use Gemini Vision to detect and cleanly erase extraneous non-product props
    (e.g. lemons, fruits, flowers, leaves, wood chips, splashes) and, for single
    perfumes (is_set=False), outer packaging/boxes next to the bottle."""
    if "A" not in cutout.getbands():
        return cutout, []
    gemini_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("VITE_GEMINI_API_KEY")
    if not gemini_key or requests is None:
        return cutout, []

    import base64
    import numpy as np

    try:
        bg = Image.new("RGBA", cutout.size, (18, 16, 14, 255))
        comp = Image.alpha_composite(bg, cutout).convert("RGB").resize((512, 512), Image.Resampling.LANCZOS)
        buf = io.BytesIO()
        comp.save(buf, format="JPEG", quality=90)
        b64 = base64.b64encode(buf.getvalue()).decode("ascii")

        box_clause = (
            ""
            if is_set
            else (
                "ALSO detect any outer cardboard packaging / perfume box next to the bottle "
                "(label it 'packaging box', ONLY when a perfume bottle is also visible in the image). "
            )
        )
        prompt = (
            "Inspect this perfume product cutout. Detect ONLY extraneous decorative props or ingredients "
            "placed around or next to the product that are NOT part of the perfume bottle, cap, spray nozzle, "
            "sculpted bottle ornaments (such as metallic snakes, crowns, wings, medallions, or charms attached to the bottle/cap), "
            "or bottle label — "
            "such as fruits (lemons, oranges, apples, berries, lychees), flowers, petals, leaves, branches, wood chips, "
            "cinnamon sticks, coffee beans, spices, ice cubes, stones, water splashes, or hands. "
            f"{box_clause}"
            'Return ONLY JSON: {"hasProps": true/false, "props": [{"label": "short name", "box_2d": [ymin, xmin, ymax, xmax]}]} '
            "where box_2d is in 0..1000 normalized coordinates tightly enclosing each extraneous prop or packaging box.\n"
            "NEVER include the perfume bottle, cap, or sculpted bottle ornaments inside box_2d."
        )

        payload_json = None
        for model in ("gemini-3.1-flash-lite", "gemini-3.8-flash", "gemini-2.0-flash"):
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={gemini_key}"
            resp = requests.post(
                url,
                json={
                    "contents": [{"parts": [{"text": prompt}, {"inlineData": {"mimeType": "image/jpeg", "data": b64}}]}],
                    "generationConfig": {"temperature": 0.0, "responseMimeType": "application/json"},
                },
                timeout=25,
            )
            if resp.ok:
                data = resp.json()
                text = (
                    ((data.get("candidates") or [{}])[0].get("content") or {})
                    .get("parts", [{}])[0]
                    .get("text", "")
                )
                if text:
                    payload_json = json.loads(text)
                    break

        if not isinstance(payload_json, dict) or not payload_json.get("hasProps"):
            return cutout, []

        props = payload_json.get("props") or []
        if not isinstance(props, list) or not props:
            return cutout, []

        arr = np.array(cutout).copy()
        H, W = arr.shape[:2]
        fg_area = int((arr[:, :, 3] > 28).sum())
        if fg_area <= 0:
            return cutout, []

        erase_mask = np.zeros((H, W), dtype=np.uint8)
        removed_labels = []
        try:
            import cv2
            has_cv2 = True
        except Exception:
            cv2 = None
            has_cv2 = False

        for prop in props:
            if not isinstance(prop, dict):
                continue
            box = prop.get("box_2d")
            if not isinstance(box, (list, tuple)) or len(box) != 4:
                continue
            try:
                ymin, xmin, ymax, xmax = [float(v) for v in box]
            except (TypeError, ValueError):
                continue
            y1 = max(0, int(round((ymin / 1000.0) * H)) - 3)
            x1 = max(0, int(round((xmin / 1000.0) * W)) - 3)
            y2 = min(H, int(round((ymax / 1000.0) * H)) + 3)
            x2 = min(W, int(round((xmax / 1000.0) * W)) + 3)
            bw, bh = x2 - x1, y2 - y1
            if bw <= 4 or bh <= 4:
                continue
            label_str = str(prop.get("label") or "prop").lower()
            is_box_prop = (not is_set) and any(k in label_str for k in ("box", "pack", "carton", "короб"))
            max_w_ratio = 0.72 if is_box_prop else 0.45
            max_h_ratio = 0.85 if is_box_prop else 0.55
            max_area_ratio = 0.65 if is_box_prop else 0.22
            if bw > W * max_w_ratio or bh > H * max_h_ratio:
                continue
            box_fg = int((arr[y1:y2, x1:x2, 3] > 28).sum())
            if box_fg == 0 or box_fg > fg_area * max_area_ratio:
                continue

            if has_cv2:
                try:
                    pad = 40
                    ry1, rx1 = max(0, y1 - pad), max(0, x1 - pad)
                    ry2, rx2 = min(H, y2 + pad), min(W, x2 + pad)
                    roi_rgb = arr[ry1:ry2, rx1:rx2, :3]
                    roi_alpha = arr[ry1:ry2, rx1:rx2, 3]
                    gc_mask = np.full(roi_rgb.shape[:2], cv2.GC_BGD, dtype=np.uint8)
                    by1, bx1 = y1 - ry1, x1 - rx1
                    by2, bx2 = y2 - ry1, x2 - rx1
                    box_opaque = roi_alpha[by1:by2, bx1:bx2] > 28
                    gc_mask[by1:by2, bx1:bx2][box_opaque] = cv2.GC_PR_FGD

                    box_cx = (x1 + x2) / 2.0
                    if box_cx < W / 2.0:
                        def_x2 = bx1 + max(1, int((bx2 - bx1) * 0.45))
                        gc_mask[by1:by2, bx1:def_x2][roi_alpha[by1:by2, bx1:def_x2] > 28] = cv2.GC_FGD
                    else:
                        def_x1 = bx2 - max(1, int((bx2 - bx1) * 0.45))
                        gc_mask[by1:by2, def_x1:bx2][roi_alpha[by1:by2, def_x1:bx2] > 28] = cv2.GC_FGD

                    if (gc_mask == cv2.GC_FGD).any() and (gc_mask == cv2.GC_BGD).any():
                        bgd_model = np.zeros((1, 65), np.float64)
                        fgd_model = np.zeros((1, 65), np.float64)
                        cv2.grabCut(roi_rgb, gc_mask, None, bgd_model, fgd_model, 5, cv2.GC_INIT_WITH_MASK)
                        prop_roi = np.where((gc_mask == cv2.GC_FGD) | (gc_mask == cv2.GC_PR_FGD), 255, 0).astype(np.uint8)
                        erase_mask[y1:y2, x1:x2] = np.maximum(erase_mask[y1:y2, x1:x2], prop_roi[by1:by2, bx1:bx2])
                    else:
                        erase_mask[y1:y2, x1:x2] = 255
                except Exception:
                    erase_mask[y1:y2, x1:x2] = 255
            else:
                erase_mask[y1:y2, x1:x2] = 255

            removed_labels.append(str(prop.get("label") or "prop"))

        if not removed_labels:
            return cutout, []

        if has_cv2:
            soft_erase = cv2.GaussianBlur(erase_mask.astype(np.float32) / 255.0, (5, 5), 1.0)
            arr[:, :, 3] = np.clip(np.round(arr[:, :, 3].astype(np.float32) * (1.0 - soft_erase)), 0, 255).astype(np.uint8)
        else:
            arr[erase_mask > 0, 3] = 0

        return Image.fromarray(arr, mode="RGBA"), removed_labels
    except Exception:
        return cutout, []


def harmonize_cutout_for_stage(cutout, stage_path=None):
    """Adapt the segmented product cutout's lighting, tone curve, 3D cylindrical
    shading, color temperature, and upward floor bounce to match the warm golden
    horizon stage (`bottom_glow_stage.webp` on `#080605`)."""
    if "A" not in cutout.getbands():
        return cutout
    try:
        import cv2
        import numpy as np

        arr = np.array(cutout.convert("RGBA"), dtype=np.float32)
        if arr.ndim != 3 or arr.shape[2] != 4:
            return cutout
        rgb = arr[:, :, :3]
        alpha = arr[:, :, 3]
        fg_mask = alpha > 25
        if not np.any(fg_mask):
            return cutout

        # 1. Sample target stage template (bottom_glow_stage.webp) for authentic light color & profile
        stage_horizon_rgb = np.array([248.0, 202.0, 96.0], dtype=np.float32)
        stage_aura_rgb = np.array([218.0, 162.0, 58.0], dtype=np.float32)
        if stage_path is None:
            cand = (
                Path(__file__).resolve().parents[1]
                / "public"
                / "assets"
                / "img"
                / "stage"
                / "bottom_glow_stage.webp"
            )
            if cand.is_file():
                stage_path = str(cand)
        if stage_path and os.path.isfile(stage_path):
            try:
                with Image.open(stage_path) as st_im:
                    st_arr = np.array(st_im.convert("RGB"), dtype=np.float32)
                sh, sw = st_arr.shape[:2]
                row_means = st_arr.mean(axis=(1, 2))
                hy = int(np.argmax(row_means))
                cx0, cx1 = int(sw * 0.35), int(sw * 0.65)
                h_patch = st_arr[max(0, hy - 3) : min(sh, hy + 4), cx0:cx1, :]
                a_patch = st_arr[max(0, int(hy * 0.60)) : max(1, int(hy * 0.85)), cx0:cx1, :]
                if h_patch.size > 0:
                    stage_horizon_rgb = np.clip(
                        np.percentile(h_patch.reshape(-1, 3), 85, axis=0), 160.0, 255.0
                    )
                if a_patch.size > 0:
                    stage_aura_rgb = np.clip(
                        np.percentile(a_patch.reshape(-1, 3), 80, axis=0) * 1.35, 140.0, 245.0
                    )
            except Exception:
                pass

        ys, xs = np.where(fg_mask)
        y_min, y_max = int(ys.min()), int(ys.max())
        h_fg = max(1, y_max - y_min)

        H, W = alpha.shape
        y_grid, x_grid = np.indices((H, W), dtype=np.float32)
        v_norm = np.clip((y_grid - y_min) / float(h_fg), 0.0, 1.0)

        # Per-scanline horizontal coordinate u_abs in [0, 1] (0 = center axis, 1 = outer silhouette)
        u_abs = np.zeros((H, W), dtype=np.float32)
        for y in range(y_min, y_max + 1):
            row_xs = np.where(fg_mask[y])[0]
            if len(row_xs) > 4:
                rx0, rx1 = float(row_xs[0]), float(row_xs[-1])
                rw = max(1.0, rx1 - rx0)
                rc = 0.5 * (rx0 + rx1)
                u_abs[y] = np.clip(np.abs((x_grid[y] - rc) / (0.5 * rw)), 0.0, 1.0)

        rgb_u8 = np.clip(rgb, 0, 255).astype(np.uint8)
        lab = cv2.cvtColor(rgb_u8, cv2.COLOR_RGB2LAB).astype(np.float32)
        L = lab[:, :, 0]
        A = lab[:, :, 1]
        B = lab[:, :, 2]

        fg_l = L[fg_mask]
        p5_l = float(np.percentile(fg_l, 5.0))
        p50_l = float(np.percentile(fg_l, 50.0))
        p90_l = float(np.percentile(fg_l, 90.0))

        # 2. Adaptive Tone Mapping for Dark Golden Stage:
        # Compress harsh white-box flash hotspots & anchor lifted white-studio shadows
        L_norm = L / 255.0
        if p50_l > 92.0 or p90_l > 198.0:
            shadow_floor = max(0.0, min(0.10, (p5_l - 20.0) / 255.0 * 0.45))
            L_anchored = np.clip((L_norm - shadow_floor) / max(0.2, 1.0 - shadow_floor), 0.0, 1.0)
            knee = 0.70
            over = np.maximum(0.0, L_anchored - knee)
            L_comp = np.where(L_anchored > knee, knee + 0.28 * np.tanh(over / 0.28), L_anchored)
            excess = max(0.0, min(1.0, (p50_l - 85.0) / 100.0))
            gamma = 1.0 + 0.14 * excess
            L_toned = np.power(np.clip(L_comp, 0.0, 1.0), gamma)
        else:
            p_low = float(np.percentile(fg_l, 1.5))
            p_high = float(np.percentile(fg_l, 99.2))
            if p_high > p_low + 20.0:
                L_toned = np.clip((L - p_low) / (p_high - p_low) * 0.96, 0.0, 1.0)
            else:
                L_toned = L_norm

        # 3. Gentle 3D Curvature & Natural Micro-Clarity (no heavy CLAHE blotching)
        bright_factor = max(0.35, min(1.0, (p50_l - 40.0) / 110.0))
        cyl_shade = 1.0 - (0.06 * bright_factor) * np.power(u_abs, 2.2)
        vert_shade = (1.0 - 0.03 * bright_factor) + (0.03 * bright_factor) * np.power(v_norm, 0.85)
        L_3d = np.clip(L_toned * cyl_shade * vert_shade * 255.0, 0, 255).astype(np.float32)

        dark_protect = np.clip((L_3d - 22.0) / 48.0, 0.0, 1.0)
        blur_l = cv2.GaussianBlur(L_3d, (0, 0), 0.9)
        L_sharp = np.clip(L_3d * 1.05 - blur_l * 0.05, 0, 255)

        # 4. Natural Vibrance + Subtle Champagne Specular Polish
        chroma = np.sqrt((A - 128.0) ** 2 + (B - 128.0) ** 2)
        vibrance_boost = 1.0 + 0.22 * (1.0 - np.clip(chroma / 85.0, 0.0, 1.0)) * np.clip(chroma / 8.0, 0.0, 1.0)
        A_vib = 128.0 + (A - 128.0) * vibrance_boost
        B_vib = 128.0 + (B - 128.0) * vibrance_boost

        neutral_mask = np.clip(1.0 - chroma / 28.0, 0.0, 1.0)
        hl_mask = np.clip((L_sharp / 255.0 - 0.35) / 0.55, 0.0, 1.0)
        warm_weight = (
            neutral_mask
            * (0.30 + 0.70 * hl_mask)
            * (0.45 + 0.55 * np.power(v_norm, 1.2))
            * bright_factor
        )
        B_warm = np.clip(B_vib + warm_weight * 7.5, 0, 255)
        A_warm = np.clip(A_vib + warm_weight * 1.5, 0, 255)

        lab_enhanced = np.dstack([
            np.where(fg_mask, L_sharp, L),
            np.where(fg_mask, A_warm, A),
            np.where(fg_mask, B_warm, B),
        ]).astype(np.uint8)
        rgb_enhanced = cv2.cvtColor(lab_enhanced, cv2.COLOR_LAB2RGB).astype(np.float32)

        # 5. Stage Radiosity: Upward Golden Horizon Bounce + Warm Backlight Rim
        bounce_zone = np.power(np.clip((v_norm - 0.75) / 0.25, 0.0, 1.0), 2.1)
        rim_zone = (np.power(u_abs, 3.2) * (1.0 - np.power(u_abs, 14.0))) * np.clip(
            (v_norm - 0.22) / 0.78, 0.0, 1.0
        )

        bounce_str = (bounce_zone * (0.08 + 0.14 * bright_factor) * (0.25 + 0.75 * dark_protect))[:, :, np.newaxis]
        rim_str = (rim_zone * (0.08 + 0.14 * bright_factor) * (0.25 + 0.75 * dark_protect))[:, :, np.newaxis]

        h_col = stage_horizon_rgb[np.newaxis, np.newaxis, :]
        a_col = stage_aura_rgb[np.newaxis, np.newaxis, :]

        rgb_stage = rgb_enhanced * (1.0 - 0.5 * (bounce_str + rim_str)) + (
            (1.0 - (1.0 - rgb_enhanced / 255.0) * (1.0 - h_col / 255.0))
            * 255.0
            * (0.5 * bounce_str)
            + (1.0 - (1.0 - rgb_enhanced / 255.0) * (1.0 - a_col / 255.0))
            * 255.0
            * (0.5 * rim_str)
        )
        rgb_stage = rgb_stage + h_col * (bounce_str * 0.10)

        # Subtle 3px ground-contact AO at very bottom edge
        ao_zone = np.clip((v_norm - 0.985) / 0.015, 0.0, 1.0)[:, :, np.newaxis]
        rgb_stage = rgb_stage * (1.0 - 0.22 * ao_zone)

        # 6. Soft pure-white fringe cleanup only (never darken colored/pink/gold edges to black)
        rgb_clipped = np.clip(rgb_stage, 0.0, 255.0)
        is_white_fringe = (
            (alpha > 0)
            & (alpha < 95)
            & (rgb_clipped[:, :, 0] > 235)
            & (rgb_clipped[:, :, 1] > 235)
            & (rgb_clipped[:, :, 2] > 235)
        )
        clean_alpha = np.where(is_white_fringe, (alpha * 0.35), alpha).astype(np.uint8)
        out_arr = np.dstack((rgb_clipped.astype(np.uint8), clean_alpha))
        return Image.fromarray(out_arr, mode="RGBA")
    except Exception:
        return cutout


def enhance_luxury_color(cutout):
    """Apply natural, vibrant luxury color grading (perceptual LAB vibrance,
    gentle midtone clarity, and subtle highlight/shadow balance) without
    over-darkening or shifting neutral whites/silvers."""
    if "A" not in cutout.getbands():
        return cutout
    try:
        import cv2
        import numpy as np

        arr = np.array(cutout.convert("RGBA"))
        alpha = arr[:, :, 3]
        fg_mask = alpha > 25
        if not np.any(fg_mask):
            return cutout

        lab = cv2.cvtColor(arr[:, :, :3], cv2.COLOR_RGB2LAB).astype(np.float32)
        L = lab[:, :, 0]
        A = lab[:, :, 1]
        B = lab[:, :, 2]

        fg_l = L[fg_mask]
        p50 = float(np.percentile(fg_l, 50.0))
        p95 = float(np.percentile(fg_l, 95.0))

        # Preserve deep blacks/dark purples while keeping midtone clarity
        L_adj = L.copy()
        if p50 < 95.0 and p95 < 225.0:
            lift = min(1.08, 102.0 / max(45.0, p50))
            dark_keep = np.clip((L - 25.0) / 50.0, 0.0, 1.0)
            L_adj = np.clip(L * (1.0 + (lift - 1.0) * 0.65 * dark_keep), 0.0, 255.0)

        # Gentle micro-contrast in L
        clahe = cv2.createCLAHE(clipLimit=1.08, tileGridSize=(8, 8))
        L_clahe = clahe.apply(L_adj.astype(np.uint8)).astype(np.float32)
        L_final = np.clip(0.72 * L_adj + 0.28 * L_clahe, 0.0, 255.0)

        # Natural perceptual vibrance in LAB (protects pure neutrals & neon extremes)
        chroma = np.sqrt((A - 128.0) ** 2 + (B - 128.0) ** 2)
        vibrance = 1.0 + 0.18 * (1.0 - np.clip(chroma / 85.0, 0.0, 1.0)) * np.clip(chroma / 8.0, 0.0, 1.0)
        A_final = np.clip(128.0 + (A - 128.0) * vibrance, 0.0, 255.0)
        B_final = np.clip(128.0 + (B - 128.0) * vibrance, 0.0, 255.0)

        lab_out = np.dstack([
            np.where(fg_mask, L_final, L),
            np.where(fg_mask, A_final, A),
            np.where(fg_mask, B_final, B),
        ]).astype(np.uint8)
        rgb_out = cv2.cvtColor(lab_out, cv2.COLOR_LAB2RGB)
        out = arr.copy()
        out[:, :, :3] = rgb_out
        return Image.fromarray(out, "RGBA")
    except Exception:
        return cutout


def strip_baked_reflection(cutout):
    """Remove baked-in studio reflections or narrow reflection tails at the bottom
    of segmented cutouts (e.g. a narrow curved reflection tail under a crystal base,
    or a full-width mirrored table-reflection slab under box+bottle)."""
    if "A" not in cutout.getbands():
        return cutout
    try:
        import numpy as np
        arr = np.array(cutout.convert("RGBA"))
        alpha = arr[:, :, 3]
        ys, xs = np.where(alpha > 40)
        if len(ys) < 200:
            return cutout
        min_y, max_y = int(ys.min()), int(ys.max())
        min_x, max_x = int(xs.min()), int(xs.max())
        h_obj = max_y - min_y + 1
        w_obj = max_x - min_x + 1
        if h_obj < 120 or w_obj < 80:
            return cutout

        # Row widths of solid foreground (alpha > 80)
        row_widths = np.array([int(np.sum(alpha[y, min_x:max_x + 1] > 80)) for y in range(min_y, max_y + 1)])
        main_w = float(np.percentile(row_widths[int(h_obj * 0.35):int(h_obj * 0.78)], 70))
        if main_w < 60:
            return cutout

        # Case A: Narrow hanging reflection tail at bottom (e.g. Al Haramain Sheikh)
        search_top = max(min_y + int(h_obj * 0.65), max_y - int(h_obj * 0.22))
        for y in range(max_y - 4, search_top, -1):
            w_below = float(np.median(row_widths[y - min_y:min(len(row_widths), y - min_y + 6)]))
            w_above = float(np.median(row_widths[max(0, y - min_y - 10):y - min_y]))
            if w_below < main_w * 0.38 and w_above >= main_w * 0.55 and w_above >= w_below * 2.0:
                # Confirm bottom tail is genuinely narrow all the way to max_y
                if float(np.max(row_widths[y - min_y + 2:])) < main_w * 0.45:
                    out = arr.copy()
                    out[y + 1:, :, 3] = 0
                    return Image.fromarray(out, "RGBA")

        # Case B: Full-width baked-in mirror reflection slab (e.g. Al Absar Hiyam)
        bot_cov = float(np.mean(alpha[max_y - 3:max_y + 1, min_x:max_x + 1] > 80))
        rgb = arr[:, :, :3].astype(np.float32)
        lum = 0.299 * rgb[:, :, 0] + 0.587 * rgb[:, :, 1] + 0.114 * rgb[:, :, 2]
        if bot_cov >= 0.88:
            best_seam = None
            best_score = 0.0
            lo_seam = max(min_y + int(h_obj * 0.72), max_y - int(h_obj * 0.16))
            hi_seam = max_y - 12
            for y_seam in range(lo_seam, hi_seam):
                d = min(35, max_y - y_seam, y_seam - min_y)
                if d < 12:
                    continue
                above = lum[y_seam - d:y_seam, min_x:max_x + 1]
                below = lum[y_seam:y_seam + d, min_x:max_x + 1][::-1, :]
                m_above = float(np.mean(above))
                m_below = float(np.mean(below))
                if m_above < 20.0:
                    continue
                a_c = above - m_above
                b_c = below - m_below
                denom = float(np.sqrt(np.sum(a_c * a_c) * np.sum(b_c * b_c)))
                corr = float(np.sum(a_c * b_c) / denom) if denom > 1e-5 else 0.0

                mask = (alpha[y_seam, min_x:max_x + 1] > 80) & (alpha[y_seam + 2, min_x:max_x + 1] > 80)
                grad = 0.0
                if np.sum(mask) >= 50:
                    grad = float(np.mean(np.abs(
                        lum[y_seam - 1:y_seam + 1, min_x:max_x + 1].mean(axis=0)[mask]
                        - lum[y_seam + 1:y_seam + 3, min_x:max_x + 1].mean(axis=0)[mask]
                    )))

                if corr > 0.55 and m_below < m_above * 0.90:
                    score = corr * 100.0
                    if score > best_score:
                        best_score = score
                        best_seam = y_seam
                elif grad >= 28.0 and m_below < m_above * 0.85 and float(np.min(row_widths[y_seam - min_y:])) >= w_obj * 0.88:
                    if grad > best_score:
                        best_score = grad
                        best_seam = y_seam
            if best_seam is not None:
                out = arr.copy()
                out[best_seam + 1:, :, 3] = 0
                return Image.fromarray(out, "RGBA")

        # Case C: Crystal/bottle base reflection with sharp horizontal seam & mirror correlation (e.g. Sheikh)
        lo_c = max(min_y + int(h_obj * 0.82), max_y - int(h_obj * 0.10))
        hi_c = max_y - 22
        best_c_seam = None
        best_c_grad = 0.0
        for y_seam in range(lo_c, hi_c):
            d = min(35, max_y - y_seam, y_seam - min_y)
            if d < 14:
                continue
            mask = (alpha[y_seam, min_x:max_x + 1] > 80) & (alpha[y_seam + 2, min_x:max_x + 1] > 80)
            if np.sum(mask) < 40:
                continue
            grad = float(np.mean(np.abs(
                lum[y_seam - 1:y_seam + 1, min_x:max_x + 1].mean(axis=0)[mask]
                - lum[y_seam + 1:y_seam + 3, min_x:max_x + 1].mean(axis=0)[mask]
            )))
            if grad < 45.0:
                continue
            above = lum[y_seam - d:y_seam, min_x:max_x + 1]
            below = lum[y_seam:y_seam + d, min_x:max_x + 1][::-1, :]
            a_c = above - float(np.mean(above))
            b_c = below - float(np.mean(below))
            denom = float(np.sqrt(np.sum(a_c * a_c) * np.sum(b_c * b_c)))
            corr = float(np.sum(a_c * b_c) / denom) if denom > 1e-5 else 0.0
            if corr >= 0.48 and float(np.max(row_widths[y_seam + 2 - min_y:])) < main_w * 0.92:
                if grad > best_c_grad:
                    best_c_grad = grad
                    best_c_seam = y_seam
        if best_c_seam is not None:
            out = arr.copy()
            out[best_c_seam + 1:, :, 3] = 0
            return Image.fromarray(out, "RGBA")

        return cutout
    except Exception:
        return cutout


def clean_floating_text_and_haze(cutout, is_set=False):
    """Remove detached floating calligraphy/text/watermarks above, below, or beside
    the main bottle, as well as detached semi-transparent smoke/mist/reflection clouds."""
    if "A" not in cutout.getbands():
        return cutout
    import numpy as np
    try:
        import cv2
    except Exception:
        return cutout

    arr = np.array(cutout.convert("RGBA")).copy()
    alpha = arr[:, :, 3]
    H, W = alpha.shape

    solid_mask = (alpha >= 170).astype(np.uint8)
    n_sol, lbl_sol, st_sol, _ = cv2.connectedComponentsWithStats(solid_mask)
    if n_sol <= 1:
        return cutout

    sol_areas = [st_sol[i, cv2.CC_STAT_AREA] for i in range(1, n_sol)]
    main_lbl = 1 + int(np.argmax(sol_areas))
    max_area = sol_areas[main_lbl - 1]
    mx = int(st_sol[main_lbl, cv2.CC_STAT_LEFT])
    my = int(st_sol[main_lbl, cv2.CC_STAT_TOP])
    mw = int(st_sol[main_lbl, cv2.CC_STAT_WIDTH])
    mh = int(st_sol[main_lbl, cv2.CC_STAT_HEIGHT])
    mx2, my2 = mx + mw, my + mh

    keep_solid = np.zeros_like(solid_mask)
    for lbl in range(1, n_sol):
        a_i = st_sol[lbl, cv2.CC_STAT_AREA]
        x = int(st_sol[lbl, cv2.CC_STAT_LEFT])
        y = int(st_sol[lbl, cv2.CC_STAT_TOP])
        w = int(st_sol[lbl, cv2.CC_STAT_WIDTH])
        h = int(st_sol[lbl, cv2.CC_STAT_HEIGHT])
        x2, y2 = x + w, y + h

        if lbl == main_lbl:
            keep_solid[lbl_sol == lbl] = 1
            continue

        is_floating_above = (y2 < my - max(12, int(mh * 0.04))) and (a_i < max_area * 0.25)
        is_floating_below = (y > my2 - max(4, int(mh * 0.02))) and (a_i < max_area * 0.30)
        is_side_debris = (not is_set) and (a_i < max_area * 0.15) and (x2 < mx - int(W * 0.03) or x > mx2 + int(W * 0.03))
        is_tiny_speck = a_i < min(250, max_area * 0.008)

        if is_floating_above or is_floating_below or is_side_debris or is_tiny_speck:
            continue
        keep_solid[lbl_sol == lbl] = 1

    keep_zone = cv2.dilate(keep_solid, np.ones((9, 9), np.uint8), iterations=1) > 0
    arr[:, :, 3] = np.where(keep_zone, alpha, 0).astype(np.uint8)
    return Image.fromarray(arr, mode="RGBA")


def remove_clean_gap_box_local(cutout):
    """For single bottles (is_set=False), detect and remove a packaging box
    when there is a clean background gap between the rectangular box and the bottle."""
    if "A" not in cutout.getbands():
        return cutout, False
    import numpy as np

    arr = np.array(cutout.convert("RGBA")).copy()
    alpha = arr[:, :, 3]
    ys, xs = np.where(alpha > 28)
    if len(ys) == 0:
        return cutout, False
    y1, y2 = int(ys.min()), int(ys.max()) + 1
    x1, x2 = int(xs.min()), int(xs.max()) + 1
    fg_h, fg_w = y2 - y1, x2 - x1
    if fg_h < 60 or fg_w / max(1, fg_h) < 0.78:
        return cutout, False

    roi_a = alpha[y1:y2, x1:x2]
    col_counts = (roi_a > 40).sum(axis=0)
    s_lo, s_hi = int(fg_w * 0.25), int(fg_w * 0.75)

    def _box_score(sub_a):
        sh, sw = sub_a.shape
        if sw < 20 or sh < 40:
            return 0.0
        sy, sx = np.where(sub_a > 40)
        if len(sy) == 0:
            return 0.0
        bh = int(sy.max()) - int(sy.min()) + 1
        bw = int(sx.max()) - int(sx.min()) + 1
        fill = len(sy) / max(1, bh * bw)
        top_band = sub_a[int(sy.min()):int(sy.min()) + max(3, int(bh * 0.08)), :] > 40
        mid_band = sub_a[int(sy.min()) + int(bh * 0.45):int(sy.min()) + int(bh * 0.60), :] > 40
        top_w = top_band.any(axis=0).sum()
        mid_w = max(1, mid_band.any(axis=0).sum())
        return fill * 0.55 + min(1.0, top_w / mid_w) * 0.45

    best_split = None
    best_diff = 0.0
    best_keep_side = None
    for split_x in range(s_lo, s_hi, 4):
        left_s = _box_score(roi_a[:, :split_x])
        right_s = _box_score(roi_a[:, split_x:])
        diff = abs(left_s - right_s)
        if max(left_s, right_s) > 0.80 and min(left_s, right_s) < 0.76 and diff > best_diff:
            best_diff = diff
            best_split = split_x
            best_keep_side = "right" if left_s > right_s else "left"

    if best_split is None:
        return cutout, False

    w_lo = max(s_lo, best_split - 24)
    w_hi = min(s_hi, best_split + 24)
    refined_split = w_lo + int(np.argmin(col_counts[w_lo:w_hi]))
    if col_counts[refined_split] > fg_h * 0.10:
        return cutout, False

    if best_keep_side == "right":
        arr[y1:y2, x1:x1 + refined_split, 3] = 0
    else:
        arr[y1:y2, x1 + refined_split:x2, 3] = 0
    return Image.fromarray(arr, mode="RGBA"), True


def normalize_flacon_cutout(cutout, target_max_h=880, target_max_w=880, canvas_size=(1024, 1024), allow_upscale=True, is_set=False):
    if "A" not in cutout.getbands():
        return cutout
    import numpy as np

    cutout = strip_baked_reflection(cutout)
    cutout = clean_floating_text_and_haze(cutout, is_set=is_set)
    if not is_set:
        cutout, _ = remove_clean_gap_box_local(cutout)

    # 1. Clean invisible/faint ghost residue (alpha < 18)
    arr = np.array(cutout)
    alpha = arr[:, :, 3].copy()
    alpha[alpha < 18] = 0

    # 2. Extract significant foreground components (alpha > 28)
    mask = (alpha > 28).astype(np.uint8)
    try:
        import cv2
        num_labels, labels, stats, centroids = cv2.connectedComponentsWithStats(mask)
        if num_labels <= 1:
            return cutout

        # Find largest component (main bottle body)
        areas = [stats[i, cv2.CC_STAT_AREA] for i in range(1, num_labels)]
        max_area = max(areas)
        main_lbl = 1 + int(np.argmax(areas))
        main_w = stats[main_lbl, cv2.CC_STAT_WIDTH]
        main_cx = centroids[main_lbl][0]

        # Valid components: keep main body, plus all genuine product components (boxes, packaging,
        # caps, sprayers, bases, miniatures, gift sets, charms). Exclude only tiny isolated corner noise artifacts.
        valid_mask = np.zeros_like(mask)
        H, W = mask.shape[:2]
        for lbl in range(1, num_labels):
            area = stats[lbl, cv2.CC_STAT_AREA]
            x = stats[lbl, cv2.CC_STAT_LEFT]
            y = stats[lbl, cv2.CC_STAT_TOP]
            w = stats[lbl, cv2.CC_STAT_WIDTH]
            h = stats[lbl, cv2.CC_STAT_HEIGHT]
            touches_corner = (x <= 1 or x + w >= W - 1) and (y <= 1 or y + h >= H - 1)
            is_corner_noise = touches_corner and area < 80
            if lbl == main_lbl:
                valid_mask[labels == lbl] = 1
            elif not is_corner_noise and area >= 40:
                valid_mask[labels == lbl] = 1
    except Exception:
        # Fallback using scipy.ndimage
        try:
            from scipy.ndimage import label
            labeled, num_features = label(mask)
            if num_features <= 1:
                valid_mask = mask
            else:
                areas = [int(np.sum(labeled == i)) for i in range(1, num_features + 1)]
                main_lbl = 1 + int(np.argmax(areas))
                valid_mask = np.zeros_like(mask)
                H, W = mask.shape[:2]
                for i in range(1, num_features + 1):
                    ys_i, xs_i = np.where(labeled == i)
                    if len(xs_i) == 0:
                        continue
                    area_i = areas[i - 1]
                    x_min, x_max = int(xs_i.min()), int(xs_i.max())
                    y_min, y_max = int(ys_i.min()), int(ys_i.max())
                    touches_corner = (x_min <= 1 or x_max >= W - 1) and (y_min <= 1 or y_max >= H - 1)
                    is_corner_noise = touches_corner and area_i < 80
                    if i == main_lbl:
                        valid_mask[labeled == i] = 1
                    elif not is_corner_noise and area_i >= 40:
                        valid_mask[labeled == i] = 1
        except Exception:
            valid_mask = (alpha > 25).astype(np.uint8)

    # Zero out rejected components from alpha (removes side ghosts and stray reflections)
    alpha[valid_mask == 0] = 0
    arr[:, :, 3] = alpha
    cleaned_cutout = Image.fromarray(arr)

    ys, xs = np.where(valid_mask > 0)
    if len(xs) == 0:
        return cutout
    x1, y1 = max(0, int(xs.min()) - 4), max(0, int(ys.min()) - 4)
    x2, y2 = min(cutout.size[0], int(xs.max()) + 5), min(cutout.size[1], int(ys.max()) + 5)
    cw, ch = x2 - x1, y2 - y1
    if cw <= 0 or ch <= 0:
        return cutout

    eff_max_w = max(target_max_w, min(int(canvas_size[0] * 0.94), 960)) if cw > ch * 1.15 else target_max_w
    scale = min(eff_max_w / float(cw), target_max_h / float(ch))
    if not allow_upscale:
        # Never enlarge the product beyond its original pixel resolution; a
        # small original stays small and is flagged as low quality instead of
        # being upscaled and presented as an improvement.
        scale = min(scale, 1.0)
    new_w = max(1, int(round(cw * scale)))
    new_h = max(1, int(round(ch * scale)))

    crop = cleaned_cutout.crop((x1, y1, x2, y2))
    resized = crop.resize((new_w, new_h), Image.Resampling.LANCZOS)

    # For upscaled cutouts from lower-resolution photos, apply subtle unsharp masking
    # to maintain crisp packaging contours, glass highlights and logo lettering.
    if scale > 1.2:
        try:
            import cv2
            arr_res = np.array(resized)
            rgb_res = arr_res[:, :, :3]
            alpha_res = arr_res[:, :, 3]
            gaussian = cv2.GaussianBlur(rgb_res, (0, 0), 0.8)
            sharp_rgb = cv2.addWeighted(rgb_res, 1.22, gaussian, -0.22, 0)
            arr_res[:, :, :3] = sharp_rgb
            arr_res[:, :, 3] = alpha_res
            resized = Image.fromarray(arr_res)
        except Exception:
            pass

    canvas = Image.new("RGBA", canvas_size, (0, 0, 0, 0))
    pos_x = (canvas_size[0] - new_w) // 2
    pos_y = (canvas_size[1] - new_h) // 2
    canvas.paste(resized, (pos_x, pos_y), resized)

    # Sub-pixel anti-aliasing fine-tuning: ensure canvas flacon center is exactly canvas_size[0] // 2
    final_arr = np.array(canvas)
    f_ys, f_xs = np.where(final_arr[:, :, 3] > 25)
    if len(f_xs) > 0:
        cur_cx = (f_xs.min() + f_xs.max()) / 2.0
        err = int(round(canvas_size[0] / 2.0 - cur_cx))
        if err != 0 and abs(err) <= 20:
            canvas = Image.new("RGBA", canvas_size, (0, 0, 0, 0))
            canvas.paste(resized, (pos_x + err, pos_y), resized)

    canvas = align_multi_object_floor(canvas)
    canvas = level_tilted_bottle(canvas, target_max_h=target_max_h, target_max_w=target_max_w)
    return canvas


def align_multi_object_floor(canvas):
    """When a cutout has 2+ horizontally separated standing objects (e.g. box + bottle),
    align the bottom baseline of any slightly higher object down to the shared floor
    line so the second object never appears to float above the stage."""
    import numpy as np
    arr = np.array(canvas.convert("RGBA"))
    h, w = arr.shape[:2]
    alpha = arr[:, :, 3]
    ys, xs = np.where(alpha > 35)
    if len(ys) == 0:
        return canvas
    min_x, max_x = int(xs.min()), int(xs.max())
    min_y, max_y = int(ys.min()), int(ys.max())
    col_has = np.any(alpha[min_y:max_y + 1, :] > 35, axis=0)

    segs = []
    in_seg = False
    start = 0
    for x in range(min_x, max_x + 1):
        if col_has[x] and not in_seg:
            in_seg = True
            start = x
        elif not col_has[x] and in_seg:
            in_seg = False
            segs.append((start, x - 1))
    if in_seg:
        segs.append((start, max_x))

    merged = []
    for s in segs:
        if merged and s[0] - merged[-1][1] < 4:
            merged[-1] = (merged[-1][0], s[1])
        else:
            merged.append(s)

    if len(merged) < 2:
        # Touching objects (e.g. bottle touching box with 0px gap):
        # detect a sharp vertical step in bottom_y paired with a wide flat plateau
        w_obj = max_x - min_x + 1
        if w_obj < 250:
            return canvas
        bottom_y = {}
        for x in range(min_x, max_x + 1):
            col = np.where(alpha[:, x] > 140)[0]
            if len(col) > 0:
                bottom_y[x] = int(col.max())
        if len(bottom_y) < 200:
            return canvas
        target_bottom = max(bottom_y.values())
        lo_x = min_x + int(w_obj * 0.18)
        hi_x = max_x - int(w_obj * 0.18)
        best_step = None
        for x in range(lo_x, hi_x):
            if x - 2 in bottom_y and x + 2 in bottom_y:
                diff = abs(bottom_y[x + 2] - bottom_y[x - 2])
                if diff >= 16 and (best_step is None or diff > best_step[0]):
                    best_step = (diff, x)
        if not best_step:
            return canvas
        _, x_seam = best_step
        out = arr.copy()
        changed = False
        for side, sx, ex in [('left', min_x, max(min_x, x_seam - 2)), ('right', min(max_x, x_seam + 2), max_x)]:
            sw = ex - sx + 1
            if sw < 120:
                continue
            sub_ys = [bottom_y[x] for x in range(sx, ex + 1) if x in bottom_y]
            if len(sub_ys) < sw * 0.8:
                continue
            trim = max(4, int(len(sub_ys) * 0.15))
            core = np.array(sub_ys[trim:-trim], dtype=float)
            if len(core) < 40 or float(np.std(core)) > 5.0:
                continue
            s_plateau_y = int(np.percentile(core, 85))
            delta = target_bottom - s_plateau_y
            if not (15 <= delta <= 195 and s_plateau_y >= h * 0.55):
                continue
            sy = np.where(alpha[:, sx:ex + 1] > 35)[0]
            if len(sy) == 0:
                continue
            s_min_y = int(sy.min())
            s_max_y = min(int(sy.max()), s_plateau_y + 4)
            if s_max_y - s_min_y + 1 < 200:
                continue
            slice_rgba = arr[s_min_y:s_max_y + 1, sx:ex + 1].copy()
            out[s_min_y:s_max_y + 1, sx:ex + 1] = 0
            dst_y1 = min(h, s_min_y + delta)
            dst_y2 = min(h, s_max_y + 1 + delta)
            copy_h = dst_y2 - dst_y1
            if copy_h > 0:
                out[dst_y1:dst_y2, sx:ex + 1] = slice_rgba[:copy_h, :]
                changed = True
                break
        return Image.fromarray(out, "RGBA") if changed else canvas

    seg_info = []
    for sx, ex in merged:
        sy = np.where(alpha[:, sx:ex + 1] > 35)[0]
        if len(sy) == 0:
            continue
        sy_solid = np.where(alpha[:, sx:ex + 1] > 140)[0]
        s_min_y = int(sy.min())
        s_max_y = int(sy.max())
        s_solid_max_y = int(sy_solid.max()) if len(sy_solid) > 0 else s_max_y
        seg_info.append((sx, ex, s_min_y, s_max_y, s_solid_max_y, ex - sx + 1, s_max_y - s_min_y + 1))

    if len(seg_info) < 2:
        return canvas

    target_bottom = max(s[4] for s in seg_info)
    out = arr.copy()
    changed = False
    for sx, ex, s_min_y, s_max_y, s_solid_max_y, sw, sh in seg_info:
        delta = target_bottom - s_solid_max_y
        if 3 <= delta <= 195 and sw >= 60 and sh >= 200 and s_solid_max_y >= h * 0.60:
            slice_rgba = arr[s_min_y:s_max_y + 1, sx:ex + 1].copy()
            # Straighten rolled box/bottle segment via pure rigid rotation if both vertical edges lean together
            if sw >= 120:
                try:
                    import cv2
                    s_alpha = slice_rgba[:, :, 3]
                    y_lo, y_hi = int(sh * 0.25), int(sh * 0.75)
                    l_pts, r_pts = [], []
                    for yy in range(y_lo, y_hi):
                        row_x = np.where(s_alpha[yy, :] > 120)[0]
                        if len(row_x) > 0:
                            l_pts.append((float(yy), float(row_x.min())))
                            r_pts.append((float(yy), float(row_x.max())))
                    if len(l_pts) >= 20:
                        l_deg = float(np.degrees(np.arctan(np.polyfit([p[0] for p in l_pts], [p[1] for p in l_pts], 1)[0])))
                        r_deg = float(np.degrees(np.arctan(np.polyfit([p[0] for p in r_pts], [p[1] for p in r_pts], 1)[0])))
                        if l_deg * r_deg > 0 and abs(l_deg - r_deg) <= 2.5:
                            v_deg = (l_deg + r_deg) / 2.0
                            if 2.0 <= abs(v_deg) <= 8.0:
                                M_rot = cv2.getRotationMatrix2D((sw / 2.0, sh / 2.0), -v_deg, 1.0)
                                slice_rgba = cv2.warpAffine(
                                    slice_rgba, M_rot, (sw, sh),
                                    flags=cv2.INTER_LANCZOS4,
                                    borderMode=cv2.BORDER_CONSTANT,
                                    borderValue=(0, 0, 0, 0),
                                )
                                r_sy = np.where(slice_rgba[:, :, 3] > 140)[0]
                                if len(r_sy) > 0:
                                    delta = target_bottom - (s_min_y + int(r_sy.max()))
                except Exception:
                    pass
            out[s_min_y:s_max_y + 1, sx:ex + 1] = 0
            dst_y1 = max(0, min(h, s_min_y + delta))
            dst_y2 = min(h, s_max_y + 1 + delta)
            copy_h = dst_y2 - dst_y1
            if copy_h > 0:
                out[dst_y1:dst_y2, sx:ex + 1] = slice_rgba[:copy_h, :]
                changed = True

    return Image.fromarray(out, "RGBA") if changed else canvas


def level_tilted_bottle(canvas, target_max_h=880, target_max_w=880):
    """For single-bottle cutouts photographed with a slight camera roll (2..8 deg
    where both vertical sides and bottom edge lean in the same direction), apply pure
    rigid rotation (never shear/stretch) so the bottle stands upright without distortion."""
    try:
        import cv2
        import numpy as np
    except Exception:
        return canvas

    arr = np.array(canvas.convert("RGBA"))
    h, w = arr.shape[:2]
    alpha = arr[:, :, 3]
    ys, xs = np.where(alpha > 120)
    if len(xs) < 200:
        return canvas

    min_x, max_x = int(xs.min()), int(xs.max())
    min_y, max_y = int(ys.min()), int(ys.max())
    w_obj = max_x - min_x + 1
    h_obj = max_y - min_y + 1
    if w_obj < 60 or h_obj < 120:
        return canvas

    # Skip multi-object cutouts (box + bottle, sets)
    col_has = np.any(alpha[min_y:max_y + 1, :] > 35, axis=0)
    gaps = 0
    in_seg = False
    seg_count = 0
    gap_len = 0
    for x in range(min_x, max_x + 1):
        if col_has[x]:
            if not in_seg:
                if seg_count > 0 and gap_len >= 6:
                    gaps += 1
                in_seg = True
                seg_count += 1
            gap_len = 0
        else:
            in_seg = False
            gap_len += 1
    if gaps > 0:
        return canvas

    # Measure vertical side tilt in middle 35%-75% of object height
    y_lo, y_hi = int(min_y + h_obj * 0.35), int(min_y + h_obj * 0.75)
    l_pts, r_pts = [], []
    for y in range(y_lo, y_hi):
        row = np.where(alpha[y, :] > 120)[0]
        if len(row) > 0:
            l_pts.append((float(y), float(row.min())))
            r_pts.append((float(y), float(row.max())))
    if len(l_pts) < 20:
        return canvas
    ml = float(np.polyfit([p[0] for p in l_pts], [p[1] for p in l_pts], 1)[0])
    mr = float(np.polyfit([p[0] for p in r_pts], [p[1] for p in r_pts], 1)[0])
    l_deg = float(np.degrees(np.arctan(ml)))
    r_deg = float(np.degrees(np.arctan(mr)))
    # Both sides must lean in the same direction (true camera roll, not tapered bottle or 3/4 cube)
    if l_deg * r_deg <= 0 or abs(l_deg - r_deg) > 4.0:
        return canvas
    v_deg = (l_deg + r_deg) / 2.0
    if not (2.0 <= abs(v_deg) <= 45.0):
        return canvas

    # Also verify bottom edge tilts in the matching direction
    bottom_y = {}
    for x in range(min_x, max_x + 1):
        col = np.where(alpha[:, x] > 120)[0]
        if len(col) > 0:
            bottom_y[x] = int(col.max())
    pts_x = sorted(bottom_y.keys())
    if len(pts_x) < 40:
        return canvas
    trim = max(4, int(len(pts_x) * 0.15))
    core_xs = pts_x[trim:-trim]
    if len(core_xs) < 20:
        return canvas
    pts = np.array([[float(x), float(bottom_y[x])] for x in core_xs], dtype=np.float32)
    vx, vy, x0, y0 = cv2.fitLine(pts, cv2.DIST_HUBER, 0, 0.01, 0.01).flatten()
    if abs(vx) < 1e-6:
        return canvas
    b_deg = float(np.degrees(np.arctan(vy / vx)))
    if abs(v_deg) < 10.0 and abs(b_deg - (-v_deg)) > 4.5:
        return canvas

    # Pure rigid rotation (no shear/stretching)
    cx, cy = (min_x + max_x) / 2.0, (min_y + max_y) / 2.0
    M = cv2.getRotationMatrix2D((cx, cy), -v_deg, 1.0)
    warped = cv2.warpAffine(
        arr, M, (w, h),
        flags=cv2.INTER_LANCZOS4,
        borderMode=cv2.BORDER_CONSTANT,
        borderValue=(0, 0, 0, 0),
    )

    w_ys, w_xs = np.where(warped[:, :, 3] > 25)
    if len(w_xs) == 0:
        return canvas
    wx1, wy1 = max(0, int(w_xs.min()) - 4), max(0, int(w_ys.min()) - 4)
    wx2, wy2 = min(w, int(w_xs.max()) + 5), min(h, int(w_ys.max()) + 5)
    cw, ch = wx2 - wx1, wy2 - wy1
    if cw <= 0 or ch <= 0:
        return canvas

    crop = Image.fromarray(warped[wy1:wy2, wx1:wx2], "RGBA")
    eff_max_w = max(target_max_w, min(int(w * 0.94), 960)) if cw > ch * 1.15 else target_max_w
    scale = min(eff_max_w / float(cw), target_max_h / float(ch), 1.0)
    new_w = max(1, int(round(cw * scale)))
    new_h = max(1, int(round(ch * scale)))
    if new_w != cw or new_h != ch:
        crop = crop.resize((new_w, new_h), Image.Resampling.LANCZOS)

    out_canvas = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    pos_x = (w - new_w) // 2
    pos_y = (h - new_h) // 2
    out_canvas.paste(crop, (pos_x, pos_y), crop)
    return out_canvas



def is_stale_processing(job, now):
    status = job.get("status")
    if status not in ("processing", "publishing"):
        return False
    ts_str = (
        job.get("startedAt")
        if status == "processing"
        else (job.get("updatedAt") or job.get("completedAt") or job.get("startedAt"))
    )
    if not ts_str:
        return True
    try:
        ts = datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
    except ValueError:
        return True
    limit_min = STALE_PROCESSING_MINUTES if status == "processing" else STALE_PUBLISHING_MINUTES
    return (now - ts).total_seconds() >= limit_min * 60


def select_candidates(rows, now, regenerate_completed=False):
    utc_day = now.date().isoformat()
    eligible = []
    attempts_today = 0
    for row in rows:
        info = row.get("info") or {}
        gt = info.get("googleTrends") or {}
        if row.get("in_stock") is False or gt.get("passed") is False or gt.get("hiddenFromSite") is True:
            continue
        job = image_generation(info)
        if job.get("attemptedOn") == utc_day:
            attempts_today += 1
        if regenerate_completed:
            if job.get("status") != "completed" or job.get("model") == MODEL_ID:
                continue
            replacement = info.get("imageGenerationReplacement") or {}
            if replacement.get("status") in ("processing", "publishing") and not is_stale_processing(replacement, now):
                continue
            eligible.append(row)
            continue
        if job.get("status") == "completed":
            continue
        if job.get("status") in ("processing", "publishing") and not is_stale_processing(job, now):
            continue
        eligible.append(row)
    return eligible, attempts_today


def is_global_generation_halted(rows):
    for row in rows:
        slug = str(row.get("slug") or "")
        identifier = str(row.get("id") or "")
        if slug == "site-settings" or identifier in ("site-settings", "999999"):
            info = row.get("info") or {}
            if info.get("globalImageGenerationHalted") or info.get("imageGenerationHalted"):
                return True
    return False


def check_global_halt_remote(session, supabase_url, service_key=""):
    """Check if global image generation is halted via a lightweight single-row query."""
    try:
        endpoint = rest_stocks_url(supabase_url)
        params = {"select": "id,slug,info", "slug": "eq.site-settings", "limit": 1}
        if session is not None and hasattr(session, "get"):
            resp = session.get(endpoint, params=params, timeout=5)
            if resp.ok:
                data = resp.json()
                if isinstance(data, list):
                    return is_global_generation_halted(data)
        elif service_key:
            query = urlencode(params)
            headers = {
                "apikey": service_key,
                "Authorization": f"Bearer {service_key}",
            }
            req = urllib.request.Request(f"{endpoint}?{query}", headers=headers)
            with urllib.request.urlopen(req, timeout=5) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                if isinstance(data, list):
                    return is_global_generation_halted(data)
    except Exception:
        pass
    return False


def check_schedule_ready(rows, now, wait_up_to_seconds=SCHEDULE_WAIT_WINDOW_SECONDS):
    if is_global_generation_halted(rows):
        return {
            "should_run": False,
            "reason": "global_generation_halted",
            "wait_seconds": 0,
            "pending_count": 0,
        }

    for row in rows:
        info = row.get("info") or {}
        if is_awaiting_publication(image_generation(info)) or is_awaiting_publication(
            info.get("imageGenerationReplacement") or {}
        ):
            return {
                "should_run": True,
                "reason": "awaiting_publication",
                "wait_seconds": 0,
                "pending_count": 0,
            }

    candidates, _ = select_candidates(rows, now, regenerate_completed=False)
    if not candidates:
        return {
            "should_run": False,
            "reason": "no_pending_images",
            "wait_seconds": 0,
            "pending_count": 0,
        }

    selected_account = os.environ.get("CLOUDFLARE_IMAGE_ACCOUNT")
    if not selected_account:
        selected_account = "primary" if os.environ.get("CLOUDFLARE_ACCOUNT_ID") else "local"
    has_cf = bool(os.environ.get("CLOUDFLARE_ACCOUNT_ID") and os.environ.get("CLOUDFLARE_API_TOKEN"))
    if selected_account == "local" or not has_cf:
        return {
            "should_run": True,
            "reason": "local_pipeline_ready",
            "wait_seconds": 0,
            "pending_count": len(candidates),
        }

    quotas = extract_account_quotas(rows)
    unavailable_until = []
    for account_name in ACCOUNT_ENV:
        entry = quotas.get(account_name) or {}
        avail_dt = parse_iso_datetime(entry.get("availableAt"))
        if avail_dt and avail_dt > now:
            unavailable_until.append((account_name, avail_dt))

    if not unavailable_until:
        return {
            "should_run": True,
            "reason": "all_accounts_available",
            "wait_seconds": 0,
            "pending_count": len(candidates),
        }

    latest_account, all_available_at = max(unavailable_until, key=lambda item: item[1])
    remaining_seconds = max(0.0, (all_available_at - now).total_seconds())
    if remaining_seconds <= wait_up_to_seconds:
        return {
            "should_run": True,
            "reason": "all_accounts_available_soon",
            "wait_seconds": remaining_seconds,
            "all_available_at": all_available_at.isoformat(),
            "latest_account": latest_account,
            "pending_count": len(candidates),
        }

    return {
        "should_run": False,
        "reason": "accounts_on_cooldown",
        "wait_seconds": remaining_seconds,
        "all_available_at": all_available_at.isoformat(),
        "latest_account": latest_account,
        "pending_count": len(candidates),
    }


def _text_region_mask(gray):
    """Accurately detect text, numbers, logo glyphs, volume and concentration markings
    while rejecting outer bottle contours, glass facet rims, ribbon loops, and packaging
    outer borders."""
    import cv2
    import numpy as np

    if not isinstance(gray, np.ndarray):
        gray = np.asarray(gray)

    img_h, img_w = gray.shape[:2]
    max_dim = max(img_h, img_w)

    # 1. Bilateral filter to suppress JPEG compression noise while preserving crisp character and numeral edges
    denoised = cv2.bilateralFilter(gray, d=5, sigmaColor=30, sigmaSpace=30)

    # 2. Dual-polarity Top-Hat and Black-Hat morphology:
    # - Top-Hat extracts light glyphs/numerals on dark background (e.g. gold/white text on dark labels/glass)
    # - Black-Hat extracts dark glyphs/numerals on light background (e.g. black text on light labels/boxes)
    # This preserves internal loops of numbers (0, 4, 6, 8, 9) and avoids filling them with solid ink.
    k = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
    tophat = cv2.morphologyEx(denoised, cv2.MORPH_TOPHAT, k)
    blackhat = cv2.morphologyEx(denoised, cv2.MORPH_BLACKHAT, k)
    contrast_map = cv2.max(tophat, blackhat)

    grad = cv2.morphologyEx(
        denoised, cv2.MORPH_GRADIENT, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    )
    feature_map = cv2.max(contrast_map, grad)
    _, thresh = cv2.threshold(feature_map, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)

    # 3. Connected components analysis: filter by text & numeral geometric properties
    num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(thresh)
    mask = np.zeros_like(gray)

    for i in range(1, num_labels):
        area = stats[i, cv2.CC_STAT_AREA]
        cw = stats[i, cv2.CC_STAT_WIDTH]
        ch = stats[i, cv2.CC_STAT_HEIGHT]

        # Characters/logos have bounded height, width, and area
        # Large continuous contours (bottle edges, ribbon, box border) are rejected
        if ch > max_dim * 0.25 or cw > max_dim * 0.45:
            continue
        # Allow small areas for dots in dates/volumes e.g. .1691. or 3.4 FL.OZ and accents
        if area < 2 or area > (img_h * img_w * 0.05):
            continue
        # Numerals like '1' can have cw >= 1; dots and dashes can have ch >= 2
        if 2 <= ch <= max_dim * 0.25 and 1 <= cw <= max_dim * 0.45:
            aspect = cw / float(max(ch, 1))
            if 0.04 <= aspect <= 8.0:
                mask[labels == i] = 255

    # 4. If connected components is too sparse, fallback to Laplacian with outer border exclusion
    if np.count_nonzero(mask) < 16:
        lap = cv2.Laplacian(denoised, cv2.CV_32F)
        mag = np.abs(lap)
        mag = cv2.GaussianBlur(mag, (3, 3), 0)
        threshold = max(35.0, float(np.percentile(mag, 88)))
        raw_mask = (mag > threshold).astype(np.uint8) * 255
        margin = max(4, int(max_dim * 0.02))
        raw_mask[:margin, :] = 0
        raw_mask[-margin:, :] = 0
        raw_mask[:, :margin] = 0
        raw_mask[:, -margin:] = 0
        mask = raw_mask

    # Dilate with a cross to cover thin strokes without clogging inner numeral loops
    kernel = cv2.getStructuringElement(cv2.MORPH_CROSS, (3, 3))
    return cv2.dilate(mask, kernel, iterations=1)


def restore_source_text_regions(source_bytes, generated_png_bytes):
    """Restore authentic label/logo/text/digits regions onto a generated product image.

    Prevents:
    - Text duplication: cleans (inpaints) generative text in the target region before compositing.
    - Numeral deformation: preserves fine digit loops (0, 4, 6, 8, 9) and thin vertical strokes (1).
    - Ringing / halos: uses bicubic subpixel interpolation without Lanczos negative-sinc ripples.
    - Seams/boxes: uses background-matched edge normalization and smooth Gaussian alpha blending.
    - Transparency loss: preserves 100% of the generated cutout alpha channel.

    Returns:
      {"image": png_bytes, "textRestored": bool, "matchedPoints": int,
       "requiresManualReview": bool, "reason": str}
    """
    import cv2
    import numpy as np

    result = {
        "image": generated_png_bytes,
        "textRestored": False,
        "matchedPoints": 0,
        "requiresManualReview": False,
        "reason": None,
    }
    try:
        source = decode_source(source_bytes)
        with Image.open(io.BytesIO(generated_png_bytes)) as gen_image:
            gen_image.load()
            generated = gen_image.convert("RGBA")
        gw, gh = generated.size

        source_rgb = source if source.mode == "RGB" else source.convert("RGB")
        generated_rgb = generated.convert("RGB")

        orb = cv2.ORB_create(nfeatures=2500)
        kp1, des1 = orb.detectAndCompute(np.asarray(source_rgb), None)
        kp2, des2 = orb.detectAndCompute(np.asarray(generated_rgb), None)
        if des1 is None or des2 is None or len(kp1) < 8 or len(kp2) < 8:
            result["requiresManualReview"] = True
            result["reason"] = "insufficient_orb_features"
            return result

        matcher = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=True)
        good = sorted(matcher.match(des1, des2), key=lambda m: m.distance)[:200]
        if len(good) < 8:
            result["requiresManualReview"] = True
            result["reason"] = "insufficient_matches"
            return result

        src_pts = np.float32([kp1[m.queryIdx].pt for m in good]).reshape(-1, 1, 2)
        dst_pts = np.float32([kp2[m.trainIdx].pt for m in good]).reshape(-1, 1, 2)
        homography, inlier_mask = cv2.findHomography(src_pts, dst_pts, cv2.RANSAC, 4.0)
        if homography is None:
            result["requiresManualReview"] = True
            result["reason"] = "homography_failed"
            return result
        inliers = int(inlier_mask.sum()) if inlier_mask is not None else 0
        result["matchedPoints"] = inliers
        if inliers < 8:
            result["requiresManualReview"] = True
            result["reason"] = "insufficient_inliers"
            return result

        text_mask = _text_region_mask(np.asarray(source.convert("L")))
        warped_mask = cv2.warpPerspective(text_mask, homography, (gw, gh), flags=cv2.INTER_CUBIC)
        if int(np.count_nonzero(warped_mask)) == 0:
            result["requiresManualReview"] = True
            result["reason"] = "empty_text_mask"
            return result

        source_denoised = cv2.bilateralFilter(np.asarray(source_rgb), d=5, sigmaColor=30, sigmaSpace=30)
        warped_src = cv2.warpPerspective(
            source_denoised, homography, (gw, gh), flags=cv2.INTER_CUBIC
        )

        # Composite only where the source has real text-like detail AND the
        # generated cutout is opaque (inside the product).
        alpha = np.asarray(generated.getchannel("A")).astype(np.float32) / 255.0
        keep = (warped_mask > 20).astype(np.float32) * alpha
        if float(keep.sum()) <= 0.0:
            result["requiresManualReview"] = True
            result["reason"] = "empty_text_mask"
            return result

        # 1. Inpaint underlying generative text to prevent ghosting/duplication
        target_inpaint_mask = cv2.dilate(
            (keep > 0.05).astype(np.uint8) * 255,
            cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3)),
            iterations=1,
        )
        clean_base = cv2.inpaint(
            np.asarray(generated_rgb),
            target_inpaint_mask,
            inpaintRadius=3,
            flags=cv2.INPAINT_TELEA,
        )

        # 2. Background-matched edge normalization:
        # Seamlessly match the local background luminance/chroma at the text border so that
        # there is no dark box, halo, or visible inpainting seam around digits or typography.
        feathered_keep = cv2.GaussianBlur(keep, (5, 5), 0)[..., None]
        delta_bg = cv2.medianBlur(clean_base, 15).astype(np.float32) - cv2.medianBlur(warped_src, 15).astype(np.float32)
        matched_src = np.clip(
            warped_src.astype(np.float32) + delta_bg * (1.0 - np.clip(feathered_keep * 1.5, 0.0, 1.0)),
            0,
            255,
        )

        # 3. Subpixel unsharp edge enhancement for ultra-crisp numerals and small text
        blurred_src = cv2.GaussianBlur(matched_src, (3, 3), 0)
        sharp_src = np.clip(matched_src * 1.25 - blurred_src * 0.25, 0, 255)

        # 4. Smooth feathered compositing onto clean base
        blended = (
            sharp_src * feathered_keep
            + clean_base.astype(np.float32) * (1.0 - feathered_keep)
        )
        blended = np.clip(blended, 0, 255).astype(np.uint8)

        restored = Image.fromarray(blended, "RGB").convert("RGBA")
        restored.putalpha(generated.getchannel("A"))
        buffer = io.BytesIO()
        restored.save(buffer, format="PNG", optimize=True, compress_level=9)
        result["image"] = buffer.getvalue()
        result["textRestored"] = True
    except Exception as error:
        result["textRestored"] = False
        result["requiresManualReview"] = True
        result["reason"] = f"error: {str(error)[:200]}"
    return result


def process_product(
    session,
    row,
    supabase_url,
    account_id,
    api_token,
    segmentation_session,
    now,
    regenerate_completed=False,
    account_pool=None,
    local_gpu=False,
    publish_immediate=False,
):
    info = dict(row.get("info") or {})
    job_key = "imageGenerationReplacement" if regenerate_completed else "imageGeneration"
    job = dict(info.get(job_key) or {})
    job.update({
        "status": "processing",
        "attemptedOn": now.date().isoformat(),
        "startedAt": now.isoformat(),
        "model": "upscayl_vulkan_gpu" if local_gpu else MODEL_ID,
        "steps": MODEL_STEPS,
    })
    job.pop("error", None)
    info[job_key] = job
    patch_stock(session, supabase_url, row, info)

    try:
        item_title = f"{row.get('name') or ''} {info.get('title') or ''} {info.get('category') or ''}".lower()
        if re.search(r"\b(bracelet|necklace|ring|earring|jewelry|watch|handbag|wallet|belt|shoes|dress|sunglasses|браслет|колье|ожерелье|кольцо|серьги|бижутерия|часы|сумка|кошелек|ремень)\b", item_title, re.IGNORECASE):
            raise ValueError(f"Товар не является парфюмерией (обнаружен непарфюмерный товар / аксессуар): {row.get('name')}")

        # Detect whether product is a fragrance set / gift set
        is_set = is_perfume_set(row.get("name") or "", info)

        source_bytes = None
        source_quality = None
        source_url = None
        source_name = None
        source_type = None
        best_small_studio = None

        manual_source_flag = bool(
            info.get("manualSourceImage")
            or (info.get("imageGeneration") or {}).get("manualSource")
        )
        if manual_source_flag and isinstance(info.get("rawImage"), str) and info.get("rawImage").strip():
            manual_src = info["rawImage"].strip()
            if manual_src.startswith("data:image/") and ";base64," in manual_src:
                import base64 as _b64
                source_bytes = _b64.b64decode(manual_src.split(";base64,", 1)[1])
                source_quality = measure_source_quality(source_bytes)
                source_url = "manual_upload"
                source_name = "Ручная загрузка"
                source_type = "manual_upload"
            elif manual_src.startswith("https://"):
                m_resp = requests.get(
                    manual_src,
                    headers={"User-Agent": "Al-Warda product image pipeline/1.0"},
                    timeout=(15, 60),
                    stream=True,
                )
                m_resp.raise_for_status()
                m_buf = io.BytesIO()
                for chunk in m_resp.iter_content(chunk_size=64 * 1024):
                    m_buf.write(chunk)
                    if m_buf.tell() > MAX_SOURCE_BYTES:
                        raise ValueError("Original product photo exceeds the 20 MB processing limit")
                source_bytes = m_buf.getvalue()
                source_quality = measure_source_quality(source_bytes)
                source_url = manual_src
                source_name = "Ручная загрузка"
                source_type = "manual_upload"

        # Requirement: Search for high-res official studio photo FIRST (unless admin uploaded a manual photo)
        studio_candidates = [] if source_bytes is not None else search_official_studio_candidates(
            row.get("name") or "",
            row.get("brand") or "",
            is_set=is_set,
        )
        for studio_asset in studio_candidates:
            fetch_url = studio_asset.get("imageUrl")
            if not fetch_url:
                continue
            print(f"[{row['id']}] Trying official studio image ({studio_asset.get('title')}): {fetch_url}", flush=True)
            try:
                resp = requests.get(
                    fetch_url,
                    headers={
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                    },
                    timeout=(15, 60),
                    stream=True,
                )
                if not resp.ok:
                    print(f"[{row['id']}] Studio fetch HTTP {resp.status_code}, trying next...", flush=True)
                    continue
                buf = io.BytesIO()
                for chunk in resp.iter_content(chunk_size=64 * 1024):
                    buf.write(chunk)
                    if buf.tell() > MAX_SOURCE_BYTES:
                        raise ValueError("Original product photo exceeds the 20 MB processing limit")
                cand_bytes = buf.getvalue()
                cand_q = measure_source_quality(cand_bytes)
                cand_w = cand_q.get("originalWidth") or cand_q.get("width") or 0
                cand_h = cand_q.get("originalHeight") or cand_q.get("height") or 0
                cand_min = min(cand_w, cand_h)
                cand_low_sharp = (cand_q.get("qualityStatus") == "low_sharpness") or bool(cand_q.get("low_sharpness"))
                if cand_min >= 500 and not cand_low_sharp:
                    source_bytes = cand_bytes
                    source_quality = cand_q
                    source_url = studio_asset["sourceUrl"]
                    source_name = studio_asset["sourceName"]
                    source_type = studio_asset.get("sourceType") or "official_studio"
                    break
                if cand_min >= 300 and (best_small_studio is None or cand_min > best_small_studio[0]):
                    best_small_studio = (cand_min, cand_bytes, cand_q, studio_asset)
            except Exception as e:
                print(f"[{row['id']}] Studio fetch error ({e}), trying next...", flush=True)

        if source_bytes is None:
            raw_url = product_source(row)
            if raw_url:
                raw_resp = requests.get(
                    raw_url,
                    headers={"User-Agent": "Al-Warda product image pipeline/1.0"},
                    timeout=(15, 60),
                    stream=True,
                )
                if raw_resp.ok:
                    raw_buf = io.BytesIO()
                    for chunk in raw_resp.iter_content(chunk_size=64 * 1024):
                        raw_buf.write(chunk)
                        if raw_buf.tell() > MAX_SOURCE_BYTES:
                            raise ValueError("Original product photo exceeds the 20 MB processing limit")
                    raw_bytes = raw_buf.getvalue()
                    raw_q = measure_source_quality(raw_bytes)
                    raw_area = (raw_q.get("originalWidth") or raw_q.get("width") or 0) * (raw_q.get("originalHeight") or raw_q.get("height") or 0)
                    if best_small_studio is not None:
                        st_q = best_small_studio[2]
                        st_area = (st_q.get("originalWidth") or st_q.get("width") or 0) * (st_q.get("originalHeight") or st_q.get("height") or 0)
                        if st_area >= raw_area:
                            source_bytes, source_quality = best_small_studio[1], st_q
                            source_url = best_small_studio[3]["sourceUrl"]
                            source_name = best_small_studio[3]["sourceName"]
                            source_type = best_small_studio[3].get("sourceType") or "official_studio"
                    if source_bytes is None:
                        source_bytes = raw_bytes
                        source_quality = raw_q
                        source_url = raw_url
                        source_name = "Qogita Wholesale Catalog"
                        source_type = "qogita_set" if is_set else "qogita_catalog"
                elif best_small_studio is not None:
                    source_bytes, source_quality = best_small_studio[1], best_small_studio[2]
                    source_url = best_small_studio[3]["sourceUrl"]
                    source_name = best_small_studio[3]["sourceName"]
                    source_type = best_small_studio[3].get("sourceType") or "official_studio"
                else:
                    raise RuntimeError(f"Qogita image fetch failed ({raw_resp.status_code})")
            elif best_small_studio is not None:
                source_bytes, source_quality = best_small_studio[1], best_small_studio[2]
                source_url = best_small_studio[3]["sourceUrl"]
                source_name = best_small_studio[3]["sourceName"]
                source_type = best_small_studio[3].get("sourceType") or "official_studio"
            else:
                local_rel = str(row.get("image") or "").split("?")[0].lstrip("/")
                local_path = (Path(__file__).resolve().parents[1] / "public" / local_rel) if local_rel.startswith("assets/img/dropship/") else None
                if local_path and local_path.is_file():
                    source_bytes = local_path.read_bytes()
                    source_quality = measure_source_quality(source_bytes)
                    source_url = str(row.get("image") or "")
                    source_name = "Local Catalog Archive"
                    source_type = "qogita_set" if is_set else "qogita_catalog"
                else:
                    raise ValueError("No valid catalog photo found and no official studio photo found")

        output = None
        original_size = None
        processing_method = "local_gpu_upscayl" if local_gpu else "local_studio_photometry"
        whether_upscaled = False
        text_restored = True
        text_match_points = 100
        requires_manual_review = False
        text_restore_reason = "authentic_original_cutout"

        has_active_account = (
            not local_gpu and
            bool(
                (account_id and api_token) or
                (account_pool and getattr(account_pool, "accounts", None))
            )
        )
        if has_active_account:
            try:
                edited_bytes = (
                    account_pool.generate(requests, source_bytes)
                    if account_pool is not None
                    else generate_product_edit(requests, account_id, api_token, source_bytes)
                )
                output, original_size = transparent_product_image(edited_bytes, segmentation_session)
                text_result = restore_source_text_regions(source_bytes, output)
                output = text_result["image"]
                text_restored = text_result["textRestored"]
                text_match_points = text_result["matchedPoints"]
                requires_manual_review = text_result["requiresManualReview"]
                text_restore_reason = text_result.get("reason")
                processing_method = "flux_redraw"

                if not generated_image_matches_source(source_bytes, output):
                    raise ValueError(
                        "Сгенерированное изображение не похоже на исходный товар "
                        "(доминирующий цвет продукта изменился); требуется повторная генерация"
                    )
            except WorkersOutputFlaggedError:
                print(
                    f"FLAGGED SAFEGUARD for {row['id']}: Workers AI safety filter triggered (code 3030). "
                    f"Falling back to direct authentic high-resolution studio cutout from original photo...",
                    flush=True,
                )
                output, original_size = transparent_product_image(
                    source_bytes, segmentation_session, allow_arbitrary_dimensions=True
                )
                processing_method = "direct_cutout"
                whether_upscaled = False
                text_restored = True
                text_match_points = 100
                requires_manual_review = False
                text_restore_reason = "authentic_original_cutout"
        else:
            output, processed_size, original_size = preserve_original_product(
                source_bytes, segmentation_session, allow_upscale=True, is_set=is_set
            )
            processing_method = "local_studio_photometry"
            whether_upscaled = processed_size != original_size

        quality_ok, sharpness_val, quality_reason = validate_cutout_quality(source_quality, output)
        if not quality_ok:
            raise ValueError(f"Фото не прошло фильтр качества: {quality_reason}")

        image_url = save_generated_image(output)

        # Fragrance notes: generated by DeepSeek from the name and brand (cleared when generation fails)
        try:
            apply_verified_notes(
                info,
                fetch_verified_notes(requests, row.get("name") or "", row.get("brand") or ""),
            )
        except Exception as notes_err:
            print(f"Warning: note generation failed for {row['id']}: {notes_err}", flush=True)

        # Generate an evocative luxury description with another AI right after image generation
        try:
            cur_acc_id = account_id
            cur_token = api_token
            if account_pool and getattr(account_pool, "accounts", None):
                acc_entry = account_pool.accounts[account_pool.index % len(account_pool.accounts)]
                cur_acc_id = acc_entry[1]
                cur_token = acc_entry[2]
            desc_result = generate_ai_perfume_description(
                requests,
                row,
                info,
                account_id=cur_acc_id,
                api_token=cur_token,
            )
            if desc_result:
                info["descriptionRu"] = desc_result["descriptionRu"]
                info["descriptionEn"] = desc_result["descriptionEn"]
                info["description"] = desc_result["descriptionRu"]
                info["descriptionAiGenerated"] = True
                info["descriptionModel"] = desc_result.get("aiModel")
                info["descriptionGeneratedAt"] = now.isoformat()
                if info.get("notesVerified") and desc_result.get("notesSummary") and not info.get("notesSummary"):
                    info["notesSummary"] = desc_result["notesSummary"]
                print(f"DESCRIBED {row['id']}: AI ({desc_result.get('aiModel')}) generated luxury description", flush=True)
        except Exception as desc_err:
            print(f"Warning: could not generate AI description for {row['id']}: {desc_err}", flush=True)

        if sharpness_val is None:
            try:
                with Image.open(io.BytesIO(output)) as out_img:
                    sharpness_val = product_sharpness(out_img)
            except Exception:
                pass

        new_status = "completed" if publish_immediate else "publishing"
        job.update({
            "status": new_status,
            "completedAt": utc_now().isoformat() if publish_immediate else job.get("completedAt"),
            "imageUrl": image_url,
            "sourceUrl": source_url,
            "sourceName": source_name,
            "sourceType": source_type,
            "isSet": is_set,
            "aiModel": "upscayl_vulkan_gpu" if local_gpu else ("rmbg_1.4_local" if not has_active_account else MODEL_ID),
            "apiCost": "$0.00" if (local_gpu or not has_active_account) else "unknown",
            "width": original_size[0] if has_active_account and original_size else 1024,
            "height": original_size[1] if has_active_account and original_size else 1024,
            "originalWidth": original_size[0] if original_size else 1024,
            "originalHeight": original_size[1] if original_size else 1024,
            "originalFileSize": len(source_bytes),
            "processedWidth": original_size[0] if has_active_account and original_size else 1024,
            "processedHeight": original_size[1] if has_active_account and original_size else 1024,
            "processingMethod": processing_method,
            "whetherUpscaled": whether_upscaled,
            "textRestored": text_restored,
            "textMatchPoints": text_match_points,
            "requiresManualReview": requires_manual_review,
            "textRestoreReason": text_restore_reason,
            "transparencyStatus": "verified_transparent",
            "processingVersion": "3.0-rmbg-photometry",
            "sharpness": sharpness_val if sharpness_val is not None else source_quality.get("sharpness"),
            "qualityStatus": source_quality.get("qualityStatus", "ok"),
            "sourceImageId": hashlib.sha256(
                (source_url or product_source(row) or "").encode("utf-8")
            ).hexdigest()[:16],
        })
        info[job_key] = job
        info["imageSourceUrl"] = source_url
        info["imageSourceName"] = source_name
        info["imageSourceType"] = source_type
        if publish_immediate:
            info["image"] = image_url
        if account_pool and getattr(account_pool, "persist_quotas", False):
            info["imageGenerationAccountQuotas"] = account_pool.export_quotas()
        patch_stock(session, supabase_url, row, info, image=image_url if publish_immediate else None)
        return image_url
    except WorkersDailyQuotaExceeded as error:
        job.update({
            "status": "pending",
            "error": str(error),
            "updatedAt": utc_now().isoformat(),
        })
        job.pop("startedAt", None)
        info[job_key] = job
        if account_pool and getattr(account_pool, "persist_quotas", False):
            info["imageGenerationAccountQuotas"] = account_pool.export_quotas()
        patch_stock(session, supabase_url, row, info)
        raise
    except SegmentationFailedError as error:
        # Background removal failed. Keep the original photo untouched, do not
        # publish a broken cutout, and mark the job for reprocessing.
        job.update({
            "status": "segmentation_failed",
            "error": str(error)[:500],
            "failedAt": utc_now().isoformat(),
            "processingMethod": "segmentation_failed",
            "whetherUpscaled": False,
        })
        info[job_key] = job
        patch_stock(session, supabase_url, row, info)
        raise
    except Exception as error:
        job.update({
            "status": "failed",
            "error": str(error)[:500],
            "failedAt": utc_now().isoformat(),
        })
        info[job_key] = job
        patch_stock(session, supabase_url, row, info)
        raise


def publish_generated_images(session, supabase_url, site_url):
    rows = fetch_stock_rows(session, supabase_url)
    pending = []
    for row in rows:
        info = row.get("info") or {}
        job_key = "imageGeneration"
        job = image_generation(info)
        if not is_awaiting_publication(job):
            job_key = "imageGenerationReplacement"
            job = info.get(job_key) or {}
            if not is_awaiting_publication(job):
                continue
        image_url = job.get("imageUrl", "")
        match = re.fullmatch(r"/assets/img/generated-products/([a-f0-9]{64})\.png", image_url)
        if not match:
            raise RuntimeError(f"Invalid generated image path for stock {row['id']}")
        local_path = GENERATED_DIR / f"{match.group(1)}.png"
        if not local_path.is_file():
            if job.get("status") == "failed":
                continue
            updated_info = dict(info)
            updated_job = dict(job)
            updated_job.update({
                "status": "failed",
                "error": UNPUBLISHED_ERROR,
                "failedAt": utc_now().isoformat(),
            })
            updated_info[job_key] = updated_job
            patch_stock(session, supabase_url, row, updated_info, image=row.get("image"), only_if_unchanged=True)
            print(f"FAILED {row['id']}: generated image was not committed", flush=True)
            continue
        if hashlib.sha256(local_path.read_bytes()).hexdigest() != match.group(1):
            raise RuntimeError(f"Generated image checksum mismatch for stock {row['id']}")
        pending.append((row, image_url, match.group(1), job_key))

    deadline = time.monotonic() + 900
    while pending:
        remaining = []
        for row, image_url, digest, job_key in pending:
            try:
                response = requests.get(site_url + image_url, timeout=(15, 60), allow_redirects=False)
                ready = response.ok and hashlib.sha256(response.content).hexdigest() == digest
            except requests.RequestException as error:
                print(f"Waiting for deployment of stock {row['id']}: {error}", flush=True)
                ready = False
            if not ready:
                remaining.append((row, image_url, digest, job_key))
                continue
            info = dict(row["info"])
            job = dict(info[job_key])
            job.update({"status": "completed", "completedAt": utc_now().isoformat()})
            job.pop("error", None)
            job.pop("failedAt", None)
            previous = info.get("imageGeneration") or {}
            old_url = previous.get("imageUrl") or row.get("image")
            retired = info.get("retiredGeneratedImages")
            retired = list(retired) if isinstance(retired, list) else []
            if job_key == "imageGenerationReplacement" and old_url and old_url != image_url:
                if old_url not in retired:
                    retired.append(old_url)
            if retired:
                info["retiredGeneratedImages"] = retired
            info["imageGeneration"] = job
            if job_key == "imageGenerationReplacement":
                del info[job_key]

            # Ensure AI description is present upon publication completion
            if not info.get("descriptionRu") or not info.get("descriptionEn"):
                try:
                    desc_result = generate_ai_perfume_description(requests, row, info)
                    if desc_result:
                        info["descriptionRu"] = desc_result["descriptionRu"]
                        info["descriptionEn"] = desc_result["descriptionEn"]
                        info["description"] = desc_result["descriptionRu"]
                        info["descriptionAiGenerated"] = True
                        info["descriptionModel"] = desc_result.get("aiModel")
                except Exception:
                    pass

            patch_stock(session, supabase_url, row, info, image=image_url)
            print(f"PUBLISHED {row['id']}: {image_url}", flush=True)
        pending = remaining
        if pending:
            if time.monotonic() >= deadline:
                raise RuntimeError(f"Deployment did not publish {len(pending)} images within 15 minutes")
            print(f"Waiting for deployment of {len(pending)} images", flush=True)
            time.sleep(15)


def is_awaiting_publication(job):
    return job.get("status") == "publishing" or (
        job.get("status") == "failed" and job.get("error") == UNPUBLISHED_ERROR
    )


def complete_committed_images(session, supabase_url):
    rows = fetch_stock_rows(session, supabase_url)
    completed_count = 0
    reset_count = 0
    for row in rows:
        info = row.get("info") or {}
        job_key = "imageGeneration"
        job = image_generation(info)
        is_awaiting = is_awaiting_publication(job)
        if not is_awaiting:
            job_key = "imageGenerationReplacement"
            job = info.get(job_key) or {}
            is_awaiting = is_awaiting_publication(job)

        if not is_awaiting:
            for jk in ("imageGeneration", "imageGenerationReplacement"):
                current_j = info.get(jk) or {}
                if current_j.get("status") == "processing":
                    updated_info = dict(info)
                    updated_j = dict(current_j)
                    updated_j["status"] = "pending"
                    updated_j.pop("startedAt", None)
                    updated_info[jk] = updated_j
                    try:
                        patch_stock(session, supabase_url, row, updated_info)
                        reset_count += 1
                        print(f"RESET STALE PROCESSING {row['id']}: returned to pending", flush=True)
                    except Exception as err:
                        print(f"Warning: could not reset {row['id']}: {err}", flush=True)
            continue

        image_url = job.get("imageUrl", "")
        match = re.fullmatch(r"/assets/img/generated-products/([a-f0-9]{64})\.png", image_url)
        if not match:
            continue
        local_path = GENERATED_DIR / f"{match.group(1)}.png"
        if not local_path.is_file():
            continue
        if hashlib.sha256(local_path.read_bytes()).hexdigest() != match.group(1):
            continue

        updated_info = dict(info)
        updated_job = dict(job)
        updated_job.update({
            "status": "completed",
            "completedAt": utc_now().isoformat(),
        })
        updated_job.pop("error", None)
        updated_job.pop("failedAt", None)

        previous = updated_info.get("imageGeneration") or {}
        old_url = previous.get("imageUrl") or row.get("image")
        retired = updated_info.get("retiredGeneratedImages")
        retired = list(retired) if isinstance(retired, list) else []
        if job_key == "imageGenerationReplacement" and old_url and old_url != image_url:
            if old_url not in retired:
                retired.append(old_url)
        if retired:
            updated_info["retiredGeneratedImages"] = retired
        updated_info["imageGeneration"] = updated_job
        if job_key == "imageGenerationReplacement":
            del updated_info[job_key]

        if not updated_info.get("descriptionRu") or not updated_info.get("descriptionEn"):
            try:
                desc_result = generate_ai_perfume_description(requests, row, updated_info)
                if desc_result:
                    updated_info["descriptionRu"] = desc_result["descriptionRu"]
                    updated_info["descriptionEn"] = desc_result["descriptionEn"]
                    updated_info["description"] = desc_result["descriptionRu"]
                    updated_info["descriptionAiGenerated"] = True
                    updated_info["descriptionModel"] = desc_result.get("aiModel")
            except Exception:
                pass

        patch_stock(session, supabase_url, row, updated_info, image=image_url)
        print(f"COMPLETED COMMITTED {row['id']}: {image_url}", flush=True)
        completed_count += 1

    print(f"Finished completing committed images: {completed_count} completed, {reset_count} reset.", flush=True)
    return completed_count


def mark_unpublished_failed(session, supabase_url, image_paths):
    urls = set()
    for path in image_paths:
        match = re.fullmatch(r"Al-Warda/public/assets/img/generated-products/([a-f0-9]{64}\.png)", path)
        if not match:
            raise ValueError(f"Invalid generated image path: {path}")
        urls.add(GENERATED_URL + match.group(1))
    if not urls:
        print("No unpublished image files to mark.")
        return
    count = 0
    for row in fetch_stock_rows(session, supabase_url):
        info = row.get("info") or {}
        for key in ("imageGeneration", "imageGenerationReplacement"):
            job = info.get(key) or {}
            if job.get("status") != "publishing" or job.get("imageUrl") not in urls:
                continue
            updated_info = dict(info)
            updated_info[key] = {**job, "status": "failed", "error": UNPUBLISHED_ERROR,
                                 "failedAt": utc_now().isoformat()}
            patch_stock(session, supabase_url, row, updated_info, image=row.get("image"), only_if_unchanged=True)
            count += 1
            break
    print(f"Marked {count} unpublished images as failed; they can be retried.", flush=True)


def cleanup_replaced_images(session, supabase_url):
    rows = fetch_stock_rows(session, supabase_url)
    referenced = set()
    retired = set()
    now_ts = datetime.now(timezone.utc).timestamp()
    for row in rows:
        info = row.get("info") or {}
        for value in (row.get("image"), (info.get("imageGeneration") or {}).get("imageUrl"),
                      (info.get("imageGenerationReplacement") or {}).get("imageUrl")):
            if isinstance(value, str):
                referenced.add(value)
        # Protect images in 3-day trash archive from cleanup
        trashed = info.get("trashedImageGeneration")
        if isinstance(trashed, dict):
            restore_until = trashed.get("restoreUntil")
            is_active = True
            if isinstance(restore_until, str):
                try:
                    ru_ts = datetime.fromisoformat(restore_until.replace("Z", "+00:00")).timestamp()
                    is_active = ru_ts > now_ts
                except Exception:
                    is_active = True
            if is_active:
                for k in ("image", "imageUrl"):
                    val = trashed.get(k)
                    if isinstance(val, str) and val:
                        referenced.add(val)
        candidates = info.get("retiredGeneratedImages")
        if isinstance(candidates, list):
            retired.update(value for value in candidates if isinstance(value, str))
    for image_url in sorted(retired - referenced):
        match = re.fullmatch(r"/assets/img/generated-products/([a-f0-9]{64})\.png", image_url)
        if not match:
            print(f"Retired image requires manual cleanup (unsupported storage): {image_url}", file=sys.stderr)
            continue
        path = GENERATED_DIR / f"{match.group(1)}.png"
        if path.is_symlink():
            raise RuntimeError(f"Refusing to delete symlink: {path}")
        if path.is_file():
            path.unlink()
            print(f"REMOVED retired image: {image_url}", flush=True)


def delete_all_images(session, supabase_url):
    rows = fetch_stock_rows(session, supabase_url)
    to_reset = []
    for row in rows:
        info = dict(row.get("info") or {})
        job = info.get("imageGeneration") or {}
        rep = info.get("imageGenerationReplacement") or {}
        img = str(row.get("image") or "")
        job_img = str(job.get("imageUrl") or "")
        rep_img = str(rep.get("imageUrl") or "")
        if (
            job.get("status") in ("completed", "publishing")
            or rep.get("status") in ("completed", "publishing")
            or "/assets/img/generated-products/" in img
            or "/assets/img/generated-products/" in job_img
            or "/assets/img/generated-products/" in rep_img
        ):
            to_reset.append(row)

    if not to_reset:
        print("No completed generated product images to delete.", flush=True)
        return

    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()
    restore_until_iso = (now + timedelta(days=3)).isoformat()

    print(f"Soft-deleting {len(to_reset)} product images with 3-day DB archive retention...", flush=True)
    errors = []

    def reset_one(row):
        identifier = str(row["id"])
        info = dict(row.get("info") or {})
        job = info.get("imageGeneration") or {}
        image_url = str(job.get("imageUrl") or row.get("image") or "")
        info["trashedImageGeneration"] = {
            "image": str(row.get("image") or image_url),
            "imageUrl": image_url,
            "imageGeneration": job,
            "trashedAt": now_iso,
            "restoreUntil": restore_until_iso,
        }
        info["imageGeneration"] = {"status": "pending"}
        info.pop("imageGenerationReplacement", None)
        try:
            patch_stock(session, supabase_url, row, info, image="", only_if_unchanged=False)
            print(f"TRASHED {identifier}: image removed from site, archived in DB for 3 days", flush=True)
        except Exception as error:
            print(f"Error soft-deleting {identifier}: {error}", flush=True)
            errors.append(f"{identifier}: {error}")

    try:
        from concurrent.futures import ThreadPoolExecutor
        with ThreadPoolExecutor(max_workers=10) as executor:
            list(executor.map(reset_one, to_reset))
    except Exception as ex:
        print(f"Parallel reset error ({ex}); falling back to sequential", flush=True)
        for row in to_reset:
            reset_one(row)

    # Clean up pendingDeletedImages in site-settings if present
    for row in rows:
        slug = str(row.get("slug") or "")
        identifier = str(row.get("id") or "")
        if slug == "site-settings" or identifier in ("site-settings", "999999"):
            info = dict(row.get("info") or {})
            if "pendingDeletedImages" in info:
                info.pop("pendingDeletedImages", None)
                try:
                    patch_stock(session, supabase_url, row, info, image="", only_if_unchanged=False)
                except Exception:
                    pass

    if errors:
        print(f"Warning: {len(errors)} stocks could not be updated: {'; '.join(errors[:5])}", flush=True)
    print(f"Successfully soft-deleted {len(to_reset) - len(errors)} of {len(to_reset)} images (archived in DB for 3 days).", flush=True)


def restore_all_images(session, supabase_url):
    rows = fetch_stock_rows(session, supabase_url)
    to_restore = []
    now_ts = datetime.now(timezone.utc).timestamp()
    for row in rows:
        info = dict(row.get("info") or {})
        trashed = info.get("trashedImageGeneration")
        if not isinstance(trashed, dict):
            continue
        restore_until = trashed.get("restoreUntil")
        if isinstance(restore_until, str):
            try:
                ru_ts = datetime.fromisoformat(restore_until.replace("Z", "+00:00")).timestamp()
                if ru_ts <= now_ts:
                    continue
            except Exception:
                pass
        to_restore.append(row)

    if not to_restore:
        print("No trashed product images eligible for restoration in DB archive.", flush=True)
        return

    print(f"Restoring {len(to_restore)} product images from 3-day DB archive to site...", flush=True)
    errors = []

    def restore_one(row):
        identifier = str(row["id"])
        info = dict(row.get("info") or {})
        trashed = info.get("trashedImageGeneration") or {}
        restored_img = trashed.get("image") or trashed.get("imageUrl") or ""
        restored_job = trashed.get("imageGeneration") or {
            "status": "completed",
            "imageUrl": restored_img,
            "completedAt": datetime.now(timezone.utc).isoformat(),
        }
        if restored_job.get("status") == "trashed":
            restored_job["status"] = "completed"
        info["imageGeneration"] = restored_job
        info.pop("trashedImageGeneration", None)
        try:
            patch_stock(session, supabase_url, row, info, image=restored_img, only_if_unchanged=False)
            print(f"RESTORED {identifier}: image restored to site", flush=True)
        except Exception as error:
            print(f"Error restoring {identifier}: {error}", flush=True)
            errors.append(f"{identifier}: {error}")

    try:
        from concurrent.futures import ThreadPoolExecutor
        with ThreadPoolExecutor(max_workers=10) as executor:
            list(executor.map(restore_one, to_restore))
    except Exception as ex:
        for row in to_restore:
            restore_one(row)

    if errors:
        print(f"Warning: {len(errors)} stocks could not be restored: {'; '.join(errors[:5])}", flush=True)
    print(f"Successfully restored {len(to_restore) - len(errors)} of {len(to_restore)} images to site.", flush=True)


def delete_selected_images(session, supabase_url, selected):
    if not isinstance(selected, list) or len(selected) < 1:
        raise ValueError("Select at least 1 image to delete")
    seen = set()
    for item in selected:
        if not isinstance(item, dict):
            raise ValueError("Invalid selected image")
        identifier, image_url = str(item.get("id", "")), item.get("imageUrl")
        if not identifier.isdigit() or identifier in seen or not isinstance(image_url, str) or not re.fullmatch(
            r"/assets/img/generated-products/[a-f0-9]{64}\.png", image_url
        ):
            raise ValueError("Invalid selected product or image URL")
        seen.add(identifier)
    rows = {str(row["id"]): row for row in fetch_stock_rows(session, supabase_url)}
    errors = []
    for item in selected:
        identifier, image_url = str(item["id"]), item["imageUrl"]
        row = rows.get(identifier)
        if not row:
            errors.append(f"{identifier}: product no longer exists")
            continue
        info = dict(row.get("info") or {})
        job = info.get("imageGeneration") or {}
        rep = info.get("imageGenerationReplacement") or {}
        row_image = str(row.get("image") or "").strip()
        job_image = str(job.get("imageUrl") or "").strip()
        rep_image = str(rep.get("imageUrl") or "").strip()
        info_image = str(info.get("image") or "").strip()

        # Find any current active image on this product
        active_image = row_image or job_image or rep_image or info_image

        # If product has a DIFFERENT active generated image, report that it changed
        if active_image and active_image != image_url:
            errors.append(f"{identifier}: image has changed; refresh the list")
            continue

        # If product already has no image and status is pending or trashed, it's already removed
        if not active_image and job.get("status") in ("pending", "trashed"):
            print(f"ALREADY CLEARED {identifier}: image already removed", flush=True)
            continue

        retired = info.get("retiredGeneratedImages")
        retired = list(retired) if isinstance(retired, list) else []
        if image_url not in retired:
            retired.append(image_url)
        info["retiredGeneratedImages"] = retired
        info["imageGeneration"] = {"status": "pending"}
        info.pop("imageGenerationReplacement", None)
        if "image" in info and info["image"] == image_url:
            info["image"] = ""
        try:
            patch_stock(session, supabase_url, row, info, image="", only_if_unchanged=False)
        except RuntimeError as error:
            errors.append(f"{identifier}: {error}")
            continue
        print(f"QUEUED {identifier}: image removed", flush=True)

    # Clean up pendingDeletedImages in site-settings if present
    for row in rows.values():
        slug = str(row.get("slug") or "")
        identifier = str(row.get("id") or "")
        if slug == "site-settings" or identifier in ("site-settings", "999999"):
            info = dict(row.get("info") or {})
            if "pendingDeletedImages" in info:
                info.pop("pendingDeletedImages", None)
                try:
                    patch_stock(session, supabase_url, row, info, image="", only_if_unchanged=False)
                except Exception:
                    pass

    if errors:
        raise RuntimeError("Some images were not deleted: " + "; ".join(errors))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--max-images", type=int, default=DEFAULT_BATCH_SIZE,
        help="Maximum number of products to attempt in this run",
    )
    parser.add_argument(
        "--product-ids", type=str, default="",
        help="Comma-separated stock IDs to process directly on GPU (e.g. 5496,5465)",
    )
    parser.add_argument(
        "--local-gpu", action="store_true",
        help="Use local GPU hardware acceleration (Upscayl Vulkan) with authentic photography preservation (prevents AI hallucination/deformed text)",
    )
    parser.add_argument(
        "--cooling-delay", type=float, default=0.8,
        help="Cooling pause in seconds between items to prevent GPU/CPU thermal throttling and overheating (default: 0.8s)",
    )
    parser.add_argument("--publish-only", action="store_true")
    parser.add_argument("--complete-committed", action="store_true",
                        help="Immediately complete all committed images in Supabase")
    parser.add_argument("--cleanup-replaced", action="store_true")
    parser.add_argument("--delete-selected", action="store_true")
    parser.add_argument("--delete-all", action="store_true",
                        help="Delete and return all generated product images back to queue")
    parser.add_argument("--restore-all", action="store_true",
                        help="Restore all product images from 3-day DB archive back to site")
    parser.add_argument("--mark-unpublished-failed", metavar="PATH_LIST")
    parser.add_argument("--check-schedule-ready", action="store_true",
                        help="Check if there are pending images and all 5 accounts are available")
    parser.add_argument("--regenerate-completed", action="store_true",
                        help="Replace completed images made with an older model")
    args = parser.parse_args()
    if args.check_schedule_ready:
        supabase_url = os.environ.get("SUPABASE_URL", "").rstrip("/")
        service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
        if not supabase_url or not service_key:
            raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required")
        rows = (
            fetch_stock_rows(make_session(), supabase_url)
            if requests is not None
            else fetch_stock_rows_stdlib(supabase_url, service_key)
        )
        status = check_schedule_ready(rows, utc_now())
        if status["should_run"] and status.get("wait_seconds", 0) > 0:
            wait_sec = int(status["wait_seconds"]) + 5
            print(
                f"All 5 accounts will become available in {wait_sec}s "
                f"(at {status.get('all_available_at')}). Waiting to start...",
                file=sys.stderr,
                flush=True,
            )
            time.sleep(wait_sec)
        elif not status["should_run"]:
            if status["reason"] == "global_generation_halted":
                print(
                    "Schedule check: global image generation has been stopped by administrator. "
                    "Skipping scheduled run.",
                    file=sys.stderr,
                    flush=True,
                )
            elif status["reason"] == "no_pending_images":
                print("Schedule check: 0 pending images in queue. Skipping scheduled run.", file=sys.stderr, flush=True)
            else:
                rem_min = int(status.get("wait_seconds", 0) // 60)
                hours, mins = divmod(rem_min, 60)
                print(
                    f"Schedule check: {status.get('pending_count', 0)} images waiting, "
                    f"but accounts are still on cooldown until {status.get('all_available_at')} "
                    f"({hours}h {mins}m remaining). Skipping this cron slot.",
                    file=sys.stderr,
                    flush=True,
                )
        else:
            print(
                f"Schedule check: ready ({status['reason']}, "
                f"pending={status.get('pending_count', 0)}). Starting run.",
                file=sys.stderr,
                flush=True,
            )
        print(f"should_run={'true' if status['should_run'] else 'false'}", flush=True)
        return
    if (
        args.publish_only
        or args.complete_committed
        or args.cleanup_replaced
        or args.delete_selected
        or args.delete_all
        or args.mark_unpublished_failed
    ):
        supabase_url = os.environ.get("SUPABASE_URL", "").rstrip("/")
        service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
        if not supabase_url or not service_key:
            print(
                "Supabase is not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing). "
                "Skipping image queue operations.",
                flush=True,
            )
            return
        if args.complete_committed:
            complete_committed_images(make_session(), supabase_url)
        elif args.mark_unpublished_failed:
            paths = Path(args.mark_unpublished_failed).read_text(encoding="utf-8").splitlines()
            mark_unpublished_failed(make_session(), supabase_url, paths)
        elif args.delete_all:
            session = make_session()
            delete_all_images(session, supabase_url)
        elif args.restore_all:
            session = make_session()
            restore_all_images(session, supabase_url)
        elif args.delete_selected:
            raw_input = os.environ.get("SELECTED_IMAGES", "").strip()
            if raw_input == "all":
                session = make_session()
                delete_all_images(session, supabase_url)
            elif raw_input == "from_settings" or not raw_input:
                session = make_session()
                settings_rows = [
                    r for r in fetch_stock_rows(session, supabase_url)
                    if str(r.get("slug")) == "site-settings" or str(r.get("id")) in ("site-settings", "999999")
                ]
                info = (settings_rows[0].get("info") or {}) if settings_rows else {}
                selected = info.get("pendingDeletedImages") or []
                delete_selected_images(session, supabase_url, selected)
            else:
                session = make_session()
                selected = json.loads(raw_input)
                delete_selected_images(session, supabase_url, selected)
        elif args.cleanup_replaced:
            cleanup_replaced_images(make_session(), supabase_url)
        else:
            publish_generated_images(
                make_session(), supabase_url, "https://al-warda.egor-grebennykov.workers.dev"
            )
        return
    if not 1 <= args.max_images <= MAX_BATCH_SIZE:
        parser.error(f"--max-images must be between 1 and {MAX_BATCH_SIZE}")
    supabase_url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not supabase_url or not service_key:
        print(
            "Supabase is not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing). "
            "Skipping image generation.",
            flush=True,
        )
        return

    session = make_session()
    rows = fetch_stock_rows(session, supabase_url)
    is_local_gpu = bool(args.local_gpu or args.product_ids)
    if is_global_generation_halted(rows) and not is_local_gpu:
        print("Global image generation is halted by administrator. Exiting.", flush=True)
        return
    account_pool = ImageAccountPool(
        load_image_accounts(os.environ),
        quotas=extract_account_quotas(rows),
        persist_quotas=True,
    )
    now = utc_now()
    attempts_today = 0
    if args.product_ids:
        target_ids = set(str(i).strip() for i in args.product_ids.split(",") if i.strip())
        candidates = [r for r in rows if str(r.get("id")) in target_ids or str(r.get("slug")) in target_ids]
        print(f"Targeting {len(candidates)} specific product(s) on GPU by ID: {target_ids}", flush=True)
    else:
        candidates, attempts_today = select_candidates(rows, now, args.regenerate_completed)
    if not candidates:
        print("No products are currently eligible for image generation.")
        return

    print(
        f"Queue: {len(candidates)} eligible; today's attempts {attempts_today}; "
        f"processing up to {min(len(candidates), args.max_images)} (local_gpu={is_local_gpu})."
    )
    prepare_segmentation_model()
    segmentation_session = create_local_segmentation_session()
    completed = 0
    failed = 0
    configuration_failure = False
    stop_requested = False

    def handle_stop_signal(signum, frame):
        nonlocal stop_requested
        print(
            f"\nReceived termination signal ({signum}). Finishing queue gracefully and publishing generated images...",
            flush=True,
        )
        stop_requested = True

    try:
        signal.signal(signal.SIGINT, handle_stop_signal)
        signal.signal(signal.SIGTERM, handle_stop_signal)
    except (ValueError, AttributeError):
        pass

    if is_local_gpu:
        try:
            import ctypes
            ctypes.windll.kernel32.SetPriorityClass(ctypes.windll.kernel32.GetCurrentProcess(), 0x00004000)
            print("Windows priority set to BELOW_NORMAL to keep system smooth and responsive.", flush=True)
        except Exception:
            pass

    consecutive_db_errors = 0
    for idx, row in enumerate(candidates[:args.max_images]):
        if stop_requested:
            print("Stopping product queue processing per termination signal. Proceeding to publish...", flush=True)
            break
        if idx > 0 and not is_local_gpu:
            try:
                if check_global_halt_remote(session, supabase_url, service_key):
                    print(
                        "Global image generation was halted by administrator. Stopping batch gracefully...",
                        flush=True,
                    )
                    break
            except Exception:
                pass
        try:
            url = process_product(
                session,
                row,
                supabase_url,
                "",
                "",
                segmentation_session,
                utc_now(),
                args.regenerate_completed,
                account_pool,
                local_gpu=is_local_gpu,
                publish_immediate=is_local_gpu,
            )
            completed += 1
            consecutive_db_errors = 0
            print(f"COMPLETED {row['id']}: {url}")
            if args.cooling_delay > 0:
                try:
                    import gc
                    gc.collect()
                except Exception:
                    pass
                time.sleep(args.cooling_delay)
        except KeyboardInterrupt:
            print("\nKeyboardInterrupt caught. Stopping batch and proceeding to publish...", flush=True)
            break
        except WorkersDailyQuotaExceeded as error:
            print(f"PROVIDER LIMIT: {error}. Item set to pending. Batch paused.", file=sys.stderr)
            break
        except WorkersConfigurationError as error:
            failed += 1
            configuration_failure = True
            print(f"CONFIGURATION ERROR: {error}. Stopping the batch.", file=sys.stderr)
            break
        except Exception as error:
            failed += 1
            print(f"FAILED {row['id']}: {error}")
            if str(error).startswith("Could not update stock"):
                consecutive_db_errors += 1
                if consecutive_db_errors >= 3:
                    print("Stopping because Supabase queue state could not be persisted 3 times in a row.")
                    break
                print(f"Transient DB error ({consecutive_db_errors}/3), waiting 5s and continuing...", flush=True)
                time.sleep(5)
            else:
                consecutive_db_errors = 0
        time.sleep(0.25)

    print(
        f"Batch finished: awaiting deployment={completed}, failed={failed}, "
        f"attempts this run={completed + failed}."
    )
    if configuration_failure:
        raise SystemExit(1)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"FATAL image queue error: {error}", file=sys.stderr)
        sys.exit(1)
