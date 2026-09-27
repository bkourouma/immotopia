// Hook git pre-push (Lefthook, use_stdin) : refuse une poussée directe vers
// main ou master, quel que soit l'agent ou l'outil qui la lance. Les hooks
// .claude/ ne couvrent que Claude Code ; celui-ci vaut aussi pour Codex et
// pour un humain. Les changements passent par une pull request.
const fs = require("node:fs");

const PROTECTED = new Set(["refs/heads/main", "refs/heads/master"]);

// Chaque ligne de stdin : <ref locale> <sha local> <ref distante> <sha distant>.
const lines = fs.readFileSync(0, "utf8").split(/\r?\n/).filter(Boolean);
const blocked = lines
  .map((line) => line.split(/\s+/)[2])
  .filter((remoteRef) => PROTECTED.has(remoteRef));

if (blocked.length > 0) {
  console.error(
    `Poussée refusée vers ${blocked.join(", ")} : passer par une branche et une pull request.`,
  );
  process.exit(1);
}
