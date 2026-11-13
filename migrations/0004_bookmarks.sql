-- Marcadores do leitor: páginas marcadas, em ordem e sem repetir ("12,45,80"; vazio = nenhuma).
-- Um campo só, no merge por campo como os outros: a lista inteira é a unidade de "última escrita vence".
ALTER TABLE books ADD COLUMN bookmarks TEXT NOT NULL DEFAULT '';
