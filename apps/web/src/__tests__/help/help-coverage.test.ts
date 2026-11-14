import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const SCRIPT = path.resolve(__dirname, '../../../scripts/help-coverage.mjs');

let root: string;

function write(relative: string, content: string) {
  const file = path.join(root, 'src', 'help', 'content', relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, 'utf8');
}

const entry = (id: string) => `{ id: '${id}', kind: 'page', title: 'T', summary: 'S' }`;
const zone = (...ids: string[]) =>
  `import type { HelpEntry } from '../../../types';\nconst entries: HelpEntry[] = [${ids.map(entry).join(', ')}];\nexport default entries;\n`;
const concat = (lang: string, ...zones: string[]) =>
  `${zones.map(z => `import ${z} from './${lang}/${z}';`).join('\n')}\nexport default [${zones.map(z => `...${z}`).join(', ')}];\n`;

/** Faux paquet : module `demo`, deux zones (`a`, `b`) dans chaque langue. */
function buildPackage(arB: string[] = ['demo.b.one', 'demo.b.two']) {
  write('index.ts', "export const HELP_MODULES = ['demo'] as const;\n");
  write('demo/routes.ts', "export const routes = [{ pattern: '/demo', helpId: 'demo.a.one' }];\n");
  for (const lang of ['fr', 'en', 'ar']) {
    write(`demo/${lang}.ts`, concat(lang, 'a', 'b'));
    write(`demo/${lang}/a.ts`, zone('demo.a.one'));
    write(`demo/${lang}/b.ts`, zone(...(lang === 'ar' ? arB : ['demo.b.one', 'demo.b.two'])));
  }
}

function run() {
  const result = spawnSync(process.execPath, [SCRIPT, `--root=${root}`], { encoding: 'utf8' });
  return { code: result.status, out: `${result.stdout}${result.stderr}` };
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'help-coverage-'));
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('help-coverage : contenu decoupe par zone', () => {
  it('suit les zones et passe quand les trois langues concordent', () => {
    buildPackage();
    const { code, out } = run();
    expect(out).toContain('3 fiches fr');
    expect(code).toBe(0);
  });

  it('signale un id manquant en arabe dans une zone', () => {
    buildPackage(['demo.b.one']);
    const { code, out } = run();
    expect(code).toBe(1);
    expect(out).toMatch(/demo : 1 id absents de ar\.ts : demo\.b\.two/);
  });

  it("refuse un import de valeur autre qu'une zone de la meme langue", () => {
    buildPackage();
    write('demo/fr/a.ts', `import { x } from 'lodash';\n${zone('demo.a.one')}`);
    const { code, out } = run();
    expect(code).toBe(1);
    expect(out).toMatch(/fr\/a\.ts:1 : import « lodash » interdit/);
  });

  it("refuse une zone qui importe la zone d'une autre langue", () => {
    buildPackage();
    write('demo/fr/a.ts', `import other from '../en/a';\n${zone('demo.a.one')}`);
    const { code, out } = run();
    expect(code).toBe(1);
    expect(out).toContain('import « ../en/a » interdit');
  });

  it('avertit pour une zone non importee', () => {
    buildPackage();
    write('demo/fr/orphan.ts', zone('demo.orphan.one'));
    const { code, out } = run();
    expect(code).toBe(0);
    expect(out).toContain('fr/orphan.ts : fichier de zone non importe par fr.ts');
  });
});
