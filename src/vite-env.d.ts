/// <reference types="svelte" />
/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/svelte" />

interface ImportMetaEnv {
  /** "true" no build demo (definido em vite.config.ts). */
  readonly VITE_DEMO: "true" | "false";
}
