import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { EMAIL_NOTIFICATION_DEFAULT_TEMPLATES } from '../../src/constants/email-notification-default-templates';
import { EMAIL_NOTIFICATION_META } from '../../src/constants/email-notification-keys';
import { runWithLanguage } from '../../src/i18n';
import { botMessages } from '../../src/lib/stock-whatsapp/bot-messages';
import { buildStockVisionPrompt } from '../../src/lib/stock-whatsapp/vision/prompt';

/**
 * Vocabulaire du contrôle du stock (lot 040, spec §4 et §11).
 *
 * Un écart, une alerte ou un rebut constatent un fait : aucun texte destiné à
 * un utilisateur ne prête une intention à quelqu'un. Ce test parcourt les
 * LITTÉRAUX DE CHAÎNE des fichiers du stock côté serveur (lib, schémas,
 * contrôleurs, routes, gardes, tâche, bons PDF), le gabarit de l'e-mail
 * d'alerte et les catalogues de traduction, et refuse chaque mot interdit, à
 * frontière de mot, en trois langues.
 *
 * Lot 041 : le module de l'inventaire par WhatsApp (`lib/stock-whatsapp/`,
 * tous ses sous-dossiers, y compris la consigne envoyée à l'IA de vision), sa
 * tâche et son webhook suivent la même règle ; les messages du bot sont en
 * outre rendus en trois langues.
 *
 * Les commentaires ne sont pas lus : ils expliquent la règle, et doivent
 * pouvoir citer les mots qu'elle écarte.
 */

const SRC = path.resolve(__dirname, '..', '..', 'src');

const FORBIDDEN: Array<{ label: string; pattern: RegExp }> = [
  { label: 'vol', pattern: /(^|[^\p{L}\p{N}_])vols?(?![\p{L}\p{N}_])/iu },
  { label: 'voleur', pattern: /(^|[^\p{L}\p{N}_])voleu(r|rs|se|ses)(?![\p{L}\p{N}_])/iu },
  { label: 'fraude', pattern: /(^|[^\p{L}\p{N}_])fraud/iu },
  { label: 'détournement', pattern: /(^|[^\p{L}\p{N}_])d[ée]tourn/iu },
  { label: 'theft', pattern: /(^|[^\p{L}\p{N}_])theft(?![\p{L}\p{N}_])/iu },
  { label: 'stolen', pattern: /(^|[^\p{L}\p{N}_])stolen(?![\p{L}\p{N}_])/iu },
  { label: 'steal', pattern: /(^|[^\p{L}\p{N}_])steal/iu },
  { label: 'embezzle', pattern: /(^|[^\p{L}\p{N}_])embezzl/iu },
  { label: 'سرق', pattern: /سرق/u },
  { label: 'احتيال', pattern: /احتيال/u },
  { label: 'اختلاس', pattern: /اختلاس/u }
];

function forbiddenIn(text: string): string[] {
  return FORBIDDEN.filter(({ pattern }) => pattern.test(text)).map(({ label }) => label);
}

/** Les fichiers du stock côté serveur, relatifs à `src/`. */
function stockSourceFiles(): string[] {
  const files: string[] = [];
  const add = (dir: string, keep: (name: string) => boolean) => {
    for (const name of fs.readdirSync(path.join(SRC, dir))) {
      if (name.endsWith('.ts') && keep(name)) files.push(path.join(dir, name));
    }
  };
  add('lib/finance', name => /^stock-/.test(name) || /^schemas-stock-/.test(name) || name === 'types-040-controle.ts');
  add('controllers', name => /^finance-stock-/.test(name));
  add('routes', name => /^finance-stock-/.test(name));
  add('middleware', name => name === 'stock-rbac-middleware.ts');
  add('jobs', name => /^stock-/.test(name));
  // Lot 041 : le module WhatsApp entier (moteur, transport, vision, inscriptions…).
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(path.join(SRC, dir), { withFileTypes: true })) {
      const relative = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(relative);
      else if (entry.name.endsWith('.ts')) files.push(relative);
    }
  };
  walk('lib/stock-whatsapp');
  add('routes', name => name === 'whatsapp-cloud-webhook-routes.ts');
  return files;
}

/** Littéraux de chaîne et morceaux de gabarits d'un fichier TypeScript. */
function stringLiterals(file: string): string[] {
  const source = fs.readFileSync(path.join(SRC, file), 'utf8');
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const out: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      out.push(node.text);
    } else if (ts.isTemplateExpression(node)) {
      out.push(node.head.text, ...node.templateSpans.map(span => span.literal.text));
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sf, visit);
  return out;
}

describe('vocabulaire du contrôle du stock (spec §4)', () => {
  it('le motif à frontière de mot ne confond pas un mot voisin', () => {
    expect(forbiddenIn('Volume livré, envol, volet, survol')).toEqual([]);
    expect(forbiddenIn('Un vol constaté')).toEqual(['vol']);
    expect(forbiddenIn('Vols répétés')).toEqual(['vol']);
    expect(forbiddenIn('recorded theft')).toEqual(['theft']);
    expect(forbiddenIn('سرقة')).toEqual(['سرق']);
  });

  it('couvre bien les fichiers du stock', () => {
    const files = stockSourceFiles();
    expect(files.length).toBeGreaterThan(30);
    expect(files.map(file => file.replace(/\\/g, '/'))).toEqual(
      expect.arrayContaining([
        'lib/finance/stock-bons-pdf.ts',
        'lib/finance/stock-alertes-lecture.ts',
        'lib/stock-whatsapp/bot-messages.ts',
        'lib/stock-whatsapp/vision/prompt.ts',
        'lib/stock-whatsapp/engine/index.ts',
        'jobs/stock-whatsapp-job.ts',
        'controllers/finance-stock-whatsapp-controller.ts',
        'routes/finance-stock-whatsapp-routes.ts',
        'routes/whatsapp-cloud-webhook-routes.ts'
      ])
    );
  });

  it('aucun mot interdit dans les littéraux des fichiers du stock', () => {
    const offenders: string[] = [];
    for (const file of stockSourceFiles()) {
      for (const text of stringLiterals(file)) {
        const words = forbiddenIn(text);
        if (words.length > 0) offenders.push(`${file} : ${words.join(', ')} — « ${text.slice(0, 120)} »`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("aucun mot interdit dans la consigne envoyée à l'IA de vision (lot 041)", () => {
    const candidates = [
      { id: 'a1', reference: 'CIM-42', label: 'Ciment CPJ 42,5', unit: 'sac', category: 'Liants' },
      { id: 'a2', reference: 'FER-12', label: 'Fer à béton HA 12', unit: 'barre', category: null }
    ];
    for (const imposedItemId of [null, 'a1']) {
      expect(forbiddenIn(buildStockVisionPrompt({ candidates, imposedItemId }))).toEqual([]);
    }
  });

  for (const language of ['fr', 'en', 'ar'] as const) {
    it(`aucun mot interdit dans les messages du bot rendus en ${language} (lot 041)`, () => {
      const texts = runWithLanguage(language, () => {
        const messages = [
          botMessages.unknownNumber(),
          botMessages.activated({ name: 'Koffi', agency: 'Agence' }),
          botMessages.wrongCode(3),
          botMessages.codeLocked(),
          botMessages.activationPending(),
          botMessages.accessLost(),
          botMessages.optionMissing(),
          botMessages.quotaReached(),
          botMessages.noSite(),
          botMessages.siteChosen('Chantier'),
          botMessages.photoReceived(),
          botMessages.analysisInProgress(),
          botMessages.questionPending(),
          botMessages.recorded({ quantity: 84, unit: 'sac', item: 'Ciment' }),
          botMessages.recordedCorrected({ quantity: 80, unit: 'sac', item: 'Ciment' }),
          botMessages.cancelled(),
          botMessages.notUnderstood({ total: 84, unit: 'sac' }),
          botMessages.tooDark(),
          botMessages.notStock(),
          botMessages.fileRefused(),
          botMessages.itemUnknown(),
          botMessages.noItem('fer'),
          botMessages.analysisFailed(),
          botMessages.reminder(),
          botMessages.expired({ pendingDropped: true, closed: { site: 'Chantier', count: 2 } }),
          botMessages.closedCounted({ site: 'Chantier', count: 2 }),
          botMessages.closedLeftOpen({ site: 'Chantier', count: 2 }),
          botMessages.closedNothing(),
          botMessages.help(),
          botMessages.unsupported(),
          botMessages.countAwaitingValidation(),
          botMessages.countChangedAtOffice(),
          botMessages.siteUnavailable('Chantier'),
          botMessages.sendPhoto()
        ];
        return messages.map(message => message.text);
      });
      expect(texts.length).toBeGreaterThan(30);
      expect(texts.flatMap(text => forbiddenIn(text))).toEqual([]);
    });
  }

  it("aucun mot interdit dans l'e-mail d'alerte du stock", () => {
    const template = EMAIL_NOTIFICATION_DEFAULT_TEMPLATES.STOCK_ALERT_AGENCY;
    const meta = EMAIL_NOTIFICATION_META.STOCK_ALERT_AGENCY as unknown as Record<string, unknown>;
    const texts = [template.subject, template.bodyHtml, ...Object.values(meta).filter(v => typeof v === 'string')];
    expect(texts.flatMap(text => forbiddenIn(String(text)))).toEqual([]);
  });

  for (const language of ['en', 'ar'] as const) {
    it(`aucun mot interdit dans le catalogue ${language} du serveur`, () => {
      const catalog = JSON.parse(
        fs.readFileSync(path.join(SRC, 'i18n', 'locales', `${language}.json`), 'utf8')
      ) as Record<string, string>;
      const offenders = Object.entries(catalog)
        .flatMap(([key, value]) => [key, value])
        .filter(text => forbiddenIn(text).length > 0);
      expect(offenders).toEqual([]);
    });
  }
});
