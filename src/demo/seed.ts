// Estante de exemplo do modo demo: 8 livros em domínio público, com situações, progresso e
// 3 resenhas. Os PDFs (só os de Machado) são arquivos estáticos em /demo/, quando existem.

import {
  BOOK_FIELDS,
  REVIEW_FIELDS,
  emptyBookData,
  emptyReviewData,
  pdfKeyFor,
  type Book,
  type BookData,
  type Clock,
  type Review,
  type ReviewData,
} from "../../shared/model";
import type { LocalStore } from "../lib/db/repo";

/** Livro → arquivo em /demo/. Os ids são fixos para o mapeamento sobreviver a "Restaurar exemplo". */
export const DEMO_PDFS: Record<string, string> = {
  "d0e5a000-0000-4000-8000-000000000001": "dom-casmurro.pdf",
  "d0e5a000-0000-4000-8000-000000000002": "memorias-postumas-de-bras-cubas.pdf",
  "d0e5a000-0000-4000-8000-000000000003": "o-alienista.pdf",
};

interface SeedBook extends Partial<BookData> {
  id: string;
  title: string;
  author: string;
  category: string;
  /** Minutos atrás da última mexida; ordena a faixa "Continuar lendo". */
  ago: number;
  review?: Partial<ReviewData>;
}

const DAY = 24 * 60;

const BOOKS: SeedBook[] = [
  {
    id: "d0e5a000-0000-4000-8000-000000000002",
    title: "Memórias Póstumas de Brás Cubas",
    author: "Machado de Assis",
    category: "Romance",
    status: "lendo",
    pages: 180,
    current_page: 62,
    ago: 40,
    review: {
      resumo:
        "Brás Cubas, já morto, escreve as próprias memórias. Conta uma vida de privilégios e projetos abandonados: a paixão por Marcela, o caso com Virgília, a carreira política sem brilho e a ideia fixa de um emplasto contra a melancolia.",
      argumentos:
        "Um defunto não tem nada a perder. Por isso o narrador fala sem pudor da vaidade, do interesse e da hipocrisia da elite do Rio de Janeiro do século XIX, a começar pela dele.",
      notas:
        "A dedicatória ao verme que primeiro roeu o cadáver já define o tom. Quincas Borba e o Humanitismo aparecem aqui antes de ganhar romance próprio.",
    },
  },
  {
    id: "d0e5a000-0000-4000-8000-000000000008",
    title: "Discurso do Método",
    author: "René Descartes",
    category: "Filosofia",
    status: "lendo",
    pages: 96,
    current_page: 41,
    ago: 3 * 60,
  },
  {
    id: "d0e5a000-0000-4000-8000-000000000004",
    title: "O Cortiço",
    author: "Aluísio Azevedo",
    category: "Romance",
    status: "pausado",
    pages: 232,
    current_page: 87,
    ago: 9 * DAY,
  },
  {
    id: "d0e5a000-0000-4000-8000-000000000001",
    title: "Dom Casmurro",
    author: "Machado de Assis",
    category: "Romance",
    status: "lido",
    rating: 5,
    ago: 20 * DAY,
    review: {
      resumo:
        "Bento Santiago, velho e recluso, decide contar a própria vida: a infância em Mata-cavalos, o amor por Capitu, o seminário imposto por uma promessa da mãe e o casamento. O ciúme cresce até a certeza, nunca provada, de que Capitu o traiu com Escobar, seu melhor amigo, e de que Ezequiel não é seu filho.",
      argumentos:
        "Quem narra é quem acusa. Bentinho escolhe o que lembrar, admite falhas de memória e monta o caso contra Capitu com indícios: o olhar, a semelhança do filho com Escobar, a reação no velório. O leitor só recebe a versão do ciumento.",
      concordo:
        "A força está na forma. Capítulos curtos, conversa direta com o leitor e uma ironia que corrói o próprio narrador. A pergunta deixa de ser se houve traição e passa a ser por que acreditamos em quem conta.",
      discordo:
        "A parte do seminário é lenta, e algumas digressões parecem existir mais para adiar do que para revelar.",
      outro_lado:
        "Quem lê Bentinho como confiável diria que os sinais são demais para ser coincidência: a semelhança de Ezequiel com Escobar não é notada só por ele. A ambiguidade seria uma leitura moderna, não uma intenção do texto.",
      notas:
        "Comparar com a leitura de Helen Caldwell, que nos anos 1960 foi das primeiras a defender Capitu.",
    },
  },
  {
    id: "d0e5a000-0000-4000-8000-000000000003",
    title: "O Alienista",
    author: "Machado de Assis",
    category: "Novela",
    status: "lido",
    rating: 4,
    ago: 34 * DAY,
    review: {
      resumo:
        "O médico Simão Bacamarte funda em Itaguaí a Casa Verde para estudar a loucura. Com critérios cada vez mais amplos, interna boa parte da vila, enfrenta uma revolta e, por fim, inverte a própria teoria: se quase todos são desequilibrados, anormal é o equilíbrio perfeito. Conclui que só ele o tem e se interna sozinho.",
      argumentos:
        "Ciência sem autocrítica vira poder arbitrário. Quem define o que é normal tem nas mãos a liberdade dos outros.",
      concordo:
        "A sátira continua atual: mostra como um critério técnico pode justificar quase tudo quando ninguém tem autoridade para questioná-lo.",
      discordo: "Os personagens secundários são tipos, quase caricaturas. Serve à sátira, mas tira densidade.",
      outro_lado:
        "Um defensor do método diria que o problema não é a ciência, e sim um médico isolado, sem revisão de pares. A crítica atingiria um mau cientista, não a ciência.",
      notas: "Boa leitura em paralelo com História da Loucura, de Michel Foucault.",
    },
  },
  {
    id: "d0e5a000-0000-4000-8000-000000000005",
    title: "Eu",
    author: "Augusto dos Anjos",
    category: "Poesia",
    status: "lido",
    rating: 4,
    ago: 60 * DAY,
  },
  {
    id: "d0e5a000-0000-4000-8000-000000000006",
    title: "Os Sertões",
    author: "Euclides da Cunha",
    category: "Ensaio",
    status: "quero",
    ago: 70 * DAY,
  },
  {
    id: "d0e5a000-0000-4000-8000-000000000007",
    title: "Triste Fim de Policarpo Quaresma",
    author: "Lima Barreto",
    category: "Romance",
    status: "quero",
    ago: 71 * DAY,
  },
];

/** O arquivo de exemplo existe e é mesmo um PDF? (A SPA responde index.html para caminhos inexistentes.) */
async function probe(file: string, fetchImpl: typeof fetch): Promise<number | null> {
  try {
    const res = await fetchImpl(`/demo/${file}`, { method: "HEAD" });
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("pdf")) return null;
    return Number(res.headers.get("content-length") ?? 0);
  } catch {
    return null;
  }
}

const stamp = (fields: readonly string[], c: Clock) => Object.fromEntries(fields.map((f) => [f, c]));

export async function seedDemo(store: LocalStore, fetchImpl: typeof fetch = fetch, now = Date.now()): Promise<void> {
  const sizes = Object.fromEntries(
    await Promise.all(Object.entries(DEMO_PDFS).map(async ([id, file]) => [id, await probe(file, fetchImpl)] as const)),
  );
  const tx = store.db.transaction(["books", "reviews"], "readwrite");
  for (const s of BOOKS) {
    const ts = now - s.ago * 60_000;
    const clock: Clock = [ts, "demo"];
    const { id, title, author, category, ago: _ago, review, ...rest } = s;
    const book: Book = {
      ...emptyBookData(),
      ...rest,
      id,
      title,
      author,
      category,
      pdf_ready_key: null,
      created_at: ts - 30 * DAY * 60_000,
      updated_at: ts,
      field_clock: stamp(BOOK_FIELDS, clock),
      rev: 0,
    };
    const file = DEMO_PDFS[id];
    const size = sizes[id];
    if (file && size != null) {
      book.pdf_key = pdfKeyFor(id, id.replace("d0e5a000", "f11e0000"));
      book.pdf_ready_key = book.pdf_key;
      book.file_name = file;
      book.pdf_size = size;
    }
    await tx.objectStore("books").put(book);
    if (review) {
      const r: Review = {
        ...emptyReviewData(),
        ...review,
        book_id: id,
        field_clock: stamp(REVIEW_FIELDS, clock),
        updated_at: ts,
        rev: 0,
      };
      await tx.objectStore("reviews").put(r);
    }
  }
  await tx.done;
}

/** Apaga os dados deste navegador (livros, resenhas, PDFs) e recoloca a estante de exemplo. */
export async function resetDemo(store: LocalStore, fetchImpl: typeof fetch = fetch): Promise<void> {
  const tx = store.db.transaction(["books", "reviews", "pdfs", "outbox"], "readwrite");
  await Promise.all([
    tx.objectStore("books").clear(),
    tx.objectStore("reviews").clear(),
    tx.objectStore("pdfs").clear(),
    tx.objectStore("outbox").clear(),
  ]);
  await tx.done;
  await seedDemo(store, fetchImpl);
  store.notify();
}
