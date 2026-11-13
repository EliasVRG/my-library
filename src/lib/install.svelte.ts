// Instalar como app (PWA). O Chrome (Android e PC) avisa com `beforeinstallprompt` quando dá para
// instalar; o Safari (iPhone e iPad) não tem esse aviso: lá o caminho é Compartilhar → Adicionar à Tela de Início.

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISSED = "estante:install-hint-dismissed";

function standaloneNow(): boolean {
  if (typeof window === "undefined") return false;
  return matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
}

function isAppleMobile(): boolean {
  if (typeof navigator === "undefined") return false;
  // iPadOS se apresenta como Mac; o toque denuncia.
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED) === "1";
  } catch {
    return false;
  }
}

let deferred: InstallPromptEvent | null = null;

export const install = $state({
  /** O navegador ofereceu a instalação (botão "Instalar app"). */
  canPrompt: false,
  /** Já está aberto como app instalado. */
  standalone: standaloneNow(),
  /** Safari no iPhone/iPad fora do app: mostra a dica de "Adicionar à Tela de Início". */
  appleHint: !standaloneNow() && isAppleMobile() && !readDismissed(),
});

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    install.canPrompt = true;
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    install.canPrompt = false;
  });
  matchMedia("(display-mode: standalone)").addEventListener("change", () => (install.standalone = standaloneNow()));
}

export async function promptInstall(): Promise<void> {
  const e = deferred;
  if (!e) return;
  deferred = null;
  install.canPrompt = false;
  await e.prompt();
  // Recusou: o Chrome volta a oferecer mais tarde com um novo evento.
}

export function dismissAppleHint(): void {
  install.appleHint = false;
  try {
    localStorage.setItem(DISMISSED, "1");
  } catch {
    // Volta a aparecer na próxima visita; sem problema.
  }
}
