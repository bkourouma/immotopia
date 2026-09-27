# Passation de session

Carnet de reprise entre sessions d'agents. **Lire en premier** en début de
session ; **mettre à jour sans l'annoncer** avant de conclure tout tour en
plusieurs étapes (règle posée dans AGENTS.md et CLAUDE.md).

## Mode d'emploi

- Une section par branche, la plus récente en haut. Réécrire la section de sa
  branche au lieu d'empiler des entrées : ce fichier décrit l'état présent, pas
  l'historique (l'historique, c'est `git log`).
- Supprimer la section d'une branche une fois fusionnée dans `main`.
- Dates absolues (`2026-09-27`), jamais « hier ».
- Chaque worktree a sa copie : en cas de conflit à la fusion, garder les deux
  sections de branche, elles sont indépendantes.
- Pas de secret, pas de donnée personnelle, pas de contenu de `.env`.

Modèle de section :

```markdown
## Branche `type/sujet` — AAAA-MM-JJ

**État :** en cours | prêt à relire | bloqué
**Dernier commit :** `abc1234` résumé

Fait :

- …

Reste à faire :

- …

Pièges et décisions :

- …
```

---

## Pilote — fusions du 2026-09-27

**État :** `main` à jour, aucune PR ouverte
**Dernier commit main :** `0d3aa0c` Merge pull request #23 (recette S6)

Fait :

- Fusionnées dans `main` : #17 (classeur des fonctionnalités), #19 (S1
  identité des documents), #18 (export complet d'agence, avec #22 images de
  marque), #20 (S6 factures prestataires), #21 (S2 paiements par lot, avance,
  suivi mensuel), #23 (recette S6 : accents, historique du fonds sur mobile).
  Chaque branche a reçu `main` avant fusion ; CI verte à
  chaque fois.
- Correctifs de CI faits au passage : test de navigation (entrée « Agences
  mandantes », onglet « Suivi mensuel ») ; test d'archive de l'export dont
  l'attendu dépendait de la casse (`tA`) sous Windows seulement.
- Conflits récurrents entre lots Syndic : `app.ts` (routes), `syndic-types.ts`,
  catalogues `syndic.json` et `packages/api/src/i18n/locales/*.json` — tous
  résolus en gardant les deux côtés, doublons de clés ramenés à la valeur de
  `main`.
- Hors dépôt : ACC-STANDARD-ARCHITECTURE PR #3 fusionnée ; site vitrine
  (`D:\APP\ImmoTopiaWebsite2Version2\site`) déployé deux fois en production
  (wiki, puis icône et défilement), `lancement-site-v2` = `3582c86`, sauvegardes
  d'image `immotopia-site:avant-wiki-20260927` et `:avant-icone-20260927`.

Reste à faire :

- Lots S3 (`feat/syndic-s3-quittances`), S4, S5 en cours dans la session
  Syndic : leurs branches partent d'anciennes têtes de S2/S6 ; fusionner
  `main` avant d'ouvrir les PR (mêmes conflits attendus).
- Hérité de `chore/agentic-architecture` (#16, fusionnée) : créer
  `packages/api/.env.demo` (utilisateur), `demo:sync --install` jamais lancé,
  protection de branche GitHub indisponible (offre gratuite).

Pièges et décisions :

- Ne pas travailler dans le worktree d'une autre session : `export-s7` a
  changé de branche pendant un merge du Pilote (commit parti sur
  `fix/export-images-marque`, rattrapé par fast-forward de #18).
- Le `node_modules` du checkout principal (branche ancienne) n'a pas les
  dépendances de l'export (`archiver`) : pour tester une branche récente dans
  un worktree à jonction, pointer la jonction vers un worktree qui a fait
  `npm install`.
- Tests front sur ce poste : un dépassement de 40 s sous charge ne prouve
  rien (la CI les passe) ; le panneau navigateur masqué a une hauteur 0, fixer
  la taille avant toute mesure de défilement.
- `.claude/settings.local.json` : la règle `ask` sur `gh pr merge` a été
  remplacée par un `allow` (demande de l'utilisateur).
