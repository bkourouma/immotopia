/** Remplace les caractères de contrôle (U+0000 à U+001F, U+007F) par une espace. */
export function replaceControlChars(text: string): string {
  return Array.from(text, char => {
    const code = char.charCodeAt(0);
    return code <= 0x1f || code === 0x7f ? ' ' : char;
  }).join('');
}
