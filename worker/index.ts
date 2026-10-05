import { Hono } from "hono";
import { authenticate } from "./auth";
import type { AppEnv } from "./env";
import { pdf } from "./pdf";
import { BadRequest, applyChanges, listChanges, parseChanges } from "./sync";

type Ctx = { Bindings: AppEnv; Variables: { email: string } };

const app = new Hono<Ctx>().basePath("/api");

app.use("*", async (c, next) => {
  const auth = await authenticate(c.req.raw, c.env);
  if (!auth.ok) return c.json({ error: auth.error }, auth.status);
  c.set("email", auth.email);
  await next();
  c.header("cache-control", c.res.headers.get("cache-control") ?? "no-store");
});

app.get("/me", (c) => c.json({ email: c.get("email") }));

// O service worker nunca intercepta /api/*, então navegar até aqui passa pelo Access
// (que pede login de novo se a sessão expirou) e volta para o app.
app.get("/login", (c) => c.redirect("/", 302));

app.get("/changes", async (c) => {
  const since = Number(c.req.query("since") ?? "0");
  if (!Number.isInteger(since) || since < 0) return c.json({ error: "cursor inválido" }, 400);
  return c.json(await listChanges(c.env.DB, since));
});

app.post("/push", async (c) => {
  const now = Date.now();
  const changes = parseChanges(await c.req.json().catch(() => null), now);
  const orphanKeys = await applyChanges(c.env, changes, now);
  if (orphanKeys.length) c.executionCtx.waitUntil(c.env.BUCKET.delete(orphanKeys));
  return c.json({ ok: true, applied: changes.length });
});

app.route("/books", pdf);

app.notFound((c) => c.json({ error: "rota não encontrada" }, 404));
app.onError((err, c) => {
  if (err instanceof BadRequest) return c.json({ error: err.message }, 400);
  console.error(err);
  return c.json({ error: "erro interno" }, 500);
});

export default app;
