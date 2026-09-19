import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (/[\\/]react(?:-dom|-router-dom)?[\\/]|[\\/]scheduler[\\/]|[\\/]history[\\/]/.test(id)) return "react-vendor";
          if (/[\\/]react-markdown[\\/]|[\\/]remark-[^\\/]+[\\/]|[\\/]rehype-[^\\/]+[\\/]|[\\/]unified[\\/]|[\\/]mdast[\\/]|[\\/]micromark[\\/]/.test(id)) return "markdown-vendor";
          return undefined;
        },
      },
    },
  },
  server: { proxy: { "/api": "http://localhost:8787" } },
});
