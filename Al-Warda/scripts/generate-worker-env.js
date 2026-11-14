import { writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const targetFile = path.resolve(rootDir, "server", "workerEnv.js");

// Load `.env` so secrets (NHOST_ADMIN_SECRET, GITHUB_TOKEN, …) are available
// during `wrangler deploy`'s build step and get baked into workerEnv.js.
// Existing process.env values take precedence.
dotenv.config({ path: path.resolve(rootDir, ".env") });

const KEYS = [
  "GEMINI_API_KEY",
  "VITE_GEMINI_API_KEY",
  "SUPABASE_URL",
  "VITE_SUPABASE_URL",
  "SUPABASE_SECRET_KEY",
  "VITE_SUPABASE_ANON_KEY",
  "RESEND_API_KEY",
  "SUPPORT_EMAIL",
  "RESEND_FROM",
  "RESEND_REPLY_TO",
  "VITE_EMAILJS_SERVICE_ID",
  "VITE_EMAILJS_TEMPLATE_ID",
  "VITE_EMAILJS_PUBLIC_KEY",
  "EMAILJS_PRIVATE_KEY",
  "GITHUB_TOKEN",
  "GH_TOKEN",
  "NHOST_GRAPHQL_URL",
  "NHOST_ADMIN_SECRET",
];

// Always write workerEnv.js — even with an empty object — so the static
// `import workerEnv from "./workerEnv.js"` in server/worker.js always resolves
// during the Worker bundle step (including Cloudflare Git-integration builds
// where `.env` is absent). Secrets are only present when they exist in the
// build environment.
const envObj = {};
for (const key of KEYS) {
  if (process.env[key]) {
    envObj[key] = process.env[key];
  }
}
if (!envObj.GEMINI_API_KEY && envObj.VITE_GEMINI_API_KEY) {
  envObj.GEMINI_API_KEY = envObj.VITE_GEMINI_API_KEY;
}
const content = `// Auto-generated during build\nexport default ${JSON.stringify(envObj, null, 2)};\n`;
writeFileSync(targetFile, content, "utf8");
console.log(
  `[generate-worker-env] Wrote workerEnv.js with ${Object.keys(envObj).length} env key(s).`,
);
