import ExcelJS from 'exceljs';

/**
 * Classeur `recapitulatif.xlsx` de l'export complet (lot S7) : un onglet
 * LISEZ-MOI en francais, puis une ligne par modele exporte. Le contenu de
 * l'archive est destine a l'agence cliente, francophone ; ces textes sont
 * ceux d'un document remis, pas de l'interface.
 */

export interface SummaryModelLine {
  model: string;
  csvFile: string;
  rowCount: number;
  attachment: string;
}

export interface SummaryInput {
  tenantName: string;
  generatedAt: Date;
  schemaVersion: string | null;
  models: SummaryModelLine[];
  fileCount: number;
  missingFileCount: number;
}

const README_LINES = [
  'Export complet des données de votre agence — ImmoTopia',
  '',
  'Contenu de l’archive :',
  '• data/<Modèle>.csv : un fichier par type de données (séparateur « ; », encodage UTF-8).',
  '• fichiers/ : les documents et photos rattachés à vos données (baux, justificatifs, photos…).',
  '• manifest.json : date de l’export, version du schéma, nombre de lignes par type, fichiers manquants.',
  '• recapitulatif.xlsx : ce classeur.',
  '',
  'Formats :',
  '• Les dates sont au format international ISO 8601 (ex. 2026-09-29T16:00:00.000Z, heure UTC).',
  '• Les montants sont écrits en texte exact, avec un point décimal.',
  '• Les données structurées (listes, détails) sont écrites en JSON.',
  '• Un texte commençant par =, +, - ou @ est précédé d’une apostrophe pour qu’un tableur ne l’exécute pas.',
  '',
  'Données non incluses :',
  '• Mots de passe, jetons de connexion, clés et identifiants de paiement : jamais exportés.',
  '• Catalogues communs à la plateforme (offres, référentiels géographiques, rôles).',
  '',
  'Les identifiants (colonnes id, …Id) permettent de relier les fichiers entre eux.'
];

export async function buildSummaryWorkbook(input: SummaryInput): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'ImmoTopia';
  workbook.created = input.generatedAt;

  const readme = workbook.addWorksheet('LISEZ-MOI');
  readme.getColumn(1).width = 110;
  readme.addRow([README_LINES[0]]).font = { bold: true, size: 14 };
  readme.addRow([`Agence : ${input.tenantName}`]);
  readme.addRow([`Date de l’export : ${input.generatedAt.toISOString()}`]);
  readme.addRow([`Version du schéma : ${input.schemaVersion ?? 'inconnue'}`]);
  readme.addRow([`Fichiers joints : ${input.fileCount} (manquants : ${input.missingFileCount})`]);
  for (const line of README_LINES.slice(1)) readme.addRow([line]);

  const sheet = workbook.addWorksheet('Récapitulatif');
  sheet.columns = [
    { header: 'Type de données', key: 'model', width: 36 },
    { header: 'Fichier CSV', key: 'csvFile', width: 44 },
    { header: 'Lignes', key: 'rowCount', width: 12 },
    { header: 'Rattachement à l’agence', key: 'attachment', width: 48 }
  ];
  sheet.getRow(1).font = { bold: true };
  for (const line of input.models) sheet.addRow(line);
  sheet.addRow({ model: 'Total', rowCount: input.models.reduce((sum, m) => sum + m.rowCount, 0) }).font = {
    bold: true
  };

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer as ArrayBuffer);
}
