#!/usr/bin/env python3
"""Generate free-quota product backgrounds and composite them with original bottles."""

import argparse
import base64
import hashlib
import io
import json
import math
import os
import re
import sys
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote, urlparse

import requests
from PIL import Image, ImageOps
from rembg import new_session, remove

MODEL_ID = "@cf/black-forest-labs/flux-1-schnell"
IMAGE_ENDPOINT = (
    "https://api.cloudflare.com/client/v4/accounts/"
    "{account_id}/ai/run/@cf/black-forest-labs/flux-1-schnell"
)
GENERATED_DIR = Path(__file__).resolve().parents[1] / "public" / "assets" / "img" / "generated-products"
GENERATED_URL = "/assets/img/generated-products/"
MAX_STATIC_IMAGE_BYTES = 25 * 1024 * 1024
MAX_DAILY_IMAGES = 160
FREE_DAILY_NEURONS = 10_000
NEURON_SAFETY_BUDGET = 9_000
MODEL_STEPS = 2
OUTPUT_TILE_COUNT = 4
NEURONS_PER_TILE = 4.8
NEURONS_PER_STEP = 9.6
ESTIMATED_NEURONS_PER_IMAGE = (
    OUTPUT_TILE_COUNT * NEURONS_PER_TILE + MODEL_STEPS * NEURONS_PER_STEP
)
PAGE_SIZE = 500
MAX_SOURCE_BYTES = 20 * 1024 * 1024
MAX_SOURCE_PIXELS = 24_000_000
STALE_PROCESSING_MINUTES = 30
U2NET_SHA256 = "8d10d2f3bb75ae3b6d527c77944fc5e7dcd94b29809d47a739a7a728a912b491"
U2NET_URLS = (
    "https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2net.onnx",
    "https://huggingface.co/skillsafe-ai/u2net/resolve/main/u2net.onnx",
)
U2NET_MAX_BYTES = 200 * 1024 * 1024


class WorkersDailyQuotaExceeded(RuntimeError):
    pass


def file_sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as model:
        for chunk in iter(lambda: model.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def prepare_segmentation_model():
    model_dir = Path(os.path.expanduser(os.environ.get("U2NET_HOME", "~/.u2net")))
    model_path = model_dir / "u2net.onnx"
    if model_path.is_file() and file_sha256(model_path) == U2NET_SHA256:
        os.environ["U2NET_HOME"] = str(model_dir)
        print("Using verified cached U2Net model.", flush=True)
        return model_path

    model_dir.mkdir(parents=True, exist_ok=True)
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
                os.replace(temporary_path, model_path)
                os.environ["U2NET_HOME"] = str(model_dir)
                print("U2Net model downloaded and verified.", flush=True)
                return model_path
            except (requests.RequestException, OSError, ValueError) as error:
                failures.append(f"{url}: {error}")
                print(f"U2Net download failed: {error}", file=sys.stderr, flush=True)
            finally:
                if temporary_path is not None:
                    temporary_path.unlink(missing_ok=True)
        if attempt < 2:
            time.sleep(2 ** attempt * 5)
    raise RuntimeError("Could not download verified U2Net model after retries: " + "; ".join(failures))


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
    parsed = urlparse(source)
    if parsed.scheme != "https" or not parsed.hostname or not parsed.hostname.endswith(".qogita.com"):
        return None
    if re.search(r"no[-_]?image|not[_-]?found|missing|46e86f1d826c199f04588f35f1fd8afe|c1b79cffa1a5fa8aab226414b9e4a063", source, re.I):
        return None
    return source


def make_session():
    session = requests.Session()
    session.headers.update({
        "apikey": os.environ["SUPABASE_SERVICE_ROLE_KEY"],
        "Authorization": f"Bearer {os.environ['SUPABASE_SERVICE_ROLE_KEY']}",
    })
    return session


def fetch_stock_rows(session, supabase_url):
    rows = []
    start = 0
    while True:
        response = session.get(
            f"{supabase_url}/rest/v1/stocks",
            params={"select": "id,name,brand,image,info", "order": "id.asc"},
            headers={"Range-Unit": "items", "Range": f"{start}-{start + PAGE_SIZE - 1}"},
            timeout=30,
        )
        if not response.ok:
            raise RuntimeError(
                f"Could not read Supabase stocks ({response.status_code}): "
                f"{response.text[:400]}"
            )
        page = response.json()
        if not isinstance(page, list):
            raise RuntimeError("Supabase stocks response was not a list")
        rows.extend(page)
        if len(page) < PAGE_SIZE:
            break
        start += PAGE_SIZE
    return rows


def patch_stock(session, supabase_url, row, info, image=None):
    fields = {"info": info}
    if image is not None:
        fields["image"] = image
    response = session.patch(
        f"{supabase_url}/rest/v1/stocks",
        params={"id": f"eq.{row['id']}"},
        headers={"Prefer": "return=minimal"},
        json=fields,
        timeout=30,
    )
    if not response.ok:
        raise RuntimeError(
            f"Could not update stock {row['id']} ({response.status_code}): "
            f"{response.text[:400]}"
        )


def generate_background(session, account_id, api_token, prompt):
    response = session.post(
        IMAGE_ENDPOINT.format(account_id=quote(account_id, safe="")),
        headers={"Authorization": f"Bearer {api_token}"},
        json={"prompt": prompt, "steps": MODEL_STEPS},
        timeout=(15, 180),
    )
    error_details = response.text[:400] if not response.ok else ""
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
            "Cloudflare Workers AI daily quota is exhausted; stopping until the UTC daily reset"
        )
    if not response.ok:
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


def build_background_prompt():
    return (
        "A premium luxury perfume product photography background only, no product "
        "and no bottle. Deep warm charcoal and dark espresso studio backdrop with "
        "subtle soft amber light gradients, refined understated gold highlights "
        "near the distant edges, elegant matte stone surface, natural soft shadows, "
        "photorealistic commercial studio lighting, clean uncluttered composition, "
        "large completely empty central area reserved for placing a real product, "
        "no text, no letters, no logos, no packaging, no objects."
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
    result.save(output, format="PNG", optimize=True)
    return output.getvalue(), original_size


def save_generated_image(image_bytes):
    if len(image_bytes) > MAX_STATIC_IMAGE_BYTES:
        raise ValueError("Generated image exceeds the Cloudflare static asset size limit")
    digest = hashlib.sha256(image_bytes).hexdigest()
    GENERATED_DIR.mkdir(parents=True, exist_ok=True)
    path = GENERATED_DIR / f"{digest}.png"
    path.write_bytes(image_bytes)
    return f"{GENERATED_URL}{digest}.png"


def is_stale_processing(job, now):
    if job.get("status") != "processing":
        return False
    started_at = job.get("startedAt")
    if not started_at:
        return True
    try:
        started = datetime.fromisoformat(started_at.replace("Z", "+00:00"))
    except ValueError:
        return True
    return (now - started).total_seconds() >= STALE_PROCESSING_MINUTES * 60


def select_candidates(rows, now):
    utc_day = now.date().isoformat()
    eligible = []
    attempts_today = 0
    for row in rows:
        if not product_source(row):
            continue
        info = row.get("info") or {}
        job = image_generation(info)
        if job.get("attemptedOn") == utc_day:
            attempts_today += 1
        if job.get("status") == "completed":
            continue
        if job.get("status") == "publishing":
            continue
        if job.get("status") == "processing" and not is_stale_processing(job, now):
            continue
        if job.get("attemptedOn") == utc_day:
            continue
        eligible.append(row)
    return eligible, attempts_today


def process_product(
    session,
    row,
    supabase_url,
    account_id,
    api_token,
    segmentation_session,
    now,
):
    info = dict(row.get("info") or {})
    job = dict(image_generation(info))
    job.update({
        "status": "processing",
        "attemptedOn": now.date().isoformat(),
        "startedAt": now.isoformat(),
        "model": MODEL_ID,
        "estimatedNeurons": ESTIMATED_NEURONS_PER_IMAGE,
        "steps": MODEL_STEPS,
    })
    job.pop("error", None)
    info["imageGeneration"] = job
    patch_stock(session, supabase_url, row, info)

    try:
        source_response = requests.get(
            product_source(row),
            headers={"User-Agent": "Al-Warda product image pipeline/1.0"},
            timeout=(15, 60),
            stream=True,
        )
        if not source_response.ok:
            raise RuntimeError(
                f"Qogita image fetch failed ({source_response.status_code})"
            )
        source_buffer = io.BytesIO()
        for chunk in source_response.iter_content(chunk_size=64 * 1024):
            source_buffer.write(chunk)
            if source_buffer.tell() > MAX_SOURCE_BYTES:
                raise ValueError("Original product photo exceeds the 20 MB processing limit")
        source_bytes = source_buffer.getvalue()
        background_bytes = generate_background(
            requests, account_id, api_token, build_background_prompt()
        )
        composite_bytes, original_size = composite_original_product(
            source_bytes, background_bytes, segmentation_session
        )

        image_url = save_generated_image(composite_bytes)

        job.update({
            "status": "publishing",
            "imageUrl": image_url,
            "width": original_size[0],
            "height": original_size[1],
        })
        info["imageGeneration"] = job
        patch_stock(session, supabase_url, row, info)
        return image_url
    except WorkersDailyQuotaExceeded as error:
        job.update({"status": "failed", "error": str(error), "failedAt": utc_now().isoformat()})
        info["imageGeneration"] = job
        patch_stock(session, supabase_url, row, info)
        raise
    except Exception as error:
        job.update({
            "status": "failed",
            "error": str(error)[:500],
            "failedAt": utc_now().isoformat(),
        })
        info["imageGeneration"] = job
        patch_stock(session, supabase_url, row, info)
        raise


def publish_generated_images(session, supabase_url, site_url):
    rows = fetch_stock_rows(session, supabase_url)
    pending = []
    for row in rows:
        info = row.get("info") or {}
        job = image_generation(info)
        if job.get("status") != "publishing":
            continue
        image_url = job.get("imageUrl", "")
        match = re.fullmatch(r"/assets/img/generated-products/([a-f0-9]{64})\.png", image_url)
        if not match:
            raise RuntimeError(f"Invalid generated image path for stock {row['id']}")
        local_path = GENERATED_DIR / f"{match.group(1)}.png"
        if not local_path.is_file():
            updated_info = dict(info)
            updated_job = dict(job)
            updated_job.update({
                "status": "failed",
                "error": "Generated image was not committed; generation must be retried",
                "failedAt": utc_now().isoformat(),
            })
            updated_info["imageGeneration"] = updated_job
            patch_stock(session, supabase_url, row, updated_info)
            print(f"FAILED {row['id']}: generated image was not committed", flush=True)
            continue
        if hashlib.sha256(local_path.read_bytes()).hexdigest() != match.group(1):
            raise RuntimeError(f"Generated image checksum mismatch for stock {row['id']}")
        pending.append((row, image_url, match.group(1)))

    deadline = time.monotonic() + 900
    while pending:
        remaining = []
        for row, image_url, digest in pending:
            try:
                response = requests.get(site_url + image_url, timeout=(15, 60), allow_redirects=False)
                ready = response.ok and hashlib.sha256(response.content).hexdigest() == digest
            except requests.RequestException as error:
                print(f"Waiting for deployment of stock {row['id']}: {error}", flush=True)
                ready = False
            if not ready:
                remaining.append((row, image_url, digest))
                continue
            info = dict(row["info"])
            job = dict(image_generation(info))
            job.update({"status": "completed", "completedAt": utc_now().isoformat()})
            info["imageGeneration"] = job
            patch_stock(session, supabase_url, row, info, image=image_url)
            print(f"PUBLISHED {row['id']}: {image_url}", flush=True)
        pending = remaining
        if pending:
            if time.monotonic() >= deadline:
                raise RuntimeError(f"Deployment did not publish {len(pending)} images within 15 minutes")
            print(f"Waiting for deployment of {len(pending)} images", flush=True)
            time.sleep(15)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--max-images", type=int, default=MAX_DAILY_IMAGES)
    parser.add_argument("--publish-only", action="store_true")
    args = parser.parse_args()
    if args.publish_only:
        supabase_url = os.environ.get("SUPABASE_URL", "").rstrip("/")
        if not supabase_url or not os.environ.get("SUPABASE_SERVICE_ROLE_KEY"):
            raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required")
        publish_generated_images(
            make_session(), supabase_url, "https://al-warda.egor-grebennykov.workers.dev"
        )
        return
    if os.environ.get("CLOUDFLARE_WORKERS_AI_FREE_PLAN_CONFIRMED") != "true":
        raise RuntimeError(
            "Set CLOUDFLARE_WORKERS_AI_FREE_PLAN_CONFIRMED=true only after confirming "
            "that the Cloudflare account is on the Free plan"
        )
    if NEURON_SAFETY_BUDGET > FREE_DAILY_NEURONS:
        raise RuntimeError("The configured Neurons safety budget exceeds the Workers AI free quota")
    if not 1 <= args.max_images <= MAX_DAILY_IMAGES:
        parser.error(f"--max-images must be between 1 and {MAX_DAILY_IMAGES}")
    if ESTIMATED_NEURONS_PER_IMAGE * args.max_images > NEURON_SAFETY_BUDGET:
        raise RuntimeError("Configured image limit exceeds the free Neurons safety budget")

    supabase_url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    account_id = os.environ.get("CLOUDFLARE_ACCOUNT_ID", "")
    api_token = os.environ.get("CLOUDFLARE_API_TOKEN", "")
    missing = [
        name for name, value in (
            ("SUPABASE_URL", supabase_url),
            ("SUPABASE_SERVICE_ROLE_KEY", service_key),
            ("CLOUDFLARE_ACCOUNT_ID", account_id),
            ("CLOUDFLARE_API_TOKEN", api_token),
        ) if not value
    ]
    if missing:
        raise RuntimeError(f"Missing server-side environment variables: {', '.join(missing)}")

    session = make_session()
    rows = fetch_stock_rows(session, supabase_url)
    now = utc_now()
    candidates, attempts_today = select_candidates(rows, now)
    used_neurons = attempts_today * ESTIMATED_NEURONS_PER_IMAGE
    remaining_images = min(
        args.max_images - attempts_today,
        math.floor((NEURON_SAFETY_BUDGET - used_neurons) / ESTIMATED_NEURONS_PER_IMAGE),
    )
    if remaining_images <= 0:
        print(
            f"Daily free quota reached: {attempts_today}/{args.max_images} images, "
            f"approximately {used_neurons:.1f}/{NEURON_SAFETY_BUDGET} Neurons used. "
            "The queue will resume after 00:00 UTC."
        )
        return
    if not candidates:
        print("No products are currently eligible for image generation.")
        return

    print(
        f"Queue: {len(candidates)} eligible; today's attempts {attempts_today}/"
        f"{args.max_images}; estimated Neurons {used_neurons:.1f}/"
        f"{NEURON_SAFETY_BUDGET}; processing up to {min(len(candidates), remaining_images)}."
    )
    prepare_segmentation_model()
    segmentation_session = new_session("u2net")
    completed = 0
    failed = 0
    for row in candidates[:remaining_images]:
        try:
            url = process_product(
                session,
                row,
                supabase_url,
                account_id,
                api_token,
                segmentation_session,
                utc_now(),
            )
            completed += 1
            print(f"AWAITING DEPLOYMENT {row['id']}: {url}")
        except WorkersDailyQuotaExceeded as error:
            failed += 1
            print(f"DAILY QUOTA: {error}. Stopping until 00:00 UTC.")
            break
        except Exception as error:
            failed += 1
            print(f"FAILED {row['id']}: {error}")
            if str(error).startswith("Could not update stock"):
                print("Stopping because Supabase queue state could not be persisted.")
                break
        time.sleep(0.25)

    print(
        f"Batch finished: awaiting deployment={completed}, failed={failed}, "
        f"attempted_today<={attempts_today + completed + failed}/{args.max_images}."
    )


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"FATAL image queue error: {error}", file=sys.stderr)
        sys.exit(1)
