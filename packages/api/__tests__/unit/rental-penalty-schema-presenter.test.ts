/**
 * BUG-2026-11-04-013 (plafond du montant), -014 (justificatif jamais exposé
 * comme raison), -015 (nom de fichier accentué).
 */
jest.mock('../../src/utils/database', () => ({ prisma: {} }));

import { updatePenaltySchema } from '../../src/lib/rental/penalty-schemas';
import { presenterPenalite, corrigerNomFichier } from '../../src/services/rental-penalty-service';

describe('updatePenaltySchema (013)', () => {
  it('refuse 10 000 000 000 avec un message clair', () => {
    const r = updatePenaltySchema.safeParse({ amount: 10_000_000_000, reason: 'x' });
    expect(r.success).toBe(false);
    expect(JSON.stringify((r as any).error.issues)).toContain('9 999 999 999,99');
  });
  it('refuse un négatif et plus de 2 décimales', () => {
    expect(updatePenaltySchema.safeParse({ amount: -1, reason: 'x' }).success).toBe(false);
    expect(updatePenaltySchema.safeParse({ amount: 10.123, reason: 'x' }).success).toBe(false);
  });
  it('accepte 0, le plafond et 2 décimales', () => {
    expect(updatePenaltySchema.safeParse({ amount: 0, reason: 'x' }).success).toBe(true);
    expect(updatePenaltySchema.safeParse({ amount: 9_999_999_999.99, reason: 'x' }).success).toBe(true);
    expect(updatePenaltySchema.safeParse({ amount: 1000.5, reason: 'x' }).success).toBe(true);
  });
});

describe('presenterPenalite : justificatif (014)', () => {
  const justif = {
    justification: {
      fileUrl: '/uploads/rental/penalties/p/j.pdf',
      fileName: 'reçu.pdf',
      uploadedAt: 'd',
      uploadedBy: 'u-1'
    }
  };
  it('une pénalité non ajustée avec justificatif n’expose aucune raison ni chemin', () => {
    const out: any = presenterPenalite({
      amount: 3000,
      is_manual_override: false,
      override_reason: JSON.stringify(justif)
    });
    expect(out.override_reason).toBeNull();
    expect(out.justification).toEqual({ fileName: 'reçu.pdf', uploadedAt: 'd' });
    expect(JSON.stringify(out)).not.toContain('/uploads');
    expect(JSON.stringify(out)).not.toContain('u-1');
  });
  it('une pénalité ajustée expose la vraie raison et le justificatif à part', () => {
    const out: any = presenterPenalite({
      amount: 1000,
      is_manual_override: true,
      override_reason: JSON.stringify({ reason: 'Accord amiable', calculatedAmount: 3000, ...justif })
    });
    expect(out.override_reason).toBe('Accord amiable');
    expect(out.justification.fileName).toBe('reçu.pdf');
  });
  it('ancienne raison en texte brut conservée', () => {
    const out: any = presenterPenalite({ amount: 0, is_manual_override: true, override_reason: 'Geste commercial' });
    expect(out.override_reason).toBe('Geste commercial');
    expect(out.justification).toBeNull();
  });
});

describe('corrigerNomFichier (015)', () => {
  it('relit en UTF-8 un nom lu en Latin-1', () => {
    const mal = Buffer.from('reçu été.pdf', 'utf8').toString('latin1');
    expect(corrigerNomFichier(mal)).toBe('reçu été.pdf');
    expect(corrigerNomFichier(Buffer.from("é & ' b.pdf", 'utf8').toString('latin1'))).toBe("é & ' b.pdf");
  });
  it('laisse un nom ASCII ou déjà correct', () => {
    expect(corrigerNomFichier('notes.pdf')).toBe('notes.pdf');
    expect(corrigerNomFichier('reçu 😀.pdf')).toBe('reçu 😀.pdf');
    expect(corrigerNomFichier('reçu.pdf')).toBe('reçu.pdf');
  });
});

describe('signature du justificatif (019)', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { contentMatchesDeclaredType } = require('../../src/utils/file-signature');
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
  it('refuse un faux PNG et accepte un vrai', () => {
    expect(contentMatchesDeclaredType(Buffer.from('juste du texte, pas une image'), 'image/png')).toBe(false);
    expect(contentMatchesDeclaredType(png, 'image/png')).toBe(true);
    expect(contentMatchesDeclaredType(png, 'application/pdf')).toBe(false);
  });
  it('accepte PDF, DOCX et DOC par leur signature', () => {
    expect(contentMatchesDeclaredType(Buffer.from('%PDF-1.4 x'), 'application/pdf')).toBe(true);
    expect(
      contentMatchesDeclaredType(
        Buffer.from([0x50, 0x4b, 0x03, 0x04, 1]),
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      )
    ).toBe(true);
    expect(
      contentMatchesDeclaredType(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), 'application/msword')
    ).toBe(true);
  });
});
