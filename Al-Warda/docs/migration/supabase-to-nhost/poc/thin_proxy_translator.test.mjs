// thin_proxy_translator.test.mjs — MOCK tests only.
//
// These tests verify the TRANSLATION LOGIC (PostgREST string -> GraphQL text)
// against a stub. They do NOT execute against a real Nhost/Hasura endpoint,
// so they are NOT proof of runtime behavior. The compatibility matrix
// (COMPATIBILITY_MATRIX.md) marks each row "MOCK" until run on a real project.

import test from "node:test";
import assert from "node:assert/strict";
import {
  translatePostgrest,
  jsonbArrowToWhere,
} from "./thin_proxy_translator.mjs";

const q = (obj) => new URLSearchParams(obj);

test("select with eq / order / limit / offset", () => {
  const { gql, kind } = translatePostgrest({
    method: "GET",
    path: "/rest/v1/stocks",
    query: q({
      select: "id,name,brand",
      id: "eq.10",
      order: "id.asc",
      limit: "50",
      offset: "100",
    }),
  });
  assert.equal(kind, "query");
  assert.match(gql, /stocks/);
  assert.match(gql, /_eq/);
  assert.match(gql, /order_by/);
  assert.match(gql, /limit: 50/);
  assert.match(gql, /offset: 100/);
  assert.match(gql, /id name brand/);
});

test("neq / ilike / or", () => {
  const neq = translatePostgrest({
    path: "/rest/v1/stocks",
    query: q({ id: "neq.5" }),
  }).gql;
  assert.match(neq, /_neq/);
  const ilike = translatePostgrest({
    path: "/rest/v1/user",
    query: q({ select: "id", email: "ilike.a%40b.c" }),
  }).gql;
  assert.match(ilike, /_ilike/);
  const or = translatePostgrest({
    path: "/rest/v1/user",
    query: q({ select: "id", or: "(email.ilike.x,firstname.ilike.y)" }),
  }).gql;
  assert.match(or, /_or/);
});

test("insert / update / delete with returning", () => {
  const ins = translatePostgrest({
    method: "POST",
    path: "/rest/v1/cart",
    body: { user_id: "u1", title: "t", price: 10, quantity: 1 },
  }).gql;
  assert.match(ins, /insert_cart/);
  const upd = translatePostgrest({
    method: "PATCH",
    path: "/rest/v1/cart",
    query: q({ id: "eq.9" }),
    body: { quantity: 2 },
  }).gql;
  assert.match(upd, /update_cart/);
  assert.match(upd, /_set/);
  const del = translatePostgrest({
    method: "DELETE",
    path: "/rest/v1/feedbacks",
    query: q({ id: "eq.7", user_id: "eq.3" }),
  }).gql;
  assert.match(del, /delete_feedbacks/);
});

test("jsonb arrow filter maps to _contains (UNVERIFIED against real Hasura)", () => {
  const where = jsonbArrowToWhere(
    "info",
    "info->imageGeneration->>status",
    "eq",
    "completed",
  );
  assert.deepEqual(where, {
    info: { _contains: { imageGeneration: { status: "completed" } } },
  });
});
