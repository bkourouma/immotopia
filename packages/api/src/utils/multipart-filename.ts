/** Relit en UTF-8 les noms que Multer a interprétés en Latin-1, quand les octets sont valides. */
export function corrigerNomFichier(nom: string): string {
  if (!nom || Array.from(nom).some(c => (c.codePointAt(0) ?? 0) > 255)) return nom;
  const decode = Buffer.from(nom, 'latin1').toString('utf8');
  return decode.includes(String.fromCharCode(65533)) ? nom : decode;
}
