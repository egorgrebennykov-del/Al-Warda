// hasuraProxy.js — thin proxy translating the PostgREST-style requests the
// Al-Warda frontend sends into Hasura GraphQL (Nhost). This lets the
// `utils/*.js` data layer keep its current call surface while the backend
// data store moves from Supabase PostgREST to Nhost Hasura.
//
// The admin secret is used ONLY server-side (Cloudflare Worker / Node server)
// and is never exposed to the browser.

const PUBLIC_COLUMNS = {
  announcements: [
    "id",
    "created_at",
    "user_id",
    "content_ru",
    "content_en",
    "starts_at",
    "until",
  ],
  cart: [
    "created_at",
    "link",
    "price",
    "image",
    "title",
    "shop",
    "quantity",
    "id",
    "user_id",
  ],
  coupons: [
    "id",
    "created_at",
    "starts_at",
    "ends_at",
    "code",
    "name",
    "action",
  ],
  discounts: ["created_at", "perfumes", "id"],
  feedbacks: [
    "created_at",
    "user_first_name",
    "user_last_name",
    "feedback",
    "stars",
    "id",
    "user_id",
    "ststus",
    "feedback_ru",
    "feedback_en",
  ],
  inquiries: [
    "id",
    "created_at",
    "interlocutors_info",
    "chat",
    "notifications_admin",
    "notifications_user",
  ],
  new_perfumes: ["created_at", "perfumes", "id"],
  order_coupons: ["id", "order_id", "coupon_id", "created_at"],
  orders_in_progress: [
    "id",
    "created_at",
    "user_id",
    "content",
    "status",
    "link",
  ],
  perfume_picks: ["created_at", "perfumes", "id"],
  perfumes_on_home_page: ["created_at", "perfumes", "id"],
  stocks: [
    "id",
    "created_at",
    "name",
    "image",
    "description",
    "brand",
    "price",
    "info",
    "slug",
    "title",
    "category",
    "currency",
    "in_stock",
  ],
  user: [
    "created_at",
    "firstname",
    "lastname",
    "email",
    "password_hash",
    "adresses",
    "id",
    "phone",
    "status",
    "role",
  ],
};

// Legacy "books"-domain table/column names mapped onto the current perfumes schema.
const TABLE_ALIAS = {
  book_picks: "perfume_picks",
  books_on_home_page: "perfumes_on_home_page",
  new_books: "new_perfumes",
};
const COLUMN_ALIAS = { books: "perfumes" };

// Tables whose root GraphQL field was customized to avoid a clash with the
// Nhost `auth.users` table (its select root field is `user`).
const CUSTOM_ROOTS = {
  user: {
    select: "app_user",
    select_aggregate: "app_user_aggregate",
    insert: "insert_app_user",
    insert_one: "insert_app_user_one",
    update: "update_app_user",
    delete: "delete_app_user",
  },
};

const NUMERIC_COLUMNS = {
  stocks: new Set(["id", "price"]),
  cart: new Set(["price", "quantity"]),
  feedbacks: new Set(["stars"]),
  inquiries: new Set(["notifications_admin", "notifications_user"]),
};
const BOOL_COLUMNS = {
  stocks: new Set(["in_stock"]),
};

function resolveTable(table) {
  return TABLE_ALIAS[table] || table;
}

function rootField(table, kind) {
  const custom = CUSTOM_ROOTS[table];
  if (custom && custom[kind]) return custom[kind];
  switch (kind) {
    case "select":
      return table;
    case "select_aggregate":
      return `${table}_aggregate`;
    case "insert":
      return `insert_${table}`;
    case "insert_one":
      return `insert_${table}_one`;
    case "update":
      return `update_${table}`;
    case "delete":
      return `delete_${table}`;
    default:
      throw new Error("unknown root kind: " + kind);
  }
}

function aggregateRootField(table) {
  return rootField(table, "select_aggregate");
}

function castValue(table, col, value) {
  if (value === null || value === undefined) return null;
  if (NUMERIC_COLUMNS[table]?.has(col)) {
    const n = Number(value);
    return Number.isFinite(n) ? n : value;
  }
  if (BOOL_COLUMNS[table]?.has(col)) {
    if (value === "true") return true;
    if (value === "false") return false;
    return value;
  }
  return value;
}

const OP_ALIASES = {
  eq: "_eq",
  neq: "_neq",
  gt: "_gt",
  gte: "_gte",
  lt: "_lt",
  lte: "_lte",
  like: "_like",
  ilike: "_ilike",
  in: "_in",
  is: "_is_null",
  cs: "_contains",
  cd: "_contained_in",
};

function simpleToWhere(table, col, op, value) {
  const alias = OP_ALIASES[op] || "_eq";
  if (alias === "_is_null") {
    return { [col]: { _is_null: value === "null" || value === "true" } };
  }
  if (alias === "_in") {
    const list = value
      .replace(/^\(/, "")
      .replace(/\)$/, "")
      .split(",")
      .map((x) => castValue(table, col, x.trim()));
    return { [col]: { _in: list } };
  }
  return { [col]: { [alias]: castValue(table, col, value) } };
}

// PostgREST JSONB arrow filter: `info->imageGeneration->>status=eq.completed`
//   => where: { info: { _contains: { imageGeneration: { status: "completed" } } } }
function jsonbArrowToWhere(table, key, op, value) {
  const column = key.split("->")[0];
  const rest = key.slice(column.length);
  const parts = rest.split(/->>?/).filter(Boolean);
  let nested = value;
  for (let i = parts.length - 1; i >= 0; i -= 1) {
    nested = { [parts[i]]: nested };
  }
  const alias = op === "neq" ? "_not_contains" : "_contains";
  return { [column]: { [alias]: nested } };
}

function parseOr(table, expr) {
  const inner = expr.trim().replace(/^\(/, "").replace(/\)$/, "");
  const parts = inner.split(",");
  const out = [];
  for (const part of parts) {
    const m =
      /^([A-Za-z0-9_]+)\.(eq|neq|gt|gte|lt|lte|like|ilike|in|is|cs|cd)\.(.+)$/.exec(
        part.trim(),
      );
    if (!m) continue;
    out.push(simpleToWhere(table, m[1], m[2], m[3]));
  }
  return out;
}

function buildWhere(table, searchParams) {
  const where = {};
  for (const [key, value] of searchParams.entries()) {
    if (key === "or") {
      const or = parseOr(table, value);
      if (or.length) where._or = or;
      continue;
    }
    const opMatch =
      /^(eq|neq|gt|gte|lt|lte|like|ilike|in|is|cs|cd)\.(.+)$/.exec(value);
    if (!opMatch) continue;
    const op = opMatch[1];
    const val = opMatch[2];
    if (key.includes("->")) {
      Object.assign(where, jsonbArrowToWhere(table, key, op, val));
    } else {
      Object.assign(where, simpleToWhere(table, key, op, val));
    }
  }
  return where;
}

function buildOrderBy(order) {
  if (!order) return null;
  return order
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean)
    .map((o) => {
      const [col, dir] = o.split(".");
      return { [col]: (dir || "asc").toLowerCase() };
    });
}

function resolveSelectColumns(table, select) {
  const all = PUBLIC_COLUMNS[table] || [];
  if (!select || select === "*") return all;
  const requested = select
    .split(",")
    .map((c) => COLUMN_ALIAS[c.trim()] || c.trim())
    .filter(Boolean);
  const known = new Set(all);
  return requested.filter((c) => known.has(c));
}

// Serialize a JS value to GraphQL input-literal syntax. Object keys must be
// unquoted identifiers (GraphQL rejects JSON.stringify's `{"key": …}` form).
function gqlLiteral(value) {
  if (value === null || value === undefined) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number")
    return Number.isFinite(value) ? String(value) : "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(gqlLiteral).join(", ")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value).map(([k, v]) => {
      const key = /^[_A-Za-z][_0-9A-Za-z]*$/.test(k) ? k : JSON.stringify(k);
      return `${key}: ${gqlLiteral(v)}`;
    });
    return `{${entries.join(", ")}}`;
  }
  return "null";
}

// GraphQL enums (asc/desc) must be emitted unquoted, unlike JSON stringify.
function orderByLiteral(orderBy) {
  if (!orderBy || !orderBy.length) return "";
  const items = orderBy.map((o) => {
    const col = Object.keys(o)[0];
    const dir = o[col] === "desc" ? "desc" : "asc";
    return `{ ${col}: ${dir} }`;
  });
  return `[${items.join(", ")}]`;
}

function argClause(entries) {
  // entries: [["where", obj], ["order_by", arr], ["limit", n], ["offset", n]]
  const parts = [];
  for (const [name, value] of entries) {
    if (value === null || value === undefined) continue;
    if (name === "where" && Object.keys(value).length === 0) continue;
    if (name === "order_by" && (!value || value.length === 0)) continue;
    if (name === "order_by") {
      parts.push(`order_by: ${orderByLiteral(value)}`);
      continue;
    }
    parts.push(`${name}: ${gqlLiteral(value)}`);
  }
  return parts.length ? `(${parts.join(", ")})` : "";
}

export function translatePostgrest({
  method = "GET",
  pathname = "",
  searchParams = new URLSearchParams(),
  body = null,
  limit = null,
  offset = null,
}) {
  const m = /^\/rest\/v1\/([A-Za-z0-9_]+)$/.exec(pathname);
  if (!m) throw new Error("unsupported path: " + pathname);
  const rawTable = decodeURIComponent(m[1]);
  const table = resolveTable(rawTable);

  if (!PUBLIC_COLUMNS[table]) {
    const err = new Error(`table not found: ${rawTable}`);
    err.status = 404;
    throw err;
  }

  const methodUpper = method.toUpperCase();
  const select = searchParams.get("select");
  const where = buildWhere(table, searchParams);
  const orderBy = buildOrderBy(searchParams.get("order"));
  const limitRaw = limit !== null ? String(limit) : searchParams.get("limit");
  const offsetRaw =
    offset !== null ? String(offset) : searchParams.get("offset");
  const limitN = limitRaw && /^\d+$/.test(limitRaw) ? Number(limitRaw) : null;
  const offsetN =
    offsetRaw && /^\d+$/.test(offsetRaw) ? Number(offsetRaw) : null;
  const allCols = PUBLIC_COLUMNS[table];
  const aggregateRoot = aggregateRootField(table);

  if (methodUpper === "GET") {
    const fields = resolveSelectColumns(table, select).join(" ");
    const root = rootField(table, "select");
    const args = argClause([
      ["where", where],
      ["order_by", orderBy],
      ["limit", limitN],
      ["offset", offsetN],
    ]);
    const gql = `query { ${root}${args} { ${fields || "id"} } }`;
    return { gql, kind: "query", root, table, where, aggregateRoot };
  }

  if (methodUpper === "POST") {
    // PostgREST accepts a single object or an array of objects (bulk insert).
    const objects = Array.isArray(body)
      ? body
      : [body && typeof body === "object" ? body : {}];
    const root = rootField(table, "insert");
    const gql = `mutation { ${root}(objects: ${gqlLiteral(objects)}) { returning { ${allCols.join(" ")} } } }`;
    return { gql, kind: "insert", root, table, where, aggregateRoot };
  }

  if (methodUpper === "PATCH" || methodUpper === "PUT") {
    const set = body && typeof body === "object" ? body : {};
    const root = rootField(table, "update");
    const gql = `mutation { ${root}(where: ${gqlLiteral(where)}, _set: ${gqlLiteral(set)}) { returning { ${allCols.join(" ")} } } }`;
    return { gql, kind: "update", root, table, where, aggregateRoot };
  }

  if (methodUpper === "DELETE") {
    const root = rootField(table, "delete");
    const gql = `mutation { ${root}(where: ${gqlLiteral(where)}) { returning { ${allCols.join(" ")} } } }`;
    return { gql, kind: "delete", root, table, where, aggregateRoot };
  }

  throw new Error("unsupported method: " + methodUpper);
}

export function getHasuraConfig(env = {}) {
  const adminSecret =
    env.NHOST_ADMIN_SECRET || process.env.NHOST_ADMIN_SECRET || "";
  const graphqlUrl =
    env.NHOST_GRAPHQL_URL ||
    process.env.NHOST_GRAPHQL_URL ||
    "https://jopiirogydgupiwqiwac.graphql.eu-central-1.nhost.run/v1";
  return { adminSecret, graphqlUrl };
}

export async function hasuraGraphQL(env, gql) {
  const { adminSecret, graphqlUrl } = getHasuraConfig(env);
  if (!adminSecret) {
    throw new Error("NHOST_ADMIN_SECRET is not configured");
  }
  const res = await fetch(graphqlUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-hasura-admin-secret": adminSecret,
    },
    body: JSON.stringify({ query: gql }),
  });
  const json = await res.json().catch(() => ({}));
  if (json.errors && json.errors.length) {
    const message = json.errors[0].message || "GraphQL error";
    const err = new Error(message);
    err.graphqlErrors = json.errors;
    const full = JSON.stringify(json.errors);
    if (full.includes("duplicate key") || full.includes("23505")) {
      err.status = 409;
    }
    throw err;
  }
  return json.data;
}

export function extractRows(data, translated) {
  if (!data) return [];
  if (translated.kind === "query") {
    return Array.isArray(data[translated.root]) ? data[translated.root] : [];
  }
  const mutation = data[translated.root];
  return mutation && Array.isArray(mutation.returning)
    ? mutation.returning
    : [];
}

function jsonResponse(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS, PATCH, DELETE",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
      ...extraHeaders,
    },
  });
}

export async function fetchCount(env, table, where = {}) {
  const aggregateRoot = aggregateRootField(table);
  const whereArg = Object.keys(where).length
    ? `(where: ${gqlLiteral(where)})`
    : "";
  const gql = `query { ${aggregateRoot}${whereArg} { aggregate { count } } }`;
  const data = await hasuraGraphQL(env, gql);
  const count = data?.[aggregateRoot]?.aggregate?.count;
  return typeof count === "number" ? count : null;
}

export async function handleRestProxy(request, env = {}) {
  const url = new URL(request.url);
  const method = request.method.toUpperCase();
  // Accept both /rest/v1/* and /api/rest/v1/* (the latter rides the /api/*
  // asset route). Normalize to /rest/v1/* for the translator.
  const pathname = url.pathname.replace(/^\/api\/rest\/v1\//, "/rest/v1/");
  let body = null;
  if (["POST", "PATCH", "PUT"].includes(method)) {
    body = await request.json().catch(() => ({}));
  }

  // PostgREST `Range: 0-999` (or `items 0-999`) header -> limit/offset.
  const rangeHeader = request.headers.get("range") || "";
  const rm = /(\d+)-(\d*)/.exec(rangeHeader);
  let limit = null;
  let offset = null;
  if (rm) {
    const from = parseInt(rm[1], 10);
    const to = rm[2] ? parseInt(rm[2], 10) : null;
    offset = from;
    limit = to === null ? null : to - from + 1;
  }
  const preferHeader = request.headers.get("prefer") || "";
  const wantCount = /count=exact/i.test(preferHeader);

  try {
    const translated = translatePostgrest({
      method,
      pathname,
      searchParams: url.searchParams,
      body,
      limit,
      offset,
    });

    let data;
    let totalCount = null;
    if (method === "GET" && wantCount) {
      const [rowsData, count] = await Promise.all([
        hasuraGraphQL(env, translated.gql),
        fetchCount(env, translated.table, translated.where),
      ]);
      data = rowsData;
      totalCount = count;
    } else {
      data = await hasuraGraphQL(env, translated.gql);
    }

    const rows = extractRows(data, translated);
    const headers = {};
    if (totalCount !== null) {
      const from = offset || 0;
      const to = from + Math.max(rows.length - 1, 0);
      headers["Content-Range"] = `${from}-${to}/${totalCount}`;
    }

    return jsonResponse(rows, method === "POST" ? 201 : 200, headers);
  } catch (err) {
    const status = err.status || (err.graphqlErrors ? 400 : 500);
    return jsonResponse(
      {
        error: err.message || "Internal server error",
        message: err.message || "Internal server error",
      },
      status,
    );
  }
}

// Drop-in server-side replacement for the `fetch(<supabase-url>/rest/v1/...>)`
// calls in the admin/background services. Routes the PostgREST-style request
// through the same translator used by the HTTP proxy (admin secret stays
// server-side). Returns a Web `Response` so callers can keep using
// `res.ok`, `res.status`, `res.json()`, `res.text()`, `res.headers.get(...)`.
export async function supabaseFetch(env, url, init = {}) {
  const parsed = new URL(url);
  const proxyUrl = `http://nhost-proxy.local${parsed.pathname}${parsed.search}`;
  const req = new Request(proxyUrl, {
    method: init.method || "GET",
    headers: new Headers(init.headers || {}),
    body: init.body,
  });
  return handleRestProxy(req, env);
}
