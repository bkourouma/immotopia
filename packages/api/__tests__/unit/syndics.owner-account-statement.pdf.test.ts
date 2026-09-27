import {
  buildOwnerAccountStatementPdf,
  describeBalanceForPdf,
  movementTypeLabel,
  sanitizeForPdf
} from '../../src/lib/syndics/owner-account-statement';

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

/**
 * Constat de recette (module 3.4) : un crédit de 20 000 sur un compte à 0
 * affichait « Solde courant -20 000 FCFA » sans rien pour expliquer le signe.
 * La convention (débit augmente, crédit diminue — positif = le
 * copropriétaire doit, négatif = il a une avance) est la même que celle de
 * l'écran web `SyndicOwnerAccount.tsx` : elle n'est pas fausse, seulement
 * muette. Ce relevé doit donc porter la même mention explicite.
 */
describe('describeBalanceForPdf', () => {
  it('labels a positive balance as "Débiteur" and keeps the amount as-is', () => {
    expect(describeBalanceForPdf(20000)).toEqual({ amount: 20000, label: 'Débiteur' });
  });

  it('labels a negative balance as "Créditeur" and returns the absolute amount, never a negative number', () => {
    expect(describeBalanceForPdf(-20000)).toEqual({ amount: 20000, label: 'Créditeur' });
  });

  it('labels a zero balance as settled', () => {
    expect(describeBalanceForPdf(0)).toEqual({ amount: 0, label: 'Solde à jour' });
  });

  it('rounds to the cent before comparing to zero', () => {
    expect(describeBalanceForPdf(-0.001)).toEqual({ amount: 0, label: 'Solde à jour' });
  });
});

/**
 * BUG-2026-09-27-007 (partie S3) : les textes fixes du relevé sont accentués.
 * La police standard (WinAnsi) encode les lettres accentuées latines :
 * `sanitizeForPdf` doit les laisser passer, et ne remplacer que l'inencodable.
 */
describe('textes accentués du relevé PDF', () => {
  it('conserve les accents français à la sanitisation', () => {
    const text =
      'Relevé de compte du lot — Copropriété, Propriétaire, Débit, Crédit, Solde à jour, Pénalité, Reçu, Ç œ €';
    expect(sanitizeForPdf(text)).toBe(text);
  });

  it("remplace seulement ce que WinAnsi n'encode pas", () => {
    expect(sanitizeForPdf('Lot مرحبا')).toBe('Lot ?????');
  });

  it('traduit les codes de mouvement en libellés français', () => {
    expect(movementTypeLabel('CHARGE_CALL')).toBe('Appel');
    expect(movementTypeLabel('PENALTY')).toBe('Pénalité');
    expect(movementTypeLabel('INCONNU')).toBe('INCONNU');
  });

  it('génère le relevé accentué sans erreur d’encodage', async () => {
    await expect(
      buildOwnerAccountStatementPdf({
        syndicateName: 'Copropriété Les Baobabs',
        lotNumber: 'BAO-1',
        ownerName: 'Élodie Kouassi',
        currency: 'FCFA',
        openingBalance: 0,
        closingBalance: -15000,
        transactions: [
          {
            transactionDate: new Date('2026-10-15T00:00:00.000Z'),
            type: 'CHARGE_CALL',
            label: 'Appel de charges 2026-T4',
            debit: 60000,
            credit: null,
            balanceAfter: -15000
          }
        ]
      })
    ).resolves.toBeInstanceOf(Buffer);
  });
});
