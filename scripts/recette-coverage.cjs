// Consolide les verdicts explicites sans assimiler un passage partiel à une réussite.
const fs = require("node:fs");
const path = require("node:path");
const dir = path.resolve(__dirname, "../docs/recette/gestion-locative");
const resultsPath = path.join(dir, "RESULTATS.md");
const results = fs.readFileSync(resultsPath, "utf8");
const cases = new Map();
for (const file of fs
  .readdirSync(dir)
  .filter((f) => /^\d\d-.*\.md$/.test(f))
  .sort()) {
  for (const match of fs
    .readFileSync(path.join(dir, file), "utf8")
    .matchAll(/^### (GL-(\d\d)-(\d{3}))\b/gm)) {
    cases.set(match[1], { file, block: match[2], status: "sans verdict" });
  }
}
for (const line of results.split(/\r?\n/)) {
  if (!/^\|\s*GL-/.test(line)) continue;
  const [, expression, verdict, remark = ""] = line
    .split("|")
    .map((s) => s.trim());
  if (/voir suite/.test(verdict)) continue;
  let block;
  const tokens = [...expression.matchAll(/GL-(\d\d)-(\d{3})|\b(\d{3})\b/g)];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token[1]) block = token[1];
    if (!block) continue;
    let end = Number(token[2] || token[3]);
    const start = end;
    const next = tokens[i + 1];
    if (
      next &&
      /^\s*(?:à|[-–])\s*$/.test(
        expression.slice(token.index + token[0].length, next.index),
      )
    ) {
      end = Number(next[2] || next[3]);
      i++;
    }
    for (let n = start; n <= end; n++) {
      const id = `GL-${block}-${String(n).padStart(3, "0")}`;
      if (!cases.has(id)) continue;
      let status = "à finaliser";
      if (/^non joué/.test(verdict)) status = "non joué";
      else if (/^échoué/.test(verdict)) status = "échoué historique";
      else if (/^bloqué/.test(verdict)) status = "bloqué";
      else if (
        /^passé/.test(verdict) &&
        !/partiel|réserve/.test(verdict) &&
        !/non joué/.test(remark)
      )
        status = "passé";
      Object.assign(cases.get(id), { status, verdict, remark });
    }
  }
}
const statuses = [
  "passé",
  "échoué historique",
  "bloqué",
  "à finaliser",
  "non joué",
  "sans verdict",
];
let table =
  "| Fichier | Cas | Passés consignés | Échoués historiques | Bloqués | Partiels / à confirmer | Non joués explicites | Sans verdict |\n";
table += "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |\n";
for (const file of [...new Set([...cases.values()].map((c) => c.file))]) {
  const rows = [...cases.values()].filter((c) => c.file === file);
  table += `| ${file.slice(0, 2)} | ${rows.length} | ${statuses.map((s) => rows.filter((c) => c.status === s).length).join(" | ")} |\n`;
}
table += `| Total | ${cases.size} | ${statuses.map((s) => [...cases.values()].filter((c) => c.status === s).length).join(" | ")} |\n`;
const note =
  "\nBilan calculé par `node scripts/recette-coverage.cjs` à partir des cas définis et des derniers verdicts explicites de ce fichier. Les réussites restent celles des révisions citées. Un échec historique peut avoir été corrigé au bus : le retest d’une anomalie ne valide pas automatiquement toutes les variantes du scénario. « Sans verdict » signifie absence de résultat consigné, et non preuve que le cas n’a jamais été joué. Les partiels et réserves ne sont pas comptés comme réussites complètes.\n\n";
fs.writeFileSync(
  resultsPath,
  results.replace(
    /(## Bilan par fichier\r?\n)[\s\S]*?(?=## Détail)/,
    `$1\n${table}${note}`,
  ),
);
let remaining =
  "# Couverture à finaliser — gestion locative\n\nGénéré depuis les verdicts explicites de RESULTATS.md. Les retests par anomalie sont consignés séparément ; ne pas confondre correction du défaut et validation complète du cas.\n\n";
for (const block of [...new Set([...cases.values()].map((c) => c.block))]) {
  remaining += `## Bloc ${block}\n\n`;
  for (const status of statuses.filter((s) => s !== "passé")) {
    const ids = [...cases]
      .filter(([, c]) => c.block === block && c.status === status)
      .map(([id]) => id);
    if (ids.length)
      remaining += `- ${status} (${ids.length}) : ${ids.join(", ")}.\n`;
  }
  remaining += "\n";
}
fs.writeFileSync(path.join(dir, "COUVERTURE-A-FINALISER.md"), remaining.trimEnd() + "\n");
console.log(table);
