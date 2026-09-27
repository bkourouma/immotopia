#!/usr/bin/env node
/**
 * Instance de démo figée sur une révision précise.
 *
 * Sert `api-demo` (8800) et `web-demo` (3300) depuis un worktree détaché,
 * `<racine>/.claude/worktrees/demo`, avec une base dédiée lue dans
 * `packages/api/.env.demo`. Le checkout principal n'est jamais modifié.
 *
 * Par défaut, les node_modules du worktree sont des jonctions vers ceux du
 * checkout principal. `--install` leur substitue des dépendances propres
 * (`npm ci` + `prisma generate`), utiles quand le schéma Prisma diverge.
 *
 *   node scripts/demo-instance.cjs sync <ref> [--migrate] [--install]
 *   node scripts/demo-instance.cjs status
 *
 * Aucune valeur de fichier .env n'est jamais affichée.
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { execFileSync, spawnSync } = require("node:child_process");

const API_HEALTH_URL = "http://localhost:8800/health";
const WEB_URL = "http://localhost:3300";
const HTTP_TIMEOUT_MS = 2000;
const JUNCTIONS = [
  "node_modules",
  "apps/web/node_modules",
  "packages/api/node_modules",
];
const ENV_DEMO = "packages/api/.env.demo";
const ENV_DEV = "packages/api/.env";
const SCHEMA = "packages/api/prisma/schema.prisma";
const WEB_ENV = "apps/web/.env";
const WEB_ENV_SOURCES = ["apps/web/.env.demo", "apps/web/.env"];
const MODE_INSTALL = "install";
const MODE_JUNCTIONS = "junctions";
// Chemins tolérés dans `git status` du worktree démo (posés par ce script).
const TOLERATED_STATUS_PATHS = new Set([...JUNCTIONS, ENV_DEV, WEB_ENV]);

class DemoError extends Error {}

function git(args, cwd) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function tryGit(args, cwd) {
  try {
    return git(args, cwd);
  } catch {
    return null;
  }
}

function projectRoot() {
  const commonDir = git(
    ["rev-parse", "--path-format=absolute", "--git-common-dir"],
    process.cwd(),
  );
  return path.dirname(path.resolve(commonDir));
}

function worktreePath(root) {
  return path.join(root, ".claude", "worktrees", "demo");
}

function worktreeExists(wt) {
  return fs.existsSync(path.join(wt, ".git"));
}

function resolveSha(ref, root) {
  const sha = tryGit(
    ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`],
    root,
  );
  if (!sha)
    throw new DemoError(`Référence introuvable ou pas un commit : ${ref}`);
  return sha;
}

function dirtyEntries(wt) {
  const out = git(["status", "--porcelain", "--untracked-files=all"], wt);
  return out
    .split("\n")
    .filter(Boolean)
    .filter((line) => {
      const file = line.slice(3).replace(/\/$/, "").replace(/^"|"$/g, "");
      return !TOLERATED_STATUS_PATHS.has(file);
    });
}

function checkoutWorktree(root, wt, sha) {
  if (!worktreeExists(wt)) {
    console.log(`Création du worktree démo : ${wt}`);
    git(["worktree", "add", "--detach", wt, sha], root);
    return;
  }
  const dirty = dirtyEntries(wt);
  if (dirty.length > 0) {
    throw new DemoError(
      `Le worktree démo contient des modifications, synchronisation refusée :\n  ${dirty.join("\n  ")}\n` +
        `Nettoyer ${wt} à la main avant de relancer.`,
    );
  }
  git(["checkout", "--detach", sha], wt);
}

/** Vrai si `p` existe (même lien cassé) et est une jonction ou un lien. */
function isLink(p) {
  try {
    return fs.lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
}

/** Vrai si `p` est un vrai dossier (pas une jonction). */
function isRealDir(p) {
  try {
    const st = fs.lstatSync(p);
    return st.isDirectory() && !st.isSymbolicLink();
  } catch {
    return false;
  }
}

/**
 * Retire une jonction en ne touchant QUE le lien : la cible (node_modules du
 * checkout principal) n'est jamais parcourue ni vidée. Refuse tout chemin qui
 * n'est pas un lien.
 */
function removeLinkOnly(link) {
  if (!isLink(link))
    throw new DemoError(`Pas une jonction, retrait refusé : ${link}`);
  try {
    fs.unlinkSync(link);
  } catch {
    fs.rmdirSync(link);
  }
}

function ensureJunctions(root, wt) {
  for (const rel of JUNCTIONS) {
    const target = path.join(root, rel);
    const link = path.join(wt, rel);
    if (isRealDir(link)) {
      console.log(
        `${rel} est un vrai dossier (dépendances propres) : aucune jonction posée.`,
      );
      continue;
    }
    if (!fs.existsSync(target) || isLink(link)) continue;
    fs.mkdirSync(path.dirname(link), { recursive: true });
    fs.symlinkSync(target, link, "junction");
    console.log(`Jonction posée : ${rel}`);
  }
}

function run(command, args, cwd, label) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) throw new DemoError(`${label} a échoué.`);
}

function installOwnDependencies(wt) {
  for (const rel of JUNCTIONS) {
    const link = path.join(wt, rel);
    if (isLink(link)) {
      removeLinkOnly(link);
      console.log(`Jonction retirée (cible intacte) : ${rel}`);
    }
  }
  console.log(
    "Installation des dépendances propres (npm ci) dans le worktree démo…",
  );
  run("npm", ["ci"], wt, "npm ci");
  console.log("Génération du client Prisma de la démo (prisma generate)…");
  run(
    "npx",
    ["prisma", "generate"],
    path.join(wt, "packages", "api"),
    "prisma generate",
  );
}

function copyWebEnv(root, wt) {
  const source = WEB_ENV_SOURCES.find((rel) =>
    fs.existsSync(path.join(root, rel)),
  );
  if (!source) {
    console.log(
      `Ni ${WEB_ENV_SOURCES.join(" ni ")} dans le checkout principal : ${WEB_ENV} non copié.`,
    );
    return;
  }
  fs.copyFileSync(path.join(root, source), path.join(wt, WEB_ENV));
  console.log(`${source} copié vers le worktree démo (${WEB_ENV}).`);
}

/** Lit une variable d'un fichier .env sans jamais l'afficher. */
function readEnvVar(file, name) {
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim().replace(/^export\s+/, "");
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0 || line.slice(0, eq).trim() !== name) continue;
    let value = line.slice(eq + 1).trim();
    const quoted = /^(['"])(.*)\1$/.exec(value);
    value = quoted ? quoted[2] : value.replace(/\s+#.*$/, "");
    return value;
  }
  return null;
}

function loadDemoDatabaseUrl(root) {
  const demoFile = path.join(root, ENV_DEMO);
  if (!fs.existsSync(demoFile)) {
    throw new DemoError(
      `Fichier ${ENV_DEMO} absent. Le créer à partir de ${ENV_DEV} en remplaçant ` +
        `DATABASE_URL par une base de démo DÉDIÉE (distincte de celle du dev).`,
    );
  }
  const demoUrl = readEnvVar(demoFile, "DATABASE_URL");
  if (!demoUrl) throw new DemoError(`DATABASE_URL manquant dans ${ENV_DEMO}.`);
  const devFile = path.join(root, ENV_DEV);
  const devUrl = fs.existsSync(devFile)
    ? readEnvVar(devFile, "DATABASE_URL")
    : null;
  if (devUrl && devUrl === demoUrl) {
    throw new DemoError(
      `${ENV_DEMO} pointe sur la MÊME base que ${ENV_DEV} (DATABASE_URL identique). ` +
        `La démo exige une base dédiée.`,
    );
  }
  return { demoFile, demoUrl };
}

function copyDemoEnv(demoFile, wt) {
  fs.copyFileSync(demoFile, path.join(wt, ENV_DEV));
  console.log(`${ENV_DEMO} copié vers le worktree démo (${ENV_DEV}).`);
}

function warnIfSchemaDiffers(root, wt) {
  const rootSchema = path.join(root, SCHEMA);
  const wtSchema = path.join(wt, SCHEMA);
  if (!fs.existsSync(rootSchema) || !fs.existsSync(wtSchema)) return;
  if (fs.readFileSync(rootSchema, "utf8") === fs.readFileSync(wtSchema, "utf8"))
    return;
  console.warn(
    `\nATTENTION : ${SCHEMA} diffère entre le worktree démo et le checkout principal.\n` +
      `Le client Prisma (node_modules/.prisma) est partagé par la jonction et correspond\n` +
      `au schéma du checkout principal : l'API démo peut échouer sur les champs divergents.\n` +
      `Relancer avec --install pour donner à la démo ses propres dépendances et son\n` +
      `propre client Prisma, sans toucher au développement.\n`,
  );
}

function migrateDeploy(wt, demoUrl) {
  console.log(
    "Application des migrations (prisma migrate deploy) sur la base de démo…",
  );
  const result = spawnSync("npx", ["prisma", "migrate", "deploy"], {
    cwd: path.join(wt, "packages", "api"),
    env: { ...process.env, DATABASE_URL: demoUrl },
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.status !== 0)
    throw new DemoError("prisma migrate deploy a échoué.");
}

/**
 * Emplacement du fichier de révision : `<wt>/.demo-revision` s'il est ignoré
 * par git, sinon le répertoire git propre au worktree (jamais dans status).
 */
function revisionFile(wt) {
  const inTree = path.join(wt, ".demo-revision");
  if (tryGit(["check-ignore", "-q", ".demo-revision"], wt) !== null)
    return inTree;
  const gitDir = git(["rev-parse", "--path-format=absolute", "--git-dir"], wt);
  return path.join(gitDir, "demo-revision");
}

/** Fichier du mode de dépendances, rangé à côté du fichier de révision. */
function modeFile(wt) {
  const rev = revisionFile(wt);
  if (path.basename(rev) !== ".demo-revision")
    return path.join(path.dirname(rev), "demo-mode");
  if (tryGit(["check-ignore", "-q", ".demo-mode"], wt) !== null)
    return path.join(wt, ".demo-mode");
  const gitDir = git(["rev-parse", "--path-format=absolute", "--git-dir"], wt);
  return path.join(gitDir, "demo-mode");
}

/** Mode enregistré (MODE_INSTALL ou MODE_JUNCTIONS), ou null. */
function readMode(wt) {
  try {
    return fs.readFileSync(modeFile(wt), "utf8").trim() || null;
  } catch {
    return null;
  }
}

function writeMode(wt, mode) {
  fs.writeFileSync(modeFile(wt), `${mode}\n`);
}

function describeMode(wt) {
  const mode = readMode(wt);
  if (mode === MODE_INSTALL) return "dépendances propres";
  if (mode === MODE_JUNCTIONS) return "jonctions (partagé)";
  const rootModules = path.join(wt, "node_modules");
  if (isLink(rootModules)) return "jonctions (partagé)";
  if (isRealDir(rootModules)) return "dépendances propres";
  return "inconnu (node_modules absent)";
}

function writeRevision(wt, sha) {
  const file = revisionFile(wt);
  fs.writeFileSync(file, `${sha}\n`);
  if (file !== path.join(wt, ".demo-revision")) {
    console.log(
      `.demo-revision n'est pas ignoré par git : révision écrite dans ${file}`,
    );
  }
}

function originBranch(ref, root) {
  const name = tryGit(
    ["rev-parse", "--abbrev-ref", "--verify", "--quiet", ref],
    root,
  );
  if (name && name !== "HEAD") return name;
  if (ref === "HEAD")
    return tryGit(["symbolic-ref", "--short", "-q", "HEAD"], root);
  return null;
}

function sync(ref, options) {
  if (!ref) throw new DemoError("Usage : sync <ref> [--migrate] [--install]");
  const root = projectRoot();
  const wt = worktreePath(root);
  const sha = resolveSha(ref, root);
  // Contrôler la base démo avant tout travail long (npm ci).
  const { demoFile, demoUrl } = loadDemoDatabaseUrl(root);
  checkoutWorktree(root, wt, sha);
  if (options.install) {
    installOwnDependencies(wt);
    writeMode(wt, MODE_INSTALL);
  } else {
    ensureJunctions(root, wt);
    // Un vrai node_modules déjà installé reste en « dépendances propres ».
    if (!isRealDir(path.join(wt, "node_modules")))
      writeMode(wt, MODE_JUNCTIONS);
  }
  copyDemoEnv(demoFile, wt);
  copyWebEnv(root, wt);
  if (readMode(wt) === MODE_JUNCTIONS) warnIfSchemaDiffers(root, wt);
  if (options.migrate) migrateDeploy(wt, demoUrl);
  writeRevision(wt, sha);
  const branch = originBranch(ref, root);
  console.log(
    `\nWorktree démo sur ${sha}${branch ? ` (branche d'origine : ${branch})` : ""}.`,
  );
  console.log(
    "(Re)démarrer api-demo (8800) et web-demo (3300) pour servir cette révision.",
  );
}

function probe(url) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: HTTP_TIMEOUT_MS }, (res) => {
      res.resume();
      resolve(`HTTP ${res.statusCode}`);
    });
    req.on("timeout", () => req.destroy(new Error("délai dépassé")));
    req.on("error", (err) =>
      resolve(`injoignable (${err.code || err.message})`),
    );
  });
}

async function status() {
  const root = projectRoot();
  const wt = worktreePath(root);
  if (worktreeExists(wt)) {
    const sha = git(["rev-parse", "HEAD"], wt);
    const dirty = dirtyEntries(wt);
    console.log(`Worktree démo : ${wt}`);
    console.log(`Révision      : ${sha}`);
    console.log(
      `État          : ${dirty.length === 0 ? "propre" : `sale (${dirty.length} entrée(s))`}`,
    );
    console.log(`Dépendances   : ${describeMode(wt)}`);
  } else {
    console.log(`Worktree démo : absent (${wt})`);
  }
  const [api, web] = await Promise.all([probe(API_HEALTH_URL), probe(WEB_URL)]);
  console.log(`API démo      : ${API_HEALTH_URL} -> ${api}`);
  console.log(`Web démo      : ${WEB_URL} -> ${web}`);
}

async function main(argv) {
  const [command, ...rest] = argv;
  if (command === "sync") {
    const ref = rest.find((arg) => !arg.startsWith("--"));
    return sync(ref, {
      migrate: rest.includes("--migrate"),
      install: rest.includes("--install"),
    });
  }
  if (command === "status") return status();
  throw new DemoError(
    "Usage : node scripts/demo-instance.cjs sync <ref> [--migrate] [--install] | status",
  );
}

main(process.argv.slice(2)).catch((err) => {
  const message =
    err instanceof DemoError
      ? err.message
      : `Erreur inattendue : ${err.message}`;
  console.error(`\n${message}`);
  process.exitCode = 1;
});
