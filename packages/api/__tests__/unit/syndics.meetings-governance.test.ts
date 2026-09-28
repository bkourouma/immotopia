/**
 * Assemblees generales : statut, votes figes, resultat en tantiemes, pouvoirs
 * et etancheite entre agences (lib/syndics/queries.ts).
 *
 * Faux client Prisma en memoire, aucune base : chaque delegue applique les
 * filtres que le service lui passe (dont `syndicate.tenantId`), si bien qu'un
 * filtre d'agence oublie laisserait fuir la ligne de l'autre agence.
 */

type Row = Record<string, any>;

let mockWorld: {
  syndicates: Row[];
  lots: Row[];
  contacts: Row[];
  meetings: Row[];
  resolutions: Row[];
  votes: Row[];
  proxies: Row[];
};
let mockSeq = 0;

jest.mock('@prisma/client', () => {
  const tenantOfSyndicate = (syndicateId: string) => mockWorld.syndicates.find(s => s.id === syndicateId)?.tenantId;

  const meetingMatches = (m: Row, where: Row) =>
    (where.id === undefined || m.id === where.id) &&
    (where.syndicateId === undefined || m.syndicateId === where.syndicateId) &&
    (where.syndicate?.tenantId === undefined || tenantOfSyndicate(m.syndicateId) === where.syndicate.tenantId);

  const contact = (id: string) => {
    const c = mockWorld.contacts.find(item => item.id === id);
    return c ? { id: c.id, firstName: c.firstName, lastName: c.lastName, legalName: null, email: null } : null;
  };

  const withProxyRelations = (p: Row) => ({
    ...p,
    grantor: contact(p.grantorContactId),
    representative: contact(p.representativeContactId)
  });

  const client: Row = {
    generalMeeting: {
      findFirst: jest.fn(async ({ where, include }: Row) => {
        const m = mockWorld.meetings.find(item => meetingMatches(item, where));
        if (!m) return null;
        if (!include) return { ...m };
        return {
          ...m,
          syndicate: {
            ...mockWorld.syndicates.find(s => s.id === m.syndicateId),
            lots: mockWorld.lots.filter(l => l.syndicateId === m.syndicateId)
          },
          agendaItems: [],
          resolutions: mockWorld.resolutions
            .filter(r => r.meetingId === m.id)
            .map(r => ({ ...r, votes: mockWorld.votes.filter(v => v.resolutionId === r.id) })),
          proxies: mockWorld.proxies.filter(p => p.meetingId === m.id).map(withProxyRelations)
        };
      }),
      update: jest.fn(async ({ where, data }: Row) => {
        const m = mockWorld.meetings.find(item => item.id === where.id)!;
        Object.assign(m, data);
        return { ...m };
      })
    },
    gMResolution: {
      findFirst: jest.fn(async ({ where }: Row) => {
        const r = mockWorld.resolutions.find(item => item.id === where.id);
        if (!r) return null;
        const m = mockWorld.meetings.find(item => item.id === r.meetingId)!;
        if (!meetingMatches(m, where.meeting)) return null;
        return { ...r, meeting: { id: m.id, status: m.status, scheduledAt: m.scheduledAt } };
      }),
      findMany: jest.fn(async ({ where }: Row) =>
        mockWorld.resolutions
          .filter(r => r.meetingId === where.meetingId)
          .map(r => ({ ...r, votes: mockWorld.votes.filter(v => v.resolutionId === r.id) }))
      ),
      create: jest.fn(async ({ data }: Row) => {
        const row = {
          id: `res-${++mockSeq}`,
          votesFor: 0,
          votesAgainst: 0,
          votesAbstain: 0,
          sharesFor: 0,
          result: null,
          ...data
        };
        mockWorld.resolutions.push(row);
        return row;
      }),
      update: jest.fn(async ({ where, data }: Row) => {
        const r = mockWorld.resolutions.find(item => item.id === where.id)!;
        Object.assign(r, data);
        return r;
      })
    },
    gMVote: {
      upsert: jest.fn(async ({ where, update, create }: Row) => {
        const key = where.resolutionId_lotId;
        const existing = mockWorld.votes.find(v => v.resolutionId === key.resolutionId && v.lotId === key.lotId);
        if (existing) return Object.assign(existing, update);
        const row = { id: `vote-${++mockSeq}`, ...create };
        mockWorld.votes.push(row);
        return row;
      })
    },
    syndicateLot: {
      findFirst: jest.fn(async ({ where }: Row) => {
        const lot = mockWorld.lots.find(
          l =>
            (where.id === undefined || l.id === where.id) &&
            l.syndicateId === where.syndicateId &&
            (where.syndicate?.tenantId === undefined ||
              tenantOfSyndicate(l.syndicateId) === where.syndicate.tenantId) &&
            (!where.OR || where.OR.some((cond: Row) => Object.entries(cond).every(([k, v]) => l[k] === v)))
        );
        return lot ? { id: lot.id } : null;
      }),
      findMany: jest.fn(async ({ where }: Row) => mockWorld.lots.filter(l => l.syndicateId === where.syndicateId))
    },
    crmContact: {
      findFirst: jest.fn(async ({ where }: Row) => {
        const c = mockWorld.contacts.find(item => item.id === where.id && item.tenantId === where.tenantId);
        return c ? { id: c.id } : null;
      })
    },
    gMProxy: {
      findFirst: jest.fn(async ({ where }: Row) => {
        const p = mockWorld.proxies.find(
          item =>
            (where.id === undefined || item.id === where.id) &&
            item.meetingId === where.meetingId &&
            (where.grantorContactId === undefined || item.grantorContactId === where.grantorContactId)
        );
        return p ? { id: p.id } : null;
      }),
      findMany: jest.fn(async ({ where }: Row) =>
        mockWorld.proxies.filter(p => p.meetingId === where.meetingId).map(withProxyRelations)
      ),
      create: jest.fn(async ({ data }: Row) => {
        const row = { id: `proxy-${++mockSeq}`, createdAt: new Date(), ...data };
        mockWorld.proxies.push(row);
        return withProxyRelations(row);
      }),
      delete: jest.fn(async ({ where }: Row) => {
        const index = mockWorld.proxies.findIndex(p => p.id === where.id);
        return mockWorld.proxies.splice(index, 1)[0];
      })
    }
  };
  client.$transaction = jest.fn(async (callback: any) => callback(client));

  return { PrismaClient: jest.fn(() => client), Prisma: {} };
});

import {
  addResolutionToMeeting,
  castVoteAndRecomputeResolutionCounters,
  createMeetingProxyByTenant,
  deleteMeetingProxyByTenant,
  getMeetingByTenant,
  listMeetingProxiesByTenant,
  updateMeetingByTenant
} from '../../src/lib/syndics/queries';

const T1 = 'tenant-1';
const T2 = 'tenant-2';
const S1 = 'syndic-1';
const S2 = 'syndic-2';

function resetWorld(status = 'PLANNED') {
  mockSeq = 0;
  mockWorld = {
    syndicates: [
      { id: S1, tenantId: T1 },
      { id: S2, tenantId: T2 }
    ],
    lots: [
      { id: 'A1', syndicateId: S1, generalShares: 100, coownerId: 'c1', ownerContactId: 'c1' },
      { id: 'A2', syndicateId: S1, generalShares: 200, coownerId: 'c2', ownerContactId: 'c2' },
      { id: 'A3', syndicateId: S1, generalShares: 300, coownerId: 'c3', ownerContactId: 'c3' },
      { id: 'A4', syndicateId: S1, generalShares: 400, coownerId: 'c4', ownerContactId: 'c4' },
      { id: 'B1', syndicateId: S2, generalShares: 1000, coownerId: 'x1', ownerContactId: 'x1' }
    ],
    contacts: [
      { id: 'c1', tenantId: T1, firstName: 'Awa', lastName: 'Kone' },
      { id: 'c2', tenantId: T1, firstName: 'Bakary', lastName: 'Diallo' },
      { id: 'c3', tenantId: T1, firstName: 'Chantal', lastName: 'Yao' },
      { id: 'c4', tenantId: T1, firstName: 'Didier', lastName: 'Kouassi' },
      { id: 'c5', tenantId: T1, firstName: 'Eric', lastName: 'Mandataire' },
      { id: 'x1', tenantId: T2, firstName: 'Xavier', lastName: 'Autre' }
    ],
    meetings: [
      { id: 'M1', syndicateId: S1, status, startTime: null, endTime: null, quorum: null },
      { id: 'M2', syndicateId: S2, status: 'PLANNED', startTime: null, endTime: null, quorum: null }
    ],
    resolutions: [
      {
        id: 'R1',
        meetingId: 'M1',
        title: 'Budget',
        majorityRule: 'ARTICLE_24',
        votesFor: 0,
        votesAgainst: 0,
        votesAbstain: 0,
        sharesFor: 0,
        result: null
      }
    ],
    votes: [],
    proxies: []
  };
}

/** Statut HTTP d'une erreur : `status` (fabriques de lib/errors) ou `statusCode` (classes typees). */
async function expectStatus(promise: Promise<unknown>, status: number, message?: RegExp) {
  const error: any = await promise.then(
    () => {
      throw new Error(`Rejet ${status} attendu, la promesse a abouti`);
    },
    (err: unknown) => err
  );
  expect(error.status ?? error.statusCode).toBe(status);
  if (message) {
    await expect(promise).rejects.toThrow(message);
  }
}

describe('AG - transitions de statut', () => {
  beforeEach(() => resetWorld());

  it('planifiee -> en cours -> cloturee, avec horodatage de la seance', async () => {
    const opened = await updateMeetingByTenant(T1, S1, 'M1', { status: 'IN_PROGRESS' });
    expect(opened.status).toBe('IN_PROGRESS');
    expect(opened.startTime).toBeInstanceOf(Date);

    const closed = await updateMeetingByTenant(T1, S1, 'M1', { status: 'COMPLETED' });
    expect(closed.status).toBe('COMPLETED');
    expect(closed.endTime).toBeInstanceOf(Date);
  });

  it('planifiee -> annulee', async () => {
    const cancelled = await updateMeetingByTenant(T1, S1, 'M1', { status: 'CANCELLED' });
    expect(cancelled.status).toBe('CANCELLED');
  });

  it('refuse de cloturer une seance jamais ouverte (409)', async () => {
    await expectStatus(updateMeetingByTenant(T1, S1, 'M1', { status: 'COMPLETED' }), 409, /ouverte avant/);
    expect(mockWorld.meetings[0].status).toBe('PLANNED');
  });

  it('refuse d annuler une seance en cours et de rouvrir une seance cloturee (409)', async () => {
    resetWorld('IN_PROGRESS');
    await expectStatus(updateMeetingByTenant(T1, S1, 'M1', { status: 'CANCELLED' }), 409, /cloturez-la/);
    resetWorld('COMPLETED');
    await expectStatus(updateMeetingByTenant(T1, S1, 'M1', { status: 'IN_PROGRESS' }), 409, /ne peut plus changer/);
  });

  it('fige le resultat a la cloture, recalcule en tantiemes', async () => {
    resetWorld('IN_PROGRESS');
    mockWorld.votes.push(
      { id: 'v1', resolutionId: 'R1', lotId: 'A1', vote: 'FOR' },
      { id: 'v2', resolutionId: 'R1', lotId: 'A4', vote: 'AGAINST' }
    );
    await updateMeetingByTenant(T1, S1, 'M1', { status: 'COMPLETED' });
    expect(mockWorld.resolutions[0]).toMatchObject({
      result: 'REJECTED',
      votesFor: 1,
      votesAgainst: 1,
      sharesFor: 100
    });
    expect(mockWorld.meetings[0].quorum).toBe(50);
  });

  it('ne change pas le statut d une AG d une autre agence (404)', async () => {
    await expectStatus(updateMeetingByTenant(T1, S2, 'M2', { status: 'IN_PROGRESS' }), 404);
    await expectStatus(updateMeetingByTenant(T1, S1, 'M2', { status: 'IN_PROGRESS' }), 404);
    expect(mockWorld.meetings[1].status).toBe('PLANNED');
  });
});

describe('AG - votes et resolutions', () => {
  beforeEach(() => resetWorld('IN_PROGRESS'));

  it('recalcule le resultat en tantiemes a chaque vote (2 lots pour, mais 300 contre 300 -> rejetee)', async () => {
    await castVoteAndRecomputeResolutionCounters(T1, S1, 'R1', 'A1', 'FOR');
    await castVoteAndRecomputeResolutionCounters(T1, S1, 'R1', 'A2', 'FOR');
    let meeting: any = await castVoteAndRecomputeResolutionCounters(T1, S1, 'R1', 'A3', 'AGAINST');
    expect(meeting.resolutions[0].result).toBe('REJECTED');

    meeting = await castVoteAndRecomputeResolutionCounters(T1, S1, 'R1', 'A4', 'ABSTAIN');
    const resolution = meeting.resolutions[0];
    expect(resolution).toMatchObject({
      votesFor: 2,
      votesAgainst: 1,
      votesAbstain: 1,
      sharesFor: 300,
      result: 'REJECTED'
    });
    expect(resolution.tally).toMatchObject({
      rule: 'ARTICLE_24',
      sharesAgainst: 300,
      sharesAbstain: 400,
      referenceShares: 600
    });
    expect(meeting.attendance).toMatchObject({ representedShares: 1000, totalShares: 1000, quorumPercent: 100 });
    expect(mockWorld.meetings[0].quorum).toBe(100);

    // Le lot A3 change d'avis : 500 pour contre 0 -> approuvee.
    meeting = await castVoteAndRecomputeResolutionCounters(T1, S1, 'R1', 'A3', 'FOR');
    expect(meeting.resolutions[0].result).toBe('APPROVED');
  });

  it('recalcul stocke (article 26) : un lot vendu apres l AG vote encore par son ancien proprietaire', async () => {
    // Ecart recette (lot syndic-ecarts, T2) : le RESULTAT STOCKE par
    // `recomputeMeetingResultsTx` doit suivre la regle « votant = proprietaire
    // a la date de l'AG », comme la lecture (`getMeetingByTenant`). A1 (500)
    // et A3 (300) votent pour ; A2 (100) et A4 (100) ne votent pas. A2 est
    // revendu par c2 a c1 APRES l'AG : au moment du vote, c1 possede deja A1
    // ET A2 dans la base, mais a la date de l'AG (`scheduledAt`), A2
    // appartenait encore a c2.
    const scheduledAt = new Date('2024-01-01T00:00:00Z');
    const soldAfterMeeting = new Date('2024-06-01T00:00:00Z');
    mockWorld.meetings[0].scheduledAt = scheduledAt;
    mockWorld.resolutions[0].majorityRule = 'ARTICLE_26';

    mockWorld.lots[0].generalShares = 500; // A1, c1
    mockWorld.lots[2].generalShares = 300; // A3, c3
    mockWorld.lots[3].generalShares = 100; // A4, c4, ne vote pas

    // A2 : proprietaire actuel c1 (vente posterieure a l'AG), mais historique
    // de propriete montrant c2 a la date de l'AG.
    mockWorld.lots[1].generalShares = 100;
    mockWorld.lots[1].coownerId = 'c1';
    mockWorld.lots[1].ownerContactId = 'c1';
    mockWorld.lots[1].ownerProfiles = [
      {
        contactId: 'c2',
        ownershipPercentage: 100,
        ownedSince: new Date('2010-01-01T00:00:00Z'),
        ownedUntil: soldAfterMeeting,
        contact: { id: 'c2', firstName: 'Bakary', lastName: 'Diallo', legalName: null, email: null }
      },
      {
        contactId: 'c1',
        ownershipPercentage: 100,
        ownedSince: soldAfterMeeting,
        ownedUntil: null,
        contact: { id: 'c1', firstName: 'Awa', lastName: 'Kone', legalName: null, email: null }
      }
    ];

    await castVoteAndRecomputeResolutionCounters(T1, S1, 'R1', 'A1', 'FOR');
    await castVoteAndRecomputeResolutionCounters(T1, S1, 'R1', 'A3', 'FOR');

    // A la date de l'AG, A1 (c1) et A2 (c2, ancien proprietaire) restent deux
    // coproprietaires distincts parmi 4 (c1, c2, c3, c4) : le « pour » ne
    // compte que c1 et c3 -> majorite en nombre non atteinte (2*2 = 4, pas
    // > 4) -> REJETEE malgre des tantiemes largement suffisants (800/1000).
    // Si le recalcul ignorait `scheduledAt` (repli sur la date du jour), A2
    // fusionnerait avec c1 (proprietaire actuel), ramenant le total a 3
    // coproprietaires : 2*2 = 4 > 3 aurait alors APPROUVE la resolution — ce
    // test echouerait.
    expect(mockWorld.resolutions[0].result).toBe('REJECTED');
    expect(mockWorld.resolutions[0].votesFor).toBe(2);
    expect(mockWorld.resolutions[0].sharesFor).toBe(800);
  });

  it('refuse tout vote une fois l AG cloturee, et ne modifie pas le vote existant (409)', async () => {
    mockWorld.votes.push({ id: 'v1', resolutionId: 'R1', lotId: 'A1', vote: 'FOR' });
    mockWorld.meetings[0].status = 'COMPLETED';

    await expectStatus(castVoteAndRecomputeResolutionCounters(T1, S1, 'R1', 'A1', 'AGAINST'), 409, /votes sont figes/);
    await expectStatus(castVoteAndRecomputeResolutionCounters(T1, S1, 'R1', 'A2', 'FOR'), 409);
    expect(mockWorld.votes).toEqual([{ id: 'v1', resolutionId: 'R1', lotId: 'A1', vote: 'FOR' }]);
  });

  it('refuse un vote sur une AG annulee (409)', async () => {
    mockWorld.meetings[0].status = 'CANCELLED';
    await expectStatus(castVoteAndRecomputeResolutionCounters(T1, S1, 'R1', 'A1', 'FOR'), 409);
  });

  it('refuse d ajouter une resolution a une AG cloturee (409)', async () => {
    mockWorld.meetings[0].status = 'COMPLETED';
    await expectStatus(
      addResolutionToMeeting(T1, S1, { meetingId: 'M1', title: 'Travaux' }),
      409,
      /ajouter une resolution/
    );
    expect(mockWorld.resolutions).toHaveLength(1);
  });

  it('attribue l article 24 par defaut et garde un texte libre tel quel', async () => {
    const byDefault = await addResolutionToMeeting(T1, S1, { meetingId: 'M1', title: 'Travaux' });
    expect(byDefault.majorityRule).toBe('ARTICLE_24');
    const freeText = await addResolutionToMeeting(T1, S1, {
      meetingId: 'M1',
      title: 'Ravalement',
      majorityRule: 'Article 24'
    });
    expect(freeText.majorityRule).toBe('Article 24');
    const art26 = await addResolutionToMeeting(T1, S1, { meetingId: 'M1', title: 'Vente', majorityRule: 'ARTICLE_26' });
    expect(art26.majorityRule).toBe('ARTICLE_26');
  });

  it('refuse de voter pour le lot d une autre copropriete (404)', async () => {
    await expectStatus(castVoteAndRecomputeResolutionCounters(T1, S1, 'R1', 'B1', 'FOR'), 404);
  });

  it('ne laisse pas une autre agence voter ni lire l AG (404)', async () => {
    await expectStatus(castVoteAndRecomputeResolutionCounters(T2, S1, 'R1', 'A1', 'FOR'), 404);
    expect(await getMeetingByTenant(T2, S1, 'M1')).toBeNull();
    expect(mockWorld.votes).toHaveLength(0);
  });
});

describe('AG - pouvoirs', () => {
  beforeEach(() => resetWorld());

  const create = (
    grantorContactId: string,
    representativeContactId: string,
    tenantId = T1,
    syndicateId = S1,
    meetingId = 'M1'
  ) => createMeetingProxyByTenant(tenantId, syndicateId, { meetingId, grantorContactId, representativeContactId });

  it('cree, liste et retire un pouvoir', async () => {
    const proxy: any = await create('c1', 'c5');
    expect(proxy.grantor).toMatchObject({ id: 'c1', firstName: 'Awa' });
    expect(proxy.representative).toMatchObject({ id: 'c5' });

    const listed = await listMeetingProxiesByTenant(T1, S1, 'M1');
    expect(listed).toHaveLength(1);

    const meeting: any = await getMeetingByTenant(T1, S1, 'M1');
    expect(meeting.proxies[0].representative.lastName).toBe('Mandataire');

    await deleteMeetingProxyByTenant(T1, S1, 'M1', proxy.id);
    expect(mockWorld.proxies).toHaveLength(0);
  });

  it('accepte un autre coproprietaire comme mandataire', async () => {
    await expect(create('c1', 'c2')).resolves.toMatchObject({ grantorContactId: 'c1', representativeContactId: 'c2' });
  });

  it('refuse un mandant qui n est coproprietaire d aucun lot de la copropriete (422)', async () => {
    await expectStatus(create('c5', 'c1'), 422, /coproprietaire d'au moins un lot/);
  });

  it('refuse un mandataire identique au mandant (422)', async () => {
    await expectStatus(create('c1', 'c1'), 422, /ne peut pas etre le mandant/);
  });

  it('refuse un second pouvoir du meme mandant pour la meme AG (409)', async () => {
    await create('c1', 'c5');
    await expectStatus(create('c1', 'c2'), 409, /deja donne un pouvoir/);
    expect(mockWorld.proxies).toHaveLength(1);
  });

  it('refuse un contact d une autre agence, mandant ou mandataire (404)', async () => {
    await expectStatus(create('c1', 'x1'), 404, /Contact introuvable/);
    await expectStatus(create('x1', 'c1'), 404, /Contact introuvable/);
    expect(mockWorld.proxies).toHaveLength(0);
  });

  it('refuse toute operation sur l AG d une autre agence (404)', async () => {
    await expectStatus(create('c1', 'c5', T1, S2, 'M2'), 404);
    await expectStatus(create('c1', 'c5', T2, S1, 'M1'), 404);
    await expectStatus(listMeetingProxiesByTenant(T2, S1, 'M1'), 404);
    await create('c1', 'c5');
    await expectStatus(deleteMeetingProxyByTenant(T2, S1, 'M1', mockWorld.proxies[0].id), 404);
    // Pouvoir existant, mais demande via une autre AG de l'agence.
    mockWorld.meetings.push({ id: 'M3', syndicateId: S1, status: 'PLANNED' });
    await expectStatus(deleteMeetingProxyByTenant(T1, S1, 'M3', mockWorld.proxies[0].id), 404, /Pouvoir introuvable/);
    expect(mockWorld.proxies).toHaveLength(1);
  });

  it('fige les pouvoirs une fois l AG cloturee (409)', async () => {
    await create('c1', 'c5');
    mockWorld.meetings[0].status = 'COMPLETED';
    await expectStatus(create('c2', 'c5'), 409, /pouvoirs ne peuvent plus/);
    await expectStatus(deleteMeetingProxyByTenant(T1, S1, 'M1', mockWorld.proxies[0].id), 409);
    expect(mockWorld.proxies).toHaveLength(1);
  });
});
