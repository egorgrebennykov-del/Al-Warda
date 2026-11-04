"""Use Gemini image editing to gently enhance complete original Qogita product photos."""

import argparse
import base64
import io
import os

import requests
from PIL import Image, ImageOps

GEMINI_IMAGE_MODEL = "gemini-nano-banana-2.1"
GEMINI_INTERACTIONS_URL = "https://generativelanguage.googleapis.com/v1beta/interactions"
STUDIO_IMAGE_COMMENT = b"Al-Warda Qogita Gemini original photo edit v3"

EDIT_PROMPT = """
Conservatively enhance this exact original product photograph. This is a faithful
image-to-image restoration, NOT a new product photo, redesign, or scene recreation.
Keep the complete original rectangular frame and exact aspect ratio. Do not crop,
zoom, pan, reframe, remove, replace, extend, or blur the background. Keep every
visible object, including the complete perfume bottle, cap, label, box, props,
shadows, and reflections in exactly the same position, size, shape, and orientation.
Preserve the exact bottle model, silhouette, cap, glass, liquid, label artwork,
brand marks, and all readable text. Do not invent, rewrite, repair, or replace text
or product details. Do not add any objects, graphics, lighting effects, or styling.
Only make restrained photographic improvements to clarity, compression noise,
exposure, and color balance while retaining the original scene and natural colors.
The result should look almost identical to the input photo, only cleaner and clearer.
Return only the edited image.
""".strip()


def load_source(source):
    if source.startswith(("http://", "https://")):
        response = requests.get(
            source,
            headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"},
            timeout=25,
        )
        response.raise_for_status()
        source_bytes = response.content
        if len(source_bytes) < 1000:
            raise ValueError(f"Image response is unexpectedly small: {source}")
    else:
        with open(source, "rb") as source_file:
            source_bytes = source_file.read()

    with Image.open(io.BytesIO(source_bytes)) as image:
        image_format = image.format
        image.verify()
    mime_type = Image.MIME.get(image_format)
    if not mime_type:
        raise ValueError(f"Unsupported source image format: {image_format}")
    return source_bytes, mime_type


def extract_generated_image(response_data):
    image = response_data.get("output_image")
    if isinstance(image, dict) and image.get("data"):
        return image["data"], image.get("mime_type", "image/png")

    for output in response_data.get("outputs", []):
        if isinstance(output, dict) and output.get("type") == "image" and output.get("data"):
            return output["data"], output.get("mime_type", "image/png")

    raise ValueError("Gemini response did not contain an edited image")


def edit_with_gemini(source_bytes, mime_type, api_key):
    if not api_key:
        raise RuntimeError(
            "GEMINI_API_KEY is required for Qogita image-to-image enhancement"
        )

    response = requests.post(
        GEMINI_INTERACTIONS_URL,
        headers={
            "x-goog-api-key": api_key,
            "Content-Type": "application/json",
            "Api-Revision": "2026-05-20",
        },
        json={
            "model": GEMINI_IMAGE_MODEL,
            "input": [
                {"type": "text", "text": EDIT_PROMPT},
                {
                    "type": "image",
                    "data": base64.b64encode(source_bytes).decode("ascii"),
                    "mime_type": mime_type,
                },
            ],
        },
        timeout=180,
    )
    if not response.ok:
        raise RuntimeError(
            f"Gemini image editing failed with HTTP {response.status_code}: "
            f"{response.text[:500]}"
        )

    image_data, _ = extract_generated_image(response.json())
    try:
        return base64.b64decode(image_data, validate=True)
    except (ValueError, TypeError) as error:
        raise ValueError("Gemini returned invalid image data") from error


def process_product_image_from_url_or_file(source, output_jpg_path):
    os.makedirs(os.path.dirname(os.path.abspath(output_jpg_path)), exist_ok=True)
    source_bytes, mime_type = load_source(source)
    generated_bytes = edit_with_gemini(
        source_bytes,
        mime_type,
        os.environ.get("GEMINI_API_KEY") or os.environ.get("VITE_GEMINI_API_KEY", ""),
    )

    with Image.open(io.BytesIO(source_bytes)) as source_image:
        source_size = ImageOps.exif_transpose(source_image).size
    with Image.open(io.BytesIO(generated_bytes)) as generated_image:
        generated = ImageOps.exif_transpose(generated_image).convert("RGB")

    source_ratio = source_size[0] / source_size[1]
    generated_ratio = generated.width / generated.height
    if abs(source_ratio - generated_ratio) / source_ratio > 0.01:
        raise ValueError(
            "Gemini changed the photo aspect ratio; refusing to crop or reframe "
            f"the source ({source_size[0]}x{source_size[1]} -> "
            f"{generated.width}x{generated.height})"
        )

    generated.save(
        output_jpg_path,
        "JPEG",
        quality=96,
        optimize=True,
        comment=STUDIO_IMAGE_COMMENT,
    )
    print(f"SUCCESS: Saved Gemini-edited original photo {output_jpg_path}")
    return output_jpg_path


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True, help="URL or local path to the original Qogita photo")
    parser.add_argument("--output", required=True, help="Path to output JPG")
    args = parser.parse_args()
    process_product_image_from_url_or_file(args.source, args.output)
