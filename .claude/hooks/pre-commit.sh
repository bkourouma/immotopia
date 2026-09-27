#!/bin/bash
# Hook PreToolUse (matcher Bash) — controle supplementaire avant un `git commit`
# lance par l'agent, en complement du hook Lefthook (lint-staged) declare dans
# .lefthook.yml, qui continue de tourner normalement.
#
# Ne fait rien (exit 0 immediat) si la commande ne contient pas "git commit".
# Sinon, sur les fichiers INDEXES uniquement (git diff --cached) :
#   - apps/web/**/*.{ts,tsx} -> `npm run typecheck -w @immotopia/web` :
#     bloquant (exit 2) en cas d'erreur, comme la CI.
#   - packages/api/**/*.ts -> `tsc --noEmit` du paquet API, erreurs filtrees
#     aux seuls fichiers indexes : non bloquant (~160 erreurs preexistantes,
#     cf AGENTS.md), remonte en avertissement via le JSON de sortie du hook.
#   - ESLint --quiet (sans --fix) sur les fichiers indexes : bloquant pour le
#     web, avertissement non bloquant pour l'API.
# Ce script ne modifie jamais l'index ni l'arbre de travail : aucune commande
# ci-dessous n'ecrit de fichier.
#
# Les binaires sont appeles par leur point d'entree JS (node node_modules/...)
# plutot que par le raccourci .cmd de node_modules/.bin : sous Windows, ce
# raccourci bloque lint-staged des que plusieurs fichiers sont indexes (voir
# .lefthook.yml et docs/refonte/LOT-0-RAPPORT.md). Le meme risque existe ici.

set -u

cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0

TMP_INPUT="$(mktemp "${TMPDIR:-/tmp}/claude-pre-commit.XXXXXX" 2>/dev/null)"
if [ -z "$TMP_INPUT" ]; then
  cat >/dev/null
  exit 0
fi
cat > "$TMP_INPUT"
trap 'rm -f "$TMP_INPUT"' EXIT

if ! command -v node >/dev/null 2>&1; then
  exit 0
fi

COMMAND="$(node -e '
const fs = require("fs");
try {
  const raw = fs.readFileSync(process.argv[1], "utf8");
  const json = JSON.parse(raw);
  const cmd = json && json.tool_input && json.tool_input.command;
  process.stdout.write(typeof cmd === "string" ? cmd : "");
} catch (e) {
  process.stdout.write("");
}
' "$TMP_INPUT" 2>/dev/null)"

# Pas de commande lisible, ou pas un git commit : sortie immediate.
case "$COMMAND" in
  *"git commit"*) ;;
  *) exit 0 ;;
esac

if ! command -v git >/dev/null 2>&1; then
  exit 0
fi

STAGED_FILES="$(git diff --cached --name-only --diff-filter=ACMR 2>/dev/null)"
if [ -z "$STAGED_FILES" ]; then
  exit 0
fi

WEB_TS_FILES="$(printf '%s\n' "$STAGED_FILES" | grep -E '^apps/web/.*\.(ts|tsx)$' || true)"
API_TS_FILES="$(printf '%s\n' "$STAGED_FILES" | grep -E '^packages/api/.*\.ts$' || true)"

# --- apps/web : typecheck + eslint, bloquants -----------------------------
if [ -n "$WEB_TS_FILES" ]; then
  TYPECHECK_OUT="$(npm run typecheck -w @immotopia/web 2>&1)"
  TYPECHECK_STATUS=$?
  if [ "$TYPECHECK_STATUS" -ne 0 ]; then
    {
      echo "Typecheck frontend (npm run typecheck -w @immotopia/web) en echec : la CI bloque aussi dessus."
      echo "30 premieres lignes :"
      printf '%s\n' "$TYPECHECK_OUT" | head -n 30
    } >&2
    exit 2
  fi

  mapfile -t WEB_TS_ARRAY <<< "$WEB_TS_FILES"
  ESLINT_WEB_OUT="$(node node_modules/eslint/bin/eslint.js "${WEB_TS_ARRAY[@]}" --quiet 2>&1)"
  ESLINT_WEB_STATUS=$?
  if [ "$ESLINT_WEB_STATUS" -ne 0 ]; then
    {
      echo "ESLint --quiet (sans --fix) en echec sur les fichiers indexes de apps/web :"
      printf '%s\n' "$ESLINT_WEB_OUT"
    } >&2
    exit 2
  fi
fi

# --- packages/api : tsc --noEmit + eslint, avertissement non bloquant ----
if [ -n "$API_TS_FILES" ]; then
  mapfile -t API_TS_ARRAY <<< "$API_TS_FILES"

  TSC_API_OUT="$(node node_modules/typescript/bin/tsc --noEmit -p packages/api/tsconfig.json 2>&1)"

  # ~160 erreurs preexistantes cote API (AGENTS.md) : on ne regarde que les
  # lignes qui concernent un fichier indexe dans ce commit.
  FILTERED_TSC=""
  for f in "${API_TS_ARRAY[@]}"; do
    MATCHED="$(printf '%s\n' "$TSC_API_OUT" | grep -F "$f" || true)"
    if [ -n "$MATCHED" ]; then
      FILTERED_TSC="${FILTERED_TSC}${MATCHED}
"
    fi
  done

  ESLINT_API_OUT="$(node node_modules/eslint/bin/eslint.js "${API_TS_ARRAY[@]}" --quiet 2>&1)"
  ESLINT_API_STATUS=$?

  if [ -n "$FILTERED_TSC" ] || [ "$ESLINT_API_STATUS" -ne 0 ]; then
    WARNING_TEXT="Avertissement non bloquant packages/api (dette preexistante, ne bloque pas la CI, cf AGENTS.md) :"
    if [ -n "$FILTERED_TSC" ]; then
      WARNING_TEXT="${WARNING_TEXT}
tsc --noEmit, fichiers indexes uniquement :
${FILTERED_TSC}"
    fi
    if [ "$ESLINT_API_STATUS" -ne 0 ]; then
      WARNING_TEXT="${WARNING_TEXT}
eslint --quiet :
${ESLINT_API_OUT}"
    fi

    # Avertissement non bloquant : remonte a Claude via le JSON de sortie du
    # hook (systemMessage + hookSpecificOutput.additionalContext), exit 0.
    node -e '
const msg = process.argv[1];
process.stdout.write(JSON.stringify({
  systemMessage: msg,
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    additionalContext: msg
  }
}));
' "$WARNING_TEXT"
  fi
fi

exit 0
