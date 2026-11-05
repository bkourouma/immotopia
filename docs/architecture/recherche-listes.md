# Recherche multicritères des listes — guide d'intégration

Ce guide dit comment poser la recherche au-dessus d'un tableau. Il se suit à la
lettre. Le code fait foi ; en cas de doute, ouvrir :

| Brique                       | Fichier (sous `apps/web/src`)                                            |
| ---------------------------- | ------------------------------------------------------------------------ |
| Types partagés               | `utils/list-search/types.ts`                                             |
| Liste paginée par le serveur | `hooks/useListSearch.ts`                                                 |
| Liste reçue en entier        | `utils/list-search/useLocalListSearch.ts` (+ `filter.ts`, `paginate.ts`) |
| La barre                     | `components/primitives/ListSearch.tsx` (+ `list-search/`)                |

Écrans de référence (à ouvrir avant de coder) :

- Serveur : `pages/tenant/CollaboratorsList.tsx` (`primitives/Table`).
- Local : `pages/finance/Fournisseurs.tsx` (`DataView`).
- API : `packages/api/src/controllers/membership-controller.ts`
  (`listMembersQuerySchema`, `parseListMembersQuery`, `listMembersHandler`),
  `services/membership-service.ts` (`listMembers`) et
  `__tests__/unit/membership-list-filters.test.ts`.

Ne pas lancer `npm run i18n:extract` ni modifier les catalogues dans un lot
d'écrans : le lot final s'en charge.

## 0. En une page

**Ce que voit l'utilisateur.**

- **À partir de 992 px** : une barre au-dessus du tableau. Le champ libre en
  tête, large. Puis les critères `primary` en ligne (3 places ; un intervalle
  de dates ou de nombres en prend 2). Un bouton « Plus de critères » déplie les
  autres. Tout s'applique au changement ; le champ libre s'applique 300 ms après
  la dernière frappe (Entrée : tout de suite, Échap : vide). Dessous : une puce
  retirable par critère actif (liste « Critères actifs », le focus est conservé
  au retrait), « Effacer les critères » et le compteur (« 12 résultats »,
  « 1 résultat », « 0 résultat »). Le bouton « Exporter » se loge à l'extrémité
  de fin de la barre. Sur les `Select` en ligne, le libellé du critère s'affiche
  en préfixe.
- **Sous 992 px** : le champ libre et un bouton « Filtres (n) » qui ouvre une
  feuille du bas. Les critères de la feuille ne s'appliquent qu'au clic sur
  « Appliquer ». Le champ libre, lui, s'applique comme sur grand écran.

**Les trois briques.**

1. `useListSearch` (liste paginée par le serveur) ou `useLocalListSearch` (liste
   reçue en entier) : déclarent les critères, les lisent et les écrivent dans
   l'URL, rendent les props prêtes à étaler.
2. `<ListSearch>` : la barre. On ne la monte presque jamais soi-même : on passe
   `search={…searchProps}` à `<DataView>` ou à `primitives/Table`.
3. Le serveur : tout critère d'une liste paginée serveur est un paramètre de
   l'API (§ g).

**Règle : jamais de barre maison.** Plus de `Input.Search`, de `Select` de
filtre posé à la main, de `FilterSheet` de recherche, de `useListParams` +
`Collapse` « Filtres avancés ». Tout passe par `ListSearch`.

**Pas de barre pour les petits tableaux de détail** (10 lignes ou moins par
nature) : lignes d'une facture, quotes-parts, récapitulatifs, aperçus d'import.
Le noter dans le rapport du lot, avec la raison, sous « Écrans laissés sans
recherche et pourquoi ».

## 1. Serveur ou local ?

```text
L'API pagine déjà cette liste (page/limit, total) ?
├─ oui → SERVEUR. useListSearch. Le filtre manquant se AJOUTE à l'API (§ g).
└─ non → La liste arrive-t-elle en entier ET reste-t-elle bornée (quelques centaines de lignes) ?
         ├─ oui → LOCAL. useLocalListSearch.
         └─ non (liste qui peut grossir sans borne) → rendre l'API paginée (§ g), puis SERVEUR.
```

Règles :

- **Jamais** de filtre côté client sur une page reçue du serveur : le compteur
  (total serveur) et les lignes se contrediraient.
- **Liste plafonnée** : lorsqu'une route renvoie au plus N lignes sans total
  complet, afficher un bandeau dès que N lignes sont reçues. La recherche et
  l'export peuvent alors ne couvrir qu'une partie des données ; le bandeau doit
  le dire avant que l'utilisateur n'interprète le compteur comme exhaustif.
- Une API qui renvoie tout, sans `page`/`limit`, mais pour laquelle le volume peut
  dépasser ~500 lignes : ne pas filtrer en local, la rendre paginée.
- Une route qui accepte déjà `search` ou un filtre sous un autre nom (`q`,
  `searchTerm`) : le renommer côté front avec `api` (§ 2), ne pas toucher l'API.

## 2. Déclarer les critères

Les critères se déclarent **dans le corps du composant** (leurs libellés passent
par `t()`, ils se retraduisent au changement de langue). Le hook ne dépend que
des clés : les redéclarer à chaque rendu ne coûte rien.

```tsx
import type { SearchCriterion } from "../../utils/list-search";
```

Annoter `SearchCriterion[]` si le tableau est mis dans une variable, sinon
`type: 'text'` s'élargit en `string` et ne compile plus. Le passer en ligne au
hook (`useListSearch({ criteria: [ … ] })`) évite l'annotation.

### Les six types

| `type`        | Contrôle                                                            | Clés d'URL                            | Valeur lue                   | API par défaut           | Options utiles                                                                    |
| ------------- | ------------------------------------------------------------------- | ------------------------------------- | ---------------------------- | ------------------------ | --------------------------------------------------------------------------------- |
| `text`        | Champ libre en tête (un seul par liste)                             | `key` (conseillé : `q`)               | `string \| undefined`        | `search`                 | `placeholder` **obligatoire** (TypeScript le refuse sinon) : dire OÙ l'on cherche |
| `select`      | Liste déroulante avec recherche                                     | `key`                                 | `string \| undefined`        | `key`                    | `options` OU `loadOptions` + `resolveLabel` (§ e)                                 |
| `multiSelect` | Liste à choix multiple                                              | `key=A,B`                             | `string[]` (vide = inactif)  | `key: 'A,B'`             | `options` (obligatoire)                                                           |
| `dateRange`   | Deux dates (Du / Au)                                                | `${key}From`, `${key}To` (aaaa-mm-jj) | `{ from?, to? }`             | mêmes noms que l'URL     | `urlKeys`, `api: ['from', 'to']`                                                  |
| `numberRange` | Deux nombres (Min / Max)                                            | `${key}Min`, `${key}Max`              | `{ min?, max? }`             | mêmes noms que l'URL     | `unit` (`'FCFA'`, `'m²'`), `api: ['minAmount', 'maxAmount']`                      |
| `boolean`     | Case à cocher (vrai ou indifférent) ; `tristate` : Tous / Oui / Non | `key=1` ou `key=0`                    | `true \| false \| undefined` | `key: 'true' \| 'false'` | `tristate`, `trueLabel`, `falseLabel`                                             |

Communes à tous : `key` (unique), `label` (déjà traduit ; sert aux puces et aux
`aria-label`), `primary`, `api`, `help` (texte d'aide sous le contrôle, panneau
déplié et feuille mobile).

Une valeur mal formée dans l'URL (date impossible, nombre non fini, `retard=oui`)
est ignorée. Un critère inactif n'est NI dans l'URL NI dans les paramètres d'API.

Une valeur de `select` ou de `multiSelect` absente des `options` **statiques**
est ignorée aussi : `?status=BOGUS` ne part pas à l'API. Avec des options
chargées plus tard, un tableau vide veut dire « aucun filtrage » tant qu'elles
ne sont pas là.

### `primary` : 2 critères en ligne, 3 au plus

- Marquer `primary: true` **2 critères**, 3 au plus : ceux que l'on utilise le
  plus, en général le statut, puis le type, la période ou l'entité liée.
- Budget de la ligne : `maxInline` vaut **3 places** par défaut ; un critère
  `dateRange` ou `numberRange` en compte **2**, les autres 1. Un `primary` qui ne
  tient plus dans le budget retombe dans « Plus de critères ».
- Tout le reste va sous « Plus de critères » : montants, booléens, dates
  secondaires. Sous 992 px tout va dans la feuille.
- Les `Select` ont une recherche intégrée seulement au-delà de 8 options (ou en
  options distantes) ; un `multiSelect` de 6 options ou moins devient des cases
  à cocher dans la feuille mobile. Rien à régler dans l'écran.
- L'ordre de déclaration est l'ordre d'affichage.
- `primary` est ignoré sur le champ libre : il est toujours en tête.

### `api` : la correspondance vers l'API

| Forme                   | Effet                                                                | Exemple                                                  |
| ----------------------- | -------------------------------------------------------------------- | -------------------------------------------------------- |
| absent                  | nom par défaut du tableau ci-dessus                                  | `text` → `search=…`                                      |
| `string`                | renomme le paramètre                                                 | `{ key: 'role', type: 'select', api: 'roleId' }`         |
| `[string, string]`      | renomme les deux bornes d'un intervalle                              | `api: ['from', 'to']`, `api: ['minAmount', 'maxAmount']` |
| `false`                 | le critère n'est pas envoyé (filtrage local, ou critère d'affichage) | `api: false`                                             |
| `(valeur) => ApiParams` | traduction libre ; reçoit la valeur ACTIVE, jamais vide              | `api: v => (v ? { overdue: 'true' } : {})`               |

Piège : l'API d'une liste attend `q`, pas `search` (par exemple `listProperties`) :
`{ key: 'q', type: 'text', api: 'q', … }`. Vérifier le nom réel dans le service
du front et dans le contrôleur.

### `paramPrefix`

Quand deux tableaux partagent l'écran, chacun a son préfixe (§ d) : toutes les
clés d'URL de l'instance (critères, `page`, `limit`, `sort`) deviennent
`${préfixe}.${clé}`. Sans préfixe : clés brutes.

### Choisir les colonnes du champ libre

Le champ libre doit trouver ce que l'utilisateur lit dans le tableau :

- référence, numéro, libellé, nom, e-mail, téléphone ;
- l'entité liée affichée (bien, locataire, lot, chantier, fournisseur) ;
- le libellé du statut ou de la nature, **tel qu'affiché** (local seulement).

Pas de montants ni de dates dans le champ libre : ils ont leurs intervalles.
Côté serveur, le champ libre est le paramètre `search` : l'API décide des
colonnes (§ g) ; la liste de ce que le serveur cherche se met dans le
`placeholder` (`t('Référence, bien, locataire…')`).

Plusieurs mots : en local, chaque mot doit apparaître quelque part (ET entre les
mots, OU entre les colonnes), sans tenir compte de la casse ni des accents (diacritiques arabes compris :
« مُحَمَّد » est trouvé par « محمد »).

## Recettes

Les extraits supposent un écran sous `pages/<module>/`. Les services, types et
champs (`listInvoices`, `Invoice`…) sont à remplacer par ceux de l'écran.

### a) `DataView` paginé par le serveur

À retenir :

- `apiParams` (critères + `page` + `limit` + `sort`) va dans l'appel ET dans la
  clé de requête. Changer un critère relance la requête.
- `placeholderData: keepPreviousData` : la page reste affichée (grisée) pendant
  la requête suivante.
- `{...search.dataViewProps}` apporte `page`, `pageSize`, `onPageChange`, `sort`,
  `onSortChange`, `isFiltered`, `onClearFilters` ; `search={search.searchProps}`
  apporte la barre.
- `total` est celui du serveur, jamais `items.length`.
- Si l'API ne gère pas le tri, passer `apiNames: { sort: false }` ; si elle
  nomme la taille de page autrement : `apiNames: { limit: 'pageSize' }`.

```tsx
import React from "react";
import { useParams } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { ColumnsType } from "antd/es/table";
import { DataCard, DataView, StatusTag } from "../../components/primitives";
import { useListSearch } from "../../hooks/useListSearch";
import { queryKey, STALE_TIME } from "../../lib/query-keys";
import { collectAllPages } from "../../utils/table-export/collect";
import { listInvoices } from "../../services/invoice-service";
import type { Invoice } from "../../types/invoice-types";
import { t } from "../../i18n/t";

export const InvoicesList: React.FC = () => {
  const { tenantId } = useParams<{ tenantId: string }>();

  const search = useListSearch({
    criteria: [
      {
        key: "q",
        type: "text",
        label: t("Rechercher"),
        placeholder: t("Numéro, bien, locataire…"),
      },
      {
        key: "status",
        type: "multiSelect",
        label: t("Statut"),
        primary: true,
        options: [
          { value: "DRAFT", label: t("Brouillon") },
          { value: "SENT", label: t("Envoyée") },
          { value: "PAID", label: t("Payée") },
        ],
      },
      {
        key: "period",
        type: "dateRange",
        label: t("Période"),
        primary: true,
        api: ["from", "to"],
      },
      {
        key: "amount",
        type: "numberRange",
        label: t("Montant"),
        unit: "FCFA",
        api: ["minAmount", "maxAmount"],
      },
      {
        key: "late",
        type: "boolean",
        label: t("En retard"),
        api: (value) => (value ? { overdue: "true" } : {}),
      },
    ],
  });

  const { data, isPending, isFetching, error, refetch } = useQuery({
    queryKey: queryKey("invoices", tenantId, search.apiParams),
    queryFn: () => listInvoices(tenantId as string, search.apiParams),
    enabled: Boolean(tenantId),
    staleTime: STALE_TIME.list,
    placeholderData: keepPreviousData,
  });

  const columns: ColumnsType<Invoice> = [
    { title: t("Numéro"), dataIndex: "number", key: "number" },
    { title: t("Bien"), dataIndex: "propertyTitle", key: "property" },
    { title: t("Montant"), dataIndex: "amount", key: "amount", align: "end" },
    {
      title: t("Statut"),
      dataIndex: "status",
      key: "status",
      render: (status: string) => (
        <StatusTag status={status} label={status} tone="neutral" />
      ),
    },
  ];

  return (
    <DataView<Invoice>
      aria-label={t("Factures")}
      columns={columns}
      rowKey={(invoice) => invoice.id}
      renderCard={(invoice) => (
        <DataCard
          title={invoice.number}
          subtitle={invoice.propertyTitle}
          aria-label={invoice.number}
        />
      )}
      items={data?.items ?? []}
      total={data?.total ?? 0}
      loading={isPending}
      isReloading={isFetching && !isPending}
      error={error ? t("Impossible de charger les factures.") : null}
      errorCause={error}
      onRetry={() => refetch()}
      emptyDescription={t("Aucune facture pour le moment.")}
      search={search.searchProps}
      {...search.dataViewProps}
      export={{
        filename: t("Factures"),
        fetchAll: () =>
          collectAllPages<Invoice>(async (page, limit) => {
            const response = await listInvoices(tenantId as string, {
              ...search.filterParams,
              page,
              limit,
            });
            return { items: response.items, total: response.total };
          }),
      }}
    />
  );
};
```

Points à ne pas rater :

- `{...search.dataViewProps}` après `search=` : il pose déjà `isFiltered` et
  `onClearFilters`. Ne pas les repasser à la main.
- Ne pas passer `paginated={false}` : l'API est paginée.
- `emptyDescription` / `emptyAction` ne s'affichent que sans critère actif ; avec
  un critère, c'est le bloc « Aucun résultat » + « Effacer les critères ».
- L'adaptation de la forme de la réponse (`data.items`, `data.data.members`,
  `pagination.total`…) se fait dans l'écran, comme `CollaboratorsList.tsx`.

### b) Liste locale

À retenir :

- `useLocalListSearch(items, options)` filtre, trie (si `sortItems`) et pagine
  (20 par page, `defaultPageSize` pour changer).
- **Les accesseurs sont déclarés hors du composant** (constantes de module) :
  leur identité stable garde le filtrage mémoïsé.
- Un critère non textuel sans accesseur ni prédicat est **ignoré** localement ;
  `text` sans accesseurs aussi.
- Les critères n'ont pas besoin d'`api` : rien ne part au serveur.
- `{...local.dataViewProps}` apporte `items` (la page), `total` (liste filtrée),
  `paginated: true`, la pagination, le tri, l'effacement ET `search`.
- `isPending`/`isFetching` restent ceux de la requête qui amène la liste complète.

```tsx
import React from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { ColumnsType } from "antd/es/table";
import { DataCard, DataView } from "../../components/primitives";
import { useLocalListSearch } from "../../utils/list-search";
import type { SearchCriterion } from "../../utils/list-search";
import { queryKey, STALE_TIME } from "../../lib/query-keys";
import { localizedList } from "../../i18n/localized";
import { listSuppliers } from "../../services/finance-lot2-service";
import type { Supplier } from "../../types/finance-lot2-types";
import { t } from "../../i18n/t";

// Libellés vivants : un `t()` évalué au chargement du module figerait la langue.
const NATURES = localizedList(() => [
  { value: "MATERIALS", label: t("Matériaux") },
  { value: "SERVICES", label: t("Services") },
]);

// Stables : déclarés HORS du composant.
const TEXTE_RECHERCHE = [
  (s: Supplier) => s.name,
  (s: Supplier) => s.contactName,
  (s: Supplier) => s.contactPhone,
  (s: Supplier) => s.contactEmail,
];
const ACCESSEURS = {
  nature: (s: Supplier) => s.kind,
  actif: (s: Supplier) => s.isActive,
};

export const SuppliersList: React.FC = () => {
  const { tenantId } = useParams<{ tenantId: string }>();

  const { data, isPending, isFetching, error, refetch } = useQuery({
    queryKey: queryKey("suppliers", tenantId),
    queryFn: () => listSuppliers(tenantId as string),
    enabled: Boolean(tenantId),
    staleTime: STALE_TIME.list,
  });

  const criteria: SearchCriterion[] = [
    {
      key: "q",
      type: "text",
      label: t("Rechercher"),
      placeholder: t("Raison sociale, contact, téléphone, e-mail…"),
    },
    {
      key: "nature",
      type: "multiSelect",
      label: t("Nature"),
      primary: true,
      options: NATURES,
    },
    {
      key: "actif",
      type: "boolean",
      label: t("Statut"),
      primary: true,
      tristate: true,
      trueLabel: t("Actif"),
      falseLabel: t("Inactif"),
    },
  ];

  const local = useLocalListSearch<Supplier>(data, {
    criteria,
    text: TEXTE_RECHERCHE,
    accessors: ACCESSEURS,
  });

  const columns: ColumnsType<Supplier> = [
    { title: t("Raison sociale"), dataIndex: "name", key: "name" },
    { title: t("Contact"), dataIndex: "contactName", key: "contact" },
    { title: t("Téléphone"), dataIndex: "contactPhone", key: "phone" },
  ];

  return (
    <DataView<Supplier>
      aria-label={t("Fournisseurs")}
      columns={columns}
      rowKey={(supplier) => supplier.id}
      renderCard={(supplier) => (
        <DataCard title={supplier.name} aria-label={supplier.name} />
      )}
      {...local.dataViewProps}
      loading={isPending}
      isReloading={isFetching && !isPending}
      error={error ? t("Impossible de charger les fournisseurs.") : null}
      errorCause={error}
      onRetry={() => refetch()}
      emptyDescription={t("Aucun fournisseur enregistré.")}
      export={{ filename: t("Fournisseurs"), fetchAll: local.exportAll }}
    />
  );
};
```

Autres accesseurs et prédicats :

- Champ libre sur un libellé affiché : `(s) => SUPPLIER_KIND_LABELS[s.kind]`.
  Lire les libellés dans la fonction (pas à la déclaration) pour suivre la langue.
- Valeur tableau (étiquettes, rôles) : l'accesseur peut rendre un tableau ;
  `multiSelect` fait une intersection, le champ libre cherche dans chaque élément.
- Dates : accesseur rendant une `Date` ou une chaîne ISO ; la comparaison se fait
  au jour (aaaa-mm-jj), en heure locale. Une ligne sans date est exclue dès
  qu'un intervalle est posé.
- Montants : accesseur rendant un nombre (ou une chaîne numérique).
- Cas sur mesure (« en retard » = échéance passée et non payée) :
  `predicates: { late: (item, value) => … }`. Le prédicat prime sur l'accesseur.
  Il reçoit la valeur ACTIVE. À déclarer hors du composant lui aussi.
- Tri global (avant pagination) : `sortItems: (items, sort) => …`, constante de
  module aussi. Sans lui, le tri d'en-tête antd ne trie que la page affichée.

### c) `primitives/Table` et `Table` d'antd

**Remplacer l'import.** `import { Table } from 'antd'` devient :

```tsx
import { Table } from "../../components/primitives";
```

Mêmes props, mêmes génériques (`<Table<Row> …>`), mêmes sous-composants
(`Table.Summary`…). Ajouter `exportFilename={t('…')}`. Un sous-tableau d'une
ligne dépliée ou un aperçu : `exportable={false}`. Lire aussi l'en-tête de
`components/primitives/Table.tsx` (limite : la `ref` d'antd n'est pas relayée).

**Table paginée serveur** (modèle : `pages/tenant/CollaboratorsList.tsx`) :

```tsx
import { Table } from "../../components/primitives";
import { collectAllPages } from "../../utils/table-export/collect";

<Table<Member>
  aria-label={t("Collaborateurs")}
  search={search.searchProps}
  exportFilename={t("Collaborateurs")}
  exportFetchAll={() =>
    collectAllPages<Member>(async (page, limit) => {
      const response = await listMembers(tenantId as string, {
        ...search.filterParams,
        page,
        limit,
      });
      return {
        items: response.data?.members ?? [],
        total: response.data?.pagination?.total ?? 0,
      };
    })
  }
  columns={columns}
  dataSource={members}
  rowKey="id"
  loading={isFetching}
  pagination={search.tablePagination(total)}
  // Sous critère, la Table affiche seule son bloc « Aucun résultat » et « Effacer les critères ».
  locale={
    search.isFiltered
      ? undefined
      : { emptyText: t("Aucun collaborateur pour le moment.") }
  }
/>;
```

- Supprimer l'ancien état local de page (`useState(page)`) et tout `onChange` de
  pagination : `tablePagination(total)` en fournit un.
- `locale.emptyText` : le laisser **non défini** quand `search.isFiltered`, sinon
  le bloc « Aucun résultat » + « Effacer les critères » n'apparaît pas.
- La `Table` ne trie pas côté serveur toute seule : si l'écran avait un tri
  d'en-tête serveur, brancher `search.sort` / `search.setSort` dans le `onChange`
  d'antd comme avant ; sinon retirer les `sorter` inutiles.

**Table locale** (pagination locale, 20 par page) :

```tsx
const local = useLocalListSearch<Row>(rows, {
  criteria,
  text: TEXTE_RECHERCHE,
  accessors: ACCESSEURS,
});

<Table<Row>
  {...local.tableProps} // dataSource (la page), pagination, search
  aria-label={t("Échéances")}
  columns={columns}
  rowKey="id"
  exportFilename={t("Échéances")}
  exportFetchAll={local.exportAll} // sans lui, l'export ne contient que la page
/>;
```

**Table sans pagination** (liste courte, mais qui mérite la barre) :

```tsx
<Table<Row>
  search={local.searchProps}
  dataSource={local.filtered}
  pagination={false}
  columns={columns}
  rowKey="id"
  exportFilename={t("Échéances")}
/>
```

Ici `dataSource` est la liste filtrée entière : l'export la prend telle quelle.
Si la liste dépasse ~50 lignes, ne pas supprimer la pagination (charte § 2).

### d) Plusieurs tableaux sur un écran

Un **préfixe d'URL par tableau**, et **un composant par section** : chaque
section porte son hook et sa requête, qui n'existent que lorsqu'elle est montée.

```tsx
import { Tabs } from "antd";

export const LotPage: React.FC = () => (
  <Tabs
    destroyOnHidden
    items={[
      { key: "invoices", label: t("Factures"), children: <InvoicesSection /> },
      {
        key: "payments",
        label: t("Règlements"),
        children: <PaymentsSection />,
      },
    ]}
  />
);

const InvoicesSection: React.FC = () => {
  const search = useListSearch({
    paramPrefix: "fac",
    ariaLabel: t("Rechercher dans les factures"),
    criteria: [
      {
        key: "q",
        type: "text",
        label: t("Rechercher"),
        placeholder: t("Numéro, fournisseur…"),
      },
      {
        key: "status",
        type: "multiSelect",
        label: t("Statut"),
        primary: true,
        options: INVOICE_STATUS_OPTIONS,
      },
    ],
  });
  // useQuery({ queryKey: queryKey('invoices', tenantId, search.apiParams), … })
  // <DataView … search={search.searchProps} {...search.dataViewProps} />
  return null;
};

const PaymentsSection: React.FC = () => {
  const search = useListSearch({
    paramPrefix: "reg",
    ariaLabel: t("Rechercher dans les règlements"),
    criteria: [
      {
        key: "q",
        type: "text",
        label: t("Rechercher"),
        placeholder: t("Référence, payeur…"),
      },
      {
        key: "period",
        type: "dateRange",
        label: t("Période"),
        primary: true,
        api: ["from", "to"],
      },
    ],
  });
  // idem
  return null;
};
```

URL obtenue : `?fac.q=sotra&fac.status=SENT,PAID&fac.page=2&reg.periodFrom=2026-01-01&reg.limit=50`.
Les clés sont `fac.q`, `fac.status`, `fac.page`, `fac.limit`, `fac.sort`, et pour
un intervalle `reg.periodFrom` / `reg.periodTo`. Les deux instances ne
s'écrasent pas ; « Effacer » n'efface que les clés de son préfixe ; un paramètre
étranger (`tab`, ancre) reste intact. Les préfixes sont courts, uniques dans
l'écran, sans point.

`ariaLabel` (facultatif, repris dans `searchProps['aria-label']`) nomme la zone
`role="search"` de l'instance. Sans lui, toutes s'appellent « Rechercher » et un
lecteur d'écran ne les distingue pas. Même option sur `useLocalListSearch`.

Rappel de la charte § 2, écran lourd :

- Sections en onglets ou sous-pages paresseuses. Sur les fiches Bien et Bail,
  `withTabLifecycle` pose `destroyOnHidden` onglet par onglet : les tableaux
  lourds se démontent, tandis que les onglets contenant une saisie en cours
  restent montés (`PROPERTY_KEEP_MOUNTED_TABS` et
  `LEASE_KEEP_MOUNTED_TABS`). Ne pas poser `destroyOnHidden` sur le composant
  `Tabs` parent : Ant Design 6 ferait perdre ces saisies.
- Une requête ne part que lorsque la section est affichée : montage conditionnel
  (le cas ci-dessus) ou `enabled: sectionAffichee` sur `useQuery`.
- Plus de tableau sans pagination ni plafond au-delà de ~50 lignes.
- Pas de `limit: 500/1000` pour remplir un sélecteur : voir § e.

### e) Critère à options distantes

Pour une entité nombreuse (bien, contact, lot, chantier), pas de liste de 500
options. Le contrôle appelle `loadOptions(saisie)` à l'ouverture puis à la frappe
(300 ms) et affiche ce qu'il reçoit.

- `loadOptions` rend **20 options au plus** : `limit: 20` et le terme dans le
  paramètre de recherche de l'API.
- `resolveLabel(value)` retrouve le libellé d'une valeur **venue de l'URL**
  (lien partagé, rechargement) absente des options chargées. Il est appelé une fois par
  valeur. Sans lui, la puce affiche l'identifiant brut.
- `loadOptions`, `resolveLabel` (et `api` quand c'est une fonction) peuvent fermer
  sur un état du composant (`tenantId`, un autre critère) : le hook passe des
  enveloppes stables et appelle toujours la version COURANTE. Les redéclarer à
  chaque rendu est correct.
- Si `loadOptions` échoue (rejet), le contrôle affiche l'erreur avec un bouton
  « Réessayer » : ne pas attraper l'erreur dans `loadOptions`, la laisser remonter.

Exemple avec les services réels (`services/property-service.ts`,
`services/crm-service.ts`) :

```tsx
import { getProperty, listProperties } from "../../services/property-service";
import { getContact, listContacts } from "../../services/crm-service";

const criteria: SearchCriterion[] = [
  {
    key: "q",
    type: "text",
    label: t("Rechercher"),
    placeholder: t("Référence, bien, locataire…"),
  },
  {
    key: "propertyId",
    type: "select",
    label: t("Bien"),
    primary: true,
    loadOptions: async (term) => {
      // Ici l'API de la liste des biens attend `q` (pas `search`).
      const { properties } = await listProperties(tenantId as string, {
        q: term || undefined,
        limit: 20,
      });
      return properties.map((property) => ({
        value: property.id,
        label: `${property.internalReference} · ${property.title}`,
      }));
    },
    resolveLabel: async (id) => {
      const property = await getProperty(tenantId as string, id);
      return `${property.internalReference} · ${property.title}`;
    },
  },
  {
    key: "contactId",
    type: "select",
    label: t("Locataire"),
    loadOptions: async (term) => {
      const { contacts } = await listContacts(tenantId as string, {
        search: term || undefined,
        limit: 20,
      });
      return contacts.map((contact) => ({
        value: contact.id,
        label: `${contact.firstName} ${contact.lastName}`,
      }));
    },
    resolveLabel: async (id) => {
      const { data } = await getContact(tenantId as string, id);
      return `${data.firstName} ${data.lastName}`;
    },
  },
];
```

Les deux libellés (`loadOptions` et `resolveLabel`) doivent être identiques pour
une même entité, sinon la puce change au premier clic. Les noms de paramètres
(`q`, `search`) et de champs sont à vérifier dans le service. Si le service ne sait
pas rechercher ni limiter, ne pas inventer : l'ajouter côté API (§ g) ou, à
défaut, le signaler dans le rapport.

### f) Export aligné sur les critères

Règle : l'export exporte **ce que la recherche affiche**, tous les résultats, pas
seulement la page.

| Cas                        | Écriture                                                                                                                                                                                                                       |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `DataView` serveur         | `export={{ filename: t('…'), fetchAll: () => collectAllPages<T>(async (page, limit) => { const r = await listX(tenantId as string, { ...search.filterParams, page, limit }); return { items: r.items, total: r.total }; }) }}` |
| `DataView` local           | `export={{ filename: t('…'), fetchAll: local.exportAll }}`                                                                                                                                                                     |
| `Table` serveur            | `exportFilename={t('…')}` + `exportFetchAll={() => collectAllPages<T>(…)}` (idem ci-dessus)                                                                                                                                    |
| `Table` locale paginée     | `exportFilename={t('…')}` + `exportFetchAll={local.exportAll}`                                                                                                                                                                 |
| `Table` locale non paginée | `dataSource={local.filtered}` : rien d'autre                                                                                                                                                                                   |

Détails :

- `search.filterParams` = les critères traduits pour l'API, **sans** page, limite
  ni tri. `collectAllPages` ajoute `page` et `limit`. C'est `apiParams` qui sert à
  la liste.
- `collectAllPages` parcourt les pages (100 par page, plafond 10 000 lignes) et
  rend `{ items, total, truncated }` ; l'export avertit si `truncated`.
- Les API plafonnent souvent `limit` (100 en pratique) : ne pas demander plus.
- Les tableaux d'un onglet portent chacun leur `filterParams` : ne pas mélanger
  les instances.
- Sans `fetchAll`, l'export ne contient que la page affichée et le menu en
  avertit quand le total la dépasse.

### g) Ce qu'il faut ajouter côté API

Règles (charte § 3 et `AGENTS.md`) :

- Paramètre de recherche libre : **`search`**. Prisma `contains` +
  `mode: 'insensitive'` sur les colonnes utiles, en `OR`.
- Filtres : noms explicites (`status`, `type`, `propertyId`, `from`, `to`,
  `minAmount`, `maxAmount`…). Valeurs multiples : CSV (`status=A,B`), doublons
  ignorés.
- Chaque paramètre est validé (Zod) ; valeur invalide : `BadRequestError`
  (400), jamais 500. Les contrôleurs sont enveloppés dans `asyncHandler`.
  Pas de `try/catch` qui devine le statut HTTP.
- **`tenantId` toujours dans le `where`.** Tout identifiant reçu en filtre reste
  dans ce même `where` : un id d'une autre agence ne renvoie rien, sans erreur
  différente. Pour les biens et leurs enfants : `utils/property-tenant-guard.ts`.
- Jamais `include: { user: true }` (utiliser `select`) ; jamais `$queryRawUnsafe`.
- **Pas de nouvelle route** sans accord du superviseur (elle impose
  `routes-inventory`, `route-features`, `ai:catalog`) : ajouter des paramètres
  à une route existante. **Pas de migration.** Un index manquant se signale.
- Lister dans le rapport, par route, les paramètres ajoutés.
- Les recherches Prisma `contains`, `startsWith` et `endsWith` portant sur une
  saisie utilisateur doivent échapper les caractères SQL LIKE `%`, `_` et `\\`
  avec `utils/like-escape.ts` (`escapeLike`). Ne pas échapper les préfixes
  calculés par le serveur pour générer des références ou des numéros.
- Réutiliser le message existant `t('Paramètres de recherche invalides.')`
  (`import { t } from '../i18n'`) : pas de nouvelle chaîne d'API à traduire.

**Helpers partagés** : `packages/api/src/utils/list-query-schemas.ts` (import
`../utils/list-query-schemas` depuis un contrôleur). **Ne réécris pas ces
helpers dans ton contrôleur.**

| Helper                    | Rôle                                                                                |
| ------------------------- | ----------------------------------------------------------------------------------- |
| `emptyToUndefined`        | une valeur vide ou absente donne `undefined`                                        |
| `zSearch(max = 200)`      | recherche libre : `trim`, `max` caractères, vide = absent                           |
| `zCsvEnum(VALUES)`        | CSV (`A,B`) validé contre l'énumération, doublons ignorés, vide = absent            |
| `zDay`                    | jour `aaaa-mm-jj` RÉEL (contrôle aller-retour) : `2026-13-45`, `2026-02-31` rejetés |
| `dayStart(day)`           | `Date` à 00:00:00.000 UTC                                                           |
| `dayEnd(day)`             | `Date` à 23:59:59.999 UTC (fin inclusive)                                           |
| `dayRange(from, to)`      | `{ gte?, lte? }`, ou `undefined` si aucun jour                                      |
| `zAmount({ min?, max? })` | nombre fini ; négatif accepté par défaut (avoirs, soldes), `{ min: 0 }` l'interdit  |
| `zId`                     | identifiant de 1 à 64 caractères                                                    |

Exemple réel : `listMembersQuerySchema` de `membership-controller.ts`
(`zSearch`, `zCsvEnum`, `zId`).

**Contrôleur** (modèle : `membership-controller.ts`) :

```ts
import { Request, Response } from "express";
import { z } from "zod";
import {
  asyncHandler,
  BadRequestError,
  UnauthorizedError,
} from "../middleware/error-middleware";
import { parsePagination } from "../utils/pagination-helper";
import {
  zSearch,
  zCsvEnum,
  zDay,
  zAmount,
  zId,
} from "../utils/list-query-schemas";
import { listInvoices } from "../services/invoice-service";
import { t } from "../i18n";

const INVOICE_STATUSES = ["DRAFT", "SENT", "PAID"] as const;

/** `status` : liste séparée par des virgules (`SENT,PAID`), doublons ignorés. */
export const listInvoicesQuerySchema = z.object({
  search: zSearch(), // 200 caractères au plus par défaut
  status: zCsvEnum(INVOICE_STATUSES),
  from: zDay, // jour réel : `2026-13-45` et `2026-02-31` donnent un 400
  to: zDay,
  minAmount: zAmount({ min: 0 }),
  maxAmount: zAmount({ min: 0 }),
  propertyId: zId, // 1 à 64 caractères
});

/** Valide les paramètres de requête ; toute valeur invalide lève une `BadRequestError` (400). */
export function parseListInvoicesQuery(query: Request["query"]) {
  const parsed = listInvoicesQuerySchema.safeParse(query);
  if (!parsed.success) {
    throw new BadRequestError(
      t("Paramètres de recherche invalides."),
      parsed.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      })),
    );
  }
  return parsed.data;
}

export const listInvoicesHandler = asyncHandler(
  async (req: Request, res: Response) => {
    if (!req.user?.userId) throw new UnauthorizedError();
    const { tenantId } = req.params;
    const filters = parseListInvoicesQuery(req.query);

    const result = await listInvoices({
      tenantId,
      ...filters,
      ...parsePagination(req.query, { defaultPage: 1, defaultLimit: 20 }),
    });

    res.status(200).json({
      success: true,
      data: { invoices: result.invoices, pagination: result.pagination },
    });
  },
);
```

**Service** (modèle : `membership-service.ts#listMembers`) :

```ts
import { prisma } from "../utils/database";
import { dayRange } from "../utils/list-query-schemas";

export interface ListInvoicesFilters {
  tenantId: string;
  search?: string;
  status?: Array<"DRAFT" | "SENT" | "PAID">;
  from?: string; // aaaa-mm-jj
  to?: string;
  minAmount?: number;
  maxAmount?: number;
  propertyId?: string;
  page?: number;
  limit?: number;
}

export async function listInvoices(filters: ListInvoicesFilters) {
  const page = filters.page || 1;
  const limit = filters.limit || 20;

  // `tenantId` d'abord, et tout identifiant reçu dans CE where : un id d'une
  // autre agence ne renvoie aucune ligne.
  const where: any = { tenantId: filters.tenantId };

  if (filters.status && filters.status.length > 0) {
    where.status =
      filters.status.length === 1 ? filters.status[0] : { in: filters.status };
  }
  if (filters.propertyId) where.propertyId = filters.propertyId;

  const issuedAt = dayRange(filters.from, filters.to); // UTC, fin incluse
  if (issuedAt) where.issuedAt = issuedAt;
  if (filters.minAmount !== undefined || filters.maxAmount !== undefined) {
    where.amount = {
      ...(filters.minAmount !== undefined ? { gte: filters.minAmount } : {}),
      ...(filters.maxAmount !== undefined ? { lte: filters.maxAmount } : {}),
    };
  }
  if (filters.search) {
    where.OR = [
      { number: { contains: filters.search, mode: "insensitive" } },
      {
        property: { title: { contains: filters.search, mode: "insensitive" } },
      },
    ];
  }

  const [invoices, total] = await Promise.all([
    prisma.invoice.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { issuedAt: "desc" },
      select: {
        id: true,
        number: true,
        amount: true,
        status: true,
        issuedAt: true,
      },
    }),
    prisma.invoice.count({ where }),
  ]);

  return {
    invoices,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}
```

Points d'attention :

- Les dates : `dayRange` lit les jours en UTC (agences d'Abidjan, UTC+0) et la
  borne `to` est inclusive (23:59:59.999). Pour un autre fuseau, adapter les
  bornes dans le module partagé, pas dans l'écran.
- Si le `where` de la route a déjà un `OR` (droits, périmètre), combiner avec
  `AND: [{ OR: … }, { OR: … }]` : ne pas écraser.
- Les noms de modèles, champs et relations ci-dessus sont fictifs ; reprendre ceux
  du schéma. `any` n'est là que par économie : préférer le type
  `Prisma.<Modèle>WhereInput`.
- Un tri demandé (`sort=champ:asc|desc`, format de `useListSearch`) se valide
  contre une liste blanche de champs. Une API qui ne trie pas : `apiNames: { sort: false }` côté front.
- Une recherche `contains` sur une grosse table est un parcours séquentiel : si la
  table peut dépasser quelques dizaines de milliers de lignes, le signaler.

**Test jest** (modèle : `__tests__/unit/membership-list-filters.test.ts`, prisma
mocké) :

```ts
const findMany = jest.fn();
const count = jest.fn();

jest.mock("../../src/utils/database", () => ({
  prisma: {
    invoice: {
      findMany: (...a: unknown[]) => findMany(...a),
      count: (...a: unknown[]) => count(...a),
    },
  },
}));

import { listInvoices } from "../../src/services/invoice-service";
import { parseListInvoicesQuery } from "../../src/controllers/invoice-controller";
import { BadRequestError } from "../../src/middleware/error-middleware";

describe("listInvoices : where", () => {
  beforeEach(() => {
    findMany.mockReset().mockResolvedValue([]);
    count.mockReset().mockResolvedValue(0);
  });
  const whereOf = () => findMany.mock.calls[0][0].where;

  it("sans filtre : seulement l agence", async () => {
    await listInvoices({ tenantId: "T1" });
    expect(whereOf()).toEqual({ tenantId: "T1" });
  });

  it("un identifiant reçu reste dans le where de l agence", async () => {
    await listInvoices({ tenantId: "T1", propertyId: "P9" });
    expect(whereOf()).toEqual({ tenantId: "T1", propertyId: "P9" });
  });

  it("recherche insensible à la casse, statuts multiples, intervalle de montants", async () => {
    await listInvoices({
      tenantId: "T1",
      search: "sotra",
      status: ["SENT", "PAID"],
      minAmount: 10,
      maxAmount: 50,
    });
    expect(whereOf().status).toEqual({ in: ["SENT", "PAID"] });
    expect(whereOf().amount).toEqual({ gte: 10, lte: 50 });
    expect(whereOf().OR[0]).toEqual({
      number: { contains: "sotra", mode: "insensitive" },
    });
  });
});

describe("parseListInvoicesQuery", () => {
  it("accepte un CSV, ignore doublons et valeurs vides", () => {
    expect(
      parseListInvoicesQuery({
        status: "SENT,PAID,SENT",
        search: "  ",
        from: "",
      }),
    ).toMatchObject({
      status: ["SENT", "PAID"],
      search: undefined,
      from: undefined,
    });
  });

  it("valeur invalide : 400", () => {
    expect(() => parseListInvoicesQuery({ status: "BOGUS" })).toThrow(
      BadRequestError,
    );
    expect(() => parseListInvoicesQuery({ from: "hier" })).toThrow(
      BadRequestError,
    );
    expect(() => parseListInvoicesQuery({ from: "2026-02-31" })).toThrow(
      BadRequestError,
    );
    expect(() => parseListInvoicesQuery({ minAmount: "abc" })).toThrow(
      BadRequestError,
    );
  });
});
```

Lancer : depuis `packages/api`, `npx jest <chemins> --runInBand` (via le
sémaphore du chantier).

### h) Le test minimal d'un écran converti

Un fichier par écran, sous `apps/web/src/__tests__/<module>/`. Il vérifie trois
choses : (1) la saisie arrive au service après le debounce et se retrouve dans
l'URL, (2) une URL initiale applique les critères, (3) « Effacer » ramène à la
liste complète. Modèles : `__tests__/tenant/collaborators-list.test.tsx`
(serveur) et `__tests__/finance/fournisseurs.test.tsx` (local).

```tsx
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App as AntApp } from "antd";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { InvoicesList } from "../../pages/rental/InvoicesList";

const isDesktop = vi.hoisted(() => ({ value: true }));
const listInvoices = vi.hoisted(() => vi.fn());
const createInvoice = vi.hoisted(() => vi.fn());

vi.mock("../../hooks/useBreakpoint", () => ({
  useBreakpoint: () => ({
    screens: {},
    active: isDesktop.value ? "lg" : "xs",
    isMobile: !isDesktop.value,
    isTablet: false,
    isDesktop: isDesktop.value,
  }),
}));

// Le mock couvre TOUS les exports du service utilisés par l'écran (et ses
// composants enfants) : Vitest refuse un import non déclaré.
vi.mock("../../services/invoice-service", () => ({
  listInvoices: (...args: unknown[]) => listInvoices(...args),
  createInvoice: (...args: unknown[]) => createInvoice(...args),
}));

const FACTURE = {
  id: "f1",
  number: "FAC-001",
  propertyTitle: "Villa Angré",
  amount: 120000,
  status: "SENT",
};

const reponse = (items: unknown[]) => ({ items, total: items.length });

function Url() {
  return <div data-testid="url">{useLocation().search}</div>;
}

function renderPage(initial = "/tenant/t1/invoices") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <AntApp>
        <MemoryRouter initialEntries={[initial]}>
          <Url />
          <Routes>
            <Route
              path="/tenant/:tenantId/invoices"
              element={<InvoicesList />}
            />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>,
  );
}

// Délai large : la suite complète tourne en parallèle et peut être lente.
const T = { timeout: 8000 };

beforeEach(() => {
  isDesktop.value = true;
  listInvoices.mockReset();
  listInvoices.mockResolvedValue(reponse([FACTURE]));
});

describe("InvoicesList : recherche multicritères", () => {
  it("charge la première page sans critère", async () => {
    renderPage();
    expect(
      await screen.findByText("FAC-001", undefined, T),
    ).toBeInTheDocument();
    expect(listInvoices).toHaveBeenCalledWith("t1", { page: 1, limit: 20 });
    expect(screen.getByRole("search")).toBeInTheDocument();
  });

  it("envoie la saisie au service après le debounce et la met dans l’URL", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("FAC-001", undefined, T);
    await user.type(
      within(screen.getByRole("search")).getByRole("textbox"),
      "sotra",
    );
    await vi.waitFor(
      () =>
        expect(listInvoices).toHaveBeenLastCalledWith("t1", {
          search: "sotra",
          page: 1,
          limit: 20,
        }),
      T,
    );
    expect(screen.getByTestId("url").textContent).toContain("q=sotra");
  });

  it("applique les critères d’une URL partagée", async () => {
    renderPage(
      "/tenant/t1/invoices?status=SENT,PAID&periodFrom=2026-01-01&late=1",
    );
    await screen.findByText("FAC-001", undefined, T);
    expect(listInvoices).toHaveBeenCalledWith("t1", {
      status: "SENT,PAID",
      from: "2026-01-01",
      overdue: "true",
      page: 1,
      limit: 20,
    });
  });

  it("propose d’effacer les critères quand rien ne correspond", async () => {
    const user = userEvent.setup();
    listInvoices.mockImplementation(
      async (_tenant: string, params: Record<string, unknown>) =>
        reponse(params.search ? [] : [FACTURE]),
    );
    renderPage("/tenant/t1/invoices?q=zzz");
    expect(
      await screen.findByText(
        "Aucun élément ne correspond aux filtres appliqués.",
        undefined,
        T,
      ),
    ).toBeInTheDocument();
    // Deux boutons du même nom : la barre et le bloc d'état.
    const effacer = screen.getAllByRole("button", {
      name: "Effacer les critères",
    });
    await user.click(effacer[effacer.length - 1]);
    expect(
      await screen.findByText("FAC-001", undefined, T),
    ).toBeInTheDocument();
    expect(listInvoices).toHaveBeenLastCalledWith("t1", { page: 1, limit: 20 });
    expect(screen.getByTestId("url").textContent).not.toContain("q=");
  });
});
```

(Les clés d'URL et les paramètres attendus suivent les critères de la recette (a) :
`period` → `periodFrom` / `from`, `late` → `late=1` / `overdue`. Les adapter aux
critères réels de l'écran.)

Pour un écran **local**, le test ne mocke pas de paramètre : il vérifie les lignes.

```tsx
it("filtre la liste locale sans accent ni casse", async () => {
  const user = userEvent.setup();
  listSuppliers.mockResolvedValue([
    {
      id: "1",
      name: "Matériaux du Bandama",
      kind: "MATERIALS",
      isActive: true,
    },
    { id: "2", name: "Nettoyage Plateau", kind: "SERVICES", isActive: true },
  ]);
  renderPage();
  await screen.findByText("Matériaux du Bandama", undefined, T);
  await user.type(
    within(screen.getByRole("search")).getByRole("textbox"),
    "MATERIAUX",
  );
  await vi.waitFor(
    () =>
      expect(screen.queryByText("Nettoyage Plateau")).not.toBeInTheDocument(),
    T,
  );
  expect(screen.getByText("Matériaux du Bandama")).toBeInTheDocument();
});
```

**Pièges connus**

- **Debounce de 300 ms.** Deux façons sûres : `userEvent.type` puis
  `vi.waitFor(…, { timeout: 8000 })` (ci-dessus), ou `vi.useFakeTimers()` +
  `fireEvent.change` + `act(() => vi.advanceTimersByTime(301))`
  (voir `__tests__/primitives/list-search.test.tsx`). `userEvent` sous fake timers
  se bloque : `userEvent.setup({ advanceTimers: vi.advanceTimersByTime })`. Entrée
  applique tout de suite (`fireEvent.keyDown(input, { key: 'Enter' })`).
- **Le compteur dit « 0 résultat »**, « 1 résultat » ou « n résultats » ;
  « Aucun résultat » n'apparaît plus que dans le bloc d'état (et dans un `Select`
  sans option). Pour le bloc, chercher plutôt sa phrase, « Aucun élément ne
  correspond aux filtres appliqués. ».
- **Deux boutons d'effacement.** Avec `search`, le bloc d'état et la barre
  s'appellent tous deux « Effacer les critères » (`DataView` comme
  `primitives/Table`) : `getAllByRole(…)` puis le dernier (comme
  `CollaboratorsList`). Sans `search`, `DataView` garde « Effacer les filtres ».
- **Vitest refuse un import non mocké** : le `vi.mock` du service liste tous les
  exports que l'écran et ses enfants appellent (y compris ceux des
  `loadOptions` / `resolveLabel`, d'où `listProperties` / `getProperty`…).
- **`useBreakpoint` doit être mocké** (sinon jsdom n'est ni mobile ni bureau) ;
  `isDesktop: true` pour le tableau et la barre en ligne. Sous 992 px, les
  critères autres que le champ libre passent par « Filtres » puis « Appliquer ».
- **`QueryClient` avec `retry: false`** : sans cela, une erreur simulée prend
  plusieurs secondes.
- **`MemoryRouter` + `Routes`** : les hooks lisent `useParams` et l'URL. Un
  composant `Url` affiche `location.search` pour l'asserter.
- **Les tests tournent en français** (`setupTests.ts`) : chercher « Effacer les
  critères », pas « Clear ».
- Le premier chargement peut dépasser le délai par défaut de `findBy*` quand la
  suite tourne en parallèle : `{ timeout: 8000 }`. Un échec par timeout ne prouve
  rien tant que le fichier n'a pas tourné seul.

## 9. Checklist de fin par écran

- [ ] Serveur ou local choisi selon le § 1 ; aucun filtre client sur une page serveur.
- [ ] Critères : un champ libre qui couvre les colonnes lisibles, un critère par
      colonne discriminante, 2 `primary` (3 au plus), `placeholder` du champ libre
      renseigné (il dit où l'on cherche), le reste sous « Plus de critères ».
- [ ] Les noms d'API sont ceux de l'API réelle (`api`) ; les paramètres manquants
      sont ajoutés côté API, validés, testés (§ g).
- [ ] `tenantId` dans le `where` ; ids reçus dans le même `where` ; pas de nouvelle
      route, pas de migration.
- [ ] L'URL porte l'état (recharger la page ou ouvrir le lien restitue la liste) ;
      `paramPrefix` si plusieurs tableaux sur l'écran, avec un `ariaLabel` propre
      à chaque instance (`t('Rechercher dans les factures')`).
- [ ] Plus de barre ni de filtre maison (`Input.Search`, `FilterSheet`,
      `Collapse` de filtres, `useListParams` seul) ; imports devenus inutiles retirés.
- [ ] Export aligné : `fetchAll` / `exportFetchAll` avec `search.filterParams`
      (serveur) ou `local.exportAll` (local).
- [ ] États : « aucune donnée » (invite à créer) distinct de « aucun résultat »
      (bouton Effacer) ; compteur visible.
- [ ] Mobile (< 992 px) : la feuille « Filtres » s'ouvre, « Appliquer » applique ;
      rien d'inventé à côté.
- [ ] RTL : propriétés logiques seulement (`marginInlineStart`, `ms-*`,
      `align: 'end'`), pas de `left`/`right`/`ml-*`.
- [ ] Tout libellé visible dans `t('Texte français')` ; libellés déclarés dans le
      corps du composant ; listes de module en `localizedList`.
- [ ] Gros écran : onglets avec `destroyOnHidden`, requête seulement quand la
      section est affichée, pas de `limit: 500`.
- [ ] Tests : au moins un test de recherche par écran (§ h) ; tests existants
      mis à jour ; fichier lancé seul au moins une fois.
- [ ] Pièges du § 10 relus (clés réservées, virgules, mémoïsation, état vide).
- [ ] Typecheck et lint propres sur les fichiers touchés.
- [ ] Rapport du lot : par écran, critères posés, mode serveur/local ; liste des
      textes `t('…')` ajoutés (pour le lot final i18n) ; écrans laissés sans barre
      (petits tableaux de détail ≤ 10 lignes) avec la raison ; paramètres d'API
      ajoutés par route.

## 10. Pièges, questions fréquentes et limites connues

### Pièges à éviter

- **Clés réservées.** Pas de critère nommé `page`, `limit` ni `sort` (l'URL les
  utilise), pas deux critères de même clé, un seul critère `text` par instance.
  Sinon les clés d'URL se marchent dessus.
- **Virgule dans une valeur de `multiSelect`.** La virgule sépare les valeurs
  dans l'URL : une valeur qui en contient est coupée en deux. Utiliser des codes.
- **Point dans `paramPrefix`.** Le séparateur est `.` : un préfixe qui en contient
  rend les clés ambiguës. Préfixe court, sans point.
- **Liste locale : `items` non mémoïsé.** Un `items` recréé à chaque rendu (ou des
  accesseurs définis dans le composant) recalcule filtre, tri et pagination à
  chaque rendu. Mémoïser `items` (`useMemo`) et les accesseurs.
- **Mode serveur : `emptyAction` n'est pas le seul état vide.** Avec des critères
  actifs, l'écran montre « Aucun résultat » + « Effacer les critères », pas
  l'invite à créer. Tester les deux états.
- **Fichiers de test lourds** (ex. `__tests__/finance/fournisseurs.test.tsx`) : les
  lancer SEULS. Un timeout dans une suite chargée ne prouve rien.

### Questions fréquentes

**Une valeur de `multiSelect` contient une virgule.** L'URL sépare par des
virgules : `A,B` donne deux valeurs. Une valeur qui contient elle-même une
virgule serait coupée. Utiliser des identifiants ou des codes (`MATERIALS`), jamais
un libellé libre, comme valeur d'option.

**Le tri d'en-tête antd ne trie que la page (liste locale).** `tableProps.dataSource`
est la page courante. Pour un tri global, donner `sortItems` à
`useLocalListSearch` (constante de module) et lire `local.sort` / `local.setSort`.
Sans `sortItems`, ne pas laisser de `sorter` qui trompe.

**Mémoïsation des accesseurs.** `text`, `accessors`, `predicates`, `sortItems` pilotent
le recalcul par identité. Constantes de module : filtrage mémoïsé. Définis dans le
composant : la liste est recalculée à chaque rendu (correct, plus lent). Ne jamais
les déclarer inline si la liste dépasse quelques centaines de lignes.

**Mobile : « Appliquer ».** Sous 992 px, les critères de la feuille s'appliquent
tous ensemble au clic sur « Appliquer » ; un test sous 992 px doit cliquer
« Appliquer ». Le champ libre, hors feuille, s'applique comme sur bureau.

**La bascule bureau/mobile suit la fenêtre, pas le conteneur.** `useBreakpoint`
coupe à 992 px de largeur de FENÊTRE. Entre 992 et ~1100 px avec le menu latéral
ouvert, la barre dispose d'environ 700 px et passe sur plusieurs lignes : d'où
le conseil de 2 critères `primary` (un intervalle en prend 2). Pas de bascule par
`ResizeObserver` dans ce chantier (décision du superviseur).

**Présentation déjà gérée.** Nombres formatés selon la locale (compteur, montants
des puces) ; classes de survol, focus et cibles de 44 px dans
`components/primitives/list-search/list-search.css`, importé par les
sous-composants : rien à faire dans un écran.

**Le champ libre n'a pas de puce.** C'est voulu : il est déjà lisible dans le
champ. Le critère `text` compte pour 1 dans « Effacer » et dans `activeCount`.

**Libellés à traduire.** Les chaînes `t('…')` ajoutées par l'écran sont
listées dans le rapport ; le lot final lance `i18n:extract`. Ne pas toucher aux
catalogues, ne pas lancer `npm run i18n:extract` ni `npm run ai:catalog`.

**La valeur « rien » de chaque type.** Vider un contrôle ou retirer une puce écrit
`undefined` pour la clé (`''`, `[]`, `{}` sont équivalents). `setValues` fusionne
et remet la page à 1 ; `clear()` n'efface ni le tri ni la taille de page.

**Page hors bornes.** Une `?page=7` au-delà de la dernière page est recadrée.
Liste locale : la dernière page non vide s'affiche, sans réécrire l'URL.
`DataView` et `Table`, quand `search` leur est passé, recadrent SEULS : ils
appellent `onPageChange` vers la dernière page. Un écran sur mesure (sans
`DataView` ni `Table`) pose lui-même
`useEffect(() => search.clampPage(total), [total])`.

**Sélecteurs d'une autre partie de l'écran.** Un `Select` de formulaire (hors
liste) n'est pas un critère : ne pas le passer par `ListSearch`.

**Besoin non couvert** (nouveau type de critère, comportement de la barre) :
ne pas modifier `primitives/**`, `hooks/useListSearch.ts`, `hooks/useListParams.ts`
ni `utils/list-search/**` ; une solution locale à l'écran, et la question dans le
rapport du lot.

## Stabilité des rendus (lot performance, PR #194)

`useListSearch` stabilise les critères, valeurs structurées et propriétés de la
barre. Les contrôles sont mémoïsés ; leurs fonctions de rappel gardent une
identité stable tout en utilisant les valeurs courantes. Les écrans Stock et
Tâcheron mémorisent leurs critères, colonnes et tableaux afin que la saisie dans
un formulaire ne reconstruise pas les parties inchangées.

Les critères et leurs options doivent être remplacés de manière immuable lors
d'une modification. Un changement de langue remonte les pages via
`LanguageBoundary` dans `App.tsx`, ce qui reconstruit leurs libellés mémoïsés.

Mesure du 2026-11-05 : comparaison de `58ca023e^` et `e93d3259`, même scénario
et même processus Vitest/jsdom, avec les vrais contrôles Ant Design instrumentés.
Après cinq rendus du parent sans changement, Select et RangePicker effectuent
chacun cinq rendus supplémentaires avant optimisation et zéro après. Les cinq
tests permanents `list-search-renders.test.tsx` vérifient également les critères
redéclarés, la modification isolée d'un filtre et la temporisation du champ libre.
Ce résultat mesure les rendus ; il ne démontre pas un gain de durée dans un
navigateur réel ni un gain chiffré sur les écrans Stock et Tâcheron.
