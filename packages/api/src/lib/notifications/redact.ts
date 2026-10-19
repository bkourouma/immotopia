/** `jean@exemple.ci` devient `j***@exemple.ci` ; une valeur sans arobase devient `***`. */
export function redactEmailAddress(address: string): string {
  const trimmed = String(address).trim();
  const at = trimmed.lastIndexOf('@');
  if (at <= 0 || at === trimmed.length - 1) return '***';
  return `${trimmed.slice(0, 1)}***${trimmed.slice(at)}`;
}
