import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // 資料直接讀 repo 根目錄的 data/，不另外複製一份，避免兩邊走鐘
  server: { fs: { allow: [".."] } },
});
