/**
 * Durcissements du prélèvement bancaire (spec 042, P2) : caractères de contrôle
 * dans le fichier et dans les saisies, adresse e-mail masquée dans les journaux.
 */

import { GENERIC_CSV_ADAPTER, stripControlCharacters } from '../../src/lib/direct-debit/file-formats/generic-csv';
import { createCreditorSchema, createMandateSchema } from '../../src/lib/direct-debit/schemas';
import { emailService, redactEmailAddress } from '../../src/services/email-service';

const LINE_SEPARATOR = String.fromCharCode(0x2028);
const PARAGRAPH_SEPARATOR = String.fromCharCode(0x2029);

const baseInput = {
  reference: 'PRL-2026-0001',
  creditorIdentifier: 'CI-EMET-001',
  creditorLabel: 'Compte loyers',
  collectionDate: new Date('2026-10-26T00:00:00Z'),
  lines: [
    {
      reference: 'PRL-2026-0001-001',
      mandateReference: 'MDT-2026-0001',
      mandateSignedAt: new Date('2026-09-01T00:00:00Z'),
      holderName: 'Awa Traoré',
      iban: 'CI93CI0080111301134291200589',
      amount: 160000,
      leaseNumber: 'BAIL-001',
      periodYear: 2026,
      periodMonth: 10
    }
  ]
};

describe('fichier CSV / caractères de contrôle', () => {
  it('remplace les contrôles par une espace puis réduit les espaces multiples', () => {
    expect(
      stripControlCharacters(`Awa\r\nTraoré\t\tKoné${LINE_SEPARATOR}${PARAGRAPH_SEPARATOR}x\u0000y\u0085z\u007f`)
    ).toBe('Awa Traoré Koné x y z');
    expect(stripControlCharacters('Awa Traoré')).toBe('Awa Traoré');
  });

  it('un titulaire ou un créancier ne peut ni ajouter une ligne ni casser une colonne', () => {
    const buffer = GENERIC_CSV_ADAPTER.build({
      ...baseInput,
      creditorLabel: `Compte\nloyers${LINE_SEPARATOR}Nord`,
      lines: [{ ...baseInput.lines[0], holderName: 'Awa\r\nPRL-2099-0001;FAUX;IBAN\tTraoré' }]
    });
    const text = buffer.toString('utf8');
    // En-tête + une seule ligne d'opération.
    expect(text.split('\r\n')).toHaveLength(2);
    // Seuls l'espace de fin de ligne CRLF du fichier et le BOM restent.
    const forbidden = [...text.replace(/\r\n/g, '')].filter(char => {
      const code = char.charCodeAt(0);
      return code < 0x20 || (code >= 0x7f && code <= 0x9f);
    });
    expect(forbidden).toEqual([]);
    expect(text).not.toContain(LINE_SEPARATOR);
    expect(text).toContain(';Compte loyers Nord;');
    // Les points-virgules restent dans la même cellule, entre guillemets.
    expect(text).toContain(';"Awa PRL-2099-0001;FAUX;IBAN Traoré";');
  });
});

describe('saisies / caractères de contrôle', () => {
  const mandate = {
    creditorId: '11111111-1111-4111-8111-111111111111',
    leaseId: '22222222-2222-4222-8222-222222222222',
    debtorClientId: 'client-1',
    iban: 'CI93CI0080111301134291200589',
    holderName: 'Awa Traoré'
  };

  it('refuse un titulaire de mandat qui en contient, accepte un nom normal', () => {
    expect(createMandateSchema.safeParse(mandate).success).toBe(true);
    for (const holderName of ['Awa\nTraoré', 'Awa\tTraoré', `Awa${LINE_SEPARATOR}Traoré`, 'Awa\u0007Traoré']) {
      const result = createMandateSchema.safeParse({ ...mandate, holderName });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe(
          'Ce champ ne doit contenir ni retour à la ligne ni caractère de contrôle.'
        );
      }
    }
  });

  it('refuse un libellé de créancier qui en contient', () => {
    const creditor = { treasuryAccountId: '33333333-3333-4333-8333-333333333333', label: 'Compte loyers' };
    expect(createCreditorSchema.safeParse(creditor).success).toBe(true);
    expect(createCreditorSchema.safeParse({ ...creditor, label: 'Compte\r\nloyers' }).success).toBe(false);
    expect(createCreditorSchema.safeParse({ ...creditor, label: `Compte${PARAGRAPH_SEPARATOR}loyers` }).success).toBe(
      false
    );
  });
});

describe('e-mail / adresse masquée dans les journaux', () => {
  it('masque la partie locale et garde le domaine', () => {
    expect(redactEmailAddress('jean.dupont@exemple.ci')).toBe('j***@exemple.ci');
    expect(redactEmailAddress('  a@b.ci ')).toBe('a***@b.ci');
    expect(redactEmailAddress('pas-une-adresse')).toBe('***');
    expect(redactEmailAddress('@exemple.ci')).toBe('***');
  });

  it('un e-mail à adresse masquée ne journalise ni l adresse ni l objet', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      await emailService.sendEmail({
        to: 'awa.traore@exemple.ci',
        subject: 'Prélèvement de Awa Traoré',
        text: 'x',
        redactRecipient: true
      });
      const logged = JSON.stringify(log.mock.calls);
      expect(logged).toContain('a***@exemple.ci');
      expect(logged).not.toContain('awa.traore');
      expect(logged).not.toContain('Awa Traoré');
    } finally {
      log.mockRestore();
    }
  });

  it('les autres e-mails gardent leur journalisation actuelle', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      await emailService.sendEmail({ to: 'awa.traore@exemple.ci', subject: 'Bienvenue', text: 'x' });
      expect(JSON.stringify(log.mock.calls)).toContain('awa.traore@exemple.ci');
    } finally {
      log.mockRestore();
    }
  });

  it('la prénotification demande l adresse masquée', async () => {
    const send = jest.spyOn(emailService, 'sendEmail').mockResolvedValue(undefined);
    try {
      await emailService.sendDirectDebitPrenotification(
        'awa.traore@exemple.ci',
        {
          debtorName: 'Awa Traoré',
          agencyName: 'Agence Test',
          amount: '160 000 FCFA',
          collectionDate: '26/10/2026',
          period: '10/2026',
          leaseNumber: 'BAIL-001',
          ibanMasked: 'CI•• •••• 0589',
          mandateReference: 'MDT-2026-0001',
          creditorIdentifier: 'CI-EMET-001'
        },
        { tenantId: 'tenant-a' }
      );
      expect(send).toHaveBeenCalledWith(expect.objectContaining({ redactRecipient: true, tenantId: 'tenant-a' }));
    } finally {
      send.mockRestore();
    }
  });
});
