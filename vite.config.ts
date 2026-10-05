import { cloudflare } from "@cloudflare/vite-plugin";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { createReadStream, readFileSync, readdirSync, statSync } from "node:fs";
import { join, normalize } from "node:path";
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

export default defineConfig({
  plugins: [
    svelte(),
    cloudflare(),
    pdfjsAssets(),
    VitePWA({
      registerType: "prompt",
      injectRegister: false,
      includeAssets: ["favicon.svg", "icons/apple-touch-icon.png"],
      manifest: {
        name: "Estante de Leitura",
        short_name: "Estante",
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
        // /api/* nunca passa pelo cache: é por lá que o Access pede login de novo.
        navigateFallbackDenylist: [/^\/api\//, /^\/cdn-cgi\//],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith("/pdfjs/cmaps/"),
            handler: "CacheFirst",
            options: { cacheName: "pdfjs-cmaps", expiration: { maxEntries: 200 } },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  build: { target: "es2022" },
});
