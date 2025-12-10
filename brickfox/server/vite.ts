import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { createServer as createViteServer, createLogger } from "vite";
import { type Server } from "http";
import viteConfig from "../vite.config";
import { nanoid } from "nanoid";

const viteLogger = createLogger();

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

export async function setupVite(app: Express, server: Server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      },
    },
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "..",
        "client",
        "index.html",
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`,
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  // In production, the bundled server is in dist/index.js
  // and static files are in dist/public
  const isProduction = process.env.NODE_ENV === 'production';
  const distPath = isProduction 
    ? path.join(process.cwd(), 'dist', 'public')
    : path.resolve(import.meta.dirname, '..', 'dist', 'public');

  if (!fs.existsSync(distPath)) {
    console.error(`❌ Build directory not found at: ${distPath}`);
    console.error(`Current directory: ${process.cwd()}`);
    console.error(`NODE_ENV: ${process.env.NODE_ENV}`);
    try {
      console.error(`Files in cwd:`, fs.readdirSync(process.cwd()));
      if (fs.existsSync(path.join(process.cwd(), 'dist'))) {
        console.error(`Files in dist:`, fs.readdirSync(path.join(process.cwd(), 'dist')));
      }
    } catch (e) {
      console.error('Could not list files:', e);
    }
    throw new Error(
      `Could not find the build directory: ${distPath}`,
    );
  }

  console.log(`✅ Serving static files from: ${distPath}`);
  app.use(express.static(distPath, {
    maxAge: '1d',
    etag: true,
    lastModified: true
  }));

  // fall through to index.html if the file doesn't exist
  app.use("*", (_req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
}
