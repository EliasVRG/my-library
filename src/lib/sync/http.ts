// Transporte de produção: os caminhos relativos do motor viram chamadas a /api/* no próprio Worker.
import type { Fetcher } from "./types";

export const API_BASE = "/api/";

export const httpFetcher: Fetcher = (path, init) => fetch(API_BASE + path, { credentials: "same-origin", ...init });
