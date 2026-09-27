---
name: audit
description: Audite un perimetre du monorepo ImmoTopia (un chemin donne en argument, ou par defaut le diff de la branche courante contre main) en enchainant typecheck/lint/tests pertinents, une batterie de recherches mecaniques verifiees sur ce depot, puis une revue par les sous-agents code-reviewer et security-auditor. Produit un rapport unique classe par gravite, compare a AUDIT_CODE.md. A invoquer via /audit avant une PR, ou quand on veut un etat des lieux de securite/qualite sur une zone du code.
---

# /audit — audit d'un perimetre ImmoTopia

Argument optionnel : `$ARGUMENTS` est soit un chemin (fichier ou dossier),
soit vide. Vide veut dire : le diff de la branche courante contre `main`.

## 1. Determiner le perimetre

- Si `$ARGUMENTS` est un chemin existant : le perimetre est ce chemin (et son
  contenu s'il s'agit d'un dossier).
- Sinon : `git diff --name-only main...HEAD` donne la liste des fichiers
  modifies. Si la branche courante EST `main` ou que la liste est vide,
  dis-le et arrete-toi plutot que d'auditer tout le depot par defaut — ce
  n'est pas le meme travail et ca ne doit jamais partir sans le dire.

Deduis du perimetre quels paquets sont touches : `apps/web/**` -> paquet
web ; `packages/api/**` -> paquet API. Les deux peuvent l'etre a la fois.

## 2. Typecheck / lint / tests pertinents

Ne lance que ce que le perimetre justifie :

- Perimetre touchant `apps/web` : `npm run typecheck -w @immotopia/web` et
  `npm run lint -w @immotopia/web`. Zero erreur attendu (contrairement a
  l'API, le web est deja propre — une erreur ici est un vrai signal).
- Perimetre touchant `packages/api` : `npm run typecheck -w @immotopia/api`
  et `npm run lint -w @immotopia/api`. Le paquet porte encore environ 160
  erreurs TypeScript preexistantes (AGENTS.md) : compare le compte avant/apres
  plutot que d'exiger zero. Une **nouvelle** erreur dans un fichier du
  perimetre qui en etait exempt est bloquante pour ton rapport ; les erreurs
  deja connues ne le sont pas.
- Tests : `npm test` (API) et/ou `npm run test:web` (web) selon le perimetre,
  au minimum sur les fichiers de test proches des fichiers modifies.

## 3. Recherches mecaniques

Chaque commande ci-dessous a ete executee une fois sur ce depot pour
verifier qu'elle est valide et raisonnablement peu bruyante ; adapte le
chemin de recherche au perimetre de l'audit (remplace `packages/api/src` /
`apps/web/src` par le sous-dossier concerne quand le perimetre est plus
etroit qu'un paquet entier).

```bash
# Prisma : include: { user: true } ramene l'objet User complet (passwordHash inclus).
# Sur ce depot : 1 usage reel (auth-service.ts) + 1 mention en commentaire a ignorer.
grep -rn "include:\s*{\s*user:\s*true" packages/api/src

# Variable d'environnement lue hors de config/env.ts (contourne la validation Zod).
# Sur ce depot : ~29 fichiers ont un usage direct ; compare a AUDIT_CODE.md avant
# de traiter chaque hit comme une regression nouvelle.
grep -rln "process\.env\." packages/api/src --include="*.ts" | grep -v "packages/api/src/config/env.ts"

# HTML non fiable rendu sans passer par une <iframe sandbox>.
grep -rn "dangerouslySetInnerHTML" apps/web/src

# fetch() brut cote web au lieu de utils/api-client. Le \b est indispensable :
# sans lui, "refetch(" et "prefetch(" (React Query) polluent massivement le
# resultat (44 faux positifs constates avant ce garde-fou, contre 1 vrai hit apres).
grep -rEln "\bfetch\(" apps/web/src --include="*.ts" --include="*.tsx" | grep -v "utils/api-client"

# Marge en classe Tailwind physique au lieu d'une propriete logique (casse le RTL arabe).
grep -rEn "\b(ml|mr|pl|pr)-[0-9]" apps/web/src --include="*.tsx" --include="*.ts"

# Cle i18n pointee (t('a.b')) au lieu du texte francais comme cle. Necessite grep -P
# (lookbehind) : sans lui, "t('Chargement...')" et "...AltText('fuite.jpg')" sont des
# faux positifs constates (l'ellipse matche un `.`+`.` naïf, et le "t(" de la fin de
# "AltText(" matche un `t\(` sans ancrage de mot).
grep -rPn "(?<![a-zA-Z0-9_])t\((['\"])[a-zA-Z0-9_]+\.[a-zA-Z0-9_]+\1" apps/web/src packages/api/src

# Injection SQL potentielle.
grep -rn "queryRawUnsafe\|executeRawUnsafe" packages/api/src

# console.log ajoute par le diff (pas les console.log preexistants : il y en a
# deja 7 fichiers sur ce depot, tous ne sont pas des regressions a signaler).
git diff main...HEAD -- packages/api/src apps/web/src | grep -E "^\+.*console\.log"
```

Si une commande remonte un flot de faux positifs sur le perimetre precis
que tu audites (par exemple un dossier riche en tests avec des chaines qui
ressemblent au motif), dis-le dans le rapport plutot que de lister chaque
faux positif comme un constat.

## 4. Delegation aux sous-agents de revue

Lance en parallele, sur le meme perimetre :

- `code-reviewer` (`.claude/agents/code-reviewer.md`) : conformite AGENTS.md
  hors securite, taille des fonctions, tests, regressions TypeScript.
- `security-auditor` (`.claude/agents/security-auditor.md`) : isolation
  multi-tenant/IDOR, fichiers prives, secrets, XSS, paiements, injection SQL.

Donne-leur explicitement le perimetre determine a l'etape 1 (liste de
fichiers ou chemin), pas "le depot entier" implicite.

## 5. Rapport unique

Fusionne : resultats typecheck/lint/tests, recherches mecaniques (deduplique
avec les constats deja remontes par les sous-agents), constats des deux
sous-agents. Classe le tout par gravite (Bloquant/Critique, Important,
Mineur), avec `fichier:ligne`, un scenario d'echec concret et une correction
proposee pour chaque constat — jamais un constat sans preuve verifiee.

Pour chaque constat, verifie s'il figure deja dans `AUDIT_CODE.md` :

- S'il y figure comme dette connue et que le perimetre audite ne l'a pas
  aggravee : mentionne-le a part, hors du compte des constats nouveaux.
- S'il est nouveau ou aggrave une dette existante (ex. une erreur
  TypeScript de plus dans un fichier deja liste) : c'est un constat a part
  entiere de ce rapport.

Termine par une synthese courte : perimetre audite, nombre de constats par
gravite, et la liste des verifications qui n'ont rien trouve (pour que
l'absence de mention ne se lise pas comme un oubli).
