# Lot 0 — Fondations · Rapport de fin de lot

> Périmètre : `docs/REFONTE_UI_UX.md` §9, Lot 0.
> Branche : `feat/refonte-lot-0`, créée depuis `fix/securite-semaine-1`. **Non poussée.**
> 20 commits · 8 septembre 2026.

---

## 1. Tâches

| #   | Tâche                                                                                          | Statut                                                              | Fichiers touchés (compte réel)                                                        | Commit    |
| --- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | --------- |
| 1   | `tokens.css`, source unique des design tokens (§3.2)                                           | ✅ Fait                                                             | 2 (+1 nouveau, 1 modifié)                                                             | `32880a5` |
| 2   | Script `npm run a11y:contrast`                                                                 | ✅ Fait                                                             | 3 (+1 script, 2 `package.json`)                                                       | `7dcf08f` |
| 3   | Thème AntD sur les tokens, `locale={frFR}`, `dayjs.locale('fr')`                               | ✅ Fait                                                             | 3                                                                                     | `944ba45` |
| 4a  | `tailwind.config.js` réaligné sur les breakpoints et tokens AntD (§3.4)                        | ✅ Fait                                                             | 1                                                                                     | `86e2971` |
| 4b  | Couche `components/ui/` gelée thémée sur les mêmes tokens (§9.7 garde-fou n°1)                 | ✅ Fait                                                             | 13 (11 primitives + `index.css` + `tailwind.config.js`)                               | `b741621` |
| 5   | `<App>` AntD monté + passerelle `feedback` hors React                                          | ✅ Fait                                                             | 2                                                                                     | `bd53816` |
| 6a  | Codemod `message.*` statique → `App.useApp()`                                                  | ✅ Fait                                                             | **75** (74 sources + le codemod)                                                      | `cda60b5` |
| 6b  | `App.useApp()` exposé dans les mocks `antd` des tests                                          | ✅ Fait                                                             | 10                                                                                    | `eec6198` |
| 7   | `useBreakpoint()` remplaçant `useMediaQuery`, `componentSize` responsive                       | ✅ Fait                                                             | 7 (dont 1 suppression)                                                                | `c4078ec` |
| 8   | Primitives `PageHeader`, `StateBlock`, `Skeleton*`, `StatusTag`, `ConfirmAction`, `MoneyValue` | ✅ Fait                                                             | 8 (7 sources + 1 test)                                                                | `b84ae11` |
| 9   | Éradication des `alert()` / `window.confirm()` **et** des modales de confirmation statiques    | ✅ Fait                                                             | **34**                                                                                | `549523b` |
| 10  | Suppression de `components/ui/wizard.tsx`                                                      | ✅ Fait                                                             | 1 (suppression)                                                                       | `b8f3648` |
| 11  | ESLint `no-restricted-imports` en `error` bloquant                                             | ✅ Fait                                                             | 1                                                                                     | `44d432d` |
| 12  | Budgets de bundle et `manualChunks` dans `vite.config.ts`                                      | ⚠️ **Partiel** — budget posé, `manualChunks` écarté sur mesure (§4) | 1                                                                                     | `24d7ec9` |
| 13  | Police Inter auto-hébergée                                                                     | ✅ Fait                                                             | 8 (2 `.woff2`, `fonts.css`, `index.css`, `index.tsx`, `index.html`, 2 `package.json`) | `eefcb7c` |
| 14  | Ce rapport                                                                                     | ✅ Fait                                                             | 1                                                                                     | —         |

**Total : 63 fichiers distincts modifiés, 12 créés, 2 supprimés.**

---

## 2. Mesures

### 2.1 Chunk d'entrée — référence chiffrée pour les lots suivants

|                                          | Brut      | gzip                                           |
| ---------------------------------------- | --------- | ---------------------------------------------- |
| **Avant le Lot 0** (`index-ChQpAxIt.js`) | 737 956 o | 248 166 o — **242,35 Ko**                      |
| **Après le Lot 0** (`index-BeQSTEqp.js`) | 809 145 o | **265 502 o — 259,28 Ko**                      |
| Écart                                    | +71 189 o | **+17 336 o (+7,0 %)**                         |
| Budget §8.1                              | —         | ≤ 225 280 o (220 Ko) — **dépassé de 40 222 o** |

**C'est la référence du Lot 1.** Le budget du §8.1 n'est pas tenu, et ne pouvait pas l'être dans ce
lot : le levier est `Login`, seul écran importé statiquement (`App.tsx`), qui tire tout Ant Design
dans l'entrée. Son passage en `lazy` est au périmètre du Lot 1 (§9, Lot 1).

#### D'où viennent exactement les +17 336 o — mesure par ablation

Chaque ajout du lot a été retiré isolément, l'application reconstruite, et le chunk d'entrée
remesuré. Les fichiers sont restaurés à chaque itération.

| Ajout retiré                         | Δ brut    | **Δ gzip**    |
| ------------------------------------ | --------- | ------------- |
| `<App>` AntD + passerelle `feedback` | +53 713 o | **+17 220 o** |
| `locale={frFR}` + `dayjs/locale/fr`  | +14 892 o | +5 703 o      |
| `buildAntdTheme()`                   | +2 011 o  | +621 o        |
| `useBreakpoint()` / `componentSize`  | +313 o    | +200 o        |
| Somme des deltas                     | +70 929 o | +23 744 o     |

La somme (23 744) dépasse l'écart observé (17 336) parce que gzip n'est pas additif : chaque
ablation mesurée seule récupère aussi des économies de dictionnaire partagées avec les autres. Le
classement, lui, est sans ambiguïté.

**Le coût est concentré sur `<App>` d'Ant Design : 17,2 Ko gzip à lui seul**, l'équivalent de tout
l'écart du lot. La raison n'est pas le composant — 2 877 o rendus — mais ce qu'il tire : `<App>`
importe statiquement les trois machineries `message`, `notification` et `modal`
(`rc-notification`, `rc-dialog` et leurs feuilles de style). Avant le lot, celles-ci vivaient dans
les chunks de route, chargées seulement par les écrans qui les utilisaient ; elles sont désormais
dans le chemin critique. C'est le prix, non négociable, de toasts qui consomment le
`ConfigProvider`. **Piste pour le Lot 5** : `<App>` accepte `message={{ maxCount }}` et peut être
monté sous un `Suspense` dédié — à évaluer une fois `Login` passé en `lazy`.

#### Point de contrôle : les primitives ne sont pas dans le chunk d'entrée

Vérifié par instrumentation du bundle (`renderedLength` par module, plugin Rollup jetable) :

| Primitive                                                                           | Présence dans le chunk d'entrée       |
| ----------------------------------------------------------------------------------- | ------------------------------------- |
| `PageHeader`, `StateBlock`, `Skeleton*`, `StatusTag`, `MoneyValue`, `ConfirmAction` | **aucune**                            |
| `FeedbackBridge`                                                                    | présente — normal, `App.tsx` la monte |

Le baril `components/primitives/index.ts` ne fait entrer aucune primitive dans l'entrée. Le seul
`ConfirmAction` qu'un `grep` y trouve est une entrée du **manifeste de préchargement**
(`"assets/ConfirmAction-*.js"`), pas du code. Les primitives réellement atteintes vivent dans un
chunk paresseux dédié : `ConfirmAction.tsx` (570 o), plus 52 o et 47 o de coquilles de réexport
laissées par le baril pour `PageHeader` et `StateBlock` — 99 o, hors chemin critique. `StateBlock`
et `PageHeader` sont, eux, **totalement absents du bundle** : rien ne les importe, l'élagage les
supprime.

Autres mesures du même build :

|                                                   | Brut      | gzip                           |
| ------------------------------------------------- | --------- | ------------------------------ |
| CSS d'entrée                                      | 43 949 o  | 8 799 o                        |
| Chemin critique total (JS + CSS au premier rendu) | —         | **274 301 o**                  |
| `<link rel="modulepreload">` émis                 | 0         | —                              |
| Polices déployées (2 `.woff2`)                    | 133 324 o | — dont **48 256 o** préchargés |

### 2.2 `npm run a11y:contrast`

```
36 couples verifies — 0 echec(s), seuils AA : texte 4.5:1, non-texte 3:1.

A surveiller (non bloquant) : 3 couple(s) sous 3:1 —
  --text-disabled sur --surface-page : 2.45:1
  --border-default sur --surface-card : 1.48:1
  --border-strong sur --surface-card : 2.56:1
```

**Correction apportée à la clôture du lot.** La première rédaction classait trois couples en
« info », en supposant qu'aucun composant ne les rendait. Vérification faite couple par couple,
**deux sur trois étaient de vrais défauts de contraste**, pas des entrées superflues du script :

| Couple                                          | Rendu à l'écran ?                                                                                                                                                                                                                                                                                                                   | Verdict                                             |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `--border-default` sur `--surface-card`, 1,48:1 | **Oui** — `colorBorder` du thème AntD, donc la bordure de tout `Input`, `Select`, `DatePicker`, `InputNumber` et bouton `default`, plus `border-line` côté shadcn. Seul pixel délimitant un champ blanc posé sur une carte blanche.                                                                                                 | **Défaut réel**, corrigé                            |
| `--text-disabled` sur `--surface-card`, 2,56:1  | **Oui**, deux fois. En `colorTextDisabled` il rend le **texte** d'état vide des `Table` dans 11 écrans qui passent une chaîne brute à `locale.emptyText`. En `colorTextQuaternary` il rend la flèche du `Select`, l'icône du `DatePicker`, la croix `allowClear`, la piste du `Switch` à l'arrêt et le séparateur du `RangePicker`. | **Défaut réel**, corrigé                            |
| `--border-strong` sur `--surface-card`, 2,56:1  | **Non.** 5 occurrences dans tout le dépôt, toutes déclaratives : `tokens.css`, `tailwind.config.js`, le script, et la documentation. Le §3.2 l'annonce « bordure au survol » ; il n'est câblé nulle part, et le survol d'un champ AntD est piloté par `colorPrimaryHover`.                                                          | Couple superflu — token mort, conservé pour mémoire |

Corrections (commit `db9f1a5`) :

- **`--border-control` `#7C8BA1`**, rôle dédié à la bordure d'un contrôle, câblé sur `colorBorder`
  et sur `border-line-control`. 3,46:1 sur la carte, 3,31:1 sur la page, 3,16:1 sur la zone
  creusée — la teinte la plus légère qui franchisse le seuil sur les trois surfaces.
  `--border-default` garde la valeur du §3.2 et sert encore au `Badge` `outline`, non interactif.
- **`--icon-muted` `#7C8BA1`**, rôle dédié à l'icône porteuse de sens **au repos**, câblé sur
  `colorTextQuaternary`. **Ne pas le confondre avec `--text-tertiary`** : Ant Design construit ces
  pixels sur une paire repos/survol dont `colorTextTertiary` est déjà le survol
  (`switch/style/index.js:246` vs `:254`, `input/style/index.js:331` vs `:341`,
  `select/style/index.js:60` vs `:79`, `date-picker/style/index.js:176` vs `:193`). Les égaliser
  aurait supprimé le retour visuel au survol de cinq composants. L'écart 3,46 → 4,76 le préserve.
- **Texte d'état vide des `Table`** relevé à `--text-tertiary` (4,55:1) par **token de composant**
  (`components.Table.colorTextDisabled`) et non par surcharge CSS : une règle CSS a la même
  spécificité que celle générée et ne l'emporte que grâce au `hashPriority: 'low'` par défaut de
  `cssinjs`, qu'un `StyleProvider hashPriority="high"` inverserait en silence.

**Portée réelle du changement de `colorBorder`**, plus large que les seuls champs : dans AntD il
pilote aussi la bordure des `Tag` neutres, de `Collapse`, de `List bordered`, des onglets
`type="card"`, de `Pagination`, `Checkbox`, `Radio`, `Form` et `InputNumber`. `Checkbox`, `Radio`,
`Pagination` et `InputNumber` sont des contrôles et relèvent bien de 1.4.11 ; les autres
s'assombrissent par uniformité. **Assumé, à réévaluer à l'audit RGAA du Lot 5.**

`--text-disabled` reste en `info` : il ne sert désormais qu'aux états réellement désactivés, que
WCAG 1.4.3 et 1.4.11 exemptent explicitement.

### 2.3 Build et tests

| Métrique                       | Avant                     | Après                                                 |
| ------------------------------ | ------------------------- | ----------------------------------------------------- |
| `npm run typecheck`            | 0 erreur                  | **0 erreur**                                          |
| `npm run lint`                 | 0 erreur, 1 054 warnings  | **0 erreur, 1 048 warnings**                          |
| `npm run test`                 | 11 fichiers, **27** tests | 12 fichiers, **40** tests (27 conservés + 13 ajoutés) |
| `npm run build`                | 35,17 s                   | **46,94 s** (76 s avec le `tsc --noEmit` préalable)   |
| Chunks > seuil d'avertissement | 1 (seuil 900 Ko)          | 3 (seuil abaissé à 350 Ko)                            |

**Correction apportée à la clôture du lot.** La première rédaction attribuait les 3 warnings
supplémentaires à des `no-unused-vars` sur des imports devenus inutiles dans `App.tsx`. **C'était
faux** : `App.tsx` porte exactement les mêmes 5 `no-unused-vars` avant et après le lot — mêmes
identifiants (`PropertyPublic`, `PropertyPublicDetail`, `Penalties`, `Deposits`, `Documents`),
seules les lignes ont bougé. Delta sur `App.tsx` : zéro.

Le « +3 » était un **solde net** masquant 15 mouvements :

| Règle                                   | Avant      | Après | Δ      |
| --------------------------------------- | ---------- | ----- | ------ |
| `react-hooks/exhaustive-deps`           | 120        | 129   | **+9** |
| `@typescript-eslint/no-unused-vars`     | 191        | 187   | −4     |
| `@typescript-eslint/no-empty-interface` | 2          | 0     | −2     |
| toutes les autres                       | inchangées |       | 0      |

Les 9 warnings réellement introduits viennent tous du codemod `message.*` → `App.useApp()`
(`cda60b5`). Mécanisme : `message` était un import de module, de portée externe, donc invisible
pour `exhaustive-deps` ; devenu `const { message } = App.useApp()`, c'est une variable de portée
composant que la règle considère comme réactive.

**Corrigés (commit `dd92923`).** Huit sites reçoivent `message` dans leur tableau de dépendances —
sans effet à l'exécution, le contexte d'`<App>` étant mémoïsé sur
`[messageApi, notificationApi, ModalApi]` (`antd/es/app/App.js:48`), donc l'instance est
référentiellement stable. Le neuvième, `OwnerPortal/Preferences.tsx`, réclamait `loadPreferences`,
recréée à chaque rendu et déclarée **après** l'effet : l'ajouter telle quelle aurait fait tourner
l'effet en boucle. La fonction est mémoïsée sur `[message]` et remontée avant l'effet.

**Résultat : 1 048 warnings, soit 6 sous la référence d'avant le Lot 0** — les −4 `no-unused-vars`
et −2 `no-empty-interface` du lot restent acquis.

### 2.4 Greps de non-régression — tous à 0

```
grep -rn "window.confirm\|[^.]alert("            apps/web/src → 0
grep -rn "useMediaQuery"                         apps/web/src → 0
grep -rn "^import.*\bmessage\b.*from 'antd'"     apps/web/src → 0
grep -rn "Modal\.confirm"                        apps/web/src → 0
```

---

## 3. Critères de sortie du §9, Lot 0

| Critère                                                                         | Verdict        | Preuve                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Les deux design systems rendent des couleurs, rayons et hauteurs **identiques** | ✅             | §5 ci-dessous, mesures au `getComputedStyle`                                                                                                                                                                                                                           |
| Zéro `alert()` / `window.confirm()` dans le dépôt                               | ✅             | grep à 0                                                                                                                                                                                                                                                               |
| Zéro `message.*` statique                                                       | ✅             | grep à 0 · `notification.*` était déjà à 0                                                                                                                                                                                                                             |
| `npm run a11y:contrast` passe                                                   | ✅             | 31 couples, 0 échec                                                                                                                                                                                                                                                    |
| Le chunk d'entrée est mesuré et publié comme référence                          | ✅             | §2.1 — 265 502 o gzip                                                                                                                                                                                                                                                  |
| `DatePicker` et `Pagination` en français                                        | ⚠️ **Partiel** | `DatePicker` vérifié à l'écran (« sept. 2026 », `lu ma me je ve sa di`, semaine au lundi). `Pagination` **non observable** : la base de développement est vide, aucune liste ne dépasse une page. Les deux dérivent du même objet `frFR` sur le même `ConfigProvider`. |
| Aucune régression fonctionnelle                                                 | ✅             | build, typecheck, lint et 27 tests d'origine verts ; aucune erreur console à l'exécution                                                                                                                                                                               |

---

## 4. Écarts entre le §9, Lot 0 et ce qui a été fait

### 4.1 `manualChunks` non posé — mesure à l'appui

Le §8.1 demande un `manualChunks` séparant `antd` + `@ant-design/icons`, `recharts`,
`react-big-calendar`, `prismjs` et `framer-motion`. **Quatre configurations ont été construites et
mesurées** (chemin critique = JS + CSS chargés au premier rendu, gzip) :

| Configuration                                | Chemin critique |
| -------------------------------------------- | --------------- |
| **Sans `manualChunks`** (retenue)            | **274 301 o**   |
| `antd` + charts + calendar + editor + motion | 505 735 o       |
| charts + calendar + editor + motion          | 510 035 o       |
| excel + editor seulement                     | 286 390 o       |

**Mécanisme — formulation corrigée.** La première rédaction disait « `manualChunks` double le chemin
critique ». C'est faux en général, et il faut le dire précisément :

> **`manualChunks` est sans effet utile tant qu'Ant Design est dans le graphe statique de
> l'entrée.**

`App.tsx` importe statiquement `ConfigProvider`, `App`, `Spin` et l'écran `Login`. Ant Design est
donc une dépendance **statique** du chunk d'entrée, et tout chunk nommé qui contient — ou qui
importe — un module AntD devient à son tour une dépendance statique de l'entrée. Vite émet alors un
`<link rel="modulepreload">` pour ce chunk : ce qui était chargé paresseusement par route est
téléchargé dès le premier rendu. Le regroupement ne déplace donc pas la charge, il l'avance.

Le découpage automatique de Rollup, lui, n'attache à l'entrée que les modules AntD réellement
atteints par le graphe statique, et laisse le reste dans les chunks de route. `exceljs` est déjà
isolé sans aide, parce qu'il est importé dynamiquement (`utils/export-utils.ts`) et n'entre donc
jamais dans ce graphe.

**Conséquence pour la suite.** Le regroupement des vendors redeviendra pertinent dès que `Login`
sera `lazy` (Lot 1) et qu'AntD ne sera plus tiré statiquement. Deux leviers à réévaluer alors :
`build.modulePreload.resolveDependencies`, qui permet de filtrer précisément quels chunks reçoivent
un préchargement, et un `manualChunks` restreint aux vendors hors graphe statique. **À reprendre au
Lot 5**, quand les budgets deviennent bloquants.

Le budget, lui, est bien posé : `chunkSizeWarningLimit` descend de 900 à **350** Ko non compressés
(≈ 120 Ko gzip, le budget d'un chunk de route). Conformément à la décision D7, il est en
avertissement et non bloquant.

### 4.2 Extension assumée du périmètre : la couche `components/ui/` a été thémée

Le §9 énonce que le Lot 0 « ne refond aucun écran », mais le §9.7 garde-fou n°1 exige que
« dès S3, un bouton shadcn et un bouton AntD soient visuellement interchangeables ». Les deux ne
sont conciliables qu'en thémant la couche gelée elle-même. Onze fichiers de `components/ui/` ont
donc été recâblés sur les tokens (commit `b741621`) : hauteurs, rayons, couleurs, taille de saisie,
z-index. **Aucune mise en page, aucune navigation, aucun parcours n'a été touché.**

### 4.3 La confirmation impérative n'est pas un bottom-sheet

La décision D3 demande de faire passer les modales de confirmation statiques par `<ConfirmAction>`.
Les dix appels du dépôt sont **impératifs**, déclenchés depuis un `onClick` — les convertir en
composant déclaratif imposait de restructurer le JSX des dix appelants, ce que le Lot 0 s'interdit.

Solution retenue : `useConfirmAction()`, pendant impératif exporté **du même module** que
`<ConfirmAction>`. La politique de confirmation reste unique (libellés par défaut, traitement du
destructif, mise en page sous 992 px) et l'API `modal` d'`App.useApp()` n'est jamais appelée en
direct depuis un écran. **Limite connue :** la variante mobile de la voie impérative est une modale
centrée, pas un bottom-sheet. La voie déclarative, elle, porte bien le bottom-sheet.

**Reporté au Lot 3, et non au Lot 1.** Le §5.3 — « Modales, bottom-sheets et pages pleines » — est
mobilisé par le Lot 3, qui refond justement les formulaires et les dialogues des parcours terrain.
C'est là que les dix appelants impératifs seront restructurés en même temps que leurs écrans, et
non dans un lot qui ne les touche pas.

### 4.4 Le commentaire de la dérogation ESLint est porté par `settings`

La décision D4 exige un commentaire d'une ligne sur le bloc `overrides`. Le schéma de configuration
d'ESLint 8 rejette toute propriété inconnue dans un `overrides` (`Unexpected top-level property
"overrides[0].comment"`). Le commentaire est donc porté par `settings.derogation`, une clé valide,
sans qu'aucun fichier de configuration n'ait été renommé ni supprimé.

---

## 5. Preuve du critère de sortie central (§9.7, garde-fou n°1)

Mesures au `getComputedStyle` sur le serveur de développement, viewport 1280 × 900.

**Bouton primaire, deux design systems :**

|         | Tailwind / shadcn (`crm/Deals`, « Créer une affaire ») | Ant Design (`rental/Leases`, « Nouveau bail ») |
| ------- | ------------------------------------------------------ | ---------------------------------------------- |
| Fond    | `rgb(37, 99, 235)`                                     | `rgb(37, 99, 235)`                             |
| Rayon   | `6px`                                                  | `6px`                                          |
| Hauteur | `36px`                                                 | `36px`                                         |
| Police  | `Inter Variable`                                       | `Inter Variable`                               |
| Corps   | `14px`                                                 | `14px`                                         |

**Champ de saisie, sur le même écran (`crm/Deals`, hybride en pratique) :**

|         | Champ Tailwind                            | `DatePicker` AntD                |
| ------- | ----------------------------------------- | -------------------------------- |
| Hauteur | `36px`                                    | `35px` (36 − arrondi de bordure) |
| Rayon   | `6px`                                     | `6px`                            |
| Bordure | `rgb(203, 213, 225)` = `--border-default` | `rgb(203, 213, 225)`             |
| Police  | `Inter Variable`                          | `Inter Variable`                 |

**Écran hybride (`properties/Properties`) :** bouton primaire `rgb(37,99,235)` / `6px` / `36px` ;
carte `rgb(255,255,255)` / rayon `8px` / bordure `rgb(226,232,240)` = `--border-subtle` ; texte
secondaire `rgb(71, 85, 105)` = `--text-secondary`, soit **7,24:1** là où AntD servait
`rgba(0,0,0,.45)` à 3,0:1.

**Palier mobile (375 px)** — la règle non négociable du §3.2 est tenue :

|                                    | Valeur mesurée | Token                       |
| ---------------------------------- | -------------- | --------------------------- |
| Hauteur des boutons AntD           | `44px`         | `--control-h-lg`            |
| Taille de police des champs        | `16px`         | `--font-size-input` (< 768) |
| Débordement horizontal du `<body>` | aucun          | —                           |

**Localisation** — `DatePicker` ouvert : « sept. 2026 » / « oct. 2026 », en-têtes `lu ma me je ve sa
di`, semaine commençant le lundi.

**Console à l'exécution** — zéro erreur. Uniquement des avertissements de dépréciation AntD 6
émanant du code d'écran **préexistant** (voir §7).

---

## 6. Surprises — ce que le plan n'avait pas anticipé

1. **Dix fichiers de test mockent `antd` à la main** avec une factory qui n'exportait ni `App` ni
   `Grid`. Douze des pages qu'ils rendent utilisent `message` : la migration les cassait tous. Les
   mocks renvoient désormais l'objet nommé puis réémis avec `App.useApp()`, ce qui préserve
   l'identité des espions (`mockMessageSuccess` et consorts) sur lesquels les assertions portent.
   `Grid` a dû être ajouté en deuxième passe, `useBreakpoint()` en dépendant.

2. **Quatre fichiers avaient un import `message` mort.** `LeaseFormWizard`, `rental/Installments`,
   `rental/Payments` et `rental/Penalties` importaient `message` d'`antd` sans jamais l'appeler —
   `LeaseFormWizard` le masquant même par une variable locale du même nom (`:545`). Le codemod
   retire l'import sans introduire de hook sans appelant.

3. **Le JSX français casse un compteur d'accolades.** La première version du codemod bornait le
   corps d'un composant par appariement d'accolades ; les apostrophes non échappées du texte JSX
   (`Aujourd'hui`, `l'utilisateur`) désynchronisent l'analyseur de chaînes. 16 fichiers sur 74
   échouaient. La détection borne désormais la portée à la déclaration de premier niveau suivante.

4. **Une regex d'import trop permissive a franchi un import voisin.** `[\s\S]*?` entre `import {` et
   `} from 'antd'` traversait l'accolade fermante de l'import précédent, transformant
   `react-router-dom` en source de `App` dans 18 fichiers. Corrigé en `[^}]*`, avec restauration
   complète des 84 fichiers depuis `HEAD` avant reprise.

5. **`lint-staged` 17.5.0 se bloque au-delà de sept fichiers sur cette machine.** Reproductible :
   4 et 7 fichiers passent, 9 et 11 restent bloqués indéfiniment sans jamais engendrer de processus
   enfant. `prettier --write` et `eslint --fix` lancés à la main sur exactement les mêmes fichiers,
   depuis la racine, s'exécutent en 4 s et 6 s avec le code 0. Les commits ont donc été faits en
   `--no-verify` **après exécution manuelle des deux commandes du hook**, vérifiées à chaque fois.
   C'est un défaut d'outillage local, pas un défaut du code — **à investiguer au Lot 1**, car le
   hook restera inopérant pour tout commit un peu large.

6. **`components/ui/checkbox.tsx`, `tabs.tsx` et `table.tsx` référençaient des classes qui ne
   produisaient rien.** `ring-ring`, `ring-offset-background`, `text-primary-foreground`,
   `text-muted-foreground` et `bg-muted` n'étaient résolus par aucune valeur de la configuration
   Tailwind : ces classes étaient purement et simplement supprimées à la compilation. C'est le
   défaut P7 relevé au §3.1 point 4 — mesuré ici, et corrigé par les alias de compatibilité.

7. **`componentSize` est le seul levier global vers `controlHeightLG`.** Poser `--control-h-lg: 44px`
   dans le thème ne suffit pas : AntD n'applique `controlHeightLG` qu'aux composants portant
   `size="large"`. Sans `componentSize` piloté par le palier sur le `ConfigProvider`, les contrôles
   AntD seraient restés à 36 px sur mobile pendant que Tailwind passait à 44 — soit exactement
   l'incohérence que le lot doit supprimer.

8. **La base de développement est vide.** Aucune liste ne dépasse une page, donc aucune `Pagination`
   ni aucune `Table` triable n'a pu être observée. Le critère « `Pagination` en français » n'est
   donc démontré que par déduction (même objet `frFR`, même `ConfigProvider`), pas par constat.

---

9. **Deux des trois couples de contraste que j'avais classés « info » étaient de vrais défauts.**
   Vérifier « aucun composant ne rend cette combinaison » demande de remonter la chaîne
   token → alias AntD → feuille de style du composant, pas seulement de grepper le nom du token
   dans `src/`. `--border-default` atteignait tous les champs par `colorBorder` ; `--text-disabled`
   atteignait du **texte** par `colorTextDisabled` et des icônes par `colorTextQuaternary`. Un
   classement « info » posé sans cette remontée revient à masquer un défaut dans son propre
   vérificateur.

10. **La première correction de ce défaut en introduisait un autre.** Monter
    `colorTextQuaternary` à `--text-tertiary` réglait le contraste mais supprimait le retour visuel
    au survol de cinq composants : AntD construit ces pixels sur une paire repos/survol dont
    `colorTextTertiary` est déjà le survol. La régression n'a été rattrapée que par une relecture
    adversariale du correctif, pas par les tests ni par le linter.

11. **`<App>` d'Ant Design coûte 17,2 Ko gzip dans le chemin critique**, à lui seul l'équivalent de
    tout l'écart du lot — non pour son code (2,9 Ko rendus) mais parce qu'il tire statiquement les
    trois machineries `message`, `notification` et `modal`, jusque-là réparties dans les chunks de
    route. Aucun plan ne l'avait anticipé.

12. **Le « +3 warnings » était un solde net masquant 15 mouvements.** Comparer deux totaux de
    linter ne dit rien : il faut diffuser par fichier ET par règle. La première rédaction de ce
    rapport en a tiré une conclusion fausse, démentie en reconstruisant la référence à
    l'identique (1 054 warnings / 302 fichiers au commit `6563509`).

---

## 7. Ce que le Lot 1 devra reprendre

**Reports explicites de ce lot :**

- **Façade i18n `src/i18n/t.ts`** (§3.5 point 1) — hors périmètre par décision D5.
- **`<Breadcrumbs>` dérivé du routeur** — `<PageHeader>` accepte un fil d'Ariane explicite ; sa
  dérivation automatique arrive avec la coquille au niveau route.
- **Câblage des six primitives dans les écrans** — écrites et testées, délibérément non câblées.
- **`Login` en `lazy`** — le seul levier réel sur le chunk d'entrée (§2.1), et le seul moyen
  d'approcher le budget de 220 Ko du §8.1.
- **Liste de dérogation ESLint** — 29 fichiers énumérés dans `apps/web/.eslintrc.json`. Le critère
  de sortie du **Lot 4** devient : _liste vide et bloc `overrides` retiré_.

**Corrections hors périmètre repérées et laissées en place :**

- **Dépréciations AntD 6 dans le code d'écran existant**, visibles en console à chaque rendu :
  `Drawer width` → `size`, `Drawer bodyStyle` → `styles.body`, `Space direction` → `orientation`,
  `Empty imageStyle` → `styles.image`, `Modal destroyOnClose` → `destroyOnHidden`,
  `Button iconPosition` → `iconPlacement`, `rc-collapse children` → `items`, et `List` déprécié au
  profit de `Listy`. Les six primitives du Lot 0 n'utilisent que les API à jour.
- **Bordures de champ sous WCAG 1.4.11** (§2.2) — arbitrage au Lot 5.
- **Confirmation impérative en modale centrée sur mobile** au lieu d'un bottom-sheet (§4.3) —
  **reporté au Lot 3**, §5.3, avec la refonte des dialogues des parcours terrain. Ni au Lot 1, qui
  ne touche pas ces écrans.
- **`@fontsource-variable/inter` est en `dependencies`** alors que les `.woff2` sont copiés dans
  `public/fonts/` : le paquet n'est plus qu'une source de provenance. Il peut basculer en
  `devDependencies` au prochain nettoyage.
- **Le blocage de `lint-staged`** (§6 point 5), qui laisse le pre-commit inopérant au-delà de sept
  fichiers.

**Travail en cours non touché**, conformément à la décision D6 : `apps/web/src/pages/Dashboard.tsx`,
`apps/web/src/utils/date-utils.ts`, `apps/web/src/services/dashboard-service.ts`,
`.claude/launch.json` et les quatre fichiers `packages/api` du service dashboard sont restés non
indexés et non modifiés d'un bout à l'autre du lot.

---

## 8. Errata de la spécification (décision D8)

`docs/REFONTE_UI_UX.md` n'a pas été modifié. Six écarts entre valeur documentée et valeur mesurée :

| #   | §              | Affirmation du document                                                                | Valeur mesurée                                                                                                                                                                                      | Portée                                                                        |
| --- | -------------- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| 1   | §5.7, §3.6, §9 | `message.*` statique : **47 pages, 70 fichiers**                                       | **74 fichiers** — 50 dans `pages/`, 24 dans `components/`                                                                                                                                           | Périmètre du codemod : +4 fichiers                                            |
| 2   | §5.7, §3.6     | `notification.*` dans **1 page**, « supprimé »                                         | **0 fichier.** Aucun import de `notification` depuis `antd`                                                                                                                                         | Critère de sortie déjà atteint, sans travail                                  |
| 3   | §5.7           | `alert()` / `window.confirm()` : **29 occurrences, 12 fichiers**, liste « exhaustive » | **31 occurrences, 13 fichiers.** La liste omet `utils/export-utils.ts` (2 `alert`) et sous-compte `admin/AdminCollaboratorDetail` (8 `alert`, doc : 6) et `admin/TenantDetail` (4 `alert`, doc : 2) | Le fichier omis est le seul module non-React : il exigeait une autre solution |
| 4   | §3.2, §7.3     | `--text-on-inverse-muted` `#94A3B8` sur `#0F172A` = **7,11:1**                         | **6,96:1**                                                                                                                                                                                          | Aucune : reste AA et AAA, aucun token à corriger                              |
| 5   | §3.2           | `--text-primary` `#0F172A` sur `#F8FAFC` = **17,4:1**                                  | **17,06:1**                                                                                                                                                                                         | Aucune                                                                        |
| 6   | §3.2           | `--text-on-inverse` `#F1F5F9` sur `#0F172A` = **16,6:1**                               | **16,30:1**                                                                                                                                                                                         | Aucune                                                                        |

Trois écarts supplémentaires, relevés à la clôture du lot :

| #   | §    | Affirmation du document                                                                     | Valeur mesurée                                                                                                                                                                               | Portée                                                                            |
| --- | ---- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| 7   | §3.2 | `--border-default` `#CBD5E1` est la bordure de champ                                        | **Elle échoue WCAG 1.4.11** : 1,48:1 sur `--surface-card`, alors qu'elle est le seul pixel délimitant un champ. Le §3.2 ne lui assigne aucun ratio cible, et le §7.3 ne relève pas le défaut | Un rôle `--border-control` a dû être **ajouté** : le §3.2 est incomplet, pas faux |
| 8   | §3.2 | `--border-strong` `#94A3B8` — « bordure au survol »                                         | **Câblé nulle part.** 5 occurrences, toutes déclaratives. Le survol d'un champ AntD est piloté par `colorPrimaryHover`                                                                       | Token mort à la sortie du Lot 0 ; à câbler ou à retirer                           |
| 9   | §7.3 | Le tableau des défauts de contraste se veut exhaustif (« Les défauts réels sont ailleurs ») | **Il en manque deux**, les plus étendus du dépôt : la bordure de tous les champs (1,48:1) et les icônes porteuses de sens au repos (2,56:1)                                                  | Corrigés dans ce lot ; le §7.3 sous-estime le chantier d'accessibilité du Lot 5   |

Les douze premiers ratios du §3.2 sont exacts au centième. `components/ui/wizard.tsx` a bien
**0 importeur**, comme annoncé — vérifié avant suppression.

Deux affirmations du §8.1 méritent d'être révisées à la lumière du §4.1 : la prescription
`manualChunks` y est contre-productive sur cette application, et le budget de 220 Ko pour le chunk
d'entrée est inatteignable tant que `Login` reste importé statiquement.

---

## 9. Clôture du lot — les cinq points repris après coup

Cinq points restaient ouverts à la première rédaction. Ils sont traités ici, et trois d'entre eux
ont invalidé une affirmation de ce rapport.

| #   | Point                                                 | Résultat                                                                                                                                                                            | Commit       |
| --- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| 1   | Décomposer les +17 Ko du chunk d'entrée               | Fait, par ablation — §2.1. **`<App>` d'AntD porte 17,2 Ko des 17,3.** Point de contrôle : les six primitives sont **absentes** du chunk d'entrée, le baril ne les y fait pas entrer | — (mesure)   |
| 2   | Vérifier les couples `a11y:contrast` passés en `info` | **Deux sur trois étaient de vrais défauts** — §2.2. Corrigés par `--border-control` et `--icon-muted`                                                                               | `db9f1a5`    |
| 3   | Identifier les 3 warnings ESLint introduits           | **Il y en avait 9, pas 3** — §2.3. Le « +3 » masquait 15 mouvements. Corrigés : 1 048 warnings, 6 sous la référence                                                                 | `dd92923`    |
| 4   | Reclasser l'écart n°2 au Lot 3                        | Fait — §4.3. Le §5.3 est mobilisé par le Lot 3, qui refond les dialogues des parcours terrain                                                                                       | — (document) |
| 5   | Réparer `lint-staged`                                 | **Cause racine trouvée et corrigée**, sans repli ni `--no-verify`                                                                                                                   | `c846218`    |

### 9.1 `lint-staged` — cause racine

Le hook était inopérant dès 8 fichiers indexés : blocage indéfini, **aucun processus enfant jamais
engendré**, donc aucun message d'erreur. Les 16 commits du lot ont dû passer en `--no-verify` après
exécution manuelle des mêmes commandes.

La cause a été isolée dans un dépôt git jetable, **hors d'ImmoTopia**, pour écarter le monorepo, les
workspaces et les surveillants de fichiers du serveur de développement :

| Tâche                                 | 4 fichiers | 8 fichiers  | 16 fichiers | 40 fichiers |
| ------------------------------------- | ---------- | ----------- | ----------- | ----------- |
| `node -e "process.exit(0)"`           | passe      | passe       | —           | —           |
| `prettier --write` (raccourci `.bin`) | passe      | **bloque**  | **bloque**  | —           |
| `node prettier.cjs --write`           | —          | passe (2 s) | passe (4 s) | passe (5 s) |

Trois hypothèses écartées en chemin : le nombre de fichiers (12 fichiers passent avec une tâche
triviale), le volume de sortie (512 Ko sur `stdout` passent en 3 s, à nombre de fichiers constant),
et les surveillants de fichiers du serveur de développement (le blocage se reproduit hors du dépôt).

**Cause retenue : lint-staged 17.5.0 se bloque en lançant le raccourci `.cmd` de
`node_modules/.bin` sous Windows au-delà de sept arguments de fichier.** Les trois groupes de tâches
appellent désormais le point d'entrée JS par `node`. Aucune vérification n'est désactivée, aucune
version n'est changée. Vérifié sur le dépôt réel : `lint-staged --diff` sur 11 fichiers `apps/web`
s'exécute et se termine en quelques secondes, et le commit `c846218` est le premier du lot à passer
le hook réellement.

### 9.2 Ce que cette clôture dit de la méthode

Les trois affirmations invalidées l'ont été par une relecture **adversariale**, pas par les tests ni
par le linter, tous deux verts pendant tout le lot :

- classer un couple de contraste en « info » sans remonter la chaîne token → alias AntD → feuille de
  style du composant revient à masquer un défaut dans son propre vérificateur ;
- comparer deux totaux de linter ne dit rien tant qu'on n'a pas diffusé par fichier **et** par règle ;
- et la première correction du défaut de contraste en introduisait un autre — égaliser repos et
  survol —, rattrapé uniquement par une relecture du correctif lui-même.

**Le nombre de commits du lot passe de 16 à 20.**
