import react from "@vitejs/plugin-react";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import { defineConfig } from "vite";

export function generatedImageFallback() {
  return {
    name: "generated-image-fallback",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const path = new URL(req.url, "http://localhost").pathname;
        if (
          !["GET", "HEAD"].includes(req.method) ||
          !/^\/assets\/img\/generated-products\/[a-f0-9]{64}\.(png|webp)$/.test(path)
        ) {
          return next();
        }
        try {
          const publicDir = server.config.publicDir || join(server.config.root || process.cwd(), "public");
          if (
            (await stat(join(publicDir, path.slice(1)))).isFile()
          )
            return next();
          return next(new Error("Generated image path is not a file"));
        } catch (error) {
          if (error.code !== "ENOENT") return next(error);
          res.writeHead(307, {
            Location: `https://al-warda.egor-grebennykov.workers.dev${path}`,
            "Cache-Control": "no-store",
          });
          res.end();
        }
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const path = new URL(req.url, "http://localhost").pathname;
        if (
          !["GET", "HEAD"].includes(req.method) ||
          !/^\/assets\/img\/generated-products\/[a-f0-9]{64}\.(png|webp)$/.test(path)
        ) {
          return next();
        }
        const safePath = path.slice(1);
        const root = server.config.root || process.cwd();
        const candidatePaths = [
          join(root, "dist", safePath),
          join(root, "public", safePath),
        ];
        for (const candidate of candidatePaths) {
          try {
            const fileStat = await stat(candidate);
            if (fileStat.isFile()) {
              res.writeHead(200, {
                "Content-Type": path.endsWith(".webp") ? "image/webp" : "image/png",
                "Cache-Control": "public, max-age=31536000, immutable",
              });
              if (req.method === "HEAD") return res.end();
              createReadStream(candidate).pipe(res);
              return;
            }
          } catch {}
        }
        res.writeHead(307, {
          Location: `https://al-warda.egor-grebennykov.workers.dev${path}`,
          "Cache-Control": "no-store",
        });
        res.end();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), generatedImageFallback()],
  build: {
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (
            id.includes("node_modules/react/") ||
            id.includes("node_modules/react-dom/")
          ) {
            return "vendor-react";
          }
          if (
            id.includes("node_modules/react-router") ||
            id.includes("node_modules/@remix-run/router")
          ) {
            return "vendor-router";
          }
        },
      },
    },
  },
  preview: {
    proxy: {
      "/api": { target: "http://localhost:3001", changeOrigin: false },
      "/rest/v1": { target: "http://localhost:3001", changeOrigin: false },
    },
  },
  server: {
    proxy: {
      "/api": { target: "http://localhost:3001", changeOrigin: false },
      "/rest/v1": { target: "http://localhost:3001", changeOrigin: false },
    },
  },
});
