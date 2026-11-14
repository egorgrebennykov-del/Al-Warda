// thin_proxy_translator.mjs — PREPARED, NOT RUN AGAINST REAL HASURA.
//
// Maps the PostgREST-style requests the Al-Warda app actually sends onto
// Hasura GraphQL. Core of the thin-proxy approach:
//   Frontend -> Cloudflare Worker -> Nhost Hasura GraphQL -> PostgreSQL
//
// IMPORTANT: validated ONLY by a mock test (thin_proxy_translator.test.mjs).
// Not executed against a real Nhost/Hasura endpoint. The GraphQL text is a
// PROPOSAL (where/order_by are shown as JSON strings for readability; a real
// proxy must build proper GraphQL with variables). JSONB arrow filters need
// verification on a real project and may require a computed column/view.

function parseSelect(select) {
  if (!select || select === "*") return null;
  return select.split(",").map((c) => c.trim()).filter(Boolean);
}

function cast(v) {
  if (v === "true") return true;
  if (v === "false") return false;
  if (v === "null") return null;
  if (/^-?\d+$/.test(v)) return Number(v);
  return v;
}

function filterToWhere(col, op, value) {
  if (op === "eq") return { [col]: { _eq: cast(value) } };
  if (op === "neq") return { [col]: { _neq: cast(value) } };
  if (op === "ilike") return { [col]: { _ilike: value } };
  if (op === "is") return { [col]: { _eq: value === "null" ? null : cast(value) } };
  return { [col]: { _eq: cast(value) } };
}

// PostgREST: ?id=eq.10  -> key="id", value="eq.10"
//            ?or=(a.ilike.x,b.ilike.y) -> key="or"
function buildWhere(query) {
  const where = {};
  for (const [col, raw] of query) {
    if (col === "or") {
      const parts = raw.slice(1, -1).split(",");
      where._or = parts.map((p) => {
        const [c, op, ...rest] = p.split(".");
        return filterToWhere(c, op, rest.join("."));
      });
      continue;
    }
    const dot = raw.indexOf(".");
    if (dot === -1) continue;
    const op = raw.slice(0, dot);
    const val = raw.slice(dot + 1);
    Object.assign(where, filterToWhere(col, op, val));
  }
  return where;
}

function buildOrderBy(order) {
  if (!order) return null;
  return order.split(",").map((o) => {
    const [col, dir] = o.split(".");
    return { [col]: (dir || "asc").toLowerCase() };
  });
}

function columns(fields) {
  return fields ? fields.join(" ") : "id";
}

export function translatePostgrest({ method = "GET", path = "", query = new URLSearchParams(), body = null }) {
  const m = /^\/rest\/v1\/([A-Za-z0-9_]+)$/.exec(path);
  if (!m) throw new Error("unsupported path: " + path);
  const table = m[1];
  const select = parseSelect(query.get("select"));
  const where = buildWhere(query);
  const orderBy = buildOrderBy(query.get("order"));
  const limit = query.get("limit");
  const offset = query.get("offset");

  const whereArg = Object.keys(where).length ? ", where: " + JSON.stringify(where) : "";
  const orderArg = orderBy ? ", order_by: " + JSON.stringify(orderBy) : "";
  const limitArg = limit ? ", limit: " + Number(limit) : "";
  const offsetArg = offset ? ", offset: " + Number(offset) : "";

  if (method === "GET") {
    const fields = columns(select);
    return { gql: "query { " + table + whereArg + orderArg + limitArg + offsetArg + " { " + fields + " } }", variables: {}, kind: "query", table, columns: select };
  }

  if (method === "POST") {
    const object = body || {};
    return { gql: "mutation { insert_" + table + "(objects: " + JSON.stringify([object]) + ") { returning { id } } }", variables: {}, kind: "insert", table };
  }

  if (method === "PATCH") {
    const set = body || {};
    return { gql: "mutation { update_" + table + "(where: " + JSON.stringify(where) + ", _set: " + JSON.stringify(set) + ") { returning { id } } }", variables: {}, kind: "update", table };
  }

  if (method === "DELETE") {
    return { gql: "mutation { delete_" + table + "(where: " + JSON.stringify(where) + ") { returning { id } } }", variables: {}, kind: "delete", table };
  }

  throw new Error("unsupported method: " + method);
}

// PostgREST JSONB arrow filter -> Hasura _contains.
//   info->imageGeneration->>status=eq.completed
// => where: { info: { _contains: { imageGeneration: { status: "completed" } } } }
// NOT PROVEN against real Hasura; may require a computed column/view.
export function jsonbArrowToWhere(column, arrowExpr, op, value) {
  const keys = arrowExpr.split(/->>?/).filter(Boolean); // ["info","imageGeneration","status"]
  const nested = keys.slice(1).reduceRight((acc, k) => ({ [k]: acc }), cast(value));
  return { [column]: { _contains: nested } };
}
