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
import numpy as np


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
    def test_account_pool_switches_on_limit_and_retries_same_image(self):
        accounts = [(f"account-{n}", f"id-{n}", f"token-{n}") for n in range(5)]
        pool = queue.ImageAccountPool(accounts)
        with patch.object(queue, "generate_product_edit", side_effect=[
            queue.WorkersDailyQuotaExceeded("limit"),
            queue.WorkersDailyQuotaExceeded("limit"),
            b"image",
            b"next-image",
        ]) as generate:
            self.assertEqual(pool.generate("session", b"source"), b"image")
            self.assertEqual(pool.generate("session", b"next"), b"next-image")
        self.assertEqual([call.args[1] for call in generate.call_args_list], ["id-0", "id-1", "id-2", "id-2"])
        self.assertEqual([call.args[3] for call in generate.call_args_list], [b"source", b"source", b"source", b"next"])

    def test_account_pool_reports_exhaustion_and_does_not_hide_configuration_errors(self):
        accounts = [(f"account-{n}", f"id-{n}", f"token-{n}") for n in range(5)]
        pool = queue.ImageAccountPool(accounts)
        with patch.object(queue, "generate_product_edit", side_effect=queue.WorkersDailyQuotaExceeded("limit")) as generate:
            with self.assertRaisesRegex(queue.WorkersDailyQuotaExceeded, "All selected"):
                pool.generate("session", b"source")
            self.assertEqual(generate.call_count, 5)
        pool = queue.ImageAccountPool(accounts)
        with patch.object(queue, "generate_product_edit", side_effect=queue.WorkersConfigurationError("unauthorized")) as generate:
            with self.assertRaises(queue.WorkersConfigurationError):
                pool.generate("session", b"source")
            self.assertEqual(generate.call_count, 1)

    def test_account_pool_record_limit_updates_limited_at_on_all_branches(self):
        accounts = [("primary", "id-0", "token-0")]
        now1 = datetime(2026, 11, 10, 12, 0, 0, tzinfo=timezone.utc)
        pool1 = queue.ImageAccountPool(accounts, persist_quotas=True)
        pool1.record_limit("primary", now=now1)
        quotas1 = pool1.export_quotas()
        self.assertEqual(quotas1["primary"]["limitedAt"], now1.isoformat())
        self.assertEqual(quotas1["primary"]["availableAt"], (now1 + timedelta(hours=24)).isoformat())

        now2 = datetime(2026, 11, 11, 12, 5, 0, tzinfo=timezone.utc)
        pool2 = queue.ImageAccountPool(accounts, quotas=quotas1, persist_quotas=True)
        pool2.record_limit("primary", now=now2)
        quotas2 = pool2.export_quotas()
        self.assertEqual(quotas2["primary"]["limitedAt"], now2.isoformat())
        self.assertEqual(quotas2["primary"]["availableAt"], (now2 + timedelta(minutes=30)).isoformat())

        now3 = datetime(2026, 11, 11, 13, 0, 0, tzinfo=timezone.utc)
        pool3 = queue.ImageAccountPool(accounts, quotas=quotas2, persist_quotas=True)
        pool3.record_success("primary", now=now3)
        now4 = datetime(2026, 11, 11, 13, 10, 0, tzinfo=timezone.utc)
        pool3.record_limit("primary", now=now4)
        quotas3 = pool3.export_quotas()
        self.assertEqual(quotas3["primary"]["limitedAt"], now4.isoformat())
        self.assertEqual(quotas3["primary"]["availableAt"], (now4 + timedelta(hours=24)).isoformat())

    def test_auto_requires_five_distinct_confirmed_accounts(self):
        environ = {"CLOUDFLARE_IMAGE_ACCOUNT": "auto"}
        for index, (_, (id_key, token_key, free_key)) in enumerate(queue.ACCOUNT_ENV.items()):
            environ.update({id_key: f"id-{index}", token_key: f"token-{index}", free_key: "true"})
        self.assertEqual(len(queue.load_image_accounts(environ)), 5)
        environ["FIFTH_FREE_CONFIRMED"] = ""
        with self.assertRaisesRegex(queue.WorkersConfigurationError, "fifth Free plan"):
            queue.load_image_accounts(environ)
        environ["FIFTH_FREE_CONFIRMED"] = "true"
        environ["FIFTH_ACCOUNT_ID"] = environ["THIRD_ACCOUNT_ID"]
        with self.assertRaisesRegex(queue.WorkersConfigurationError, "distinct"):
            queue.load_image_accounts(environ)

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
            # The reference keeps the original 800x600 resolution — it is no
            # longer downscaled to 511px before being sent to Flux.
            self.assertEqual((image.width, image.height), (800, 600))

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

    def test_flux_path_publishes_transparent_png_and_awaits_publication(self):
        source = image_bytes(Image.new("RGB", (100, 100), (20, 40, 200)))
        result = image_bytes(Image.new("RGB", (1024, 1024), "blue"), "JPEG")
        cutout = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
        cutout.paste((20, 40, 200, 255), (300, 200, 724, 850))
        response = types.SimpleNamespace(ok=True, iter_content=lambda **_kwargs: iter([source]))
        row = {"id": 8, "info": {"rawImage": "https://img.qogita.com/photo.jpg"}}
        now = datetime(2026, 1, 2, tzinfo=timezone.utc)
        with patch.object(queue.requests, "get", return_value=response), \
             patch.object(queue, "generate_product_edit", return_value=result) as edit, \
             patch.object(queue, "remove", return_value=cutout) as remove_background, \
             patch.object(queue, "restore_source_text_regions", side_effect=lambda _s, out: {"image": out, "textRestored": True, "matchedPoints": 10, "requiresManualReview": False}) as restore_text, \
             patch.object(queue, "fetch_verified_notes", return_value=None), \
             patch.object(queue, "generate_ai_perfume_description", return_value=None), \
             patch.object(queue, "save_generated_image", return_value="/assets/img/generated-products/result.png") as save, \
             patch.object(queue, "patch_stock") as update:
            queue.process_product(object(), row, "https://db.example", "account", "token", "session", now)
        self.assertEqual(edit.call_args.args[-1], source)
        self.assertEqual(remove_background.call_args.kwargs["session"], "session")
        restore_text.assert_called_once()
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
        self.assertEqual(job["processingMethod"], "flux_redraw")
        self.assertEqual(job["textRestored"], True)
        self.assertEqual(job["textMatchPoints"], 10)

    def test_limit_switch_keeps_product_processing_until_success(self):
        source = image_bytes(Image.new("RGB", (20, 20)))
        response = types.SimpleNamespace(ok=True, iter_content=lambda **_kwargs: iter([source]))
        row = {"id": 8, "info": {"rawImage": "https://img.qogita.com/photo.jpg"}}
        pool = queue.ImageAccountPool([("primary", "id-1", "token-1"), ("secondary", "id-2", "token-2")])
        states = []
        def capture_update(_session, _url, _row, info, **_kwargs):
            states.append(info["imageGeneration"]["status"])
        with patch.object(queue.requests, "get", return_value=response), \
             patch.object(queue, "generate_product_edit", side_effect=[queue.WorkersDailyQuotaExceeded("limit"), b"edited"]) as edit, \
             patch.object(queue, "transparent_product_image", return_value=(b"png", (1024, 1024))), \
             patch.object(queue, "restore_source_text_regions", return_value={"image": b"png", "textRestored": False, "matchedPoints": 0, "requiresManualReview": False}), \
             patch.object(queue, "save_generated_image", return_value="/image.png"), \
             patch.object(queue, "patch_stock", side_effect=capture_update):
            queue.process_product(object(), row, "https://db.example", "", "", None,
                                  datetime.now(timezone.utc), account_pool=pool)
        self.assertEqual(states, ["processing", "publishing"])
        self.assertEqual([call.args[1] for call in edit.call_args_list], ["id-1", "id-2"])

    def test_transparent_product_image_rejects_unexpected_dimensions(self):
        edited = image_bytes(Image.new("RGB", (20, 20)))
        with self.assertRaisesRegex(ValueError, "Unexpected generated image dimensions"):
            queue.transparent_product_image(edited, object())

    def test_only_selected_unpublished_images_are_marked_failed(self):
        digest = "a" * 64
        image_url = f"/assets/img/generated-products/{digest}.png"
        row = {"id": 10, "image": "old-image", "info": {
            "imageGeneration": {"status": "completed", "imageUrl": "old-image"},
            "imageGenerationReplacement": {"status": "publishing", "imageUrl": image_url},
        }}
        other = {"id": 11, "info": {"imageGeneration": {
            "status": "publishing", "imageUrl": f"/assets/img/generated-products/{'b' * 64}.png",
        }}}
        with patch.object(queue, "fetch_stock_rows", return_value=[row, other]), \
             patch.object(queue, "patch_stock") as update:
            queue.mark_unpublished_failed(object(), "https://db.example", [
                f"Al-Warda/public/assets/img/generated-products/{digest}.png",
            ])
        update.assert_called_once()
        info = update.call_args.args[3]
        self.assertEqual(info["imageGeneration"]["status"], "completed")
        self.assertEqual(info["imageGenerationReplacement"]["status"], "failed")
        self.assertEqual(info["imageGenerationReplacement"]["error"], queue.UNPUBLISHED_ERROR)
        self.assertEqual(update.call_args.kwargs, {"image": "old-image", "only_if_unchanged": True})

    def test_restored_unpublished_image_can_be_completed(self):
        image = b"restored-generated-image"
        digest = hashlib.sha256(image).hexdigest()
        image_url = f"/assets/img/generated-products/{digest}.png"
        row = {"id": 12, "info": {"imageGeneration": {
            "status": "failed", "error": queue.UNPUBLISHED_ERROR,
            "failedAt": "2026-01-01T00:00:00Z", "imageUrl": image_url,
        }}}
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir)
            (path / f"{digest}.png").write_bytes(image)
            with patch.object(queue, "GENERATED_DIR", path), \
                 patch.object(queue, "fetch_stock_rows", return_value=[row]), \
                 patch.object(queue.requests, "get", return_value=types.SimpleNamespace(ok=True, content=image)), \
                 patch.object(queue, "patch_stock") as update:
                queue.publish_generated_images(object(), "https://db.example", "https://site.example")
            job = update.call_args.args[3]["imageGeneration"]
            self.assertEqual(job["status"], "completed")
            self.assertNotIn("error", job)
            self.assertNotIn("failedAt", job)

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
                self.assertEqual(update.call_args.kwargs, {"image": "/old.png", "only_if_unchanged": True})
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
        response.json.return_value = False
        session = unittest.mock.Mock()
        session.post.return_value = response
        with self.assertRaisesRegex(RuntimeError, "changed during deletion"):
            queue.patch_stock(session, "https://db.example", row, {}, image="", only_if_unchanged=True)
        self.assertEqual(session.post.call_args.kwargs["json"]["p_expected_info"], {"a": 1})
        self.assertEqual(session.post.call_args.kwargs["json"]["p_expected_image"], "/old.png")
        response.json.return_value = True
        queue.patch_stock(session, "https://db.example", row, {}, image="", only_if_unchanged=True)
        session.patch.assert_not_called()

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

    def test_generates_ai_description_via_gemini(self):
        import json
        row = {"id": 100, "name": "Afnan 9 PM", "brand": "Afnan", "info": {}}
        gemini_response = types.SimpleNamespace(
            ok=True,
            json=lambda: {
                "candidates": [{
                    "content": {
                        "parts": [{
                            "text": json.dumps({
                                "descriptionRu": "Afnan 9 PM — чувственный гурманский аромат с Ближнего Востока с яркими нотами бергамота, корицы и ванили. С первых секунд композиция очаровывает глубоким звучанием.",
                                "descriptionEn": "Afnan 9 PM is a sensual oriental fragrance from the Middle East with notes of bergamot, cinnamon and vanilla.",
                                "notesSummary": "Afnan — бергамот, корица, ваниль",
                            })
                        }]
                    }
                }]
            },
        )
        with patch.dict(os.environ, {"GEMINI_API_KEY": "test-key"}), \
             patch.object(queue.requests, "post", return_value=gemini_response):
            result = queue.generate_ai_perfume_description(queue.requests, row, {})
        self.assertIn("Afnan 9 PM", result["descriptionRu"])
        self.assertIn("Ближн", result["descriptionRu"])
        self.assertIn("Middle East", result["descriptionEn"])
        self.assertTrue(result["aiModel"].startswith("gemini/"))

    def test_generates_ai_description_via_cloudflare_llm(self):
        import json
        row = {"id": 101, "name": "Lattafa Khamrah", "brand": "Lattafa", "info": {}}
        cf_response = types.SimpleNamespace(
            ok=True,
            json=lambda: {
                "result": {
                    "response": json.dumps({
                        "descriptionRu": "Lattafa Khamrah — изысканный десертно-пряный шедевр с Ближнего Востока с нотами фиников, пралине и мускатного ореха. Оставляет стойкий притягательный шлейф.",
                        "descriptionEn": "Lattafa Khamrah is an exquisite sweet-spicy masterpiece from the Middle East featuring dates, praline and nutmeg.",
                        "notesSummary": "Lattafa — финики, пралине, корица",
                    })
                }
            },
        )
        with patch.dict(os.environ, {}, clear=True), \
             patch.object(queue.requests, "post", return_value=cf_response):
            result = queue.generate_ai_perfume_description(queue.requests, row, {}, account_id="acc123", api_token="tok123")
        self.assertIn("Lattafa Khamrah", result["descriptionRu"])
        self.assertIn("Ближн", result["descriptionRu"])
        self.assertEqual(result["aiModel"], "@cf/meta/llama-3.1-8b-instruct")

    def test_ai_description_fallback_generates_multi_sentence_luxury_copy(self):
        row = {"id": 102, "name": "Amouage Interlude", "brand": "Amouage", "info": {}}
        with patch.dict(os.environ, {}, clear=True):
            result = queue.generate_ai_perfume_description(None, row, {})
        self.assertIn("Amouage Interlude", result["descriptionRu"])
        self.assertIn("Ближн", result["descriptionRu"])
        self.assertIn("Middle East", result["descriptionEn"])
        self.assertGreater(len(result["descriptionRu"]), 100)
        # Notes must never be invented: no pyramid wording or stock ingredients without verified notes
        for invented in ("Шафран", "Бергамот", "Розовый перец", "Saffron", "Bergamot", "верхн", "top notes"):
            self.assertNotIn(invented, result["descriptionRu"] + result["descriptionEn"])

    def test_ai_description_uses_only_verified_notes(self):
        row = {"id": 103, "name": "Test Scent", "brand": "Brand", "info": {}}
        info = {"notesVerified": True, "notes": {
            "ru": {"top": ["Кофе"], "heart": ["Роза"], "base": ["Ваниль"]},
            "en": {"top": ["Coffee"], "heart": ["Rose"], "base": ["Vanilla"]},
        }}
        with patch.dict(os.environ, {}, clear=True):
            result = queue.generate_ai_perfume_description(None, row, info)
        self.assertIn("Кофе", result["descriptionRu"])
        self.assertIn("Vanilla", result["descriptionEn"])
        self.assertNotIn("Шафран", result["descriptionRu"])

    def test_unverified_notes_are_cleared_from_info(self):
        info = {"topNotes": ["Шафран"], "notes": {"ru": {"top": ["Шафран"]}}, "notesSummary": "Шафран"}
        queue.apply_verified_notes(info, None)
        self.assertIs(info["notesVerified"], False)
        self.assertNotIn("notes", info)
        self.assertNotIn("topNotes", info)
        self.assertNotIn("notesSummary", info)

    def test_cloudflare_flagged_rejection_raises_runtime_error(self):
        class FakeSession:
            def __init__(self):
                self.calls = 0
            def post(self, *_args, **_kwargs):
                self.calls += 1
                return types.SimpleNamespace(status_code=400, ok=False, text="Image flagged by moderation (3030)")
        session = FakeSession()
        with self.assertRaisesRegex(RuntimeError, "Workers AI request failed"):
            queue.generate_product_edit(
                session, "account-123", "token", image_bytes(Image.new("RGB", (20, 20)))
            )
        self.assertEqual(session.calls, 2)

    def test_complete_committed_images_publishes_matching_local_files(self):
        image = b"local-committed-png-data"
        digest = hashlib.sha256(image).hexdigest()
        image_url = f"/assets/img/generated-products/{digest}.png"
        publishing_row = {
            "id": 201,
            "name": "Amber Oud",
            "info": {"imageGeneration": {"status": "publishing", "imageUrl": image_url}},
        }
        stale_processing_row = {
            "id": 202,
            "name": "Stale Item",
            "info": {"imageGeneration": {"status": "processing", "startedAt": "2026-11-09T10:00:00+00:00"}},
        }
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir)
            (path / f"{digest}.png").write_bytes(image)
            with patch.object(queue, "GENERATED_DIR", path), \
                 patch.object(queue, "fetch_stock_rows", return_value=[publishing_row, stale_processing_row]), \
                 patch.object(queue, "patch_stock") as update_mock:
                completed = queue.complete_committed_images(object(), "https://db.example")
            self.assertEqual(completed, 1)
            # Check completed row call
            call_201 = [c for c in update_mock.call_args_list if c.args[2]["id"] == 201][0]
            self.assertEqual(call_201.args[3]["imageGeneration"]["status"], "completed")
            self.assertEqual(call_201.kwargs["image"], image_url)
            # Check reset processing row call
            call_202 = [c for c in update_mock.call_args_list if c.args[2]["id"] == 202][0]
            self.assertEqual(call_202.args[3]["imageGeneration"]["status"], "pending")
            self.assertNotIn("startedAt", call_202.args[3]["imageGeneration"])



    def test_normalize_flacon_cutout_centers_off_center_bottle(self):
        im = Image.new('RGBA', (1024, 1024), (0, 0, 0, 0))
        draw_bottle = Image.new('RGBA', (200, 600), (180, 140, 60, 255))
        im.paste(draw_bottle, (650, 200))
        normalized = queue.normalize_flacon_cutout(im)
        arr = np.array(normalized)
        ys, xs = np.where(arr[:, :, 3] > 25)
        self.assertTrue(len(xs) > 0)
        center_x = (xs.min() + xs.max()) / 2.0
        self.assertAlmostEqual(center_x, 512.0, delta=1.5)

    def test_normalize_flacon_cutout_filters_faint_ghost_noise(self):
        im = Image.new('RGBA', (1024, 1024), (0, 0, 0, 0))
        bottle = Image.new('RGBA', (220, 700), (120, 80, 40, 255))
        im.paste(bottle, (600, 150))
        ghost = Image.new('RGBA', (300, 700), (200, 200, 200, 12))
        im.paste(ghost, (100, 150))
        normalized = queue.normalize_flacon_cutout(im)
        arr = np.array(normalized)
        ys, xs = np.where(arr[:, :, 3] > 25)
        self.assertTrue(len(xs) > 0)
        center_x = (xs.min() + xs.max()) / 2.0
        self.assertAlmostEqual(center_x, 512.0, delta=1.5)

    def test_normalize_flacon_cutout_rejects_disconnected_side_noise(self):
        im = Image.new('RGBA', (1024, 1024), (0, 0, 0, 0))
        bottle = Image.new('RGBA', (250, 750), (100, 50, 20, 255))
        im.paste(bottle, (550, 120))
        noise = Image.new('RGBA', (20, 20), (255, 255, 255, 200))
        im.paste(noise, (80, 500))
        normalized = queue.normalize_flacon_cutout(im)
        arr = np.array(normalized)
        ys, xs = np.where(arr[:, :, 3] > 25)
        center_x = (xs.min() + xs.max()) / 2.0
        self.assertAlmostEqual(center_x, 512.0, delta=1.5)

    def test_normalize_flacon_cutout_does_not_upscale_when_disabled(self):
        im = Image.new('RGBA', (300, 900), (0, 0, 0, 0))
        bottle = Image.new('RGBA', (100, 300), (180, 140, 60, 255))
        im.paste(bottle, (100, 300))
        normalized = queue.normalize_flacon_cutout(
            im, target_max_h=850, target_max_w=850, canvas_size=(1024, 1024), allow_upscale=False
        )
        arr = np.array(normalized)
        ys, xs = np.where(arr[:, :, 3] > 25)
        self.assertTrue(len(xs) > 0)
        # The product is not enlarged beyond its original ~100px width.
        self.assertLessEqual(int(xs.max()) - int(xs.min()) + 1, 120)

    def test_measure_source_quality_flags_low_resolution(self):
        small = image_bytes(Image.new("RGB", (120, 120), "red"))
        quality = queue.measure_source_quality(small)
        self.assertEqual(quality["qualityStatus"], "low_source_quality")
        self.assertEqual(quality["originalWidth"], 120)
        self.assertEqual(quality["originalHeight"], 120)
        self.assertEqual(quality["originalFileSize"], len(small))

    def test_measure_source_quality_reports_dimensions_for_valid_source(self):
        source = image_bytes(Image.new("RGB", (800, 600), "red"))
        quality = queue.measure_source_quality(source)
        self.assertEqual(quality["originalWidth"], 800)
        self.assertEqual(quality["originalHeight"], 600)
        self.assertIn("qualityStatus", quality)
        self.assertIn("originalFileSize", quality)

    def test_process_product_restores_source_text(self):
        source = image_bytes(Image.new("RGB", (60, 60), (200, 30, 30)))
        response = types.SimpleNamespace(ok=True, iter_content=lambda **_kwargs: iter([source]))
        row = {"id": 8, "info": {"rawImage": "https://img.qogita.com/photo.jpg"}}
        captured = {}
        def capture_update(_session, _url, _row, info, **_kwargs):
            captured.update(info)
        with patch.object(queue.requests, "get", return_value=response), \
             patch.object(queue, "generate_product_edit", return_value=image_bytes(Image.new("RGB", (1024, 1024), "blue"), "JPEG")), \
             patch.object(queue, "transparent_product_image", return_value=(image_bytes(Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))), (1024, 1024))), \
             patch.object(queue, "restore_source_text_regions", return_value={"image": b"restored", "textRestored": True, "matchedPoints": 15, "requiresManualReview": False}), \
             patch.object(queue, "fetch_verified_notes", return_value=None), \
             patch.object(queue, "generate_ai_perfume_description", return_value=None), \
             patch.object(queue, "save_generated_image", return_value="/assets/img/generated-products/x.png"), \
             patch.object(queue, "patch_stock", side_effect=capture_update):
            queue.process_product(object(), row, "https://db.example", "account", "token", None, datetime.now(timezone.utc))
        job = captured["imageGeneration"]
        self.assertEqual(job["status"], "publishing")
        self.assertEqual(job["processingMethod"], "flux_redraw")
        self.assertEqual(job["textRestored"], True)
        self.assertEqual(job["textMatchPoints"], 15)
        self.assertEqual(job["requiresManualReview"], False)

    def test_restore_source_text_regions_returns_unchanged_when_no_features(self):
        source = image_bytes(Image.new("RGB", (80, 80), (128, 128, 128)))
        generated = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
        generated.paste((200, 200, 200, 255), (400, 300, 624, 724))
        result = queue.restore_source_text_regions(source, image_bytes(generated))
        self.assertEqual(result["image"], image_bytes(generated))
        self.assertFalse(result["textRestored"])
        self.assertTrue(result["requiresManualReview"])

if __name__ == "__main__":
    unittest.main()
