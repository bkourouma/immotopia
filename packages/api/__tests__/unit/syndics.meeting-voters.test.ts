/**
 * Votant d'un lot a la date de l'AG (`GeneralMeeting.scheduledAt`), pas le
 * proprietaire actuel — lib/syndics/meeting-voters.ts (ecart recette, lot
 * syndic-ecarts T2).
 */
import {
  votersAt,
  voterKey,
  toMajorityLotsAt,
  type LotOwnerProfileForVoters,
  type LotForVoters
} from '../../src/lib/syndics/meeting-voters';
import { computeResolutionTally } from '../../src/lib/syndics/meeting-majority';

const CONTACT_ANCIEN = {
  id: 'contact-ancien',
  firstName: 'Awa',
  lastName: 'Diallo',
  legalName: null,
  email: 'awa@example.com'
};
const CONTACT_NOUVEAU = {
  id: 'contact-nouveau',
  firstName: 'Moussa',
  lastName: 'Sy',
  legalName: null,
  email: 'moussa@example.com'
};
const CONTACT_INDIVIS_MAJ = {
  id: 'contact-indivis-60',
  firstName: 'Fatou',
  lastName: 'Ba',
  legalName: null,
  email: null
};
const CONTACT_INDIVIS_MIN = {
  id: 'contact-indivis-40',
  firstName: 'Ibra',
  lastName: 'Ndao',
  legalName: null,
  email: null
};

function profile(
  overrides: Partial<LotOwnerProfileForVoters> & Pick<LotOwnerProfileForVoters, 'contact'>
): LotOwnerProfileForVoters {
  return {
    contactId: overrides.contact.id,
    ownershipPercentage: 100,
    ownedSince: new Date('2020-01-01'),
    ownedUntil: null,
    ...overrides
  };
}

describe('votersAt — lot vendu entre deux AG', () => {
  const lot: LotForVoters = {
    id: 'lot-A2',
    coownerId: 'contact-nouveau',
    ownerContactId: 'contact-nouveau',
    owner: CONTACT_NOUVEAU
  };
  const profiles: LotOwnerProfileForVoters[] = [
    profile({ contact: CONTACT_ANCIEN, ownedSince: new Date('2018-01-01'), ownedUntil: new Date('2025-06-01') }),
    profile({ contact: CONTACT_NOUVEAU, ownedSince: new Date('2025-06-01'), ownedUntil: null })
  ];

  it("a l'AG passee, le votant est l'ancien proprietaire", () => {
    const voters = votersAt(lot, profiles, new Date('2024-03-01'));
    expect(voters).toHaveLength(1);
    expect(voters[0].contactId).toBe('contact-ancien');
    expect(voters[0].ownershipPercentage).toBe(100);
  });

  it("a l'AG suivante, le votant est le nouveau proprietaire", () => {
    const voters = votersAt(lot, profiles, new Date('2025-09-01'));
    expect(voters).toHaveLength(1);
    expect(voters[0].contactId).toBe('contact-nouveau');
  });

  it('la borne ownedUntil est exclusive : le jour du transfert vote deja le nouveau proprietaire', () => {
    const voters = votersAt(lot, profiles, new Date('2025-06-01T00:00:00.000Z'));
    expect(voters).toHaveLength(1);
    expect(voters[0].contactId).toBe('contact-nouveau');
  });

  it('la veille du transfert, le votant est encore l ancien proprietaire (ownedSince inclusif)', () => {
    const voters = votersAt(lot, profiles, new Date('2025-05-31T23:59:59.999Z'));
    expect(voters[0].contactId).toBe('contact-ancien');
  });
});

describe('votersAt — indivision', () => {
  it('ordonne les indivisaires part decroissante d abord (60/40)', () => {
    const lot: LotForVoters = { id: 'lot-indivis', coownerId: null, ownerContactId: null, owner: null };
    const profiles: LotOwnerProfileForVoters[] = [
      profile({ contact: CONTACT_INDIVIS_MIN, ownershipPercentage: 40 }),
      profile({ contact: CONTACT_INDIVIS_MAJ, ownershipPercentage: 60 })
    ];

    const voters = votersAt(lot, profiles, new Date('2025-01-01'));

    expect(voters.map(v => v.contactId)).toEqual(['contact-indivis-60', 'contact-indivis-40']);
    expect(voters.map(v => v.ownershipPercentage)).toEqual([60, 40]);
  });
});

describe('votersAt — repli et absence de votant', () => {
  it('aucun profil ne couvre la date : repli sur le proprietaire actuel du lot, part 100', () => {
    const lot: LotForVoters = {
      id: 'lot-sans-profil',
      coownerId: 'contact-nouveau',
      ownerContactId: 'contact-nouveau',
      owner: CONTACT_NOUVEAU
    };
    const voters = votersAt(lot, [], new Date('2025-01-01'));
    expect(voters).toEqual([
      {
        contactId: 'contact-nouveau',
        firstName: 'Moussa',
        lastName: 'Sy',
        legalName: null,
        email: 'moussa@example.com',
        ownershipPercentage: 100
      }
    ]);
  });

  it('ni profil couvrant ni proprietaire actuel : aucun votant', () => {
    const lot: LotForVoters = { id: 'lot-orphelin', coownerId: null, ownerContactId: null, owner: null };
    expect(votersAt(lot, [], new Date('2025-01-01'))).toEqual([]);
  });
});

describe('voterKey', () => {
  it('joint les ids des votants tries', () => {
    const lot: LotForVoters = { id: 'lot-indivis', coownerId: null, ownerContactId: null, owner: null };
    const voters = votersAt(
      lot,
      [
        profile({ contact: CONTACT_INDIVIS_MIN, ownershipPercentage: 40 }),
        profile({ contact: CONTACT_INDIVIS_MAJ, ownershipPercentage: 60 })
      ],
      new Date('2025-01-01')
    );
    expect(voterKey(voters, lot)).toBe(['contact-indivis-40', 'contact-indivis-60'].sort().join('+'));
  });

  it('sans votant, repli sur coownerId puis ownerContactId', () => {
    expect(voterKey([], { id: 'lot-1', coownerId: 'c1', ownerContactId: 'c2' })).toBe('c1');
    expect(voterKey([], { id: 'lot-1', coownerId: null, ownerContactId: 'c2' })).toBe('c2');
    expect(voterKey([], { id: 'lot-1', coownerId: null, ownerContactId: null })).toBeNull();
  });
});

describe('toMajorityLotsAt — article 26, deux lots du meme proprietaire A LA DATE de l AG', () => {
  it('un proprietaire avec deux lots a la date de l AG compte pour UN coproprietaire, meme s ils ont aujourd hui deux proprietaires differents', () => {
    // A la date de l'AG (2024-01-01), c1 possede A1 ET A2. Depuis, A2 a ete
    // vendu a c2 (mais ce profil ne couvre pas la date de l'AG).
    const lots = [
      {
        id: 'A1',
        generalShares: 300,
        coownerId: 'c1',
        ownerContactId: 'c1',
        owner: { id: 'c1', firstName: 'C1', lastName: '', legalName: null, email: null }
      },
      {
        id: 'A2',
        generalShares: 300,
        coownerId: 'c2',
        ownerContactId: 'c2',
        owner: { id: 'c2', firstName: 'C2', lastName: '', legalName: null, email: null }
      },
      {
        id: 'A3',
        generalShares: 400,
        coownerId: 'c3',
        ownerContactId: 'c3',
        owner: { id: 'c3', firstName: 'C3', lastName: '', legalName: null, email: null }
      }
    ];
    const profilesByLotId = new Map<string, LotOwnerProfileForVoters[]>([
      [
        'A2',
        [
          profile({
            contact: { id: 'c1', firstName: 'C1', lastName: '', legalName: null, email: null },
            ownedSince: new Date('2020-01-01'),
            ownedUntil: new Date('2024-06-01')
          }),
          profile({
            contact: { id: 'c2', firstName: 'C2', lastName: '', legalName: null, email: null },
            ownedSince: new Date('2024-06-01'),
            ownedUntil: null
          })
        ]
      ]
    ]);

    const meetingDate = new Date('2024-01-01');
    const majorityLots = toMajorityLotsAt(lots, profilesByLotId, meetingDate);

    // A la date de l'AG, A1 et A2 votent tous les deux par c1 : meme cle.
    expect(majorityLots.find(l => l.id === 'A1')!.coownerId).toBe(majorityLots.find(l => l.id === 'A2')!.coownerId);

    const tally = computeResolutionTally('ARTICLE_26', majorityLots, [
      { lotId: 'A1', vote: 'FOR' },
      { lotId: 'A2', vote: 'FOR' },
      { lotId: 'A3', vote: 'AGAINST' }
    ]);

    // c1 (A1+A2, 600 tantiemes) et c3 (400 tantiemes) : 2 coproprietaires au
    // total a la date de l'AG, 1 seul (c1) vote pour -> pas la majorite en
    // coproprietaires (1 sur 2 : pas plus de la moitie).
    expect(tally.totalOwners).toBe(2);
    expect(tally.ownersFor).toBe(1);
    expect(tally.sharesFor).toBe(600);
  });

  it('inversement, un lot sans votant a la date retombe sur son repli habituel (lot:id), sans regrouper avec un autre lot', () => {
    const lots = [
      { id: 'B1', generalShares: 100, coownerId: null, ownerContactId: null, owner: null },
      { id: 'B2', generalShares: 100, coownerId: null, ownerContactId: null, owner: null }
    ];
    const majorityLots = toMajorityLotsAt(lots, new Map(), new Date('2024-01-01'));
    expect(majorityLots.find(l => l.id === 'B1')!.coownerId).toBeNull();
    expect(majorityLots.find(l => l.id === 'B2')!.coownerId).toBeNull();
  });
});
