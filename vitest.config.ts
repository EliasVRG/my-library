import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          environment: "node",
          include: ["tests/unit/**/*.test.ts"],
          setupFiles: ["fake-indexeddb/auto"],
          // story.test.ts lê os tokens de cor (?raw) para conferir a paleta dos stories.
          css: { include: [/tokens\.css/] },
        },
      },
      {
        plugins: [
          cloudflareTest(async () => ({
            wrangler: { configPath: "./wrangler.jsonc" },
            miniflare: {
              bindings: {
                TEST_MIGRATIONS: await readD1Migrations("./migrations"),
                DEV_SKIP_ACCESS: "1",
                ACCESS_TEAM_DOMAIN: "https://teste.cloudflareaccess.com",
                ACCESS_AUD: "aud-de-teste",
                ALLOWED_EMAIL: "eu@exemplo.com",
              },
            },
          })),
        ],
        test: {
          name: "worker",
          include: ["tests/worker/**/*.test.ts"],
          setupFiles: ["tests/worker/apply-migrations.ts"],
        },
      },
    ],
  },
});
