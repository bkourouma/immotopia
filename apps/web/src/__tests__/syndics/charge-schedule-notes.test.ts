import { describe, expect, it } from 'vitest';
import { stripRawMailDetail } from '../../components/syndics/charge-schedule-notes';

describe("stripRawMailDetail — notes d'anciennes exécutions", () => {
  it('ne garde que les numéros de lot, même avec des parenthèses imbriquées dans le motif brut', () => {
    const line =
      'B02 (554 5.7.1 Recipient rejected: example.test (reserved domain) and cannot receive mail), ' +
      'A201 (554 x (y) and cannot receive mail)';
    expect(stripRawMailDetail(line)).toBe('B02, A201');
  });

  it('nettoie une ligne à un seul lot et laisse intact un texte sans motif brut', () => {
    expect(stripRawMailDetail('A-01 (550 boîte pleine)')).toBe('A-01');
    expect(stripRawMailDetail("Lots non notifiés : échec de l'envoi")).toBe("Lots non notifiés : échec de l'envoi");
  });
});
