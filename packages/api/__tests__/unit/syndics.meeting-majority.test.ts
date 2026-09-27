/**
 * Regles de majorite des AG (FR-008, FR-009) : lib/syndics/meeting-majority.ts.
 *
 * Jeu de reference : 4 lots de 100, 200, 300 et 400 tantiemes (1000 au total),
 * chacun a un coproprietaire different sauf mention contraire.
 */
import {
  computeMeetingAttendance,
  computeResolutionTally,
  normalizeMajorityRule,
  type MajorityLot,
  type MajorityVote
} from '../../src/lib/syndics/meeting-majority';

const LOTS: MajorityLot[] = [
  { id: 'A1', generalShares: 100, coownerId: 'c1', ownerContactId: 'c1' },
  { id: 'A2', generalShares: 200, coownerId: 'c2', ownerContactId: 'c2' },
  { id: 'A3', generalShares: 300, coownerId: 'c3', ownerContactId: 'c3' },
  { id: 'A4', generalShares: 400, coownerId: 'c4', ownerContactId: 'c4' }
];

function votes(spec: Record<string, MajorityVote['vote']>): MajorityVote[] {
  return Object.entries(spec).map(([lotId, vote]) => ({ lotId, vote }));
}

describe('normalizeMajorityRule', () => {
  it('garde les codes stables et ramene tout texte libre a l article 24', () => {
    expect(normalizeMajorityRule('ARTICLE_25')).toBe('ARTICLE_25');
    expect(normalizeMajorityRule('article_26')).toBe('ARTICLE_26');
    expect(normalizeMajorityRule('UNANIMITE')).toBe('UNANIMITE');
    expect(normalizeMajorityRule('Article 24')).toBe('ARTICLE_24');
    expect(normalizeMajorityRule('Article 25 (texte libre)')).toBe('ARTICLE_24');
    expect(normalizeMajorityRule(null)).toBe('ARTICLE_24');
    expect(normalizeMajorityRule(undefined)).toBe('ARTICLE_24');
  });
});

describe('Article 24 - majorite simple des tantiemes exprimes', () => {
  it('diverge de la majorite en lots : 2 lots pour contre 1, mais 300 tantiemes contre 300 -> rejetee', () => {
    const tally = computeResolutionTally('ARTICLE_24', LOTS, votes({ A1: 'FOR', A2: 'FOR', A3: 'AGAINST', A4: 'ABSTAIN' }));

    // Ancienne regle (nombre de lots) : 2 > 1, la resolution aurait ete approuvee.
    expect(tally.votesFor).toBeGreaterThan(tally.votesAgainst);
    expect(tally).toMatchObject({
      rule: 'ARTICLE_24',
      sharesFor: 300,
      sharesAgainst: 300,
      sharesAbstain: 400,
      referenceShares: 600,
      totalShares: 1000,
      result: 'REJECTED'
    });
  });

  it('diverge dans l autre sens : 1 lot pour contre 2, mais 400 tantiemes contre 300 -> approuvee', () => {
    const tally = computeResolutionTally('ARTICLE_24', LOTS, votes({ A4: 'FOR', A1: 'AGAINST', A2: 'AGAINST' }));
    expect(tally.votesFor).toBeLessThan(tally.votesAgainst);
    expect(tally.sharesFor).toBe(400);
    expect(tally.sharesAgainst).toBe(300);
    expect(tally.result).toBe('APPROVED');
  });

  it('exclut les abstentions : seules des abstentions -> rejetee', () => {
    const tally = computeResolutionTally('ARTICLE_24', LOTS, votes({ A1: 'ABSTAIN', A4: 'ABSTAIN' }));
    expect(tally.referenceShares).toBe(0);
    expect(tally.result).toBe('REJECTED');
  });

  it('reste en attente (null) tant qu aucun vote n est saisi', () => {
    expect(computeResolutionTally('ARTICLE_24', LOTS, []).result).toBeNull();
  });

  it('traite un texte libre historique comme l article 24', () => {
    const tally = computeResolutionTally('Article 24', LOTS, votes({ A4: 'FOR', A3: 'AGAINST' }));
    expect(tally.rule).toBe('ARTICLE_24');
    expect(tally.result).toBe('APPROVED');
  });
});

describe('Article 25 - majorite absolue des tantiemes de tous les lots', () => {
  it('rejette a exactement 50 % meme sans voix contre', () => {
    const tally = computeResolutionTally('ARTICLE_25', LOTS, votes({ A2: 'FOR', A3: 'FOR' }));
    expect(tally.sharesFor).toBe(500);
    expect(tally.referenceShares).toBe(1000);
    expect(tally.result).toBe('REJECTED');
    // La meme saisie serait approuvee a l'article 24 (500 pour, 0 contre).
    expect(computeResolutionTally('ARTICLE_24', LOTS, votes({ A2: 'FOR', A3: 'FOR' })).result).toBe('APPROVED');
  });

  it('approuve au-dela de 50 % des tantiemes totaux', () => {
    const tally = computeResolutionTally('ARTICLE_25', LOTS, votes({ A1: 'FOR', A2: 'FOR', A4: 'FOR', A3: 'AGAINST' }));
    expect(tally.sharesFor).toBe(700);
    expect(tally.result).toBe('APPROVED');
  });
});

describe('Article 26 - double majorite', () => {
  it('rejette si les 2/3 des tantiemes sont atteints mais pas la moitie des coproprietaires', () => {
    const tally = computeResolutionTally('ARTICLE_26', LOTS, votes({ A3: 'FOR', A4: 'FOR', A1: 'AGAINST', A2: 'AGAINST' }));
    expect(tally.sharesFor).toBe(700);
    expect(tally.ownersFor).toBe(2);
    expect(tally.totalOwners).toBe(4);
    expect(tally.result).toBe('REJECTED');
  });

  it('rejette si la majorite des coproprietaires est atteinte mais pas les 2/3 des tantiemes', () => {
    const tally = computeResolutionTally('ARTICLE_26', LOTS, votes({ A1: 'FOR', A2: 'FOR', A3: 'FOR', A4: 'AGAINST' }));
    expect(tally.ownersFor).toBe(3);
    expect(tally.sharesFor).toBe(600);
    expect(tally.result).toBe('REJECTED');
  });

  it('approuve quand les deux conditions sont reunies', () => {
    const tally = computeResolutionTally('ARTICLE_26', LOTS, votes({ A1: 'FOR', A3: 'FOR', A4: 'FOR', A2: 'AGAINST' }));
    expect(tally.ownersFor).toBe(3);
    expect(tally.sharesFor).toBe(800);
    expect(tally.result).toBe('APPROVED');
  });

  it('compte les coproprietaires distincts, pas les lots', () => {
    // c1 possede A1 et A2 : 3 coproprietaires pour 4 lots.
    const lots = LOTS.map(lot => (lot.id === 'A2' ? { ...lot, coownerId: 'c1', ownerContactId: 'c1' } : lot));
    const tally = computeResolutionTally('ARTICLE_26', lots, votes({ A3: 'FOR', A4: 'FOR', A1: 'AGAINST', A2: 'AGAINST' }));
    expect(tally.totalOwners).toBe(3);
    expect(tally.ownersFor).toBe(2);
    expect(tally.result).toBe('APPROVED');
  });
});

describe('Unanimite', () => {
  it('approuve seulement si tous les lots votent pour', () => {
    const all = votes({ A1: 'FOR', A2: 'FOR', A3: 'FOR', A4: 'FOR' });
    expect(computeResolutionTally('UNANIMITE', LOTS, all).result).toBe('APPROVED');
  });

  it('rejette avec une abstention ou un lot qui n a pas vote', () => {
    expect(
      computeResolutionTally('UNANIMITE', LOTS, votes({ A1: 'ABSTAIN', A2: 'FOR', A3: 'FOR', A4: 'FOR' })).result
    ).toBe('REJECTED');
    expect(computeResolutionTally('UNANIMITE', LOTS, votes({ A2: 'FOR', A3: 'FOR', A4: 'FOR' })).result).toBe(
      'REJECTED'
    );
  });
});

describe('computeMeetingAttendance', () => {
  it('compte une fois chaque lot ayant vote sur au moins une resolution', () => {
    const attendance = computeMeetingAttendance(LOTS, [
      { lotId: 'A1' },
      { lotId: 'A2' },
      { lotId: 'A2' },
      { lotId: 'A3' },
      { lotId: 'lot-d-une-autre-copropriete' }
    ]);
    expect(attendance).toEqual({
      representedLots: 3,
      representedShares: 600,
      totalLots: 4,
      totalShares: 1000,
      quorumPercent: 60
    });
  });
});
