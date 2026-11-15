import unittest
from unittest.mock import patch
from datetime import datetime, timezone
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))
import generate_product_images as gen


class TestGlobalGenerationHalt(unittest.TestCase):
    def test_is_global_generation_halted_true(self):
        rows = [
            {"id": "1", "slug": "item-1", "info": {}},
            {"id": "site-settings", "slug": "site-settings", "info": {"globalImageGenerationHalted": True}},
        ]
        self.assertTrue(gen.is_global_generation_halted(rows))

    def test_is_global_generation_halted_false(self):
        rows = [
            {"id": "1", "slug": "item-1", "info": {}},
            {"id": "site-settings", "slug": "site-settings", "info": {"globalImageGenerationHalted": False}},
        ]
        self.assertFalse(gen.is_global_generation_halted(rows))

    def test_is_global_generation_halted_numeric_id(self):
        rows = [
            {"id": "1", "slug": "item-1", "info": {}},
            {"id": 999999, "slug": "site-settings", "info": {"globalImageGenerationHalted": True}},
        ]
        self.assertTrue(gen.is_global_generation_halted(rows))

    def test_delete_selected_images_accepts_over_400(self):
        selected = [{"id": str(i), "imageUrl": f"/assets/img/generated-products/{'a'*64}.png"} for i in range(1, 501)]
        with patch.object(gen, "fetch_stock_rows", return_value=[]):
            with self.assertRaises(RuntimeError) as ctx:
                gen.delete_selected_images(object(), "https://example.com", selected)
            self.assertIn("product no longer exists", str(ctx.exception))

    def test_check_schedule_ready_halts_when_flag_set(self):
        now = datetime.now(timezone.utc)
        rows = [
            {"id": "1", "name": "Perfume", "brand": "Brand", "image": "http://img.test/1.jpg", "info": {"imageGeneration": {"status": "pending"}}},
            {"id": "site-settings", "slug": "site-settings", "info": {"globalImageGenerationHalted": True}},
        ]
        status = gen.check_schedule_ready(rows, now)
        self.assertFalse(status["should_run"])
        self.assertEqual(status["reason"], "global_generation_halted")


if __name__ == "__main__":
    unittest.main()
