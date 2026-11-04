import base64
import importlib.util
import io
import sys
import types
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

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


if __name__ == "__main__":
    unittest.main()
