/**
 * Copie un texte dans le presse-papiers ; `false` si ni l'API moderne ni le
 * repli (`execCommand`, pages sans contexte sécurisé) ne fonctionnent.
 *
 * Le texte copié n'est jamais journalisé : il peut être une URL à jeton. Le
 * champ temporaire du repli est retiré du DOM quoi qu'il arrive (même si
 * `select()` ou `execCommand` lève), pour qu'aucun jeton n'y subsiste.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // repli ci-dessous
  }
  let area: HTMLTextAreaElement | null = null;
  try {
    area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.insetInlineStart = '-9999px';
    document.body.appendChild(area);
    area.select();
    return typeof document.execCommand === 'function' && document.execCommand('copy');
  } catch {
    return false;
  } finally {
    area?.remove();
  }
}
