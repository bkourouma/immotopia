/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Contre-audit de la PR #205 : les rognages et repérages de balises appliqués
 * à du texte saisi restent linéaires. Les anciennes formes (`/^x+|x+$/g`,
 * `/x+$/`, `/<[^>]*>/g`, `/<\/?[A-Za-z!][^>]*>/`) repartaient de chaque
 * caractère d'une longue suite jusqu'au bout du texte : quadratiques.
 *
 * Pour chaque correctif : même résultat que l'ancienne expression sur un jeu
 * de chaînes variées (fixes et pseudo-aléatoires), puis 100 000 caractères
 * piégés traités en moins de 20 ms.
 */
const sendMailMock = jest.fn(async (..._args: any[]) => ({ messageId: 'mock-message-id' }));
jest.mock('nodemailer', () => ({
  createTransport: () => ({ sendMail: (...args: any[]) => sendMailMock(...args), verify: jest.fn() })
}));
jest.mock('../../src/utils/database', () => ({ prisma: {} }));
jest.mock('../../src/utils/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }
}));
jest.mock('../../src/services/audit-service', () => ({ logAuditEvent: jest.fn(), recordAuditEvent: jest.fn() }));
jest.mock('../../src/services/property-service', () => ({ listProperties: jest.fn() }));
jest.mock('../../src/services/rental-lease-service', () => ({ listLeases: jest.fn() }));
jest.mock('../../src/services/rental-document-service', () => ({ listDocuments: jest.fn() }));
jest.mock('../../src/services/property-document-service', () => ({ getDocuments: jest.fn() }));
jest.mock('../../src/utils/property-tenant-guard', () => ({ getPropertyForTenant: jest.fn() }));
jest.mock('../../src/services/document-template-service', () => ({ resolveTemplate: jest.fn() }));
jest.mock('../../src/services/document-generation-service', () => ({ generateDocument: jest.fn() }));
jest.mock('../../src/services/email-service', () => ({ emailService: { sendEmail: jest.fn() } }));
jest.mock('../../src/services/email-notification-config-service', () => ({ getEmailNotificationConfig: jest.fn() }));

import { charSet, trimCharsLinear, trimEndCharsLinear } from '../../src/utils/trim-chars';
import { sendWithTemplate } from '../../src/services/providers/email.provider';
import { containsHtmlTag } from '../../src/lib/ai/tools/plan-write';
import { fileSlug } from '../../src/lib/syndics/word-documents';
import { archiveFileName } from '../../src/services/tenant-data-export/export-service';
import { normalizeBodyForClickableLinks } from '../../src/services/whatsapp-notification-send-service';
import { generateSlugFromName } from '../../src/services/tenant-service';

const N = 100_000;
const MAX_MS = 20;

/** Meilleur de trois essais, après un échauffement : la machine de test est partagée. */
function bestMs(fn: () => unknown): number {
  fn();
  let best = Infinity;
  for (let i = 0; i < 3; i++) {
    const start = process.hrtime.bigint();
    fn();
    best = Math.min(best, Number(process.hrtime.bigint() - start) / 1e6);
  }
  return best;
}

/** Générateur pseudo-aléatoire déterministe (mulberry32). */
function randomStrings(alphabet: string, count: number, maxLength: number, seed = 42): string[] {
  let state = seed;
  const next = () => {
    state = (state + 0x6d2b79f5) | 0;
    let x = Math.imul(state ^ (state >>> 15), 1 | state);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
  return Array.from({ length: count }, () => {
    const length = Math.floor(next() * maxLength);
    let out = '';
    for (let i = 0; i < length; i++) out += alphabet[Math.floor(next() * alphabet.length)];
    return out;
  });
}

describe('utils/trim-chars', () => {
  const isDash = charSet('-.');
  const cases = [
    '',
    '-',
    '--',
    '-.-',
    'a',
    '-a-',
    '..a.b..',
    'a-b',
    '---abc---',
    '.-.a-.-b.-.',
    ...randomStrings('-.ab', 300, 12)
  ];

  it('trimCharsLinear = /^[-.]+|[-.]+$/g', () => {
    for (const value of cases) expect(trimCharsLinear(value, isDash)).toBe(value.replace(/^[-.]+|[-.]+$/g, ''));
  });

  it('trimEndCharsLinear = /[-.]+$/', () => {
    for (const value of cases) expect(trimEndCharsLinear(value, isDash)).toBe(value.replace(/[-.]+$/, ''));
  });

  it('100 000 tirets internes en moins de 20 ms', () => {
    const trap = '-'.repeat(N) + 'a' + '-'.repeat(10);
    expect(bestMs(() => trimCharsLinear(trap, isDash))).toBeLessThan(MAX_MS);
    expect(bestMs(() => trimEndCharsLinear(trap, isDash))).toBeLessThan(MAX_MS);
  });
});

describe('lib/syndics/word-documents fileSlug', () => {
  const oldFileSlug = (value: string | null | undefined): string =>
    (value ?? '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Za-z0-9._-]+/g, '-')
      .replace(/^[-.]+|[-.]+$/g, '')
      .slice(0, 60);

  it('même résultat que l’ancienne expression', () => {
    const fixed = [
      null,
      undefined,
      '',
      'Résidence Les Palmiers',
      '  -.Lot 12.- ',
      '...',
      'A/B\\C',
      'Bât. B — 3ᵉ',
      'x'.repeat(80)
    ];
    for (const value of [...fixed, ...randomStrings('-. aéZ9/_', 400, 20)]) {
      expect(fileSlug(value)).toBe(oldFileSlug(value));
    }
  });

  it('100 000 caractères `-.` internes en moins de 20 ms', () => {
    const trap = '-.'.repeat(N / 2) + 'a';
    expect(bestMs(() => fileSlug(trap))).toBeLessThan(MAX_MS);
    expect(fileSlug(trap)).toBe('a');
  });
});

describe('tenant-data-export archiveFileName', () => {
  const date = new Date('2026-11-10T08:00:00Z');
  const oldName = (slug: string): string => {
    const safeSlug =
      slug
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'agence';
    return `immotopia-export-${safeSlug}-${date.toISOString().slice(0, 10)}.zip`;
  };

  it('même résultat que l’ancienne expression', () => {
    const fixed = ['', '-', 'agence-abidjan', '--Agence  Cocody--', 'É', '___'];
    for (const slug of [...fixed, ...randomStrings('-a _Z9é', 400, 16)]) {
      expect(archiveFileName(slug, date)).toBe(oldName(slug));
    }
  });

  it('100 000 tirets internes en moins de 20 ms', () => {
    const trap = '-'.repeat(N) + 'a';
    expect(bestMs(() => archiveFileName(trap, date))).toBeLessThan(MAX_MS);
    expect(archiveFileName(trap, date)).toBe('immotopia-export-a-2026-11-10.zip');
  });
});

describe('whatsapp normalizeBodyForClickableLinks', () => {
  const oldNormalize = (body: string): string => {
    if (!body) return body;
    let output = body;
    output = output.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/gi, '$1: $2');
    output = output.replace(/`(https?:\/\/[^`\s]+)`/gi, '$1');
    output = output.replace(/<(https?:\/\/[^>\s]+)>/gi, '$1');
    return output.replace(/https?:\/\/\S+/gi, match => match.replace(/[`,.;!?]+$/g, ''));
  };

  it('même résultat que l’ancienne expression', () => {
    const fixed = [
      '',
      'Voir https://immotopia.example/p/1.',
      'Lien : [ici](https://x.example/a?b=1), merci !',
      '`https://x.example/doc`;',
      '<https://x.example/y>!?',
      'https://a.example/,,,b,,,'
    ];
    const random = randomStrings('ab,.;!?` ', 300, 20).map(tail => `https://x.example/${tail}`);
    for (const body of [...fixed, ...random]) expect(normalizeBodyForClickableLinks(body)).toBe(oldNormalize(body));
  });

  it('URL de 100 000 caractères de ponctuation interne en moins de 20 ms', () => {
    const trap = 'https://x.example/' + ','.repeat(N) + 'a';
    expect(bestMs(() => normalizeBodyForClickableLinks(trap))).toBeLessThan(MAX_MS);
  });
});

describe('ai plan_write containsHtmlTag', () => {
  const OLD_HTML_TAG = /<\/?[A-Za-z!][^>]*>/;

  it('même verdict que l’ancienne expression', () => {
    const fixed = [
      '',
      'texte',
      '<b>gras</b>',
      '<img src=x onerror=alert(1)>',
      'a < b > c',
      'a <1> b',
      '</>',
      '<!-- x -->',
      '<a <>',
      '<a',
      '>a<'
    ];
    for (const value of [...fixed, ...randomStrings('<>/a!1 ', 800, 10)]) {
      expect(containsHtmlTag(value)).toBe(OLD_HTML_TAG.test(value));
    }
  });

  it('100 000 caractères `<a` sans `>` en moins de 20 ms', () => {
    const trap = '<a'.repeat(N / 2);
    expect(bestMs(() => containsHtmlTag(trap))).toBeLessThan(MAX_MS);
    expect(containsHtmlTag(trap)).toBe(false);
  });
});

describe('tenant-service generateSlugFromName (laissé tel quel)', () => {
  it('reste linéaire : les suites de séparateurs sont déjà fondues en un seul tiret', () => {
    const trap = '-'.repeat(N) + 'a' + ' -'.repeat(N / 4);
    expect(bestMs(() => generateSlugFromName(trap))).toBeLessThan(MAX_MS);
    expect(generateSlugFromName(trap)).toBe('a');
    expect(generateSlugFromName('  Agence Cocody — Abidjan  ')).toBe('agence-cocody-abidjan');
  });
});

describe('providers/email.provider sendWithTemplate', () => {
  beforeEach(() => sendMailMock.mockClear());

  it('dérive le texte brut en retirant les balises', async () => {
    await sendWithTemplate({ to: 'a@b.com', subject: 'S', html: '<p>Bonjour <b>Awa</b></p>' });
    expect((sendMailMock.mock.calls[0]![0] as any).text).toBe(' Bonjour  Awa  ');
  });

  it('100 000 `<` sans `>` : texte dérivé en moins de 20 ms', async () => {
    const html = '<'.repeat(N) + '<p>fin</p>';
    await sendWithTemplate({ to: 'a@b.com', subject: 'S', html }); // échauffement
    sendMailMock.mockClear();
    const start = process.hrtime.bigint();
    await sendWithTemplate({ to: 'a@b.com', subject: 'S', html });
    expect(Number(process.hrtime.bigint() - start) / 1e6).toBeLessThan(MAX_MS);
    expect((sendMailMock.mock.calls[0]![0] as any).text).toBe('<'.repeat(N) + ' fin ');
  });
});
