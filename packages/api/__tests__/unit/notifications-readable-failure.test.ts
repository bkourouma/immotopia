/**
 * BUG-2026-10-20-001 — le journal des notifications montrait le motif brut
 * « Error EAUTH ». Le motif est traduit a la lecture, lignes anciennes comprises.
 */
import { readableFailureReason } from '../../src/lib/notifications/readable-failure';
import { runWithLanguage } from '../../src/i18n';

describe('readableFailureReason', () => {
  it('traduit un refus SMTP en motif lisible', () => {
    expect(readableFailureReason('Error EAUTH')).toBe("Le serveur de messagerie a refusé l'e-mail.");
    expect(readableFailureReason('Error EENVELOPE')).toBe("Le serveur de messagerie a refusé l'e-mail.");
  });

  it('traduit les delais et serveurs injoignables', () => {
    expect(readableFailureReason('Error ETIMEDOUT')).toBe("Le serveur de messagerie n'a pas répondu à temps.");
    expect(readableFailureReason('Error ECONNREFUSED')).toBe("Le serveur d'envoi est injoignable.");
  });

  it('traduit le motif agrege canal par canal', () => {
    expect(readableFailureReason("EMAIL : Error EAUTH ; SMS : Echec d'envoi du SMS.")).toBe(
      "E-mail : Le serveur de messagerie a refusé l'e-mail. ; SMS : Échec d'envoi du SMS."
    );
  });

  it('garde le code pour une erreur technique inconnue, sans texte brut', () => {
    expect(readableFailureReason('TypeError')).toBe("L'envoi a échoué (erreur technique).");
    expect(readableFailureReason('Error')).toBe("L'envoi a échoué (erreur technique).");
    expect(readableFailureReason('Error E_CUSTOM')).toBe("L'envoi a échoué (erreur technique E_CUSTOM).");
  });

  it('reprend les textes fixes des canaux avec leurs accents', () => {
    expect(readableFailureReason('Canal SMS non active.')).toBe('Canal SMS non activé.');
    expect(readableFailureReason('Destinataire sans compte : pas de boite de reception.')).toBe(
      'Destinataire sans compte : pas de boîte de réception.'
    );
  });

  it('laisse passer null et un texte deja lisible', () => {
    expect(readableFailureReason(null)).toBeNull();
    expect(readableFailureReason('Numéro refusé par le fournisseur.')).toBe('Numéro refusé par le fournisseur.');
  });

  it('suit la langue de la requete', () => {
    const en = runWithLanguage('en', () => readableFailureReason('Error EAUTH'));
    expect(en).not.toBe("Le serveur de messagerie a refusé l'e-mail.");
    expect(en).toBeTruthy();
  });
});

describe('readableFailureReason — textes libres', () => {
  it("ne prend pas un texte de deux mots pour un nom d'erreur", () => {
    expect(readableFailureReason('SMTP indisponible')).toBe('SMTP indisponible');
  });
});
