import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  build: {
    emptyOutDir: false,
  },
  server: {
    proxy: { "/api": { target: "http://localhost:3001", changeOrigin: false } },
  },
});
