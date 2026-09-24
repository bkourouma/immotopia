import { buildOwnerAccountStatementPdf } from '../../src/lib/syndics/owner-account-statement';

/**
 * Non-régression : `GET .../lots/:lotId/compte/releve` répondait 400 avec
 * « WinAnsi cannot encode U+202F » dès qu'un montant atteignait quatre
 * chiffres. `money()` utilisait `toLocaleString('fr-FR')`, qui sépare les
 * milliers par une espace fine insécable (U+202F, parfois U+00A0) — hors du
 * jeu WinAnsi que la police standard `Helvetica` de pdf-lib sait encoder.
 *
 * Ce test génère un relevé avec des montants >= 1 000 (qui déclenchaient le
 * séparateur fautif) et un nom de copropriétaire accentué, et vérifie que la
 * génération réussit et produit bien un PDF.
 */
describe('buildOwnerAccountStatementPdf', () => {
  const basePayload = {
    syndicateName: 'Résidence Les Rôniers',
    lotNumber: 'A-12',
    ownerName: "Amadou N'Guessan Ébénézer",
    currency: 'FCFA',
    openingBalance: 1234.5,
    closingBalance: 12345.75,
    transactions: [
      {
        transactionDate: new Date('2026-01-15T00:00:00.000Z'),
        type: 'Appel de fonds',
        label: 'Charges courantes T1 2026',
        debit: 1500,
        credit: null,
        balanceAfter: 2734.5
      },
      {
        transactionDate: new Date('2026-02-10T00:00:00.000Z'),
        type: 'Règlement',
        label: 'Virement copropriétaire',
        debit: null,
        credit: 10611.25,
        balanceAfter: 12345.75
      }
    ]
  };

  it("génère le PDF sans lever d'erreur d'encodage pour des montants >= 1 000", async () => {
    await expect(buildOwnerAccountStatementPdf(basePayload)).resolves.toBeInstanceOf(Buffer);
  });

  it("produit un buffer PDF non vide, avec l'en-tête %PDF", async () => {
    const buffer = await buildOwnerAccountStatementPdf(basePayload);

    expect(buffer.length).toBeGreaterThan(0);
    expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });

  it('reste robuste face à une espace fine insécable (U+202F) glissée dans un libellé', async () => {
    const payloadWithNarrowNbsp = {
      ...basePayload,
      transactions: [
        {
          ...basePayload.transactions[0],
          label: `Charges\u202Fexceptionnelles\u00A0T1`
        }
      ]
    };

    await expect(buildOwnerAccountStatementPdf(payloadWithNarrowNbsp)).resolves.toBeInstanceOf(Buffer);
  });
});
