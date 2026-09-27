#!/usr/bin/env node
/**
 * Miroir texte du classeur Excel de référence des fonctionnalités
 * (docs/fonctionnalites/ImmoTopia_Wiki_Fonctionnalites.xlsx).
 *
 * Un .xlsx est illisible dans un diff et pour un agent : ce script régénère
 * un miroir Markdown déterministe (aucune date, LF, ordre du classeur) et
 * vérifie qu'il est bien synchronisé avec le classeur.
 *
 *   node scripts/wiki-fonctionnalites.cjs export
 *   node scripts/wiki-fonctionnalites.cjs check
 *   node scripts/wiki-fonctionnalites.cjs search <terme> [autres termes...]
 *
 * N'utilise jamais process.env.
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const ExcelJS = require("exceljs");
const JSZip = require("jszip");

const ROOT = path.resolve(__dirname, "..");
const XLSX_PATH = path.join(
  ROOT,
  "docs",
  "fonctionnalites",
  "ImmoTopia_Wiki_Fonctionnalites.xlsx",
);
const MIRROR_PATH = path.join(
  ROOT,
  "docs",
  "fonctionnalites",
  "sous-fonctionnalites.md",
);
const MIRROR_RELATIVE = "docs/fonctionnalites/sous-fonctionnalites.md";

const SHEET_SOUS_FONCTIONNALITES = "Sous-fonctionnalites";
const SHEET_LEGENDE = "Legende Packs-Modules";
const SHEET_NOTES = "Notes et points ouverts";

const TABLE_SOUS_FONCTIONNALITES = "SousFonctionnalites";
const TABLE_CATALOGUE_PACKS = "CataloguePacks";
const TABLE_FONCTIONNALITES = "TableFonctionnalites";
const TABLE_NOTES = "NotesPointsOuverts";

// En-têtes attendus de la feuille "Sous-fonctionnalites", dans l'ordre exact
// des colonnes A à O. Toute divergence (renommage, colonne ajoutée/retirée
// ou réordonnée) fait échouer `export` et `check`.
const EXPECTED_HEADERS = [
  "Domaine (regroupement agent)",
  "Pack(s)",
  "Module",
  "Fonctionnalite",
  "Sous-fonctionnalite",
  "Objectif",
  "Donnees attendues (entree)",
  "Donnees en sortie",
  "Depend de (sous-fonctionnalites prerequises)",
  "Roles/profils ayant acces",
  "Portail",
  "Route API (methode + chemin)",
  "Permission technique",
  "Statut",
  "Menu / sous-menu affiche",
];

// Index des colonnes dans le tableau `values` d'une ligne (0-based, aligné
// sur EXPECTED_HEADERS).
const IDX_DOMAINE = 0;
const IDX_MODULE = 2;
const IDX_SOUS_FONCTIONNALITE = 4;
const IDX_STATUT = 13;

class WikiError extends Error {}

// --- Lecture du classeur ---------------------------------------------------

/**
 * exceljs 4.4.0 attend des cibles de relation relatives ("../tables/tableN.xml")
 * pour retrouver une table nommée dans une feuille (voir
 * exceljs/lib/xlsx/xform/sheet/worksheet-xform.js, ligne ~520, et
 * exceljs/lib/doc/worksheet.js, "set model"). openpyxl, qui a servi à créer
 * et modifier ce classeur, écrit des cibles absolues ("/xl/tables/tableN.xml")
 * dans les .rels des feuilles — valides selon la norme OOXML, mais que
 * exceljs ne sait pas retrouver : la lecture plante avant même d'atteindre
 * les données. On corrige ces cibles uniquement sur la copie en mémoire
 * utilisée pour la lecture ; le fichier .xlsx sur disque n'est jamais touché.
 */
async function patchAbsoluteTableTargets(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const relFilePattern = /^xl\/worksheets\/_rels\/.*\.rels$/;
  const absoluteTargetPattern = /Target="\/xl\/tables\/(table\d+\.xml)"/g;

  const relFiles = Object.keys(zip.files).filter((name) =>
    relFilePattern.test(name),
  );
  for (const name of relFiles) {
    // eslint-disable-next-line no-await-in-loop
    const xml = await zip.file(name).async("string");
    const patched = xml.replace(
      absoluteTargetPattern,
      'Target="../tables/$1"',
    );
    if (patched !== xml) {
      zip.file(name, patched);
    }
  }
  return zip.generateAsync({ type: "nodebuffer" });
}

async function loadWorkbook() {
  if (!fs.existsSync(XLSX_PATH)) {
    throw new WikiError(`Classeur introuvable : ${XLSX_PATH}`);
  }
  const rawBuffer = fs.readFileSync(XLSX_PATH);
  const patchedBuffer = await patchAbsoluteTableTargets(rawBuffer);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(patchedBuffer);
  return workbook;
}

function getSheet(workbook, name) {
  const sheet = workbook.getWorksheet(name);
  if (!sheet) {
    throw new WikiError(`Feuille absente du classeur : "${name}".`);
  }
  return sheet;
}

function columnLetterToNumber(letters) {
  let n = 0;
  for (const ch of letters) {
    n = n * 26 + (ch.charCodeAt(0) - 64);
  }
  return n;
}

/** Retrouve la plage (lignes/colonnes) d'un tableau Excel nommé. */
function getTableRange(sheet, tableName) {
  const table = sheet.tables && sheet.tables[tableName];
  const ref = table && table.table && table.table.tableRef;
  if (!ref) {
    throw new WikiError(
      `Table "${tableName}" introuvable dans la feuille "${sheet.name}".`,
    );
  }
  const match = ref.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
  if (!match) {
    throw new WikiError(
      `Plage inattendue pour la table "${tableName}" : ${ref}`,
    );
  }
  const [, colA, rowA, colB, rowB] = match;
  return {
    startCol: columnLetterToNumber(colA),
    endCol: columnLetterToNumber(colB),
    startRow: Number(rowA),
    endRow: Number(rowB),
  };
}

/** Texte d'une cellule : texte riche compris, nombres tels quels. */
function cellText(value) {
  if (value === null || value === undefined) {
    return "";
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "object") {
    if (Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text).join("");
    }
    if (value.text !== undefined) {
      return cellText(value.text);
    }
    if (value.result !== undefined) {
      return cellText(value.result);
    }
    return String(value);
  }
  return String(value);
}

/** Nettoyage d'une cellule pour le miroir Markdown. */
function cleanCell(value) {
  let text = cellText(value);
  text = text.replace(/\r\n?/g, "\n").trim();
  text = text.split("\n").join("<br>");
  text = text.replace(/\|/g, "\\|");
  return text;
}

/** Lit toutes les lignes (en-tête comprise) d'une plage, cellules nettoyées. */
function readTableRows(sheet, range) {
  const rows = [];
  for (let r = range.startRow; r <= range.endRow; r += 1) {
    const row = sheet.getRow(r);
    const values = [];
    for (let c = range.startCol; c <= range.endCol; c += 1) {
      values.push(cleanCell(row.getCell(c).value));
    }
    rows.push(values);
  }
  return rows;
}

function assertHeaders(headers) {
  const ok =
    headers.length === EXPECTED_HEADERS.length &&
    headers.every((h, i) => h === EXPECTED_HEADERS[i]);
  if (!ok) {
    throw new WikiError(
      [
        `Les en-têtes de la feuille "${SHEET_SOUS_FONCTIONNALITES}" ne correspondent pas à ce qui est attendu.`,
        `Attendu : ${EXPECTED_HEADERS.join(" | ")}`,
        `Trouvé  : ${headers.join(" | ")}`,
      ].join("\n"),
    );
  }
}

/**
 * Lit et valide le classeur entier. Lève une WikiError décrivant précisément
 * le problème (en-têtes, ligne Excel en cause) si la structure est invalide.
 */
async function buildData() {
  const workbook = await loadWorkbook();

  const sfSheet = getSheet(workbook, SHEET_SOUS_FONCTIONNALITES);
  const sfRange = getTableRange(sfSheet, TABLE_SOUS_FONCTIONNALITES);
  const sfRows = readTableRows(sfSheet, sfRange);
  assertHeaders(sfRows[0]);

  const dataRows = [];
  const errors = [];
  for (let i = 1; i < sfRows.length; i += 1) {
    const excelRow = sfRange.startRow + i;
    const values = sfRows[i];
    if (
      !values[IDX_MODULE] ||
      !values[IDX_SOUS_FONCTIONNALITE] ||
      !values[IDX_STATUT]
    ) {
      errors.push(
        `Ligne Excel ${excelRow} : "Module", "Sous-fonctionnalite" ou "Statut" est vide.`,
      );
      continue;
    }
    dataRows.push({ excelRow, values });
  }
  if (errors.length > 0) {
    throw new WikiError(errors.join("\n"));
  }

  const legendeSheet = getSheet(workbook, SHEET_LEGENDE);
  const catalogueRange = getTableRange(legendeSheet, TABLE_CATALOGUE_PACKS);
  const catalogueTitle = cleanCell(
    legendeSheet.getRow(catalogueRange.startRow - 1).getCell(1).value,
  );
  const catalogueRows = readTableRows(legendeSheet, catalogueRange);

  const fnRange = getTableRange(legendeSheet, TABLE_FONCTIONNALITES);
  const fnTitle = cleanCell(
    legendeSheet.getRow(fnRange.startRow - 1).getCell(1).value,
  );
  const fnRows = readTableRows(legendeSheet, fnRange);

  const notesSheet = getSheet(workbook, SHEET_NOTES);
  const notesRange = getTableRange(notesSheet, TABLE_NOTES);
  const notesRows = readTableRows(notesSheet, notesRange);

  return {
    dataRows,
    catalogueTitle,
    catalogueRows,
    fnTitle,
    fnRows,
    notesRows,
    notesHeaderRow: notesRange.startRow,
  };
}

// --- Rendu du miroir Markdown ------------------------------------------------

function renderRawTable(rows) {
  const [header, ...body] = rows;
  const out = [];
  out.push(`| ${header.join(" | ")} |`);
  out.push(`| ${header.map(() => "---").join(" | ")} |`);
  for (const row of body) {
    out.push(`| ${row.join(" | ")} |`);
  }
  return out.join("\n");
}

function groupByDomaine(dataRows) {
  const order = [];
  const grouped = new Map();
  for (const row of dataRows) {
    const key = row.values[IDX_DOMAINE] || "(Sans domaine)";
    if (!grouped.has(key)) {
      grouped.set(key, []);
      order.push(key);
    }
    grouped.get(key).push(row);
  }
  return { order, grouped };
}

function renderMirror(data) {
  const { dataRows, catalogueTitle, catalogueRows, fnTitle, fnRows, notesRows } =
    data;
  const { order, grouped } = groupByDomaine(dataRows);
  const lines = [];

  lines.push("# Wiki des fonctionnalités — miroir texte");
  lines.push("");
  lines.push(
    "Fichier généré par `npm run wiki:export` depuis `ImmoTopia_Wiki_Fonctionnalites.xlsx`. " +
      "Ne pas modifier à la main : modifier le classeur puis régénérer ce miroir. " +
      "Mode d'emploi dans `README.md` du même dossier.",
  );
  lines.push("");

  lines.push("| Domaine | Sous-fonctionnalités |");
  lines.push("| --- | --- |");
  for (const domaine of order) {
    lines.push(`| ${domaine} | ${grouped.get(domaine).length} |`);
  }
  lines.push(`| **Total** | **${dataRows.length}** |`);
  lines.push("");

  lines.push("## Sous-fonctionnalités");
  lines.push("");
  const tableHeaders = EXPECTED_HEADERS.slice(1);
  for (const domaine of order) {
    lines.push(`### ${domaine}`);
    lines.push("");
    lines.push(`| ${tableHeaders.join(" | ")} |`);
    lines.push(`| ${tableHeaders.map(() => "---").join(" | ")} |`);
    for (const row of grouped.get(domaine)) {
      lines.push(`| ${row.values.slice(1).join(" | ")} |`);
    }
    lines.push("");
  }

  lines.push("## Légende packs et modules");
  lines.push("");
  lines.push(catalogueTitle);
  lines.push("");
  lines.push(renderRawTable(catalogueRows));
  lines.push("");
  lines.push(fnTitle);
  lines.push("");
  lines.push(renderRawTable(fnRows));
  lines.push("");

  lines.push("## Notes et points ouverts");
  lines.push("");
  lines.push(renderRawTable(notesRows));

  return `${lines.join("\n").replace(/\n+$/, "")}\n`;
}

function normalizeLineEndings(text) {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

// --- Recherche ---------------------------------------------------------------

function normalizeForSearch(text) {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

function rowMatchesTerms(values, normalizedTerms) {
  const haystack = normalizeForSearch(values.join(" "));
  return normalizedTerms.every((term) => haystack.includes(term));
}

function printSousFonctionnaliteResult(row) {
  const v = row.values;
  console.log(
    `${v[0]} › ${v[2]} › ${v[3]} › ${v[4]} (ligne Excel ${row.excelRow})`,
  );
  for (let i = 0; i < EXPECTED_HEADERS.length; i += 1) {
    if (i === IDX_DOMAINE || i === IDX_MODULE || i === 3 || i === IDX_SOUS_FONCTIONNALITE) {
      continue;
    }
    const value = v[i];
    if (value) {
      console.log(`  ${EXPECTED_HEADERS[i]} : ${value}`);
    }
  }
  console.log("");
}

function printNoteResult(excelRow, values) {
  const [domaine, sujet, constat, aFaire] = values;
  console.log(`${domaine} › ${sujet} (ligne Excel ${excelRow})`);
  if (constat) {
    console.log(`  Constat : ${constat}`);
  }
  if (aFaire) {
    console.log(`  A faire / a confirmer : ${aFaire}`);
  }
  console.log("");
}

async function cmdSearch(terms) {
  if (!terms || terms.length === 0) {
    printHelp();
    process.exitCode = 1;
    return;
  }
  const data = await buildData();
  const normalizedTerms = terms.map(normalizeForSearch);

  let count = 0;
  for (const row of data.dataRows) {
    if (rowMatchesTerms(row.values, normalizedTerms)) {
      count += 1;
      printSousFonctionnaliteResult(row);
    }
  }

  const [, ...notesBody] = data.notesRows;
  const notesMatches = [];
  notesBody.forEach((values, i) => {
    if (rowMatchesTerms(values, normalizedTerms)) {
      notesMatches.push({
        values,
        excelRow: data.notesHeaderRow + 1 + i,
      });
    }
  });
  if (notesMatches.length > 0) {
    console.log("Notes et points ouverts");
    console.log("");
    for (const match of notesMatches) {
      printNoteResult(match.excelRow, match.values);
      count += 1;
    }
  }

  console.log(`${count} résultat(s).`);
}

// --- Commandes principales ----------------------------------------------------

async function cmdExport() {
  const data = await buildData();
  const content = renderMirror(data);
  fs.writeFileSync(MIRROR_PATH, content, "utf8");
  console.log(
    `Miroir généré : ${MIRROR_RELATIVE} (${data.dataRows.length} sous-fonctionnalités).`,
  );
}

async function cmdCheck() {
  const data = await buildData();
  const expected = normalizeLineEndings(renderMirror(data));

  if (!fs.existsSync(MIRROR_PATH)) {
    console.error(
      `Le miroir ${MIRROR_RELATIVE} n'est pas à jour : lancer \`npm run wiki:export\` après avoir modifié le classeur.`,
    );
    process.exitCode = 1;
    return;
  }

  const actual = normalizeLineEndings(fs.readFileSync(MIRROR_PATH, "utf8"));
  if (actual !== expected) {
    console.error(
      `Le miroir ${MIRROR_RELATIVE} n'est pas à jour : lancer \`npm run wiki:export\` après avoir modifié le classeur.`,
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    `Miroir à jour : ${data.dataRows.length} sous-fonctionnalités.`,
  );
}

function printHelp() {
  console.log(
    [
      "Usage :",
      "  node scripts/wiki-fonctionnalites.cjs export",
      "  node scripts/wiki-fonctionnalites.cjs check",
      "  node scripts/wiki-fonctionnalites.cjs search <terme> [autres termes...]",
    ].join("\n"),
  );
}

async function main() {
  const [, , command, ...rest] = process.argv;
  try {
    switch (command) {
      case "export":
        await cmdExport();
        break;
      case "check":
        await cmdCheck();
        break;
      case "search":
        await cmdSearch(rest);
        break;
      default:
        printHelp();
        process.exitCode = 1;
    }
  } catch (error) {
    if (error instanceof WikiError) {
      console.error(error.message);
    } else {
      console.error(error && error.stack ? error.stack : String(error));
    }
    process.exitCode = 1;
  }
}

main();
