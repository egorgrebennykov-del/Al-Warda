import workerEnv from "./workerEnv.js";
import cachedArabianPerfumes from "./data/cachedArabianPerfumes.json" with { type: "json" };
import {
  processLiteraChat,
  filterInquiryMessageWithAI,
  translateLiteraDialog,
} from "./literaAssistantService.js";
import { sendGuestInquiryEmail } from "./emailService.js";

const actionStatuses = {};

function syncProcessEnv(env) {
  if (!globalThis.process) {
    globalThis.process = { env: {} };
  }
  if (!globalThis.process.env) {
    globalThis.process.env = {};
  }
  Object.assign(globalThis.process.env, workerEnv || {}, env || {});
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS, PATCH, DELETE",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
    },
  });
}

export default {
  async fetch(request, env, ctx) {
    syncProcessEnv(env);

    if (request.method.toUpperCase() === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS, PATCH, DELETE",
          "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
        },
      });
    }

    const urlObj = new URL(request.url);
    const { pathname } = urlObj;
    const method = request.method.toUpperCase();

    if (method === "GET" && pathname === "/health") {
      return jsonResponse({ ok: true, store: "Al-Warda Parfumes" });
    }

    if (method === "POST" && pathname === "/api/warmup") {
      return jsonResponse({ ready: true });
    }

    // Arabian Perfumes dropship catalog API
    if (method === "GET" && (pathname === "/api/qogita/arabian-perfumes" || pathname === "/api/dropship-perfumes")) {
      const q = urlObj.searchParams.get("q")?.toLowerCase();
      let list = cachedArabianPerfumes;
      if (q) {
        list = list.filter(p => p.name?.toLowerCase().includes(q) || p.brand?.toLowerCase().includes(q));
      }
      return jsonResponse({ count: list.length, results: list });
    }

    // Perfume list API
    if (method === "GET" && pathname === "/api/perfumes") {
      const q = urlObj.searchParams.get("q")?.toLowerCase();
      let list = cachedArabianPerfumes;
      if (q) {
        list = list.filter(p => p.name?.toLowerCase().includes(q) || p.brand?.toLowerCase().includes(q));
      }
      return jsonResponse({ perfumes: list });
    }

    // Single perfume details API
    if (method === "GET" && pathname.startsWith("/api/perfumes/")) {
      const id = pathname.replace("/api/perfumes/", "").toLowerCase();
      const p = cachedArabianPerfumes.find(x => x.id?.toLowerCase() === id || x.slug?.toLowerCase() === id);
      if (p) return jsonResponse(p);
      return jsonResponse({ error: "Not found" }, 404);
    }

    // AI Concierge Chat (Yasmin)
    if (method === "POST" && (pathname === "/api/litera-chat" || pathname === "/api/warda-chat")) {
      try {
        const body = await request.json().catch(() => ({}));
        const isSse = request.headers.get("accept")?.includes("text/event-stream");

        if (isSse) {
          const encoder = new TextEncoder();
          const { readable, writable } = new TransformStream();
          const writer = writable.getWriter();

          const streamPromise = (async () => {
            try {
              let streamed = false;
              await processLiteraChat(body, {
                onChunk: async (chunk) => {
                  streamed = true;
                  await writer.write(encoder.encode(`data: ${JSON.stringify({ chunk })}\n\n`));
                },
              });
              if (!streamed) {
                const res = await processLiteraChat(body);
                await writer.write(encoder.encode(`data: ${JSON.stringify({ chunk: res.reply })}\n\n`));
              }
              await writer.write(encoder.encode("data: [DONE]\n\n"));
            } catch (err) {
              await writer.write(encoder.encode(`data: ${JSON.stringify({ error: err.message })}\n\n`));
            } finally {
              await writer.close();
            }
          })();

          if (ctx?.waitUntil) ctx.waitUntil(streamPromise);

          return new Response(readable, {
            headers: {
              "Content-Type": "text/event-stream",
              "Cache-Control": "no-cache",
              "Connection": "keep-alive",
              "Access-Control-Allow-Origin": "*",
            },
          });
        }

        const result = await processLiteraChat(body);
        return jsonResponse(result);
      } catch (err) {
        return jsonResponse({ error: "Yasmin assistant failed to respond", message: err.message }, 500);
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
        return jsonResponse({ allowed: false, message: err.message }, 500);
      }
    }

    if (method === "POST" && pathname === "/api/send-inquiry-email") {
      try {
        const body = await request.json().catch(() => ({}));
        const { to, userName, subject, text, adminName } = body || {};
        if (!to || !text) {
          return jsonResponse({ error: "Missing required fields: to, text" }, 400);
        }
        const result = await sendGuestInquiryEmail({ to, userName, subject, text, adminName });
        return jsonResponse({ success: true, result });
      } catch (err) {
        return jsonResponse({ error: "Failed to send inquiry email", message: err.message }, 500);
      }
    }

    if (method === "GET" && pathname === "/api/actions-status") {
      return jsonResponse({ actions: actionStatuses });
    }

    if (pathname.startsWith("/api/")) {
      return jsonResponse({ error: "Endpoint not found" }, 404);
    }

    // Static assets & SPA fallback
    if (env?.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response("Not found", { status: 404 });
  },
};
