// test_hasura_proxy.mjs — runs the real PostgREST→GraphQL proxy against the
// live Nhost Hasura endpoint. Read-only checks (no inserts/updates/deletes).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  translatePostgrest,
  hasuraGraphQL,
  extractRows,
} from "../../../../server/hasuraProxy.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, "../../../../.env");
const env = {};
for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m) env[m[1]] = m[2].trim();
}

function qs(obj) {
  return new URLSearchParams(obj);
}

async function run(
  name,
  { method = "GET", pathname, params = {}, body = null, dryRun = false },
) {
  const translated = translatePostgrest({
    method,
    pathname,
    searchParams: qs(params),
    body,
  });
  console.log(`\n=== ${name} ===`);
  console.log("GQL:", translated.gql);
  if (dryRun) return;
  try {
    const data = await hasuraGraphQL(env, translated.gql);
    const rows = extractRows(data, translated);
    console.log(`rows: ${rows.length}`);
    console.log(JSON.stringify(rows.slice(0, 2), null, 2).slice(0, 800));
  } catch (err) {
    console.log("ERROR:", err.message, err.status || "");
  }
}

await run("stocks light catalog (jsonb filter)", {
  pathname: "/rest/v1/stocks",
  params: {
    select:
      "id,slug,name,title,brand,category,price,currency,image,in_stock,description",
    order: "id.asc",
    "info->imageGeneration->>status": "eq.completed",
    limit: "3",
    offset: "0",
  },
});

await run("stocks by id", {
  pathname: "/rest/v1/stocks",
  params: { select: "id,name,brand,image,info", id: "eq.6860", limit: "1" },
});

await run("user findByEmail (or ilike)", {
  pathname: "/rest/v1/user",
  params: {
    select: "id,firstname,lastname,email,password_hash,status,role",
    or: "(email.ilike.test_vip_1,firstname.ilike.test_vip_1)",
    limit: "1",
  },
});

await run("user by id", {
  pathname: "/rest/v1/user",
  params: {
    select: "id,firstname,lastname,email,phone,adresses,status,role",
    id: "eq.43d0b7ab-7da3-46d2-927e-f85d4024da7a",
    limit: "1",
  },
});

await run("cart by user_id", {
  pathname: "/rest/v1/cart",
  params: { user_id: "eq.7d2cd09b-a3d1-48e2-9d61-9201616d1b75" },
});

await run("announcements list", {
  pathname: "/rest/v1/announcements",
  params: {
    select: "id,content_ru,content_en,created_at",
    order: "created_at.desc",
  },
});

await run("inquiries by adminId (jsonb arrow)", {
  pathname: "/rest/v1/inquiries",
  params: {
    select: "id,notifications_user",
    "interlocutors_info->>userEmail": "eq.egor.grebennykov@gmail.com",
    order: "created_at.desc",
    limit: "1",
  },
});

// Dry-run translations for mutations (no execution).
await run("register (POST dry-run)", {
  method: "POST",
  pathname: "/rest/v1/user",
  body: {
    firstname: "X",
    lastname: "Y",
    email: "x@y.z",
    password_hash: "$2b$10$hash",
    phone: ["+1"],
    status: "user",
    role: ["user"],
  },
  dryRun: true,
});

await run("reset password (PATCH dry-run)", {
  method: "PATCH",
  pathname: "/rest/v1/user",
  params: { id: "eq.43d0b7ab-7da3-46d2-927e-f85d4024da7a" },
  body: { password_hash: "$2b$10$hash" },
  dryRun: true,
});

await run("legacy book_picks alias (GET)", {
  pathname: "/rest/v1/book_picks",
  params: { select: "books", limit: "1" },
});
