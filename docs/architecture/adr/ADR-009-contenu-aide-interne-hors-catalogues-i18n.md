# ADR-009 : Contenu de l'aide interne hors des catalogues i18n

## Statut

Accepté

## Date

2026-11-14

## Contexte

L'application est trilingue (fr/en/ar) et **le texte français est la clé de
traduction** : `t('Ajouter un bien')`, jamais `t('properties.add')`
([i18n.md](../i18n.md)). Modifier un texte français change donc sa clé et casse
ses traductions : l'ancienne reste dans le catalogue, non référencée, et la
nouvelle est à reporter à la main.

L'aide interne (le « ? » des écrans) change ce rapport d'échelle. Elle compte
des centaines de fiches (une fiche de page par écran, une fiche par tableau,
carte, onglet ou assistant), chacune pouvant atteindre environ 650 mots, en trois
langues. Mises dans les catalogues, ces fiches :

- noieraient les catalogues des libellés de l'interface, que
  `npm run i18n:extract` extrait et tient à jour ;
- feraient casser des traductions à chaque retouche d'un texte, alors que le
  contenu d'aide se corrige souvent (une phrase, une étape, une question de FAQ) ;
- seraient chargées avec le reste de l'interface, alors que le lecteur n'ouvre
  qu'une fiche à la fois, dans une seule langue.

Les fiches ne sont pas des libellés : ce sont des documents structurés
(`HelpEntry`, contrat dans `apps/web/src/help/types.ts` : résumé, étapes, FAQ,
visite guidée, liens), qui n'ont pas besoin d'un identifiant dérivé du texte.

## Décision

1. **Le contenu de l'aide vit hors des catalogues**, dans
   `apps/web/src/help/content/<module>/{fr,en,ar}/<zone>.ts`. Chaque fichier de
   zone exporte par défaut un `HelpEntry[]`. `<module>/{fr,en,ar}.ts`
   concatènent les zones de leur langue, rien d'autre. Les modules sont ceux de
   `HELP_MODULES` (`content/index.ts`) : `locatif`, `syndic`, `finance`,
   `patrimoine`, `commercial`, `communication`, `portails`, `administration`.
2. **Chaque fiche est indexée par un `helpId`** de la forme
   `<module>.<ecran>[.<bloc>]` (`HELP_ID_PATTERN`). Le premier segment est le
   module et le dossier où vit la fiche ; l'identifiant est identique dans les
   trois langues.
3. **Le chargement se fait à la demande, par module et par langue.**
   `content/index.ts` déclare `helpLoaders[module][langue]`, un `import()`
   dynamique de `./<module>/<langue>` : chaque couple module-langue devient un
   chunk, qui embarque ses zones. `registry.ts` déduit le module du premier
   segment du `helpId` (`moduleOfHelpId`), charge le module dans la langue
   courante (`loadHelpModule`), met le résultat en cache par `module:langue`
   (une requête en cours est partagée) et, hors français, charge aussi le
   français pour servir de repli quand une fiche manque dans la langue demandée.
   La recherche (`searchHelp`) charge tous les modules de la langue courante à la
   première requête.
4. **Les routes sont dans `<module>/routes.ts`** (motifs de route vers `helpId`
   de fiche de page). Seules les routes de tous les modules (`helpRoutes`) sont
   importées d'emblée par `content/index.ts` ; elles sont légères, et elles
   suffisent à faire apparaître le « ? » de page sans charger la moindre fiche.
5. **Seuls les libellés de l'interface du socle passent par `t()` et les
   catalogues** : boutons, titres et messages du panneau d'aide, de la visite
   guidée et du retour utilisateur. Le contenu des fiches n'est jamais enveloppé
   dans `t()` et n'est pas touché par `npm run i18n:extract`.

### Contrôle : `npm run help:check`

`npm run help:check -w apps/web` (depuis la racine : `npm run help:check`) lance
`apps/web/scripts/help-coverage.mjs`. Le script regroupe puis importe les
fichiers de contenu de chaque module (en suivant les fichiers de zone) et
vérifie :

- **A.** chaque `helpId` littéral du code de l'application existe dans le
  `fr.ts` de son module ;
- **B.** les identifiants sont les mêmes en fr, en et en ar, dans les deux sens ;
- **C.** chaque `helpId` de `routes.ts` existe en français, et chaque motif de
  route commence par `/` ;
- **D.** les identifiants sont uniques, bien formés, et leur premier segment est
  le dossier du module ; un fichier de contenu n'importe que des types ou des
  zones de sa propre langue ;
- **E.** les routes de `src/App.tsx` sans fiche de page sont signalées en
  avertissement (bloquantes avec `--strict`, hors la liste des écrans publics
  exclus).

Un fichier de zone qu'aucun `<lang>.ts` n'importe est signalé en avertissement.
Le script sort en erreur (code 1) sur toute anomalie A à D. Il ne contrôle ni la
longueur des fiches, ni l'exactitude des libellés cités, ni le fait qu'une fiche
soit réellement appelée par un écran.

Le job `web` de `.github/workflows/ci.yml` lance ce script après le lint : une
anomalie A à D fait échouer la CI. Les routes sans fiche (E) restent un
avertissement ; le centre d'aide (`/aide`) et la projection plein écran de
l'assemblée générale sont exclus de ce contrôle (`IGNORED_ROUTES`).

## Conséquences positives

- Une retouche de contenu ne casse aucune traduction ni aucun catalogue : il n'y
  a pas de clé dérivée du texte.
- Le bundle d'entrée reste léger : il ne porte que les motifs de route ; une
  fiche n'est chargée qu'à l'ouverture du panneau, pour sa langue et son module.
- Un fichier par zone et par langue : un rédacteur par zone, pas de conflit de
  fusion entre rédacteurs, revue de contenu isolée du code.
- Les catalogues restent réservés aux libellés de l'interface et gardent leur
  outillage d'extraction.
- Le repli sur le français évite un panneau vide quand une traduction manque.

## Conséquences négatives

- Trois fichiers par zone à tenir alignés (mêmes identifiants, mêmes nombres
  d'étapes, de questions et de colonnes) ; `help:check` n'en vérifie que les
  identifiants.
- Les libellés d'interface cités dans une fiche (boutons, onglets, colonnes) sont
  écrits à la main, donc ils dérivent si l'interface change : d'où la règle du
  [guide de rédaction](../../aide/GUIDE_REDACTION.md) « libellés cités tels
  qu'affichés dans chaque langue », qui reste une règle de revue.
- Pas d'extraction automatique : un texte ajouté dans l'aide n'est pas détecté
  par `i18n:extract` et n'est traduit que par le rédacteur.
- Une deuxième mécanique de traduction cohabite avec `t()` : il faut savoir dans
  laquelle un texte doit aller.

## Alternatives écartées

- **Mettre les fiches dans les catalogues avec `t()`** : volume et fragilité des
  clés décrits plus haut, et chargement de toutes les fiches avec l'interface.
- **Des identifiants de clé (`help.locatif.baux.liste.summary`)** : contraire à la
  convention du dépôt (le français est la clé), et inutile puisque la fiche a déjà
  un `helpId` stable.
- **Un seul fichier par module et par langue, sans zones** : plusieurs rédacteurs
  sur le même fichier et conflits de fusion ; le découpage par zone est décrit dans
  le guide pour les modules volumineux.

## Liens

- [Guide de rédaction de l'aide](../../aide/GUIDE_REDACTION.md)
- [i18n.md](../i18n.md) : le français comme clé de traduction
- [ADR-004](ADR-004-assistant-ia-immocopilot.md) : ImmoCopilot reçoit le `helpId`
  et un extrait de la fiche affichée (`specs/022-assistant-ia-immocopilot/spec.md`)
- `apps/web/src/help/registry.ts`, `apps/web/src/help/content/index.ts`,
  `apps/web/src/help/types.ts`
- `apps/web/scripts/help-coverage.mjs`
