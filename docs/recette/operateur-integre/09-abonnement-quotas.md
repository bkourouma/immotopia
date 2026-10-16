# Partie J — Abonnement, quotas et limites

Vérifie ce que le pack **Opérateur intégré** autorise et refuse en
`SUBSCRIPTION_ENFORCEMENT=enforce` : jauges Chantiers/Copropriétés/Lots,
politique de dépassement, extensions, aperçu de facture, lecture seule
manuelle et visibilité des modules. Contrairement aux scénarios Syndic
existants (`SCENARIO_SYNDIC_ABONNEMENT.md`), l'instance de cette partie
tourne **déjà** en `enforce` (cadre commun) : les refus décrits ci-dessous
sont observables directement, sans bascule manuelle de Baba.

Environnement : voir le cadre commun (web `http://localhost:3311`, API
`http://localhost:8811`). Références code : `packages/api/src/lib/subscription/`
(`catalog.ts`, `entitlements.ts`, `guards.ts`) et
`docs/architecture/PLAN-ABONNEMENTS.md`.

## Prérequis

- Parties 01 à 08 jouées intégralement, **avec un point précis** : les trois
  chantiers de la partie 07 (Émeraude, Saphir, Rubis) sont toujours actifs
  (`PLANNED`/`IN_PROGRESS`/`SUSPENDED`) et les trois copropriétés de la
  partie 08 (Cocotiers, Plateau, Marcory) toujours **ACTIVE** — en
  particulier, l'étape H.18 de la partie 07 (bascule d'un lot de « Chantier
  Rubis OI » au patrimoine, qui le clôture définitivement) **n'a pas encore
  été jouée**. C'est cette hypothèse qui rend les jauges Chantiers et
  Copropriétés à 3/3 en entrant dans cette partie.
- Compte super-admin `admin@immobillier.com` / `Admin@123456`.
- Fiche de l'agence côté super-admin : `/admin/tenants/<TENANT>`, onglet
  « Abonnement » (`TENANT` = identifiant de « Groupe Intégré Recette OI »,
  visible dans l'URL de sa fiche, `Administration > Agences`).

## Réalité de l'environnement

- **`enforce` est déjà actif ici**, à la différence des scénarios Syndic
  existants où `warn` est la valeur par défaut de l'environnement de
  développement partagé : dans **cette** instance isolée, le cadre commun a
  posé `SUBSCRIPTION_ENFORCEMENT=enforce` dès le départ. Les refus décrits
  ci-dessous doivent donc se produire tels quels, sans action préalable de
  Baba.
- **Politique de dépassement par défaut : « Facturer le dépassement »**
  (`BILL_OVERAGE`, posée à la création de l'agence,
  `subscription-provisioning-service.ts` ligne 638). Sous cette politique,
  `evaluateQuota` (`entitlements.ts` lignes 349-364) renvoie `BILL` pour un
  dépassement en `enforce` : la création **est acceptée**, une ligne
  d'avertissement est journalisée côté serveur (`guards.ts` lignes 81-89,
  « Subscription quota exceeded »), et le dépassement remonte dans l'aperçu
  de la prochaine facture — **rien n'est bloqué**. Cette partie ne teste donc
  jamais la création des objets `Quota OI` sous cette politique par défaut :
  elle bascule d'abord sur « Bloquer le dépassement » (J.3), pour que le
  refus attendu soit observable sans avoir à créer puis défaire un objet
  supplémentaire.
- **Message de refus de quota, déjà stabilisé.** `QuotaExceededError`
  (`middleware/error-middleware.ts` lignes 158-165) répond **409** avec le
  texte exact : « La capacité de votre abonnement est atteinte : ajoutez une
  extension pour continuer. » — ce n'est plus une erreur générique (l'ancien
  état documenté dans `SCENARIO_SYNDIC_ABONNEMENT.md`, branche
  `fix/quota-exceeded-409`, est corrigé sur `main`).
- **Une copropriété ou un chantier consomme sa capacité dès sa création**,
  par le même mécanisme que les lots : `assertCapacityTx`
  (`packages/api/src/services/lot-registry-service.ts` lignes 488-499) est
  appelé par `createConstructionSite` (`lib/finance/sites.ts` ligne 343, un
  chantier `PLANNED` est actif au sens D14) et par `createSyndicate`
  (`lib/syndics/queries.ts` ligne 320, une copropriété est toujours créée
  **ACTIVE**, consommant la capacité COPROPRIETES sans exception). Les deux
  partagent la même politique et le même message de refus que les lots.
- **Ce qui compte dans la jauge Lots** (réserve unique de 300, D3,
  `docs/architecture/PLAN-ABONNEMENTS.md` §4) : un **logement**
  (`RENTAL_UNIT`, bien de l'agence ou bien CLIENT sous mandat/bail, en mode
  Location/Courte durée ou portant un bail actif — un immeuble découpé ne
  compte jamais, ses unités comptent) ; un **lot de copropriété principal**
  (`COPRO_LOT`, uniquement Appartement/Bureau/Commercial d'une copropriété
  ACTIVE ou IN_DISPUTE — parking et cave ne comptent jamais) ; un **lot de
  programme** (`PROGRAM_LOT`, _tout_ `SiteLot` d'un chantier actif, sans
  distinction de type — voir partie 07). Une même unité physique ne compte
  jamais deux fois (clé `P:<propertyId>` dès qu'un bien existe). Après les
  parties 02, 04, 07 et 08, la jauge Lots doit donc refléter : les logements
  en location de la partie 02/04 (Palmiers A1/A2/A3, Villa Riviera OI —
  « Palmiers A3 » importé en lot Plateau à la partie 08 ne compte pas une
  seconde fois, même clé physique) ; les lots C01/C02/C03 de Cocotiers
  (Appartement/Appartement/Bureau — **pas** C04, un Parking) ; les lots de
  chantier de la partie 07 (Villa E1/E2 d'Émeraude, Lot Capitalisable RU1 de
  Rubis — les deux comptent, un `SiteLot` n'a pas de notion de type). Très
  loin des 300 : cette partie ne teste pas le blocage des Lots, seulement sa
  composition.
- **Aucun écran « module non compris » à attendre ici.** Le pack Opérateur
  intégré ouvre `MODULE_AGENCY` + `MODULE_SYNDIC` + `MODULE_PROMOTER`, soit
  tous les modules du catalogue (`catalog.ts` ligne 138) : `moduleAccess`
  vaut **FULL** pour les trois, en toutes circonstances de ce scénario. Rien
  à masquer dans le menu ni à refuser à l'écran — cette partie constate
  l'absence de restriction plutôt qu'un refus.
- **Prix d'une extension « Chantier supplémentaire » avec l'Intégré.** Le
  catalogue (`catalog.ts` lignes 178-193) fixe son prix à **40 000** FCFA/mois
  par défaut, mais une règle `byHeldPacks` le ramène à **35 000** FCFA dès
  que l'agence détient le pack `INTEGRE` — c'est le prix qui doit apparaître
  ici. « Copropriété supplémentaire » (lignes 163-176), elle, reste à
  **10 000** FCFA/mois quel que soit le pack détenu (aucune règle
  `byHeldPacks` sur cette offre).
- **Cache des droits d'agence (30 s).** Après une action du super-admin sur
  l'onglet Abonnement (politique, extension, lecture seule), recharger la
  page de l'agence pour en voir l'effet ; si rien ne change, attendre 30
  secondes et recharger à nouveau (`ENTITLEMENTS_TTL_MS`,
  `subscription-v2-service.ts` ligne 270).
- **La demande d'extension reste ouverte en lecture seule.** Aucune garde de
  type `assertSubscriptionWritable` n'entoure
  `createExtensionRequestHandler` (`controllers/platform-billing-controller.ts`) :
  envoyer une demande d'extension fonctionne même agence en lecture seule
  (D15, `docs/architecture/PLAN-ABONNEMENTS.md` §6 quinquies : « portails,
  paiements et factures restent accessibles »).

## J.1 — Jauges Chantiers et Copropriétés à 3/3, composition des Lots

**Compte :** admin.oi@recette.test
**Action :** `BASE/settings/abonnement` (Agence › Paramètres de l'agence ›
« Voir mon abonnement »). Lire la carte « Consommation ».
**Attendu :** Jauges **Chantiers 3 / 3** et **Copropriétés 3 / 3** (les trois
chantiers et les trois copropriétés créés aux parties 07 et 08) ; jauge
**Lots X / 300**, avec X cohérent avec la composition décrite en « Réalité de
l'environnement » (logements en location + C01/C02/C03 de Cocotiers + lots de
chantier Émeraude/Rubis — ni C04 ni les baux en mode Vente).
**Couvre :** vérification de contexte, pas de sous-fonctionnalité dédiée du
wiki (lecture de la même page que J.7).

## J.2 — Tous les modules visibles, aucun écran « module non compris »

**Compte :** admin.oi@recette.test
**Action :** Parcourir le menu « Plus » : Gestion locative (Baux, Encaisser),
Finance › Chantiers et stock, Syndic, Ventes, CRM, Patrimoine. Taper
directement dans la barre d'adresse `BASE/rental/leases`,
`BASE/finance/chantiers`, `BASE/syndics`.
**Attendu :** Toutes les entrées de menu restent visibles ; les trois
adresses tapées à la main s'ouvrent normalement (pas de bandeau « module non
compris », pas de redirection) — l'agence détient les trois modules du pack
Opérateur intégré, rien n'est masqué ni refusé.
**Couvre :** confirmation de contexte (modules pleinement ouverts), aucune
sous-fonctionnalité de refus à exercer avec ce pack.

## J.3 — Politique de dépassement : constat du défaut, puis Bloquer

**Compte :** admin@immobillier.com (super-admin)
**Action :** `/admin/tenants/<TENANT>`, onglet « Abonnement ». Lire la
« Politique de dépassement » en vigueur. La faire passer à
**Bloquer le dépassement** dans le sélecteur.
**Attendu :** Politique affichée au départ = **Facturer le dépassement**
(défaut de provisioning, voir « Réalité de l'environnement ») ; changement
confirmé (« Politique de dépassement mise à jour »), le sélecteur affiche
désormais **Bloquer le dépassement**.
**Couvre :** contexte de la politique de dépassement (le wiki ne porte pas de
sous-fonctionnalité dédiée « changer la politique » hors du périmètre
Syndic/Promoteur déjà couvert dans les parties 07-08 ; cette étape prépare
J.4).

## J.4 — Refus de la 4ᵉ copropriété et du 4ᵉ chantier

**Compte :** admin.oi@recette.test
**Action :** Syndic › Copropriétés, « Nouvelle copropriété » :
`Copro Quota OI` (adresse `Test quota, Abidjan`). Finance › Chantiers et
stock › Chantiers, « Nouveau chantier » : `Chantier Quota OI` (zone
`Test quota`).
**Attendu :** Les deux créations sont **refusées** (409), avec le message
exact « La capacité de votre abonnement est atteinte : ajoutez une extension
pour continuer. » ; ni la copropriété ni le chantier n'apparaissent dans
leurs listes respectives après rechargement ; les jauges restent à 3/3.
**Couvre :** vérification du blocage de quota en politique Bloquer (D4),
appliquée aux capacités COPROPRIETES et CHANTIERS par le même mécanisme que
les lots.

## J.5 — Extensions ajoutées par le super-admin, aperçu de facture

**Compte :** admin@immobillier.com
**Action :** Onglet Abonnement, carte « Packs et extensions », « Ajouter » :
offre **Copropriété supplémentaire**, quantité 1. « Ajouter » à nouveau :
offre **Chantier supplémentaire**, quantité 1. Lire la carte « Consommation »
(jauges) et « Prochaine facture (aperçu) ».
**Attendu :** Les deux extensions apparaissent dans « Packs et extensions »
avec leur « Prix mensuel figé » : **10 000** FCFA pour Copropriété
supplémentaire, **35 000** FCFA (pas 40 000) pour Chantier supplémentaire —
prix réduit par la règle propre à l'Intégré (voir « Réalité de
l'environnement ») ; jauges désormais **Copropriétés 3 / 4** et
**Chantiers 3 / 4** ; aperçu de facture : ligne `Opérateur intégré 249 900`,
`Copropriété supplémentaire 10 000`, `Chantier supplémentaire 35 000`, Total
HT **294 900**, TVA 18 % **53 082**, Total TTC **347 982** (en l'absence de
toute autre extension ou remise déjà posée par les parties précédentes).
**Couvre :** ajout d'extensions par le super-admin (mécanisme générique déjà
détaillé dans `SCENARIO_SYNDIC_ABONNEMENT.md`, ici appliqué au pack
Opérateur intégré pour vérifier le prix réduit du Chantier supplémentaire).

## J.6 — Nouvelle tentative acceptée après extension

**Compte :** admin.oi@recette.test
**Action :** Recharger `BASE/settings/abonnement` (au besoin attendre 30
secondes, cache des droits). Recréer `Copro Quota OI` et
`Chantier Quota OI` avec les mêmes informations qu'en J.4.
**Attendu :** Les deux créations **réussissent** cette fois (messages de
succès, les deux objets apparaissent dans leurs listes) ; jauges
**Copropriétés 4 / 4** et **Chantiers 4 / 4** sur la page Abonnement de
l'agence.
**Couvre :** confirmation que l'extension lève effectivement le blocage
(politique Bloquer respectée dans les deux sens : refus avant, acceptation
après).

## J.7 — Lecture seule manuelle : refus sans motif, écritures bloquées, levée

**Compte :** admin@immobillier.com puis admin.oi@recette.test
**Action :** Onglet Abonnement, bouton « Passer en lecture seule ». Essayer
de confirmer **sans motif**. Puis saisir le motif
`Recette OI : lecture seule manuelle de test` et confirmer. Se reconnecter en
agence : recharger `BASE/settings/abonnement`, consulter les listes
(copropriétés, chantiers, factures) en lecture. Tenter de créer un
prestataire (Syndic › Copropriété Cocotiers › Prestataires › « Nouveau
prestataire », `Prestataire Test Lecture Seule`). Envoyer une nouvelle
demande d'extension (« Demander une extension », offre
« Copropriété supplémentaire », message `Test pendant la lecture seule`).
Revenir en super-admin, bouton « Lever la lecture seule », confirmer. En
agence, refaire la création du prestataire.
**Attendu :** Confirmation sans motif **refusée** (message d'erreur sur le
motif obligatoire) ; avec motif, badge **Lecture seule (manuelle)** affiché
sur la fiche de l'agence et sur `BASE/settings/abonnement` (« Compte en
lecture seule »), motif affiché ; les lectures fonctionnent normalement ; la
création du prestataire est **refusée** avec la notification
« L'abonnement de votre agence est en lecture seule : régularisez-le pour
enregistrer des modifications. », rien n'est créé ; la demande d'extension
est **acceptée** malgré la lecture seule (« Mes demandes » l'affiche
**En attente**) ; après « Lever la lecture seule », le badge disparaît et la
création du prestataire **réussit**.
**Couvre :** lecture seule manuelle du super-admin (D15) — refus sans motif,
pose avec motif, blocage des écritures, disponibilité des lectures et de la
demande d'extension, levée et retour à l'écriture normale.

## Couverture

| Fonctionnalité                 | Vérifications couvertes                                                                                   | Étapes |
| ------------------------------ | --------------------------------------------------------------------------------------------------------- | ------ |
| Jauges d'abonnement            | Chantiers, Copropriétés, Lots (composition)                                                               | J.1    |
| Visibilité des modules         | Menu et adresses directes des trois modules du pack                                                       | J.2    |
| Politique de dépassement       | Défaut (Facturer), bascule vers Bloquer                                                                   | J.3    |
| Blocage de quota (D4)          | Refus 4ᵉ copropriété, refus 4ᵉ chantier, message exact                                                    | J.4    |
| Extensions et facturation      | Ajout par le super-admin, prix réduit Intégré, aperçu de facture                                          | J.5    |
| Levée du blocage par extension | Nouvelle tentative acceptée après extension                                                               | J.6    |
| Lecture seule manuelle (D15)   | Refus sans motif, pose avec motif, écritures bloquées, lectures et demande d'extension disponibles, levée | J.7    |

Cette partie ne couvre pas de sous-fonctionnalités du wiki au sens strict
(le wiki ne documente pas les quotas comme des routes applicatives dédiées :
elles sont portées par les mêmes routes de création que les parties 07/08,
gardées par `lib/subscription`) ; elle vérifie le comportement transverse
d'abonnement décrit dans `docs/architecture/PLAN-ABONNEMENTS.md`.
