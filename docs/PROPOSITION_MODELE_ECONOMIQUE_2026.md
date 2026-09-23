# ImmoTopia — packs couvrant tous les métiers

**Proposition commerciale — 23 septembre 2026**  
**Marché initial :** Abidjan et Côte d'Ivoire  
**Devise :** FCFA ; prix mensuels proposés avant taxes applicables  
**Statut des prix :** hypothèses à valider auprès de clients, pas tarifs de marché constatés

## 1. Logique de l'offre

ImmoTopia possède trois modules activables (`MODULE_AGENCY`, `MODULE_SYNDIC`, `MODULE_PROMOTER`) et des fonctions transversales : CRM, finance, patrimoine, documents, portails, maintenance et communication. Le client n'achète pas une collection de menus ; il achète le processus correspondant à son métier. Quatre packs suffisent pour couvrir toutes ces fonctions : **Agence**, **Syndic**, **Promoteur** et **Opérateur intégré**.

Ces packs supposent que les parcours promis fonctionnent **de bout en bout dans la version effectivement déployée**. La documentation fonctionnelle du 22 septembre 2026 signale encore un maillon de vente incomplet et des fonctions finance/chantiers présentes sur une branche particulière. Ce point doit être levé par une démonstration et des tests métier avant de publier les promesses de vente complète du pack Promoteur et de l'Opérateur intégré. La grille commerciale ci-dessous reste valable comme cible si l'hypothèse de complétude est confirmée.

## 2. Grille proposée

| Pack                  | Client visé                                                        |     Prix mensuel | Capacité incluse                                                             | Extension de capacité                                                                                    |
| --------------------- | ------------------------------------------------------------------ | ---------------: | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| **Agence**            | Agence de transaction et de gestion locative                       |  **29 900 FCFA** | 100 logements sous mandat de gestion                                         | +150 FCFA/logement du 101e au 300e, puis +75 FCFA au-delà                                                |
| **Syndic**            | Cabinet de copropriété                                             |  **49 900 FCFA** | 2 copropriétés actives et 100 lots principaux                                | +10 000 FCFA/copropriété supplémentaire ; +150 FCFA/lot au-delà de 100                                   |
| **Promoteur**         | Promoteur ou entreprise immobilière qui construit et commercialise | **149 900 FCFA** | 2 chantiers actifs et 150 lots de programme                                  | +40 000 FCFA/chantier actif ; +100 FCFA/lot de programme au-delà de 150                                  |
| **Opérateur intégré** | Groupe qui construit, commercialise, loue et gère des copropriétés | **249 900 FCFA** | 3 chantiers actifs, 3 copropriétés actives et 300 lots immobiliers distincts | +35 000 FCFA/chantier ; +10 000 FCFA/copropriété ; +100 FCFA/lot distinct au-delà des capacités incluses |

L'**Opérateur intégré** inclut tous les modules métier et toutes les fonctions transversales, sans supplément « finance », « CRM » ou « patrimoine ». Son tarif de départ se justifie par un usage réellement combiné ; un client qui ne gère qu'un chantier doit pouvoir choisir Promoteur. Un réseau dépassant sensiblement ces capacités reçoit un devis à partir de cette formule, avec périmètre, accompagnement et niveau de service écrits. **400 000 FCFA/mois** est un ordre de grandeur possible pour un grand opérateur, pas un prix universel à afficher sans qualification.

### Ce que couvre chaque pack

| Domaine fonctionnel                                                        | Agence | Syndic | Promoteur | Opérateur intégré |
| -------------------------------------------------------------------------- | :----: | :----: | :-------: | :---------------: |
| Socle : biens, contacts, documents, rôles, audit, tableaux de bord         |   ✓    |   ✓    |     ✓     |         ✓         |
| CRM, mandats, annonces, visites et suivi commercial                        |   ✓    |   —    |     ✓     |         ✓         |
| Baux, échéances, paiements, pénalités, dépôts                              |   ✓    |   —    |     —     |         ✓         |
| Portails propriétaire et locataire                                         |   ✓    |   —    |     —     |         ✓         |
| Maintenance et interventions                                               |   ✓    |   ✓    |     ✓     |         ✓         |
| Syndic : copropriétés, tantièmes, charges, impayés, AG                     |   —    |   ✓    |     —     |         ✓         |
| Comptabilité de copropriété et budgets                                     |   —    |   ✓    |     —     |         ✓         |
| Chantiers : budgets, coûts, achats, avancement, lots, clôture              |   —    |   —    |     ✓     |         ✓         |
| BTP : matériaux et stock, personnel, tâcherons, terrain, associations      |   —    |   —    |     ✓     |         ✓         |
| Finance opérationnelle : tiers, fournisseurs, caisse, validations, imports |   ✓    |   ✓    |     ✓     |         ✓         |
| Patrimoine : valorisation, rendement, emprunts, dépenses et travaux        |   ✓    |   —    |     ✓     |         ✓         |
| Communication : e-mail, modèles, relances, WhatsApp, newsletter            |   ✓    |   ✓    |     ✓     |         ✓         |
| Vente complète du programme et passage à la copropriété*                   |   —    |   —    |     ✓     |         ✓         |

\* **Sous réserve de vérification du parcours complet en production.** Le CRM et les mandats de vente déjà documentés ne prouvent pas, à eux seuls, le contrat de vente, l'échéancier de l'acquéreur et le transfert du lot.

Les comptes de collaborateurs, propriétaires et locataires ne sont pas facturés au siège. L'usage WhatsApp est facturé à la consommation, quel que soit le pack. Le socle et les notifications e-mail ordinaires sont inclus. Il n'y a ni commission ImmoTopia sur les loyers, ni prélèvement automatique d'un pourcentage du prix de vente.

## 3. Comment vendre les activités mixtes

Les packs sont **combinables**. Une agence qui ajoute le syndic achète Agence + Syndic, avec **10 % de remise sur le moins cher des deux abonnements**. Elle conserve les capacités incluses propres à chaque métier. Si elle utilise les trois modules métier, on compare son total à l'Opérateur intégré et on applique le tarif le moins cher à périmètre équivalent. Cette règle empêche qu'un client soit pénalisé parce qu'il élargit son activité.

Exemples mensuels, avant taxes et messages consommés :

| Client                                                           |                          Calcul |             Prix |
| ---------------------------------------------------------------- | ------------------------------: | ---------------: |
| Agence avec 180 logements gérés                                  |               29 900 + 80 × 150 |  **41 900 FCFA** |
| Syndic avec 2 copropriétés et 140 lots                           |               49 900 + 40 × 150 |  **55 900 FCFA** |
| Cabinet réunissant les deux exemples                             | 41 900 + 55 900 − 10 % × 41 900 |  **93 610 FCFA** |
| Promoteur avec 3 chantiers et 120 lots                           |                149 900 + 40 000 | **189 900 FCFA** |
| Opérateur avec 3 chantiers, 3 copropriétés et 300 lots distincts |                 Forfait intégré | **249 900 FCFA** |

Dans le pack intégré, **un même appartement ne compte qu'une fois** dans les 300 lots, même s'il passe du chantier au patrimoine puis en location ou en copropriété. Le chantier et la copropriété restent comptés séparément comme unités de travail. Le contrat doit définir précisément un chantier « actif », une copropriété « active », un lot de programme et un lot distinct, et prévoir la photographie des volumes à chaque échéance de facturation.

## 4. Paiement, mise en route et consommation

Le mensuel est payé d'avance. L'annuel payé d'avance coûte **11 mensualités** : un mois offert. Ainsi, l'Opérateur intégré à 249 900 FCFA/mois coûte **2 748 900 FCFA/an**, hors mise en route et consommation. Cette remise de 8,3 % préserve la marge tout en apportant de la trésorerie ; elle peut être ajustée après mesure du taux de conversion annuel.

| Mise en route accompagnée | Prix initial proposé | Périmètre de référence                                                                                        |
| ------------------------- | -------------------: | ------------------------------------------------------------------------------------------------------------- |
| Agence                    |     **100 000 FCFA** | Paramétrage, reprise préparée de 100 logements maximum, deux séances de formation ; 8 h de prestation maximum |
| Syndic                    |     **150 000 FCFA** | Deux copropriétés, tantièmes et soldes d'ouverture fournis par le client, formation ; 12 h maximum            |
| Promoteur                 |     **450 000 FCFA** | Deux chantiers, nomenclature des coûts et stocks, formation des équipes ; 20 h maximum                        |
| Opérateur intégré         |     **650 000 FCFA** | Trois métiers, plan de reprise et formations par rôle ; 30 h maximum                                          |

Un client qui prépare et saisit lui-même ses données peut démarrer sans frais de prestation. Les historiques complexes, données à nettoyer et intégrations spécifiques font l'objet d'un devis distinct. La reprise automatique d'un portefeuille ou de comptes antérieurs ne doit être annoncée que pour les formats effectivement pris en charge.

**WhatsApp :** crédits prépayés ou consommation refacturée sur une grille en FCFA publiée après calcul des frais du fournisseur et de Meta. [Twilio précise que ses frais s'ajoutent aux frais de messagerie applicables](https://www.twilio.com/fr-fr/whatsapp/pricing). Aucun « WhatsApp illimité » n'est inclus. Les frais d'un éventuel prestataire d'encaissement Mobile Money sont présentés séparément ; ImmoTopia ne promet pas de marge transactionnelle tant que le coût et le flux des fonds ne sont pas contractuellement établis.

## 5. Pourquoi ces montants

Les prix publics des acteurs locaux montrent une entrée de marché sensible au tarif : [ChezvousBO annonce 24 900 FCFA/mois pour 60 logements et 49 900 FCFA/mois pour 300](https://onboarding.chez-vous.ci/tarifs), [Logestimmo 29 990 FCFA/mois jusqu'à 80 lots et 59 990 jusqu'à 200](https://logestimmo.com/), [WIMMO 20 000 FCFA/mois jusqu'à 100 contrats](https://www.wimmo-ci.com/) et [NY Immobilier 50 000 FCFA/mois pour son offre Pro, 200 000 pour Enterprise](https://www.nyimmobilier.com/fr/tarifs). Les fonctionnalités et unités de comptage diffèrent : ces chiffres donnent des repères de prix, pas une comparaison à service égal.

Le pack Agence reste dans cette zone de décision. Le pack Syndic facture la copropriété, qui impose un budget, des appels et une assemblée même si elle contient peu de lots. Promoteur coûte davantage car il réunit chantiers, achats, stock, personnel, finance et commercialisation ; [Madata affiche un ERP BTP à partir de 50 000 FCFA/mois](https://madata.africa/fr/erp-btp), ce qui rappelle qu'un simple « suivi de chantier » ne justifierait pas à lui seul 149 900 FCFA. L'Opérateur intégré vend le processus complet et une seule vue des lots, avec une remise par rapport au cumul des capacités comparables.

## 6. Validation commerciale avant publication définitive

Les quatre prix doivent être confrontés à des acheteurs, séparément : **5 agences**, **3 syndics**, **3 promoteurs** et **2 opérateurs intégrés** à Abidjan. Pour chaque segment, faire une démonstration sur un dossier réel, remettre un devis avec volumes et frais de mise en route, puis mesurer les signatures ou refus motivés. Un intérêt verbal ne valide pas un prix. Suivre aussi le temps de vente, le temps d'installation, la consommation de support et la marge par client : un opérateur à 249 900 FCFA qui réclame un consultant à temps plein peut rapporter moins que plusieurs agences autonomes.

La décision finale sur un grand compte doit dépendre du **revenu annuel contractuel et de la marge après accompagnement**, pas du seul montant mensuel affiché.
