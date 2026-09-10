import { getLeaseById } from '../../src/services/rental-lease-service';

/**
 * `getLeaseById` — noms des parties resolus cote serveur (§8.4).
 *
 * `rental/LeaseDetailPage.tsx:57-80` chargeait le bail, constatait que
 * `user.fullName` etait vide, puis relancait une requete `getContact` par
 * partie manquante. C'est une cascade : l'ecran s'affichait d'abord avec des
 * noms absents, qui apparaissaient ensuite.
 *
 * Le nom est desormais resolu avant la reponse, en une requete pour les deux
 * parties. Le test qui compte est celui de l'isolation : la resolution part
 * d'un identifiant de contact stocke dans un champ JSON, donc d'une donnee que
 * rien ne contraint. Si la requete oubliait l'agence, un identifiant recopie
 * d'une autre agence resoudrait le nom de quelqu'un qui n'a rien a voir avec ce
 * bail.
 */

const TENANT_ID = 'tenant-1';

/** Dernier `where` transmis a `crmContact.findMany`. */
let lastContactWhere: any = null;
const contactFindMany = jest.fn(async ({ where }: any) => {
  lastContactWhere = where;
  return CONTACTS.filter(c => where.id.in.includes(c.id) && c.tenantId === where.tenantId);
});

const CONTACTS = [
  {
    id: 'contact-personne',
    tenantId: TENANT_ID,
    contactType: 'PERSON',
    firstName: 'Aissatou',
    lastName: 'Diallo',
    legalName: null
  },
  {
    id: 'contact-societe',
    tenantId: TENANT_ID,
    contactType: 'COMPANY',
    firstName: 'Mamadou',
    lastName: 'Bah',
    legalName: 'SCI Kaloum'
  },
  {
    id: 'contact-autre-agence',
    tenantId: 'tenant-2',
    contactType: 'PERSON',
    firstName: 'Personne',
    lastName: 'Etrangere',
    legalName: null
  }
];

/** Bail configurable : chaque test decrit les deux parties dont il a besoin. */
let leaseFixture: any = null;

jest.mock('../../src/utils/database', () => ({
  prisma: {
    rentalLease: { findFirst: jest.fn(async () => leaseFixture) },
    crmContact: { findMany: (...args: any[]) => contactFindMany(args[0]) }
  }
}));

jest.mock('../../src/services/audit-service', () => ({ logAuditEvent: jest.fn() }));
jest.mock('../../src/services/email-service', () => ({ emailService: {} }));
jest.mock('../../src/services/email-notification-config-service', () => ({
  getEmailNotificationConfig: jest.fn()
}));
jest.mock('../../src/services/property-status-service', () => ({ updatePropertyStatus: jest.fn() }));
jest.mock('../../src/services/tenant-service', () => ({ getTenantById: jest.fn() }));

/** Fabrique une partie au bail : soit rattachee a un compte, soit a un contact. */
function party(options: { fullName?: string | null; crmContactId?: string }) {
  return {
    id: 'client-x',
    userId: options.fullName ? 'user-x' : null,
    clientType: 'RENTER',
    details: options.crmContactId ? { crmContactId: options.crmContactId } : {},
    user: options.fullName ? { id: 'user-x', fullName: options.fullName, email: 'x@example.com' } : null
  };
}

describe('getLeaseById — noms des parties', () => {
  beforeEach(() => {
    contactFindMany.mockClear();
    lastContactWhere = null;
    leaseFixture = null;
  });

  it('ne resout jamais un contact d’une autre agence', async () => {
    // Le champ JSON du bail nomme un contact qui appartient a `tenant-2`.
    leaseFixture = {
      id: 'lease-1',
      primaryRenter: party({ crmContactId: 'contact-autre-agence' }),
      ownerClient: null
    };

    const lease: any = await getLeaseById(TENANT_ID, 'lease-1');

    // L'agence fait partie du filtre…
    expect(lastContactWhere.tenantId).toBe(TENANT_ID);
    // …et aucun nom ne fuit.
    expect(lease.primaryRenter.displayName).toBeNull();
  });

  it('resout le nom d’une personne depuis le contact CRM', async () => {
    leaseFixture = {
      id: 'lease-1',
      primaryRenter: party({ crmContactId: 'contact-personne' }),
      ownerClient: null
    };

    const lease: any = await getLeaseById(TENANT_ID, 'lease-1');
    expect(lease.primaryRenter.displayName).toBe('Aissatou Diallo');
  });

  it('resout la raison sociale pour une societe, et non le nom du representant', async () => {
    leaseFixture = {
      id: 'lease-1',
      primaryRenter: party({ crmContactId: 'contact-societe' }),
      ownerClient: null
    };

    const lease: any = await getLeaseById(TENANT_ID, 'lease-1');
    expect(lease.primaryRenter.displayName).toBe('SCI Kaloum');
  });

  it('garde le nom du compte utilisateur quand il existe, sans requete', async () => {
    leaseFixture = {
      id: 'lease-1',
      primaryRenter: party({ fullName: 'Fatoumata Camara', crmContactId: 'contact-personne' }),
      ownerClient: null
    };

    const lease: any = await getLeaseById(TENANT_ID, 'lease-1');
    expect(lease.primaryRenter.displayName).toBe('Fatoumata Camara');
    // Rien a resoudre : la requete de contacts ne part pas.
    expect(contactFindMany).not.toHaveBeenCalled();
  });

  it('resout les deux parties en une seule requete', async () => {
    // C'est la propriete qui remplace la cascade : le cout ne croit pas avec
    // le nombre de parties a completer.
    leaseFixture = {
      id: 'lease-1',
      primaryRenter: party({ crmContactId: 'contact-personne' }),
      ownerClient: party({ crmContactId: 'contact-societe' })
    };

    const lease: any = await getLeaseById(TENANT_ID, 'lease-1');
    expect(contactFindMany).toHaveBeenCalledTimes(1);
    expect(lease.primaryRenter.displayName).toBe('Aissatou Diallo');
    expect(lease.ownerClient.displayName).toBe('SCI Kaloum');
  });

  it('rend un nom nul plutot qu’absent quand rien ne permet de le construire', async () => {
    // Le front doit pouvoir distinguer « pas encore charge » de « inconnu ».
    leaseFixture = { id: 'lease-1', primaryRenter: party({}), ownerClient: null };

    const lease: any = await getLeaseById(TENANT_ID, 'lease-1');
    expect(lease.primaryRenter).toHaveProperty('displayName', null);
  });

  it('ne casse pas sur un bail introuvable', async () => {
    leaseFixture = null;
    await expect(getLeaseById(TENANT_ID, 'inconnu')).resolves.toBeNull();
  });
});
