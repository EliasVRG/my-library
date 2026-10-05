// Validação do JWT que o Cloudflare Access injeta em toda requisição autorizada.
// https://developers.cloudflare.com/cloudflare-one/identity/authorization-cookie/validating-json/

import { createRemoteJWKSet, decodeJwt, jwtVerify, type JWTVerifyGetKey } from "jose";
import type { AppEnv } from "./env";

export interface AccessConfig {
  teamDomain: string;
  aud: string;
  allowedEmails: string[];
}

export type AuthResult = { ok: true; email: string } | { ok: false; status: 401 | 403 | 500; error: string };

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function readConfig(env: AppEnv): AccessConfig | null {
  const teamDomain = env.ACCESS_TEAM_DOMAIN?.trim().replace(/\/+$/, "");
  const aud = env.ACCESS_AUD?.trim();
  const allowedEmails = (env.ALLOWED_EMAIL ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (!teamDomain || !aud || allowedEmails.length === 0) return null;
  return { teamDomain: teamDomain.startsWith("https://") ? teamDomain : `https://${teamDomain}`, aud, allowedEmails };
}

const jwksCache = new Map<string, JWTVerifyGetKey>();
function remoteJwks(teamDomain: string): JWTVerifyGetKey {
  let jwks = jwksCache.get(teamDomain);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`${teamDomain}/cdn-cgi/access/certs`));
    jwksCache.set(teamDomain, jwks);
  }
  return jwks;
}

export async function verifyAccessToken(
  token: string,
  config: AccessConfig,
  getKey: JWTVerifyGetKey = remoteJwks(config.teamDomain),
): Promise<AuthResult> {
  try {
    const { payload } = await jwtVerify(token, getKey, {
      issuer: config.teamDomain,
      audience: config.aud,
      algorithms: ["RS256"],
    });
    const email = typeof payload.email === "string" ? payload.email.toLowerCase() : "";
    if (!email || !config.allowedEmails.includes(email)) {
      logRejection("email", { recebido: maskEmail(email), permitidos: config.allowedEmails.map(maskEmail) });
      return { ok: false, status: 403, error: "E-mail não autorizado" };
    }
    return { ok: true, email };
  } catch (e) {
    // Registra qual verificação falhou (nunca o token). Emissor e AUD não são segredos.
    const err = e as { code?: string; claim?: string; reason?: string; message?: string };
    let got: { iss?: unknown; aud?: unknown } = {};
    try {
      const c = decodeJwt(token);
      got = { iss: c.iss, aud: c.aud };
    } catch {
      // token ilegível: o código do erro já diz isso
    }
    logRejection("token", {
      codigo: err.code ?? err.message,
      campo: err.claim,
      esperado: { iss: config.teamDomain, aud: config.aud },
      recebido: got,
    });
    return { ok: false, status: 403, error: "Token do Access inválido" };
  }
}

function logRejection(motivo: string, detalhes: Record<string, unknown>) {
  console.warn(JSON.stringify({ access: "rejeitado", motivo, ...detalhes }));
}

/** "fulano@gmail.com" → "fu…@gmail.com": suficiente para achar erro de digitação. */
function maskEmail(email: string): string {
  const [user, domain] = email.split("@");
  if (!domain) return email ? "(sem @)" : "(vazio)";
  return `${user.slice(0, 2)}…@${domain}`;
}

export async function authenticate(request: Request, env: AppEnv): Promise<AuthResult> {
  const host = new URL(request.url).hostname;
  if (env.DEV_SKIP_ACCESS === "1" && LOCAL_HOSTS.has(host)) {
    return { ok: true, email: "dev@localhost" };
  }
  const config = readConfig(env);
  if (!config) return { ok: false, status: 500, error: "Access não configurado no Worker" };
  const token = request.headers.get("cf-access-jwt-assertion");
  if (!token) return { ok: false, status: 401, error: "Sem token do Access" };
  return verifyAccessToken(token, config);
}
