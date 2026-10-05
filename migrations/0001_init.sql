-- Estante de Leitura: schema inicial.
-- Cada linha tem `rev`, um número crescente atribuído pelo servidor a cada escrita.
-- O cliente puxa mudanças com `rev > cursor`, então o relógio dos aparelhos não afeta o cursor.
-- `field_clock` guarda, por campo, o par [timestamp, deviceId] da última escrita: merge campo a campo.

CREATE TABLE books (
  id            TEXT PRIMARY KEY,
  title         TEXT NOT NULL DEFAULT '',
  author        TEXT NOT NULL DEFAULT '',
  category      TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'quero',
  rating        INTEGER NOT NULL DEFAULT 0,
  pdf_key       TEXT,
  file_name     TEXT NOT NULL DEFAULT '',
  pdf_size      INTEGER NOT NULL DEFAULT 0,
  pdf_ready_key TEXT,             -- escrito só pelo servidor quando o upload termina
  pages         INTEGER NOT NULL DEFAULT 0,
  current_page  INTEGER NOT NULL DEFAULT 1,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  deleted_at    INTEGER,
  field_clock   TEXT NOT NULL DEFAULT '{}',
  rev           INTEGER NOT NULL
);
CREATE INDEX books_rev ON books(rev);

CREATE TABLE reviews (
  book_id     TEXT PRIMARY KEY,
  resumo      TEXT NOT NULL DEFAULT '',
  argumentos  TEXT NOT NULL DEFAULT '',
  concordo    TEXT NOT NULL DEFAULT '',
  discordo    TEXT NOT NULL DEFAULT '',
  outro_lado  TEXT NOT NULL DEFAULT '',
  notas       TEXT NOT NULL DEFAULT '',
  field_clock TEXT NOT NULL DEFAULT '{}',
  updated_at  INTEGER NOT NULL,
  rev         INTEGER NOT NULL
);
CREATE INDEX reviews_rev ON reviews(rev);

CREATE TABLE meta (
  key   TEXT PRIMARY KEY,
  value INTEGER NOT NULL
);
INSERT INTO meta (key, value) VALUES ('rev', 0);
