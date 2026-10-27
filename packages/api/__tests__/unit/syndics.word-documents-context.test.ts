/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Contextes des documents Word du syndic (`lib/syndics/word-documents.ts`) :
 * constructeurs purs, sans base de données. Le rendu réel est vérifié par
 * `api/syndics.word-documents.test.ts`.
 */
import PizZip from 'pizzip';
import { renderDocxBuffer } from '../../src/services/docx-renderer';
import { loadStandardTemplate } from '../../src/lib/documents/docx-standard-templates';
import {
  amountText,
  buildChargeCallContext,
  buildConvocationContext,
  buildReceiptContext,
  currencyLabel,
  docxFileName,
  fileSlug,
  issuerCity,
  quorumMention,
  type PartyFacts
} from '../../src/lib/syndics/word-documents';

jest.mock('../../src/utils/database', () => ({ prisma: {} }));
jest.mock('../../src/services/email-service', () => ({ emailService: { sendEmail: jest.fn() } }));
jest.mock('../../src/services/email-notification-config-service', () => ({ getEmailNotificationConfig: jest.fn() }));

const branding: any = {
  issuer: {
    kind: 'AGENCY',
    name: 'Cabinet Horizon',
    legalName: null,
    address: 'Cocody, Abidjan',
    phone: null,
    email: null,
    rccm: null,
    taxId: null
  },
  issuerLogo: null,
  signature: null,
  stamp: null,
  syndicate: {
    name: 'Résidence Les Flamboyants',
    address: null,
    registrationNo: null,
    cadastralReference: null,
    logo: null
  }
};
const party: PartyFacts = {
  name: 'Awa Traoré',
  address: 'Plateau',
  email: 'awa@exemple.ci',
  lotNumber: 'A12',
  lotType: 'Appartement',
  shares: '85',
  totalShares: '1000'
};

describe('utilitaires', () => {
  it('montants sans devise, au format des PDF', () => {
    expect(amountText(45000)).toBe('45 000');
    expect(amountText(12.5)).toBe('12,50');
    expect(amountText(0)).toBe('0');
    expect(amountText(-5000)).toBe('-5 000');
  });

  it('devise : franc CFA en FCFA, autre code inchangé', () => {
    expect(currencyLabel('XOF')).toBe('FCFA');
    expect(currencyLabel('EUR')).toBe('EUR');
  });

  it('nom de fichier ASCII sûr, sans séparateur de chemin', () => {
    expect(fileSlug('../Été 2026/Q1')).toBe('Ete-2026-Q1');
    expect(docxFileName('avis-appel', 'A12', '3e trimestre 2026')).toBe('avis-appel-A12-3e-trimestre-2026.docx');
    expect(docxFileName('quittance', null)).toBe('quittance.docx');
  });

  it('ville de l’émetteur : dernier élément de l’adresse', () => {
    expect(issuerCity(branding)).toBe('Abidjan');
    expect(issuerCity({ issuer: { address: null } } as any)).toBe('');
  });

  it('mention de quorum seulement si un quorum est fixé', () => {
    expect(quorumMention(null)).toBe('');
    expect(quorumMention(0)).toBe('');
    expect(quorumMention(33.5)).toContain('33.5 %');
  });
});

describe('buildChargeCallContext', () => {
  const data: any = {
    chargeCallId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    period: { label: '3e trimestre 2026', start: null, end: null },
    issuedAt: '2026-09-20T10:00:00.000Z',
    dueDate: '2026-10-15T00:00:00.000Z',
    currency: 'XOF',
    amount: 45000,
    advanceImputed: 5000,
    paid: 0,
    outstanding: 40000,
    lot: { number: 'A12', type: 'Appartement', label: null },
    coowner: { name: 'Awa Traoré', address: 'Plateau, Abidjan' },
    paymentMethods: [
      { type: 'BANK_TRANSFER', label: 'Compte syndic', provider: null, accountRef: 'CI000' },
      { type: 'MOBILE_MONEY', label: 'Wave', provider: null, accountRef: '0700' }
    ]
  };

  it('reprend les données du PDF : montants, avance, reste à payer, échéance', () => {
    const context: any = buildChargeCallContext({ data, branding, party });
    expect(context).toMatchObject({
      COPROPRIETAIRE_NOM: 'Awa Traoré',
      COPROPRIETAIRE_ADRESSE: 'Plateau, Abidjan',
      LOT_NUMERO: 'A12',
      LOT_TANTIEMES: '85',
      LOT_TANTIEMES_TOTAL: '1000',
      DEVISE: 'FCFA',
      MONTANT_APPELE: '45 000',
      MONTANT_APPELE_LETTRES: 'quarante-cinq mille francs CFA',
      SOLDE_ANTERIEUR: '-5 000',
      TOTAL_A_PAYER: '40 000',
      ECHEANCE: '15/10/2026',
      LIEU_EMISSION: 'Abidjan',
      EMETTEUR_NOM: 'Cabinet Horizon',
      COPROPRIETE_NOM: 'Résidence Les Flamboyants'
    });
    expect(context.REFERENCE_DOCUMENT).toBe('APL-CCCCCCCC');
    expect(context.LIGNES).toHaveLength(1);
    expect(context.LIGNES[0]).toMatchObject({ LIGNE_MONTANT: '45 000', LIGNE_BASE: '85/1000 tantièmes' });
    expect(context.MODALITES_PAIEMENT.split('\n')).toHaveLength(2);
  });

  it('sans moyen de paiement ni avance : champs vides ou nuls, jamais undefined', () => {
    const context: any = buildChargeCallContext({
      data: { ...data, advanceImputed: 0, outstanding: 45000, paymentMethods: [], coowner: null },
      branding,
      party
    });
    expect(context.MODALITES_PAIEMENT).toBe('');
    expect(context.SOLDE_ANTERIEUR).toBe('0');
    expect(context.COPROPRIETAIRE_NOM).toBe('Awa Traoré');
    expect(Object.values(context).some(value => value === undefined)).toBe(false);
  });
});

describe('buildReceiptContext', () => {
  const issuer = { key: 'AGENCY', ...branding.issuer };
  const common = {
    version: 1,
    issuedAt: '2026-10-12T09:00:00.000Z',
    currency: 'XOF',
    issuer,
    syndicate: { name: 'Résidence Les Flamboyants', address: null, registrationNo: null, cadastralReference: null },
    lot: { number: 'A12', type: 'Appartement', label: null },
    coowner: { name: 'Awa Traoré', address: null },
    backfilled: false
  };

  it('quittance : tout vient du snapshot, reste dû nul', () => {
    const context: any = buildReceiptContext(
      {
        ...common,
        kind: 'QUITTANCE',
        number: 'QCH-2026-0042',
        amount: 45000,
        call: {
          id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          period: { label: 'T3 2026', start: null, end: null },
          amount: 45000,
          dueDate: '2026-10-15'
        },
        settlements: [
          { paidAt: '2026-10-05', method: 'ESPECES', reference: null, amount: 5000, source: 'ADVANCE' },
          { paidAt: '2026-10-12', method: 'VIREMENT', reference: 'TRX-1', amount: 40000, source: 'PAYMENT' }
        ],
        settledAt: '2026-10-12',
        payment: null,
        allocations: [],
        outstandingAfter: 0,
        advance: 0,
        lotAdvanceBalance: 0
      } as any,
      branding
    );
    expect(context).toMatchObject({
      REFERENCE_DOCUMENT: 'QCH-2026-0042',
      PERIODE: 'T3 2026',
      DATE_PAIEMENT: '12/10/2026',
      MONTANT_APPELE: '45 000',
      MONTANT_PAYE: '45 000',
      RESTE_DU: '0',
      MODE_PAIEMENT: 'Avance imputée, Virement',
      REFERENCE_PAIEMENT: 'TRX-1',
      LOT_TANTIEMES: '—'
    });
  });

  it('reçu : paiement partiel, reste dû du snapshot', () => {
    const context: any = buildReceiptContext(
      {
        ...common,
        kind: 'RECEIPT',
        number: 'RCU-2026-0007',
        amount: 10000,
        call: null,
        settlements: [],
        settledAt: null,
        payment: { id: 'p', amount: 10000, paidAt: '2026-10-12', method: 'CASH', reference: null },
        allocations: [
          {
            chargeCallId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
            period: { label: 'T3', start: null, end: null },
            callAmount: 45000,
            allocated: 10000,
            source: 'PAYMENT',
            outstandingAfter: 35000
          }
        ],
        outstandingAfter: 35000,
        advance: 0,
        lotAdvanceBalance: 0
      } as any,
      branding
    );
    expect(context).toMatchObject({
      REFERENCE_DOCUMENT: 'RCU-2026-0007',
      MONTANT_APPELE: '45 000',
      MONTANT_PAYE: '10 000',
      RESTE_DU: '35 000',
      MODE_PAIEMENT: 'Espèces',
      APPEL_REFERENCE: 'APL-DDDDDDDD'
    });
  });
});

describe('buildConvocationContext', () => {
  const meeting = {
    id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    type: 'EXTRAORDINARY',
    scheduledAt: new Date(2027, 2, 10, 9, 0),
    location: null,
    quorum: null,
    points: [
      { title: 'Travaux de toiture', description: 'Devis à voter' },
      { title: 'Questions diverses', description: '' }
    ]
  };

  it('ordre du jour en boucle, lieu à préciser, date limite par défaut = jour de l’assemblée', () => {
    const context: any = buildConvocationContext({ meeting, branding, party });
    expect(context.ASSEMBLEE_TYPE).toBe('extraordinaire');
    expect(context.ASSEMBLEE_DATE).toBe('10/03/2027');
    expect(context.ASSEMBLEE_HEURE).toBe('09:00');
    expect(context.ASSEMBLEE_LIEU).toBe('À préciser');
    expect(context.DATE_LIMITE_POUVOIR).toBe('10/03/2027');
    expect(context.MENTION_QUORUM).toBe('');
    expect(context.ORDRE_DU_JOUR).toEqual([
      { POINT_NUMERO: '1', POINT_TITRE: 'Travaux de toiture', POINT_DESCRIPTION: 'Devis à voter' },
      { POINT_NUMERO: '2', POINT_TITRE: 'Questions diverses', POINT_DESCRIPTION: '' }
    ]);
    expect(context.REFERENCE_DOCUMENT).toBe('AG-EEEEEEEE');
  });
});

describe('rendu sans logo ni identité complète', () => {
  const bare: any = {
    issuer: {
      kind: 'AGENCY',
      name: 'X',
      legalName: null,
      address: null,
      phone: null,
      email: null,
      rccm: null,
      taxId: null
    },
    issuerLogo: null,
    signature: null,
    stamp: null,
    syndicate: null
  };

  it('convocation et avis sortent sans balise restante, même sans image', async () => {
    const meeting = {
      id: 'e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1',
      type: 'ORDINARY',
      scheduledAt: new Date(),
      location: 'Salle',
      quorum: 50,
      points: []
    };
    const data: any = {
      chargeCallId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      period: { label: 'T3', start: null, end: null },
      issuedAt: '2026-09-20T10:00:00Z',
      dueDate: '2026-10-15T00:00:00Z',
      currency: 'XOF',
      amount: 1000,
      advanceImputed: 0,
      paid: 0,
      outstanding: 1000,
      lot: { number: 'A', type: '', label: null },
      coowner: null,
      paymentMethods: []
    };
    const cases: Array<[any, any]> = [
      ['convocation_assemblee_generale', buildConvocationContext({ meeting, branding: bare, party })],
      ['avis_appel_charges', buildChargeCallContext({ data, branding: bare, party })]
    ];
    for (const [key, context] of cases) {
      const zip = new PizZip(renderDocxBuffer(await loadStandardTemplate(key), context, { sanitize: false }));
      const xml = zip
        .file(/^word\/.*\.xml$/)
        .map(file => file.asText())
        .join('');
      expect(xml).not.toContain('{{');
      expect(xml).not.toContain('@@LOGO');
    }
  });
});
