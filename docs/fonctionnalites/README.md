# Inventaire des fonctionnalités

Le classeur `ImmoTopia_Wiki_Fonctionnalites.xlsx` de ce dossier est
l'inventaire de référence des fonctionnalités d'ImmoTopia : la liste
exhaustive de ce que l'application fait réellement, construite le
27/09/2026 à partir du code (routes API, écrans, permissions, menus), pas
d'une intention ou d'une spécification. Il complète `specs/` et le code
pour un agent qui veut comprendre ce que fait l'application, et sert de
matière première à la future page « Wiki des fonctionnalités » du site
vitrine.

Hiérarchie : pack > module > fonctionnalité > sous-fonctionnalité, la
sous-fonctionnalité étant la plus petite action utilisateur identifiable
(719 lignes au 01/10/2026).

## Feuilles du classeur

- **Lisez-moi** : présentation du classeur, méthode de construction, date.
- **Sous-fonctionnalites** : le tableau Excel nommé `SousFonctionnalites`
  (référence `A1:O720`), une ligne par sous-fonctionnalité, 15 colonnes :

  | Colonne                    | Contenu                                                                                         |
  | -------------------------- | ----------------------------------------------------------------------------------------------- |
  | Domaine                    | Regroupement agent (voir liste plus bas)                                                        |
  | Pack(s)                    | Packs qui exposent la fonctionnalité (Agence, Syndic, Promoteur, Opérateur intégré, extensions) |
  | Module                     | Module fonctionnel (CORE, CRM, SALES, RENTAL, PATRIMOINE, SYNDIC, CONSTRUCTION…)                |
  | Fonctionnalite             | Regroupement métier au-dessus de la sous-fonctionnalité                                         |
  | Sous-fonctionnalite        | La plus petite action utilisateur                                                               |
  | Objectif                   | Ce que l'utilisateur accomplit                                                                  |
  | Donnees attendues (entree) | Ce que l'utilisateur ou l'appel fournit                                                         |
  | Donnees en sortie          | Ce que le système renvoie ou produit                                                            |
  | Depend de                  | Sous-fonctionnalités prérequises                                                                |
  | Roles/profils ayant acces  | Qui peut déclencher l'action                                                                    |
  | Portail                    | Agence, propriétaire, locataire, plateforme…                                                    |
  | Route API                  | Méthode + chemin exact du code                                                                  |
  | Permission technique       | Clé de permission RBAC vérifiée par la route                                                    |
  | Statut                     | Voir ci-dessous                                                                                 |
  | Menu / sous-menu affiche   | Emplacement dans la navigation                                                                  |

  Valeurs de **Statut** : `Disponible` (fonctionne tel que décrit),
  `Disponible (legacy)` (fonctionne mais via un chemin de code ancien ou
  détourné) — et plus généralement `Disponible (…)` avec une réserve
  précisée entre parenthèses quand le comportement s'écarte légèrement de
  l'attendu ; `À vérifier (voir Notes)` ou `À vérifier — bug probable`
  quand une incertitude ne peut pas être tranchée sans risque de deviner.
  **Une ligne au Statut « À vérifier » a toujours une note correspondante**
  dans `NotesPointsOuverts` plutôt qu'une incertitude non tracée.

- **Legende Packs-Modules** : catalogue des packs (Agence, Syndic,
  Promoteur, Opérateur intégré et leurs extensions — source
  `packages/api/src/lib/subscription/catalog.ts`) et une table
  fonctionnalité (CORE, CRM, SALES, RENTAL, PATRIMOINE, SYNDIC,
  CONSTRUCTION) → module → packs qui l'exposent (source
  `lib/subscription/features.ts`).
- **Notes et points ouverts** : le tableau `NotesPointsOuverts` (Domaine,
  Sujet, Constat, À faire / à confirmer) — bugs probables, permissions non
  câblées, ambiguïtés relevées pendant la construction du classeur.

Domaines utilisés en colonne Domaine et dans la feuille Notes — valeurs
exactes du classeur, à recopier telles quelles (noter l'absence d'accent
sur « copropriete ») : `Parc immobilier`, `Gestion locative`, `Finance`,
`CRM et Ventes`, `Maintenance`, `Communication et Documents`,
`Syndic copropriete`, `Administration plateforme`, `Portails externes`.
Une nouvelle ligne réutilise l'un de ces domaines existants ; ne pas en
créer un nouveau ni en corriger l'orthographe.

## Miroir texte et outillage

`docs/fonctionnalites/sous-fonctionnalites.md` est un **miroir généré** du
classeur : une ligne de tableau Markdown par sous-fonctionnalité, groupée
par domaine, plus la légende et les notes. Il ne se modifie jamais à la
main — toute édition directe est écrasée au prochain export.

- `npm run wiki:export` régénère ce miroir à partir du classeur.
- `npm run wiki:check` échoue si le miroir n'est pas à jour par rapport au
  classeur, ou si sa structure est cassée (en-têtes attendus,
  Module/Sous-fonctionnalité/Statut non vides). Étape bloquante de la CI
  (job `api`).
- `npm run wiki:search -- <termes…>` affiche les sous-fonctionnalités
  contenant tous les termes donnés (insensible à la casse et aux accents)
  et les notes correspondantes.

**Un agent qui veut savoir si une fonctionnalité existe préfère
`npm run wiki:search` ou un `grep` sur le miroir texte plutôt que
d'ouvrir le `.xlsx`** : le miroir est lisible directement, versionné en
clair, et diffable dans une revue.

## Règle de mise à jour obligatoire

**Après la mise en place d'une fonctionnalité, ce classeur doit être mis
à jour.** Périmètre de la règle : tout ajout, modification ou retrait
d'une fonctionnalité visible — un écran, une action, une route API, une
permission, une entrée de menu, un rattachement pack/module. Un correctif
sans effet fonctionnel (refactor, correction de bug qui ne change ni
entrée ni sortie ni permission) n'a pas à toucher le classeur, mais la PR
le dit explicitement plutôt que de laisser deviner l'absence de mise à
jour.

## Comment mettre à jour

1. **Nouvelle sous-fonctionnalité** : une ligne, toutes les colonnes
   renseignées à partir du code réel — jamais inventées. En cas
   d'incertitude, mettre le Statut à `À vérifier — <raison>` et ajouter
   une ligne dans la feuille Notes plutôt que de deviner une réponse.
2. **Sous-fonctionnalité modifiée** : mettre à jour la ligne existante
   (colonnes touchées uniquement).
3. **Sous-fonctionnalité retirée** : supprimer sa ligne. Le classeur
   décrit l'état présent de l'application, pas son historique — celui-ci
   vit dans `git log`.
4. **Point ouvert résolu** : mettre à jour ou supprimer la ligne
   correspondante de `NotesPointsOuverts`.
5. Lancer `npm run wiki:export`, puis commiter le classeur et le miroir
   **ensemble**, dans la même PR que le changement fonctionnel.

### Outils

Excel, ou Python avec `openpyxl` (`py -3` sur ce poste). **Ne pas écrire
le classeur avec `exceljs`** : en écriture, il réécrit le classeur entier
et peut perdre des tableaux Excel et des styles. `openpyxl` modifie en
place.

**Piège openpyxl** : après avoir ajouté des lignes, étendre la référence
du tableau nommé, sinon les nouvelles lignes restent hors tableau (non
filtrables, non prises en compte par le tri) :

```python
import openpyxl

path = "docs/fonctionnalites/ImmoTopia_Wiki_Fonctionnalites.xlsx"
wb = openpyxl.load_workbook(path)
ws = wb["Sous-fonctionnalites"]

# Chaque valeur ci-dessous est un gabarit à remplacer par le fait réel lu
# dans le code — ne jamais recopier ces chevrons tels quels ni inventer une
# valeur plausible à leur place.
ws.append([
    "<Domaine, ex. Gestion locative — un des domaines existants>",  # Domaine
    "<Pack(s) qui exposent la fonctionnalite, ex. Agence>",         # Pack(s)
    "<Module : CORE, CRM, SALES, RENTAL, PATRIMOINE, SYNDIC, CONSTRUCTION>",  # Module
    "<Fonctionnalite, regroupement metier au-dessus de la ligne>",  # Fonctionnalite
    "<Sous-fonctionnalite, la plus petite action utilisateur>",     # Sous-fonctionnalite
    "<Objectif : ce que l'utilisateur accomplit>",                  # Objectif
    "<Donnees attendues en entree>",                # Donnees attendues (entree)
    "<Donnees en sortie>",                           # Donnees en sortie
    "<Depend de : sous-fonctionnalites prerequises, ou vide>",      # Depend de
    "<Roles/profils ayant acces>",                   # Roles/profils ayant acces
    "<Portail : Agence, Proprietaire, Locataire, Plateforme...>",   # Portail
    "<METHODE /chemin tel que monte dans packages/api/src/routes>", # Route API
    "<cle de permission RBAC verifiee par la route, ou vide>",      # Permission technique
    "<Statut : Disponible, Disponible (...), A verifier (voir Notes), A verifier - bug probable>",  # Statut
    "<Menu > Sous-menu affiche>",                    # Menu / sous-menu affiche
])

# Indispensable : sans cette ligne, les lignes ajoutées restent hors du
# tableau nommé SousFonctionnalites.
ws.tables["SousFonctionnalites"].ref = f"A1:O{ws.max_row}"

wb.save(path)
```

Puis `npm run wiki:export` pour régénérer le miroir.

### Piège de fusion

Le `.xlsx` est un fichier binaire : Git ne fusionne pas deux modifications
concurrentes, il force à choisir une version. **Un seul agent, sur une
seule branche, modifie le classeur à la fois.** En cas de conflit à la
fusion : reprendre la version de la base (celle de la branche cible),
réappliquer par-dessus les lignes ajoutées/modifiées de la branche en
conflit, puis régénérer le miroir avec `npm run wiki:export`.

### Travail parallèle

Le classeur est un fichier unique : un seul agent de réalisation le
possède dans un lot de travail donné (en général le coordinateur ou le
dernier agent du lot à intégrer), conformément à la règle « jamais deux
agents sur le même fichier ». Un agent à qui le classeur n'a pas été
confié signale dans son rapport les sous-fonctionnalités qu'il a
ajoutées ou modifiées, pour que l'agent qui possède le fichier les
reporte.

## Par rapport aux anciens recensements

`docs/FONCTIONNALITES.md` et `docs/architecture/features.md` sont
d'anciens recensements manuels, non maintenus depuis leur rédaction. En
cas d'écart, **ce classeur fait foi** : il est reconstruit à partir du
code, eux ne le sont pas.

## Avant toute publication publique

La feuille **Notes et points ouverts** contient des constats internes
(bugs probables, permissions non câblées, statuts « À vérifier ») qui
n'ont pas leur place sur une page publique. La relire et trancher chaque
point avant d'en tirer la page « Wiki des fonctionnalités » du site
vitrine.
