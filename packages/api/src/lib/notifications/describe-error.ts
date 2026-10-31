/**
 * Motif d'echec lisible et borne. Module sans dependance : il est importe par
 * le journal (`log-delivery`) ET par `deliver`, sans cycle avec les services
 * d'envoi.
 */
const MAX_REASON = 300;

/** Detail complet, BORNE : pour le logger uniquement, jamais pour la base. */
export function describeError(error: unknown): string {
  const raw = error instanceof Error ? error.message : typeof error === 'string' ? error : 'Erreur inconnue';
  return (raw || 'Erreur inconnue').slice(0, MAX_REASON);
}

/**
 * Motif d'echec STOCKE dans le journal : jamais le message brut du transport
 * (adresse, hote SMTP...), seulement le nom et le code de l'erreur
 * (ex. « Error ECONNREFUSED »).
 */
export function describeFailure(error: unknown): string {
  if (!(error instanceof Error)) return 'Erreur inconnue';
  const name = /^[A-Za-z][A-Za-z0-9_.]{0,59}$/.test(error.name) ? error.name : 'Error';
  const rawCode = (error as { code?: unknown }).code;
  const code = typeof rawCode === 'string' || typeof rawCode === 'number' ? String(rawCode) : '';
  return /^[A-Za-z0-9_.-]{1,40}$/.test(code) ? `${name} ${code}` : name;
}
