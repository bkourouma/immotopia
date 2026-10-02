/**
 * Messages d'erreur du module patrimoine : accents obligatoires (BUG-2026-10-01-008)
 * et message du relevé brouillon (BUG-2026-10-01-006).
 *
 * Deux garde-fous :
 *  1. un test statique lit le SOURCE des fichiers du module (commentaires
 *     exclus) et refuse tout message visible (argument littéral de
 *     `badRequest(`, `conflict(`, `notFound(`, `new …Error(`, `t(` ou
 *     `message:` d'un schéma zod) qui contient un mot français sans ses accents ;
 *  2. des tests de comportement vérifient les trois messages de
 *     `assertExpenseRecurrence` tels que le client les reçoit.
 *
 * La traduction en/ar se fait à la frontière (`errorHandler`) et dépend des
 * catalogues : elle n'est pas testée ici.
 */

import fs from 'fs';
import path from 'path';

const propertyFindFirst = jest.fn();
const expenseFindFirst = jest.fn();
const expenseCreate = jest.fn();

jest.mock('../../src/utils/database', () => {
  const prisma: any = {
    property: { findFirst: (...a: any[]) => propertyFindFirst(...a) },
    propertyExpense: {
      findFirst: (...a: any[]) => expenseFindFirst(...a),
      create: (...a: any[]) => expenseCreate(...a)
    }
  };
  prisma.$transaction = async (callback: (tx: any) => unknown) => callback(prisma);
  return { prisma };
});
jest.mock('../../src/lib/treasury/accounts', () => ({ assertTreasuryAccountUsableTx: jest.fn() }));
jest.mock('../../src/lib/finance/rental-direct-ledger', () => ({ syncDirectExpenseEntryTx: jest.fn() }));

import { createPropertyExpense } from '../../src/lib/patrimoine/queries';

const SRC = path.resolve(__dirname, '../../src');

/**
 * Fichiers du module dont les messages sont visibles. `tax/*`, `cash-plan*`,
 * `entities/*`, `export/*`, `yield.ts` et `lib/secure-links` ont leurs propres
 * lots de correction.
 */
const GUARDED_FILES = [
  'lib/patrimoine/queries.ts',
  'lib/patrimoine/schemas.ts',
  'lib/patrimoine/notifications.ts',
  'lib/patrimoine/notification-channels.ts',
  'lib/patrimoine/owner-monthly-report.ts',
  'lib/patrimoine/owner-portal-view.ts',
  'lib/patrimoine/owner-statement-computation.ts',
  'lib/patrimoine/valuation-order.ts',
  'lib/patrimoine/yield-assumptions.ts',
  'controllers/owner-statements-controller.ts',
  'controllers/owner-statement-secure-links-controller.ts'
];

/** Mots français écrits sans accent (la forme accentuée est la seule correcte). */
const FORBIDDEN_WORDS = [
  'depense',
  'depenses',
  'periodique',
  'periodiques',
  'periodicite',
  'periode',
  'periodes',
  'deja',
  'etre',
  'ete',
  'preceder',
  'precedent',
  'numero',
  'releve',
  'releves',
  'pret',
  'prets',
  'proprietaire',
  'proprietaires',
  'posterieur',
  'posterieure',
  'derive',
  'derivee',
  'cout',
  'couts',
  'genere',
  'generez',
  'regle',
  'reglee',
  'recalcule',
  'recalculee',
  'envoye',
  'envoyee',
  'eventuel',
  'ecart',
  'regularise',
  'meme',
  'apres',
  'echec',
  'creation',
  'verifiez',
  'donnees',
  'reel',
  'rattache',
  'debut',
  'defaut',
  'methode',
  'declare'
];
const FORBIDDEN = new RegExp(
  `(?<![\\p{L}])(?:${FORBIDDEN_WORDS.join('|')}|mise a jour|a jour|a la date)(?![\\p{L}])`,
  'iu'
);

/** Remplace les commentaires par des espaces, en respectant les chaînes. */
function stripComments(source: string): string {
  let out = '';
  let i = 0;
  while (i < source.length) {
    const c = source[i];
    const next = source[i + 1];
    if (c === '/' && next === '/') {
      while (i < source.length && source[i] !== '\n') i++;
    } else if (c === '/' && next === '*') {
      const end = source.indexOf('*/', i + 2);
      i = end === -1 ? source.length : end + 2;
    } else if (c === "'" || c === '"' || c === '`') {
      let j = i + 1;
      while (j < source.length && source[j] !== c) j += source[j] === '\\' ? 2 : 1;
      out += source.slice(i, j + 1);
      i = j + 1;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

const LITERAL = `(?:'(?:[^'\\\\]|\\\\.)*'|"(?:[^"\\\\]|\\\\.)*"|\`(?:[^\`\\\\]|\\\\.)*\`)`;
const MESSAGE_SITE = new RegExp(
  `(?:\\b(?:badRequest|conflict|notFound|forbidden|unauthorized|unprocessableEntity|t|(?:new\\s+)?[A-Z]\\w*Error)\\(\\s*|\\bmessage:\\s*)(${LITERAL})`,
  'g'
);

/** Messages littéraux visibles (hors commentaires) qui contiennent un mot sans accent. */
function findUnaccentedMessages(source: string): string[] {
  const code = stripComments(source);
  const hits: string[] = [];
  for (const match of code.matchAll(MESSAGE_SITE)) {
    const literal = match[1].slice(1, -1);
    if (FORBIDDEN.test(literal)) hits.push(literal);
  }
  return hits;
}

describe('détecteur de messages sans accent (autotest)', () => {
  it('repère les trois anciens messages de dépense périodique et ceux de schemas.ts', () => {
    const before = `
      throw badRequest("La date de la depense periodique doit etre celle d'un paiement deja effectue");
      throw badRequest("La date de fin n'a de sens que pour une depense periodique");
      throw badRequest('La date de fin de la periodicite ne peut pas preceder la date de la depense');
      refine(v => v, { message: 'Au moins un champ est requis pour la mise a jour du releve' });
      throw conflict(
        'Ce releve est deja regle : il ne peut plus etre recalcule.'
      );
    `;
    expect(findUnaccentedMessages(before)).toHaveLength(5);
  });

  it('ignore les commentaires et les messages accentués', () => {
    const after = `
      // depense periodique : commentaire tolere
      /* releve deja envoye */
      throw badRequest("La date de la dépense périodique doit être celle d'un paiement déjà effectué");
      logger.warn('sendOwnerMonthlyReport: releve introuvable'); // journal technique, pas un message
    `;
    expect(findUnaccentedMessages(after)).toEqual([]);
  });
});

describe('messages du module patrimoine : accents', () => {
  it.each(GUARDED_FILES)('%s : aucun message visible sans accent', file => {
    const source = fs.readFileSync(path.join(SRC, file), 'utf8');
    expect(findUnaccentedMessages(source)).toEqual([]);
  });
});

describe('assertExpenseRecurrence : messages renvoyés au client', () => {
  const TENANT = 'tenant-1';
  const PROPERTY = 'prop-1';
  const DAY = 24 * 3600 * 1000;
  const baseInput = {
    category: 'INSURANCE' as const,
    label: 'Assurance',
    amount: 30_000,
    currency: 'XOF',
    paidAt: new Date('2026-09-01T00:00:00Z'),
    isCapitalized: false
  };

  beforeEach(() => {
    jest.clearAllMocks();
    propertyFindFirst.mockResolvedValue({ id: PROPERTY, tenantId: TENANT });
    expenseCreate.mockImplementation(async ({ data }: any) => ({ id: 'exp-1', ...data }));
  });

  it('date future sur une dépense périodique : 400 avec accents', async () => {
    await expect(
      createPropertyExpense(TENANT, PROPERTY, {
        ...baseInput,
        paidAt: new Date(Date.now() + 5 * DAY),
        recurrence: 'ANNUAL'
      })
    ).rejects.toMatchObject({
      status: 400,
      message: "La date de la dépense périodique doit être celle d'un paiement déjà effectué"
    });
  });

  it('date de fin sur une dépense ponctuelle : 400 avec accents', async () => {
    await expect(
      createPropertyExpense(TENANT, PROPERTY, {
        ...baseInput,
        recurrence: 'ONE_OFF',
        recurrenceEndDate: new Date('2027-01-31T00:00:00Z')
      })
    ).rejects.toMatchObject({
      status: 400,
      message: "La date de fin n'a de sens que pour une dépense périodique"
    });
  });

  it('date de fin antérieure à la dépense : 400 avec accents', async () => {
    await expect(
      createPropertyExpense(TENANT, PROPERTY, {
        ...baseInput,
        recurrence: 'MONTHLY',
        recurrenceEndDate: new Date('2026-08-31T00:00:00Z')
      })
    ).rejects.toMatchObject({
      status: 400,
      message: 'La date de fin de la périodicité ne peut pas précéder la date de la dépense'
    });
    expect(expenseCreate).not.toHaveBeenCalled();
  });
});
