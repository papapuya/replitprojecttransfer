import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

export default defineConfig({
  define: {
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(
      process.env.VITE_SUPABASE_URL || 'https://lxemqwvdaxzeldpjmxoc.supabase.co'
    ),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(
      process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx4ZW1xd3ZkYXh6ZWxkcGpteG9jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE4MTM3MDgsImV4cCI6MjA3NzM4OTcwOH0.Skn1wZFzXEIbYi-CEE7VxJfL2zzkuHjAoSC6eRmM6Ts'
    ),
  },
  plugins: [
    react(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer(),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    sourcemap: false,  // Disable source maps in dev to reduce CPU
  },
  optimizeDeps: {
    exclude: ['lucide-react'],  // Don't pre-bundle heavy icon libraries
  },
  server: {
    host: '0.0.0.0',
    port: 5000,
    strictPort: false,
    hmr: {
      clientPort: 443,
    },
    watch: {
      usePolling: false,  // Disable polling, use native file system events
      interval: 1000,     // Slower polling if needed
    },
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 5000,
  },
  base: '/',
});
