import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, render, screen } from '@testing-library/react';
import { changeLanguage } from '../../i18n';
import { StateBlock } from '../../components/primitives/StateBlock';
import { StatusTag, statusLabel } from '../../components/primitives/StatusTag';
import { SITE_STATUS_LABELS } from '../../types/finance-lot2-types';
import { SECTION_LABELS } from '../../navigation/model';

/**
 * Les tables de libellés doivent suivre la langue affichée.
 *
 * Le défaut que cette suite empêche : une table écrite comme constante de
 * module (`const LABELS = { OPEN: t('Ouvert') }`) exécute ses `t()` **une seule
 * fois, à l'import**. La langue active à cet instant est alors gravée pour
 * toute la session, et le remontage par `key={language}` (App.tsx) n'y peut
 * rien — il réexécute les composants, pas les constantes déjà évaluées.
 * L'interface passée en anglais gardait ainsi « Aucune donnée » sur tous ses
 * états vides alors que « No data » existait bien au catalogue.
 *
 * La parade retenue est uniforme : la table est une **fonction** appelée au
 * rendu (`LABELS()`), comme `defauts()` dans `StateBlock`.
 *
 * Toute la suite frontend tourne en français (`setupTests.ts` le pose avant
 * tout import) : ces tests basculent donc explicitement, et reposent le
 * français ensuite pour ne rien laisser derrière eux.
 */

afterEach(async () => {
  cleanup();
  await changeLanguage('fr');
});

// Vitest s'exécute depuis `apps/web` (racine déclarée par vite.config.ts) ;
// `import.meta.url` n'y est pas une URL `file:` exploitable.
const RACINE = join(process.cwd(), 'src');

function fichiersSource(dossier: string): string[] {
  const trouves: string[] = [];
  for (const entree of readdirSync(dossier, { withFileTypes: true })) {
    const chemin = join(dossier, entree.name);
    if (entree.isDirectory()) trouves.push(...fichiersSource(chemin));
    else if (/\.tsx?$/.test(entree.name)) trouves.push(chemin);
  }
  return trouves;
}

/** Catalogue anglais complet, tous modules confondus. */
function catalogueAnglais(): Record<string, string> {
  const dossier = join(RACINE, 'i18n', 'locales', 'en');
  const fusion: Record<string, string> = {};
  for (const fichier of readdirSync(dossier)) {
    Object.assign(fusion, JSON.parse(readFileSync(join(dossier, fichier), 'utf8')));
  }
  return fusion;
}

describe('une table de libellés suit le changement de langue', () => {
  it('depuis un fichier de types (SITE_STATUS_LABELS)', async () => {
    expect(SITE_STATUS_LABELS().PLANNED).toBe('Prévu');

    await changeLanguage('en');

    expect(SITE_STATUS_LABELS().PLANNED).toBe('Planned');
  });

  it('y compris les entrées qui étaient restées des chaînes nues', async () => {
    // `SUSPENDED` n'avait pas de `t()` : la moitié de la table se traduisait,
    // l'autre non, et « Suspendu » restait français en anglais comme en arabe.
    expect(SITE_STATUS_LABELS().SUSPENDED).toBe('Suspendu');

    await changeLanguage('en');

    expect(SITE_STATUS_LABELS().SUSPENDED).toBe('Suspended');
  });

  it('depuis le modèle de navigation (SECTION_LABELS)', async () => {
    const enFrancais = SECTION_LABELS().parc;

    await changeLanguage('en');

    expect(SECTION_LABELS().parc).not.toBe(enFrancais);
  });

  it("à l'écran, sur l'état vide de <StateBlock>", async () => {
    // `<Empty>` d'Ant Design pose son propre texte par défaut, en anglais, en
    // plus de celui qu'on lui passe : hors `<ConfigProvider>`, « No data »
    // apparaît donc deux fois dans le document une fois la bascule faite. On
    // lit la description du bloc, pas la page entière.
    const description = (racine: HTMLElement) => racine.querySelector('.ant-empty-description')?.textContent ?? '';

    const enFrancais = render(<StateBlock variant="empty" />);
    expect(description(enFrancais.container)).toContain('Aucune donnée');
    expect(description(enFrancais.container)).toContain('Rien à afficher pour le moment.');
    cleanup();

    await changeLanguage('en');

    const enAnglais = render(<StateBlock variant="empty" />);
    expect(description(enAnglais.container)).toContain('No data');
    expect(description(enAnglais.container)).toContain('Nothing to show for now.');
  });

  it("à l'écran, sur <StatusTag> — la plus grosse table du dépôt", async () => {
    render(<StatusTag status="AVAILABLE" />);
    expect(screen.getByText('Disponible')).toBeInTheDocument();
    cleanup();

    await changeLanguage('en');

    render(<StatusTag status="AVAILABLE" />);
    expect(screen.getByText('Available')).toBeInTheDocument();
    expect(statusLabel('AVAILABLE')).toBe('Available');
  });
});

/**
 * Les quatre tests ci-dessus couvrent quatre tables. Le dépôt en compte plus de
 * cent vingt, et rien n'empêche la cent vingt-sixième d'être écrite comme
 * constante. Ce test-ci ferme la classe entière plutôt qu'un cas.
 */
describe('aucune table de libellés ne redevient une constante de module', () => {
  /**
   * `t()` y est appelé dans une méthode `async`, donc au moment de l'appel et
   * non à l'import. Ces deux objets sont des services, pas des tables de
   * libellés : la détection ci-dessous, volontairement simple, ne sait pas
   * faire la différence.
   */
  const TOLERES = new Set(['emailNotificationConfigService', 'whatsappNotificationConfigService']);

  it('toute déclaration de module contenant un t() est une fonction', () => {
    const fautives: string[] = [];

    for (const fichier of fichiersSource(RACINE)) {
      const lignes = readFileSync(fichier, 'utf8').split(/\r?\n/);

      for (let i = 0; i < lignes.length; i++) {
        // Colonne 0 : une déclaration au niveau du module. Un initialiseur
        // objet, tableau ou `t(...)` direct — pas une fonction, dont le corps
        // serait de toute façon différé.
        const declaration = /^(?:export\s+)?const\s+([A-Za-z0-9_$]+)\s*(?::\s*[^=]*?)?\s*=\s*(?:\{|\[|t\()/.exec(
          lignes[i]
        );
        if (!declaration || TOLERES.has(declaration[1])) continue;

        let profondeur = 0;
        let commence = false;
        let corps = '';
        for (let j = i; j < lignes.length && j - i < 600; j++) {
          corps += lignes[j] + '\n';
          for (const caractere of lignes[j]) {
            if ('{[('.includes(caractere)) {
              profondeur++;
              commence = true;
            } else if ('}])'.includes(caractere)) profondeur--;
          }
          if (commence && profondeur <= 0) break;
        }

        if (/(^|[^A-Za-z0-9_$.'"])t\(/.test(corps)) {
          fautives.push(`${fichier.slice(RACINE.length)}:${i + 1}  ${declaration[1]}`);
        }
      }
    }

    // Le rapport est comparé à la chaîne vide plutôt que le tableau à `[]` :
    // l'échec affiche alors la consigne et la liste des fautives, pas seulement
    // un diff de tableau.
    const rapport = fautives.length
      ? 'Ces constantes de module appellent t() à l’import : leurs libellés seront figés ' +
        'dans la langue du chargement. En faire des fonctions appelées au rendu, sur le ' +
        'modèle de defauts() dans StateBlock.tsx.\n' +
        fautives.join('\n')
      : '';

    expect(rapport).toBe('');
  });
});

/**
 * Second défaut, de cause différente : une table bien convertie en fonction
 * peut contenir des libellés qu'aucun `t()` n'enveloppe. Ils ne se traduisent
 * alors jamais, quel que soit le motif retenu — c'est ce qui laissait
 * « Suspendu » en français à côté d'un « Planned » traduit.
 *
 * Le critère est volontairement étroit, donc sûr : on ne signale une chaîne nue
 * que si le catalogue anglais connaît DÉJÀ ce texte français. Aucun chemin,
 * aucune classe CSS, aucun code d'énumération ne peut s'y glisser — la seule
 * façon d'être signalé est d'être un libellé pour lequel une traduction existe.
 */
describe('aucun libellé traduisible ne reste une chaîne nue', () => {
  it('toute valeur connue du catalogue anglais passe par t()', () => {
    const catalogue = catalogueAnglais();
    const fautives: string[] = [];

    for (const fichier of fichiersSource(RACINE)) {
      if (fichier.includes(join('i18n', 'locales'))) continue;
      const lignes = readFileSync(fichier, 'utf8').split(/\r?\n/);

      for (let i = 0; i < lignes.length; i++) {
        // Une table de libellés prouvée : une fonction de module qui appelle
        // déjà `t()` quelque part dans son corps.
        if (!/^(?:export\s+)?function\s+[A-Za-z0-9_$]+\(\)/.test(lignes[i])) continue;

        let profondeur = 0;
        let commence = false;
        let fin = i;
        for (let j = i; j < lignes.length && j - i < 700; j++) {
          for (const caractere of lignes[j]) {
            if ('{[('.includes(caractere)) {
              profondeur++;
              commence = true;
            } else if ('}])'.includes(caractere)) profondeur--;
          }
          fin = j;
          if (commence && profondeur <= 0) break;
        }
        if (!/(^|[^A-Za-z0-9_$.'"])t\(/.test(lignes.slice(i, fin + 1).join('\n'))) continue;

        for (let j = i + 1; j <= fin; j++) {
          const paire = /^\s*(?:[A-Za-z0-9_$]+|'[^']+'|"[^"]+"|\[[^\]]+\]):\s*'([^']*)'\s*,?\s*$/.exec(lignes[j]);
          if (paire && catalogue[paire[1]]) {
            fautives.push(`${fichier.slice(RACINE.length)}:${j + 1}  « ${paire[1]} » → « ${catalogue[paire[1]]} »`);
          }
        }
      }
    }

    const rapport = fautives.length
      ? 'Ces libellés ont une traduction au catalogue mais ne passent pas par t() : ' +
        'ils resteront en français dans toutes les langues. Les envelopper.\n' +
        fautives.join('\n')
      : '';

    expect(rapport).toBe('');
  });
});
