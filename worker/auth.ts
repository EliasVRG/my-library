// Validação do JWT que o Cloudflare Access injeta em toda requisição autorizada.
// https://developers.cloudflare.com/cloudflare-one/identity/authorization-cookie/validating-json/

import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
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
      return { ok: false, status: 403, error: "E-mail não autorizado" };
    }
    return { ok: true, email };
  } catch {
    return { ok: false, status: 403, error: "Token do Access inválido" };
  }
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
