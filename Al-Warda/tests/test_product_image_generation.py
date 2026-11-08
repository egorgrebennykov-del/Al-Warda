import base64
import importlib.util
import io
import hashlib
import os
import sys
import tempfile
import types
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

from PIL import Image


rembg_stub = types.ModuleType("rembg")
rembg_stub.new_session = lambda *_args, **_kwargs: object()
rembg_stub.remove = lambda image, **_kwargs: image
sys.modules["rembg"] = rembg_stub

SCRIPT_PATH = Path(__file__).parents[1] / "scripts" / "generate_product_images.py"
spec = importlib.util.spec_from_file_location("product_image_generation", SCRIPT_PATH)
queue = importlib.util.module_from_spec(spec)
spec.loader.exec_module(queue)


def image_bytes(image, format_name="PNG"):
    output = io.BytesIO()
    image.save(output, format=format_name)
    return output.getvalue()


class ProductImageGenerationTests(unittest.TestCase):
    def test_segmentation_model_uses_verified_cache(self):
        data = b"known model"
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "u2net.onnx"
            path.write_bytes(data)
            with patch.dict(os.environ, {"U2NET_HOME": temp_dir}), \
                 patch.object(queue, "U2NET_SHA256", hashlib.sha256(data).hexdigest()), \
                 patch.object(queue.requests, "get") as get:
                self.assertEqual(queue.prepare_segmentation_model(), path)
                get.assert_not_called()

    def test_segmentation_model_falls_back_after_timeout_and_verifies_bytes(self):
        data = b"known model"

        class FakeResponse:
            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

            def raise_for_status(self):
                pass

            def iter_content(self, chunk_size):
                self.chunk_size = chunk_size
                return iter([data])

        with tempfile.TemporaryDirectory() as temp_dir:
            with patch.dict(os.environ, {"U2NET_HOME": temp_dir}), \
                 patch.object(queue, "U2NET_SHA256", hashlib.sha256(data).hexdigest()), \
                 patch.object(queue.requests, "get", side_effect=[queue.requests.Timeout("timeout"), FakeResponse()]) as get:
                path = queue.prepare_segmentation_model()
                self.assertEqual(path.read_bytes(), data)
                self.assertEqual(get.call_count, 2)
                self.assertEqual(get.call_args_list[1].args[0], queue.U2NET_URLS[1])
                self.assertEqual(list(Path(temp_dir).glob("*.tmp")), [])

    def test_segmentation_model_rejects_bad_downloads_without_replacing_cache(self):
        class FakeResponse:
            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

            def raise_for_status(self):
                pass

            def iter_content(self, chunk_size):
                return iter([b"wrong model"])

        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "u2net.onnx"
            path.write_bytes(b"old invalid model")
            with patch.dict(os.environ, {"U2NET_HOME": temp_dir}), \
                 patch.object(queue.requests, "get", side_effect=lambda *_args, **_kwargs: FakeResponse()) as get, \
                 patch.object(queue.time, "sleep") as sleep:
                with self.assertRaisesRegex(RuntimeError, "checksum mismatch"):
                    queue.prepare_segmentation_model()
                self.assertEqual(get.call_count, 6)
                self.assertEqual(sleep.call_count, 2)
                self.assertEqual(path.read_bytes(), b"old invalid model")
                self.assertEqual(list(Path(temp_dir).glob("*.tmp")), [])

    def test_composite_preserves_source_bottle_pixels_and_canvas(self):
        source = Image.new("RGB", (4, 3), (220, 20, 20))
        source.putpixel((1, 1), (12, 180, 90))
        source_bytes = image_bytes(source)

        mask = Image.new("RGBA", source.size, (0, 0, 0, 0))
        mask.putpixel((1, 1), (255, 255, 255, 255))
        queue.remove = lambda *_args, **_kwargs: mask

        background = Image.new("RGB", (2, 2), (25, 45, 205))
        output, dimensions = queue.composite_original_product(
            source_bytes,
            image_bytes(background),
            object(),
        )

        with Image.open(io.BytesIO(output)) as result:
            self.assertEqual(result.size, source.size)
            self.assertEqual(dimensions, source.size)
            self.assertEqual(result.getpixel((1, 1)), (12, 180, 90, 255))
            self.assertEqual(result.getpixel((0, 0)), (25, 45, 205, 255))

    def test_candidate_selection_excludes_completed_and_already_attempted_items(self):
        today = datetime(2026, 1, 2, 12, 0, tzinfo=timezone.utc)
        old = (today - timedelta(days=1)).isoformat()
        recent = today.isoformat()
        rows = [
            {"id": 1, "info": {"rawImage": "https://img.qogita.com/1.jpg"}},
            {"id": 2, "info": {"rawImage": "https://img.qogita.com/2.jpg", "imageGeneration": {"status": "completed"}}},
            {"id": 3, "info": {"rawImage": "https://img.qogita.com/3.jpg", "imageGeneration": {"status": "failed", "attemptedOn": "2026-01-02"}}},
            {"id": 4, "info": {"rawImage": "https://img.qogita.com/4.jpg", "imageGeneration": {"status": "failed", "attemptedOn": "2026-01-01"}}},
            {"id": 5, "info": {"rawImage": "https://img.qogita.com/5.jpg", "imageGeneration": {"status": "processing", "startedAt": recent}}},
            {"id": 6, "info": {"rawImage": "https://img.qogita.com/6.jpg", "imageGeneration": {"status": "processing", "startedAt": old}}},
        ]

        candidates, attempted_today = queue.select_candidates(rows, today)

        self.assertEqual([row["id"] for row in candidates], [1, 4, 6])
        self.assertEqual(attempted_today, 1)

    def test_cloudflare_request_uses_flux_rest_endpoint_and_steps(self):
        class FakeResponse:
            status_code = 200
            ok = True

            def json(self):
                return {"result": {"image": base64.b64encode(b"generated-background").decode("ascii")}}

        class FakeSession:
            def post(self, url, **kwargs):
                self.url = url
                self.kwargs = kwargs
                return FakeResponse()

        session = FakeSession()
        result = queue.generate_background(session, "account-123", "test-token", "empty backdrop")

        self.assertEqual(result, b"generated-background")
        self.assertEqual(
            session.url,
            "https://api.cloudflare.com/client/v4/accounts/account-123/ai/run/@cf/black-forest-labs/flux-1-schnell",
        )
        self.assertEqual(session.kwargs["json"], {"prompt": "empty backdrop", "steps": 2})

    def test_cloudflare_daily_quota_stops_generation(self):
        class FakeResponse:
            status_code = 429
            ok = False
            text = "Daily Workers AI quota exceeded"

        class FakeSession:
            def post(self, *_args, **_kwargs):
                return FakeResponse()

        with self.assertRaises(queue.WorkersDailyQuotaExceeded):
            queue.generate_background(FakeSession(), "account-123", "test-token", "empty backdrop")

    def test_invalid_non_qogita_sources_are_not_queued(self):
        self.assertIsNone(queue.product_source({"info": {"rawImage": "https://example.com/image.jpg"}}))
        self.assertIsNone(queue.product_source({"info": {"rawImage": "https://img.qogita.com/no-image.jpg"}}))

    def test_publishing_requires_matching_deployed_content(self):
        image = b"generated-image"
        digest = hashlib.sha256(image).hexdigest()
        image_url = f"/assets/img/generated-products/{digest}.png"
        row = {
            "id": 9,
            "info": {"imageGeneration": {"status": "publishing", "imageUrl": image_url}},
        }
        response = types.SimpleNamespace(ok=True, content=image)
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir)
            (path / f"{digest}.png").write_bytes(image)
            with patch.object(queue, "GENERATED_DIR", path), \
                 patch.object(queue, "fetch_stock_rows", return_value=[row]), \
                 patch.object(queue.requests, "get", return_value=response), \
                 patch.object(queue, "patch_stock") as update:
                queue.publish_generated_images(object(), "https://db.example", "https://site.example")
            self.assertEqual(update.call_args.args[3]["imageGeneration"]["status"], "completed")
            self.assertEqual(update.call_args.kwargs["image"], image_url)

    def test_publishing_missing_image_marks_failed(self):
        digest = "a" * 64
        row = {
            "id": 10,
            "info": {"imageGeneration": {
                "status": "publishing",
                "imageUrl": f"/assets/img/generated-products/{digest}.png",
            }},
        }
        with tempfile.TemporaryDirectory() as temp_dir:
            with patch.object(queue, "GENERATED_DIR", Path(temp_dir)), \
                 patch.object(queue, "fetch_stock_rows", return_value=[row]), \
                 patch.object(queue, "patch_stock") as update:
                queue.publish_generated_images(object(), "https://db.example", "https://site.example")
            self.assertEqual(update.call_args.args[3]["imageGeneration"]["status"], "failed")

    def test_publishing_does_not_complete_if_deployed_bytes_differ(self):
        image = b"expected"
        digest = hashlib.sha256(image).hexdigest()
        row = {
            "id": 11,
            "info": {"imageGeneration": {
                "status": "publishing",
                "imageUrl": f"/assets/img/generated-products/{digest}.png",
            }},
        }
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir)
            (path / f"{digest}.png").write_bytes(image)
            with patch.object(queue, "GENERATED_DIR", path), \
                 patch.object(queue, "fetch_stock_rows", return_value=[row]), \
                 patch.object(queue.requests, "get", return_value=types.SimpleNamespace(ok=True, content=b"wrong")), \
                 patch.object(queue.time, "monotonic", side_effect=[0, 901]), \
                 patch.object(queue, "patch_stock") as update:
                with self.assertRaisesRegex(RuntimeError, "Deployment did not publish"):
                    queue.publish_generated_images(object(), "https://db.example", "https://site.example")
            update.assert_not_called()


if __name__ == "__main__":
    unittest.main()
