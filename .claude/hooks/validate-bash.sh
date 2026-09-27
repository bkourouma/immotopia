#!/bin/bash
# Hook PreToolUse (matcher Bash|PowerShell) — validation deterministe des commandes
# avant execution. Bloque (exit 2, raison en francais sur stderr) les operations
# destructrices listees dans AGENTS.md et la memoire du projet ; laisse tout le
# reste passer (exit 0).
#
# Echec ouvert : toute entree illisible, tout outil absent (node introuvable,
# fichier temporaire impossible a creer) se traduit par exit 0. On ne bloque
# jamais Claude a cause d'un bug de ce hook lui-meme.
#
# L'extraction du JSON et toute la logique de detection sont faites en Node
# (pas de jq : sa presence n'est pas garantie sous Windows/Git Bash). Le JSON
# recu sur stdin est ecrit dans un fichier temporaire plutot que transmis par
# variable d'environnement, pour ne pas etre limite par la taille d'une
# commande tres longue.

set -u

TMP_INPUT="$(mktemp "${TMPDIR:-/tmp}/claude-validate-bash.XXXXXX" 2>/dev/null)"
if [ -z "$TMP_INPUT" ]; then
  # Impossible de creer le fichier temporaire : on vide stdin et on laisse passer.
  cat >/dev/null
  exit 0
fi
cat > "$TMP_INPUT"
trap 'rm -f "$TMP_INPUT"' EXIT

if ! command -v node >/dev/null 2>&1; then
  exit 0
fi

# Le corps du script Node vit dans un heredoc a delimiteur quote ('NODE_SCRIPT') :
# bash ne fait alors AUCUNE expansion sur son contenu (ni $variable, ni
# `commande`, ni interpretation des apostrophes francaises), ce qui est
# indispensable pour des messages d'erreur en francais.
CLAUDE_HOOK_INPUT_FILE="$TMP_INPUT" node <<'NODE_SCRIPT'
"use strict";
const fs = require("fs");

// Lit tool_input.command depuis le fichier temporaire. Retourne null si le
// JSON est illisible (echec ouvert), "" si aucune commande n'est presente.
function readCommand() {
  try {
    const raw = fs.readFileSync(process.env.CLAUDE_HOOK_INPUT_FILE, "utf8");
    const json = JSON.parse(raw);
    const cmd = json && json.tool_input && json.tool_input.command;
    return typeof cmd === "string" ? cmd : "";
  } catch (e) {
    return null;
  }
}

// Un dossier est "cible" par un rm/Remove-Item si l'argument, une fois
// nettoye d'un "./" de tete et d'un "/" de fin, correspond exactement a un
// des noms proteges. Ca laisse passer "packages/api/dist" ou "dist" tout
// court, et ne bloque que la racine de ces dossiers.
const PROTECTED_DIR_NAMES = ["/", "~", ".git", "uploads", "assets", "packages", "apps", "node_modules"];

// --- Regle 1 : git stash sous toutes ses formes qui modifient l'arbre -----
// list, show, create et apply sont en lecture (ou creent un objet sans
// toucher l'index/l'arbre courant) ; push, pop, drop, clear, save et le
// "git stash" nu (equivalent a push) sont destructifs pour l'arbre partage.
function checkGitStash(cmd) {
  const allowed = ["list", "show", "create", "apply"];
  const re = /\bgit\s+stash(?:\s+(-{0,2}[a-zA-Z-]+))?/g;
  let m;
  while ((m = re.exec(cmd)) !== null) {
    const sub = m[1];
    if (!sub || !allowed.includes(sub)) {
      const label = sub ? sub : "sans sous-commande (equivalent a push)";
      return (
        "git stash (" + label + ") est bloque : un sous-agent a deja vide " +
        "l'arbre de travail partage avec un stash. Seuls list, show, create " +
        "et apply sont autorises ; demande a l'utilisateur pour le reste."
      );
    }
  }
  return null;
}

// --- Regle 2 : git push force / vers main-master -----------------------
// --force-with-lease est tolere, sauf vers main/master ; --force et -f nus
// sont toujours bloques ; un push direct vers main/master est bloque meme
// sans aucune option de force.
function targetsMainOrMaster(str) {
  return /(^|\s|:)(main|master)(\s|$)/.test(str);
}

function checkGitPush(cmd) {
  if (!/\bgit\s+push\b/.test(cmd)) return null;

  if (targetsMainOrMaster(cmd)) {
    return "push direct vers main ou master est bloque : on ne pousse jamais directement sur ces branches.";
  }

  const forceTokens = cmd.match(/--force(-[a-zA-Z]+)*/g) || [];
  for (const tok of forceTokens) {
    if (tok !== "--force-with-lease") {
      return "git push --force est bloque. Utilise --force-with-lease sur une branche qui n'est pas main/master si c'est vraiment necessaire.";
    }
  }

  if (/(^|\s)-f(\s|$)/.test(cmd)) {
    return "git push -f est bloque (equivalent a --force). Utilise --force-with-lease sur une branche qui n'est pas main/master si c'est vraiment necessaire.";
  }

  return null;
}

// --- Regle 3 : --no-verify sur commit/push -------------------------------
function checkNoVerify(cmd) {
  if (/\bgit\s+(commit|push)\b/.test(cmd) && /--no-verify\b/.test(cmd)) {
    return "--no-verify est bloque sur git commit/push : les controles (typecheck, lint, tests) ne se contournent pas.";
  }
  return null;
}

// --- Regle 4 : abandon de tout l'arbre de travail ------------------------
// git reset --hard n'est PAS concerne (utilise volontairement pour rattraper
// un worktree, cf memoire du projet).
function checkTreeWipe(cmd) {
  if (/\bgit\s+clean\b/.test(cmd)) {
    const cleanMatch = cmd.match(/\bgit\s+clean\b[^|;&\n]*/);
    const segment = cleanMatch ? cleanMatch[0] : cmd;
    if (/(^|\s)-[a-zA-Z]*f[a-zA-Z]*(\s|$)/.test(segment) || /--force\b/.test(segment)) {
      return "git clean -f est bloque : suppression irreversible des fichiers non suivis sur tout l'arbre.";
    }
  }
  if (/\bgit\s+checkout\s+--\s+\.(\s|$)/.test(cmd)) {
    return "git checkout -- . est bloque : abandon de toutes les modifications de l'arbre de travail.";
  }
  if (/\bgit\s+checkout\s+\.(\s|$)/.test(cmd)) {
    return "git checkout . est bloque : abandon de toutes les modifications de l'arbre de travail.";
  }
  if (/\bgit\s+restore\s+\.(\s|$)/.test(cmd)) {
    return "git restore . est bloque : abandon de toutes les modifications de l'arbre de travail.";
  }
  return null;
}

// --- Regle 5 : reinitialisations destructrices de base de donnees -------
function checkDbDestructive(cmd) {
  if (/\bprisma\s+migrate\s+reset\b/.test(cmd)) {
    return "prisma migrate reset est bloque : reinitialisation destructive de la base (cf piege du seed dans AGENTS.md).";
  }
  if (/\bprisma\s+db\s+push\b/.test(cmd) && /--force-reset\b|--accept-data-loss\b/.test(cmd)) {
    return "prisma db push avec --force-reset ou --accept-data-loss est bloque : perte de donnees possible.";
  }
  if (/drop\s+database\b/i.test(cmd)) {
    return "DROP DATABASE est bloque.";
  }
  if (/\bdropdb\b/.test(cmd)) {
    return "dropdb est bloque.";
  }
  return null;
}

// --- Regle 6 : rm -rf / Remove-Item -Recurse sur un dossier protege ------
function checkRmRf(cmd) {
  const rmRe = /\brm\s+([^\n]*)/g;
  let m;
  while ((m = rmRe.exec(cmd)) !== null) {
    let rest = m[1];
    const stop = rest.match(/(&&|\|\||[;|])/);
    if (stop) rest = rest.slice(0, stop.index);

    const tokens = rest.split(/\s+/).filter(Boolean);
    let hasR = false;
    let hasF = false;
    const targets = [];
    for (const tok of tokens) {
      if (tok === "--recursive") {
        hasR = true;
      } else if (tok === "--force") {
        hasF = true;
      } else if (/^-[a-zA-Z]+$/.test(tok)) {
        if (/[rR]/.test(tok)) hasR = true;
        if (/f/.test(tok)) hasF = true;
      } else if (/^--/.test(tok)) {
        // autre option longue, non pertinente pour cette regle
      } else {
        targets.push(tok);
      }
    }
    if (hasR && hasF) {
      for (const target of targets) {
        const cleaned = target.replace(/^\.\//, "").replace(/\/+$/, "");
        if (cleaned === "" || PROTECTED_DIR_NAMES.includes(cleaned)) {
          return (
            "rm -rf vise un dossier protege (" + target + ") : trop " +
            "dangereux pour etre execute automatiquement. Cible un sous-dossier " +
            "precis (dist/, coverage/, un dossier temporaire...) si c'est le besoin reel."
          );
        }
      }
    }
  }

  if (/Remove-Item\b/i.test(cmd) && /-Recurse\b/i.test(cmd)) {
    for (const name of PROTECTED_DIR_NAMES) {
      if (name === "/" || name === "~") continue;
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp("(^|[\\s\"'\\\\/])" + escaped + "([\\s\"'\\\\/]|$)");
      if (re.test(cmd)) {
        return (
          "Remove-Item -Recurse vise un dossier protege (" + name + ") : trop " +
          "dangereux pour etre execute automatiquement."
        );
      }
    }
  }

  return null;
}

// --- Regle 7 : installation npm hors racine du monorepo ------------------
// npm install -w <paquet> depuis la racine reste autorise ; seule une
// installation lancee DANS apps/web ou packages/api (cd, --prefix) est bloquee.
function checkWorkspaceInstall(cmd) {
  const installRe = /\bnpm\s+(install|ci|i)\b/;
  if (!installRe.test(cmd)) return null;

  const prefixToSubpackage = /--prefix[=\s]+["']?(\.\/)?(apps\/web|packages\/api)\b/;
  if (prefixToSubpackage.test(cmd)) {
    return (
      "npm install/ci --prefix vers apps/web ou packages/api est bloque : le " +
      "monorepo s'installe uniquement a la racine. Utilise npm install -w <paquet> " +
      "depuis la racine pour une dependance ciblee."
    );
  }

  const cdToSubpackage = /\bcd\s+["']?(\.\/)?(apps\/web|packages\/api)\b/;
  if (cdToSubpackage.test(cmd) && /(&&|;|\|\|)/.test(cmd)) {
    return (
      "npm install/ci lance depuis apps/web ou packages/api est bloque : le " +
      "monorepo s'installe uniquement a la racine. Utilise npm install -w <paquet> " +
      "depuis la racine pour une dependance ciblee."
    );
  }

  return null;
}

// --- Neutralisation prealable : texte cite et corps de heredoc -----------
// Les regles ci-dessus cherchent des motifs comme "git stash" dans la
// commande entiere. Sans egard au contexte, ca declenche sur du texte qui
// n'est PAS execute : un motif grep ("grep git stash docs"), un message de
// commit ("git commit -m 'docs: interdire git stash'"), ou le contenu ecrit
// par un heredoc ("cat > f <<'EOF' ... git stash ... EOF"). On neutralise
// donc, AVANT detection :
//   - le corps de tout heredoc, SAUF si le heredoc est envoye a un
//     interpreteur qui l'executerait reellement (bash, sh, zsh, dash,
//     powershell, pwsh, cmd, eval) ;
//   - le contenu de toute chaine entre guillemets simples/doubles, SAUF si
//     cette chaine est l'argument d'un `bash -c`, `sh -c`, `powershell
//     -Command`, `pwsh -c`, `eval` ou `cmd /c` — auquel cas c'est une
//     commande a part entiere et son contenu doit rester analysable.
// Limite connue et acceptee : une cible legitime mais citee (ex.
// `git push origin "main"`) est elle aussi neutralisee et donc invisible a
// la regle 2. C'est le compromis demande : ces guillemets-la sont d'ordinaire
// des arguments de donnees (message, motif, contenu de fichier), pas des
// commandes a re-executer, et c'est ce cas tres majoritaire qu'on doit
// laisser passer sans faux positif.

const EXECUTOR_NAMES = ["bash", "sh", "zsh", "dash", "powershell", "powershell.exe", "pwsh", "cmd", "cmd.exe", "eval"];

// Neutralise le corps des heredocs (<<DELIM, <<-DELIM, <<'DELIM', <<"DELIM")
// dont la commande consommatrice n'est pas un interpreteur de la liste
// ci-dessus. Fonctionne ligne par ligne : le corps va de la ligne suivant
// l'operateur jusqu'a la ligne qui vaut exactement DELIM (une fois "trim").
function stripHeredocs(cmd) {
  const lines = cmd.split("\n");
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const heredocMatch = line.match(/<<-?\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1/);
    if (!heredocMatch) {
      out.push(line);
      i++;
      continue;
    }

    const delim = heredocMatch[2];
    const beforeHeredoc = line.slice(0, heredocMatch.index);
    const segments = beforeHeredoc.split(/(?:&&|\|\||[;|])/);
    const lastSegment = (segments[segments.length - 1] || "").trim();
    const firstWord = (lastSegment.split(/\s+/)[0] || "").replace(/^.*[\\/]/, "").toLowerCase();
    const isExecutor = EXECUTOR_NAMES.includes(firstWord);

    out.push(line);
    i++;

    const bodyLines = [];
    while (i < lines.length && lines[i].trim() !== delim) {
      bodyLines.push(lines[i]);
      i++;
    }
    if (i < lines.length) {
      out.push(lines[i]); // la ligne du delimiteur fermant, inoffensive telle quelle
      i++;
    }

    if (isExecutor) {
      out.push(...bodyLines);
    } else {
      out.push(...bodyLines.map(() => ""));
    }
  }
  return out.join("\n");
}

// Repere les plages [debut, fin) d'une chaine citee qui est l'argument d'un
// interpreteur qui va reellement l'executer (bash -c "...", eval '...', etc.).
// Ces plages seront preservees intactes ; tout le reste sera neutralise.
function findProtectedRanges(str) {
  const patterns = [
    /\b(?:bash|sh|zsh|dash)\s+-c\s+(['"])/gi,
    /\beval\s+(['"])/gi,
    /\b(?:powershell(?:\.exe)?|pwsh)\s+(?:-Command|-c)\s+(['"])/gi,
    /\bcmd(?:\.exe)?\s+\/c\s+(['"])/gi,
  ];

  const ranges = [];
  for (const re of patterns) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(str)) !== null) {
      const quoteChar = m[1];
      const openIdx = m.index + m[0].length - 1;
      let i = openIdx + 1;
      let closeIdx = -1;
      while (i < str.length) {
        if (quoteChar === '"' && str[i] === "\\") {
          i += 2;
          continue;
        }
        if (str[i] === quoteChar) {
          closeIdx = i;
          break;
        }
        i++;
      }
      const end = closeIdx === -1 ? str.length : closeIdx + 1;
      ranges.push([m.index, end]);
      re.lastIndex = end;
    }
  }

  ranges.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const r of ranges) {
    if (merged.length && r[0] <= merged[merged.length - 1][1]) {
      merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], r[1]);
    } else {
      merged.push(r);
    }
  }
  return merged;
}

// Remplace le contenu interieur de chaque chaine citee (simple ou double)
// par des espaces, en conservant les guillemets et la longueur totale de la
// chaine (indispensable pour recoller les plages protegees par index ensuite).
function maskQuotesKeepLength(str) {
  let out = "";
  let i = 0;
  const n = str.length;
  while (i < n) {
    const c = str[i];
    if (c === "'") {
      let j = i + 1;
      while (j < n && str[j] !== "'") j++;
      const hasClose = j < n;
      const spanEnd = hasClose ? j : n - 1;
      const spanLen = spanEnd - i + 1;
      const middleLen = hasClose ? spanLen - 2 : spanLen - 1;
      out += "'" + " ".repeat(Math.max(0, middleLen)) + (hasClose ? "'" : "");
      i = spanEnd + 1;
      continue;
    }
    if (c === '"') {
      let j = i + 1;
      while (j < n) {
        if (str[j] === "\\") {
          j += 2;
          continue;
        }
        if (str[j] === '"') break;
        j++;
      }
      const hasClose = j < n && str[j] === '"';
      const spanEnd = hasClose ? j : n - 1;
      const spanLen = spanEnd - i + 1;
      const middleLen = hasClose ? spanLen - 2 : spanLen - 1;
      out += '"' + " ".repeat(Math.max(0, middleLen)) + (hasClose ? '"' : "");
      i = spanEnd + 1;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

// Assemble les trois etapes : heredocs neutralises, chaines citees
// neutralisees sauf celles protegees (executees comme commande).
function neutralizeCommand(rawCmd) {
  const working = stripHeredocs(rawCmd);
  const protectedRanges = findProtectedRanges(working);

  // "Blinde" les plages protegees (retire leurs guillemets de la vue) avant
  // le masquage generique, pour que maskQuotesKeepLength ne les touche pas.
  let shielded = working;
  if (protectedRanges.length) {
    const chars = working.split("");
    for (const [s, e] of protectedRanges) {
      for (let k = s; k < e; k++) chars[k] = "X";
    }
    shielded = chars.join("");
  }

  const maskedGeneric = maskQuotesKeepLength(shielded);

  // Recolle le texte original des plages protegees (meme longueur garantie).
  const finalChars = maskedGeneric.split("");
  for (const [s, e] of protectedRanges) {
    for (let k = s; k < e; k++) finalChars[k] = working[k];
  }
  return finalChars.join("");
}

const cmd = readCommand();
if (cmd === null || !cmd) {
  process.exit(0);
}

const neutralizedCmd = neutralizeCommand(cmd);

const checks = [
  checkGitStash,
  checkGitPush,
  checkNoVerify,
  checkTreeWipe,
  checkDbDestructive,
  checkRmRf,
  checkWorkspaceInstall,
];

for (const check of checks) {
  const reason = check(neutralizedCmd);
  if (reason) {
    console.error(reason);
    process.exit(2);
  }
}

process.exit(0);
NODE_SCRIPT

exit $?
