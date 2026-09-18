# ImmoTopia — Plan de refonte UI/UX mobile-first

> Document de conception et d'exécution. Il tranche, chiffre et découpe. Il ne modifie aucun code.
> Base vérifiée : `apps/web` (113 pages, 121 composants), `packages/api` (23 fichiers de routes, `prisma/schema.prisma` 3 817 lignes).
> Toute affirmation sur l'existant est citée en `chemin/fichier:ligne`. Les points non vérifiés sont signalés comme tels.

**Corrections apportées à `docs/UI_UX_OVERVIEW.md`** (vérifiées dans le code, à reporter dans l'état des lieux) :

| Overview                                                                | Réalité vérifiée                                                                                                                                                                                                                                                          |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| « Ant Design 5 »                                                        | **Ant Design 6.6.3** (`apps/web/package.json:32` → `"antd": "^6.2.0"`, résolu en 6.6.3). Change la stratégie de theming et impose `App.useApp()`.                                                                                                                         |
| « deux bleus en conflit »                                               | **Trois** : `#3b82f6` (`tailwind.config.js:15`), `#1677ff` (seed AntD 6, `node_modules/antd/lib/theme/themes/seed.js:29`), `#1890ff` codé en dur dans les 4 coquilles (`header.tsx:144`, `sidebar.tsx:585`, `TenantPortal/Layout.tsx:111`, `OwnerPortal/Layout.tsx:128`). |
| « `window.confirm()`/`alert()` dans 6 fichiers »                        | **12 fichiers, 29 occurrences** (liste au §5.7).                                                                                                                                                                                                                          |
| « `pages/Properties.tsx` est la route servie au menu public »           | Faux. `App.tsx:12` et `App.tsx:365` font pointer `/properties` vers `pages/properties/Properties.tsx` (la vraie page). `pages/Properties.tsx` **n'est importé nulle part** : c'est un 4ᵉ écran orphelin.                                                                  |
| « 3 écrans orphelins »                                                  | **5** : `PropertyPublic`, `PropertyPublicDetail` (importés `App.tsx:16-17`, sans route), `PropertySearch` (non importé), `pages/Properties.tsx`, `pages/email-notifications/EmailNotificationsPage.tsx`.                                                                  |
| « 10 `aria-label` »                                                     | 11 occurrences. Ordre de grandeur confirmé.                                                                                                                                                                                                                               |
| « `message.*` dans 46 pages »                                           | **47 pages**, et 70 fichiers en comptant `components/`.                                                                                                                                                                                                                   |
| _(non relevé)_                                                          | Les 3 coquilles utilisent des props **dépréciées en AntD 6** : `Drawer` `bodyStyle` (→ `styles.body`) et `width` (→ `size`), `Spin` `tip` (→ `description`). Avertissements en console à chaque rendu.                                                                    |
| _(non relevé)_                                                          | `components/ui/wizard.tsx` (198 l.) n'a **aucun importeur** — code mort.                                                                                                                                                                                                  |
| _(non relevé)_                                                          | `ProtectedRoute` implémente une vérification d'appartenance au tenant, mais `requireTenant` n'est **passé sur aucune route** d'`App.tsx` (§4.1).                                                                                                                          |
| _(non relevé)_                                                          | `App.tsx` n'a **pas de route `path="*"`** : toute URL inconnue affiche une page blanche.                                                                                                                                                                                  |
| « contrastes `slate-600`/`slate-50` et `#94a3b8`/`#0f172a` à corriger » | **Mesurés : 7,25:1 et 7,11:1. Les deux passent AA et AAA.** Faux positifs — les vrais défauts de contraste sont ailleurs (§7.3).                                                                                                                                          |
| « point de rupture unique 1024 px »                                     | Confirmé pour la coquille (`useMediaQuery('(min-width: 1024px)')`), **mais** la grille AntD bascule en `lg` à **992 px** (`node_modules/antd/lib/theme/util/alias.js:37`). Zone morte 992–1023 px décrite au §3.4.                                                        |

---

## 1. Synthèse exécutive

**Le problème.** ImmoTopia est un back-office desktop dense servi tel quel à des collaborateurs qui travaillent sur le terrain, sur Android d'entrée de gamme et en 3G. 55 fichiers reposent sur un `Table`, la coquille ne connaît qu'un seul point de rupture (1024 px) désaligné de la grille AntD (992 px), deux design systems se disputent les mêmes écrans avec trois bleus concurrents, et la couche de primitives maison est partiellement cassée (`components/ui/table.tsx:59` utilise `text-muted-foreground`, une classe qui n'existe pas dans `tailwind.config.js`). Le portail locataire — usage 100 % mobile — hérite d'un shell de 256 px de sidebar et d'un padding fixe de 24 px (`TenantPortal/Layout.tsx:251`). Enfin, l'application n'a ni cache, ni déduplication de requêtes, ni service worker : elle est structurellement inutilisable en réseau dégradé.

**La cible.** Un design system unique (Ant Design 6 thémé par tokens, Tailwind réduit à la mise en page), quatre coquilles ramenées à une, une navigation par persona avec barre d'onglets basse pour les trois profils mobiles, un pattern « tableau → carte » industrialisé sur les 37 pages de liste, des formulaires longs qui deviennent des pages pleines sous 768 px, et une couche de données (TanStack Query + service worker) qui rend les cinq parcours terrain utilisables hors-ligne. Le tout livré en 6 lots sans gel de fonctionnalités et sans rupture des contrats d'API existants.

**Les cinq décisions structurantes**

1. **Ant Design 6 est la cible unique.** Tailwind reste, mais uniquement pour la mise en page (flex, grid, spacing). `components/ui/` est gelé fin de Lot 0 et supprimé fin de Lot 4 (§3.1).
2. **Un seul bleu : `#2563EB`.** Seule valeur qui atteint 4,5:1 sur fond blanc parmi les trois candidats actuels (§3.2).
3. **Les breakpoints s'alignent sur AntD**, pas l'inverse : `sm 576 / md 768 / lg 992 / xl 1200 / xxl 1600`. Tailwind est reconfiguré, `useMediaQuery(1024)` disparaît (§3.4).
4. **La coquille passe au niveau route** (`<Route element={<AppShell/>}>` + `<Outlet/>`), au lieu d'être importée par 81 pages. C'est le préalable à la barre d'onglets basse, au fil d'Ariane et à la conservation du scroll (§4.1).
5. **Sous 768 px, la modale disparaît des formulaires longs** : page pleine pour >3 champs, bottom-sheet pour ≤3 champs et les confirmations. Le module Syndic (8 modales de 3 à 10 champs) est le premier concerné (§5.3).

**Effort global : 128 j-h de développement**, soit ~148 j-h en incluant design, recette et accessibilité. Répartition en 6 lots au §9.

**Les trois risques majeurs**

| Risque                                                                                                                                                           | Impact | Mitigation                                                                                                                                                                                                              |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| L'état intermédiaire est pire que l'existant (deux DS thémés différemment pendant 13 semaines)                                                                   | Élevé  | Le Lot 0 livre des **tokens CSS partagés** consommés à la fois par `tailwind.config.js` et par le `ConfigProvider` AntD : dès S3, les deux systèmes sont visuellement identiques, avant toute migration d'écran (§9.7). |
| Le passage à la coquille au niveau route touche 81 fichiers en une fois                                                                                          | Élevé  | Codemod scripté + `DashboardLayout` conservé en shim no-op pendant un lot, puis retiré. Rollback = revert d'un seul commit (§9.2).                                                                                      |
| `message.*` statique d'AntD ne consomme pas le thème du `ConfigProvider` (47 pages, 70 fichiers) : les toasts resteraient au thème par défaut après tokenisation | Moyen  | Migration vers `App.useApp()` intégrée au Lot 0, pas reportée. C'est une dépendance technique de la tokenisation, pas un confort (§5.7).                                                                                |

---

## 2. Principes de conception

Sept principes. Chacun a une règle vérifiable par un développeur et un contre-exemple tiré du code actuel.

### P1 — Le pouce d'abord

**Règle.** Sous 992 px, l'action primaire d'un écran est atteignable dans les 96 px inférieurs de la fenêtre (barre d'action fixe ou FAB), et toute cible tactile fait au moins 44×44 px CSS.
**Contre-exemple.** `pages/rental/Leases.tsx:210-244` place les trois actions de ligne (voir / modifier / supprimer) en fin d'un `Table` en `scroll={{x:'max-content'}}` (`:365`) : sur 375 px, il faut faire défiler horizontalement toute la ligne pour atteindre le bouton. Le bouton lui-même est un `Button type="link"` AntD, hauteur de contrôle par défaut 32 px (`node_modules/antd/lib/theme/themes/seed.js:64`).

### P2 — Une seule action primaire par écran

**Règle.** Un écran a exactement un bouton `type="primary"`. Tout le reste est `default`, `text` ou relégué dans un menu « … ».
**Contre-exemple.** `pages/properties/PropertyDetail.tsx:204-223` aligne trois boutons textuels de même poids visuel (« Créer campagne newsletter », « Générer un contrat de bail », « Modifier ») dans un `<div style={{display:'flex', justifyContent:'space-between'}}>` sans `flexWrap` ni breakpoint : à 375 px, la ligne déborde.

### P3 — La chrome ne mange pas la donnée

**Règle.** Sous 768 px, le padding horizontal du contenu est de 16 px maximum, et aucune coquille fixe ne consomme de largeur.
**Contre-exemple.** Les deux portails imposent `padding: '24px'` en dur (`pages/TenantPortal/Layout.tsx:251`, `pages/OwnerPortal/Layout.tsx:268`), soit 48 px perdus sur 375 px, alors que le back-office fait déjà correctement `px-4 sm:px-6 lg:px-8` (`components/dashboard/dashboard-layout.tsx:34`). Le portail locataire, le seul usage 100 % mobile, est celui qui a le pire traitement.

### P4 — Un chemin, une action

**Règle.** Une même action métier a une seule implémentation UI, quel que soit le rôle ou l'écran d'entrée.
**Contre-exemples.** (a) Créer un ticket de maintenance : page dédiée avec cascade Propriété→Bail et upload en 1+N appels (`pages/tenant/maintenance/CreateTicket.tsx:44-57`, `:126-136`) côté back-office, contre modale à POST multipart unique côté portail (`components/TenantPortal/MaintenanceTicketModal.tsx:53-58`). (b) Supprimer un ticket : `Popconfirm` dans `components/maintenance/TicketCard.tsx:79-98`, `Modal.confirm` dans `pages/tenant/maintenance/TicketList.tsx:81-100`. (c) Supprimer une entité : `Popconfirm` (13 fichiers), `Modal.confirm` (8 fichiers), `window.confirm` (`pages/rental/Penalties.tsx:232-236`).

### P5 — Le réseau est hostile par défaut

**Règle.** Aucun écran ne déclenche plus de 3 requêtes au montage. Toute liste est paginée côté serveur et filtrée côté serveur. Toute mutation terrain est rejouable.
**Contre-exemple.** `pages/patrimoine/PatrimoineOverviewPage.tsx:36` charge 100 biens, puis `:41-46` lance **une requête `listWorkPrograms` par bien** dans un `Promise.all` : jusqu'à 101 requêtes HTTP au montage d'un seul écran. `pages/patrimoine/work-programs/WorkProgramsPage.tsx:31-38` reproduit le schéma à l'identique, et applique ensuite son filtre de statut en mémoire (`:48`), après avoir tout téléchargé.

### P6 — Rien d'inerte à l'écran

**Règle.** Un contrôle affiché est un contrôle branché. Sinon il est retiré, pas laissé décoratif.
**Contre-exemples.** Le champ de recherche global (`components/dashboard/header.tsx:107-112`) n'a ni `onChange` ni `onSearch` ni `onPressEnter`. Le bouton « FR » (`:118-124`) n'a pas de `onClick`. Le `Select` « Propriété » de `pages/tenant/maintenance/TicketList.tsx:141-149` est rendu vide, avec un `TODO` en commentaire. Le menu public propose « Catégories » → `/properties/categories` (`components/dashboard/sidebar.tsx:381`), route qui n'existe pas dans `App.tsx` et qui, faute de `path="*"`, n'affiche **rien** — pas même un 404.

### P7 — Un composant, un token

**Règle.** Aucune valeur de couleur, de rayon, d'ombre ou d'espacement n'est écrite en dur dans un composant. Toute classe Tailwind référence une valeur déclarée dans `tailwind.config.js`.
**Contre-exemples.** `components/ui/table.tsx:35,45,59,83` et `components/ui/tabs.tsx:14` utilisent `text-muted-foreground`, `bg-muted`, `bg-muted/50` — aucun de ces tokens n'existe dans `tailwind.config.js` (qui ne déclare que `primary` et `fontFamily`) : les classes ne produisent **aucun style**, les en-têtes de tableau shadcn sont indiscernables des cellules et le survol de ligne ne fonctionne pas. Même problème dans 5 fichiers applicatifs (`pages/rental/Installments.tsx:410`, `pages/rental/Penalties.tsx:449,535,561`, `components/rental/AllocatePaymentForm.tsx:148,172,196`). Symétriquement, `#1890ff` est écrit en dur dans les 4 coquilles.

---

## 3. Design system cible

### 3.1 Décision : Ant Design 6, Tailwind en couche de mise en page

**Verdict : Ant Design 6 est le design system unique. `components/ui/` (mini-shadcn + Radix) est supprimé. Tailwind est conservé, sans composants.**

Justification, dans l'ordre de poids :

1. **Coût de migration.** 98 des 113 pages importent `antd` ; 15 ne l'importent pas. Migrer vers shadcn = réécrire 55 `Table`, 40 `Modal`, 20 `Descriptions`, 12 `Upload`, 2 `Steps` et l'intégralité des `Form` déclaratifs. Migrer vers AntD = 15 pages. Rapport 1 à 6.
2. **Densité de données.** L'application est un back-office comptable (partie double dans `SyndicAccounting.tsx`, budgets et clés de répartition dans `SyndicBudgets.tsx`, journaux d'audit). `Table` AntD fournit nativement colonnes responsives (`responsive: ['md']`, déjà utilisé `components/syndics/LotTable.tsx:74`), colonnes figées, lignes dépliables (`pages/TenantPortal/Payments.tsx:508-634`) et `sticky` (`LotTable.tsx:203`). shadcn imposerait TanStack Table + tout le reste à la main.
3. **Mobile-first.** Tous les patterns mobiles du §5 sont réalisables en AntD 6 sans dépendance nouvelle : bottom-sheet = `Drawer placement="bottom"`, colonnes prioritaires = `responsive`, breakpoints = `Grid.useBreakpoint()`, modale plein écran = `styles.content`.
4. **Accessibilité.** `Modal`, `Drawer`, `Select`, `Menu` d'AntD embarquent piège de focus, rôles ARIA et navigation clavier. La couche maison, elle, contient un fichier mort (`components/ui/wizard.tsx`, 198 lignes, **zéro importeur**) et des tokens non résolus (P7).
5. **Vélocité.** L'équipe écrit de l'AntD par défaut : 98 pages contre 15, et les 15 concentrent les défauts (les 3 pages TW d'administration portent 8 des 29 `alert()`/`confirm()` natifs).
6. **Taille de bundle.** AntD est déjà dans le chunk d'entrée (`App.tsx:3` `ConfigProvider`+`Spin`, `Login.tsx` importé **non-lazy** en `App.tsx:10`, header et sidebar). Supprimer les 7 paquets `@radix-ui/*`, `class-variance-authority` et `tailwind-merge` retire du poids sans en ajouter. Conserver les deux est le seul scénario perdant.
7. **Effet de bord immédiat.** La suppression de Radix élimine le hack `[data-radix-popper-content-wrapper] { z-index: 99999 !important }` (`src/index.css:41-43`), qui place aujourd'hui n'importe quel `Select` shadcn au-dessus de toutes les modales AntD.

**Frontière de coexistence et date de fin.** Fin de Lot 0 (S3), `components/ui/` est gelé : une règle ESLint `no-restricted-imports` interdit tout **nouvel** import. Les 15 pages Tailwind continuent de fonctionner, thémées par les mêmes tokens CSS (§9.7), mais ne reçoivent aucune fonctionnalité. Elles sont migrées en Lot 2 (3 pages CRM) et Lot 4 (12 pages). **`components/ui/`, `@radix-ui/*`, `class-variance-authority` et `tailwind-merge` sont supprimés du dépôt à la clôture du Lot 4, S16.** Aucune prolongation : la règle ESLint passe en `error` bloquant dès S3, le Lot 4 a la suppression dans ses critères de sortie.

### 3.2 Design tokens

Source unique : `apps/web/src/styles/tokens.css` (variables CSS), consommé par `tailwind.config.js` et par le `ConfigProvider` AntD. Une seule valeur par rôle.

#### Couleurs — marque et sémantique

| Token                    | Valeur    | Usage                                                     | Contraste sur `--surface-page` (#F8FAFC) |
| ------------------------ | --------- | --------------------------------------------------------- | ---------------------------------------- |
| `--color-primary`        | `#2563EB` | Actions primaires, liens, état actif, `colorPrimary` AntD | **4,94:1** ✔ AA texte                    |
| `--color-primary-hover`  | `#1D4ED8` | Survol                                                    | 6,40:1 ✔                                 |
| `--color-primary-active` | `#1E40AF` | Pression                                                  | 8,34:1 ✔                                 |
| `--color-primary-bg`     | `#EFF6FF` | Fond de sélection, `Tag` info                             | — (fond)                                 |
| `--color-primary-border` | `#BFDBFE` | Bordure de sélection                                      | —                                        |
| `--color-success`        | `#16A34A` | Icônes, remplissages, `Tag` payé                          | 3,15:1 — **non-texte uniquement**        |
| `--color-success-text`   | `#15803D` | Texte sur fond clair                                      | 4,79:1 ✔                                 |
| `--color-success-bg`     | `#F0FDF4` | Fond de `Tag`/`Alert`                                     | —                                        |
| `--color-warning`        | `#D97706` | Icônes, jauges, statut « en retard »                      | 3,04:1 — non-texte                       |
| `--color-warning-text`   | `#B45309` | Texte                                                     | 4,80:1 ✔                                 |
| `--color-warning-bg`     | `#FFFBEB` | —                                                         | —                                        |
| `--color-error`          | `#DC2626` | Erreurs, suppression, `danger`                            | 4,62:1 ✔ AA texte                        |
| `--color-error-text`     | `#B91C1C` | Messages d'erreur en corps de texte                       | 6,18:1 ✔                                 |
| `--color-error-bg`       | `#FEF2F2` | —                                                         | —                                        |
| `--color-info`           | `#2563EB` | Aligné sur la primaire — pas de bleu supplémentaire       | 4,94:1 ✔                                 |

#### Couleurs — neutres, surfaces, texte

| Token                     | Valeur                                                                                              | Usage                                                                                                                                                           |
| ------------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--neutral-50 … 900`      | `#F8FAFC` `#F1F5F9` `#E2E8F0` `#CBD5E1` `#94A3B8` `#64748B` `#475569` `#334155` `#1E293B` `#0F172A` | Échelle slate Tailwind, conservée telle quelle                                                                                                                  |
| `--surface-page`          | `#F8FAFC`                                                                                           | Fond applicatif **unique** — remplace `#f0f2f5` des portails (`TenantPortal/Layout.tsx:251`)                                                                    |
| `--surface-card`          | `#FFFFFF`                                                                                           | Cartes, tableaux, modales                                                                                                                                       |
| `--surface-raised`        | `#FFFFFF`                                                                                           | Bottom-sheet, popover                                                                                                                                           |
| `--surface-sunken`        | `#F1F5F9`                                                                                           | En-tête de tableau, zones d'aide                                                                                                                                |
| `--surface-inverse`       | `#0F172A`                                                                                           | Fond sombre : pastilles d'événement du calendrier                                                                                                               |
| `--surface-nav`           | `#FFFFFF`                                                                                           | Sidebar, rail et drawer. Fond clair depuis que la navigation porte le logo de marque, qui n'existe qu'en bleu marine et tombait à 1,1:1 sur `--surface-inverse` |
| `--border-nav`            | `#E2E8F0`                                                                                           | Filet entre la navigation et la page — 1,04:1 entre les deux surfaces sans lui                                                                                  |
| `--border-subtle`         | `#E2E8F0`                                                                                           | Séparateurs                                                                                                                                                     |
| `--border-default`        | `#CBD5E1`                                                                                           | Bordures de champ                                                                                                                                               |
| `--border-strong`         | `#94A3B8`                                                                                           | Bordure au survol                                                                                                                                               |
| `--text-primary`          | `#0F172A`                                                                                           | Titres, valeurs — 17,4:1 sur `--surface-page`                                                                                                                   |
| `--text-secondary`        | `#475569`                                                                                           | Libellés, descriptions — **7,25:1** (remplace le `rgba(0,0,0,.45)` d'AntD, 3,0:1)                                                                               |
| `--text-tertiary`         | `#64748B`                                                                                           | Métadonnées, placeholders — 4,55:1 ✔ (plancher AA)                                                                                                              |
| `--text-disabled`         | `#94A3B8`                                                                                           | Désactivé — 2,45:1, **jamais porteur d'information seule**                                                                                                      |
| `--text-on-inverse`       | `#F1F5F9`                                                                                           | Texte sur sidebar — 16,6:1                                                                                                                                      |
| `--text-on-inverse-muted` | `#94A3B8`                                                                                           | Sous-titre sidebar — 7,11:1 ✔ (valeur actuelle, conforme, conservée)                                                                                            |

#### Typographie — Inter

Une seule famille : `Inter var` (fichier variable woff2, sous-ensemble `latin` + `latin-ext`, auto-hébergé — voir §8.3). Fallback : `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`.

| Rôle                    | Mobile (< 768) | Desktop (≥ 768) | Graisse                                   | Interlignage |
| ----------------------- | -------------- | --------------- | ----------------------------------------- | ------------ |
| `display`               | 24 px          | 30 px           | 700                                       | 1,25         |
| `h1` (titre de page)    | 20 px          | 24 px           | 600                                       | 1,3          |
| `h2` (titre de section) | 18 px          | 20 px           | 600                                       | 1,35         |
| `h3` (titre de carte)   | 16 px          | 16 px           | 600                                       | 1,4          |
| `body`                  | 15 px          | 14 px           | 400                                       | 1,55         |
| `body-strong`           | 15 px          | 14 px           | 600                                       | 1,55         |
| **`input`**             | **16 px**      | 14 px           | 400                                       | 1,5          |
| `small`                 | 13 px          | 12 px           | 400                                       | 1,45         |
| `caption`               | 12 px          | 12 px           | 500                                       | 1,4          |
| `numeric` (montants)    | 16 px          | 15 px           | 600, `font-variant-numeric: tabular-nums` | 1,3          |

**Règle non négociable** : sous 768 px, tout `input`, `textarea` et `select` est à **16 px**. En dessous, iOS Safari zoome automatiquement au focus et casse la mise en page. Cela couvre les 12 `Upload`, tous les `Form` AntD et les 8 modales du module Syndic.
Graisses chargées : **400, 500, 600, 700 uniquement**. `index.css:1` en charge aujourd'hui 7 (300→900) via `@import` Google Fonts.

#### Espacements — base 4 px

| Token | `0` | `1` | `2` | `3` | `4` | `5` | `6` | `8` | `10` | `12` | `16` |
| ----- | --- | --- | --- | --- | --- | --- | --- | --- | ---- | ---- | ---- |
| px    | 0   | 4   | 8   | 12  | 16  | 20  | 24  | 32  | 40   | 48   | 64   |

Gouttière de grille : 12 px (`xs`/`sm`), 16 px (`md`), 24 px (`lg`+). Padding de conteneur de page : 16 px (`xs`), 24 px (`md`), 32 px (`lg`+).

#### Rayons, ombres, hauteurs de contrôle

| Token            | Valeur                                                       | Usage                                                        |
| ---------------- | ------------------------------------------------------------ | ------------------------------------------------------------ |
| `--radius-sm`    | 4 px                                                         | `Tag`, badge, puce                                           |
| `--radius-md`    | 6 px                                                         | Champs, boutons (= `borderRadius` AntD 6)                    |
| `--radius-lg`    | 8 px                                                         | Cartes, modales                                              |
| `--radius-xl`    | 12 px                                                        | Bottom-sheet (haut uniquement), feuille de filtres           |
| `--radius-full`  | 9999 px                                                      | Avatar, FAB, pastille                                        |
| `--shadow-xs`    | `0 1px 2px rgba(15,23,42,.06)`                               | Carte au repos                                               |
| `--shadow-sm`    | `0 1px 3px rgba(15,23,42,.10), 0 1px 2px rgba(15,23,42,.06)` | Carte survolée, en-tête sticky                               |
| `--shadow-md`    | `0 4px 12px rgba(15,23,42,.08)`                              | Popover, dropdown                                            |
| `--shadow-lg`    | `0 12px 32px rgba(15,23,42,.12)`                             | Modale, drawer                                               |
| `--shadow-sheet` | `0 -4px 24px rgba(15,23,42,.16)`                             | Bottom-sheet, barre d'action basse                           |
| `--control-h-sm` | 32 px                                                        | Desktop, densité compacte (tableaux)                         |
| `--control-h-md` | 36 px                                                        | Desktop, défaut (`controlHeight` AntD porté de 32 à 36)      |
| `--control-h-lg` | **44 px**                                                    | **Tout contrôle interactif sous 992 px** (`controlHeightLG`) |

#### Z-index — échelle unique

| Couche                                        | Valeur | Remplace                                                     |
| --------------------------------------------- | ------ | ------------------------------------------------------------ |
| Contenu                                       | 0      | —                                                            |
| En-tête de tableau sticky / barre d'outils    | 10     | —                                                            |
| Sidebar desktop                               | 20     | `30` (`sidebar.tsx:667`)                                     |
| En-tête d'application                         | 30     | `40` (`header.tsx:78`)                                       |
| Barre d'onglets basse / barre d'action mobile | 40     | _(nouveau)_                                                  |
| Drawer, bottom-sheet                          | 1000   | `50` (`sidebar.tsx:684`) — sous les modales AntD aujourd'hui |
| Modale                                        | 1010   | —                                                            |
| Dropdown, `Select`, popover, `Tooltip`        | 1050   | `99999` (`index.css:42`)                                     |
| `message`, `notification`                     | 1080   | —                                                            |

`zIndexPopupBase: 1000` est posé sur le `ConfigProvider`. Le `!important` de `index.css:41-43` disparaît avec Radix (Lot 4).

#### Durées et courbes

| Token             | Valeur                       | Usage                                           |
| ----------------- | ---------------------------- | ----------------------------------------------- |
| `--duration-fast` | 120 ms                       | Survol, focus, bascule                          |
| `--duration-base` | 180 ms                       | Ouverture de dropdown, `Tag`, dépliage de ligne |
| `--duration-slow` | 260 ms                       | Drawer, bottom-sheet, modale                    |
| `--ease-standard` | `cubic-bezier(.4, 0, .2, 1)` | Défaut                                          |
| `--ease-enter`    | `cubic-bezier(0, 0, .2, 1)`  | Entrée                                          |
| `--ease-exit`     | `cubic-bezier(.4, 0, 1, 1)`  | Sortie                                          |

Sous `@media (prefers-reduced-motion: reduce)`, les trois durées passent à `1ms` — une seule règle CSS dans `tokens.css`, aucune modification de composant. `framer-motion` (`PipelineChart.tsx:2`, `TimeSeriesChart.tsx:2`, `Workbench.tsx:2`) doit recevoir `useReducedMotion()`.

#### Câblage (extrait, < 20 lignes)

```ts
// apps/web/src/theme/antd-theme.ts
import type { ThemeConfig } from "antd";
const v = (n: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(n).trim();

export const antdTheme: ThemeConfig = {
  token: {
    colorPrimary: v("--color-primary"), // #2563EB — remplace #1677ff (seed) et #1890ff (en dur)
    colorSuccess: v("--color-success"),
    colorWarning: v("--color-warning"),
    colorError: v("--color-error"),
    colorInfo: v("--color-primary"),
    colorTextSecondary: v("--text-secondary"), // 3,0:1 -> 7,25:1
    colorBgLayout: v("--surface-page"),
    colorBgContainer: v("--surface-card"),
    borderRadius: 6,
    fontSize: 14,
    fontFamily: "Inter var, system-ui, sans-serif",
    controlHeight: 36,
    controlHeightLG: 44, // 44 = plancher tactile
    zIndexPopupBase: 1000,
  },
  components: {
    Table: { cellPaddingBlockSM: 8 },
    Menu: { darkItemBg: "transparent" },
  },
};
```

### 3.3 Prêt pour le thème sombre

Le dark mode **n'est pas livré** dans ce chantier, mais les tokens sont structurés pour qu'il soit un échange de valeurs, pas une refonte :

- Aucun composant ne référence une couleur littérale : tout passe par `var(--…)`. Les 4 coquilles (`#1890ff`, `#0f172a`, `#1e293b`, `#94a3b8` en dur) sont les premières à corriger — c'est un pré-requis du Lot 0.
- Les tokens sont séparés en **primitives** (`--neutral-500`, `--blue-600`) et **rôles** (`--surface-card`, `--text-secondary`). Seuls les rôles sont redéfinis en sombre, dans un bloc `:root[data-theme="dark"] { … }` de `tokens.css`.
- Les rôles sont neutres sémantiquement : `--surface-sunken` (et non `--gray-100`), `--text-on-inverse` (et non `--text-white`). Aucun nom n'encode une valeur claire.
- Côté AntD, le sombre est un second `ThemeConfig` avec `algorithm: theme.darkAlgorithm` + les mêmes rôles. Le `ConfigProvider` (`App.tsx:146`) reçoit l'un ou l'autre.
- Contrainte de rédaction : les ombres sont exprimées sur `rgba(15,23,42,…)` et non sur `#000`, pour rester lisibles après inversion.

Effort d'activation ultérieure, une fois les tokens en place : **M (2-3 j)**. Priorité P2.

### 3.4 Breakpoints mobile-first

L'échelle actuelle a un seul palier (1024 px, `hooks/useMediaQuery.ts` appelé depuis `sidebar.tsx:51`, `header.tsx:32`, les deux `Layout.tsx`) alors que la grille AntD bascule en `lg` à **992 px** (`node_modules/antd/lib/theme/util/alias.js:37`) et que Tailwind bascule en `lg` à **1024 px** par défaut. Conséquence mesurable : **entre 992 et 1023 px, un `Col lg={8}` passe en 3 colonnes alors que la coquille est encore en mode mobile avec un drawer** — la tablette en paysage est aujourd'hui dans une zone morte.

**Cible : les breakpoints AntD font autorité. Tailwind est reconfiguré pour s'y aligner.**

| Palier | min-width | Terminal cible                    | Coquille                                    | Grille       | Tableaux                                 |
| ------ | --------- | --------------------------------- | ------------------------------------------- | ------------ | ---------------------------------------- |
| `xs`   | 0         | Téléphone portrait 320–575        | Barre d'onglets basse + drawer              | 1 colonne    | **Cartes**                               |
| `sm`   | 576       | Grand téléphone / phablette       | Barre d'onglets basse + drawer              | 1–2 colonnes | Cartes                                   |
| `md`   | 768       | Tablette portrait                 | **Rail de 72 px** (icônes) + drawer au tap  | 2 colonnes   | Tableau réduit (colonnes `priority ≤ 2`) |
| `lg`   | 992       | Tablette paysage / petit portable | **Sidebar 256 px fixe**                     | 3 colonnes   | Tableau réduit                           |
| `xl`   | 1200      | Desktop                           | Sidebar 256 px                              | 3–4 colonnes | **Tableau complet**                      |
| `xxl`  | 1600      | Grand écran                       | Sidebar 256 px, contenu `max-width: 1600px` | 4 colonnes   | Tableau complet + densité `sm`           |

**Stratégie tablette 768–991 px (aujourd'hui inexistante).** C'est le palier de la tablette d'agence et du grand téléphone en paysage. Trois règles :

1. La sidebar devient un **rail de 72 px** : icônes seules, libellé au survol/tap long, groupe ouvert en flyout. `Sider collapsed collapsedWidth={72}` — aucun nouveau composant.
2. Les grilles passent en 2 colonnes (`Col xs={24} md={12} xl={8}`), et les 8 modales du module Syndic qui forcent aujourd'hui `Col span={12}` sans `xs` (`SyndicLots.tsx:563-585`, `:690-699`, `SyndicCharges.tsx:328-359`) deviennent `Col xs={24} md={12}` — c'est ce palier qui légitime les deux colonnes, pas le téléphone.
3. Les tableaux gardent les colonnes `priority ≤ 2` + ligne dépliable, au lieu du scroll horizontal.

**Implémentation.** `tailwind.config.js` reçoit `screens: { sm:'576px', md:'768px', lg:'992px', xl:'1200px', '2xl':'1600px' }`. `useMediaQuery` est remplacé par un hook unique `useBreakpoint()` bâti sur `Grid.useBreakpoint()` d'AntD, seule source de vérité. Toutes les classes Tailwind existantes en `sm:`/`lg:` sont revues au Lot 0 (recherche : 15 pages TW + les 2 layouts).

### 3.5 Prêt pour l'internationalisation

L'i18n **n'est pas livrée** dans ce chantier. Ce qui est livré, ce sont les contraintes qui rendent son ajout mécanique :

1. **Aucun texte FR en dur dans un nouveau composant.** Toute chaîne passe par `t('cle')` d'une façade `apps/web/src/i18n/t.ts` qui, en Lot 0, retourne simplement la valeur du catalogue FR chargé en statique. Aucune dépendance i18n n'est ajoutée maintenant ; la façade permet de basculer sur `react-i18next` plus tard sans toucher aux appelants.
2. **Catalogue par domaine**, aligné sur les chunks existants (`properties`, `rental`, `crm`, `syndics`, `admin`, `communication`, `tenant-portal`, `owner-portal`) : `src/i18n/fr/rental.json`, etc. Le catalogue suit le code-splitting.
3. **`ConfigProvider locale={frFR}`** (`import frFR from 'antd/locale/fr_FR'`) — absent aujourd'hui (`App.tsx:146` : `<ConfigProvider>` sans props). Cela francise immédiatement les `DatePicker`, `Pagination`, `Table` (filtres, tri, « Aucune donnée »), `Upload` et `Empty`, aujourd'hui en anglais. **Gain immédiat, P0, effort S.**
4. **`dayjs.locale('fr')`** posé une seule fois dans `index.tsx` — `dayjs` est déjà une dépendance (`package.json:41`) et `react-big-calendar` l'utilise déjà via `dayjsLocalizer` (`pages/crm/Calendar.tsx:41`).
5. **Longueur des libellés.** Aucun libellé de bouton, d'onglet ou d'en-tête de colonne n'est dimensionné par sa longueur FR : prévoir **+35 %** d'expansion. Concrètement : pas de `width` fixe sur les colonnes de texte, `Button` sans `width` en px, barre d'onglets basse à 5 slots maximum avec libellés d'un seul mot, et les libellés de colonnes tronqués avec `ellipsis: { showTitle: true }`.
6. **Dette existante à solder pendant l'externalisation** : les libellés non accentués relevés dans `SyndicCharges.tsx:34,226,254,386`, `ChargeCallTable.tsx:12,35,48,66`, `SyndicBudgets.tsx:223`, `PatrimoineOverviewPage.tsx:60,73,86`, `PatrimoineOverview.tsx:24,29`, `admin/TenantDetail.tsx`, `admin/AdminCollaboratorDetail.tsx`, `tenant/InviteCollaborator.tsx` sont corrigés au moment où la chaîne entre au catalogue, pas avant.

Externalisation de 234 fichiers TSX : **L, ~12 j-h**, P2, hors périmètre des 6 lots — à arbitrer (question ouverte Q7).

### 3.6 Inventaire des composants cibles

**Primitives** (thème + tokens ; aucune écriture de composant, seulement configuration)

| Composant cible                                   | Remplace (fichiers actuels)                                      | Priorité | Complexité | Écrans |
| ------------------------------------------------- | ---------------------------------------------------------------- | -------- | ---------- | ------ |
| `Button` AntD thémé (44 px < 992)                 | `components/ui/button.tsx` (h-10 = 40 px)                        | P0       | S          | 234    |
| `Input`/`Select`/`DatePicker` AntD (16 px < 768)  | `components/ui/input.tsx`, `select.tsx`, `native-select.tsx`     | P0       | S          | 234    |
| `Card` AntD thémé                                 | `components/ui/card.tsx`                                         | P0       | S          | ~120   |
| `Tag` de statut tokenisé                          | `components/ui/badge.tsx` + `Tag` ad hoc                         | P0       | S          | ~90    |
| `Checkbox`, `Tabs`, `DropdownMenu`, `Avatar` AntD | `components/ui/{checkbox,tabs,dropdown-menu,avatar}.tsx` (Radix) | P1       | S          | ~40    |
| — (supprimé)                                      | `components/ui/wizard.tsx` — **0 importeur**                     | P0       | S          | 0      |
| — (supprimé)                                      | `components/ui/table.tsx` — tokens non résolus (P7)              | P0       | S          | 3      |

**Composants de structure** (à écrire — cœur du Lot 0/1)

| Composant cible                                                      | Remplace                                                                                                                                                  | Priorité | Complexité | Écrans |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ---------- | ------ |
| `<AppShell>` (route-level, `Outlet`)                                 | `dashboard-layout.tsx` importé par **81 pages** + `TenantPortal/Layout.tsx` + `OwnerPortal/Layout.tsx` (3 coquilles quasi identiques, ~700 l. dupliquées) | P0       | L          | 100    |
| `<BottomTabBar>` (par persona)                                       | _(nouveau)_ — la sidebar 12 groupes ne tient pas sur 375 px                                                                                               | P0       | M          | 100    |
| `<AppHeader>` (titre contextuel, retour, recherche, compte)          | `dashboard/header.tsx` (recherche et « FR » inertes)                                                                                                      | P0       | M          | 100    |
| `<Breadcrumbs>` (dérivé du routeur)                                  | _(néant — 0 fil d'Ariane pour 5 niveaux de profondeur)_                                                                                                   | P0       | M          | ~60    |
| `<PageHeader>` (titre + fil d'Ariane + 1 action primaire + menu «…») | En-têtes ad hoc dans chaque page (cf. `PropertyDetail.tsx:178-224`)                                                                                       | P0       | S          | 100    |
| `<AccessDenied>` (avec issue)                                        | `ProtectedRoute.tsx:50-92` (3 variantes, cul-de-sac)                                                                                                      | P0       | S          | 3      |
| `<NotFound>` + route `path="*"`                                      | _(néant — `App.tsx` n'a pas de catch-all)_                                                                                                                | P0       | S          | 1      |

**Composants de données** (cœur du Lot 2 — le chantier mobile n°1)

| Composant cible                                                      | Remplace                                                                                                                                                                    | Priorité | Complexité | Écrans |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ---------- | ------ |
| `<DataView>` (tableau ≥1200 / tableau réduit 768–1199 / cartes <768) | 55 fichiers avec `<Table>`, dont **37 pages**                                                                                                                               | P0       | L          | 37     |
| `<DataCard>` (rendu carte d'une ligne)                               | Grilles de cartes ad hoc (`properties/Properties.tsx:595-654`)                                                                                                              | P0       | M          | 37     |
| `<FilterSheet>` (bottom-sheet + compteur + réinit + URL)             | `Collapse` de filtres (7 fichiers), `Modal` « Filtres » (`crm/Contacts.tsx`), `AdvancedFilters` AntD dans page TW (`crm/Deals.tsx:426-436`)                                 | P0       | M          | ~15    |
| `<Pagination>` unifié (intégré à `DataView`)                         | `<Pagination>` séparé (7 fichiers, dont `Leases.tsx:369-389`, `Contacts.tsx:744-751`) **et** pagination intégrée (`Installments.tsx:583`, `Payments.tsx:313`) — deux rendus | P0       | S          | 37     |
| `<StatCard>` (KPI, 44 px cliquable)                                  | `Statistic` en `Row/Col` dans 23 fichiers + `OwnerPortal/StatCard` + `KpiCard` CRM                                                                                          | P1       | S          | 23     |
| `<StatusTag>` (mapping statut → token, table unique)                 | `Tag` avec couleurs littérales dans ~90 fichiers                                                                                                                            | P0       | S          | ~90    |
| `<MoneyValue>` (FCFA, `tabular-nums`, séparateur d'espace)           | Formatages ad hoc                                                                                                                                                           | P1       | S          | ~50    |

**Patterns applicatifs**

| Composant cible                                                                             | Remplace                                                                                                                                                          | Priorité | Complexité | Écrans     |
| ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ---------- | ---------- |
| `<FormSheet>` (page pleine <768 / drawer 768–991 / modale ≥992)                             | 40 fichiers avec `<Modal>`, dont les 8 modales Syndic sans `width`                                                                                                | P0       | M          | 40         |
| `<Wizard>` mobile (`Steps` vertical <768, barre de progression, brouillon, garde de sortie) | `PropertyFormWizard.tsx:1125-1133` (6 étapes) + `LeaseFormWizard.tsx:1031-1036` (5 étapes)                                                                        | P0       | L          | 4          |
| `<UnsavedGuard>` (`useBlocker` React Router 6.4+)                                           | _(néant — `PropertyFormWizard:1151`, `LeaseFormWizard:1023` quittent sans confirmation)_                                                                          | P0       | M          | ~20        |
| `<ConfirmAction>` (`Popconfirm` ≥992 / bottom-sheet <992)                                   | `Popconfirm` (13 f.), `Modal.confirm` (8 f.), `window.confirm` (**12 f., 29 occ.**)                                                                               | P0       | S          | ~25        |
| `<Feedback>` via `App.useApp()`                                                             | `message.*` statique (**47 pages**, 70 fichiers), `notification.*` (1 page), `alert()` natif                                                                      | P0       | M          | 70         |
| `<StateBlock>` (chargement / vide / erreur / hors-ligne / accès refusé)                     | 4 conventions de chargement, `Alert` ad hoc, `Empty` (58 f. — le point fort à conserver)                                                                          | P0       | M          | 100        |
| `<Skeleton*>` par famille (liste, carte, détail, tableau)                                   | `Spin` plein écran (`App.tsx:132-141`), spinner Tailwind maison (`dashboard-layout.tsx:14`, `ProtectedRoute.tsx:33`)                                              | P0       | M          | 100        |
| `<GlobalSearch>` (⌘K, plein écran mobile)                                                   | `header.tsx:107-112` — champ sans handler                                                                                                                         | P1       | L          | 1          |
| `<AttachmentUploader>` (photo, compression client, file d'attente)                          | `Upload picture-card` (`MaintenanceTicketModal.tsx:176-191`), `FileUploader` (`components/maintenance/`), `Upload` simple (`PaymentDeclarationModal.tsx:241-250`) | P1       | L          | 12         |
| `<OfflineBanner>` + file d'attente d'actions                                                | _(néant)_                                                                                                                                                         | P1       | L          | 5 parcours |

---

## 4. Architecture d'information et navigation

### 4.1 Préalable : la coquille remonte au niveau route

Aujourd'hui, `DashboardLayout` n'est pas un layout de route : il est **importé et rendu par 81 pages** (`grep -rl DashboardLayout pages/`), à l'intérieur de chaque `<ProtectedRoute>`. Trois conséquences directes :

- La coquille entière (sidebar 729 l., header, `SidebarProvider`) est **démontée et remontée à chaque navigation** : le menu se referme, l'état `openKeys` (`sidebar.tsx:48`) est recalculé, la position de défilement est perdue.
- Impossible d'ajouter une barre d'onglets basse persistante, un fil d'Ariane dérivé du routeur, ou une transition entre écrans.
- Le code de coquille est dupliqué en 3 exemplaires quasi identiques : `dashboard-layout.tsx` + `sidebar.tsx`, `TenantPortal/Layout.tsx` (265 l.), `OwnerPortal/Layout.tsx` (282 l.) — le bloc logo est même répété 2 fois par fichier (états normal et chargement).

**Cible.** Une coquille unique `<AppShell persona={…}>` montée au niveau route, avec `<Outlet/>` :

```tsx
<Route
  element={
    <ProtectedRoute>
      <AppShell />
    </ProtectedRoute>
  }
>
  <Route path="/dashboard" element={<Dashboard />} />
  <Route path="/tenant/:tenantId/rental/leases" element={<Leases />} />
  {/* … les 81 pages perdent leur import de DashboardLayout */}
</Route>
```

`AppShell` choisit sa navigation à partir du persona résolu par `AuthContext` (`sidebar.tsx:54-57`), pas à partir de l'arborescence de fichiers. **P0, effort L, 6 j.** C'est la dépendance de tout le §4 et du §5.

**Défaut d'isolation à corriger au passage.** `ProtectedRoute` implémente une vérification d'appartenance au tenant (`ProtectedRoute.tsx:64-92`, comparaison de `params.tenantId` avec `tenantMembership.tenantId`), mais la prop `requireTenant` **n'est passée nulle part** dans `App.tsx` : les 60+ routes `/tenant/:tenantId/…` ne vérifient pas côté client que le `tenantId` de l'URL correspond au tenant de l'utilisateur. Le back-end filtre bien par `tenantId` (`schema.prisma` : `@@index([tenantId])` systématique), donc il n'y a pas de fuite de données ; mais l'utilisateur qui manipule l'URL obtient une coquille vide et des écrans en erreur au lieu d'un refus explicite. `requirePermission` est de même déclaré (`:9,22`) et non implémenté (`:94-96`). **P0, effort S : passer `requireTenant` sur les routes concernées et brancher `<AccessDenied>`.**

### 4.2 Modèle de navigation mobile, par persona

| Persona                    | Contexte                                                                                               | Modèle retenu                                                     | Justification                                                                                                                                                                                                                                 |
| -------------------------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SUPER_ADMIN`              | Desktop exclusif, 2 entrées de menu (`sidebar.tsx:126-146`)                                            | **Sidebar 256 px uniquement.** Pas de barre d'onglets.            | 5 destinations au total. Investir dans le mobile ici n'a aucun retour.                                                                                                                                                                        |
| **Collaborateur d'agence** | **Terrain, mobile prioritaire.** 12 entrées de premier niveau, 48 sous-entrées (`sidebar.tsx:149-363`) | **Hybride : barre d'onglets basse à 5 slots + drawer complet.**   | 50 destinations ne rentrent pas dans 5 onglets. Mais les 4 tâches terrain réelles (consulter un bien, encaisser, relancer, signaler) tiennent dans 4 onglets ; le 5ᵉ ouvre l'arborescence complète. Le drawer n'est jamais le chemin nominal. |
| **Propriétaire**           | Mobile occasionnel, 11 entrées plates (`OwnerPortal/Layout.tsx:34-90`)                                 | **Barre d'onglets basse à 5 slots**, pas de drawer.               | 11 entrées → 4 destinations + « Plus » (feuille de liens). Consultation pure, pas de tâche répétée.                                                                                                                                           |
| **Locataire**              | **100 % mobile**, 6 entrées plates (`TenantPortal/Layout.tsx:42-73`)                                   | **Barre d'onglets basse à 4 slots.** Sidebar et drawer supprimés. | 6 destinations dont 2 sont des sous-vues du bail. 4 onglets couvrent tout. Une sidebar de 256 px sur un usage 100 % mobile est un contresens.                                                                                                 |

**Pourquoi pas un drawer seul pour le collaborateur.** Le drawer actuel (`sidebar.tsx:714-726`) coûte 3 taps pour atteindre « Échéances » (burger → ouvrir « Gestion Locative » → choisir) et se referme après chaque navigation (`:558`). Sur un parcours d'encaissement où l'agent enchaîne 10 locataires, c'est 30 taps de navigation pure. La barre d'onglets ramène ce parcours à 1 tap.

**Pourquoi pas une barre d'onglets seule.** Impossible d'exposer 50 destinations. L'hybride assume la hiérarchie : ce qui est fréquent est en bas, ce qui est rare est derrière « Plus ».

**Comment la sidebar à 12 groupes tient sur 375 px : elle ne tient pas, et elle ne doit pas essayer.** Le drawer est conservé pour le collaborateur, derrière l'onglet « Plus », avec trois changements obligatoires :

1. Un **bouton de fermeture visible** : `closable={false}` aujourd'hui (`sidebar.tsx:717`) oblige à taper le masque, geste non découvrable et inaccessible au clavier.
2. ~~Une **recherche de destination** en tête de drawer (`Input` avec filtrage des 50 entrées).~~ **Retirée après essai** : posée juste sous le logo, elle occupait la place où commence la liste, et repoussait les premières destinations sous la ligne de flottaison. Le menu défile désormais, bandeau de marque fixe.
3. **Un seul groupe ouvert à la fois** (`openKeys` limité à 1 élément), au lieu du comportement actuel qui laisse le groupe Syndic empiler 12 enfants sous les autres.

### 4.3 Arborescence cible

Trois changements transversaux avant les arbres :

- **Les actions sortent du menu.** « Ajouter une propriété » (`sidebar.tsx:185`), « Nouveau contact » (`:264`), « Nouveau bail » (`:280`), « Nouveau ticket » (`:309`) sont des actions, pas des destinations. Elles deviennent : (a) le bouton primaire du `<PageHeader>` de la liste correspondante en desktop, (b) un **FAB contextuel** ancré en bas à droite au-dessus de la barre d'onglets en mobile. Le menu perd 4 entrées et devient un pur arbre de destinations.
- **Le fil d'Ariane devient systématique.** Aucun aujourd'hui, pour une profondeur qui atteint 5 segments (`/tenant/:tenantId/syndics/:syndicId/lots/:lotId/compte`, `App.tsx:276`). `<Breadcrumbs>` est dérivé d'une table `route → libellé` alimentée par les mêmes constantes que le menu. En mobile, il est réduit au **parent immédiat sous forme de flèche « ‹ Retour à … »** dans le `<AppHeader>` — pas de fil complet sur 375 px.
- **Une route `path="*"`** rend `<NotFound>`. `App.tsx` s'arrête sur `<Route path="/" element={<Navigate to="/dashboard"/>}>` (`:873`) : toute URL non reconnue affiche aujourd'hui **une page vide**, sans erreur ni redirection.

#### Collaborateur d'agence

```
Barre d'onglets basse (mobile)   ┆   Sidebar / rail (≥768)
┌──────────────────────────────┐ ┆
│ Accueil  Biens  Baux  Encaisser  Plus │
└──────────────────────────────┘ ┆
Accueil ─────────────────────────── /dashboard
Biens ───────────────────────────── /tenant/:t/properties
   ├ Fiche du bien ──────────────── /properties/:id  (onglets : Infos · Patrimoine · Maintenance · Lots)
   ├ Calendrier des visites ─────── /properties/visits/calendar
   └ [action] Ajouter un bien ───── FAB / bouton primaire
Baux ────────────────────────────── /tenant/:t/rental/leases
   ├ Fiche du bail ──────────────── /rental/leases/:id  (onglets : Échéances · Paiements · Pénalités · Dépôt · Documents)
   └ [action] Nouveau bail ─────── FAB
Encaisser ───────────────────────── /tenant/:t/rental/installments   ← ancien « Échéances », renommé par la tâche
   ├ Fiche d'échéance ───────────── /rental/installments/:id
   ├ Paiements ──────────────────── /rental/payments  (onglets : Encaissés · Déclarations à valider)
   └ [action] Encaisser ─────────── FAB
Plus (drawer, recherche en tête)
   ├ CRM ───────── Tableau de bord · Calendrier · Contacts · Affaires · Activités
   ├ Syndic ───── Copropriétés → [copropriété active] Fiche · Lots · Charges · AG ·
   │              Prestataires · Documents · Finances · Recouvrement · Comptabilité ·
   │              Budgets · Profils & incidents
   ├ Patrimoine ─ Vue consolidée · Performance · Travaux · Relevés
   ├ Maintenance  Tickets de l'agence · Mes demandes · Prestataires   ← libellés désambiguïsés
   ├ Communication  Notifications e-mail · Notifications WhatsApp · Message groupe ·
   │              Newsletter (Listes · Campagnes · Modèles)
   ├ Documents ── Modèles de documents
   └ Agence ───── Collaborateurs · Invitations · Paramètres de l'agence
```

**Les onze entrées sont coiffées de six titres de domaine.** À plat, un menu de onze
entrées ne dit pas de quel métier chacune relève : « Encaisser » et « Patrimoine »
se ressemblent tant qu'aucun titre ne les sépare. Repliées en onze accordéons, elles
coûtent un tap de plus chacune — c'est exactement ce que le §4.3 défait plus haut.
D'où un troisième terme : un **intertitre non cliquable** (`type: 'group'` d'Ant Design),
qui nomme le domaine sans rien replier. « Gestion locative » redevient un _titre_
au-dessus de Baux et d'Encaisser, jamais le _parent_ qui les enterrait
(`sidebar.tsx:271`) : les deux restent à un clic.

```
                        Tableau de bord
PARC IMMOBILIER         Biens
GESTION LOCATIVE        Baux · Encaisser
PATRIMOINE ET ENTRETIEN Patrimoine · Maintenance
COMMERCIAL ET COMMUNICATION  CRM · Communication
COPROPRIÉTÉ             Syndic
PARAMÉTRAGE             Documents · Agence
```

Trois conséquences :

- **L'arbre est ordonné par domaine**, sinon un titre coifferait un bloc discontinu et
  le même intertitre apparaîtrait deux fois. La contiguïté est testée
  (`navigation.test.tsx`), pas seulement conventionnelle.
- **Le tableau de bord n'a pas de titre** : un intertitre au-dessus d'une entrée unique
  déjà nommée « Tableau de bord » ne dirait rien de plus.
- **Le rail de 72 px reste plat.** Un intertitre y serait tronqué à trois lettres.

**Le portail propriétaire reçoit deux titres**, pas six : un bailleur vient pour deux
questions, l'argent et l'état de ses bâtiments.

```
                        Tableau de bord
MON PORTEFEUILLE        Mes biens · Revenus
SUIVI DES BÂTIMENTS     Incidents
                        ──────────
                        Plus  (Documents · Rapports · Préférences)
```

« Plus » reste **sans intertitre** : c'est un contenant, pas un domaine, et un titre
au-dessus d'un groupe qui porte déjà ce nom nommerait deux fois la même chose. Mais une
entrée sans domaine placée après un bloc titré se lit comme la dernière ligne de ce bloc
— « Plus » paraissait relever de « Suivi des bâtiments ». Un **filet** l'en détache.
C'est une règle générale de la sidebar, pas un correctif local.

Le locataire et le super-administrateur gardent un menu sans titres : quatre à cinq
entrées se lisent d'un coup d'œil, et un intertitre par entrée est du bruit, pas de la
structure.

Suppressions et fusions actées dans cet arbre :

| Problème constaté                                                                                                                                                                                                                                                                                                                       | Décision                                                                                                                                                                                                                                                                                                                                                               | Priorité / effort                                                                                                                                                                                                                        |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/properties/categories` n'existe pas (`sidebar.tsx:381`) et n'affiche rien (pas de `path="*"`)                                                                                                                                                                                                                                         | Entrée supprimée du menu public + route `path="*"` ajoutée                                                                                                                                                                                                                                                                                                             | P0 / S                                                                                                                                                                                                                                   |
| Doublon **Clients** (`/clients`, `Clients.tsx` 514 l.) vs **CRM > Contacts** (`crm/Contacts.tsx` 773 l.) — deux listes de personnes, deux UI, et `/clients/new` est déjà une simple redirection (`ClientNewRedirect`, `App.tsx:507`)                                                                                                    | **Fusion sur CRM > Contacts.** `/clients` et `/clients/groups` deviennent des redirections 301 côté routeur vers `/tenant/:t/crm/contacts` (avec `?group=`). Le groupe « Clients » disparaît du menu. `Clients.tsx` et `ClientGroups.tsx` sont supprimés. La gestion des groupes devient un filtre + une action de masse dans Contacts (`BulkTagManager` existe déjà). | P1 / M                                                                                                                                                                                                                                   |
| Doublon **notifications e-mail** : `pages/email-notifications/EmailNotificationsPage.tsx` (286 l., variables `{{tenantName}}`) vs `pages/communication/EmailNotificationsUnifiedPage.tsx` (453 l., `{{contactName}}`, insertion de variables, application multi-destinataires)                                                          | La page « unified » gagne. `pages/email-notifications/` est **supprimé** : il est déjà orphelin (aucun import dans `App.tsx`). Les deux routes `/communication/email-notifications` et `/email-notifications` (`App.tsx:733`, `:757`) sont conservées — la seconde en redirection, pour ne pas casser les liens en circulation.                                        | P0 / S                                                                                                                                                                                                                                   |
| **Pages-passerelles vides** : `/transactions` affiche un `Empty` et deux liens (`Transactions.tsx:112-141`), `/reports` affiche 4 cartes de redirection (`Reports.tsx:36-63`)                                                                                                                                                           | **Supprimées du menu.** « Transactions » devient un filtre de la liste des Affaires CRM (`?type=SALE                                                                                                                                                                                                                                                                   | RENT`), « Rapports » devient une action dans le `<PageHeader>` des écrans concernés + une entrée unique « Relevés » sous Patrimoine. Les routes restent, en redirection. Gain : 3 clics économisés sur un parcours qui n'apportait rien. | P1 / M |
| **5 écrans orphelins** : `PropertyPublic`, `PropertyPublicDetail` (importés `App.tsx:16-17`, sans route — ils gonflent le chunk `properties` sans être atteignables), `PropertySearch` (non importé), `pages/Properties.tsx` (maquette, 6 biens en dur, `Properties.tsx:44-77`), `pages/email-notifications/EmailNotificationsPage.tsx` | **Supprimés du dépôt** au Lot 1, sauf décision inverse sur la vitrine publique (question ouverte Q2). Les imports morts d'`App.tsx:16-17` sont retirés dans tous les cas : ils alourdissent le chunk `properties` pour rien.                                                                                                                                           | P0 / S                                                                                                                                                                                                                                   |
| **Maintenance : deux points de vue côte à côte** sans distinction de rôle (`sidebar.tsx:302-322` : « Mes tickets », « Nouveau ticket », « Gestion des tickets », « Prestataires »)                                                                                                                                                      | Regroupement en deux sous-groupes explicites : **« Tickets de l'agence »** (vue gestionnaire, `/admin/maintenance/tickets` + Prestataires) et **« Mes demandes »** (vue demandeur). L'action « Nouveau ticket » quitte le menu.                                                                                                                                        | P1 / S                                                                                                                                                                                                                                   |

#### Locataire — 100 % mobile

```
┌────────────────────────────────────────┐
│ Accueil    Payer    Incidents   Mon bail│   ← 4 onglets, 44 px de haut + safe-area
└────────────────────────────────────────┘
Accueil ──── /tenant           Solde dû · prochaine échéance · dernier incident
Payer ────── /tenant/payments  onglets : À payer · Historique
                               [action primaire persistante] « Déclarer un paiement »
Incidents ── /tenant/maintenance  liste + [FAB] « Signaler un problème »
Mon bail ─── /tenant/lease     onglets : Bail · Dépôt de garantie · Documents
```

`/tenant/deposit` et `/tenant/documents` deviennent des onglets de « Mon bail » (routes conservées en redirection). La sidebar de 256 px et le drawer sont supprimés de ce portail.

#### Propriétaire

```
┌──────────────────────────────────────────────┐
│ Accueil   Biens   Revenus   Incidents   Plus │
└──────────────────────────────────────────────┘
Accueil ──── /owner
Biens ────── /owner/properties → /owner/properties/:id (onglets : Infos · Baux · Incidents)
Revenus ──── /owner/revenues   (onglets : Revenus · Échéances · Paiements · Dépôts)
Incidents ── /owner/maintenance
Plus ─────── Documents · Rapports · Préférences
```

Les 4 écrans financiers séparés (`Revenues`, `Installments`, `Payments`, `Deposits`) fusionnent en onglets d'un seul écran : ce sont quatre vues de la même chose, avec quatre `Table` de 7 colonnes chacune, dont deux sans `scroll={{x}}` (`OwnerPortal/Installments.tsx:353-359`).
**Garde manquante à ajouter** : contrairement au portail locataire (`TenantPortal/Layout.tsx:31-40`), `OwnerPortal/Layout.tsx` n'a **aucune redirection défensive** — un `clientType` `RENTER` qui atteint `/owner` obtient la coquille propriétaire. P0 / S.

#### SUPER_ADMIN

```
Tableau de bord ─ /dashboard
Administration ── Tenants · Rôles & Permissions · Statistiques · Journaux d'audit
```

Inchangé. `/admin/tenants/:tenantId/edit` et `/admin/tenants/:tenantId` rendent le même composant (`App.tsx:390-404`) : la route `/edit` est supprimée.

### 4.4 Recherche globale

Le champ du header n'a aucun handler (`header.tsx:107-112`). **Décision : le champ est retiré au Lot 0, et la fonctionnalité est spécifiée puis livrée au Lot 3.** Afficher un champ inerte pendant treize semaines de plus contredit P6.

| Dimension            | Spécification                                                                                                                                                                                                                                                                                                                                                                                        |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Portée**           | Le tenant courant uniquement (`tenantId` de `tenantMembership`). Jamais inter-tenant, y compris pour `SUPER_ADMIN` — l'isolation multi-tenant n'est pas contournée par la recherche.                                                                                                                                                                                                                 |
| **Entités indexées** | Biens (`Property.internalReference`, `title`, commune), contacts CRM (`CrmContact` : nom, e-mail, téléphone), baux (`RentalLease.lease_number`, nom du locataire), lots de copropriété (`SyndicateLot.lotNumber` + nom de la copropriété), tickets (`MaintenanceTicket` : numéro, titre). **5 types, pas plus** — les écritures comptables et les journaux d'audit ont leurs propres écrans filtrés. |
| **Contrat d'API**    | **Ajout non rupturant** : `GET /api/tenants/:tenantId/search?q=&types=property,contact,lease,lot,ticket&limit=20`. Réponse : `{ results: [{ type, id, label, sublabel, href }], truncated: boolean }`. Un seul appel, réponse plate déjà porteuse de son `href` — le front ne recompose pas d'URL.                                                                                                   |
| **Déclenchement**    | Debounce 250 ms, minimum 2 caractères, requête annulée à la frappe suivante (`AbortController`). Résultats groupés par type, 5 par type maximum, « Voir tous les résultats » par type renvoie vers la liste filtrée.                                                                                                                                                                                 |
| **Clavier**          | `⌘K` / `Ctrl+K` ouvre, `Échap` ferme, `↑`/`↓` naviguent, `Entrée` ouvre, `Tab` passe au groupe suivant. Piège de focus, restitution du focus au déclencheur à la fermeture.                                                                                                                                                                                                                          |
| **Rendu ≥ 992 px**   | Champ dans le `<AppHeader>` (largeur 320 px), résultats en popover ancré, 480 px de large, 400 px de haut maximum.                                                                                                                                                                                                                                                                                   |
| **Rendu < 992 px**   | **Pas de champ dans le header** (il mange la largeur — aujourd'hui `maxWidth: 400` sur 375 px, `header.tsx:106`). Une **icône loupe 44×44** ouvre un **overlay plein écran** : champ en haut, clavier ouvert automatiquement, résultats en liste pleine largeur, `Annuler` à droite du champ.                                                                                                        |
| **États**            | Vide (« Tapez au moins 2 caractères »), recherche en cours (skeleton de 3 lignes, pas de spinner), aucun résultat (avec les types cherchés rappelés), hors-ligne (bandeau + recherche limitée au cache local).                                                                                                                                                                                       |
| Priorité / effort    | **P1 / L — 5 j** (dont 2 j côté API).                                                                                                                                                                                                                                                                                                                                                                |

---

## 5. Patterns responsive — le cœur du mobile-first

### 5.1 Tableau → carte

C'est le chantier n°1 : **55 fichiers contiennent un `<Table>`, dont 37 pages**. Aujourd'hui, chaque page traite le problème à sa façon, ou ne le traite pas :

- `scroll={{x:'max-content'}}` : `rental/Leases.tsx:365`, `rental/Payments.tsx:235`, `rental/Penalties.tsx:336`, `crm/Contacts.tsx:725`
- `scroll={{x: <nombre>}}` : `rental/Installments.tsx:495` (900), `syndics/LotTable.tsx:202` (1400), `syndics/ChargeCallTable.tsx:102` (920), `TenantPortal/Payments.tsx` (800 et 1000)
- **Aucun `scroll`** malgré 6 à 7 colonnes : `TenantPortal/Maintenance.tsx:369-380`, `OwnerPortal/Maintenance.tsx:128-134`, `OwnerPortal/Installments.tsx:353-359`, les 3 tableaux de `SyndicBudgets.tsx:296-411`
- Un seul aménagement mobile dans toute la codebase : la classe `.lot-table` de `index.css:45-63` (barre de défilement épaissie), et les colonnes `responsive: ['md']`/`['lg']` de `LotTable.tsx:74,119,144`

**Règle cible.** Chaque colonne porte une **priorité** ; le composant `<DataView>` choisit la représentation.

| Breakpoint   | Représentation      | Contenu                                                                                                                   |
| ------------ | ------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `< 768`      | **Liste de cartes** | Uniquement les colonnes `priority: 1` (3 à 4 champs). Une carte = une ligne. Toute la carte est cliquable vers le détail. |
| `768 – 1199` | **Tableau réduit**  | Colonnes `priority ≤ 2`. Ligne dépliable (`expandable`) pour le reste. Pas de scroll horizontal.                          |
| `≥ 1200`     | **Tableau complet** | Toutes les colonnes. Colonne d'actions figée à droite (`fixed: 'right'`).                                                 |

`priority: 1` = ce qui identifie et ce qui décide (référence, nom, montant, statut, échéance). `priority: 2` = ce qui qualifie (type, date de création, source, catégorie). `priority: 3` = le reste.

**Anatomie de la carte** (< 768 px) :

```
┌─────────────────────────────────────────┐
│ BAIL-2026-0184            ● Actif       │  ← identifiant (16 px, 600) + StatusTag
│ Villa Cocody · Koffi N'Guessan          │  ← contexte (13 px, --text-secondary)
│ 450 000 FCFA / mois                     │  ← valeur décisive (16 px, tabular-nums)
│ ───────────────────────────────────────  │
│ Échéance 05/10          [ Encaisser ]   │  ← méta + 1 action, 44 px de haut
└─────────────────────────────────────────┘   toute la carte → détail (min 72 px)
```

**Actions.** Une seule action explicite par carte (celle du parcours), bouton 44 px. Les actions secondaires passent dans un menu « ⋮ » 44×44 qui ouvre un **bottom-sheet d'actions**, pas un dropdown. **Pas de swipe** : geste non découvrable, en conflit avec le défilement horizontal résiduel, et invisible pour les lecteurs d'écran. La sélection multiple, quand elle existe (`BulkTagManager` du CRM), passe par un appui long qui bascule en mode sélection avec barre d'action basse.

```ts
// Signature de colonne — surcouche typée du ColumnType d'AntD
type DataColumn<T> = ColumnType<T> & {
  priority: 1 | 2 | 3;
  cardSlot?: "title" | "status" | "context" | "value" | "meta"; // emplacement en vue carte
};
// <DataView columns={cols} rows={rows} rowKey="id" onRowClick={goDetail}
//           primaryAction={{ label:'Encaisser', onClick, visible: r => r.status !== 'PAID' }} />
```

**Écrans concernés — les 37 pages avec `Table`**, priorisées :

| Priorité                  | Écrans                                                                                                                                                                                                                                                                                                         |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P0** (parcours terrain) | `rental/Leases`, `rental/Installments`, `rental/Payments`, `rental/Penalties`, `properties/Properties` (déjà en cartes, à aligner sur `DataView`), `TenantPortal/Payments`, `TenantPortal/Maintenance`, `admin/maintenance/Tickets`, `tenant/maintenance/TicketList`, `crm/Contacts`, `crm/Deals`              |
| **P1**                    | `syndics/LotTable`, `syndics/ChargeCallTable`, `syndics/SyndicRecovery`, `OwnerPortal/{Installments,Payments,Revenues,Deposits,Maintenance,Leases}`, `documents/DocumentTemplates`, `rental/Documents`, `rental/Deposits`, `newsletter/NewsletterCampaignsPage`, `communication/EmailNotificationsUnifiedPage` |
| **P2** (desktop assumé)   | `syndics/SyndicAccounting`, `syndics/SyndicBudgets`, `admin/AuditLogs`, `admin/TenantsList`, `admin/maintenance/Vendors`, `tenant/{CollaboratorsList,InvitationsList}`, `syndics/SyndicMeetings`                                                                                                               |

Effort : `<DataView>` + `<DataCard>` = **L, 5 j**. Application : **~0,4 j par page**, soit 15 j pour les 37.

### 5.2 Formulaires longs et wizards

Deux wizards en production : `PropertyFormWizard` (1 205 l., 6 étapes, `:600-971`) et `LeaseFormWizard` (1 072 l., 5 étapes dont 2 conditionnelles, `:977-1008`). Aucun des deux n'a d'adaptation mobile : `<Steps>` est rendu sans `direction`, `size` ni `responsive` (`PropertyFormWizard.tsx:1125-1133`, `LeaseFormWizard.tsx:1031-1036`) — six libellés d'étape sur une rangée horizontale de 375 px.

| Aspect                      | Règle cible                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Progression < 768**       | `<Steps>` disparaît. À la place : une **barre de progression 4 px** en haut de la zone de contenu + un libellé « **Étape 3/6 · Prix & conditions** » dans le `<AppHeader>`. Le retour en arrière se fait par le bouton « Précédent » de la barre d'action basse, jamais par un clic sur une pastille de 24 px.                                                                                                                                                                                      |
| **Progression ≥ 768**       | `<Steps direction="vertical">` en colonne de gauche (`Col md={7}`), formulaire à droite (`Col md={17}`). Les étapes validées restent cliquables (comportement actuel, `PropertyFormWizard.tsx:52-58`).                                                                                                                                                                                                                                                                                              |
| **Une question par écran**  | Sous 768 px, une étape ne dépasse pas **6 champs**. Les étapes qui dépassent sont scindées : « Caractéristiques générales » et « Caractéristiques spécifiques » du wizard bien deviennent chacune 2 sous-écrans en mobile (`currentStep` devient un couple étape/section).                                                                                                                                                                                                                          |
| **Clavier virtuel**         | Barre d'action **`position: sticky; bottom: 0`** avec `padding-bottom: env(safe-area-inset-bottom)`, jamais `position: fixed` — sur Android, un `fixed` est recouvert par le clavier. Hauteur de contenu calculée sur `100dvh` (et non `100vh`). `scroll-margin-block: 96px` sur tous les champs, pour que le champ en erreur ne se retrouve pas sous la barre d'action. `inputMode` explicite : `numeric` pour les montants FCFA, `tel` pour les téléphones (+225/+223), `email` pour les e-mails. |
| **Sauvegarde de brouillon** | `PropertyFormWizard` sauvegarde déjà côté serveur (`:200-256`, titre « Brouillon ») et crée automatiquement le bien à l'arrivée sur l'étape Médias (`:1026-1101`). **`LeaseFormWizard` n'a aucun brouillon** (vérifié : aucune occurrence de `draft`/`localStorage`). Cible : **auto-sauvegarde locale toutes les 20 s dans IndexedDB**, clé `draft:<tenantId>:<entité>:<id                                                                                                                         | new>`, restaurée au montage avec une bannière « Brouillon du 08/09 à 14:32 — [Reprendre] [Repartir de zéro] ». Indispensable en 3G : aujourd'hui, une coupure réseau à l'étape 5 d'un bail perd 5 étapes de saisie. |
| **Garde de sortie**         | **Aucune aujourd'hui** : `PropertyFormWizard.tsx:1151-1154` et `LeaseFormWizard.tsx:1023-1027` appellent `onCancel` du parent sans confirmation. Cible : `<UnsavedGuard>` sur `useBlocker` (React Router 6.4+, déjà en 6.21 — `package.json:52`) + `beforeunload`. Confirmation en bottom-sheet sous 992 px.                                                                                                                                                                                        |
| **Validation**              | Le comportement existant est bon et se généralise : validation par étape, blocage du « Suivant », revalidation globale à la soumission avec **retour automatique sur la première étape en erreur** (`LeaseFormWizard.tsx:389-465`). À ajouter : annonce `aria-live="assertive"` du nombre d'erreurs et focus sur le premier champ fautif.                                                                                                                                                           |

Priorité **P0**, effort **L — 6 j** (composant `<Wizard>` mobile + reprise des deux wizards + brouillon local).

### 5.3 Modales, bottom-sheets et pages pleines

Le module Syndic est entièrement modal-driven, et **aucune de ses 8 modales n'a de `width`** — elles héritent donc du 520 px par défaut d'AntD, tout en contenant jusqu'à 10 champs (`SyndicCharges.tsx:268-396`) et en forçant `Col span={12}` sans `xs` (`SyndicLots.tsx:563-585`, `:690-699`, `SyndicCharges.tsx:328-359`) : deux colonnes de formulaire sur 375 px. Ailleurs, les modales varient de 520 à 800 px (`TenantPortal/Maintenance.tsx:424`, `MaintenanceTicketModal.tsx:98` : 700).

**Règle unique, sans exception :**

| Nature du contenu              | `< 768`                                                      | `768 – 991`            | `≥ 992`                |
| ------------------------------ | ------------------------------------------------------------ | ---------------------- | ---------------------- |
| Confirmation (0 champ)         | **Bottom-sheet**, 2 boutons 44 px empilés                    | Bottom-sheet           | `Popconfirm` ancré     |
| Formulaire ≤ 3 champs          | **Bottom-sheet**, hauteur au contenu, max 90 dvh             | `Drawer` droite 420 px | `Modal` 480 px         |
| Formulaire 4 – 8 champs        | **Page pleine** (route dédiée `…/nouveau`, `…/:id/modifier`) | `Drawer` droite 560 px | `Modal` 640 px         |
| Formulaire > 8 champs / wizard | **Page pleine**                                              | **Page pleine**        | Page pleine            |
| Consultation riche (détail)    | **Page pleine**                                              | `Drawer` droite 560 px | `Drawer` droite 640 px |
| Sélecteur (liste à choisir)    | **Bottom-sheet plein écran** avec recherche                  | Bottom-sheet           | `Modal` 520 px         |

Conséquences immédiates, module par module :

- **Syndic** : « Créer/modifier un lot » (6 champs), « Assigner un locataire » (5), « Créer un appel de charges » (jusqu'à 10), « Nouveau budget » (7), « Générer les appels » (5), « Nouveau batch » (6) → **6 pages pleines sur mobile**, routes `…/syndics/:id/lots/nouveau`, `…/charges/nouveau`, etc. « Créer une copropriété » (3 champs, `SyndicsList.tsx:207-234`) et l'import de lots (1 champ) restent en bottom-sheet.
- **Portail locataire** : `PaymentDeclarationModal` (7 champs dont un upload, `width={600}`) → **page pleine sous 768**. `MaintenanceTicketModal` (6 champs + galerie `picture-card`, `width={700}`) → **page pleine sous 768**, ce qui résout du même coup l'incohérence P4 avec la page dédiée du back-office : les deux convergent vers le même écran.
- **Confirmations** : les 29 `window.confirm()`/`alert()` (§5.7) deviennent `<ConfirmAction>`.

Le `<FormSheet>` prend un unique `id` de formulaire et choisit son contenant : le formulaire lui-même n'est écrit qu'une fois.

```tsx
// Un seul composant de formulaire, trois contenants selon la largeur
<FormSheet
  id="syndic-lot"
  title="Nouveau lot"
  route="lots/nouveau"
  onSubmit={save}
>
  <LotForm /> {/* identique en modale, drawer et page pleine */}
</FormSheet>
```

Priorité **P0**, effort **M — 3 j** pour `<FormSheet>`, **+ 0,3 j par modale** (40 modales → 12 j, étalés sur les Lots 2 à 4).

### 5.4 Filtres et recherche de liste

Aujourd'hui : `Collapse` « Filtres avancés » replié (`properties/Properties.tsx:378-545`, 7 fichiers au total), `Modal` « Filtres » (`crm/Contacts.tsx`), composant `AdvancedFilters` AntD injecté dans une page Tailwind (`crm/Deals.tsx:426-436` — rupture visuelle dans la carte shadcn `:304`), `Select` isolés en haut de page ailleurs. Et **deux mécanismes concurrents dans le portail propriétaire** : les `Select` déclenchent un filtrage serveur (`OwnerPortal/Maintenance.tsx:209-213`) pendant que les colonnes portent en plus `filters`+`onFilter` d'AntD, un filtrage client sur des données déjà filtrées (`:258-292`) — un filtre de colonne peut masquer des lignes que l'utilisateur croit avoir filtrées.

**Cible : un seul composant `<FilterSheet>`.**

| Règle                          | Détail                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Déclencheur unique             | Un bouton **« Filtres »** dans le `<PageHeader>`, avec un **badge du nombre de filtres actifs**. Le pattern existe déjà dans `properties/Properties.tsx` et se généralise.                                                                                                                                                                                                                                                       |
| Rendu `< 992`                  | **Bottom-sheet** plein écran, champs empilés en 1 colonne, contrôles 44 px, barre d'action basse « Réinitialiser » (`text`) / « Appliquer (N) » (`primary`). Les filtres ne s'appliquent **qu'au clic sur Appliquer** — pas de rechargement à chaque frappe sur mobile.                                                                                                                                                          |
| Rendu `≥ 992`                  | Panneau latéral ou barre de filtres inline, application immédiate au changement, debounce 250 ms sur les champs texte.                                                                                                                                                                                                                                                                                                           |
| Réinitialisation               | Toujours visible dès qu'au moins un filtre est actif. Sous le `<PageHeader>`, une rangée de **puces retirables** (une par filtre actif) permet de retirer un critère sans rouvrir la feuille.                                                                                                                                                                                                                                    |
| Persistance                    | **Tous les filtres, le tri et la page vivent dans l'URL** (`useSearchParams`). Le mécanisme est déjà en place et fonctionne dans `components/crm/dashboard/CrmDashboard.tsx:44-60,95-107` — c'est le meilleur écran de l'application sur ce point : il est généralisé, pas réinventé. Bénéfice direct : une liste filtrée est partageable par WhatsApp entre collaborateurs, et le retour arrière du navigateur restaure l'état. |
| Filtrage serveur exclusivement | Suppression de tout `filters`/`onFilter` de colonne AntD sur une liste paginée serveur (`OwnerPortal/Maintenance.tsx:258-292`, `OwnerPortal/Installments.tsx:311-323`) et de tout filtrage en mémoire sur données paginées (`properties/Properties.tsx:153-206`, `crm/Deals.tsx:95-120`, `Clients.tsx:178-179`). Voir §8.4.                                                                                                      |
| Double déclenchement           | `admin/maintenance/Tickets.tsx` déclenche un fetch via `useEffect([filters])` (`:78-82`) **et** via un bouton « Appliquer les filtres » (`:297-306`) : double requête au clic. Le `useEffect` est retiré au profit du bouton (cohérent avec la règle mobile ci-dessus).                                                                                                                                                          |

Priorité **P0**, effort **M — 3 j** + 0,2 j par écran.

### 5.5 Densité, cibles tactiles, gestes

| Règle                     | Valeur                                                                                                                            | Contrôle                                                                                                                                                                                                                                                                 |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Cible tactile minimale    | **44 × 44 px** sous 992 px                                                                                                        | `controlHeightLG: 44` sur le `ConfigProvider` + règle CSS `@media (max-width: 991px) { .ant-btn, .ant-input, .ant-select-selector, [role="button"] { min-height: 44px } }`. Corrige d'un coup les 40 px de `components/ui/button.tsx:25` et les 32 px par défaut d'AntD. |
| Espacement entre cibles   | ≥ 8 px                                                                                                                            | Deux boutons d'action de ligne ne se touchent jamais.                                                                                                                                                                                                                    |
| Zone de pouce             | Action primaire dans les **96 px inférieurs**                                                                                     | Barre d'action basse `sticky` ou FAB à 16 px du bord droit, 16 px au-dessus de la barre d'onglets.                                                                                                                                                                       |
| Densité de tableau        | `size="middle"` (< 1200), `size="small"` (≥ 1600)                                                                                 | Jamais `small` sous 1200 px : les cellules descendent sous 40 px de haut.                                                                                                                                                                                                |
| Hauteur de carte de liste | ≥ 72 px                                                                                                                           | Garantit une cible confortable pour la navigation vers le détail.                                                                                                                                                                                                        |
| Safe areas                | `env(safe-area-inset-bottom)` sur la barre d'onglets, la barre d'action et les bottom-sheets                                      | Sinon la barre passe sous l'indicateur d'accueil iOS et sous la barre de gestes Android.                                                                                                                                                                                 |
| Gestes                    | **Seulement deux** : _tirer pour rafraîchir_ sur les listes de premier niveau, _glisser vers le bas pour fermer_ un bottom-sheet. | Pas de swipe d'action sur les lignes (voir §5.1), pas de swipe entre onglets (conflit avec le défilement horizontal résiduel des tableaux réduits).                                                                                                                      |
| Défilement horizontal     | Interdit sur `<body>`                                                                                                             | Le seul défilement horizontal admis est **à l'intérieur** d'un conteneur explicite (tableau ≥ 1200 px), avec la barre visible du pattern `.lot-table` (`index.css:45-63`) généralisée.                                                                                   |

### 5.6 États

Quatre conventions de chargement coexistent aujourd'hui : `<Spin size="large">` plein écran (`App.tsx:132-141`), `<Card loading>` (`Dashboard.tsx` — la meilleure, aucun saut de mise en page), `<Table loading>`, et un spinner Tailwind maison écrit deux fois (`dashboard-layout.tsx:14`, `ProtectedRoute.tsx:33`). Un cinquième cas passe inaperçu : `<Spin tip="Chargement...">` isolé dans les deux portails (`TenantPortal/Layout.tsx:204`, `OwnerPortal/Layout.tsx:221`) — en AntD 6, `tip` est **déprécié** au profit de `description` et déclenche un avertissement en développement (`node_modules/antd/lib/spin/index.js:94`).

**Une seule convention : le squelette, dimensionné comme le contenu qu'il remplace.**

| État                                 | Cible                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Chargement initial**               | `<Skeleton*>` de la famille de l'écran : `SkeletonList` (n cartes de 72 px), `SkeletonTable` (en-tête + 8 lignes), `SkeletonDetail` (bloc titre + 2 colonnes), `SkeletonStats` (4 tuiles). **Zéro spinner plein écran** au-delà du fallback de chunk. Le squelette a exactement les dimensions du contenu final → CLS ≈ 0.                                                                                        |
| **Chargement de chunk** (`Suspense`) | Squelette de coquille : sidebar + header réels déjà peints, squelette de contenu. Aujourd'hui, `App.tsx:132-141` peint un `Spin` sur `100vh` **avant** la coquille, ce qui produit un flash blanc pleine page à chaque premier accès à un module.                                                                                                                                                                 |
| **Rechargement / rafraîchissement**  | Contenu précédent conservé + barre de progression 2 px sous le header (`stale-while-revalidate`). Jamais de retour au squelette : c'est le comportement qui rend l'application utilisable en 3G.                                                                                                                                                                                                                  |
| **Vide**                             | `<Empty>` conservé — présent dans **58 fichiers**, c'est le point fort constant de l'application. Formalisé en `<StateBlock variant="empty">` : illustration, phrase de contexte, **une** action de sortie. Distinguer « aucune donnée » (« Commencez par créer votre première propriété ») de « aucun résultat pour ces filtres » (+ bouton « Réinitialiser les filtres »). Les deux sont aujourd'hui confondus. |
| **Erreur**                           | `<StateBlock variant="error">` : message métier, code technique replié, bouton « Réessayer ». Placé **à l'endroit de la donnée manquante**, pas en `Alert` en haut de page. Une erreur partielle (un widget sur quatre) ne blanchit pas l'écran. Un `ErrorBoundary` par route en plus de l'`ErrorBoundary` global (`App.tsx:145`), pour qu'un crash de rendu n'emporte plus la coquille.                          |
| **Hors-ligne**                       | Bandeau persistant sous le header : « Hors connexion — les données affichées datent de 14:32. N actions en attente d'envoi. » Les actions non disponibles hors-ligne sont désactivées avec une infobulle explicite, pas masquées.                                                                                                                                                                                 |
| **Permission refusée**               | Voir ci-dessous.                                                                                                                                                                                                                                                                                                                                                                                                  |

**L'écran « Accès refusé » cible.** L'existant est un cul-de-sac : trois variantes de texte centré, sans bouton ni lien (`ProtectedRoute.tsx:50-61`, `:66-78`, `:79-91`). L'utilisateur ne peut sortir que par le menu — or en mobile, ce rendu remplace la coquille entière : il n'y a **plus de menu du tout**.

```
┌──────────────────────────────────────────────┐
│                    🔒                         │
│            Accès non autorisé                 │
│                                               │
│  Votre rôle « Agent » ne donne pas accès à    │
│  l'administration de la plateforme.           │
│                                               │
│  [ Retour à l'écran précédent ]  (primaire)   │
│  [ Aller au tableau de bord ]                 │
│  Demander l'accès à un administrateur →       │
│                                               │
│  Réf. AUTH-403 · rôle requis SUPER_ADMIN      │  ← repliable, pour le support
└──────────────────────────────────────────────┘
```

Rendu **à l'intérieur de la coquille** (menu et barre d'onglets restent présents), message spécifique aux trois cas (rôle insuffisant / mauvais tenant / aucun tenant), `role="alert"`, focus placé sur le titre. **P0 / S.**

### 5.7 Retours d'action

| Constat                                                                                   | Décision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `message.*` **statique** d'AntD dans **47 pages** (70 fichiers en comptant `components/`) | **Migration vers `App.useApp()`.** Ce n'est pas cosmétique : depuis AntD 5, les fonctions statiques `message`/`notification`/`Modal.confirm` ne consomment pas le contexte du `ConfigProvider`. Une fois les tokens du §3.2 posés, ces écrans afficheraient des toasts au thème par défaut. `<App>` est ajouté dans `App.tsx` juste sous `<ConfigProvider>`, et chaque page remplace l'import statique par `const { message, modal, notification } = App.useApp()`. **P0, effort M — 3 j**, codemod partiel possible.                                                                                                                                                                                                                                                                                 |
| `notification.*` dans 1 seule page                                                        | Supprimé. `notification` est réservé aux événements asynchrones non sollicités (fin de génération d'un relevé, campagne envoyée) ; tout le reste est `message`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `Popconfirm` (13 fichiers) / `Modal.confirm` (8 fichiers) pour la même action             | Unifiés dans `<ConfirmAction>` : `Popconfirm` ancré ≥ 992 px, bottom-sheet en dessous. Le cas emblématique : supprimer un ticket est un `Popconfirm` dans `components/maintenance/TicketCard.tsx:79-98` et un `Modal.confirm` dans `pages/tenant/maintenance/TicketList.tsx:81-100`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **`window.confirm()` / `alert()` natifs : 12 fichiers, 29 occurrences**                   | **Éradication complète, P0.** Liste exhaustive : `pages/admin/AdminCollaboratorDetail.tsx` (3 `confirm` + 6 `alert`), `pages/admin/TenantDetail.tsx` (2 `confirm` + 2 `alert`), `pages/admin/AdminInviteCollaborator.tsx` (1), `pages/rental/Installments.tsx`, `pages/rental/Penalties.tsx:232-236`, `pages/crm/Deals.tsx`, `pages/properties/PropertySearch.tsx`, `pages/TenantPortal/Lease.tsx:204`, `components/crm/PropertyMatching.tsx` (2), `components/properties/PropertyDocumentUpload.tsx` (2), `components/properties/PropertyQualityScore.tsx`, `components/properties/PropertyStatusWorkflow.tsx`. Cas aggravant à traiter en premier : `AdminCollaboratorDetail.tsx:90` affiche **un mot de passe régénéré dans un `alert()` natif** — non copiable, non masquable, non journalisable. |
| Toasts de succès sur mobile                                                               | Positionnés **en haut**, sous le header (le bas est occupé par la barre d'action et la barre d'onglets), durée 4 s, un seul à la fois, `role="status"` + `aria-live="polite"`. Les erreurs sont en `assertive` et ne se ferment pas toutes seules.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Actions destructives                                                                      | Confirmation **nommant l'objet** (« Supprimer le bail BAIL-2026-0184 ? ») et bouton `danger` **jamais en position primaire à droite** sur mobile — l'ordre est [Annuler] [Supprimer], le pouce droit tombant sur « Annuler ».                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Erreurs de mutation en réseau dégradé                                                     | Le toast n'est pas un accusé de réception : tant que la requête n'a pas répondu, le bouton est en état `loading` et désactivé. Hors-ligne, l'action entre dans la file (§8.5) et le toast dit « Enregistré — sera envoyé au retour du réseau ».                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

---

## 6. Refonte écran par écran

Légende : **Priorité** P0 bloquant / P1 important / P2 confort · **Effort** S < 1 j / M 1–3 j / L > 3 j.
Les écrans marqués ★ font l'objet d'une spécification détaillée avec wireframes au §6.14.

### 6.1 Authentification et accès public (11 écrans)

| Écran (route)                                                | Problème actuel                                                                                                                                                                                                                                                                                                                     | Refonte proposée                                                                                                                                                                                                                                                                                                                                                                                     | Impact mobile                                                                                                         | Prio   | Effort |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------ | ------ |
| `/login`                                                     | **9 comptes de test avec mots de passe en clair, codés en dur et cliquables** (`Login.tsx:33-124`), dont des comptes réels (adresses Gmail/Yahoo nominatives). Aucune garde d'environnement. De plus, `Login` est le **seul écran non `lazy`** (`App.tsx:10`) : ces identifiants sont dans le chunk d'entrée servi à tout visiteur. | Suppression totale de `TEST_USERS` et du bloc « Connexion rapide » (`:33-141`, `:268-317`). Les comptes de démonstration passent en variable d'environnement `VITE_DEMO_ACCOUNTS` **non définie en production**, et l'affichage est conditionné à `import.meta.env.DEV`. Passage de `Login` en `lazy`. Colonne unique centrée, 1 champ par ligne, bouton pleine largeur 44 px, Google en secondaire. | Mise en page 2 colonnes `Row xs=24 lg=12` supprimée ; le formulaire occupe l'écran. Champs à 16 px (pas de zoom iOS). | **P0** | S      |
| `/register`, `/verify-email`, `/auth/callback`               | Tailwind pur, rupture visuelle nette avec `/login` (AntD)                                                                                                                                                                                                                                                                           | Migration AntD, même carte que `/login`                                                                                                                                                                                                                                                                                                                                                              | —                                                                                                                     | P1     | M      |
| `/forgot-password`, `/reset-password`, `/auth/accept-invite` | Corrects (`Form` + `Result`), jauge de robustesse bien traitée                                                                                                                                                                                                                                                                      | Tokens + 44 px + 16 px                                                                                                                                                                                                                                                                                                                                                                               | —                                                                                                                     | P2     | S      |
| `/newsletter/{subscribe,confirm,unsubscribe}`                | Corrects ; la double confirmation avant désinscription est une bonne pratique à conserver                                                                                                                                                                                                                                           | Tokens uniquement                                                                                                                                                                                                                                                                                                                                                                                    | —                                                                                                                     | P2     | S      |

### 6.2 Tableau de bord et pages racines

| Écran (route)                 | Problème actuel                                                                                                                                                                                                  | Refonte proposée                                                                                                                                                                                                                                          | Impact mobile                            | Prio   | Effort |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | ------ | ------ |
| ★ `/dashboard`                | Reporting passif : 4 `Statistic` + activités récentes (`Dashboard.tsx:168-241`). Rien à faire depuis cet écran. Le rendu `—` au lieu de `0` en cas de permission manquante (`:49`) est excellent et se conserve. | Devient le **poste de travail du collaborateur** : 3 tuiles décisionnelles cliquables (Impayés du jour, Échéances de la semaine, Tickets ouverts) + une file « À traiter aujourd'hui » actionnable, sur le modèle du `Workbench` CRM qui existe déjà.     | Une colonne, tuiles 2×2, file en cartes. | **P0** | L      |
| `/properties` (menu public)   | Rend en réalité la vraie page (`App.tsx:365`) alors que le menu public promet un catalogue                                                                                                                       | Route supprimée du menu public ; `pages/Properties.tsx` (maquette, 6 biens en dur `:44-77`) supprimé du dépôt                                                                                                                                             | —                                        | P0     | S      |
| `/clients`, `/clients/groups` | Doublon avec CRM > Contacts ; `/clients/new` est déjà une redirection (`App.tsx:507`)                                                                                                                            | Redirections vers `/crm/contacts` ; fichiers supprimés (§4.3)                                                                                                                                                                                             | —                                        | P1     | M      |
| `/transactions*`, `/reports`  | Pages-passerelles vides : 3 clics pour atteindre la donnée                                                                                                                                                       | Retirées du menu, converties en redirections (§4.3)                                                                                                                                                                                                       | —                                        | P1     | M      |
| `/settings/profile`           | Lecture seule intégrale (`ProfilePage.tsx:83-96`) ; « Profil » et « Paramètres » mènent au même écran (`header.tsx:53,59` → `App.tsx:870`)                                                                       | Écran **éditable** : nom, avatar, téléphone, langue, préférences de notification. « Paramètres » devient un écran distinct (préférences applicatives + sécurité : mot de passe, sessions actives). Nécessite un endpoint `PATCH /api/users/me` — voir Q9. | Formulaire en pile, 44 px                | P1     | M      |

### 6.3 Module Propriétés

| Écran (route)                                              | Problème actuel                                                                                                                                                                                                                                                                                                                                                                  | Refonte proposée                                                                                                                                                                                            | Impact mobile                                                            | Prio   | Effort |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ------ | ------ |
| ★ `…/properties`                                           | Bon écran, mais : filtrage **client** sur données paginées serveur (`:153-206` filtre `response.properties` alors que `pagination` vient du serveur `:209` → le compteur ment), **N+1 média** (`:248-276` : 1 requête `/media` par carte affichée, `:255-273`), 4 actions par carte en `type="link"` icône seule avec `title` HTML natif (`:614-654`) — inaccessibles au clavier | `<DataView>` + `<DataCard>`, filtrage 100 % serveur (paramètres passés à l'API), image primaire fournie par le endpoint de liste (voir §8.4), 1 action explicite + menu « ⋮ », `Collapse` → `<FilterSheet>` | Carte 1 colonne < 768, 2 en `md`, 3 en `lg`                              | **P0** | L      |
| ★ `…/properties/new`, `…/:id/edit`                         | Wizard 6 étapes sans adaptation mobile (`PropertyFormWizard.tsx:1125-1133`), aucune garde de sortie (`:1151`)                                                                                                                                                                                                                                                                    | `<Wizard>` mobile (§5.2), brouillon local, `<UnsavedGuard>`. L'auto-création à l'étape Médias (`:1026-1101`) est conservée mais rendue explicite par un bandeau « Brouillon enregistré ».                   | Barre de progression + « Étape 3/6 »                                     | **P0** | L      |
| `…/properties/:id`                                         | En-tête flex non wrappable avec 3 boutons de même poids (`:204-223`) ; le reste (onglets Patrimoine/Maintenance/Lots) est bon et se conserve                                                                                                                                                                                                                                     | `<PageHeader>` : titre + fil d'Ariane + 1 action primaire (« Modifier ») + menu « ⋮ » (Newsletter, Générer un bail). Onglets scrollables sous 768 px.                                                       | Galerie en carrousel plein largeur, `Descriptions column={{xs:1, md:2}}` | P0     | M      |
| `…/properties/visits/calendar`                             | Coquille fine (52 l.), toute la logique dans le composant                                                                                                                                                                                                                                                                                                                        | Vue **agenda** (liste chronologique) par défaut sous 768 px, calendrier au-dessus                                                                                                                           | Le calendrier mensuel est illisible sur 375 px                           | P1     | M      |
| `PropertyPublic`, `PropertyPublicDetail`, `PropertySearch` | Orphelins, jamais routés, utilisent `alert()`                                                                                                                                                                                                                                                                                                                                    | Supprimés (ou routés en vitrine publique — Q2)                                                                                                                                                              | —                                                                        | P0     | S      |

### 6.4 Module Gestion Locative

| Écran (route)                                    | Problème actuel                                                                                                                                                                                                                                                                               | Refonte proposée                                                                                                                                                                                                                                                                                                                              | Impact mobile                                                               | Prio   | Effort |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ------ | ------ |
| ★ `…/rental/leases`                              | `Table` 8 colonnes, `scroll={{x:'max-content'}}` (`:365`), actions en fin de ligne (`:210-244`), pagination **séparée** dans une `Card` distincte (`:369-389`) alors que les 3 autres écrans du module l'intègrent. Recherche déclenchée à la fois par `onChange` et `onSearch` (`:290-297`). | `<DataView>` (cartes < 768), pagination unifiée, un seul déclencheur de recherche (debounce 250 ms), `<FilterSheet>`                                                                                                                                                                                                                          | Carte : n° · bien+locataire · loyer · statut · [Voir]                       | **P0** | M      |
| ★ `…/rental/leases/:id`                          | Hub réel du module, bien conçu (`Descriptions column={1}` `:262`, 5 onglets `:511-518`). Deux petits défauts : appel en cascade `loadMissingContactNames` (`:57-80`) après le chargement, et deux chemins vers les mêmes données (menu latéral _et_ onglet).                                  | Conservé. Les noms de contacts sont retournés par le endpoint du bail (suppression de la cascade). Le menu latéral cesse d'exposer Échéances/Paiements comme destinations concurrentes du bail : elles restent accessibles en liste transverse, mais le fil d'Ariane distingue les deux contextes. Onglets scrollables + compteur par onglet. | `Descriptions` 1 colonne déjà correcte ; barre d'action basse « Encaisser » | P0     | M      |
| ★ `…/rental/installments`                        | `Table` 8 colonnes `scroll={{x:900}}` (`:495`), bouton « voir » icône seule sans infobulle (`:544-576`), `Spin` importé mais jamais rendu (`:13`), `window.confirm`                                                                                                                           | `<DataView>` orienté encaissement : la carte porte le reste à payer et **une** action « Encaisser ». Le calcul de pénalités passe en action de masse depuis le `<PageHeader>`.                                                                                                                                                                | **Écran le plus critique du terrain** — voir §6.14                          | **P0** | L      |
| ★ `…/rental/payments`                            | `Table` 7 colonnes, bouton « voir » icône seule **sans** infobulle (`:288-295`), double flux (paiements / déclarations à valider) bien matérialisé par les onglets — à conserver                                                                                                              | `<DataView>`, onglet « Déclarations » avec **badge de compte**, validation en 2 taps depuis la carte                                                                                                                                                                                                                                          | Carte : montant · méthode · statut · [Valider]                              | **P0** | M      |
| `…/rental/payments/:id`                          | Bon niveau de détail (cycle de vie, opérateur Mobile Money, allocation)                                                                                                                                                                                                                       | Conservé, `Descriptions column={{xs:1, md:2}}`, modale d'allocation → `<FormSheet>`                                                                                                                                                                                                                                                           | —                                                                           | P1     | S      |
| _(onglet)_ `rental/Penalties`                    | `window.confirm` pour la suppression (`:232-236`) ; l'exigence d'un motif écrit à l'ajustement est excellente et se conserve                                                                                                                                                                  | `<ConfirmAction>`, `<DataView>`                                                                                                                                                                                                                                                                                                               | 3 actions texte par ligne → 1 + menu                                        | P0     | S      |
| _(onglet)_ `rental/Deposits`, `rental/Documents` | Corrects                                                                                                                                                                                                                                                                                      | `<DataView>`                                                                                                                                                                                                                                                                                                                                  | —                                                                           | P1     | S      |
| `…/documents/templates`                          | Correct ; la colonne « Placeholders » détectés dans le DOCX est un très bon retour post-upload                                                                                                                                                                                                | `<DataView>`, `Upload` en `<FormSheet>`                                                                                                                                                                                                                                                                                                       | —                                                                           | P2     | S      |

### 6.5 Module CRM

| Écran (route)      | Problème actuel                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Refonte proposée                                                                                                                                                                                                                                                                           | Impact mobile                                                             | Prio   | Effort |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- | ------ | ------ |
| `…/crm/dashboard`  | **Le meilleur écran de l'application** : filtres persistés dans l'URL (`CrmDashboard.tsx:44-60,95-107`), KPI cliquables (`:234-282`), workbench actionnable. Deux défauts : `PipelineChart.tsx:4` importe un `Card` **shadcn** imbriqué dans un `Card` AntD (`CrmDashboard.tsx:288`) → double bordure ; les 3 graphiques ont une **hauteur fixe en px** (300/300/400).                                                                                                                                | Le mécanisme de filtres URL devient le standard de l'application (§5.4). `Card` unifié. Hauteurs de graphique en `clamp(220px, 40vh, 400px)`. Sous 768 px : les 5 KPI en grille 2×3 scrollable, les graphiques en onglets (un seul visible à la fois) au lieu d'un empilement de 1 000 px. | Fort                                                                      | P1     | M      |
| ★ `…/crm/deals`    | Page Tailwind avec `<table>` **native** (`:493-586`) et pagination maison (`:596-613`). Kanban en colonnes fixes `w-64` (`DealKanban.tsx:135`) sans média-query. **Deux bugs** : (a) recherche filtrée en mémoire (`:95-120`) sur 20 lignes en vue liste — les résultats sont partiels ; (b) `pipelineStages` ne liste que 4 stades (`DealKanban.tsx:15`) alors que la page en définit 7 (`:170-181`) : **les affaires `APPOINTMENT`, `WON` et `LOST` n'apparaissent dans aucune colonne du Kanban**. | Migration AntD, `<DataView>`, recherche serveur, `pipelineStages` dérivé d'une source unique partagée avec `Deals.tsx`. Kanban : voir §6.14.                                                                                                                                               | Kanban → **une colonne d'étape à la fois** avec sélecteur d'étape en haut | **P0** | L      |
| `…/crm/contacts`   | `Table` 8 colonnes, `scroll={{x:'max-content'}}` (`:725`), pagination séparée (`:744-751`), 4 actions icône seule avec `Tooltip` (`:339-375`). La colonne « Prochaine action » est un excellent parti pris.                                                                                                                                                                                                                                                                                           | `<DataView>` avec « Prochaine action » en `priority: 1` sur la carte, `Modal` « Filtres » → `<FilterSheet>`                                                                                                                                                                                | Carte : nom · téléphone (appel direct `tel:`) · statut · prochaine action | P0     | M      |
| `…/crm/activities` | Correct                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | `<DataView>` + `<FilterSheet>`                                                                                                                                                                                                                                                             | —                                                                         | P1     | S      |
| `…/crm/calendar`   | Hybride AntD + Tailwind + CSS dédié. Hauteur fixe 600 px (`:596`). **Deux boutons distincts déclenchent le même handler** (`:480-502`). Le `Drawer` de détail est un bon choix, à conserver.                                                                                                                                                                                                                                                                                                          | Vue **agenda** par défaut < 992 px, calendrier ≥ 992. Un seul bouton « Nouvel événement » avec choix du type. Migration complète en AntD.                                                                                                                                                  | Fort                                                                      | P1     | L      |

### 6.6 Module Syndic (14 écrans)

Module homogène (100 % AntD) mais entièrement modal-driven et sans fil d'Ariane pour 5 niveaux de profondeur.

| Écran (route)                                                    | Problème actuel                                                                                                                                                                                                                                                                                                                    | Refonte proposée                                                                                                                                                                                                                                                     | Impact mobile                                    | Prio   | Effort |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ------ | ------ |
| `…/syndics`                                                      | Correct. Le paramètre `?openSyndicSection=` envoyé par la sidebar quand aucun syndic n'est actif (`sidebar.tsx:95-103`) est un contournement de la navigation contextuelle.                                                                                                                                                        | `<DataView>` en cartes. Le sélecteur de copropriété devient un **sélecteur persistant dans le `<PageHeader>`** du module (comme un sélecteur d'espace de travail), au lieu d'être déduit de `localStorage` (`sidebar.tsx:76-88`) et compensé par un paramètre d'URL. | Sélecteur en bottom-sheet                        | P1     | M      |
| ★ `…/syndics/:id/lots`                                           | Le plus dense du module. `Table` 8 colonnes `scroll={{x:1400}}` (`LotTable.tsx:202`), déjà 3 colonnes `responsive` (`:74,119,144`) et `sticky` (`:203`) — **c'est le seul écran de l'application qui applique déjà le bon pattern**. Modales de 6 et 5 champs en `Col span={12}` sans `xs` (`SyndicLots.tsx:563-585`, `:690-699`). | `<DataView>` en généralisant le pattern déjà présent ici. Modales → **pages pleines** sous 768 px. Import de lots (1 champ) reste en bottom-sheet.                                                                                                                   | Carte : n° lot · type · tantièmes · propriétaire | **P0** | M      |
| `…/syndics/:id/charges`                                          | Modale de création jusqu'à 10 champs conditionnels (`:268-396`), `Col span={12}` fixe (`:328-359`)                                                                                                                                                                                                                                 | Page pleine < 768. Libellés à réaccentuer (`:34,226,254,386`).                                                                                                                                                                                                       | Fort                                             | P0     | M      |
| `…/syndics/:id/budgets`                                          | 3 `Table` (6, 3 et 7 colonnes) **sans `scroll={{x}}`** (`:296-411`), 3 modales de 7, 5 et 6 champs, actions mélangeant icône+texte et texte seul (`:314-350`)                                                                                                                                                                      | `<DataView>` ×3, pages pleines pour les 3 formulaires, actions normalisées                                                                                                                                                                                           | Fort                                             | P1     | M      |
| `…/syndics/:id/recouvrement`                                     | Tableau de relances + modale d'envoi (canal Email/SMS/WhatsApp/Push) + modale de remise, sans `width`                                                                                                                                                                                                                              | `<DataView>`, envoi en bottom-sheet (3 champs), remise en page pleine. **Parcours terrain** : l'agent relance depuis son téléphone.                                                                                                                                  | Fort                                             | **P0** | M      |
| `…/syndics/:id` (fiche), `/finances`                             | `Descriptions` + `Statistic`, corrects                                                                                                                                                                                                                                                                                             | `<StatCard>`, `Descriptions column={{xs:1, md:2}}`                                                                                                                                                                                                                   | Moyen                                            | P1     | S      |
| `…/syndics/:id/assemblees`, `/:meetingId`                        | `Table` + saisie ligne à ligne des discussions et votes                                                                                                                                                                                                                                                                            | `<DataView>` ; la saisie de PV reste **desktop assumé** (Q1)                                                                                                                                                                                                         | Faible                                           | P2     | M      |
| `…/syndics/:id/prestataires`, `/documents`, `/profils-incidents` | Modales de 5 à 7 champs                                                                                                                                                                                                                                                                                                            | Pages pleines < 768 ; `Upload` documentaire en `<AttachmentUploader>`                                                                                                                                                                                                | Moyen                                            | P1     | M      |
| `…/syndics/:id/comptabilite`                                     | Plan comptable, journaux, écritures en partie double                                                                                                                                                                                                                                                                               | **Desktop assumé** : sous 992 px, écran de consultation en lecture seule + message « La saisie comptable nécessite un écran plus large ». Assumer explicitement vaut mieux que dégrader.                                                                             | —                                                | P2     | M      |
| `…/syndics/:id/lots/:lotId/compte`                               | `Statistic` + `Table` (Date, Libellé, Type, Débit, Crédit, Solde)                                                                                                                                                                                                                                                                  | `<DataView>` ; le solde courant reste épinglé en haut au défilement                                                                                                                                                                                                  | Moyen                                            | P1     | S      |

### 6.7 Module Patrimoine

| Écran (route)                     | Problème actuel                                                                                                                                                                                                           | Refonte proposée                                                                                  | Impact mobile | Prio   | Effort |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------- | ------ | ------ |
| `…/patrimoine`                    | **N+1 : 1 requête travaux par bien, jusqu'à 100 biens** (`PatrimoineOverviewPage.tsx:36,41-46`). Libellé de bouton exposant une route technique (« Voir les biens (/properties) »). Libellés non accentués (`:60,73,86`). | Endpoint agrégé (§8.4). Bouton « Voir les biens ». `<StatCard>` + timeline en cartes.             | Moyen         | **P0** | M      |
| `…/patrimoine/work-programs`      | Même N+1 (`:31-38`) + filtre appliqué en mémoire après téléchargement complet (`:48`)                                                                                                                                     | Endpoint paginé et filtré côté serveur ; `<DataView>`                                             | Moyen         | **P0** | M      |
| `…/patrimoine/performance`        | Analyse **bien par bien** : impossible de comparer                                                                                                                                                                        | Sélection multiple (jusqu'à 5 biens) + tableau comparatif ; le graphe reste mono-bien sous 768 px | Moyen         | P2     | L      |
| `…/patrimoine/statements`, `/:id` | Corrects ; le bouton « Retour » explicite est une bonne pratique rare ici                                                                                                                                                 | `<DataView>`, `<PageHeader>` avec fil d'Ariane (le « Retour » devient systématique)               | Faible        | P2     | S      |

### 6.8 Module Maintenance

| Écran (route)                     | Problème actuel                                                                                                                                                                                                                                                                                                                                           | Refonte proposée                                                                                                                                                                                                                                       | Impact mobile                                    | Prio   | Effort |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ | ------ | ------ |
| ★ `…/admin/maintenance/tickets`   | `Table` + filtres qui déclenchent **deux fetchs** (`useEffect([filters])` `:78-82` **et** bouton « Appliquer » `:297-306`)                                                                                                                                                                                                                                | `<DataView>` + `<FilterSheet>` (un seul déclencheur). Carte orientée triage : priorité, âge, bien, prestataire.                                                                                                                                        | **P0** — l'agent trie ses tickets sur le terrain | **P0** | M      |
| `…/admin/maintenance/tickets/:id` | Bonne séparation lecture / pilotage (bloc d'action séparé)                                                                                                                                                                                                                                                                                                | Conservée. Bloc de pilotage en **barre d'action basse** sous 992 px. `VendorSelect` charge les prestataires à chaque montage (`components/maintenance/VendorSelect.tsx:23-46`) → mise en cache.                                                        | Fort                                             | P0     | M      |
| `…/maintenance` (mes tickets)     | `Select` « Propriété » **rendu vide**, options jamais chargées, `TODO` en commentaire (`TicketList.tsx:141-149`). Suppression en `Modal.confirm` alors que `TicketCard` utilise `Popconfirm`.                                                                                                                                                             | Filtre branché ou retiré (P6). `<ConfirmAction>`. Libellé de menu « Mes demandes ».                                                                                                                                                                    | Fort                                             | P0     | S      |
| ★ `…/maintenance/new`             | Page dédiée, **1+N réseau** : création puis `Promise.all` d'un `uploadAttachment` par fichier (`CreateTicket.tsx:126-136`). En cas d'échec après création, le ticket existe sans pièces jointes et l'utilisateur ne voit qu'un `message.warning` (`:137-140`). Les placeholders d'exemple sont les meilleurs de l'application — à conserver mot pour mot. | **Écran unique** partagé avec le portail (§6.11) : POST multipart unique (le portail le fait déjà, `MaintenanceTicketModal.tsx:53-58`), upload avec compression client et file d'attente hors-ligne. Cascade Propriété→Bail conservée mais préchargée. | **Parcours terrain n°1**                         | **P0** | L      |
| `…/maintenance/:id`, `/:id/edit`  | Corrects                                                                                                                                                                                                                                                                                                                                                  | `<PageHeader>`, commentaires en fil avec zone de saisie collante en bas                                                                                                                                                                                | Fort                                             | P1     | S      |
| `…/admin/maintenance/vendors`     | `Table` 6 colonnes, correct                                                                                                                                                                                                                                                                                                                               | `<DataView>`                                                                                                                                                                                                                                           | Faible                                           | P2     | S      |

### 6.9 Module Communication et Newsletter

| Écran (route)                            | Problème actuel                                                                                                                                                                                                                                           | Refonte proposée                                                                                                                                                                                                                                                                                                                                                      | Impact mobile                                         | Prio   | Effort |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ------ | ------ |
| `…/communication/email-notifications`    | Bonne page (sélection d'événement + destinataires + insertion de variables + application multi-destinataires `:157-162`). L'édition du corps reste du HTML brut.                                                                                          | Conservée. Éditeur : voir ligne « Modèles » ci-dessous. Deux routes maintenues, dont une en redirection.                                                                                                                                                                                                                                                              | Desktop assumé                                        | P1     | S      |
| `…/email-notifications` (doublon)        | Fichier orphelin non routé, variables divergentes (`{{tenantName}}` vs `{{contactName}}`)                                                                                                                                                                 | **Supprimé**                                                                                                                                                                                                                                                                                                                                                          | —                                                     | P0     | S      |
| `…/communication/whatsapp-notifications` | **Mapping des variables saisi en JSON brut dans un `TextArea`** (`:283-287`), sans `JSON.parse` de validation côté front. Réservé à un profil technique.                                                                                                  | Éditeur de mapping **ligne par ligne** : `{{1}} → [Select de variable disponible]`, alimenté par `constants/whatsapp-notification-variables.ts` qui existe déjà. Le JSON est généré, jamais tapé. Mode « JSON avancé » repliable, avec validation et message d'erreur ligne/colonne.                                                                                  | Desktop assumé                                        | **P0** | M      |
| `…/communication/whatsapp-group-message` | Envoi groupé **sans aperçu** du rendu final                                                                                                                                                                                                               | Aperçu du message rendu (avec substitution des variables sur un destinataire témoin) avant envoi, comme le fait déjà l'aperçu de campagne newsletter                                                                                                                                                                                                                  | Moyen                                                 | P1     | S      |
| `…/newsletter/templates`                 | **Édition HTML brut** via `HtmlCodeEditor`, texte blanc forcé sur fond sombre par `index.css:30-38`, aucune prévisualisation en direct. Le composant fait un `dangerouslySetInnerHTML` de coloration (`HtmlCodeEditor.tsx:54`) sans sanitisation visible. | Écran en **deux volets** : à gauche l'éditeur, à droite l'aperçu en direct dans une `<iframe sandbox>` (qui règle aussi le risque d'injection). Blocs prédéfinis insérables (en-tête, texte, image, bouton, pied avec lien de désinscription) pour couvrir 90 % des besoins sans écrire de HTML. Un vrai éditeur visuel est un achat, pas un développement — voir Q5. | Desktop assumé (< 992 px : lecture + envoi seulement) | **P0** | L      |
| `…/newsletter/campaigns`                 | Bon écran : aperçu avant envoi, planification, statistiques par campagne                                                                                                                                                                                  | `<DataView>`, `<FilterSheet>`, confirmation d'envoi en `<ConfirmAction>` nommant la liste et le nombre de destinataires                                                                                                                                                                                                                                               | Moyen                                                 | P1     | S      |
| `…/newsletter/lists`                     | Très bon : les types de liste exposent le consentement dans l'UI, c'est un point de conformité à préserver                                                                                                                                                | `<DataView>` ; l'import CSV passe en `<FormSheet>` avec aperçu des 5 premières lignes                                                                                                                                                                                                                                                                                 | Faible                                                | P2     | S      |

### 6.10 Administration (plateforme et tenant)

| Écran (route)                                                     | Problème actuel                                                                                                                               | Refonte proposée                                                                                                                             | Impact mobile  | Prio   | Effort |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | ------ | ------ |
| `/admin/tenants/:id`                                              | Le plus riche du groupe, mais **seul en Tailwind**, avec `window.confirm`/`alert` pour activer/suspendre (`:76-91`) et libellés non accentués | Migration AntD, `<ConfirmAction>`, onglets AntD. Route `/edit` (doublon, `App.tsx:397-404`) supprimée.                                       | Desktop assumé | P0     | M      |
| `/admin/tenants/:id/collaborators/:userId`                        | Tailwind, **3 `window.confirm` + 6 `alert`**, dont un affichant **un mot de passe régénéré dans une boîte native** (`:90`)                    | Migration AntD. Le mot de passe régénéré s'affiche dans une modale avec champ masqué, bouton « Copier » et avertissement d'usage unique.     | Desktop assumé | **P0** | M      |
| `/admin/tenants/:id/collaborators/invite`                         | Tailwind, formulaire minimal, pas d'invitation multiple                                                                                       | Migration AntD + saisie multi-e-mails (séparateur virgule/retour ligne)                                                                      | Faible         | P1     | S      |
| `/admin/audit`                                                    | Excellent : le payload technique est traduit en libellés métier (`constants/audit-labels.ts`)                                                 | `<DataView>` (P2 : desktop assumé), `<FilterSheet>`                                                                                          | Faible         | P2     | S      |
| `/admin/roles-permissions`                                        | **Lecture seule** : la matrice se consulte mais ne s'édite pas                                                                                | Édition de la matrice — nécessite un endpoint backend, hors périmètre de ce chantier. Bandeau explicite « Consultation seule » en attendant. | Faible         | P2     | S      |
| `/admin/statistics`                                               | Lecture seule, sans filtre de période ni export                                                                                               | Sélecteur de période + export CSV (`utils/export-utils.ts` existe déjà, avec `exceljs` en import dynamique)                                  | Faible         | P2     | S      |
| `…/collaborators`, `/:userId`, `/invitations`, `/invite` (tenant) | Corrects, `Popconfirm` bien utilisés. Libellés « Roles », « Reessayer » non accentués.                                                        | `<DataView>`, réaccentuation                                                                                                                 | Moyen          | P1     | S      |
| `…/settings` (tenant)                                             | Bon regroupement en 4 cartes thématiques ; placeholders contextualisés (+225, FCFA)                                                           | Tokens, 44 px, 16 px sur les champs                                                                                                          | Moyen          | P2     | S      |

### 6.11 Portail Locataire (6 écrans → 4 destinations)

| Écran (route)                          | Problème actuel                                                                                                                                                                                                                                                                                               | Refonte proposée                                                                                                                                                                                                               | Impact mobile | Prio   | Effort |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------- | ------ | ------ |
| ★ `/tenant`                            | Coquille desktop (sidebar 256 px, padding 24 px fixe `Layout.tsx:251`) pour un usage 100 % mobile                                                                                                                                                                                                             | Coquille mobile-first : `<BottomTabBar>` 4 onglets, header 56 px, padding 16 px. Accueil orienté « ce que je dois payer ».                                                                                                     | **Total**     | **P0** | L      |
| ★ `/tenant/payments`                   | Écran le plus riche du portail. `Table` 7 colonnes `scroll={{x:1000}}` + sous-table d'allocations dépliable (`:508-634`). Deux `useEffect` déclenchent deux fetchs indépendants (`:199-205`), relancés à chaque `visibilitychange` (`:207-216`) — sur mobile, chaque retour dans l'application recharge tout. | `<DataView>` en cartes, un seul appel agrégé, revalidation `stale-while-revalidate` au lieu du rechargement complet sur `visibilitychange`. Action primaire persistante « Déclarer un paiement ».                              | **Total**     | **P0** | L      |
| ★ `PaymentDeclarationModal`            | Modale 600 px avec 7 champs dont un upload (`:116-127`, `:241-250`). Le circuit déclaration → validation est cohérent de bout en bout et se conserve intégralement.                                                                                                                                           | **Page pleine sous 768 px** (§5.3), montant en `inputMode="numeric"`, opérateur Mobile Money en grille de logos, justificatif via appareil photo (`capture="environment"`) avec compression client, file d'attente hors-ligne. | **Total**     | **P0** | L      |
| ★ `/tenant/maintenance`                | `Table` **sans `scroll={{x}}`** (`:369-380`) ; création en modale 700 px avec galerie `picture-card` (`MaintenanceTicketModal.tsx:176-191`) — UX différente du back-office (P4)                                                                                                                               | `<DataView>` en cartes ; création via l'**écran unique** partagé avec le back-office (§6.8)                                                                                                                                    | **Total**     | **P0** | M      |
| `/tenant/lease`                        | Lecture seule intégrale, `Descriptions column={{xs:1,sm:2,lg:3}}` (`:234`) — **le seul endroit de l'application avec un `Descriptions` responsive**, à généraliser. `alert()` natif sur échec de téléchargement (`:204`).                                                                                     | Devient le conteneur à onglets « Bail · Dépôt · Documents ». `<ConfirmAction>`/`message.error`.                                                                                                                                | Fort          | P1     | M      |
| `/tenant/deposit`, `/tenant/documents` | Corrects                                                                                                                                                                                                                                                                                                      | Deviennent des onglets de « Mon bail » ; routes conservées en redirection                                                                                                                                                      | Fort          | P1     | S      |

### 6.12 Portail Propriétaire (12 écrans → 5 destinations)

| Écran (route)                                                   | Problème actuel                                                                                                                                                                                         | Refonte proposée                                                                                                      | Impact mobile | Prio   | Effort |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------- | ------ | ------ |
| `/owner`                                                        | Coquille desktop, lecture seule + bouton « Actualiser » (`:152-159`)                                                                                                                                    | `<BottomTabBar>` 5 onglets. Le bouton « Actualiser » devient _tirer pour rafraîchir_.                                 | Fort          | P0     | M      |
| `/owner/revenues` + `/installments` + `/payments` + `/deposits` | **4 écrans pour 4 vues de la même chose**, 4 `Table` de 7 colonnes, dont 2 sans `scroll={{x}}` (`Installments.tsx:353-359`), avec **double filtrage serveur + colonne AntD** (`:198-206` vs `:311-323`) | **Fusion en un écran « Revenus » à 4 onglets**, `<DataView>`, filtrage serveur exclusif                               | Fort          | P1     | L      |
| `/owner/maintenance`                                            | Le plus gros écran du portail (680 l.), `Table` 7 colonnes sans `scroll={{x}}` (`:128-134`), même double filtrage (`:258-292`)                                                                          | `<DataView>`, filtrage serveur. Le propriétaire commente mais n'assigne pas — cette limite reste explicite dans l'UI. | Fort          | P1     | M      |
| `/owner/properties`, `/:id`, `/leases`, `/:id`                  | Lecture seule, corrects                                                                                                                                                                                 | `<DataView>`, fusion Baux dans l'onglet du bien                                                                       | Moyen         | P2     | M      |
| `/owner/reports`                                                | Le seul écran vraiment interactif du portail                                                                                                                                                            | Conservé, `<FormSheet>`, notification à la fin de la génération                                                       | Moyen         | P2     | S      |
| `/owner/preferences`                                            | 1 seul `Switch` (`:32-44`) ; ni langue, ni fréquence, ni format                                                                                                                                         | Préférences de notification par canal et par événement, format de date/montant, fréquence des relevés                 | Moyen         | P2     | M      |
| `OwnerPortal/Layout.tsx`                                        | **Aucune redirection défensive**, contrairement au portail locataire (`TenantPortal/Layout.tsx:31-40`)                                                                                                  | Garde symétrique : un `clientType` non `OWNER` est renvoyé                                                            | —             | **P0** | S      |

### 6.13 Récapitulatif d'effort par module

| Module                                          | Écrans     | Effort (j-h) |
| ----------------------------------------------- | ---------- | ------------ |
| Fondations, coquille, primitives (§3, §4.1, §5) | transverse | 30           |
| Propriétés                                      | 6          | 10           |
| Gestion Locative                                | 9          | 12           |
| CRM                                             | 5          | 12           |
| Syndic                                          | 14         | 12           |
| Patrimoine                                      | 5          | 6            |
| Maintenance                                     | 7          | 9            |
| Communication / Newsletter                      | 7          | 8            |
| Administration                                  | 8          | 6            |
| Portail Locataire                               | 6          | 10           |
| Portail Propriétaire                            | 12         | 8            |
| Authentification et racines                     | 15         | 5            |
| **Total développement**                         | **~100**   | **128**      |

### 6.14 Écrans critiques — spécification détaillée

Convention de lecture : le cadre de gauche est le rendu **375 px**, celui de dessous (ou de droite) le rendu **≥ 1280 px**. `▮` = barre d'onglets basse, `[ ]` = bouton, `( )` = bouton secondaire, `⋮` = menu d'actions secondaires.

---

#### ★ 1. Tableau de bord collaborateur — `/dashboard`

**Hiérarchie de l'information** : 1) ce qui est en retard aujourd'hui, 2) ce qui arrive cette semaine, 3) ce qui bloque (tickets), 4) l'activité récente (dernier).
**Action primaire unique** : la première ligne de la file « À traiter » — l'écran est une file de travail, pas un rapport.

```
375 px                                     ≥ 1280 px
┌────────────────────────────────────┐    ┌──────┬──────────────────────────────────────────────────────────────────┐
│ ☰  Bonjour Koffi          🔍  KN   │    │ SIDE │ Tableau de bord                            🔍 Rechercher   KN ▾  │
├────────────────────────────────────┤    │ BAR  ├──────────────────────────────────────────────────────────────────┤
│ ┌────────────┐  ┌────────────┐     │    │ 256  │ ┌──────────┐┌──────────┐┌──────────┐┌──────────┐                │
│ │ IMPAYÉS  4 │  │ CETTE SEM 7│     │    │  px  │ │IMPAYÉS  4││CETTE SEM││TICKETS  3││ENCAISSÉ  │                │
│ │ 1 850 000 ⚠│  │ 3 200 000  │     │    │      │ │1 850 000 ││   7     ││ ouverts  ││ 12,4 M   │                │
│ └────────────┘  └────────────┘     │    │      │ └──────────┘└──────────┘└──────────┘└──────────┘                │
│ ┌────────────┐  ┌────────────┐     │    │      ├───────────────────────────────────┬──────────────────────────────┤
│ │ TICKETS  3 │  │ ENCAISSÉ   │     │    │      │ À TRAITER AUJOURD'HUI        (12) │ ACTIVITÉ RÉCENTE             │
│ │ ouverts    │  │ 12,4 M     │     │    │      │ ┌───────────────────────────────┐ │ 14:02 Paiement reçu — BAIL…  │
│ └────────────┘  └────────────┘     │    │      │ │⚠ BAIL-0184 · Villa Cocody     │ │ 13:47 Ticket #221 assigné    │
├────────────────────────────────────┤    │      │ │  450 000 FCFA · 12 j de retard│ │ 11:20 Bien publié — Riviera  │
│ À TRAITER AUJOURD'HUI         (12) │    │      │ │            [Relancer][Encaisser]│ │ …                            │
│ ┌────────────────────────────────┐ │    │      │ ├───────────────────────────────┤ │                              │
│ │ ⚠ BAIL-0184 · Villa Cocody     │ │    │      │ │● Déclaration à valider        │ │                              │
│ │   450 000 FCFA · 12 j retard   │ │    │      │ │  M. Traoré · 300 000 · Wave   │ │                              │
│ │              [   Encaisser   ] │ │    │      │ │                  [Voir][Valider]│ │                             │
│ ├────────────────────────────────┤ │    │      │ └───────────────────────────────┘ │                              │
│ │ ● Déclaration à valider        │ │    │      │ (voir les 12)                     │                              │
│ │   M. Traoré · 300 000 · Wave   │ │    └──────┴───────────────────────────────────┴──────────────────────────────┘
│ │              [    Valider    ] │ │
│ └────────────────────────────────┘ │    États : squelette 4 tuiles + 3 cartes · vide « Rien à traiter aujourd'hui 🎉 » ·
│  (voir les 12)                     │    erreur par bloc (une tuile en erreur ne blanchit pas l'écran) ·
├────────────────────────────────────┤    permission manquante → « — » (comportement actuel Dashboard.tsx:49, conservé).
│ 🏠  🏢   📄   💰   ⋯              │ ▮
└────────────────────────────────────┘
   Accueil Biens Baux Encaisser Plus
```

---

#### ★ 2. Liste des baux — `…/rental/leases`

**Colonnes par priorité** — `priority 1` : n° de bail, bien + locataire, loyer, statut. `priority 2` : date de fin, date de début. `priority 3` : date de création.
**Action primaire** : ouvrir le bail (toute la carte). Action explicite : « Encaisser » si une échéance est due.

```
375 px                                      ≥ 1280 px
┌────────────────────────────────────┐     ┌──────┬───────────────────────────────────────────────────────────────────────┐
│ ‹ Baux                        🔍   │     │ SIDE │ Accueil › Baux                                                        │
├────────────────────────────────────┤     │ BAR  │ Baux (128)                          [Filtres (2)]  [+ Nouveau bail]   │
│ Baux (128)     [Filtres (2)]       │     │      ├───────────────────────────────────────────────────────────────────────┤
│ ⓧ Actif  ⓧ Cocody                  │     │      │ ⓧ Actif  ⓧ Cocody                                      Réinitialiser  │
├────────────────────────────────────┤     │      ├────────┬──────────┬─────────┬────────┬────────┬───────┬──────┬───────┤
│ ┌────────────────────────────────┐ │     │      │ N°     │ Bien     │Locataire│ Début  │  Fin   │ Loyer │Statut│Actions│
│ │ BAIL-2026-0184     ● Actif    ⋮│ │     │      ├────────┼──────────┼─────────┼────────┼────────┼───────┼──────┼───────┤
│ │ Villa Cocody · K. N'Guessan    │ │     │      │ 0184   │Villa Coc.│N'Guessan│01/01/26│31/12/26│450 000│●Actif│[⋯]    │
│ │ 450 000 FCFA / mois            │ │     │      │ 0183   │Appt Riv. │Traoré   │15/02/26│14/02/27│300 000│●Actif│[⋯]    │
│ │ ───────────────────────────────│ │     │      │ 0182   │Studio Yop│Koné     │01/03/25│28/02/26│120 000│○Fini │[⋯]    │
│ │ Échéance 05/10   [ Encaisser ] │ │     │      └────────┴──────────┴─────────┴────────┴────────┴───────┴──────┴───────┘
│ ├────────────────────────────────┤ │     │      │            ‹ 1 2 3 … 13 ›        20 / page                            │
│ │ BAIL-2026-0183     ● Actif    ⋮│ │     └──────┴───────────────────────────────────────────────────────────────────────┘
│ │ Appt Riviera · M. Traoré       │ │
│ │ 300 000 FCFA / mois            │ │     768–1199 px : tableau réduit à N° · Bien · Loyer · Statut · Actions,
│ │ ───────────────────────────────│ │     ligne dépliable pour Locataire / Début / Fin. Colonne Actions `fixed:'right'`.
│ │ À jour           [   Voir    ] │ │
│ └────────────────────────────────┘ │     États : squelette 6 cartes · vide « Aucun bail — [Créer le premier bail] » ·
│ ⟳ Charger la suite (108 restants)  │     aucun résultat « Aucun bail pour ces filtres — [Réinitialiser] » ·
├────────────────────────────────────┤     hors-ligne « Données du 08/09 14:32 », action Encaisser désactivée.
│ 🏠  🏢   📄   💰   ⋯    [ + ]      │ ▮
└────────────────────────────────────┘  FAB
```

Sous 768 px, la pagination devient un **chargement incrémental** (« Charger la suite ») : la pagination numérotée est un pattern desktop, inutilisable au pouce.

---

#### ★ 3. Détail de bail — `…/rental/leases/:id`

**Hiérarchie** : 1) qui / quoi / combien, 2) où en est-on (solde, prochaine échéance), 3) les 5 onglets.
**Action primaire** : « Encaisser » (barre basse en mobile, bouton d'en-tête en desktop).

```
375 px                                      ≥ 1280 px
┌────────────────────────────────────┐     ┌──────┬───────────────────────────────────────────────────────────────────────┐
│ ‹ BAIL-2026-0184              ⋮    │     │ SIDE │ Accueil › Baux › BAIL-2026-0184                                       │
├────────────────────────────────────┤     │ BAR  │ BAIL-2026-0184  ● Actif        (Modifier) (⋮)   [    Encaisser    ]   │
│ ● Actif                            │     │      ├──────────────────────────────────┬────────────────────────────────────┤
│ Villa Cocody — 3 pièces            │     │      │ Locataire  Koffi N'Guessan       │  RESTE À PAYER                     │
│ Koffi N'Guessan · +225 07 …        │     │      │ Bien       Villa Cocody, 3 p.    │  450 000 FCFA                      │
├────────────────────────────────────┤     │      │ Période    01/01/26 → 31/12/26   │  Échéance 05/10/2026 · dans 3 j    │
│ RESTE À PAYER                      │     │      │ Loyer      450 000 FCFA / mois   │  ─────────────────────────────     │
│ 450 000 FCFA                       │     │      │ Charges     35 000 FCFA          │  Dépôt détenu   900 000 FCFA       │
│ Échéance 05/10 · dans 3 jours      │     │      │ Dépôt      900 000 FCFA          │  Pénalités       0 FCFA            │
├────────────────────────────────────┤     │      │ Pénalités  5 % après 5 j, plaf.  │                                    │
│ Échéances (12) ▸                   │     │      ├──────────────────────────────────┴────────────────────────────────────┤
│ Paiements (9) ▸                    │     │      │ [Échéances 12] [Paiements 9] [Pénalités 0] [Dépôt] [Documents 4]      │
│ Pénalités (0) ▸                    │     │      │ ┌───────────────────────────────────────────────────────────────────┐ │
│ Dépôt ▸                            │     │      │ │ (tableau des échéances, colonnes complètes)                       │ │
│ Documents (4) ▸                    │     │      │ └───────────────────────────────────────────────────────────────────┘ │
├────────────────────────────────────┤     └──────┴───────────────────────────────────────────────────────────────────────┘
│      [      Encaisser      ]       │  ← barre d'action sticky bottom, 44 px, safe-area
├────────────────────────────────────┤
│ 🏠  🏢   📄   💰   ⋯              │ ▮   Les 5 onglets deviennent des **sections dépliables** sous 768 px
└────────────────────────────────────┘     (un onglet AntD à 5 items déborde à 375 px et le contenu est un tableau).
```

---

#### ★ 4. Échéances / Encaissement — `…/rental/installments`

L'écran le plus critique du parcours terrain. **Action primaire unique : encaisser.** Tout le reste est secondaire.

```
375 px                                      ≥ 1280 px
┌────────────────────────────────────┐     ┌──────┬──────────────────────────────────────────────────────────────────────┐
│ ‹ Encaisser                   🔍   │     │ SIDE │ Accueil › Gestion locative › Échéances                                │
├────────────────────────────────────┤     │ BAR  │ Échéances     [Filtres (1)] (Calculer les pénalités) [+ Paiement]     │
│ [À encaisser] [En retard] [Payées] │     │      ├──────────────────────────────────────────────────────────────────────┤
│                    [Filtres (1)]   │     │      │ [À encaisser 24] [En retard 4] [Payées]                               │
├────────────────────────────────────┤     │      ├─────┬────────┬────────┬─────────┬───────┬─────────┬───────┬─────────┤
│ 4 en retard · 1 850 000 FCFA       │     │      │Pér. │ Bail   │ Bien   │ Montant │ Payé  │ Reste   │Pénal. │ Actions │
│ ┌────────────────────────────────┐ │     │      ├─────┼────────┼────────┼─────────┼───────┼─────────┼───────┼─────────┤
│ │ ⚠ 12 jours de retard           │ │     │      │09/26│0184    │V.Cocody│ 485 000 │     0 │ 485 000 │22 500 │[Encais.]│
│ │ BAIL-0184 · Villa Cocody       │ │     │      │09/26│0183    │A.Rivie.│ 335 000 │200 000│ 135 000 │     0 │[Encais.]│
│ │ Septembre 2026                 │ │     │      │10/26│0182    │St.Yopo.│ 125 000 │125 000│       0 │     0 │[Reçu]   │
│ │ RESTE     485 000 FCFA         │ │     │      └─────┴────────┴────────┴─────────┴───────┴─────────┴───────┴─────────┘
│ │ dont pénalités 22 500          │     │      │  Colonne Actions `fixed:'right'`. Total en pied de tableau.          │
│ │ ───────────────────────────────│ │     └──────┴──────────────────────────────────────────────────────────────────────┘
│ │ (Relancer)   [   Encaisser   ] │ │
│ ├────────────────────────────────┤ │     Encaisser (< 768) : page pleine, 5 champs —
│ │ ● Partiel · reste 135 000      │ │       Montant (numeric, pré-rempli au reste dû) · Date (aujourd'hui par défaut) ·
│ │ BAIL-0183 · Appt Riviera       │ │       Méthode (grille de logos Mobile Money) · Référence · Justificatif (photo).
│ │              [   Encaisser   ] │ │       Hors-ligne : mise en file, carte marquée « En attente d'envoi ».
│ └────────────────────────────────┘ │
├────────────────────────────────────┤     Sélection multiple : appui long → barre basse « 3 sélectionnées ·
│ 🏠  🏢   📄   💰   ⋯              │ ▮     [Relancer] [Calculer les pénalités] ».
└────────────────────────────────────┘
```

---

#### ★ 5. Paiements et déclarations — `…/rental/payments`

```
375 px                                      ≥ 1280 px
┌────────────────────────────────────┐     ┌──────┬──────────────────────────────────────────────────────────────────────┐
│ ‹ Paiements                   🔍   │     │ SIDE │ Paiements                          [Filtres]   [+ Saisir un paiement] │
├────────────────────────────────────┤     │ BAR  │ [Encaissés 312] [Déclarations à valider ③]                            │
│ [Encaissés] [À valider ③]          │     │      ├─────┬────────┬─────────┬─────────┬────────┬─────────┬───────────────┤
├────────────────────────────────────┤     │      │Date │ Bail   │ Montant │ Méthode │ Alloué │ Restant │ Statut/Action │
│ ┌────────────────────────────────┐ │     │      ├─────┼────────┼─────────┼─────────┼────────┼─────────┼───────────────┤
│ │ ● À valider                    │ │     │      │03/10│0187    │ 300 000 │Wave     │      0 │ 300 000 │ ⏳ [Valider]  │
│ │ M. Traoré · BAIL-0187          │ │     │      │02/10│0184    │ 485 000 │Orange M.│485 000 │       0 │ ✔ Réussi      │
│ │ 300 000 FCFA · Wave            │ │     │      └─────┴────────┴─────────┴─────────┴────────┴─────────┴───────────────┘
│ │ Déclaré le 03/10 · 📎 reçu.jpg │ │     │      │  Ligne dépliable : allocation par échéance (comportement actuel      │
│ │ ───────────────────────────────│ │     │      │  TenantPortal/Payments.tsx:508-634, généralisé).                     │
│ │ (Refuser)      [   Valider   ] │ │     └──────┴──────────────────────────────────────────────────────────────────────┘
│ ├────────────────────────────────┤ │
│ │ ✔ Réussi · 02/10               │ │     Valider (< 768) : bottom-sheet — aperçu plein écran du justificatif,
│ │ BAIL-0184 · 485 000 · Orange M.│ │     montant modifiable, allocation proposée sur l'échéance la plus ancienne,
│ │ Alloué à Sept. 2026            │ │     [Valider et allouer]. Refuser exige un motif (traçabilité).
│ └────────────────────────────────┘ │
├────────────────────────────────────┤     Le badge ③ de l'onglet « À valider » est la seule information
│ 🏠  🏢   📄   💰   ⋯              │ ▮     réellement urgente de cet écran : il est aussi porté par la
└────────────────────────────────────┘     barre d'onglets basse (pastille sur « Encaisser »).
```

---

#### ★ 6. Déclaration de paiement (locataire) — `/tenant/payments/declarer`

Aujourd'hui une modale de 600 px et 7 champs (`PaymentDeclarationModal.tsx:116-127`). Devient une **page pleine** sur mobile. C'est le parcours qui justifie à lui seul le portail.

```
375 px                                      ≥ 1280 px
┌────────────────────────────────────┐     ┌──────┬──────────────────────────────────────────────────────────┐
│ ✕  Déclarer un paiement            │     │ SIDE │  Modal 640 px, 2 colonnes                                │
├────────────────────────────────────┤     │ BAR  │  ┌─────────────────────┬──────────────────────────────┐  │
│ Échéance                           │     │      │  │ Montant *           │ Date du paiement *           │  │
│ ┌────────────────────────────────┐ │     │      │  │ Méthode *           │ Opérateur / Téléphone        │  │
│ │ Septembre 2026 — 485 000 FCFA ▾│ │     │      │  │ Référence           │ Justificatif                 │  │
│ └────────────────────────────────┘ │     │      │  │ Notes (2 colonnes)                                 │  │
│                                    │     │      │  └─────────────────────┴──────────────────────────────┘  │
│ Montant *                          │     └──────┴──────────────────────────────────────────────────────────┘
│ ┌────────────────────────────────┐ │
│ │ 485 000                   FCFA │ │  ← inputMode="numeric", 16 px, pré-rempli au reste dû
│ └────────────────────────────────┘ │
│ Date du paiement *                 │
│ ┌────────────────────────────────┐ │
│ │ 03/10/2026                   📅│ │  ← aujourd'hui par défaut, futur bloqué (comportement actuel :166)
│ └────────────────────────────────┘ │
│ Méthode *                          │
│ ┌──────┐┌──────┐┌──────┐┌──────┐  │  ← grille de 4 logos 80×64, pas un Select :
│ │Orange││ MTN  ││ Wave ││Espèc.│  │     1 tap au lieu de 3 (ouvrir/faire défiler/choisir)
│ └──────┘└──────┘└──────┘└──────┘  │
│ Numéro de téléphone *              │  ← n'apparaît que si Mobile Money (déjà conditionnel, :186-227)
│ ┌────────────────────────────────┐ │
│ │ +225 07 07 66 41 05            │ │  ← inputMode="tel", pré-rempli depuis le profil
│ └────────────────────────────────┘ │
│ Référence de la transaction        │
│ ┌────────────────────────────────┐ │
│ Justificatif                       │
│ ┌────────────────────────────────┐ │
│ │  📷  Prendre une photo         │ │  ← capture="environment", compression client à ≤ 1 600 px / 300 Ko
│ │  📎  Choisir un fichier        │ │     (aujourd'hui : bouton Upload simple, 5 Mo bruts, :100-113)
│ └────────────────────────────────┘ │
├────────────────────────────────────┤
│  (Annuler)   [  Déclarer  ]        │  ← sticky bottom, ordre : destructif à gauche
└────────────────────────────────────┘
```

**États.** Envoi : bouton en `loading`, formulaire verrouillé. Succès : écran de confirmation plein page (« Déclaration enregistrée — votre gestionnaire la validera sous 48 h »), pas un simple toast. **Hors-ligne** : la déclaration est mise en file, le message dit « Enregistré sur votre téléphone — sera envoyé au retour du réseau », et la carte apparaît dans la liste avec la mention « En attente d'envoi ». C'est le seul écran où la file d'attente est indispensable : un locataire qui a payé et perd le réseau ne doit pas re-saisir.

---

#### ★ 7. Liste des propriétés — `…/properties`

```
375 px                                      ≥ 1280 px
┌────────────────────────────────────┐     ┌──────┬──────────────────────────────────────────────────────────────┐
│ ‹ Biens                       🔍   │     │ SIDE │ Biens (86)              [Filtres (3)]   [+ Ajouter un bien]   │
├────────────────────────────────────┤     │ BAR  ├──────────────────────────────────────────────────────────────┤
│ [Filtres (3)]   86 biens           │     │      │ ⓧ Cocody  ⓧ Location  ⓧ 2–3 pièces            Réinitialiser  │
│ ⓧ Cocody ⓧ Location ⓧ 2-3 p.      │     │      ├───────────────┬───────────────┬───────────────┬──────────────┤
├────────────────────────────────────┤     │      │ ┌───────────┐ │ ┌───────────┐ │ ┌───────────┐ │ ┌──────────┐ │
│ ┌────────────────────────────────┐ │     │      │ │  [photo]  │ │ │  [photo]  │ │ │  [photo]  │ │ │ [photo]  │ │
│ │ ┌────────────────────────────┐ │ │     │      │ │ ●Loué ✓Pub│ │ │ ●Libre    │ │ │ ●Loué     │ │ │ ●Libre   │ │
│ │ │        [photo 16:9]        │ │ │     │      │ │ Villa Coc.│ │ │ Appt Riv. │ │ │ Studio Yop│ │ │ Duplex   │ │
│ │ │                    ●Loué   │ │ │     │      │ │ 450 000/m │ │ │ 300 000/m │ │ │ 120 000/m │ │ │ 800 000/m│ │
│ │ └────────────────────────────┘ │ │     │      │ │ 3p · 120m²│ │ │ 2p · 65m² │ │ │ 1p · 30m² │ │ │ 4p ·200m²│ │
│ │ Villa Moderne — Cocody       ⋮ │ │     │      │ │        [⋮]│ │ │        [⋮]│ │ │        [⋮]│ │ │       [⋮]│ │
│ │ 450 000 FCFA / mois            │ │     │      │ └───────────┘ │ └───────────┘ │ └───────────┘ │ └──────────┘ │
│ │ 3 pièces · 120 m² · Publié     │ │     │      └───────────────┴───────────────┴───────────────┴──────────────┘
│ └────────────────────────────────┘ │     │      │  ‹ 1 2 3 … 5 ›   20 / page                                    │
│ ┌────────────────────────────────┐ │     └──────┴──────────────────────────────────────────────────────────────┘
│ │ … carte suivante …             │ │
│ └────────────────────────────────┘ │     Photos : `loading="lazy"`, `srcset` 320/640/1024, AVIF puis WebP,
│ ⟳ Charger la suite                 │     ratio 16:9 réservé par `aspect-ratio` → CLS = 0.
├────────────────────────────────────┤     L'URL de la vignette est **fournie par le endpoint de liste** :
│ 🏠  🏢   📄   💰   ⋯    [ + ]      │ ▮   suppression du N+1 média actuel (`Properties.tsx:248-276`).
└────────────────────────────────────┘
```

Les 4 actions par carte (`:614-654`) deviennent : la carte entière → détail, et un menu `⋮` 44×44 (Modifier · Créer une campagne · Supprimer) qui ouvre un bottom-sheet d'actions sous 992 px.

---

#### ★ 8. Wizard de création de bien — `…/properties/new`

```
375 px                                                ≥ 1280 px
┌────────────────────────────────────┐               ┌──────┬────────────────────────────────────────────────────────┐
│ ✕  Nouveau bien        [Brouillon] │               │ SIDE │ Biens › Nouveau bien                     [Brouillon]   │
│ ████████░░░░░░░░░░░░░░░░░░░░░░░░░░ │ ← 4 px        │ BAR  ├──────────────┬─────────────────────────────────────────┤
│ Étape 3/6 · Caractéristiques       │               │      │ ✓ Type       │ Caractéristiques générales              │
├────────────────────────────────────┤               │      │ ✓ Localisat. │ ┌────────────────┬────────────────────┐ │
│ Surface habitable *                │               │      │ ▸ Caractérist│ │ Surface *      │ Pièces *           │ │
│ ┌────────────────────────────────┐ │               │      │   Prix       │ │ Chambres       │ Salles d'eau       │ │
│ │ 120                        m²  │ │               │      │   Spécifiques│ │ Étage          │ Année             │ │
│ └────────────────────────────────┘ │               │      │   Médias     │ └────────────────┴────────────────────┘ │
│ Nombre de pièces *                 │               │      │              │                                         │
│ ┌────────────────────────────────┐ │               │      │              │        (Précédent)   [   Suivant   ]    │
│ Nombre de chambres                 │               └──────┴──────────────┴─────────────────────────────────────────┘
│ ┌────────────────────────────────┐ │
│ Salles d'eau                       │               Étapes qui dépassent 6 champs (« Caractéristiques générales »,
│ ┌────────────────────────────────┐ │               « Caractéristiques spécifiques ») : scindées en 2 sous-écrans
│ ⚠ La surface est obligatoire       │ ← inline      sous 768 px, la barre de progression compte les sous-écrans.
├────────────────────────────────────┤
│ (Précédent)     [   Suivant   ]    │ ← sticky bottom, safe-area, jamais recouvert par le clavier
└────────────────────────────────────┘
```

**Brouillon** : bandeau « Brouillon enregistré à 14:32 » sous l'en-tête, sauvegarde locale toutes les 20 s. **Sortie** : `✕` déclenche `<UnsavedGuard>` → bottom-sheet « Enregistrer le brouillon et quitter / Quitter sans enregistrer / Annuler ». Aujourd'hui, `✕` quitte sans rien demander (`PropertyFormWizard.tsx:1151-1154`).

---

#### ★ 9. Tickets de maintenance (gestionnaire) — `…/admin/maintenance/tickets`

```
375 px                                      ≥ 1280 px
┌────────────────────────────────────┐     ┌──────┬─────────────────────────────────────────────────────────────────┐
│ ‹ Tickets de l'agence         🔍   │     │ SIDE │ Maintenance › Tickets de l'agence      [Filtres (2)]  [+ Ticket] │
├────────────────────────────────────┤     │ BAR  ├────┬──────────────┬─────────┬───────┬────────┬────────┬────────┤
│ [Ouverts 12] [Assignés 5] [Clos]   │     │      │ #  │ Titre        │ Bien    │ Cat.  │Priorité│ Statut │Prestat.│
│                     [Filtres (2)]  │     │      ├────┼──────────────┼─────────┼───────┼────────┼────────┼────────┤
├────────────────────────────────────┤     │      │221 │Fuite d'eau…  │V.Cocody │Plomb. │🔴Haute │Déclaré │ —      │
│ ┌────────────────────────────────┐ │     │      │220 │Panne clim    │A.Rivie. │Élect. │🟠Moy.  │Assigné │ SARL X │
│ │ 🔴 Haute · il y a 2 j     #221 │ │     │      └────┴──────────────┴─────────┴───────┴────────┴────────┴────────┘
│ │ Fuite d'eau salle de bain      │ │     └──────┴─────────────────────────────────────────────────────────────────┘
│ │ Villa Cocody · Plomberie       │ │
│ │ Non assigné                    │ │     Carte : priorité + âge en premier — c'est ce qui décide du triage.
│ │ ───────────────────────────────│ │     Le bien et la catégorie qualifient. Le prestataire est le champ d'action.
│ │              [   Assigner    ] │ │
│ ├────────────────────────────────┤ │     Assigner (< 992) : bottom-sheet avec la liste des prestataires filtrée
│ │ 🟠 Moyenne · il y a 5 j   #220 │ │     par spécialité, **mise en cache** (aujourd'hui rechargée à chaque montage,
│ │ Panne climatisation            │ │     `components/maintenance/VendorSelect.tsx:23-46`).
│ │ Appt Riviera · Électricité     │ │
│ │ SARL Électro · En cours        │ │     Un seul déclencheur de filtre (suppression du double fetch
│ │              [     Voir      ] │ │     `Tickets.tsx:78-82` + `:297-306`).
│ └────────────────────────────────┘ │
├────────────────────────────────────┤
│ 🏠  🏢   📄   💰   ⋯              │ ▮
└────────────────────────────────────┘
```

---

#### ★ 10. Kanban CRM — `…/crm/deals`

Le kanban actuel est un `flex` de colonnes `w-64` fixes en scroll horizontal (`DealKanban.tsx:116,135`) et n'affiche que 4 des 7 stades (`:15` vs `Deals.tsx:170-181`).

```
375 px                                      ≥ 1280 px
┌────────────────────────────────────┐     ┌──────┬────────────────────────────────────────────────────────────────────┐
│ ‹ Affaires        [Liste][Kanban]  │     │ SIDE │ CRM › Affaires        [Liste][Kanban]  [Filtres]  [+ Affaire]       │
├────────────────────────────────────┤     │ BAR  ├──────┬──────┬──────┬──────┬──────┬──────┬──────────────────────────┤
│ ‹ Qualifié (6) ›        12,4 M     │     │      │Nouv.4│Qual.6│RDV  3│Visit5│Négo 2│Gagné1│ Perdu 3                  │
│   ▁▂█▃▁▁▁  ← position dans les 7   │     │      │ 8,1M │12,4M │ 6,0M │9,2M  │15,5M │4,0M  │  —                       │
├────────────────────────────────────┤     │      ├──────┼──────┼──────┼──────┼──────┼──────┼──────────────────────────┤
│ ┌────────────────────────────────┐ │     │      │┌────┐│┌────┐│┌────┐│┌────┐│┌────┐│┌────┐│                          │
│ │ Achat · Cocody                 │ │     │      ││card│││card│││card│││card│││card│││card││                          │
│ │ Awa Koné                       │ │     │      │└────┘│└────┘│└────┘│└────┘│└────┘│└────┘│                          │
│ │ 45 000 000 FCFA                │ │     │      │┌────┐│┌────┐│      │┌────┐│      │      │                          │
│ │ Prochaine action : 05/10     ⋮ │ │     │      ││card│││card│││      ││card│││      ││    ││                        │
│ ├────────────────────────────────┤ │     │      │└────┘│└────┘│      │└────┘│      │      │                          │
│ │ Location · Riviera             │ │     └──────┴──────┴──────┴──────┴──────┴──────┴──────┴──────────────────────────┘
│ │ Ibrahim Traoré                 │ │
│ │ 350 000 FCFA / mois          ⋮ │ │     **7 colonnes, pas 4** : le tableau des stades devient une constante
│ └────────────────────────────────┘ │     partagée `constants/crm-stages.ts`, importée par la vue liste et le kanban.
├────────────────────────────────────┤
│ 🏠  🏢   📄   💰   ⋯    [ + ]      │ ▮   < 992 px : **une colonne d'étape à la fois**, changement par les flèches
└────────────────────────────────────┘     ou par balayage horizontal du *conteneur d'étapes* (pas des cartes).
```

Le changement d'étape sur mobile n'est **pas** un glisser-déposer (ingérable au pouce sur une colonne hors écran) : c'est une action « Déplacer vers… » du menu `⋮`, en bottom-sheet listant les 7 stades. Le glisser-déposer reste disponible ≥ 992 px.

---

#### ★ 11. Lots de copropriété — `…/syndics/:id/lots`

C'est le seul écran qui applique déjà le bon pattern (`responsive: ['md']`/`['lg']` sur 3 colonnes, `sticky`, `scroll={{x:1400}}` — `components/syndics/LotTable.tsx:74,119,144,202,203`). Il devient la référence de `<DataView>`.

```
375 px                                      ≥ 1280 px
┌────────────────────────────────────┐     ┌──────┬────────────────────────────────────────────────────────────────────┐
│ ‹ Lots — Résidence Les Palmiers ▾  │     │ SIDE │ Syndic › Les Palmiers › Lots      [Importer] [Filtres] [+ Lot]      │
├────────────────────────────────────┤     │ BAR  ├─────┬──────────┬──────────┬─────────┬──────────┬────────┬────────┤
│ 48 lots · 10 000 tantièmes         │     │      │ N°  │ Type     │ Tantièmes│ Spéciaux│Proprio   │Locataire│Actions │
│              [Filtres] [Importer]  │     │      ├─────┼──────────┼──────────┼─────────┼──────────┼────────┼────────┤
├────────────────────────────────────┤     │      │ A-01│Appartement│    250   │    40   │ K. Bamba │M. Diallo│[⋯]    │
│ ┌────────────────────────────────┐ │     │      │ A-02│Appartement│    180   │    30   │ A. Koné  │ —       │[⋯]    │
│ │ A-01 · Appartement           ⋮ │ │     │      │ P-01│Parking    │     15   │     0   │ K. Bamba │ —       │[⋯]    │
│ │ 250 tantièmes (2,5 %)          │ │     │      └─────┴──────────┴──────────┴─────────┴──────────┴────────┴────────┘
│ │ Prop. K. Bamba                 │ │     │      │  Total en pied : 10 000 tantièmes · contrôle de cohérence affiché │
│ │ Loc.  M. Diallo                │ │     └──────┴────────────────────────────────────────────────────────────────────┘
│ │ Solde   -125 000 FCFA        ⚠ │ │
│ │ ───────────────────────────────│ │     768–991 px : Type et Spéciaux masqués (`responsive: ['lg']` — déjà en place)
│ │            [  Voir le compte ] │ │
│ └────────────────────────────────┘ │     Formulaire de lot (6 champs) : **page pleine** sous 768 px
├────────────────────────────────────┤     (aujourd'hui : modale 520 px en `Col span={12}`, SyndicLots.tsx:563-585).
│ 🏠  🏢   📄   💰   ⋯    [ + ]      │ ▮
└────────────────────────────────────┘     Le sélecteur de copropriété (▾ dans l'en-tête) remplace la mémorisation
                                            implicite en `localStorage` (`sidebar.tsx:76-88`).
```

---

#### ★ 12. Portail locataire — accueil `/tenant`

```
375 px  (référence — usage 100 % mobile)         ≥ 1280 px (occasionnel)
┌────────────────────────────────────┐          ┌────────────────────────────────────────────────────────────┐
│ ImmoPro                    KN  ⋮   │          │  Contenu centré, max-width 800 px, mêmes blocs sur 2 col.  │
├────────────────────────────────────┤          │  Pas de sidebar : le portail locataire n'a que 4           │
│ Bonjour Koffi                      │          │  destinations, exposées en barre d'onglets horizontale     │
│ Villa Cocody · BAIL-2026-0184      │          │  sous l'en-tête.                                           │
├────────────────────────────────────┤          └────────────────────────────────────────────────────────────┘
│ ┌────────────────────────────────┐ │
│ │  À PAYER                       │ │  ← LE bloc de l'écran : 32 px, tabular-nums
│ │  485 000 FCFA                  │ │
│ │  Échéance le 05/10 · dans 3 j  │ │
│ │                                │ │
│ │  [  Déclarer un paiement    ]  │ │  ← 48 px, pleine largeur, action primaire unique
│ └────────────────────────────────┘ │
│ ┌───────────────┐┌───────────────┐ │
│ │ DÉPÔT         ││ INCIDENT      │ │
│ │ 900 000 FCFA  ││ #221 en cours │ │
│ └───────────────┘└───────────────┘ │
│                                    │
│ DERNIERS PAIEMENTS                 │
│ ✔ 02/09  485 000  Orange Money     │
│ ✔ 03/08  485 000  Wave             │
│ ⏳ 03/10 300 000  en attente de     │
│           validation               │
│  Voir tout →                       │
├────────────────────────────────────┤
│  🏠      💳      🔧      📄        │ ▮
└────────────────────────────────────┘
  Accueil  Payer  Incidents  Mon bail
```

**États.** Aucun bail actif → `<StateBlock variant="empty">` « Aucun bail actif — contactez votre agence » + bouton d'appel direct (`tel:`). Hors-ligne → bandeau + montant dû affiché depuis le cache avec sa date, bouton « Déclarer » actif (mise en file). Solde à zéro → le bloc devient vert « À jour · prochaine échéance le 05/11 ».

---

## 7. Accessibilité

**Cible : WCAG 2.1 niveau AA / RGAA 4.1.** État de départ : **11 occurrences de `aria-label`** dans 234 fichiers, aucun repère ARIA, aucun _skip link_, aucune gestion de focus au-delà du comportement natif d'AntD, et des actions de tableau en icône seule dont une partie n'a même pas d'infobulle (`rental/Payments.tsx:288-295`, `rental/Installments.tsx:544-576`) ou n'a qu'un attribut HTML `title` (`properties/Properties.tsx:614-654`, `crm/Deals.tsx:549-580`), invisible au clavier et inconstant chez les lecteurs d'écran.

Le seul point conforme aujourd'hui est le fallback de route : `role="status"` + `aria-live="polite"` + `aria-label` (`App.tsx:132-141`). Il sert de modèle.

### 7.1 Exigences par type de composant

| Composant                              | Exigences                                                                                                                                                                                                                                                                                                                   |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Bouton icône seule**                 | `aria-label` obligatoire, décrivant l'action **et son objet** (« Supprimer le bail BAIL-2026-0184 », pas « Supprimer »). L'infobulle n'est jamais l'unique porteuse du sens. Règle ESLint `jsx-a11y/control-has-associated-label` activée en `error`.                                                                       |
| **Table**                              | `<caption>` ou `aria-label` sur le tableau ; `scope="col"` sur les en-têtes (AntD le fait) ; en-têtes de tri annoncés via `aria-sort`. Chaque action de ligne porte le libellé de la ligne. En vue carte, la carte est un `<a>` ou un `<article>` contenant un lien nommé — jamais un `<div onClick>`.                      |
| **Formulaire**                         | `<label>` associé (`Form.Item` d'AntD le produit) ; message d'erreur lié par `aria-describedby` et `aria-invalid="true"` ; champs obligatoires marqués visuellement **et** par `required`. À la soumission invalide : focus sur le premier champ fautif + annonce `aria-live="assertive"` « 3 erreurs dans le formulaire ». |
| **Modale / Drawer / bottom-sheet**     | `role="dialog"` `aria-modal="true"` `aria-labelledby` (le titre). Voir §7.2.                                                                                                                                                                                                                                                |
| **Barre d'onglets basse**              | `<nav aria-label="Navigation principale">` avec une liste de liens ; l'onglet courant porte `aria-current="page"`. Ce n'est pas un `tablist` (ce sont des destinations, pas des panneaux).                                                                                                                                  |
| **Onglets** (détail de bail, portails) | `role="tablist"` / `tab` / `tabpanel`, navigation par flèches, `aria-selected`. AntD `Tabs` le fournit — ne pas le réimplémenter à la main comme le fait `admin/TenantDetail.tsx`.                                                                                                                                          |
| **`StatusTag`**                        | La couleur ne porte jamais seule l'information : le libellé textuel est toujours présent (déjà le cas), et une **forme** distingue les statuts critiques (● plein = actif, ○ vide = terminé, ⚠ = en retard).                                                                                                                |
| **Graphiques Recharts**                | Alternative textuelle : chaque graphique est doublé d'un tableau de données accessible, replié derrière « Voir les données » (`<details>`). Les 3 graphiques du dashboard CRM sont concernés.                                                                                                                               |
| **Upload / appareil photo**            | Bouton avec libellé explicite, liste des fichiers en `<ul>`, bouton de retrait nommé (« Retirer reçu.jpg »), statut d'envoi en `aria-live="polite"`.                                                                                                                                                                        |
| **Toasts**                             | `role="status"` `aria-live="polite"` pour le succès, `role="alert"` `aria-live="assertive"` pour l'erreur. Les erreurs ne disparaissent pas automatiquement.                                                                                                                                                                |

### 7.2 Stratégie de focus

| Situation                                      | Règle                                                                                                                                                                                                                                                                       |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ouverture d'une modale / drawer / bottom-sheet | Focus sur le **titre** (`tabindex="-1"`), pas sur le premier champ : le lecteur d'écran doit annoncer le contexte avant de demander une saisie.                                                                                                                             |
| Pendant l'ouverture                            | Piège de focus strict : `Tab` cycle à l'intérieur ; le reste de la page reçoit `aria-hidden="true"` (`inert` quand disponible). AntD `Modal`/`Drawer` le font ; les modales Tailwind maison de `crm/Deals.tsx` **ne le font pas** — c'est une raison de plus de les migrer. |
| Fermeture                                      | Focus **restitué à l'élément déclencheur**. En sortie de bottom-sheet ouvert depuis une carte, focus sur cette carte.                                                                                                                                                       |
| `Échap`                                        | Ferme toujours la couche la plus haute. Sur un formulaire modifié, `Échap` déclenche `<UnsavedGuard>` au lieu de fermer.                                                                                                                                                    |
| Bottom-sheet                                   | Même contrat que la modale, plus : le geste « glisser vers le bas » a un équivalent bouton `✕` nommé « Fermer », 44×44. Le drawer actuel a `closable={false}` (`sidebar.tsx:717`, `TenantPortal/Layout.tsx:235`) — **aucun moyen de fermer au clavier**.                    |
| Navigation                                     | Après un changement de route, focus sur le `<h1>` de la nouvelle page + annonce `aria-live` « Baux — page chargée ». Sans cela, le lecteur d'écran reste sur l'ancien contexte : la coquille au niveau route (§4.1) rend ce comportement implémentable en un seul endroit.  |
| Indicateur visuel                              | `:focus-visible` de 2 px, couleur `--color-primary`, offset 2 px, **jamais supprimé**. Les primitives shadcn utilisent `focus-visible:ring-slate-950` (`components/ui/button.tsx:8`) — remplacé par le token.                                                               |

### 7.3 Contrastes — mesures et corrections

Les deux contrastes signalés « à vérifier » dans l'overview **ont été mesurés et sont conformes** :

| Paire                                                              | Ratio mesuré | Verdict                         |
| ------------------------------------------------------------------ | ------------ | ------------------------------- |
| `slate-600` `#475569` sur `slate-50` `#F8FAFC`                     | **7,25:1**   | ✔ AA et AAA — aucune correction |
| `#94A3B8` sur `#0F172A` (sous-titre de sidebar, `sidebar.tsx:592`) | **7,11:1**   | ✔ AA et AAA — aucune correction |

Les défauts réels sont ailleurs :

| Paire                                                                 | Ratio      | Où                                                                                                            | Correction                                                                                                     |
| --------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `#BFBFBF` sur `#FFFFFF`                                               | **1,84:1** | Icône de recherche du header (`header.tsx:110`)                                                               | `--text-tertiary` `#64748B` (4,55:1) — ou disparaît avec le champ (§4.4)                                       |
| `rgba(0,0,0,0.45)` sur blanc (`colorTextDescription` AntD par défaut) | **~3,0:1** | Tous les `Text type="secondary"`, descriptions d'`Empty`, textes d'aide                                       | `colorTextSecondary: #475569` posé au `ConfigProvider` (§3.2) → **7,25:1**                                     |
| `#1890FF` sur `#FFFFFF`                                               | **3,24:1** | Liens et boutons `type="link"` sur toutes les pages AntD                                                      | `--color-primary` `#2563EB` → **5,17:1**                                                                       |
| `#3B82F6` sur `#FFFFFF`                                               | **3,68:1** | Boutons et liens des 15 pages Tailwind                                                                        | idem → **5,17:1**                                                                                              |
| Couleur héritée, non maîtrisée                                        | n/a        | `text-muted-foreground` non résolu (`components/ui/table.tsx:59,83`, `tabs.tsx:14`, + 5 fichiers applicatifs) | Disparaît avec la suppression de `components/ui/`                                                              |
| `disabled:opacity-50` sur `bg-slate-900/text-slate-50`                | **~2,4:1** | `components/ui/button.tsx:8`                                                                                  | État désactivé tokenisé : fond `--neutral-100`, texte `--text-disabled`, **jamais seul porteur d'information** |
| `Tag` AntD à couleur _preset_                                         | variable   | ~90 fichiers                                                                                                  | `<StatusTag>` avec un couple fond/texte validé par statut, issu de `--color-*-bg` / `--color-*-text` (§3.2)    |

**Règle de recette** : tout couple couleur introduit passe le vérificateur avant merge. Un script `npm run a11y:contrast` lit `tokens.css` et échoue si un couple déclaré descend sous 4,5:1 (texte) ou 3:1 (composants et icônes porteuses de sens).

### 7.4 Navigation clavier, repères et skip link

- **Skip link** : premier élément focusable du document, « Aller au contenu principal », visible au focus, cible `#main`. Un seul emplacement à implémenter grâce à `<AppShell>`.
- **Repères ARIA** : `<header role="banner">`, `<nav role="navigation" aria-label="Menu principal">`, `<main id="main" role="main">`, `<nav aria-label="Fil d'Ariane">`. Aucun aujourd'hui.
- **Ordre de tabulation** = ordre visuel. La barre d'action basse `sticky` est **après** le contenu dans le DOM (elle est visuellement en bas), pas avant.
- **Zoom** : le contenu reste utilisable à **200 %** sans défilement horizontal du `<body>`, et à **400 %** en une colonne (WCAG 1.4.10). Le `viewport` d'`index.html:5` est correct (pas de `maximum-scale`) et le reste.
- **Aucun piège au clavier** : le carrousel de médias, le kanban et le calendrier sont pilotables aux flèches et quittables au `Tab`.
- **Cible tactile** ≥ 44×44 (WCAG 2.5.5 AAA, retenu comme exigence AA interne — voir §5.5).

### 7.5 Checklist de recette accessible (utilisable par un développeur, sans outil spécialisé)

Un écran refondu n'est « fait » que si les 14 points passent.

**Clavier (débranchez la souris)**

1. `Tab` atteint tous les contrôles interactifs, dans l'ordre visuel, sans saut ni piège.
2. L'anneau de focus est visible sur **chaque** élément atteint, y compris sur fond sombre.
3. Le skip link apparaît au premier `Tab` et fonctionne.
4. Chaque action déclenchable à la souris l'est à `Entrée` **et** `Espace` (bouton) ou `Entrée` (lien).
5. `Échap` ferme la couche ouverte ; le focus revient au déclencheur.
6. Dans une modale, `Tab` ne sort jamais de la modale.

**Structure et libellés** 7. Un seul `<h1>` par page, titres hiérarchisés sans saut de niveau. 8. Aucun bouton icône seule sans `aria-label` explicite : `document.querySelectorAll('button:not([aria-label])')` filtré sur ceux sans texte doit renvoyer 0. 9. Chaque champ a un `<label>` visible (pas seulement un placeholder). 10. Les repères `banner` / `navigation` / `main` sont présents une fois chacun.

**Perception** 11. En niveaux de gris, l'information reste lisible : aucun statut, aucune erreur, aucun graphique n'est distinguable par la seule couleur. 12. À 200 % de zoom, aucune barre de défilement horizontale sur le `<body>`, aucun texte tronqué. 13. Toutes les images porteuses de sens ont un `alt` ; les images décoratives ont `alt=""`.

**Dynamique** 14. Chargement, succès, erreur et changement de page sont annoncés (`aria-live`) : activez le lecteur d'écran système (VoiceOver / TalkBack / NVDA) et effectuez le parcours principal les yeux fermés.

Priorité **P0** pour les points 1-6 et 8-10 sur les écrans des Lots 1-4 ; audit RGAA complet et corrections résiduelles en Lot 5. Effort : **L — 10 j** répartis, dont 3 j d'audit.

---

## 8. Performance et résilience réseau

### 8.1 Budgets chiffrés

Terminal de référence : **Android milieu de gamme** (4 cœurs, ~2 Go de RAM, classe Moto G / Tecno Camon), Chrome, **3G rapide émulée** (1,6 Mb/s descendant, 750 Kb/s montant, 300 ms de RTT) et CPU ×4 ralenti. Mesure sur le parcours réel, pas sur la page d'accueil.

| Métrique                           | Budget                      | Écran de référence                                                                                                           |
| ---------------------------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **LCP** — 4G                       | ≤ 2,0 s                     | `/tenant` (portail locataire)                                                                                                |
| **LCP** — 3G rapide                | **≤ 4,0 s**                 | `/tenant`                                                                                                                    |
| **INP**                            | ≤ 200 ms (p75)              | `…/rental/installments` (défilement + filtres)                                                                               |
| **CLS**                            | ≤ 0,10                      | Toutes — obtenu par squelettes dimensionnés et `aspect-ratio` sur les images                                                 |
| **TTI** — 3G rapide                | ≤ 5,0 s                     | `/login` → `/dashboard`                                                                                                      |
| **Chunk d'entrée** (JS gzip)       | **≤ 220 Ko**                | Aujourd'hui : `Login` non-`lazy` (`App.tsx:10`) + `ConfigProvider` + `Spin` + header + sidebar → tout AntD est dans l'entrée |
| **Chunk de route** (JS gzip)       | ≤ 120 Ko                    | `vite.config.ts:37` fixe `chunkSizeWarningLimit: 900` (Ko **non compressés**) : le garde-fou actuel est ~4× trop permissif   |
| **Vendor AntD** (gzip)             | ≤ 190 Ko                    | Chunk isolé et mis en cache long                                                                                             |
| **CSS total** (gzip)               | ≤ 60 Ko                     |                                                                                                                              |
| **Polices**                        | ≤ 45 Ko                     | 1 fichier Inter variable, sous-ensemble latin + latin-ext                                                                    |
| **Requêtes au montage d'un écran** | **≤ 3**                     | Aujourd'hui : jusqu'à **101** sur `…/patrimoine`                                                                             |
| **Poids d'une image de carte**     | ≤ 60 Ko (AVIF/WebP, 640 px) |                                                                                                                              |

**Mise en application.** `vite.config.ts` reçoit `build.rollupOptions.output.manualChunks` séparant `antd` + `@ant-design/icons`, `recharts`, `react-big-calendar`, `prismjs`, `framer-motion` en chunks distincts ; `chunkSizeWarningLimit` descend à **350** (≈ 120 Ko gzip). Un job CI (`size-limit` ou `rollup-plugin-visualizer` + seuils) échoue au-delà des budgets. Un audit Lighthouse CI en profil mobile ralenti tourne sur 5 parcours et bloque la merge sur régression de LCP ou de poids.

### 8.2 Découpage et chargement

- `Login` passe en `lazy` : il est aujourd'hui le seul écran importé statiquement (`App.tsx:10`), ce qui tire AntD et 9 comptes de test dans le chunk d'entrée.
- Les imports morts `PropertyPublic` / `PropertyPublicDetail` (`App.tsx:16-17`) sont retirés : ils gonflent le chunk `properties` sans être atteignables.
- `react-big-calendar` (+ sa CSS) n'est chargé que par `crm/Calendar.tsx` : maintenu dans le chunk `crm`, mais l'écran par défaut sous 992 px est la vue agenda, qui n'en a pas besoin → import dynamique à l'intérieur de la page.
- `prismjs` (`components/HtmlCodeEditor.tsx:3-5`) n'est utile qu'à l'éditeur de modèles newsletter : import dynamique.
- `framer-motion` n'anime que 3 composants du dashboard CRM : import dynamique ou remplacement par des transitions CSS (les animations concernées sont des fondus et des translations simples).
- `exceljs` est **déjà** en import dynamique (`utils/export-utils.ts:77`) — bon réflexe, à conserver et à généraliser.
- Préchargement : `<link rel="modulepreload">` du chunk de la destination probable au survol/`touchstart` d'une entrée de menu.

### 8.3 Images, médias et polices

- **Polices.** Remplacer l'`@import` Google Fonts de `index.css:1` (7 graisses, requête tierce **bloquante** avant même le premier octet de CSS applicative) par un **fichier Inter variable auto-hébergé**, sous-ensemble `latin` + `latin-ext`, `font-display: swap`, `<link rel="preload" as="font" crossorigin>` dans `index.html`. Gain attendu : 1 RTT tiers supprimé + ~150 Ko de moins.
- **Images de biens.** Le endpoint de liste renvoie `thumbnailUrl` en 3 tailles (320 / 640 / 1024) et 2 formats (AVIF, WebP) ; le front sert un `<picture>` avec `srcset`, `sizes`, `loading="lazy"`, `decoding="async"` et un conteneur en `aspect-ratio: 16/9`. Aujourd'hui, la vignette est obtenue par **une requête `/media` par carte** (`properties/Properties.tsx:248-276`).
- **Justificatifs et photos de tickets.** Compression **côté client** avant envoi (canvas, redimensionnement à 1 600 px de côté maximum, JPEG qualité 0,8, plafond 300 Ko). Une photo d'Android milieu de gamme fait 3 à 5 Mo : en 3G montante, c'est ~50 s d'attente et un échec probable. Les limites actuelles (5 Mo, `PaymentDeclarationModal.tsx:100-113` ; 10 fichiers × 5 Mo, `MaintenanceTicketModal.tsx:176-191`) autorisent jusqu'à 50 Mo par ticket.
- **Icônes.** `@ant-design/icons` et `lucide-react` cohabitent. Cible : `@ant-design/icons` seul, en imports nommés (déjà tree-shakables). `lucide-react` disparaît avec la migration des 15 pages Tailwind (Lots 2 et 4).

### 8.4 Cache, déduplication et correction des appels

**Constat vérifié** : `utils/api-client.ts` est une instance Axios unique, `withCredentials`, **sans `timeout`**, sans retry (hors le refresh 401 unique et bien fait, `:33-45`), et **aucun cache ni déduplication** dans les 24 services de `src/services/`.

**Décision : introduction de `@tanstack/react-query` v5** (~13 Ko gzip). Ce n'est pas un changement de framework : React 18, Vite 6, React Router 6 et TypeScript sont conservés. C'est la brique qui apporte, sans code maison, ce qu'exige le §8.5 : cache par clé, déduplication des requêtes concurrentes, `stale-while-revalidate`, retry exponentiel, invalidation ciblée après mutation, et persistance de la file de mutations hors-ligne.

Conventions : clé = `[entité, tenantId, filtres]`, `staleTime` de 30 s sur les listes et 5 min sur les référentiels (prestataires, communes, types de bien), invalidation explicite après chaque mutation. `apiClient` reçoit `timeout: 20000` et un retry (2 tentatives, backoff 1 s / 3 s) **sur les seules requêtes `GET`** — jamais sur les mutations, qui passent par la file.

**Corrections nommées :**

| Problème                                                                              | Fichier:ligne                                                                                              | Correction                                                                                                                                          |
| ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **N+1 travaux** : 1 requête par bien, jusqu'à 100                                     | `patrimoine/PatrimoineOverviewPage.tsx:36,41-46`                                                           | Endpoint agrégé `GET /api/tenants/:id/patrimoine/overview?page=&limit=` renvoyant biens **et** programmes de travaux. **1 requête au lieu de 101.** |
| **N+1 travaux (bis)** + filtre client après téléchargement complet                    | `patrimoine/work-programs/WorkProgramsPage.tsx:31-38`, `:48`                                               | `GET /api/tenants/:id/work-programs?status=&page=&limit=` — paginé et filtré côté serveur.                                                          |
| **N+1 média** : 1 requête `/media` par carte                                          | `properties/Properties.tsx:248-276`                                                                        | `thumbnailUrl` inclus dans la réponse de `listProperties`.                                                                                          |
| **Recherche client sur données paginées serveur** (résultats partiels, compteur faux) | `crm/Deals.tsx:95-120`, `properties/Properties.tsx:153-206`, `Clients.tsx:178-179`                         | Paramètre `q` envoyé à l'API, debounce 250 ms, `AbortController`.                                                                                   |
| **Double filtrage** serveur + colonne AntD                                            | `OwnerPortal/Maintenance.tsx:209-213` vs `:258-292` ; `OwnerPortal/Installments.tsx:198-206` vs `:311-323` | Suppression des `filters`/`onFilter` de colonne.                                                                                                    |
| **Double fetch** au clic de filtre                                                    | `admin/maintenance/Tickets.tsx:78-82` + `:297-306`                                                         | Un seul déclencheur (le bouton).                                                                                                                    |
| **1+N upload** : création puis 1 requête par pièce jointe, état incohérent si échec   | `tenant/maintenance/CreateTicket.tsx:120,126-136`                                                          | POST multipart unique (le portail le fait déjà, `MaintenanceTicketModal.tsx:53-58`).                                                                |
| **Double fetch au montage + rechargement complet sur `visibilitychange`**             | `TenantPortal/Payments.tsx:199-205`, `:207-216`                                                            | Un appel agrégé ; `visibilitychange` déclenche une revalidation en arrière-plan, pas un retour au squelette.                                        |
| **Référentiel rechargé à chaque montage**                                             | `components/maintenance/VendorSelect.tsx:23-46`                                                            | Requête mise en cache 5 min.                                                                                                                        |
| **Cascade de complétion de noms** après le chargement principal                       | `rental/LeaseDetailPage.tsx:57-80`                                                                         | Noms de locataire et de propriétaire inclus dans la réponse du bail.                                                                                |

Les 10 corrections sont **des ajouts ou des enrichissements de réponse côté API, pas des ruptures** : les endpoints existants restent en place et continuent de répondre à l'identique. Seule la suppression éventuelle du endpoint `/properties/:id/media` en tant qu'appel unitaire par carte serait une rupture — elle n'est pas demandée : le endpoint reste, il cesse simplement d'être appelé en boucle.

### 8.5 Hors-ligne et file d'attente

Il n'existe aujourd'hui **aucun service worker, aucun manifeste, aucune détection de connexion** (vérifié : `apps/web/index.html` et `vite.config.ts` ne contiennent ni `manifest`, ni `serviceWorker`, ni `vite-plugin-pwa`). L'exigence « utilisable en 3G et hors-ligne partiel » est aujourd'hui non tenue.

**Périmètre volontairement restreint à 5 parcours terrain**, pour que l'effort soit tenable et la promesse honnête :

| Parcours                             | Lecture hors-ligne | Écriture hors-ligne           |
| ------------------------------------ | ------------------ | ----------------------------- |
| Consulter la liste des biens         | ✔ (dernier cache)  | —                             |
| Consulter un bail et ses échéances   | ✔                  | —                             |
| **Encaisser un paiement**            | ✔                  | **✔ (file)**                  |
| **Déclarer un paiement** (locataire) | ✔                  | **✔ (file)**                  |
| **Créer un ticket de maintenance**   | ✔                  | **✔ (file, photos incluses)** |

Tout le reste (comptabilité, budgets, administration, campagnes) affiche le bandeau hors-ligne et désactive ses actions. C'est un choix : promettre le hors-ligne partout serait invérifiable.

**Mise en œuvre.**

- `vite-plugin-pwa` (Workbox). Précache de la coquille (`index.html`, chunk d'entrée, CSS, police, icônes). **Aucun `manifest` d'installation** dans un premier temps : l'objectif est la résilience réseau, pas l'installation.
- Stratégie par ressource : `CacheFirst` pour la police et les assets versionnés ; `StaleWhileRevalidate` pour les images de biens ; **`NetworkFirst` avec `networkTimeoutSeconds: 4` et repli sur le cache** pour les `GET` d'API des 5 parcours ; jamais de cache sur `/auth/*`.
- **File de mutations** : `persistQueryClient` + `onlineManager` de React Query, stockage IndexedDB. Chaque mutation en file porte son `idempotency_key` — le modèle le prévoit déjà : `RentalPayment.idempotency_key` avec `@@unique([tenant_id, idempotency_key])` (`prisma/schema.prisma:1819-1861`). Un rejeu après reconnexion ne peut donc pas produire de doublon d'encaissement. **C'est la garantie qui rend la file acceptable pour de l'argent.**
- **Retour visuel** : bandeau global (§5.6), badge « N en attente » sur la barre d'onglets, et chaque élément en file marqué « En attente d'envoi » avec possibilité de le rouvrir et de le corriger. En cas d'échec définitif (conflit serveur), l'élément passe en « Échec » avec le motif et un bouton « Réessayer ».
- **Brouillons de formulaire** en IndexedDB (§5.2), indépendants de la file : ils protègent la saisie, la file protège l'envoi.

Priorité **P1**, effort **L — 8 j**.

---

## 9. Plan de migration

Six lots, 128 j-h de développement. Aucun gel de fonctionnalités : chaque lot est déployable seul et laisse l'application dans un état cohérent.

### Lot 0 — Fondations (22 j-h) · S1–S3

|                                     |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Périmètre**                       | `tokens.css` (§3.2) ; `ConfigProvider` thémé + `locale={frFR}` + `dayjs.locale('fr')` ; `tailwind.config.js` réaligné sur les breakpoints AntD (§3.4) ; `<App>` d'AntD + migration des 47 pages (70 fichiers) vers `App.useApp()` ; hook `useBreakpoint()` remplaçant `useMediaQuery` ; primitives `<PageHeader>`, `<StateBlock>`, `<Skeleton*>`, `<StatusTag>`, `<ConfirmAction>`, `<MoneyValue>` ; suppression des 29 `alert()`/`window.confirm()` ; `components/ui/wizard.tsx` supprimé ; règle ESLint `no-restricted-imports` sur `components/ui/` ; budgets de bundle et `manualChunks` dans `vite.config.ts` ; police Inter auto-hébergée. |
| **Écrans touchés**                  | Aucun écran refondu. 70 fichiers modifiés mécaniquement (`App.useApp()`), 12 pour les confirmations natives.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **Dépendances**                     | Aucune. C'est le point de départ obligatoire.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **Critères de sortie**              | Les deux design systems rendent des couleurs, rayons et hauteurs **identiques**. Zéro `alert()`/`window.confirm()` dans le dépôt. Zéro `message.*` statique. `npm run a11y:contrast` passe. Le chunk d'entrée est mesuré et publié comme référence. Les `DatePicker` et `Pagination` sont en français.                                                                                                                                                                                                                                                                                                                                           |
| **Ce qui casse pour l'utilisateur** | **Rien de fonctionnel.** Changement visuel : les bleus s'harmonisent, les contrôles grandissent (36 px desktop, 44 px mobile), les dates passent en français. Les boîtes de dialogue natives deviennent des dialogues applicatifs. À annoncer, pas à cacher.                                                                                                                                                                                                                                                                                                                                                                                     |

### Lot 1 — Coquille et navigation (18 j-h) · S4–S6

|                        |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Périmètre**          | `<AppShell>` au niveau route + `<Outlet/>`, retrait de `DashboardLayout` des 81 pages (codemod) ; fusion des 3 coquilles ; `<BottomTabBar>` par persona ; `<AppHeader>` (retrait du champ de recherche inerte et du bouton « FR ») ; `<Breadcrumbs>` ; rail de 72 px au palier `md` ; drawer avec bouton de fermeture + un seul groupe ouvert ; actions sorties du menu (FAB) ; `<AccessDenied>` et `<NotFound>` + route `path="*"` ; `requireTenant` activé sur les routes `/tenant/:tenantId/*` ; garde défensive du portail propriétaire ; suppression des 5 écrans orphelins et des imports morts ; purge des comptes de test de `Login.tsx` et passage en `lazy`. |
| **Écrans touchés**     | Les 100 écrans (coquille), 5 supprimés, `/login` refondu.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **Dépendances**        | Lot 0.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **Critères de sortie** | Un parcours mobile complet (accueil → bail → échéance → encaissement) se fait **sans ouvrir le drawer**. Le fil d'Ariane est présent sur les écrans à ≥ 2 niveaux. Aucune URL n'aboutit à un écran blanc. Aucun mot de passe dans le bundle de production (vérifié par un grep en CI). Scroll conservé au retour arrière.                                                                                                                                                                                                                                                                                                                                              |
| **Ce qui casse**       | La navigation change visiblement pour tous. Le champ de recherche du header disparaît (il ne fonctionnait pas). Les entrées « Ajouter… » quittent le menu → **communication utilisateur obligatoire**, avec une courte visite guidée au premier lancement.                                                                                                                                                                                                                                                                                                                                                                                                             |

### Lot 2 — Listes, filtres et données (26 j-h) · S7–S10

|                        |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Périmètre**          | `<DataView>` + `<DataCard>` + `<FilterSheet>` + `<StatCard>` ; introduction de React Query et conventions de cache ; `timeout` et retry sur `apiClient` ; application aux 11 écrans P0 puis aux 12 écrans P1 du §5.1 ; filtres, tri et page persistés dans l'URL sur toutes les listes ; correction des 6 défauts de filtrage/pagination du §8.4 ; migration AntD des 3 pages CRM en Tailwind (`Deals`, `DealFormPage`, `DealDetailPage`) et correction des 7 stades du kanban. |
| **Écrans touchés**     | 23 écrans de liste + 3 pages CRM.                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **Dépendances**        | Lots 0 et 1. Les endpoints agrégés du §8.4 doivent être livrés côté API **avant** les écrans Patrimoine.                                                                                                                                                                                                                                                                                                                                                                        |
| **Critères de sortie** | Aucun `<Table>` sans stratégie carte/colonnes prioritaires sur les 23 écrans. Aucun filtrage en mémoire sur données paginées. Une liste filtrée est partageable par URL. Aucun écran ne dépasse 3 requêtes au montage.                                                                                                                                                                                                                                                          |
| **Ce qui casse**       | Sur mobile, les tableaux deviennent des cartes : changement de représentation majeur, à annoncer. Les résultats de recherche deviennent **corrects** — ils peuvent donc différer de ce que les utilisateurs voyaient (moins de résultats affichés mais un compteur juste). À expliquer explicitement, sinon ce sera perçu comme une régression.                                                                                                                                 |

### Lot 3 — Parcours terrain du collaborateur (24 j-h) · S11–S13

|                        |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Périmètre**          | Tableau de bord collaborateur actionnable ; `<FormSheet>` + `<Wizard>` mobile + `<UnsavedGuard>` + brouillons locaux ; refonte des écrans Échéances, Paiements, Détail de bail, Liste et Fiche de bien, Tickets ; les deux wizards ; `<AttachmentUploader>` avec compression client ; écran unique de création de ticket (back-office et portail) ; recherche globale (front + endpoint) ; module Syndic : 6 formulaires en pages pleines, `<DataView>` sur Lots / Charges / Recouvrement. |
| **Écrans touchés**     | ~25 écrans, dont les 8 les plus critiques du terrain.                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **Dépendances**        | Lots 0-2. L'endpoint de recherche globale doit être livré à S12.                                                                                                                                                                                                                                                                                                                                                                                                                           |
| **Critères de sortie** | Créer un bail sur mobile prend moins de 4 min (mesuré, §10). Aucun formulaire de plus de 3 champs ne s'ouvre en modale sous 768 px. Quitter un formulaire modifié demande confirmation. Une saisie interrompue est restaurée.                                                                                                                                                                                                                                                              |
| **Ce qui casse**       | Rien fonctionnellement. Les modales du module Syndic deviennent des pages : les URL profondes changent (ajouts, pas de suppressions).                                                                                                                                                                                                                                                                                                                                                      |

### Lot 4 — Portails et fin de coexistence (20 j-h) · S14–S16

|                        |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Périmètre**          | Portail locataire complet (coquille 4 onglets, accueil, paiements, déclaration en page pleine, incidents, bail à onglets) ; portail propriétaire (5 onglets, fusion des 4 écrans financiers, `<DataView>`) ; migration AntD des 8 pages Tailwind restantes (`Register`, `VerifyEmail`, `AuthCallback`, `settings/SettingsLayout`, `crm/Dashboard`, `admin/TenantDetail`, `admin/AdminCollaboratorDetail`, `admin/AdminInviteCollaborator`) ; éditeur de mapping WhatsApp ; aperçu en direct des modèles newsletter ; **suppression de `components/ui/`, `@radix-ui/*`, `class-variance-authority`, `tailwind-merge` et `lucide-react`** et du hack z-index de `index.css:41-43`. |
| **Écrans touchés**     | 18 écrans de portail + 8 pages Tailwind + 2 écrans Communication.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| **Dépendances**        | Lots 0-3.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **Critères de sortie** | `grep -r "components/ui" apps/web/src` renvoie 0. Aucune dépendance Radix/CVA dans `package.json`. Le portail locataire passe l'audit mobile (§10) sur un Android milieu de gamme réel. Un seul design system dans le dépôt.                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **Ce qui casse**       | Refonte visible des deux portails. Le mapping WhatsApp change de mode de saisie (le JSON reste accessible en mode avancé) → prévenir les agences qui l'ont configuré.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

### Lot 5 — Accessibilité, performance, hors-ligne (18 j-h) · S17–S19

|                        |                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Périmètre**          | Audit RGAA sur les 20 écrans principaux et corrections ; skip link, repères, gestion de focus, `aria-label` sur toutes les actions icône ; alternatives textuelles des graphiques ; service worker (`vite-plugin-pwa`) et stratégies de cache ; file de mutations hors-ligne sur les 5 parcours ; images `srcset`/AVIF ; Lighthouse CI et `size-limit` bloquants ; nettoyage des libellés non accentués ; `<Skeleton*>` sur les écrans restants. |
| **Écrans touchés**     | Transverse.                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **Dépendances**        | Lots 0-4. Le hors-ligne suppose React Query en place (Lot 2).                                                                                                                                                                                                                                                                                                                                                                                    |
| **Critères de sortie** | Les 14 points de la checklist §7.5 passent sur les 20 écrans principaux. Les budgets du §8.1 sont tenus et vérifiés en CI. Les 5 parcours terrain fonctionnent en mode avion, et le rejeu à la reconnexion ne produit aucun doublon (test explicite sur `idempotency_key`).                                                                                                                                                                      |
| **Ce qui casse**       | Rien. Premier chargement légèrement plus long (installation du service worker), suivants nettement plus rapides.                                                                                                                                                                                                                                                                                                                                 |

### 9.7 Coexistence des deux design systems : comment éviter un état intermédiaire pire

Le risque principal de ce plan n'est pas l'échec technique, c'est **les 13 semaines (S3 → S16) pendant lesquelles la moitié de l'application est refondue et l'autre non**. Cinq garde-fous :

1. **Les tokens précèdent tout.** Le Lot 0 ne migre aucun écran ; il donne aux deux systèmes la **même** palette, les mêmes rayons, les mêmes hauteurs de contrôle. `tailwind.config.js` et le `ConfigProvider` lisent les mêmes variables CSS. Dès S3, un bouton shadcn et un bouton AntD sont visuellement interchangeables — l'incohérence visuelle est traitée **avant** la migration, pas par elle.
2. **La frontière est une règle, pas une intention.** `no-restricted-imports` sur `components/ui/` passe en `error` bloquant à la fin du Lot 0. Aucun nouvel écran ne peut naître du mauvais côté.
3. **La migration suit les parcours, pas les répertoires.** Un lot livre un parcours **entier** (Lot 3 : le terrain ; Lot 4 : les portails). Un utilisateur ne rencontre jamais deux styles à l'intérieur d'une même tâche — il peut en rencontrer deux entre deux tâches, ce qui est acceptable.
4. **Les écrans hybrides passent en premier dans leur lot.** Les 6 pages qui mélangent AntD et Tailwind dans le même écran (`properties/Properties`, `rental/{Installments,Payments,Documents,Penalties}`, `crm/Calendar`) et le cas `AdvancedFilters` AntD injecté dans la page shadcn `crm/Deals.tsx:426-436` sont les plus visiblement incohérents : ils sont traités en début de Lot 2, pas à la fin.
5. **Un écran refondu ne régresse pas.** La _Definition of Done_ du §10 s'applique écran par écran. Un écran qui ne passe pas les critères n'est pas livré à moitié : il est retiré du lot et reprogrammé.

**Ce qui n'est pas fait pendant la transition** : aucun nouvel écran n'est créé en dehors du système cible ; aucune correction esthétique ponctuelle n'est appliquée à un écran non encore migré (elle serait à refaire) ; les correctifs fonctionnels, eux, continuent normalement — le gel porte sur le style, pas sur le produit.

---

## 10. Definition of Done et KPIs

### 10.1 Definition of Done — par écran refondu

Un écran est « fait » quand les 6 blocs sont vérifiés. Aucun n'est optionnel.

**Design**

- Zéro valeur littérale de couleur, rayon, ombre ou espacement dans le fichier (vérifiable : `grep -E '#[0-9a-fA-F]{3,6}|px\)' ` sur le diff).
- Une seule action primaire ; les secondaires sont en `default`/`text` ou dans un menu `⋮`.
- `<PageHeader>` avec titre et fil d'Ariane ; aucun en-tête ad hoc.
- Les statuts passent par `<StatusTag>`, les montants par `<MoneyValue>`.

**Responsive**

- Rendu vérifié à **320, 375, 414, 768, 992, 1280 et 1600 px**.
- Aucun défilement horizontal du `<body>` à aucune de ces largeurs.
- Toute cible interactive ≥ 44×44 px sous 992 px.
- Action primaire dans les 96 px inférieurs sous 992 px.
- Tableau : stratégie carte/colonnes prioritaires appliquée, pas de `scroll={{x}}` sous 1200 px.
- Formulaire > 3 champs : page pleine sous 768 px.

**Accessibilité** — les 14 points de la checklist §7.5.

**Performance**

- ≤ 3 requêtes au montage ; aucun N+1 ; aucun filtrage en mémoire sur données paginées.
- Squelette dimensionné comme le contenu (CLS de l'écran ≤ 0,1, mesuré).
- Chunk de la route ≤ 120 Ko gzip.
- Images en `srcset` avec ratio réservé.

**États** — les 7 états sont implémentés et **démontrables** : chargement initial, rechargement, vide (aucune donnée), vide (aucun résultat pour ces filtres), erreur, hors-ligne, permission refusée. La recette exige de les montrer, pas d'y croire.

**Qualité**

- Filtres, tri et page dans l'URL ; l'écran est restaurable par son URL seule.
- Aucun texte FR nouveau écrit en dur hors du catalogue.
- Aucune régression fonctionnelle : le parcours principal de l'écran est rejoué avant/après.
- Aucun import de `components/ui/`.

### 10.2 KPIs produit — mesure avant / après

Mesure **avant** effectuée en fin de Lot 0 (avant toute refonte d'écran), **après** en fin de Lot 5, sur le même panel : 8 collaborateurs d'agence, 10 locataires, terminaux réels, réseau réel à Abidjan.

| #   | KPI                                                                          | Mesure                                                                           | Référence à établir                                                                                   | Cible                                                   |
| --- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| 1   | **Temps de création d'un bail sur mobile**                                   | Chronomètre, du tap « Nouveau bail » à la confirmation, 5 essais par utilisateur | à mesurer (le wizard 5 étapes n'est pas utilisable sur 375 px aujourd'hui — probablement non réalisé) | **< 4 min**                                             |
| 2   | **Taux d'abandon du wizard bien**                                            | Analytique : wizards commencés / soumis, par palier de largeur                   | à mesurer                                                                                             | **< 20 % sur mobile**, et écart mobile/desktop < 10 pts |
| 3   | **Temps d'encaissement d'un loyer**                                          | Du tableau de bord à la confirmation de paiement                                 | à mesurer                                                                                             | **< 60 s**                                              |
| 4   | **Part du trafic mobile servi sans dégradation**                             | Sessions < 992 px sans défilement horizontal du `<body>` et sans erreur JS       | à mesurer                                                                                             | **> 95 %**                                              |
| 5   | **Taux de déclaration de paiement par les locataires**                       | Déclarations / échéances dues, par mois                                          | à mesurer                                                                                             | **+50 % relatif**                                       |
| 6   | **Taps de navigation par tâche terrain**                                     | Comptage sur le parcours « encaisser 3 loyers »                                  | ~30 aujourd'hui (drawer, 3 taps par navigation)                                                       | **< 12**                                                |
| 7   | **LCP p75 mobile** sur `/tenant` et `/dashboard`                             | RUM (`web-vitals` envoyé à l'API)                                                | à mesurer                                                                                             | **≤ 2,5 s en 4G, ≤ 4 s en 3G**                          |
| 8   | **Requêtes par écran** (p95)                                                 | Journal réseau sur les 10 écrans principaux                                      | jusqu'à 101 sur `…/patrimoine`                                                                        | **≤ 3**                                                 |
| 9   | **Tickets de support « je ne trouve pas / ça ne marche pas sur téléphone »** | Comptage mensuel                                                                 | à mesurer                                                                                             | **−60 %**                                               |
| 10  | **Actions terrain réussies en réseau dégradé**                               | Encaissements et déclarations aboutis / tentés, sessions marquées hors-ligne     | à mesurer (aucune ne peut aboutir aujourd'hui)                                                        | **> 98 %** avec la file                                 |
| 11  | **Conformité RGAA**                                                          | Audit sur 20 écrans, 106 critères                                                | ~15 % estimé (11 `aria-label`, aucun repère)                                                          | **> 90 % sur les écrans P0**                            |
| 12  | **Poids du chunk d'entrée**                                                  | CI                                                                               | à mesurer en Lot 0                                                                                    | **≤ 220 Ko gzip**                                       |

**Aucune valeur « avant » n'est inventée** : les six premières lignes exigent une campagne de mesure en fin de Lot 0. C'est 2 j-h, inclus dans les 148 j-h globaux. Sans référence mesurée, les cibles ne sont pas défendables.

---

## 11. Risques, arbitrages et questions ouvertes

### 11.1 Risques

| #   | Risque                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Prob.                 | Impact       | Mitigation                                                                                                                                                                                                                |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | **État intermédiaire incohérent** pendant 13 semaines (S3 → S16)                                                                                                                                                                                                                                                                                                                                                                                         | Élevée                | Élevé        | Tokens partagés dès S3 avant toute migration d'écran ; migration par parcours et non par répertoire ; les 6 écrans hybrides traités en priorité (§9.7)                                                                    |
| R2  | **Le codemod `AppShell` touche 81 fichiers** en un commit                                                                                                                                                                                                                                                                                                                                                                                                | Moyenne               | Élevé        | `DashboardLayout` conservé en shim no-op pendant un lot ; codemod scripté et rejouable ; revert d'un seul commit ; recette sur les 10 écrans les plus visités avant merge                                                 |
| R3  | **Les endpoints agrégés du §8.4 ne sont pas livrés à temps** — le Lot 2 dépend de l'équipe API                                                                                                                                                                                                                                                                                                                                                           | Moyenne               | Élevé        | Les 3 endpoints (patrimoine, work-programs, thumbnails) sont spécifiés et engagés **avant le démarrage du Lot 0** ; à défaut, les écrans Patrimoine glissent en Lot 3 sans bloquer le reste                               |
| R4  | **Rejet utilisateur de la nouvelle navigation** (les collaborateurs connaissent leurs 12 groupes par cœur)                                                                                                                                                                                                                                                                                                                                               | Moyenne               | Moyen        | Le drawer complet reste accessible derrière « Plus » — rien n'est retiré, tout est réordonné ; visite guidée au premier lancement ; les libellés existants sont conservés à l'identique                                   |
| R5  | **La migration `App.useApp()` sur 70 fichiers** introduit des régressions silencieuses (un toast qui ne s'affiche plus)                                                                                                                                                                                                                                                                                                                                  | Moyenne               | Moyen        | Codemod + `grep` en CI interdisant l'import statique de `message`/`notification`/`Modal.confirm` ; recette manuelle des 20 flux de mutation les plus utilisés                                                             |
| R6  | **La file d'attente hors-ligne crée des doublons de paiement**                                                                                                                                                                                                                                                                                                                                                                                           | Faible                | **Critique** | `idempotency_key` déjà unique par tenant en base (`schema.prisma:1819-1861`) ; clé générée côté client à la saisie, pas à l'envoi ; test de rejeu explicite en critère de sortie du Lot 5 ; périmètre limité à 5 parcours |
| R7  | **Dépréciations AntD 6 déjà présentes dans le code.** `Drawer` : `bodyStyle` → `styles.body` et `width` → `size` sont dépréciés (`node_modules/antd/lib/drawer/Drawer.js:162-163`) — les 3 coquilles utilisent les deux (`sidebar.tsx:683,682`, `TenantPortal/Layout.tsx:239,238`, `OwnerPortal/Layout.tsx:256,255`). `Spin` : `tip` → `description` (`spin/index.js:94`). Fonctions statiques `message`/`notification`/`Modal.confirm` : hors contexte. | Élevée (déjà réalisé) | Moyen        | Traité intégralement en Lot 0 : la console de développement doit être vierge d'avertissements de dépréciation en critère de sortie                                                                                        |
| R8  | **La compression d'images côté client dégrade la lisibilité d'un justificatif** (reçu Mobile Money peu contrasté)                                                                                                                                                                                                                                                                                                                                        | Faible                | Moyen        | 1 600 px de côté et qualité 0,8 conservent un texte lisible ; test sur 20 reçus réels avant généralisation ; possibilité d'envoyer l'original en Wi-Fi                                                                    |
| R9  | **Le module Syndic mobile n'est jamais utilisé** et 12 j-h sont dépensés pour rien                                                                                                                                                                                                                                                                                                                                                                       | Moyenne               | Moyen        | Question ouverte Q1 tranchée **avant le Lot 3** ; si la réponse est « desktop uniquement », les 12 j-h se réduisent à 5 (consultation seule) et financent la performance                                                  |
| R10 | **Perte de vélocité produit** pendant 19 semaines                                                                                                                                                                                                                                                                                                                                                                                                        | Élevée                | Moyen        | Aucun gel : les correctifs fonctionnels continuent. Les nouvelles fonctionnalités sont développées dans le système cible dès S3, donc elles ne créent pas de dette                                                        |

### 11.2 Arbitrages tranchés, et ce qu'ils sacrifient

| Arbitrage                                                    | Ce qui est sacrifié                                                                                                                                                                                                                                                                                |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **AntD 6 plutôt que Tailwind/shadcn**                        | La liberté visuelle. AntD impose sa structure de composants ; une identité de marque forte demandera des surcharges de tokens et parfois de CSS. Sacrifié en connaissance de cause : 98 pages contre 15, et un back-office dense a plus besoin d'un `Table` complet que d'une identité singulière. |
| **Un seul bleu `#2563EB`**                                   | Le bleu AntD historique auquel l'équipe est habituée, et la valeur `#3b82f6` de `tailwind.config.js`. `#3B82F6` survit comme `primary-500` (fonds, états de survol) : la palette Tailwind existante n'est pas jetée, seule la valeur _primaire de texte_ change.                                   |
| **Breakpoints alignés sur AntD (lg = 992)**                  | La familiarité des breakpoints Tailwind par défaut (lg = 1024). Toutes les classes `lg:` existantes changent de seuil de 32 px — d'où la revue systématique des 15 pages TW et des 2 layouts au Lot 0.                                                                                             |
| **Pas de glisser-déposer sur le kanban mobile**              | Le geste le plus « naturel » du kanban. Il est inutilisable au pouce quand la colonne cible est hors écran, et inaccessible au clavier. Remplacé par « Déplacer vers… », plus lent d'un tap mais fiable et accessible.                                                                             |
| **Pas de swipe d'action sur les lignes de liste**            | Un raccourci apprécié des utilisateurs avancés. Non découvrable, invisible aux lecteurs d'écran, et en conflit avec le défilement résiduel. Remplacé par un menu `⋮` explicite.                                                                                                                    |
| **Comptabilité et AG Syndic : desktop assumé**               | L'ubiquité. Rendre une saisie en partie double utilisable sur 375 px coûterait plusieurs jours pour un usage improbable. Assumé explicitement à l'écran plutôt que dégradé silencieusement.                                                                                                        |
| **Hors-ligne limité à 5 parcours**                           | La promesse d'une application « qui marche partout ». Un hors-ligne généralisé demanderait une synchronisation bidirectionnelle et une résolution de conflits sur 11 modules — plusieurs mois. La promesse restreinte est tenable et vérifiable.                                                   |
| **Suppression de Clients, Transactions et Rapports du menu** | Des repères de navigation existants pour les utilisateurs actuels. Trois écrans qui ne portaient aucune donnée propre disparaissent au profit de destinations réelles. Redirections conservées pour ne casser aucun lien.                                                                          |
| **`components/ui/` supprimé, pas maintenu en parallèle**     | Le travail déjà investi dans ces 16 fichiers. Une partie est morte (`wizard.tsx`, 0 importeur) ou cassée (`table.tsx`, tokens non résolus). Conserver deux systèmes coûte plus cher que d'en abandonner un.                                                                                        |
| **React Query ajouté**                                       | Une dépendance de plus (~13 Ko gzip) et une convention à apprendre. Écrire cache, déduplication, retry et file de mutations à la main coûterait plus cher et serait moins fiable.                                                                                                                  |
| **Recherche globale retirée avant d'être livrée**            | Un champ visible qui rassurait. Il ne fonctionnait pas (P6). Il revient au Lot 3, spécifié.                                                                                                                                                                                                        |
| **Le fil d'Ariane est réduit au parent en mobile**           | La vue complète du chemin. Un fil de 5 segments sur 375 px est illisible ; « ‹ Retour à Baux » répond à 95 % du besoin.                                                                                                                                                                            |

### 11.3 Questions ouvertes — décisions métier requises

Ces questions ne relèvent pas de la conception. Chacune bloque ou dimensionne une partie du plan.

| #       | Question                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Bloque                               | Échéance      |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | ------------- |
| **Q1**  | **Le module Syndic doit-il être utilisable en mobilité, ou est-ce un module de bureau ?** Les 14 écrans incluent une comptabilité en partie double, des budgets à clés de répartition et la saisie de PV d'AG. Selon la réponse : 12 j-h (mobile complet) ou 5 j-h (consultation seule + saisie desktop).                                                                                                                                                             | Lot 3, périmètre et chiffrage        | **Avant S10** |
| **Q2**  | **Que devient la vitrine publique ?** `PropertyPublic`, `PropertyPublicDetail` et `PropertySearch` existent, ne sont pas routés, et `pages/Properties.tsx` est une maquette avec 6 biens en dur. Trois options : (a) suppression pure, (b) activation en vitrine publique par tenant (sous-domaine — le modèle le prévoit : `Tenant.subdomain`, `customDomain`, `schema.prisma:436-535`), (c) statu quo. L'option (b) est un projet à part entière, hors des 128 j-h. | Lot 1                                | **Avant S4**  |
| **Q3**  | **Clients et CRM Contacts sont-ils la même entité métier ?** Le code suggère que oui (`/clients/new` redirige déjà vers le formulaire de contact CRM, `App.tsx:507`). Si une distinction métier existe (client signataire vs prospect), elle doit être décrite avant la fusion.                                                                                                                                                                                       | Lot 1                                | **Avant S5**  |
| **Q4**  | **« Transaction » est-elle une entité métier ou une vue agrégée ?** `Transactions.tsx` ne charge aucune donnée et renvoie vers les affaires CRM et les baux. Si une entité Transaction doit exister (compromis de vente, commission d'agence), c'est un chantier de modèle de données, pas d'UI.                                                                                                                                                                      | Lot 1                                | **Avant S5**  |
| **Q5**  | **Éditeur de newsletter : achat ou HTML brut assumé ?** L'écran actuel exige un utilisateur technique. L'option « deux volets + blocs prédéfinis » du §6.9 couvre 90 % des besoins pour ~4 j-h. Un vrai éditeur visuel (Unlayer, GrapesJS, Stripo) est une licence + intégration, hors des 128 j-h.                                                                                                                                                                   | Lot 4                                | **Avant S13** |
| **Q6**  | **Qui configure le mapping WhatsApp/Twilio : ACC ou l'agence ?** Si c'est ACC, l'écran peut rester technique et sortir du périmètre. Si c'est l'agence, l'éditeur ligne à ligne est P0.                                                                                                                                                                                                                                                                               | Lot 4                                | **Avant S13** |
| **Q7**  | **i18n : quelles langues, à quelle échéance ?** L'externalisation de 234 fichiers représente ~12 j-h **hors** des 128. Le §3.5 rend l'ajout mécanique, mais l'anglais (Ghana, Nigeria) ou une autre langue doivent être décidés maintenant pour dimensionner les libellés et les mises en page.                                                                                                                                                                       | Aucun, mais conditionne les largeurs | **Avant S6**  |
| **Q8**  | **Le thème sombre est-il un livrable ?** Le §3.3 rend son activation possible pour ~2-3 j-h après les tokens. Ce n'est pas dans les 128 j-h.                                                                                                                                                                                                                                                                                                                          | Aucun                                | **Avant S16** |
| **Q9**  | **Édition du profil : quel périmètre, et quels endpoints existent ?** Le §6.2 propose nom, avatar, téléphone, préférences et changement de mot de passe. `PATCH /api/users/me` et l'upload d'avatar existent-ils ? Non vérifié dans `packages/api/src/routes/`.                                                                                                                                                                                                       | Lot 4                                | **Avant S13** |
| **Q10** | **Quels volumes réels en production ?** Nombre de biens, de baux, de lots par agence. Le plafond en dur de 100 biens (`PatrimoineOverviewPage.tsx:36`) est-il un choix ou une limite subie ? La réponse dimensionne la pagination, le cache et l'ampleur du chargement incrémental.                                                                                                                                                                                   | Lot 2                                | **Avant S7**  |
| **Q11** | **Quel parc mobile réel chez les collaborateurs et les locataires ?** Version minimale d'Android à supporter, part d'iOS, taille d'écran la plus courante. La cible 320 px est prudente ; si le parc est à 393 px minimum, certaines contraintes de mise en page se détendent. Détermine aussi la faisabilité du service worker.                                                                                                                                      | Lot 5                                | **Avant S8**  |
| **Q12** | **Quelle est la politique sur les comptes de démonstration ?** La purge de `Login.tsx` est P0 et non négociable, mais faut-il conserver un mécanisme de démonstration (environnement dédié, comptes éphémères) pour les avant-ventes ?                                                                                                                                                                                                                                | Lot 1                                | **Avant S4**  |

---

_Document établi par lecture directe du code de `apps/web` et `packages/api` sur `D:\ImmoTopia-main`. Les chiffres de comptage (113 pages, 121 composants, 55 fichiers avec `Table`, 40 avec `Modal`, 58 avec `Empty`, 46 avec `message.*`, 12 fichiers et 29 occurrences de `alert`/`confirm`, 11 `aria-label`, 98 pages important `antd`, 15 sans) proviennent de recherches sur le dépôt à la date du 8 septembre 2026. Aucune valeur « avant » de KPI n'est estimée : elles sont à mesurer en fin de Lot 0._
