// PDF de teste gerado na hora: os PDFs de exemplo da demo não estão no git (nem no CI).
// Cada página é uma lista de linhas em Helvetica (fonte padrão do PDF, sem embutir nada).

const esc = (s: string) => s.replace(/[\\()]/g, (c) => `\\${c}`);

export function makePdf(pages: string[][]): Buffer {
  const objs: string[] = [];
  const add = (body: string) => {
    objs.push(body);
    return objs.length;
  };
  const catalog = add("");
  const pagesId = add("");
  const font = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  const kids: number[] = [];
  for (const lines of pages) {
    const text = lines.map((l, i) => `BT /F1 18 Tf 72 ${720 - i * 28} Td (${esc(l)}) Tj ET`).join("\n");
    const content = add(`<< /Length ${text.length} >>\nstream\n${text}\nendstream`);
    kids.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${content} 0 R >>`));
  }
  objs[catalog - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objs[pagesId - 1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] /Count ${kids.length} >>`;

  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((body, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  out += offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  out += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

/** Livro de teste: 6 páginas; a 4 tem "olhos de ressaca" (duas vezes no livro todo). */
export const BOOK_PDF = makePdf([
  ["Capitulo I", "Um livro de teste para o leitor."],
  ["Capitulo II", "Nada de especial nesta pagina."],
  ["Capitulo III", "Aqui aparece a palavra ressaca uma vez."],
  ["Capitulo IV", "Olhos de cigana obliqua e dissimulada.", "Olhos de ressaca, disse ele."],
  ["Capitulo V", "Outra pagina comum."],
  ["Capitulo VI", "Fim. Olhos de ressaca de novo."],
]);
