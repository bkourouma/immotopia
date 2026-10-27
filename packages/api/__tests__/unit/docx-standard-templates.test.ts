/**
 * Modeles DOCX standard : structure du package, rendu complet avec un contexte
 * factice (aucune balise `{{X}}` ne subsiste), reprise de TOUTES les balises
 * des quatre modeles locatifs d'origine, fichiers livres a jour.
 */
import * as fs from 'fs';
import * as path from 'path';
import PizZip from 'pizzip';

jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));

import {
  STANDARD_TEMPLATES,
  buildStandardTemplate,
  loadStandardTemplate,
  standardTemplateForDocType,
  type StandardTemplateKey
} from '../../src/lib/documents/docx-standard-templates';
import { renderDocxBuffer } from '../../src/services/docx-renderer';

beforeAll(() => {
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterAll(() => jest.restoreAllMocks());

const MODELS_DIR = path.resolve(__dirname, '../../../../assets/modeles_documents');
const STANDARD_DIR = path.resolve(__dirname, '../../../../assets/modeles_standard');

const PARTS = ['word/document.xml', 'word/header1.xml', 'word/footer1.xml'];

const xmlText = (xml: string): string => xml.replace(/<[^>]+>/g, '');

/** Texte brut des parties qui portent des balises. */
function templateText(buffer: Buffer): string {
  const zip = new PizZip(buffer);
  return PARTS.map(part => xmlText(zip.file(part)!.asText())).join('\n');
}

/** Balises simples (hors sections `#`, `^`, `/`) et noms de sections d'un texte. */
function tagsOf(text: string): { tags: Set<string>; sections: Set<string> } {
  const tags = new Set<string>();
  const sections = new Set<string>();
  for (const match of text.matchAll(/\{\{\s*([#^/]?)\s*([A-Z0-9_]+)\s*\}\}/g)) {
    (match[1] ? sections : tags).add(match[2]);
  }
  return { tags, sections };
}

/** Contexte factice : chaque balise vaut `v-NOM`, chaque section est une liste de deux elements. */
function fakeContext(tags: Set<string>, sections: Set<string>): Record<string, unknown> {
  const flat: Record<string, string> = {};
  for (const tag of tags) flat[tag] = `v-${tag}`;
  const context: Record<string, unknown> = { ...flat };
  for (const section of sections) context[section] = [flat, flat];
  return context;
}

describe('modeles DOCX standard : structure', () => {
  it.each(STANDARD_TEMPLATES.map(info => [info.key]))('%s : package complet et coherent', key => {
    const zip = new PizZip(buildStandardTemplate(key as StandardTemplateKey));
    for (const part of [
      '[Content_Types].xml',
      '_rels/.rels',
      'word/document.xml',
      'word/_rels/document.xml.rels',
      'word/styles.xml',
      'word/settings.xml',
      'word/header1.xml',
      'word/footer1.xml',
      'docProps/core.xml'
    ]) {
      expect(zip.file(part)).not.toBeNull();
    }

    const document = zip.file('word/document.xml')!.asText();
    const rels = zip.file('word/_rels/document.xml.rels')!.asText();
    for (const id of [...document.matchAll(/r:id="([^"]+)"/g)].map(match => match[1])) {
      expect(rels).toContain(`Id="${id}"`);
    }
    const contentTypes = zip.file('[Content_Types].xml')!.asText();
    expect(contentTypes).toContain('/word/header1.xml');
    expect(contentTypes).toContain('/word/footer1.xml');

    // Bandeau d'en-tete et pied de page de la charte.
    const header = zip.file('word/header1.xml')!.asText();
    for (const tag of ['LOGO_EMETTEUR', 'LOGO_COPROPRIETE', 'EMETTEUR_NOM', 'EMETTEUR_ADRESSE', 'EMETTEUR_CONTACT']) {
      expect(header).toContain(`{{${tag}}}`);
    }
    const footer = zip.file('word/footer1.xml')!.asText();
    expect(footer).toContain('{{EMETTEUR_PIED_DE_PAGE}}');
    expect(footer).toContain('PAGE');
    expect(footer).toContain('NUMPAGES');

    // Word exige un paragraphe après un tableau final, avant sectPr (et en fin de cellule).
    expect(document).not.toMatch(/<\/w:tbl>\s*<w:sectPr/);
    expect(document).not.toMatch(/<\/w:tbl>\s*<\/w:tc>/);
  });

  it('la construction est deterministe', () => {
    expect(buildStandardTemplate('avis_appel_charges').equals(buildStandardTemplate('avis_appel_charges'))).toBe(true);
  });

  it('les fichiers livres dans assets/modeles_standard sont a jour', () => {
    for (const info of STANDARD_TEMPLATES) {
      const shipped = fs.readFileSync(path.join(STANDARD_DIR, info.fileName));
      expect(shipped.equals(buildStandardTemplate(info.key))).toBe(true);
    }
  });

  it('loadStandardTemplate lit le fichier livre', async () => {
    const loaded = await loadStandardTemplate('bail_habitation');
    expect(loaded.equals(fs.readFileSync(path.join(STANDARD_DIR, 'bail_habitation.docx')))).toBe(true);
  });

  it('associe chaque type locatif a son modele', () => {
    expect(standardTemplateForDocType('LEASE_HABITATION')?.key).toBe('bail_habitation');
    expect(standardTemplateForDocType('RENT_STATEMENT')?.key).toBe('releve_locatif');
    expect(standardTemplateForDocType('INCONNU')).toBeUndefined();
  });
});

describe('modeles DOCX standard : rendu', () => {
  it.each(STANDARD_TEMPLATES.map(info => [info.key]))('%s : aucune balise non resolue', key => {
    const template = buildStandardTemplate(key as StandardTemplateKey);
    const { tags, sections } = tagsOf(templateText(template));
    const context = fakeContext(tags, sections);

    for (const sanitize of [true, false]) {
      const rendered = renderDocxBuffer(template, context, { sanitize });
      const text = templateText(rendered);
      expect(text).not.toContain('{{');
      expect(text).not.toContain('}}');
      expect(text).not.toContain('@@');
      expect(text).toContain('v-EMETTEUR_NOM');
    }
  });

  it('une section vide affiche son texte de remplacement (inverse) et pas la boucle', () => {
    const template = buildStandardTemplate('compte_rendu_assemblee_generale');
    const text = templateText(
      renderDocxBuffer(template, { AGENDA_ITEMS: [], RESOLUTIONS: [], PROXIES: [] }, { sanitize: false })
    );
    expect(text).toContain('Aucun point d’ordre du jour renseigné.');
    expect(text).toContain('Aucune résolution enregistrée.');
    expect(text).toContain('Aucun pouvoir enregistré.');
  });

  it("les lignes d'un tableau sont repetees pour chaque element", () => {
    const template = buildStandardTemplate('avis_appel_charges');
    const rendered = renderDocxBuffer(
      template,
      {
        LIGNES: [
          { LIGNE_LIBELLE: 'Eau', LIGNE_BASE: '100/1000', LIGNE_MONTANT: '10 000' },
          { LIGNE_LIBELLE: 'Ascenseur', LIGNE_BASE: '100/1000', LIGNE_MONTANT: '5 000' },
          { LIGNE_LIBELLE: 'Gardiennage', LIGNE_BASE: '100/1000', LIGNE_MONTANT: '7 500' }
        ]
      },
      { sanitize: false }
    );
    const xml = new PizZip(rendered).file('word/document.xml')!.asText();
    const text = xmlText(xml);
    for (const label of ['Eau', 'Ascenseur', 'Gardiennage']) expect(text).toContain(label);
    // En-tete + 3 lignes de detail + en-tete et 3 lignes du recapitulatif + refs + colonnes.
    expect(xml.match(/Gardiennage/g)).toHaveLength(1);
  });

  it("la balise vide d'identite reste vide (jamais le nom de la variable)", () => {
    const rendered = renderDocxBuffer(buildStandardTemplate('recu_loyer'), {
      EMETTEUR_NOM: 'Agence',
      EMETTEUR_RCCM: ''
    });
    const footer = xmlText(new PizZip(rendered).file('word/footer1.xml')!.asText());
    expect(footer).not.toContain('EMETTEUR_RCCM');
  });
});

describe('modeles locatifs standard : balises des modeles d’origine', () => {
  const pairs: Array<[string, StandardTemplateKey]> = [
    ['contrat_bail_habitation.docx', 'bail_habitation'],
    ['contrat_bail_commercial.docx', 'bail_commercial'],
    ['Reçu_Loyer.docx', 'recu_loyer'],
    ['Releve_Compte.docx', 'releve_locatif']
  ];

  it.each(pairs)('%s : toutes ses balises figurent dans le modele standard', (original, key) => {
    const originalText = xmlText(
      new PizZip(fs.readFileSync(path.join(MODELS_DIR, original))).file('word/document.xml')!.asText()
    );
    const originalTags = tagsOf(originalText).tags;
    const standardTags = tagsOf(templateText(buildStandardTemplate(key))).tags;

    expect(originalTags.size).toBeGreaterThan(5);
    const missing = [...originalTags].filter(tag => !standardTags.has(tag));
    expect(missing).toEqual([]);
  });
});

describe('compte rendu standard : balises du generateur', () => {
  it('couvre les balises que le generateur fournit', () => {
    const { tags, sections } = tagsOf(templateText(buildStandardTemplate('compte_rendu_assemblee_generale')));
    for (const tag of [
      'SYNDICATE_NAME',
      'SYNDICATE_ADDRESS',
      'MEETING_TYPE',
      'MEETING_DATE',
      'MEETING_START_TIME',
      'MEETING_END_TIME',
      'MEETING_LOCATION',
      'MEETING_QUORUM',
      'ATTENDANCE_SUMMARY',
      'ATTENDANCE_LOT',
      'ATTENDANCE_PERSON',
      'AGENDA_INDEX',
      'AGENDA_TITLE',
      'AGENDA_DISCUSSION',
      'RESOLUTION_TITLE',
      'RESOLUTION_RESULT',
      'PROXY_GRANTOR',
      'PROXY_REPRESENTATIVE',
      'FINAL_SUMMARY'
    ]) {
      expect(tags.has(tag)).toBe(true);
    }
    expect([...sections].sort()).toEqual(['AGENDA_ITEMS', 'ATTENDANCE', 'PROXIES', 'RESOLUTIONS']);
  });
});
