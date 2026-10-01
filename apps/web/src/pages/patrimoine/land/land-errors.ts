/**
 * Messages d'erreur du lot B2.
 *
 * L'intercepteur de `utils/api-client` enrichit `message` avec le détail des
 * erreurs de validation (`errors[]`) : on lit donc `message` AVANT `error`,
 * à l'inverse de `apiErrorMessage` du module patrimoine.
 */
export function landErrorMessage(error: unknown, fallback: string): string {
  const data = (error as { response?: { data?: { error?: unknown; message?: unknown } } })?.response?.data;
  if (typeof data?.message === 'string' && data.message) return data.message;
  if (typeof data?.error === 'string' && data.error) return data.error;
  return fallback;
}

export function httpStatusOf(error: unknown): number | undefined {
  return (error as { response?: { status?: number } })?.response?.status;
}
