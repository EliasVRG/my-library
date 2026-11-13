-- Capa do livro: página do PDF usada como capa. NULL = primeira página; 0 = capa colorida (sem imagem).
-- A imagem é gerada em cada aparelho; só a escolha sincroniza.
ALTER TABLE books ADD COLUMN cover_page INTEGER;
