# Guide de rédaction de l'aide interne

Ce guide s'adresse à toute personne ou tout agent qui écrit le contenu de l'aide d'ImmoTopia (le « ? » des écrans).
Suivez-le à la lettre : les lots de rédaction par module doivent produire un contenu homogène.

Exemple de référence : `apps/web/src/help/content/locatif/fr.ts` (fiches de la liste des baux).
Le contrat technique est dans `apps/web/src/help/types.ts` : ne le modifiez pas.

## 1. Pour qui on écrit

Les lecteurs sont des gestionnaires d'agence, des syndics, des comptables, des propriétaires, des locataires et des
copropriétaires, en Côte d'Ivoire. Ils ne sont pas informaticiens et lisent souvent sur téléphone.

- Vouvoyez toujours le lecteur.
- Écrivez en français simple : phrases courtes, mots du quotidien, un verbe d'action par étape.
- Aucun jargon technique à l'écran : jamais « tenant », « API », « id », « statut ACTIVE » brut, « payload ». Dites
  « agence », « identifiant » si nécessaire, et le libellé exact affiché dans l'interface pour un statut (« En cours »,
  pas `ACTIVE`).
- Montants en FCFA (`150 000 FCFA`, espace entre les milliers), dates au format jour/mois/année.
- Reprenez les mots exacts des boutons, onglets et colonnes de l'écran, entre guillemets français (« Nouveau bail »).

## 2. Règle d'or : ne jamais décrire une fonction qui n'existe pas

Chaque affirmation doit se vérifier dans l'écran, le service ou la spécification (`specs/<module>/`). Avant d'écrire
une phrase, ouvrez le code de l'écran (et le service API si l'action déclenche quelque chose) et vérifiez-la.

- Un doute ? Ne l'écrivez pas dans l'aide. Notez « à confirmer » dans votre rapport de lot, avec la question précise.
- Ne promettez rien que le code ne fait pas (pas de « vous recevrez un rappel » si aucun rappel n'est envoyé).
- Dites les conséquences exactes : l'action est-elle irréversible ? Qui reçoit un e-mail ou un SMS ? Quels documents
  sont générés (quittance, avis d'échéance, contrat) ? Quel montant est calculé et comment ? Rangez ces informations
  dans `consequences`.
- Une fonction réservée à un pack d'abonnement le dit dans `permissions.feature` (voir plus bas).

## 3. Forme et longueurs

Le texte est du **texte brut** : jamais de HTML ni de Markdown (pas de `**`, de listes à puces, de liens). Les
paragraphes d'un même champ se séparent par une ligne vide (`\n\n`).

| Champ                                | Limite                                             |
| ------------------------------------ | -------------------------------------------------- |
| `summary`                            | 2 phrases au plus                                  |
| `steps`                              | 8 étapes au plus, titre court, `detail` facultatif |
| `faq`                                | de 3 à 8 questions, réponses de 1 à 3 phrases      |
| Fiche de page (tout le texte cumulé) | environ 650 mots au plus                           |
| `tour.steps[].description`           | 1 à 2 phrases                                      |

Contenu des champs :

- `purpose` : à quoi sert l'écran, dans quel travail de l'agence il s'inscrit.
- `howToRead` : colonnes (`columns`), statuts (`statuses`), remarques (`notes`) pour lire le tableau ou les chiffres.
- `steps` : la procédure pas à pas, dans l'ordre où l'on clique.
- `consequences` : ce qui se passe après (irréversible, qui est prévenu, documents générés).
- `faq` : les vraies questions des utilisateurs (« Comment corriger un montant ? »).
- `permissions.roles` : libellés de rôles en clair (« Gestionnaire », « Comptable »).
- `keywords` : synonymes et mots du quotidien pour la recherche (« loyer », « contrat de location »).

## 4. Identifiants

Forme : `<module>.<ecran>[.<bloc>]`, en minuscules, chiffres, points et tirets uniquement. La regex est
`HELP_ID_PATTERN` dans `types.ts` : `^[a-z0-9]+(\.[a-z0-9-]+)+$`.

- Le premier segment est le module (`locatif`, `syndic`, `finance`, `patrimoine`, `commercial`, `communication`,
  `portails`, `administration`) et doit être le dossier où vit la fiche.
- Exemples : `locatif.baux.liste` (l'écran), `locatif.baux.liste.tableau` (son tableau), `locatif.baux.nouveau`
  (assistant de création).
- Un identifiant est unique et identique dans les trois langues. Une fois publié, ne le renommez pas sans corriger le
  code qui l'utilise.

`kind` : `page` pour l'écran entier, `section` pour une carte, un onglet ou un assistant, `table` pour un tableau.

## 5. Structure des fichiers

Chaque module a quatre fichiers dans `apps/web/src/help/content/<module>/` :

```text
routes.ts   motifs de route -> fiche de page
fr.ts       fiches en français (référence)
en.ts       mêmes fiches en anglais
ar.ts       mêmes fiches en arabe
```

- N'éditez jamais `content/index.ts` ni `types.ts`.
- `fr.ts`, `en.ts`, `ar.ts` exportent un tableau `HelpEntry[]` par défaut ; `routes.ts` exporte `routes: HelpRoute[]`.
- Triez les tableaux par écran, une fiche de page suivie de ses blocs, dans le même ordre dans les trois langues.
- Les fichiers de contenu n'importent que des **types** (`import type { HelpEntry } from '../../types'`) ; seuls
  `fr.ts`, `en.ts` et `ar.ts` importent aussi leurs zones (voir « Découpage par zone »).
- Les motifs de route commencent par `/` et utilisent les paramètres de react-router, par exemple
  `/tenant/:tenantId/rental/leases`. Le nom du paramètre n'a pas d'importance pour la couverture.
- Le contenu d'aide n'est pas extrait par `npm run i18n:extract` : ne l'enveloppez pas dans `t()`.

### Découpage par zone

Dès qu'un module a plusieurs rédacteurs ou dépasse quelques dizaines de fiches, `fr.ts`, `en.ts` et `ar.ts` ne
contiennent plus les fiches : ils concatènent des **fichiers de zone**.

```text
content/<module>/
  routes.ts
  fr.ts   en.ts   ar.ts            concatènent les zones, rien d'autre
  fr/<zone>.ts                     une zone = un fichier par langue
  en/<zone>.ts
  ar/<zone>.ts
```

- Une zone regroupe un ensemble cohérent d'écrans (ex. `baux`, `fournisseurs`). **Un rédacteur par zone** : deux
  rédacteurs ne touchent jamais le même fichier.
- Les **mêmes noms de zone** existent en fr, en et ar (`fr/baux.ts`, `en/baux.ts`, `ar/baux.ts`).
- Un fichier de zone exporte par défaut un `HelpEntry[]` et n'importe que des types
  (`import type { HelpEntry } from '../../../types'`) :

  ```ts
  import type { HelpEntry } from "../../../types";
  const entries: HelpEntry[] = [/* fiches de la zone */];
  export default entries;
  ```

- `fr.ts` ne fait que concaténer, et le même schéma vaut pour `en.ts` et `ar.ts` :

  ```ts
  import baux from "./fr/baux";
  import fournisseurs from "./fr/fournisseurs";
  export default [...baux, ...fournisseurs];
  ```

  Ajouter une zone = un fichier par langue + une ligne d'import dans chaque `<lang>.ts`. Exemple vivant : `content/locatif/`.

- Le chargement reste paresseux, un `import()` par module et par langue (déclaré dans `content/index.ts`, qu'on ne
  modifie pas) : les zones sont regroupées dans le même chunk que leur `<lang>.ts`.
- `npm run help:check` suit ces imports. Les contrôles A à E sont inchangés ; D refuse en plus tout import qui n'est
  ni un type ni une zone de la même langue, et un avertissement signale un fichier de zone que `<lang>.ts` n'importe pas.

## 6. Traduction en anglais et en arabe

- Traduisez à partir du français validé, fiche par fiche, avec les mêmes identifiants.
- Arabe standard moderne, clair, sans dialecte. Gardez un glossaire cohérent dans le module (« bail », « loyer »,
  « quittance », « syndic »… toujours rendus par le même mot) et notez-le dans votre rapport.
- Pour l'arabe, appliquez le [glossaire arabe](GLOSSAIRE_AR.md) : un seul terme par concept métier dans tous les modules.
- Conservez `FCFA` tel quel.
- Citez les libellés tels que l'interface les affiche **dans chaque langue** : en anglais et en arabe, reprenez le
  libellé traduit du catalogue de l'interface (`apps/web/src/i18n/`), jamais le texte français. Seul un libellé que
  l'interface affiche réellement en français dans cette langue reste en français.
- Ne traduisez **jamais** les clés et valeurs techniques : `id`, `kind`, `key` (des colonnes), `value` (des statuts),
  `target` (des étapes de visite), `helpId`, `to`. Seuls les textes lus par l'utilisateur se traduisent.
- Les trois langues portent exactement les mêmes identifiants, et le même nombre d'étapes, de questions et de colonnes.

## 7. Quels blocs documenter

Pour chaque écran du module :

1. une fiche `page` (déclarée dans `routes.ts`) ;
2. une fiche `table` pour chaque tableau ;
3. une fiche `section` pour chaque carte ou section titrée, chaque onglet, chaque assistant ou formulaire important.

Ne documentez pas un détail évident (un bouton « Fermer »). Mieux vaut peu de fiches justes que beaucoup de fiches
vagues.

## 8. Brancher l'aide dans le code d'un écran

Un « ? » de page apparaît **automatiquement** pour toute route déclarée dans `routes.ts` : aucun code à ajouter pour
la fiche de page.

Les blocs se câblent dans l'écran avec un `helpId` littéral (le contrôle `help:check` ne lit que les littéraux) :

```tsx
// le chemin relatif dépend de l'emplacement de l'écran
import { HelpSectionTitle, HelpButton, helpAnchor } from '../../help';

<PageHeader helpId="locatif.baux.liste" ... />
<DataView helpId="locatif.baux.liste.tableau" ... />
<Table helpId="locatif.baux.liste.tableau" ... />
<DataCard helpId="locatif.baux.liste.resume" ... />
<StatCard helpId="locatif.baux.liste.indicateurs" ... />
<Card title={<HelpSectionTitle title={t('Échéancier')} helpId="locatif.baux.detail.echeancier" />}>...</Card>
```

Visite guidée : posez une ancre sur l'élément visé et reprenez la même valeur comme `target` de l'étape.

```tsx
<Button {...helpAnchor("baux-nouveau")}>{t("Nouveau bail")}</Button>
```

```ts
tour: {
  steps: [
    { target: "baux-nouveau", title: "Créer un bail", description: "..." },
  ];
}
```

Une étape dont l'ancre est absente de l'écran est ignorée : ne documentez pas une ancre qui n'existe pas.

N'ajoutez au code d'un écran que ces props et ces ancres : ne modifiez pas sa logique.

### Règles de câblage

- **Visite `autoStart` : ancres visibles à l'ouverture.** Une visite qui démarre toute seule ne doit viser que des
  ancres présentes dès l'ouverture de l'écran. Le lecteur d'étapes ne les cherche que pendant 3 secondes (toutes les
  250 ms) : si aucune n'apparaît, la visite s'arrête sans rien afficher. Une ancre dans un onglet fermé, un
  panneau replié ou un bloc qui se charge tard n'a pas sa place dans une visite `autoStart` : visez le premier
  écran visible, ou retirez `autoStart`.
- **Chaque fiche de bloc est câblée.** Une fiche `section` ou `table` doit être appelée par un « ? » ou une
  colonne de l'écran (`helpId` littéral). `npm run help:check` ne vérifie que le sens inverse (A : tout `helpId`
  du code a sa fiche) ; il ne signale pas une fiche que le code n'appelle jamais. Cette règle reste donc une règle
  de revue : cherchez l'identifiant dans `apps/web/src` avant de livrer.
- **Jamais de « ? » dans le libellé d'un onglet.** Un clic sur l'onglet change d'onglet et déclenche aussi le « ? » :
  l'aide s'ouvre sans que l'on l'ait demandée. Posez le « ? » en tête du contenu de l'onglet, avec le même `helpId`.
- **Un seul « ? » par rangée de cartes.** Placez-le sur la première carte, ou à côté du titre de la section qui
  porte la rangée : pas un « ? » par carte.

## 9. Liens, droits d'abonnement, visites guidées

- `related` : `helpId` ouvre une autre fiche d'aide ; `to` est un lien interne. Dans `to`, écrivez `:tenantId` : il est
  remplacé par l'agence courante (`/tenant/:tenantId/rental/leases`).
- `permissions.feature` : une clé parmi `CRM`, `SALES`, `RENTAL`, `PATRIMOINE`, `SYNDIC`, `CONSTRUCTION`. Si le pack
  de l'agence ne l'inclut pas, le panneau affiche « Non inclus dans votre pack ». Ne la renseignez que si l'écran est
  vraiment réservé à ce pack.
- Visite guidée (`tour`) : réservez-la aux écrans où l'on se perd ou où une erreur coûte cher. `autoStart: true`
  est réservé aux écrans clés (création de bail, appel de fonds, assemblée générale, encaissement…) : elle se lance
  alors une fois par navigateur. Les autres visites se lancent à la demande. De 3 à 6 étapes.

## 10. Avant de livrer

- [ ] Chaque affirmation du français a été relue contre l'écran, le service ou la spécification.
- [ ] Longueurs respectées (résumé, étapes, FAQ, fiche de page).
- [ ] Libellés cités tels qu'affichés dans chaque langue (en et ar : libellé traduit du catalogue).
- [ ] Règles de câblage respectées : visite `autoStart` sur ancres visibles, fiche de bloc appelée par le code, pas de
      « ? » dans un onglet, un « ? » par rangée de cartes.
- [ ] Texte brut partout, vouvoiement, FCFA, aucun terme technique.
- [ ] `en.ts` et `ar.ts` portent exactement les mêmes identifiants que `fr.ts`.
- [ ] Toutes les routes du module sont dans `routes.ts` et pointent vers une fiche `page`.
- [ ] `npm run help:check -w apps/web` passe (depuis la racine : `npm run help:check`). Il vérifie les identifiants du
      code, la cohérence des trois langues, les routes, l'unicité et la forme des identifiants, et liste en
      avertissement les routes de l'application sans fiche (`--strict` les rend bloquantes).
- [ ] Le rapport de lot liste les points « à confirmer » (fonctions douteuses laissées hors de l'aide).
