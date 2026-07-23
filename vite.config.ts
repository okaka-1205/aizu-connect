import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/@firebase/auth")) return "firebase-auth";
          if (id.includes("node_modules/@firebase/firestore")) {
            return "firebase-firestore";
          }
          if (id.includes("node_modules/@firebase/functions")) {
            return "firebase-functions";
          }
          if (id.includes("node_modules/@firebase/storage")) {
            return "firebase-storage";
          }
          if (
            id.includes("node_modules/@firebase/") ||
            id.includes("node_modules/firebase/")
          ) {
            return "firebase-core";
          }
          if (id.includes("node_modules/lucide-react/")) return "icons";
          return undefined;
        },
      },
    },
  },
});
