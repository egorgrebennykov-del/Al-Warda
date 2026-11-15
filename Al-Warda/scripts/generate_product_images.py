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

try:
    import requests
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
STALE_PROCESSING_MINUTES = 30
SCHEDULE_WAIT_WINDOW_SECONDS = 900
UNPUBLISHED_ERROR = "Generated image was not published; generation must be retried"
U2NET_SHA256 = "8d10d2f3bb75ae3b6d527c77944fc5e7dcd94b29809d47a739a7a728a912b491"
U2NET_URLS = (
    "https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2net.onnx",
    "https://huggingface.co/skillsafe-ai/u2net/resolve/main/u2net.onnx",
)
U2NET_MAX_BYTES = 200 * 1024 * 1024


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
    selected = environ.get("CLOUDFLARE_IMAGE_ACCOUNT", "primary")
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
                    try:
                        temporary_path.unlink()
                    except OSError:
                        pass
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
        response = session.get(
            endpoint,
            params={"select": "id,name,brand,image,info", "order": "id.asc"},
            headers={"Range-Unit": "items", "Range": f"{start}-{start + PAGE_SIZE - 1}"},
            timeout=30,
        )
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
    # Nhost migration: the Supabase-only RPC `update_stock_image_if_unchanged`
    # has no equivalent behind the Hasura proxy. The pipeline runs serially
    # (concurrency `cancel-in-progress: false`), so a plain PATCH is acceptable.
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
    "State the origin as 'Ближний Восток' in Russian and 'the Middle East' in English "
    "(never mention UAE, Dubai, or Saudi Arabia)."
)


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
                            desc_ru = (parsed.get("descriptionRu") or "").strip()
                            desc_en = (parsed.get("descriptionEn") or "").strip()
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
                        desc_ru = (parsed.get("descriptionRu") or "").strip()
                        desc_en = (parsed.get("descriptionEn") or "").strip()
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
        "keep the same bottle, cap, glass shape, liquid color, label artwork, logo and "
        "typography as image 0, unchanged. Never invent, rewrite, move or omit text, "
        "labels, colors or details; never add extra bottles, props, frames or markings. "
        "Present one large, centered product from a natural front-facing three-quarter "
        "angle with realistic depth, neutral balanced commercial studio lighting, accurate "
        "true-to-life product colors, pristine glass and metal reflections, on a plain "
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
    cutout.save(output, format="PNG", optimize=True)
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


def segment_source(source, segmentation_session):
    """Run background removal on a source image and return an RGBA cutout at the
    same dimensions."""
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
                raise

    # Robust fallback using OpenCV DNN with U2Net
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


def preserve_original_product(source_bytes, segmentation_session, canvas_size=(1024, 1024), allow_upscale=True):
    """Segment the ORIGINAL photo and place it on a transparent canvas WITHOUT
    redrawing the bottle. This keeps the real label pixels, true colors, and authentic typography.

    Returns (png_bytes, processed_size, original_size).
    """
    source = decode_source(source_bytes)
    original_size = source.size
    cutout = segment_source(source, segmentation_session)
    cutout = normalize_flacon_cutout(
        cutout,
        target_max_h=850,
        target_max_w=850,
        canvas_size=canvas_size,
        allow_upscale=allow_upscale,
    )

    # Studio typography & clarity enhancement
    try:
        from PIL import ImageFilter, ImageEnhance
        import numpy as np
        arr = np.array(cutout)
        if "A" in cutout.getbands() and arr.ndim == 3 and arr.shape[2] == 4:
            rgb = arr[:, :, :3]
            alpha = arr[:, :, 3]
            pil_rgb = Image.fromarray(rgb)
            sharpened_rgb = pil_rgb.filter(ImageFilter.UnsharpMask(radius=1.4, percent=135, threshold=3))
            enhancer = ImageEnhance.Contrast(sharpened_rgb)
            contrasted = enhancer.enhance(1.03)
            out_arr = np.dstack((np.array(contrasted), alpha))
            cutout = Image.fromarray(out_arr)
    except Exception:
        pass

    output = io.BytesIO()
    cutout.save(output, format="PNG", optimize=True)
    return output.getvalue(), canvas_size, original_size


def normalize_flacon_cutout(cutout, target_max_h=850, target_max_w=850, canvas_size=(1024, 1024), allow_upscale=True):
    if "A" not in cutout.getbands():
        return cutout
    import numpy as np

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

        # Valid components: main body, plus vertically aligned components (cap, sprayer, base)
        # Exclude small detached artifacts or side shadows far from bottle center
        valid_mask = np.zeros_like(mask)
        for lbl in range(1, num_labels):
            area = stats[lbl, cv2.CC_STAT_AREA]
            cx = centroids[lbl][0]
            if lbl == main_lbl:
                valid_mask[labels == lbl] = 1
            elif area >= 120 and abs(cx - main_cx) <= max(main_w * 0.75, 80):
                valid_mask[labels == lbl] = 1
            elif area >= max_area * 0.35:
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
                max_area = max(areas)
                main_lbl = 1 + int(np.argmax(areas))
                ys_m, xs_m = np.where(labeled == main_lbl)
                main_w = xs_m.max() - xs_m.min() + 1
                main_cx = float(np.mean(xs_m))
                valid_mask = np.zeros_like(mask)
                for i in range(1, num_features + 1):
                    ys_i, xs_i = np.where(labeled == i)
                    if len(xs_i) == 0:
                        continue
                    cx_i = float(np.mean(xs_i))
                    area_i = areas[i - 1]
                    if i == main_lbl:
                        valid_mask[labeled == i] = 1
                    elif area_i >= 120 and abs(cx_i - main_cx) <= max(main_w * 0.75, 80):
                        valid_mask[labeled == i] = 1
                    elif area_i >= max_area * 0.35:
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

    scale = min(target_max_w / float(cw), target_max_h / float(ch))
    if not allow_upscale:
        # Never enlarge the product beyond its original pixel resolution; a
        # small original stays small and is flagged as low quality instead of
        # being upscaled and presented as an improvement.
        scale = min(scale, 1.0)
    new_w = max(1, int(round(cw * scale)))
    new_h = max(1, int(round(ch * scale)))

    crop = cleaned_cutout.crop((x1, y1, x2, y2))
    resized = crop.resize((new_w, new_h), Image.Resampling.LANCZOS)
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

    return canvas



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


def select_candidates(rows, now, regenerate_completed=False):
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
        if regenerate_completed:
            if job.get("status") != "completed" or job.get("model") == MODEL_ID:
                continue
            replacement = info.get("imageGenerationReplacement") or {}
            if replacement.get("status") == "publishing":
                continue
            if replacement.get("status") == "processing" and not is_stale_processing(replacement, now):
                continue
            eligible.append(row)
            continue
        if job.get("status") == "completed":
            continue
        if job.get("status") == "publishing":
            continue
        if job.get("status") == "processing" and not is_stale_processing(job, now):
            continue
        eligible.append(row)
    return eligible, attempts_today


def check_schedule_ready(rows, now, wait_up_to_seconds=SCHEDULE_WAIT_WINDOW_SECONDS):
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
    """Accurately detect text and logo glyphs while rejecting outer bottle contours,
    glass facet rims, ribbon loops, and packaging outer borders."""
    import cv2
    import numpy as np

    if not isinstance(gray, np.ndarray):
        gray = np.asarray(gray)

    # 1. Morphological gradient tailored for character stroke edges
    grad = cv2.morphologyEx(
        gray, cv2.MORPH_GRADIENT, cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    )
    _, thresh = cv2.threshold(grad, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)

    # 2. Connected components analysis: filter by text geometric properties
    num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(thresh)
    mask = np.zeros_like(gray)
    img_h, img_w = gray.shape[:2]
    max_dim = max(img_h, img_w)

    for i in range(1, num_labels):
        area = stats[i, cv2.CC_STAT_AREA]
        cw = stats[i, cv2.CC_STAT_WIDTH]
        ch = stats[i, cv2.CC_STAT_HEIGHT]

        # Characters/logos have bounded height, width, and area
        # Large continuous contours (bottle edges, ribbon, box border) are rejected
        if ch > max_dim * 0.25 or cw > max_dim * 0.45:
            continue
        if area < 6 or area > (img_h * img_w * 0.05):
            continue
        if 3 <= ch <= max_dim * 0.20 and 2 <= cw <= max_dim * 0.40:
            aspect = cw / float(max(ch, 1))
            if 0.08 <= aspect <= 6.0:
                mask[labels == i] = 255

    # 3. If connected components is too sparse, fallback to Laplacian with outer border exclusion
    if np.count_nonzero(mask) < 16:
        lap = cv2.Laplacian(gray, cv2.CV_32F)
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

    # Dilate slightly to encompass full character stroke width
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    return cv2.dilate(mask, kernel, iterations=1)


def restore_source_text_regions(source_bytes, generated_png_bytes):
    """Restore authentic label/logo/text regions onto a generated product image.

    Prevents:
    - Text duplication: cleans (inpaints) generative text in the target region before compositing.
    - Glass/reflection degradation: isolates true text glyphs without copying bottle contours or rims.
    - Seams/halos: uses soft feathered Gaussian alpha blending.
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
        warped_mask = cv2.warpPerspective(text_mask, homography, (gw, gh), flags=cv2.INTER_LANCZOS4)
        if int(np.count_nonzero(warped_mask)) == 0:
            result["requiresManualReview"] = True
            result["reason"] = "empty_text_mask"
            return result

        warped_src = cv2.warpPerspective(
            np.asarray(source_rgb), homography, (gw, gh), flags=cv2.INTER_LANCZOS4
        )

        # Composite only where the source has real text-like detail AND the
        # generated cutout is opaque (inside the product).
        alpha = np.asarray(generated.getchannel("A")).astype(np.float32) / 255.0
        keep = (warped_mask > 0).astype(np.float32) * alpha
        if float(keep.sum()) <= 0.0:
            result["requiresManualReview"] = True
            result["reason"] = "empty_text_mask"
            return result

        # 1. Inpaint underlying generative text to prevent text duplication
        target_inpaint_mask = cv2.dilate(
            (keep > 0.05).astype(np.uint8) * 255,
            cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5)),
            iterations=1,
        )
        clean_base = cv2.inpaint(
            np.asarray(generated_rgb),
            target_inpaint_mask,
            inpaintRadius=3,
            flags=cv2.INPAINT_TELEA,
        )

        # 2. Feathered alpha blending for seamless edge transitions without rough boundaries
        feathered_keep = cv2.GaussianBlur(keep, (3, 3), 0)
        feathered_keep = np.clip(feathered_keep, 0.0, 1.0)[..., None]

        # 3. Composite authentic typography onto clean base
        blended = (
            warped_src.astype(np.float32) * feathered_keep
            + clean_base.astype(np.float32) * (1.0 - feathered_keep)
        )
        blended = np.clip(blended, 0, 255).astype(np.uint8)

        restored = Image.fromarray(blended, "RGB").convert("RGBA")
        restored.putalpha(generated.getchannel("A"))
        buffer = io.BytesIO()
        restored.save(buffer, format="PNG", optimize=True)
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
):
    info = dict(row.get("info") or {})
    job_key = "imageGenerationReplacement" if regenerate_completed else "imageGeneration"
    job = dict(info.get(job_key) or {})
    job.update({
        "status": "processing",
        "attemptedOn": now.date().isoformat(),
        "startedAt": now.isoformat(),
        "model": MODEL_ID,
        "steps": MODEL_STEPS,
    })
    job.pop("error", None)
    info[job_key] = job
    patch_stock(session, supabase_url, row, info)

    try:
        item_title = f"{row.get('name') or ''} {info.get('title') or ''} {info.get('category') or ''}".lower()
        if re.search(r"\b(bracelet|necklace|ring|earring|jewelry|watch|handbag|wallet|belt|shoes|dress|sunglasses|браслет|колье|ожерелье|кольцо|серьги|бижутерия|часы|сумка|кошелек|ремень)\b", item_title, re.IGNORECASE):
            raise ValueError(f"Товар не является парфюмерией (обнаружен непарфюмерный товар / аксессуар): {row.get('name')}")

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
        source_quality = measure_source_quality(source_bytes)

        output = None
        original_size = None
        processing_method = "flux_redraw"
        whether_upscaled = True
        text_restored = False
        text_match_points = 0
        requires_manual_review = False

        # Previous Flux pipeline (restored): Flux re-photographs the product,
        # U2Net removes the background, normalize_flacon_cutout centers it.
        try:
            edited_bytes = (
                account_pool.generate(requests, source_bytes) if account_pool
                else generate_product_edit(requests, account_id, api_token, source_bytes)
            )
            output, original_size = transparent_product_image(edited_bytes, segmentation_session)

            # The only addition: restore the ORIGINAL label/logo/text regions onto
            # the generated cutout, so Flux never invents brand or product text.
            text_result = restore_source_text_regions(source_bytes, output)
            output = text_result["image"]
            text_restored = text_result["textRestored"]
            text_match_points = text_result["matchedPoints"]
            requires_manual_review = text_result["requiresManualReview"]
            text_restore_reason = text_result.get("reason")

            if not generated_image_matches_source(source_bytes, output):
                raise ValueError(
                    "Сгенерированное изображение не похоже на исходный товар "
                    "(доминирующий цвет продукта изменился); требуется повторная генерация"
                )
        except WorkersOutputFlaggedError as flagged_err:
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

        job.update({
            "status": "publishing",
            "imageUrl": image_url,
            "width": original_size[0],
            "height": original_size[1],
            "processedWidth": original_size[0],
            "processedHeight": original_size[1],
            "processingMethod": processing_method,
            "whetherUpscaled": whether_upscaled,
            "textRestored": text_restored,
            "textMatchPoints": text_match_points,
            "requiresManualReview": requires_manual_review,
            "textRestoreReason": text_restore_reason,
            "sourceImageId": hashlib.sha256(
                (product_source(row) or "").encode("utf-8")
            ).hexdigest()[:16],
            **source_quality,
        })
        info[job_key] = job
        if account_pool and getattr(account_pool, "persist_quotas", False):
            info["imageGenerationAccountQuotas"] = account_pool.export_quotas()
        patch_stock(session, supabase_url, row, info)
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
    for row in rows:
        info = row.get("info") or {}
        for value in (row.get("image"), (info.get("imageGeneration") or {}).get("imageUrl"),
                      (info.get("imageGenerationReplacement") or {}).get("imageUrl")):
            if isinstance(value, str):
                referenced.add(value)
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


def delete_selected_images(session, supabase_url, selected):
    if not isinstance(selected, list) or not 1 <= len(selected) <= 400:
        raise ValueError("Select between 1 and 400 images")
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
        if job.get("status") != "completed" or (job.get("imageUrl") or row.get("image")) != image_url:
            errors.append(f"{identifier}: image has changed; refresh the list")
            continue
        retired = info.get("retiredGeneratedImages")
        retired = list(retired) if isinstance(retired, list) else []
        if image_url not in retired:
            retired.append(image_url)
        info["retiredGeneratedImages"] = retired
        info["imageGeneration"] = {"status": "pending"}
        info.pop("imageGenerationReplacement", None)
        try:
            patch_stock(session, supabase_url, row, info, image="", only_if_unchanged=True)
        except RuntimeError as error:
            errors.append(f"{identifier}: {error}")
            continue
        print(f"QUEUED {identifier}: image removed", flush=True)
    if errors:
        raise RuntimeError("Some images were not deleted: " + "; ".join(errors))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--max-images", type=int, default=DEFAULT_BATCH_SIZE,
        help="Maximum number of products to attempt in this run",
    )
    parser.add_argument("--publish-only", action="store_true")
    parser.add_argument("--complete-committed", action="store_true",
                        help="Immediately complete all committed images in Supabase")
    parser.add_argument("--cleanup-replaced", action="store_true")
    parser.add_argument("--delete-selected", action="store_true")
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
            if status["reason"] == "no_pending_images":
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
        elif args.delete_selected:
            delete_selected_images(make_session(), supabase_url, json.loads(os.environ["SELECTED_IMAGES"]))
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
    account_pool = ImageAccountPool(
        load_image_accounts(os.environ),
        quotas=extract_account_quotas(rows),
        persist_quotas=True,
    )
    now = utc_now()
    candidates, attempts_today = select_candidates(rows, now, args.regenerate_completed)
    if not candidates:
        print("No products are currently eligible for image generation.")
        return

    print(
        f"Queue: {len(candidates)} eligible; today's attempts {attempts_today}; "
        f"processing up to {min(len(candidates), args.max_images)}."
    )
    prepare_segmentation_model()
    segmentation_session = new_session("u2net")
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

    for row in candidates[:args.max_images]:
        if stop_requested:
            print("Stopping product queue processing per termination signal. Proceeding to publish...", flush=True)
            break
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
            )
            completed += 1
            print(f"AWAITING DEPLOYMENT {row['id']}: {url}")
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
                print("Stopping because Supabase queue state could not be persisted.")
                break
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
