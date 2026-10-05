export interface AppEnv {
  DB: D1Database;
  BUCKET: R2Bucket;
  /** Ex.: https://minha-equipe.cloudflareaccess.com */
  ACCESS_TEAM_DOMAIN?: string;
  /** Application Audience (AUD) Tag da aplicação no Access. */
  ACCESS_AUD?: string;
  /** E-mail(s) permitido(s), separados por vírgula. */
  ALLOWED_EMAIL?: string;
  /** "1" pula a validação do Access, mas só quando o host é localhost. */
  DEV_SKIP_ACCESS?: string;
}
