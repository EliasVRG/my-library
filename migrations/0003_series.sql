-- Coleções (séries): nome e posição do volume. Vazio/NULL = livro avulso.
-- Entram no merge por campo como os outros campos de `books` (relógio em field_clock).
ALTER TABLE books ADD COLUMN series TEXT NOT NULL DEFAULT '';
ALTER TABLE books ADD COLUMN series_index REAL;
