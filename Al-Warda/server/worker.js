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


function enrichPerfumeObj(p) {
  if (!p) return p;
  const name = (p.name || p.title || "").toLowerCase();
  let topRu = p.topNotesRu || p.topNotes;
  let heartRu = p.heartNotesRu || p.heartNotes;
  let baseRu = p.baseNotesRu || p.baseNotes;
  let topEn = p.topNotesEn || topRu;
  let heartEn = p.heartNotesEn || heartRu;
  let baseEn = p.baseNotesEn || baseRu;

  if (!topRu || !topRu.length) {
    if (name.includes("vanilla") || name.includes("rose")) {
      topRu = ["Розовый перец", "Ваниль", "Сладкий персик"];
      heartRu = ["Дамасская роза", "Жасмин", "Лепестки фиалки"];
      baseRu = ["Мадагаскарская ваниль", "Белый мускус", "Золотая амбра"];
      topEn = ["Pink Pepper", "Vanilla", "Sweet Peach"];
      heartEn = ["Damask Rose", "Jasmine", "Violet Petals"];
      baseEn = ["Madagascar Vanilla", "White Musk", "Golden Amber"];
    } else {
      topRu = ["Шафран", "Бергамот", "Розовый перец"];
      heartRu = ["Дамасская роза", "Благородный уд", "Амбра"];
      baseRu = ["Белый мускус", "Сандал", "Мадагаскарская ваниль"];
      topEn = ["Saffron", "Bergamot", "Pink Pepper"];
      heartEn = ["Damask Rose", "Precious Oud", "Amber"];
      baseEn = ["White Musk", "Sandalwood", "Madagascar Vanilla"];
    }
  }

  let descRu = p.descriptionRu || p.description;
  if (!descRu || descRu.includes("Сертифицированная оригинальная") || descRu.length < 30) {
    descRu = `${p.name} от бренда ${p.brand} — изысканный восточный аромат. Раскрывается аккордами: ${topRu.join(", ")}, с сердцем из ${heartRu.join(", ")} и чувственным шлейфом: ${baseRu.join(", ")}.`;
  }
  let descEn = p.descriptionEn;
  if (!descEn || descEn.includes("Сертифицированная оригинальная") || descEn.length < 30) {
    descEn = `${p.name} by ${p.brand} is an authentic luxury fragrance. Opening with ${(topEn || topRu).join(", ")}, leading into ${(heartEn || heartRu).join(", ")}, resting upon ${(baseEn || baseRu).join(", ")}.`;
  }

  return {
    ...p,
    topNotes: topRu,
    heartNotes: heartRu,
    baseNotes: baseRu,
    topNotesRu: topRu,
    heartNotesRu: heartRu,
    baseNotesRu: baseRu,
    topNotesEn: topEn,
    heartNotesEn: heartEn,
    baseNotesEn: baseEn,
    description: descRu,
    descriptionRu: descRu,
    descriptionEn: descEn,
  };
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

    // Stocks API (Supabase proxy / fallback)
    if (method === "GET" && (pathname === "/api/stocks" || pathname === "/api/qogita/arabian-perfumes" || pathname === "/api/dropship-perfumes")) {
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

    // Single perfume details API (supports direct ID, slug, or SEO URL with name)
    if (method === "GET" && pathname.startsWith("/api/perfumes/")) {
      const rawParam = decodeURIComponent(pathname.replace("/api/perfumes/", "")).toLowerCase().trim();
      let p = cachedArabianPerfumes.find(x => x.id?.toLowerCase() === rawParam || x.slug?.toLowerCase() === rawParam);
      if (!p) {
        const trailingDropship = rawParam.match(/(dropship-\d+)$/i);
        if (trailingDropship) {
          p = cachedArabianPerfumes.find(x => x.id?.toLowerCase() === trailingDropship[1]);
        }
      }
      if (!p) {
        const trailingNum = rawParam.match(/-(\d+)$/);
        if (trailingNum) {
          p = cachedArabianPerfumes.find(x => x.id === trailingNum[1]);
        }
      }
      if (!p) {
        const letters = rawParam.replace(/[^a-z0-9]/g, "");
        p = cachedArabianPerfumes.find(x => {
          const xLetters = (x.name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
          return xLetters && (letters === xLetters || letters.includes(xLetters) || xLetters.includes(letters));
        });
      }
      if (p) return jsonResponse(enrichPerfumeObj(p));
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
