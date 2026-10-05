import { cloudflare } from "@cloudflare/vite-plugin";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { createReadStream, existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import { VitePWA } from "vite-plugin-pwa";

/**
 * Arquivos auxiliares do pdf.js (fontes padrão, CMaps, decodificadores wasm) servidos em /pdfjs/.
 * Sem eles alguns PDFs (fontes não embutidas, CJK, imagens JPEG 2000) não renderizam direito.
 */
function pdfjsAssets(): Plugin {
  const root = fileURLToPath(new URL("./node_modules/pdfjs-dist/", import.meta.url));
  const dirs = ["cmaps", "standard_fonts", "wasm", "iccs"];
  return {
    name: "estante:pdfjs-assets",
    applyToEnvironment: (env) => env.name === "client",
    configureServer(server) {
      server.middlewares.use("/pdfjs", (req, res, next) => {
        const rel = normalize(decodeURIComponent((req.url ?? "").split("?")[0])).replace(/^([/\\])+/, "");
        const file = join(root, rel);
        if (!file.startsWith(root) || !dirs.some((d) => rel.startsWith(d))) return next();
        try {
          if (!statSync(file).isFile()) return next();
        } catch {
          return next();
        }
        if (file.endsWith(".wasm")) res.setHeader("content-type", "application/wasm");
        createReadStream(file).pipe(res);
      });
    },
    generateBundle() {
      for (const dir of dirs) {
        for (const name of readdirSync(join(root, dir))) {
          if (name.startsWith("LICENSE")) continue;
          this.emitFile({ type: "asset", fileName: `pdfjs/${dir}/${name}`, source: readFileSync(join(root, dir, name)) });
        }
      }
    },
  };
}

/**
 * PDFs de exemplo da demo (demo/pdfs/*.pdf, fora do git), servidos em /demo/.
 * Só entram no build demo: a pasta public/ iria para produção também.
 */
function demoPdfs(): Plugin {
  const dir = fileURLToPath(new URL("./demo/pdfs/", import.meta.url));
  const files = () => (existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".pdf")) : []);
  return {
    name: "estante:demo-pdfs",
    configureServer(server) {
      server.middlewares.use("/demo", (req, res, next) => {
        const name = decodeURIComponent((req.url ?? "").split("?")[0]).replace(/^\/+/, "");
        if (!files().includes(name)) return next();
        res.setHeader("content-type", "application/pdf");
        res.setHeader("content-length", String(statSync(join(dir, name)).size));
        if (req.method === "HEAD") return res.end();
        createReadStream(join(dir, name)).pipe(res);
      });
    },
    generateBundle() {
      for (const name of files()) this.emitFile({ type: "asset", fileName: `demo/${name}`, source: readFileSync(join(dir, name)) });
    },
  };
}

export default defineConfig(({ mode }) => {
  // `npm run build:demo` (modo "demo" ou VITE_DEMO=true): app 100% no navegador, sem /api.
  const demo = mode === "demo" || process.env.VITE_DEMO === "true";
  return {
  resolve: {
    alias: { $backend: resolve(fileURLToPath(new URL(".", import.meta.url)), `src/lib/backend/${demo ? "demo" : "prod"}.ts`) },
  },
  define: { "import.meta.env.VITE_DEMO": JSON.stringify(demo ? "true" : "false") },
  plugins: [
    svelte(),
    !demo && cloudflare(),
    pdfjsAssets(),
    demo && demoPdfs(),
    VitePWA({
      registerType: "prompt",
      injectRegister: false,
      includeAssets: ["favicon.svg", "icons/apple-touch-icon.png"],
      manifest: {
        name: demo ? "Estante de Leitura (demo)" : "Estante de Leitura",
        short_name: demo ? "Estante demo" : "Estante",
        description: "Seus PDFs, a página onde você parou e suas resenhas, num lugar só.",
        lang: "pt-BR",
        start_url: "/",
        scope: "/",
        display: "standalone",
        background_color: "#F8F8F6",
        theme_color: "#151515",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: [
          "**/*.{js,mjs,css,html,svg,png,webmanifest}",
          "pdfjs/{wasm,standard_fonts,iccs}/*",
          // Fontes: só latin e latin-ext; os outros alfabetos vêm sob demanda (unicode-range).
          "assets/*-latin-*.woff2",
          "assets/*-latin-ext-*.woff2",
        ],
        // cmaps vêm sob demanda (runtime cache); quickjs e os fallbacks sem wasm quase nunca são usados.
        globIgnores: ["pdfjs/cmaps/**", "pdfjs/wasm/quickjs*", "pdfjs/wasm/*_nowasm_fallback.js"],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        navigateFallback: "/index.html",
        // Produção: /api/* nunca passa pelo cache, é por lá que o Access pede login de novo.
        // A demo não tem API.
        navigateFallbackDenylist: demo ? [/^\/cdn-cgi\//] : [/^\/api\//, /^\/cdn-cgi\//],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith("/pdfjs/cmaps/"),
            handler: "CacheFirst",
            options: { cacheName: "pdfjs-cmaps", expiration: { maxEntries: 200 } },
          },
          ...(demo
            ? [
                {
                  urlPattern: ({ url }: { url: URL }) => url.pathname.startsWith("/demo/") && url.pathname.endsWith(".pdf"),
                  handler: "CacheFirst" as const,
                  options: { cacheName: "demo-pdfs", expiration: { maxEntries: 10 } },
                },
              ]
            : []),
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  build: { target: "es2022", ...(demo ? { outDir: "dist-demo", emptyOutDir: true } : {}) },
  };
});
