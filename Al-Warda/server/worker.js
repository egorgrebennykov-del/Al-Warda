import workerEnv from "./workerEnv.js";
import {
  decodeLibrariusImage,
  searchLibrarius,
  getLibrariusDetails,
} from "./librariusService.js";
import {
  decodeCarturestiImage,
  decodeUlyssesImage,
  decodeCarteameaImage,
  decodeBiblionImage,
} from "../utils/enhancedImageUrl.js";
import {
  searchCarturesti,
  getCarturestiDetails,
} from "./carturestiService.js";
import {
  searchUlysses,
  getUlyssesDetails,
  thumbToHighRes,
} from "./ulyssesService.js";
import {
  searchCarteamea,
  getCarteameaDetails,
} from "./carteameaService.js";
import {
  searchBiblion,
  getBiblionDetails,
} from "./biblionService.js";
import {
  processLiteraChat,
  filterInquiryMessageWithAI,
  translateLiteraDialog,
} from "./literaAssistantService.js";
import { sendGuestInquiryEmail } from "./emailService.js";
import { executeCatalogActionById } from "./catalogActionsService.js";

const ACTIONS = {
  "update-book-picks": {
    id: "update-book-picks",
    name: "Update Book Picks",
    workflowFile: "update-book-picks.yml",
  },
  "update-home-books": {
    id: "update-home-books",
    name: "Update Homepage Books",
    workflowFile: "update-home-books.yml",
  },
  "update-new-books": {
    id: "update-new-books",
    name: "Update New Books",
    workflowFile: "update-new-books.yml",
  },
  "update-exchange-rate": {
    id: "update-exchange-rate",
    name: "Update Exchange Rate",
    workflowFile: "update-exchange-rate.yml",
  },
  "update-discounts": {
    id: "update-discounts",
    name: "Update Discount Books",
    workflowFile: "update-discounts.yml",
  },
};

const actionStatuses = {};
for (const key of Object.keys(ACTIONS)) {
  actionStatuses[key] = {
    status: "idle",
    lastRun: null,
    output: "",
    error: null,
  };
}

const AUTO_RUN_INTERVAL_MS = 6 * 60 * 60 * 1000;
let lastAutoRunAt = 0;
let autoRunInFlight = false;

async function triggerSingleAction(actionId) {
  const action = ACTIONS[actionId];
  if (!action) {
    throw new Error(`Unknown action: ${actionId}`);
  }
  const startedAt = new Date().toISOString();
  actionStatuses[actionId] = {
    status: "running",
    startedAt,
    lastRun: startedAt,
    output: `[${new Date().toLocaleTimeString()}] Running ${action.name}...\n`,
    error: null,
  };

  try {
    const githubToken =
      globalThis.process?.env?.GITHUB_TOKEN ||
      globalThis.process?.env?.GH_TOKEN;
    if (githubToken) {
      fetch(
        `https://api.github.com/repos/egorgrebennykov-del/Litera/actions/workflows/${action.workflowFile}/dispatches`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${githubToken}`,
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "Litera-App",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ ref: "main" }),
        },
      ).catch(() => {});
    }

    const summary = await executeCatalogActionById(actionId);
    const finishedAt = new Date().toISOString();
    actionStatuses[actionId] = {
      status: "success",
      startedAt,
      finishedAt,
      lastRun: finishedAt,
      method: "auto-worker",
      output: `[${new Date().toLocaleTimeString()}] ${summary}\n`,
      error: null,
    };
    return actionStatuses[actionId];
  } catch (err) {
    const finishedAt = new Date().toISOString();
    actionStatuses[actionId] = {
      status: "error",
      startedAt,
      finishedAt,
      lastRun: finishedAt,
      output: `[${new Date().toLocaleTimeString()}] Error: ${err.message}\n`,
      error: err.message,
    };
    throw err;
  }
}

async function runScheduledCatalogActions() {
  if (autoRunInFlight) return;
  autoRunInFlight = true;
  lastAutoRunAt = Date.now();
  try {
    const now = new Date();
    const isMonday = now.getUTCDay() === 1;
    const isFirstOfMonth = now.getUTCDate() === 1;

    // Daily at 03:00: Exchange Rate & Discounts
    const order = ["update-exchange-rate", "update-discounts"];
    // Weekly on Monday at 03:00: New Books & Book Picks
    if (isMonday) {
      order.push("update-new-books", "update-book-picks");
    }
    // Monthly on the 1st at 03:00: Homepage Books
    if (isFirstOfMonth) {
      order.push("update-home-books");
    }

    for (const id of order) {
      try {
        await triggerSingleAction(id);
      } catch (err) {
        console.warn(`Auto action ${id} warning:`, err.message);
      }
    }
  } finally {
    autoRunInFlight = false;
  }
}

function syncProcessEnv(env) {
  if (!globalThis.process) {
    globalThis.process = { env: {} };
  }
  if (!globalThis.process.env) {
    globalThis.process.env = {};
  }
  const target = globalThis.process.env;
  for (const [k, v] of Object.entries(workerEnv || {})) {
    if (typeof v === "string" && v && !target[k]) {
      target[k] = v;
    }
  }
  for (const [k, v] of Object.entries(env || {})) {
    if (typeof v === "string" && v) {
      target[k] = v;
    }
  }
  if (!target.GEMINI_API_KEY && target.VITE_GEMINI_API_KEY) {
    target.GEMINI_API_KEY = target.VITE_GEMINI_API_KEY;
  }
  if (!target.SUPABASE_URL && target.VITE_SUPABASE_URL) {
    target.SUPABASE_URL = target.VITE_SUPABASE_URL;
  }
  if (!target.SUPABASE_SECRET_KEY && target.VITE_SUPABASE_ANON_KEY) {
    target.SUPABASE_SECRET_KEY = target.VITE_SUPABASE_ANON_KEY;
  }
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function resolveHighResImageUrl(sourceUrl) {
  let target = sourceUrl;
  if (target.startsWith("/api/enhance-image?url=")) {
    try {
      target =
        new URL(target, "http://localhost").searchParams.get("url") || target;
    } catch {
      // ignore
    }
  }
  if (target.includes("librarius.md")) return decodeLibrariusImage(target);
  if (target.includes("carturesti.md")) return decodeCarturestiImage(target);
  if (target.includes("ulysses.md")) {
    return thumbToHighRes.get(target) || decodeUlyssesImage(target);
  }
  if (target.includes("carteamea.md")) return decodeCarteameaImage(target);
  if (target.includes("biblion.md")) return decodeBiblionImage(target);
  return target;
}

async function handleEnhanceImage(request, urlObj, ctx) {
  const sourceUrl = urlObj.searchParams.get("url") || "";
  if (!sourceUrl) {
    return jsonResponse({ error: "Invalid image URL" }, 400);
  }
  const cache = globalThis.caches?.default;
  if (cache) {
    try {
      const cachedRes = await cache.match(request);
      if (cachedRes) return cachedRes;
    } catch {
      // ignore cache read errors
    }
  }
  const resolved = resolveHighResImageUrl(sourceUrl);
  try {
    const parsed = new URL(resolved);
    const res = await fetch(resolved, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Referer: `${parsed.protocol}//${parsed.host}/`,
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      },
    });
    if (!res.ok) {
      return Response.redirect(resolved, 302);
    }
    const response = new Response(res.body, {
      status: 200,
      headers: {
        "Content-Type": res.headers.get("content-type") || "image/jpeg",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
    if (cache) {
      try {
        const putTask = cache.put(request, response.clone());
        if (ctx?.waitUntil) ctx.waitUntil(putTask);
      } catch {
        // ignore cache write errors
      }
    }
    return response;
  } catch {
    return jsonResponse({ error: "Could not load image" }, 502);
  }
}

export default {
  async scheduled(event, env, ctx) {
    syncProcessEnv(env);
    const task = runScheduledCatalogActions();
    if (ctx?.waitUntil) {
      ctx.waitUntil(task);
    } else {
      await task;
    }
  },

  async fetch(request, env, ctx) {
    syncProcessEnv(env);

    const urlObj = new URL(request.url);
    const { pathname } = urlObj;
    const method = request.method.toUpperCase();

    if (method === "GET" && pathname === "/health") {
      return jsonResponse({ ok: true });
    }

    if (method === "POST" && pathname === "/api/warmup") {
      return jsonResponse({ ready: true });
    }

    if (method === "GET" && pathname === "/api/enhance-image") {
      return handleEnhanceImage(request, urlObj, ctx);
    }

    if (method === "GET" && pathname === "/api/search-librarius") {
      const q = urlObj.searchParams.get("q") ?? "";
      const fast = urlObj.searchParams.get("fast") === "1";
      try {
        const products = await searchLibrarius(q, fast ? 1 : 10);
        return jsonResponse({ products });
      } catch (err) {
        return jsonResponse({ error: err.message }, 500);
      }
    }

    if (method === "GET" && pathname === "/api/search-carturesti") {
      const q = urlObj.searchParams.get("q") ?? "";
      const fast = urlObj.searchParams.get("fast") === "1";
      try {
        const products = await searchCarturesti(q, fast ? 1 : 10);
        return jsonResponse({ products });
      } catch (err) {
        return jsonResponse({ error: err.message }, 500);
      }
    }

    if (method === "GET" && pathname === "/api/search-ulysses") {
      const q = urlObj.searchParams.get("q") ?? "";
      const fast = urlObj.searchParams.get("fast") === "1";
      try {
        const products = await searchUlysses(q, fast ? 1 : 6);
        return jsonResponse({ products });
      } catch (err) {
        return jsonResponse({ error: err.message }, 500);
      }
    }

    if (method === "GET" && pathname === "/api/search-carteamea") {
      const q = urlObj.searchParams.get("q") ?? "";
      const fast = urlObj.searchParams.get("fast") === "1";
      try {
        const products = await searchCarteamea(q, fast ? 1 : 10);
        return jsonResponse({ products });
      } catch (err) {
        return jsonResponse({ error: err.message }, 500);
      }
    }

    if (method === "GET" && pathname === "/api/search-biblion") {
      const q = urlObj.searchParams.get("q") ?? "";
      const fast = urlObj.searchParams.get("fast") === "1";
      try {
        const products = await searchBiblion(q, fast ? 1 : 10);
        return jsonResponse({ products });
      } catch (err) {
        return jsonResponse({ error: err.message }, 500);
      }
    }

    if (method === "GET" && pathname === "/api/search-all") {
      const q = urlObj.searchParams.get("q") ?? "";
      try {
        const [librarius, carturesti, ulysses, carteamea, biblion] =
          await Promise.all([
            searchLibrarius(q).catch(() => []),
            searchCarturesti(q).catch(() => []),
            searchUlysses(q).catch(() => []),
            searchCarteamea(q).catch(() => []),
            searchBiblion(q).catch(() => []),
          ]);
        return jsonResponse({
          librarius,
          carturesti,
          ulysses,
          carteamea,
          biblion,
        });
      } catch (err) {
        return jsonResponse({ error: err.message }, 500);
      }
    }

    if (method === "GET" && pathname === "/api/book-details") {
      const bookUrl = urlObj.searchParams.get("url") ?? "";
      try {
        if (bookUrl.includes("librarius.md")) {
          const product = await getLibrariusDetails(bookUrl);
          return jsonResponse({ product });
        }
        if (bookUrl.includes("carturesti.md")) {
          const product = await getCarturestiDetails(bookUrl);
          return jsonResponse({ product });
        }
        if (bookUrl.includes("ulysses.md")) {
          const product = await getUlyssesDetails(bookUrl);
          return jsonResponse({ product });
        }
        if (bookUrl.includes("carteamea.md")) {
          const product = await getCarteameaDetails(bookUrl);
          return jsonResponse({ product });
        }
        if (bookUrl.includes("biblion.md")) {
          const product = await getBiblionDetails(bookUrl);
          return jsonResponse({ product });
        }
        return jsonResponse({ error: "Unsupported bookstore URL" }, 400);
      } catch (err) {
        return jsonResponse({ error: err.message }, 500);
      }
    }

    if (method === "POST" && pathname === "/api/litera-chat") {
      try {
        const body = await request.json().catch(() => ({}));
        const isSse = request.headers.get("accept")?.includes("text/event-stream");

        if (isSse) {
          const encoder = new TextEncoder();
          const { readable, writable } = new TransformStream();
          const writer = writable.getWriter();

          const runAsync = async () => {
            try {
              const onStatus = (status) => {
                writer
                  .write(
                    encoder.encode(
                      `data: ${JSON.stringify({ type: "status", status })}\n\n`,
                    ),
                  )
                  .catch(() => {});
              };
              const result = await processLiteraChat({ ...body, onStatus });
              await writer.write(
                encoder.encode(
                  `data: ${JSON.stringify({ type: "result", ...result })}\n\n`,
                ),
              );
            } catch (err) {
              await writer
                .write(
                  encoder.encode(
                    `data: ${JSON.stringify({
                      type: "result",
                      message:
                        body?.language === "en"
                          ? "Oops, it seems there was a minor connection glitch! 💜 Please try asking again."
                          : "Ой, кажется, произошла небольшая заминка со связью! 💜 Пожалуйста, попробуйте отправить вопрос ещё раз.",
                      emotion: "concerned",
                      books: [],
                    })}\n\n`,
                  ),
                )
                .catch(() => {});
            } finally {
              await writer.close().catch(() => {});
            }
          };

          runAsync();

          return new Response(readable, {
            status: 200,
            headers: {
              "Content-Type": "text/event-stream; charset=utf-8",
              "Cache-Control": "no-cache, no-transform",
              Connection: "keep-alive",
            },
          });
        }

        const result = await processLiteraChat(body);
        return jsonResponse(result);
      } catch (err) {
        return jsonResponse(
          {
            error: "Litera assistant failed to respond",
            message: err.message,
          },
          500,
        );
      }
    }

    if (method === "POST" && pathname === "/api/litera-translate") {
      try {
        const body = await request.json().catch(() => ({}));
        const result = await translateLiteraDialog({
          messages: body?.messages,
          targetLanguage: body?.targetLanguage,
        });
        return jsonResponse(result);
      } catch (err) {
        return jsonResponse({ translations: [], error: err.message }, 500);
      }
    }

    if (method === "POST" && pathname === "/api/filter-inquiry-message") {
      try {
        const body = await request.json().catch(() => ({}));
        const { text, language } = body || {};
        const result = await filterInquiryMessageWithAI({ text, language });
        return jsonResponse(result);
      } catch (err) {
        return jsonResponse(
          {
            allowed: false,
            reason: "Ошибка проверки сообщения. Пожалуйста, попробуйте еще раз.",
            message: err.message,
          },
          500,
        );
      }
    }

    if (method === "POST" && pathname === "/api/send-inquiry-email") {
      try {
        const body = await request.json().catch(() => ({}));
        const { to, userName, subject, text, adminName } = body || {};
        if (!to || !text) {
          return jsonResponse(
            { error: "Missing required fields: to, text" },
            400,
          );
        }
        const result = await sendGuestInquiryEmail({
          to,
          userName,
          subject,
          text,
          adminName,
        });
        return jsonResponse({ success: true, result });
      } catch (err) {
        return jsonResponse(
          {
            error: "Failed to send inquiry email",
            message: err.message,
          },
          500,
        );
      }
    }

    if (method === "GET" && pathname === "/api/actions-status") {
      return jsonResponse({ actions: actionStatuses });
    }

    if (method === "POST" && pathname === "/api/run-action") {
      try {
        const body = await request.json().catch(() => ({}));
        const actionId = body?.actionId;
        const action = ACTIONS[actionId];
        if (!action) {
          return jsonResponse({ error: `Unknown action: ${actionId}` }, 400);
        }
        const runPromise = triggerSingleAction(actionId).catch(() => {});
        if (ctx?.waitUntil) {
          ctx.waitUntil(runPromise);
        }
        return jsonResponse({
          success: true,
          method: "auto-worker",
          message: `Started ${action.name}`,
        });
      } catch (err) {
        return jsonResponse({ error: err.message }, 500);
      }
    }

    if (method === "POST" && pathname === "/api/dedupe-books") {
      try {
        const body = await request.json().catch(() => ({}));
        const books = Array.isArray(body?.books) ? body.books : [];
        return jsonResponse({ books });
      } catch (err) {
        return jsonResponse({ error: err.message }, 500);
      }
    }

    if (pathname.startsWith("/api/")) {
      return jsonResponse({ error: "Not found" }, 404);
    }

    if (env?.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response("Not found", { status: 404 });
  },
};
