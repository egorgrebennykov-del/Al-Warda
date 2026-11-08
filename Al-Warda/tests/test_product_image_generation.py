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

    def test_candidate_selection_excludes_completed_and_active_items(self):
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

        self.assertEqual([row["id"] for row in candidates], [1, 3, 4, 6])
        self.assertEqual(attempted_today, 1)

    def test_cloudflare_request_uses_reference_and_flux_edit_endpoint(self):
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
        result = queue.generate_product_edit(
            session, "account-123", "test-token", image_bytes(Image.new("RGB", (800, 600)))
        )

        self.assertEqual(result, b"generated-background")
        self.assertEqual(
            session.url,
            "https://api.cloudflare.com/client/v4/accounts/account-123/ai/run/@cf/black-forest-labs/flux-2-klein-4b",
        )
        self.assertEqual(session.kwargs["data"]["width"], "1024")
        self.assertIn("product reference", session.kwargs["data"]["prompt"])
        reference = session.kwargs["files"]["input_image_0"]
        with Image.open(io.BytesIO(reference[1])) as image:
            self.assertLess(image.width, 512)
            self.assertLess(image.height, 512)

    def test_cloudflare_daily_quota_stops_generation(self):
        class FakeResponse:
            status_code = 429
            ok = False
            text = "Daily Workers AI quota exceeded"

        class FakeSession:
            def post(self, *_args, **_kwargs):
                return FakeResponse()

        with self.assertRaises(queue.WorkersDailyQuotaExceeded):
            queue.generate_product_edit(
                FakeSession(), "account-123", "test-token", image_bytes(Image.new("RGB", (20, 20)))
            )

    def test_cloudflare_authorization_error_stops_batch(self):
        response = types.SimpleNamespace(status_code=401, ok=False, text="Unauthorized")
        session = types.SimpleNamespace(post=lambda *_args, **_kwargs: response)
        with self.assertRaises(queue.WorkersConfigurationError):
            queue.generate_product_edit(
                session, "account-123", "test-token", image_bytes(Image.new("RGB", (20, 20)))
            )

    def test_product_edit_is_saved_as_1024_png_and_awaits_publication(self):
        source = image_bytes(Image.new("RGB", (100, 100), "red"))
        result = image_bytes(Image.new("RGB", (1024, 1024), "blue"), "JPEG")
        cutout = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
        cutout.paste((20, 40, 200, 255), (300, 200, 724, 850))
        response = types.SimpleNamespace(ok=True, iter_content=lambda **_kwargs: iter([source]))
        row = {"id": 8, "info": {"rawImage": "https://img.qogita.com/photo.jpg"}}
        now = datetime(2026, 1, 2, tzinfo=timezone.utc)
        with patch.object(queue.requests, "get", return_value=response), \
             patch.object(queue, "generate_product_edit", return_value=result) as edit, \
             patch.object(queue, "remove", return_value=cutout) as remove_background, \
             patch.object(queue, "save_generated_image", return_value="/assets/img/generated-products/result.png") as save, \
             patch.object(queue, "patch_stock") as update:
            queue.process_product(object(), row, "https://db.example", "account", "token", "session", now)
        self.assertEqual(edit.call_args.args[-1], source)
        self.assertEqual(remove_background.call_args.kwargs["session"], "session")
        with Image.open(io.BytesIO(save.call_args.args[0])) as saved:
            self.assertEqual(saved.format, "PNG")
            self.assertEqual(saved.size, (1024, 1024))
            self.assertEqual(saved.mode, "RGBA")
            self.assertEqual(saved.getpixel((0, 0))[3], 0)
            self.assertEqual(saved.getpixel((512, 512)), (20, 40, 200, 255))
        job = update.call_args.args[3]["imageGeneration"]
        self.assertEqual(job["status"], "publishing")
        self.assertEqual(job["model"], queue.MODEL_ID)
        self.assertEqual(job["steps"], 4)

    def test_rejects_unexpected_edit_dimensions(self):
        source = image_bytes(Image.new("RGB", (20, 20)))
        response = types.SimpleNamespace(ok=True, iter_content=lambda **_kwargs: iter([source]))
        row = {"id": 8, "info": {"rawImage": "https://img.qogita.com/photo.jpg"}}
        with patch.object(queue.requests, "get", return_value=response), \
             patch.object(queue, "generate_product_edit", return_value=source), \
             patch.object(queue, "patch_stock") as update, \
             patch.object(queue, "save_generated_image") as save:
            with self.assertRaisesRegex(ValueError, "Unexpected generated image dimensions"):
                queue.process_product(object(), row, "https://db.example", "account", "token", None, datetime.now(timezone.utc))
        save.assert_not_called()
        self.assertEqual(update.call_args.args[3]["imageGeneration"]["status"], "failed")

    def test_segmentation_rejects_opaque_and_empty_cutouts(self):
        edited = image_bytes(Image.new("RGB", (1024, 1024), "blue"))
        for alpha in (0, 255):
            with self.subTest(alpha=alpha), \
                 patch.object(queue, "remove", return_value=Image.new("RGBA", (1024, 1024), (0, 0, 0, alpha))):
                with self.assertRaisesRegex(ValueError, "transparent background"):
                    queue.transparent_product_image(edited, object())

    def test_segmentation_rejects_visible_image_frame(self):
        edited = image_bytes(Image.new("RGB", (1024, 1024), "blue"))
        cutout = Image.new("RGBA", (1024, 1024), (0, 0, 0, 255))
        cutout.putpixel((512, 512), (0, 0, 0, 0))
        with patch.object(queue, "remove", return_value=cutout):
            with self.assertRaisesRegex(ValueError, "opaque border"):
                queue.transparent_product_image(edited, object())

    def test_regeneration_preserves_completed_image_on_failure(self):
        source = image_bytes(Image.new("RGB", (20, 20)))
        response = types.SimpleNamespace(ok=True, iter_content=lambda **_kwargs: iter([source]))
        old_job = {"status": "completed", "model": "old", "imageUrl": "/old.png"}
        row = {"id": 8, "image": "/old.png", "info": {
            "rawImage": "https://img.qogita.com/photo.jpg", "imageGeneration": old_job,
        }}
        now = datetime.now(timezone.utc)
        candidates, _ = queue.select_candidates([row], now, regenerate_completed=True)
        self.assertEqual(candidates, [row])
        with patch.object(queue.requests, "get", return_value=response), \
             patch.object(queue, "generate_product_edit", side_effect=RuntimeError("provider failed")), \
             patch.object(queue, "patch_stock") as update:
            with self.assertRaisesRegex(RuntimeError, "provider failed"):
                queue.process_product(object(), row, "https://db.example", "account", "token", None, now, True)
        updated = update.call_args.args[3]
        self.assertEqual(updated["imageGeneration"], old_job)
        self.assertEqual(updated["imageGenerationReplacement"]["status"], "failed")
        self.assertNotIn("image", update.call_args.kwargs)

    def test_replacement_is_swapped_only_after_verified_deployment(self):
        image = b"replacement"
        digest = hashlib.sha256(image).hexdigest()
        image_url = f"/assets/img/generated-products/{digest}.png"
        old_job = {"status": "completed", "model": "old", "imageUrl": "/old.png"}
        row = {"id": 12, "image": "/old.png", "info": {
            "imageGeneration": old_job,
            "imageGenerationReplacement": {"status": "publishing", "imageUrl": image_url, "model": queue.MODEL_ID},
        }}
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir)
            with patch.object(queue, "GENERATED_DIR", path), \
                 patch.object(queue, "fetch_stock_rows", return_value=[row]), \
                 patch.object(queue, "patch_stock") as update:
                queue.publish_generated_images(object(), "https://db.example", "https://site.example")
                self.assertEqual(update.call_args.args[3]["imageGeneration"], old_job)
                self.assertEqual(update.call_args.args[3]["imageGenerationReplacement"]["status"], "failed")
                self.assertNotIn("image", update.call_args.kwargs)
            (path / f"{digest}.png").write_bytes(image)
            with patch.object(queue, "GENERATED_DIR", path), \
                 patch.object(queue, "fetch_stock_rows", return_value=[row]), \
                 patch.object(queue.requests, "get", return_value=types.SimpleNamespace(ok=True, content=image)), \
                 patch.object(queue, "patch_stock") as update:
                queue.publish_generated_images(object(), "https://db.example", "https://site.example")
                self.assertEqual(update.call_args.args[3]["imageGeneration"]["imageUrl"], image_url)
                self.assertNotIn("imageGenerationReplacement", update.call_args.args[3])
                self.assertEqual(update.call_args.kwargs["image"], image_url)
                self.assertEqual(update.call_args.args[3]["retiredGeneratedImages"], ["/old.png"])

    def test_cleanup_removes_only_unreferenced_retired_generated_files(self):
        old = "/assets/img/generated-products/" + "a" * 64 + ".png"
        shared = "/assets/img/generated-products/" + "b" * 64 + ".png"
        rows = [
            {"id": 1, "image": "/new.png", "info": {
                "retiredGeneratedImages": [old, shared, "/assets/img/generated-products/../../other"],
                "imageGeneration": {"status": "completed", "imageUrl": "/new.png"},
            }},
            {"id": 2, "image": shared, "info": {"imageGeneration": {"imageUrl": shared}}},
        ]
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir)
            (path / ("a" * 64 + ".png")).write_bytes(b"old")
            (path / ("b" * 64 + ".png")).write_bytes(b"shared")
            with patch.object(queue, "GENERATED_DIR", path), \
                 patch.object(queue, "fetch_stock_rows", return_value=rows):
                queue.cleanup_replaced_images(object(), "https://db.example")
            self.assertFalse((path / ("a" * 64 + ".png")).exists())
            self.assertTrue((path / ("b" * 64 + ".png")).exists())

    def test_selected_delete_requeues_only_matching_image(self):
        image = "/assets/img/generated-products/" + "a" * 64 + ".png"
        row = {"id": 7, "image": image, "info": {
            "rawImage": "https://img.qogita.com/source.jpg",
            "imageGeneration": {"status": "completed", "imageUrl": image},
        }}
        with patch.object(queue, "fetch_stock_rows", return_value=[row]), \
             patch.object(queue, "patch_stock") as update:
            queue.delete_selected_images(object(), "https://db.example", [{"id": "7", "imageUrl": image}])
            info = update.call_args.args[3]
            self.assertEqual(info["imageGeneration"], {"status": "pending"})
            self.assertEqual(info["retiredGeneratedImages"], [image])
            self.assertEqual(update.call_args.kwargs["image"], "")
            update.reset_mock()
            with self.assertRaisesRegex(RuntimeError, "image has changed"):
                queue.delete_selected_images(object(), "https://db.example", [{"id": 7, "imageUrl": "/assets/img/generated-products/" + "b" * 64 + ".png"}])
            update.assert_not_called()

    def test_selected_delete_validates_every_item_before_writing(self):
        image = "/assets/img/generated-products/" + "a" * 64 + ".png"
        row = {"id": 7, "image": image, "info": {"imageGeneration": {"status": "completed", "imageUrl": image}}}
        with patch.object(queue, "fetch_stock_rows", return_value=[row]), \
             patch.object(queue, "patch_stock") as update:
            with self.assertRaises(ValueError):
                queue.delete_selected_images(object(), "https://db.example", [
                    {"id": 7, "imageUrl": image}, {"id": 8, "imageUrl": "/invalid"},
                ])
            update.assert_not_called()

    def test_conditional_delete_detects_concurrent_changes(self):
        row = {"id": 7, "image": "/old.png", "info": {"a": 1}}
        response = unittest.mock.Mock(ok=True)
        response.json.return_value = []
        session = unittest.mock.Mock()
        session.patch.return_value = response
        with self.assertRaisesRegex(RuntimeError, "changed during deletion"):
            queue.patch_stock(session, "https://db.example", row, {}, image="", only_if_unchanged=True)
        self.assertEqual(session.patch.call_args.kwargs["params"]["info"], 'eq.{"a":1}')
        self.assertEqual(session.patch.call_args.kwargs["params"]["image"], "eq./old.png")

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
