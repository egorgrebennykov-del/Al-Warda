import assert from "node:assert/strict";
import { test } from "node:test";
import {
  resolveProductsSubTab,
  resolvePrivilegedTab,
  getPrivilegedBasePath,
  PRIVILEGED_SUBTAB_ALIASES,
  PRIVILEGED_DIRECT_SUBTAB_MAP,
} from "../utils/privilegedRouting.js";

test("resolveProductsSubTab resolves default to list", () => {
  assert.equal(resolveProductsSubTab(), "list");
  assert.equal(resolveProductsSubTab(null), "list");
  assert.equal(resolveProductsSubTab(""), "list");
  assert.equal(resolveProductsSubTab("unknown-tab"), "list");
});

test("resolveProductsSubTab resolves all 4 products subtabs accurately", () => {
  assert.equal(resolveProductsSubTab("list"), "list");
  assert.equal(resolveProductsSubTab("catalog"), "list");
  assert.equal(resolveProductsSubTab("spisok"), "list");

  assert.equal(resolveProductsSubTab("images"), "images");
  assert.equal(resolveProductsSubTab("product-images"), "images");
  assert.equal(resolveProductsSubTab("photos"), "images");
  assert.equal(resolveProductsSubTab("foto"), "images");

  assert.equal(resolveProductsSubTab("notes"), "notes");
  assert.equal(resolveProductsSubTab("fragrance-notes"), "notes");
  assert.equal(resolveProductsSubTab("aromaty"), "notes");

  assert.equal(resolveProductsSubTab("descriptions"), "descriptions");
  assert.equal(resolveProductsSubTab("description"), "descriptions");
  assert.equal(resolveProductsSubTab("opisanie"), "descriptions");
});

test("PRIVILEGED_DIRECT_SUBTAB_MAP maps legacy root tabs to target subtabs", () => {
  assert.equal(PRIVILEGED_DIRECT_SUBTAB_MAP["images"], "images");
  assert.equal(PRIVILEGED_DIRECT_SUBTAB_MAP["photos"], "images");
  assert.equal(PRIVILEGED_DIRECT_SUBTAB_MAP["product-images"], "images");

  assert.equal(PRIVILEGED_DIRECT_SUBTAB_MAP["notes"], "notes");
  assert.equal(PRIVILEGED_DIRECT_SUBTAB_MAP["fragrance-notes"], "notes");

  assert.equal(PRIVILEGED_DIRECT_SUBTAB_MAP["descriptions"], "descriptions");
  assert.equal(PRIVILEGED_DIRECT_SUBTAB_MAP["description"], "descriptions");
});

test("getPrivilegedBasePath resolves base prefix correctly", () => {
  assert.equal(getPrivilegedBasePath("/privileged/products/images"), "/privileged");
  assert.equal(getPrivilegedBasePath("/admin/products/notes"), "/admin");
  assert.equal(getPrivilegedBasePath("/priviledged/products/descriptions"), "/priviledged");
});
