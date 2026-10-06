-- Datas de leitura, usadas no story ("dias" e "Nº livro lido em <ano>").
-- started_at: primeira vez que o livro virou "Lendo"; finished_at: última vez que virou "Lido".
-- Entram no merge por campo como os outros campos de `books` (relógio em field_clock).
ALTER TABLE books ADD COLUMN started_at INTEGER;
ALTER TABLE books ADD COLUMN finished_at INTEGER;
