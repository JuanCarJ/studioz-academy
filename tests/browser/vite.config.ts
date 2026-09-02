import { defineConfig } from "vite"
import { fileURLToPath } from "node:url"

const root = fileURLToPath(new URL("./", import.meta.url))
const repo = fileURLToPath(new URL("../../", import.meta.url))
export default defineConfig({
  root,
  envDir: root + "no-env",
  optimizeDeps: {
    noDiscovery: true,
    include: ["react", "react-dom", "react-dom/client", "react/jsx-runtime", "react/jsx-dev-runtime", "radix-ui", "lucide-react", "class-variance-authority", "clsx", "tailwind-merge"],
  },
  resolve: { alias: [
    ...["lessons", "progress", "purchases", "payments", "admin/operations"].map((name) => ({ find: `@/actions/${name}`, replacement: root + "actions.ts" })),
    { find: "@/lib/video-progress-client", replacement: root + "transport.ts" },
    { find: "@/hooks/use-csrf-token", replacement: root + "transport.ts" },
    { find: "@/lib/env", replacement: root + "transport.ts" },
    { find: "next/link", replacement: root + "next-link.tsx" },
    { find: "next/image", replacement: root + "next-image.tsx" },
    { find: "next/script", replacement: root + "next-script.tsx" },
    { find: "next/navigation", replacement: root + "navigation.ts" },
    { find: "@", replacement: repo + "src" },
  ] },
  plugins: [{
    name: "deny-real-server-modules",
    load(id) {
      if (/[/]src[/](actions[/]|lib[/]supabase[/])/.test(id) || id.endsWith("/src/lib/env.ts")) {
        throw new Error("Real server module blocked by the local UI harness")
      }
    },
  }],
  server: { host: "127.0.0.1", port: 4177, strictPort: true, hmr: false, fs: {
    allow: [repo],
    deny: [".env", ".env.*", "**/.git/**", "**/supabase/**", "*.{crt,pem}"],
  } },
  css: { postcss: repo },
  build: { outDir: "../../output/playwright/browser-build", emptyOutDir: false },
})
