import { allowedNextStatuses, canTransition, type ClaimStatus } from '../../src/lib/patrimoine/insurance/claim-status';

const ALL: ClaimStatus[] = ['DECLARED', 'INSURER_NOTIFIED', 'EXPERTISE', 'SETTLED', 'REJECTED', 'CLOSED'];

const VALID: Array<[ClaimStatus, ClaimStatus]> = [
  ['DECLARED', 'INSURER_NOTIFIED'],
  ['INSURER_NOTIFIED', 'EXPERTISE'],
  ['INSURER_NOTIFIED', 'SETTLED'],
  ['INSURER_NOTIFIED', 'REJECTED'],
  ['EXPERTISE', 'SETTLED'],
  ['EXPERTISE', 'REJECTED'],
  ['SETTLED', 'CLOSED'],
  ['REJECTED', 'CLOSED']
];

describe('canTransition : matrice complète', () => {
  for (const from of ALL) {
    for (const to of ALL) {
      const expected = VALID.some(([f, t]) => f === from && t === to);
      it(`${from} -> ${to} : ${expected ? 'autorisée' : 'refusée'}`, () => {
        expect(canTransition(from, to)).toBe(expected);
      });
    }
  }
});

describe('allowedNextStatuses', () => {
  it('liste les cibles de chaque statut, CLOSED est terminal', () => {
    expect(allowedNextStatuses('DECLARED')).toEqual(['INSURER_NOTIFIED']);
    expect(allowedNextStatuses('INSURER_NOTIFIED')).toEqual(['EXPERTISE', 'SETTLED', 'REJECTED']);
    expect(allowedNextStatuses('CLOSED')).toEqual([]);
  });

  it('renvoie une copie : la table ne se modifie pas par effet de bord', () => {
    allowedNextStatuses('DECLARED').push('CLOSED');
    expect(allowedNextStatuses('DECLARED')).toEqual(['INSURER_NOTIFIED']);
  });
});
