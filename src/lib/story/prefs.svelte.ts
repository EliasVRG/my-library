// Preferências do story que ficam só neste aparelho (não sincronizam): o @ do Instagram.
// Sem acesso ao localStorage (janela anônima, armazenamento bloqueado), o story sai sem @.

const KEY = "estante:story-handle";

function read(): string {
  try {
    return localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

export const storyPrefs = $state({ handle: read() });

export function setStoryHandle(value: string): void {
  storyPrefs.handle = value;
  try {
    if (value.trim()) localStorage.setItem(KEY, value.trim());
    else localStorage.removeItem(KEY);
  } catch {
    // Fica valendo só nesta sessão.
  }
}
