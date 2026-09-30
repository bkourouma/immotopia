# Recette de bout en bout par pack — cadre commun

Recette du 2026-09-30 : un scénario écrit **puis rejoué dans l'interface** pour
chaque pack d'abonnement, sur tous les modules que ce pack ouvre — et sur les
refus attendus pour ceux qu'il n'ouvre pas. Chaque pack a son agent, son
instance, sa base ; les agents ne partagent rien sauf le bus d'anomalies.

Références à lire d'abord : `AGENTS.md`, `docs/architecture/PLAN-ABONNEMENTS.md`,
`docs/recette/SCENARIO_SYNDIC_ABONNEMENT.md` (exemple de scénario et de
« réalité de l'environnement »), `packages/api/src/lib/subscription/{catalog,features,route-features}.ts`,
`apps/web/src/navigation/model.tsx` (le menu), `specs/<module>/`,
`npm run wiki:search -- <termes>` (inventaire des fonctionnalités).

## 1. Les packs et ce qu'ils ouvrent

| Pack                                  | Modules                    | Fonctionnalités ouvertes                   | Capacités                             |
| ------------------------------------- | -------------------------- | ------------------------------------------ | ------------------------------------- |
| `AGENCE` (29 900 FCFA/mois)           | MODULE_AGENCY              | CORE, CRM, SALES, RENTAL, PATRIMOINE       | 100 lots                              |
| `SYNDIC` (49 900)                     | MODULE_SYNDIC              | CORE, SYNDIC                               | 2 copropriétés, 100 lots              |
| `PROMOTEUR` (149 900)                 | MODULE_PROMOTER            | CORE, CRM, SALES, PATRIMOINE, CONSTRUCTION | 2 chantiers, 150 lots                 |
| `INTEGRE` Opérateur intégré (249 900) | AGENCY + SYNDIC + PROMOTER | toutes                                     | 3 chantiers, 3 copropriétés, 300 lots |
| `PATRIMOINE_ESSENTIEL` (9 900)        | MODULE_PATRIMOINE          | CORE, RENTAL, PATRIMOINE                   | 10 biens détenus en propre            |
| `PATRIMOINE_PRO` (29 900)             | MODULE_PATRIMOINE          | CORE, RENTAL, PATRIMOINE                   | 100 biens détenus en propre           |

CORE = biens, contacts, documents, rôles, audit, tableaux de bord, maintenance,
finance opérationnelle (caisse, comptabilité, fournisseurs), communication,
ImmoCopilot. Les packs Patrimoine ajoutent la barrière « détenu en propre » : ni
mandat de gestion, ni propriétaire tiers (indivision, bien, bail). Une agence peut
aussi avoir un essai de 30 jours, 7 jours de grâce, puis lecture seule.

## 2. Instances (une par pack, chacune avec sa base)

| Pack                   | Web                             | API (santé : `/health`)         | Base                      |
| ---------------------- | ------------------------------- | ------------------------------- | ------------------------- |
| `AGENCE`               | http://agence.localhost:3301    | http://agence.localhost:8801    | `immotopia_rec_agence`    |
| `SYNDIC`               | http://syndic.localhost:3302    | http://syndic.localhost:8802    | `immotopia_rec_syndic`    |
| `PROMOTEUR`            | http://promoteur.localhost:3303 | http://promoteur.localhost:8803 | `immotopia_rec_promoteur` |
| `INTEGRE`              | http://integre.localhost:3304   | http://integre.localhost:8804   | `immotopia_rec_integre`   |
| `PATRIMOINE_ESSENTIEL` | http://patess.localhost:3305    | http://patess.localhost:8805    | `immotopia_rec_patess`    |
| `PATRIMOINE_PRO`       | http://patpro.localhost:3306    | http://patpro.localhost:8806    | `immotopia_rec_patpro`    |

Chaque instance a un hôte différent **exprès** : les cookies d'authentification
sont propres à l'hôte, donc plusieurs agents peuvent être connectés en même temps
sans s'éjecter. **N'utiliser QUE l'instance de son pack.**

Réglages de ces instances (ne sont pas des anomalies) : `SUBSCRIPTION_ENFORCEMENT=enforce`
(menus masqués et routes refusées pour un module non souscrit, quotas bloquants
selon la politique de l'agence), paiement en ligne de la plateforme en mode
`SIMULATOR`, envois d'e-mails captés par un récepteur local (rien ne part), pas
de WhatsApp, ImmoCopilot avec le faux fournisseur déterministe, cache des droits
d'agence de 30 s (recharger après une action du super-admin).

Base de départ : rôles/permissions, référentiel géographique, catalogue des offres,
modèles de documents et de biens, un compte super-admin. **Aucune agence.** Le
compte super-admin est celui du seed `packages/api/prisma/seeds/create-super-admin.ts`
(valeurs par défaut de développement ; ne pas les recopier dans un rapport).

## 3. Règles impératives

- **Ne jamais modifier le code, la base ni un `.env`** : la recette observe et
  rapporte, des agents correcteurs réparent. Aucune commande git qui modifie
  l'arbre ou l'index (`stash`, `checkout`, `reset`, `restore`, `add`, `commit`,
  `switch`, `merge`, `rebase`). Ne lancer aucun sous-agent. Si des fichiers
  semblent « revenus en arrière », s'arrêter et le signaler.
- Écrire uniquement dans `docs/recette/packs/` (ton scénario, ton journal) et,
  par `npm run agent-bus -- …`, dans `.agent-bus/`. Rien d'autre.
- Ne pas lire de fichier `.env*`. Ne pas lancer de seed, de `prisma migrate`,
  ni de commande qui touche une base. Ne pas arrêter ni relancer les serveurs.
- Ne jamais cliquer « Payer en ligne » sur un vrai prestataire ; le mode est
  simulé sur ces instances mais on ne s'en approche que pour la vérification
  explicite du scénario d'abonnement (paiement simulé autorisé, une seule fois).
- Ne rien supprimer hors des données créées par le scénario ; ne jamais supprimer
  une agence (la suspendre au besoin).
- Aucune donnée personnelle réelle : noms, e-mails (`@exemple.test`), téléphones
  et adresses fictifs. Aucun secret dans un rapport, une anomalie ou le scénario.
- Un résultat qui n'est pas vu à l'écran n'est pas un résultat : ne pas inventer,
  écrire `échoué` ou `bloqué`.

## 4. Navigateur

- Outils : `mcp__Claude_Browser__*` (navigateur intégré). **Créer son propre onglet**
  (`tabs_create`, en arrière-plan) et **passer `tabId` à chaque appel** : d'autres
  agents pilotent d'autres onglets en même temps ; ne jamais agir sur l'onglet
  « au premier plan ».
- Préférer `read_page`, `find`, `get_page_text` et les clics par `ref` aux captures
  d'écran (un panneau masqué peut bloquer une capture). `read_console_messages` et
  `read_network_requests` (erreurs 4xx/5xx, réponses vides) prouvent un défaut.
- Le navigateur intégré ne fait confiance qu'aux pages servies depuis
  `localhost` ou `*.localhost` (les requêtes d'une page servie depuis une adresse
  IP sont bloquées) : utiliser **exactement** les adresses du tableau du §2, jamais
  `127.0.0.1`. Les cookies étant propres à chaque sous-domaine, chaque agent a sa
  propre session. Le premier chargement d'une page prend jusqu'à 10 s (Vite compile
  à la demande) : attendre avant de conclure à un écran vide.
- Pour l'API en ligne de commande (`curl`), utiliser `http://127.0.0.1:<port API>`
  avec un fichier de cookies propre à ton agent dans le dossier temporaire de ta
  session. Si le navigateur devait néanmoins t'être refusé, jouer le scénario **par
  l'API** et marquer chaque étape « API seule ».
- Les appels directs à l'API servent aussi à **vérifier** un état (compte des
  lignes, réponse d'un refus, code d'erreur) ; jamais à sauter une étape d'interface
  qu'un utilisateur ferait par clics.

## 5. Ce qu'un scénario de pack doit couvrir

Le scénario est un document numéroté (étapes, données, résultat attendu), écrit
**avant** l'exécution puis complété par le journal. Il suit un utilisateur réel
d'un cabinet/agence de ce type, du super-admin qui crée l'agence jusqu'aux
portails et à la facturation :

1. **Souscription** : le super-admin crée l'agence avec le pack (aperçu du prix,
   essai de 30 jours, lien d'invitation), la fiche abonnement, modules et
   capacités affichés. L'administrateur accepte l'invitation, se connecte, remplit
   l'agence (paramètres, identité de documents).
2. **Menu et refus** : le menu contient exactement les entrées des modules
   souscrits ; chaque module NON souscrit est absent du menu **et** refusé quand
   on tape son adresse ou appelle son API (statut et message clairs, pas d'écran
   blanc ni d'erreur générique).
3. **Chaque module inclus, de bout en bout** — création, modification, liste,
   recherche/filtre, détail, statuts, documents PDF/Excel, notifications, droits
   d'un collaborateur (inviter un second utilisateur avec un rôle limité et
   vérifier ce qu'il voit et ne voit pas) :
   tableau de bord ; biens (fiche, médias, documents, visites) ; contacts ;
   maintenance/incidents et prestataires ; documents et modèles ; finance (caisse,
   comptabilité, clients, fournisseurs, factures, paiements) ; communication
   (e-mail, newsletter) ; ImmoCopilot ; paramètres de l'agence ; et, selon le pack,
   CRM (contacts, affaires, activités, calendrier), ventes (mandats, offres,
   commissions), gestion locative (baux, échéances, paiements, quittances, portail
   locataire et propriétaire), patrimoine (vue consolidée, performance, travaux,
   relevés, entités, fiscalité, exports), syndic (copropriétés, lots, tantièmes,
   appels de charges, AG, prestataires, fonds, portail copropriétaire),
   chantiers/BTP (chantiers, stock, main-d'œuvre, tâcherons, retenues, achats).
4. **Parcours transversaux** entre les modules du pack (ex. contact → bien → bail
   → échéance → paiement → quittance → portail ; ou copropriété → lots → appel de
   charges → encaissement → relance ; ou chantier → achat → facture fournisseur →
   paiement → clôture ; ou bien détenu → bail direct → revenus → rendement →
   export).
5. **Limites d'abonnement** : jauges, alerte à 80 %/100 %, refus au quota
   (politique « Bloquer ») ou dépassement facturé (politique « Facturer »),
   extension d'un bloc, changement de pack, lecture seule (écritures refusées,
   lectures et export permis), page Abonnement et factures (TVA 18 %).
6. **Étanchéité** : créer une **seconde agence** du même pack (ou lire un
   identifiant de la première) et vérifier qu'aucune donnée, aucun identifiant
   n'est lisible ni modifiable d'une agence à l'autre (même 404 qu'un objet
   inexistant).
7. **Trilinguisme et mise en page** : bascule fr → en → ar sur au moins cinq écrans
   de modules différents (libellés traduits, pas de clé brute, mise en page RTL
   correcte), écran étroit (mobile 375 px) pour les écrans principaux.

Prévoir plusieurs dizaines d'étapes par module principal ; c'est long, c'est voulu.
Les modules ouverts par plusieurs packs sont rejoués dans chaque pack : leur
comportement doit être identique ; toute différence est une anomalie.

## 6. Anomalies

Une anomalie = un comportement distinct, créée dans le bus **dès qu'elle est
constatée** (les correcteurs travaillent en parallèle) :

```bash
npm run agent-bus -- new-bug --title "[PACK] <module> — <symptôme>" --priority bloquant|important|mineur --scenario "<n° d'étape>"
```

puis compléter le fichier `.agent-bus/bugs/BUG-….md` (préconditions, étapes
numérotées, attendu, observé, URL, preuve : texte lu à l'écran / statut HTTP /
message d'erreur de console). Avant de créer, `npm run agent-bus -- list` : ne pas
dupliquer une anomalie déjà ouverte par un autre pack — ajouter une ligne
« Aussi vu dans le pack X » à la sienne.

Priorités : **bloquant** = parcours impossible, perte ou fuite de données, écran
blanc, refus d'un module souscrit, accès à un module non souscrit ; **important** =
résultat faux (montant, statut, permission), message d'erreur générique là où un
message précis est attendu, libellé non traduit, export inutilisable ;
**mineur** = mise en page, accent, ordre, confort.

Défauts **déjà corrigés dans une PR ouverte mais pas encore dans cette build** —
à signaler quand même en une ligne dans le journal (« connu, PR #N »), sans
créer d'anomalie : #63 (numérotation `-A2` des contrats suivants, devise du bail
dans les modèles DOCX), #64 (limiteurs ImmoCopilot), #67 (fiche d'un actif
Patrimoine vide, `assetId` indéfini), #68 (inscription libre, fil d'Ariane
admin, accents et devise du portail propriétaire), #69 (permissions
PATRIMOINE_PERSONAL_VIEW/EDIT), #70 (exports PDF/Excel de la situation
patrimoniale), #71 (tantièmes spéciaux et « propriétaire depuis » d'un lot),
#72 (programmation modifiable et échec d'envoi d'une relance), #73 (le premier
administrateur d'une agence provisionnée ne pouvait pas accepter son invitation),
#74 (valeur calculée d'un bien Patrimoine qui gardait sa méthode). Si l'un de ces
défauts **bloque** ton parcours, le noter « bloquant (connu) » et contourner par
l'API.

## 7. Livrables

1. `docs/recette/packs/SCENARIO_PACK_<CODE>.md` : le scénario (§5) puis, dans le
   même fichier, le **journal d'exécution** : par étape `passé` / `échoué` (n° de
   BUG) / `bloqué` (cause), ce qui a été réellement vu, et la **matrice de
   couverture** (chaque entrée du menu du pack × testé oui/non × verdict).
2. Les anomalies dans le bus.
3. Un rapport final de 40 lignes au plus au Pilote : compte des étapes
   passées/échouées/bloquées, liste des BUG (id, priorité, titre), ce qui n'a pas
   été couvert et pourquoi. Ne pas attendre d'avoir tout fini pour signaler un
   défaut : le bus est lu en continu.

Tu peux être relancé plus tard (« retest ») avec une liste d'identifiants
d'anomalies : rejouer alors ces étapes et leurs voisines, puis passer chaque
anomalie à `passé` ou la rouvrir avec la preuve du nouvel état
(`npm run agent-bus -- set-state <ID> <état> --note "..."`).
