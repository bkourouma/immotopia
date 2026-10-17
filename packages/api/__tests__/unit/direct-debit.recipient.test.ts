/**
 * Destinataire de l'avis de prélèvement (spec 042) : masque d'adresse et règle
 * « compte portail d'abord, puis contact CRM de l'agence ».
 */
import { maskEmail, resolveDebtorRecipients } from '../../src/lib/direct-debit/recipient';
import { summarizePrenotifications } from '../../src/lib/direct-debit/remittance-dto';

type Row = Record<string, any>;

function fakeDb(clients: Row[], contacts: Row[]) {
  return {
    tenantClient: {
      findMany: jest.fn(async ({ where }: Row) =>
        clients
          .filter(row => where.tenantId === row.tenantId && where.id.in.includes(row.id))
          .map(row => ({ id: row.id, details: row.details ?? null, user: { email: row.email ?? null } }))
      )
    },
    crmContact: {
      findMany: jest.fn(async ({ where }: Row) =>
        contacts.filter(row => row.tenantId === where.tenantId && where.id.in.includes(row.id))
      )
    }
  } as any;
}

describe('maskEmail', () => {
  it('garde la première lettre, deux lettres du domaine et l extension', () => {
    expect(maskEmail('awa.gogoua@example.ci')).toBe('a•••@ex•••.ci');
    expect(maskEmail('  Koffi@Banque.com ')).toBe('K•••@Ba•••.com');
    expect(maskEmail('x@yz.fr')).toBe('x•••@yz•••.fr');
  });

  it('ne révèle rien d une adresse invalide ou absente', () => {
    for (const value of ['', 'sans-arobase', 'a@b', '@example.ci', 'a b@example.ci', null, undefined]) {
      expect(maskEmail(value as any)).toBe('•••');
    }
  });

  it('ne contient jamais l adresse complète', () => {
    expect(maskEmail('awa.gogoua@example.ci')).not.toContain('gogoua');
  });
});

describe('resolveDebtorRecipients', () => {
  const clients = [
    { id: 'c-account', tenantId: 'T1', email: 'awa@example.ci', details: { crmContactId: 'k-1' } },
    { id: 'c-contact', tenantId: 'T1', email: null, details: { crmContactId: 'k-1' } },
    { id: 'c-blank', tenantId: 'T1', email: '   ', details: { crmContactId: 'k-1' } },
    { id: 'c-none', tenantId: 'T1', email: null, details: null },
    { id: 'c-foreign-contact', tenantId: 'T1', email: null, details: { crmContactId: 'k-other' } },
    { id: 'c-other-agency', tenantId: 'T2', email: 'x@example.ci' }
  ];
  const contacts = [
    { id: 'k-1', tenantId: 'T1', email: ' contact@example.ci ' },
    { id: 'k-other', tenantId: 'T2', email: 'autre@example.ci' }
  ];

  it('prend le compte d abord, puis le contact CRM, sinon null', async () => {
    const result = await resolveDebtorRecipients(fakeDb(clients, contacts), 'T1', [
      'c-account',
      'c-contact',
      'c-blank',
      'c-none'
    ]);
    expect(result.get('c-account')).toEqual({ email: 'awa@example.ci', source: 'ACCOUNT' });
    expect(result.get('c-contact')).toEqual({ email: 'contact@example.ci', source: 'CONTACT' });
    expect(result.get('c-blank')).toEqual({ email: 'contact@example.ci', source: 'CONTACT' });
    expect(result.get('c-none')).toBeNull();
  });

  it('filtre par agence : client ou contact d une autre agence ne résout rien', async () => {
    const result = await resolveDebtorRecipients(fakeDb(clients, contacts), 'T1', [
      'c-foreign-contact',
      'c-other-agency',
      'inconnu'
    ]);
    expect(result.get('c-foreign-contact')).toBeNull();
    expect(result.get('c-other-agency')).toBeNull();
    expect(result.get('inconnu')).toBeNull();
  });

  it('ne lit rien sans identifiant et dédoublonne', async () => {
    const db = fakeDb(clients, contacts);
    expect((await resolveDebtorRecipients(db, 'T1', [])).size).toBe(0);
    expect(db.tenantClient.findMany).not.toHaveBeenCalled();
    const result = await resolveDebtorRecipients(db, 'T1', ['c-account', 'c-account']);
    expect(result.size).toBe(1);
  });
});

describe('summarizePrenotifications / destinataires', () => {
  it('compte les lignes PENDING par origine d adresse, les autres lignes ne comptent pas', () => {
    const summary = summarizePrenotifications([
      {
        status: 'PENDING',
        prenotificationStatus: 'PENDING',
        prenotificationRecipient: { masked: 'a•••@b•••.ci', source: 'ACCOUNT' }
      },
      {
        status: 'PENDING',
        prenotificationStatus: 'SENT',
        prenotificationRecipient: { masked: 'c•••@d•••.ci', source: 'CONTACT' }
      },
      { status: 'PENDING', prenotificationStatus: 'NO_EMAIL', prenotificationRecipient: null },
      { status: 'CANCELED', prenotificationStatus: 'PENDING', prenotificationRecipient: null },
      {
        status: 'SETTLED',
        prenotificationStatus: 'SENT',
        prenotificationRecipient: { masked: 'e•••@f•••.ci', source: 'ACCOUNT' }
      }
    ]);
    expect(summary.recipients).toEqual({ account: 1, contact: 1, none: 1 });
    expect(summary).toMatchObject({ pending: 1, sent: 1, noEmail: 1 });
  });
});
