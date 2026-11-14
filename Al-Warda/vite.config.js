import react from "@vitejs/plugin-react";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import { defineConfig } from "vite";

export function generatedImageFallback() {
  return {
    name: "generated-image-fallback",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const path = new URL(req.url, "http://localhost").pathname;
        if (
          !["GET", "HEAD"].includes(req.method) ||
          !/^\/assets\/img\/generated-products\/[a-f0-9]{64}\.png$/.test(path)
        ) {
          return next();
        }
        try {
          if (
            (await stat(join(server.config.publicDir, path.slice(1)))).isFile()
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
  server: {
    proxy: {
      "/api": { target: "http://localhost:3001", changeOrigin: false },
      "/rest/v1": { target: "http://localhost:3001", changeOrigin: false },
    },
  },
});
