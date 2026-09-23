# ImmoTopia — consolidation du plan SYSCOHADA

**Date de consolidation : 23 septembre 2026**  
**Hypothèse de travail :** l'agence agit en qualité de **mandataire** des propriétaires. Cette hypothèse est déterminante : les loyers et fonds détenus ne sont pas des produits de l'agence ; seule sa rémunération l'est.

## Conclusion

Le document transmis apporte de bonnes confirmations sur `7061`, `4432`, `5711x`, `6588` et `7588`. Toutefois, il contient quatre erreurs de paramétrage bloquantes dans le contexte du mandat :

1. `4781` ne peut pas remplacer le compte des propriétaires : c'est un compte d'écart de conversion actif, et non un compte de mandants.
2. Wave, Orange Money et MTN MoMo ne doivent pas être rattachés à `521` : le SYSCOHADA les traite comme instruments de monnaie électronique de classe `55`.
3. Une dépense payée pour le compte du propriétaire n'est pas, par principe, une dette `401` de l'agence.
4. Les dépôts de garantie et les paiements non affectés ne sont ni `165` ni `4191` dans les livres d'une agence purement mandataire : ils restent des fonds de mandants au `4731`, avec une nature distincte.

## Plan de correspondance consolidé

| Flux                                             | Décision à retenir                                                     | Écriture ou règle de paramétrage                                                                           |
| ------------------------------------------------ | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Fonds encaissés pour un propriétaire             | `4731 – Mandants`, avec auxiliaire obligatoire par propriétaire        | `Débit trésorerie / Crédit 4731-Pxxx`                                                                      |
| Honoraires habituels de gestion                  | `70611 – Honoraires de gestion locative` sous `7061`                   | `Débit 4731-Pxxx / Crédit 70611 + 4432`                                                                    |
| TVA sur honoraires                               | `4432 – TVA facturée sur prestations de services`                      | 18 % si l'agence est redevable ; exigible lors de l'encaissement de la rémunération                        |
| Banque                                           | `5211x` par compte bancaire local en FCFA                              | Un compte et un rapprochement par banque et numéro de compte                                               |
| Mobile Money                                     | `552x` par opérateur et portefeuille                                   | `5521 Wave`, `5522 Orange Money`, `5523 MTN MoMo`, `5524 Moov Money`, `5529 autres` — voir note ci-dessous |
| Chèque non encore crédité                        | Compte de valeurs à encaisser, puis `5211x` à l'encaissement           | Ne pas le traiter comme banque dès réception                                                               |
| Carte en attente de règlement                    | `515 – Cartes de crédit à encaisser`                                   | Puis virement vers `5211x` à la remise effective                                                           |
| Espèces                                          | `5711x` par caisse physique / détenteur responsable                    | Contrôle journalier et solde réel égal au solde comptable                                                  |
| Manquant de caisse définitivement établi         | `6588 – Écarts de caisse`                                              | Seulement après enquête et validation ; sinon imputer au tiers concerné                                    |
| Excédent de caisse définitivement inexpliqué     | `7588 – Écarts de caisse`                                              | Un excédent appartenant probablement à un mandant va à `4731`, pas à `7588`                                |
| Dépense payée immédiatement pour un propriétaire | `4731-Pxxx` et trésorerie réelle                                       | `Débit 4731-Pxxx / Crédit 5211x, 552x ou 5711x`                                                            |
| Dépense fournisseur du propriétaire, non réglée  | Tiers spécifique « fournisseur du mandant », à valider avec le cabinet | Ne pas utiliser `401` sauf si l'agence est juridiquement acheteuse et débitrice                            |
| Dépôt de garantie d'un locataire                 | `4731-Pxxx`, marqué « dépôt de garantie »                              | Identifiants obligatoires : propriétaire, bien, bail et locataire ; hors honoraires                        |
| Encaissement reçu, non encore affecté            | `4731-Pxxx – encaissements à affecter`                                 | Comptabiliser le jour de réception, puis affecter sans supprimer l'écriture initiale                       |
| Retenue fiscale sur loyers, si applicable        | `4478 – autres impôts et contributions retenus à la source`            | `Débit 4731-Pxxx / Crédit 4478`, puis `Débit 4478 / Crédit trésorerie` au versement DGI                    |

## Analyse des écarts avec le document transmis

| Proposition du document transmis                               | Verdict                                                                                                   | Position consolidée                                                                                                                                                                                                                |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `4781 – Fonds de mandants`                                     | **À rejeter.** `4781` est une diminution de créances d'exploitation, dans les écarts de conversion actif. | `4731 – Mandants`, compte expressément prévu pour les opérations pour compte de tiers.                                                                                                                                             |
| Un seul grand livre collectif suffit, détail seulement interne | **Insuffisant sans garantie.**                                                                            | `4731` collectif est acceptable seulement si le détail par propriétaire est un auxiliaire exportable, immuable, rapproché et présent sur chaque mouvement. Un auxiliaire par propriétaire est requis pour la reddition de comptes. |
| `7061` pour les honoraires                                     | **À retenir.**                                                                                            | Créer `70611 – Honoraires de gestion locative` ; `706` seul est trop peu détaillé.                                                                                                                                                 |
| `4432` pour la TVA                                             | **À retenir sous condition.**                                                                             | TVA de 18 % sur les honoraires de l'agence lorsqu'elle relève de la TVA ; pas sur les loyers encaissés pour le propriétaire.                                                                                                       |
| `52181 Wave`, `52182 Orange Money`                             | **À corriger.**                                                                                           | Utiliser `552x` : la classe 55 « instruments de monnaie électronique » distingue `552` (monnaie électronique sur téléphone portable) de `558` (autres instruments) ; Wave, Orange Money, MTN MoMo et Moov Money relèvent de `552`. |
| `5711`, `5712` par point de collecte                           | **À retenir, avec nuance.**                                                                               | `5711x` en FCFA par caisse physique et responsable. `5712` est le compte de caisse en devises, pas le second caissier.                                                                                                             |
| `6588` et `7588`                                               | **À retenir.**                                                                                            | Après enquête seulement ; un écart attribuable à un mandant, locataire, fournisseur ou caissier ne passe pas directement en résultat.                                                                                              |
| `401` puis `521/571` pour les dépenses du propriétaire         | **À rejeter comme règle générale.**                                                                       | Utiliser directement `4731` contre le moyen de paiement. `401` ne convient que lorsque l'agence contracte et doit elle-même la dette.                                                                                              |
| `165` pour le dépôt de garantie                                | **À nuancer : inadapté dans les livres du mandataire.**                                                   | `1652` peut convenir chez le propriétaire qui reçoit la caution directement. L'agence mandataire la comptabilise dans `4731`, sans produit ni prélèvement d'honoraire.                                                             |
| `4191` pour l'encaissement non affecté                         | **À nuancer : inadapté dans les livres du mandataire.**                                                   | `4191` correspond aux avances reçues des propres clients de l'agence. Ici, le paiement appartient au mandant : crédit `4731`, avec un statut « à affecter ».                                                                       |
| Exercice civil et CSV point-virgule                            | **Partiellement à retenir.**                                                                              | Clôture au 31 décembre en Côte d'Ivoire, sous les exceptions légales. Le CSV UTF-8 séparé par `;` est un bon format par défaut, mais le modèle d'import doit être validé avec le logiciel et le cabinet.                           |

> **Correction du 23 septembre 2026 (lot 10).** Cette consolidation recommandait d'abord `558x` pour le Mobile Money. Vérification faite du plan SYSCOHADA révisé, `552` est le sous-compte « monnaie électronique — téléphone portable » et `558` « autres instruments de monnaie électronique » : Wave, Orange Money, MTN MoMo et Moov Money étant des portefeuilles adossés à un numéro de téléphone, `552x` est le sous-compte le plus précis, `558x` restant réservé à un instrument de monnaie électronique non rattaché à un téléphone. Le code applique `552x` (`5521` à `5524` par opérateur, `5529` pour les autres) ; la ligne « Mobile Money » du plan de correspondance ci-dessus a été corrigée en conséquence.

## Règles métier indispensables avant développement

### 1. Le bénéficiaire économique doit être déterminé pour chaque somme

Chaque composante de paiement doit porter l'une des destinations suivantes :

- propriétaire mandant ;
- agence, uniquement pour un honoraire ou une pénalité contractuellement attribuée ;
- tiers à payer : eau, électricité, syndic, fournisseur, administration ;
- dépôt de garantie ;
- encaissement temporairement non affecté.

Sans cette information, une règle « tout au propriétaire » ou « tout en produit » est trop risquée.

### 2. Les honoraires ne sont pas nécessairement dus à chaque encaissement

Le modèle proposé — prélèvement de l'honoraire quand le loyer est encaissé — est correct si le mandat fait naître le droit à honoraires à ce moment-là. Si le mandat prévoit un forfait mensuel ou des honoraires dus même en cas d'impayé, ImmoTopia doit créer une créance de l'agence sur le propriétaire et comptabiliser le produit au fur et à mesure de la prestation.

La valeur par défaut recommandée est : **taux HT appliqué au loyer nu effectivement encaissé**, à l'exclusion des charges récupérables, dépôts de garantie, taxes et fonds de tiers. Toute autre assiette ou tout forfait doit être explicitement enregistré dans le mandat et historisé.

### 3. Dépense et dette : distinguer le rôle réel de l'agence

Une facture de plomberie est un coût du propriétaire si l'agence avance simplement les fonds pour son compte. Elle ne devient une charge ou une dette fournisseur de l'agence que si l'agence contracte elle-même avec le plombier. Cette distinction doit être stockée avec la facture et l'autorisation de dépense.

### 4. Traçabilité et corrections

Une écriture comptabilisée ne doit pas être modifiée ni effacée. Une annulation doit créer une contrepassation datée, liée à l'écriture d'origine, avec motif, utilisateur et pièce justificative. Les journaux de trésorerie doivent toujours correspondre au moyen de paiement réellement utilisé.

## Obligations ivoiriennes à intégrer

- Les commissions et autres prestations de l'agence doivent faire l'objet d'une **FNE ou RNE** selon le régime de l'entreprise. Les loyers nus du propriétaire suivent une logique distincte.
- L'agence est assujettie à la TVA lorsqu'elle relève de ce régime ; l'impôt synthétique se substitue notamment à la TVA. La TVA des prestations de services est exigible à l'encaissement de la rémunération.
- La doctrine DGI publiée pour les agences de gestion indique une retenue sur les loyers bruts encaissés pour des propriétaires indépendants : 12 % lorsqu'il s'agit d'une personne physique, 15 % pour une entreprise ou personne morale. Avant activation, le cabinet doit confirmer le statut fiscal de chaque propriétaire, l'assiette exacte et les échéances déclaratives applicables.
- La clôture fiscale est normalement fixée au 31 décembre ; le premier exercice et la cessation/cession suivent des règles particulières.

## Contrôles de mise en production

1. Configurer et tester chaque compte de la table ci-dessus dans un environnement de recette.
2. Rejouer l'exemple de loyer, charges, honoraires, dépense, caution, Mobile Money, impôt retenu et reversement ; vérifier que chaque propriétaire est soldé à l'euro/FCFA près.
3. Produire le grand livre `4731`, le détail auxiliaire par propriétaire, le rapprochement bancaire, l'état des portefeuilles Mobile Money et la liste des dépôts de garantie à une même date ; les totaux doivent concorder.
4. Tester une contrepassation : aucune ligne initiale ne doit être altérée.
5. Faire valider un fichier d'import par le cabinet sur une copie de son dossier Sage, Odoo ou autre logiciel, avant toute transmission de production.
6. Corriger également les comptes existants mal qualifiés : `486` n'est pas le compte de charge constatée d'avance (`476` est le compte prévu) ; `4047` est un fournisseur d'effets à payer sur immobilisations corporelles ; `402` concerne les fournisseurs, effets à payer.

## État de mise en œuvre (lot 10, commit `65ad2cd`)

Le lot 10 (« feat(comptabilite) : conformite SYSCOHADA de la gestion locative ») applique cette consolidation dans le code. Situation vérifiée dans `packages/api/src/lib/settings/finance-settings.ts`, `packages/api/src/lib/treasury/accounts.ts`, `packages/api/src/lib/owner-account/{accounts,sync}.ts`, `packages/api/src/lib/rental-fees/`, `packages/api/src/lib/cash-sessions/service.ts`, `packages/api/src/lib/treasury/service.ts` et `packages/api/src/lib/accounting-exports/service.ts`.

| Flux                                             | Implémenté ?                                                                                                                                                           | Écart avec la décision consolidée                                                                                                                                          |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fonds encaissés pour un propriétaire (`4731`)    | Oui, avec auxiliaire obligatoire par propriétaire (`thirdPartyAccountId`) et nature de fonds sur chaque ligne (`fundsNature` : compte courant, dépôt, à affecter)      | Aucun.                                                                                                                                                                     |
| Honoraires de gestion (`70611`)                  | Oui, produit d'exploitation, prélevé à l'encaissement, sur le loyer nu par défaut                                                                                      | Aucun. Le mode « tout l'encaissé » et un forfait par échéance restent proposés en options, comme avant le lot 10.                                                          |
| TVA sur honoraires (`4432`)                      | Oui, même écriture que les honoraires, exigible à l'encaissement                                                                                                       | Aucun. L'assujettissement effectif de l'agence (Q1 du document Questions comptables) reste à confirmer par le cabinet.                                                     |
| Banque (`5211x`)                                 | Oui, un compte par banque, numéro créé librement dans l'écran Trésorerie ; reprise automatique du 521 existant s'il porte déjà des écritures                           | Aucun.                                                                                                                                                                     |
| Mobile Money                                     | Oui, sous `552x` (`5521` Wave, `5522` Orange, `5523` MTN, `5524` Moov, `5529` autres) — voir correction ci-dessus                                                      | La consolidation recommandait `558x` ; corrigé ici en `552x`, plus précis (voir note). Validation du référentiel par le cabinet en attente.                                |
| Chèque non encore crédité (`513`)                | Oui, compte de valeurs à encaisser distinct, viré vers la banque à la remise                                                                                           | Aucun.                                                                                                                                                                     |
| Carte en attente de règlement (`515`)            | Oui, même logique que le chèque                                                                                                                                        | Aucun.                                                                                                                                                                     |
| Espèces (`5711x`)                                | Oui, par caisse/responsable ; reprise automatique du 571 existant s'il porte déjà des écritures                                                                        | Aucun.                                                                                                                                                                     |
| Manquant / excédent de caisse (`6588` / `7588`)  | Oui, imputés seulement à la validation d'une session de caisse par un responsable, après explication obligatoire de l'écart                                            | Aucun. Le renvoi automatique d'un excédent identifié à un mandant plutôt qu'au 7588 n'est pas mécanisé : c'est une décision manuelle du responsable qui valide la session. |
| Dépense payée immédiatement pour un propriétaire | Oui : `4731` contre la trésorerie réellement mobilisée quand l'agence avance les fonds ; `401` seulement si l'agence a elle-même commandé la dépense (`agencyIsBuyer`) | Aucun.                                                                                                                                                                     |
| Dépense fournisseur du mandant, non réglée       | Non implémenté                                                                                                                                                         | Aucun compte de tiers « fournisseur du mandant » n'existe encore : question ouverte (Q3 du document Questions comptables).                                                 |
| Dépôt de garantie d'un locataire                 | Oui : encaissé, remboursé et conservé sur le `4731`, nature « dépôt », sans effet sur les honoraires                                                                   | Aucun.                                                                                                                                                                     |
| Encaissement reçu, non encore affecté            | Oui : comptabilisé le jour de réception en fonds « à affecter », reclassé à l'affectation sans toucher l'écriture initiale                                             | Aucun.                                                                                                                                                                     |
| Retenue fiscale sur loyers (`4478`)              | Oui, mais **désactivée par défaut** ; taux distinct par statut du propriétaire, jamais rétroactive, versements à la DGI numérotés `DGI-AAAA-NNNN`                      | Activation, taux et statut fiscal par propriétaire restent à confirmer par le cabinet (Q2 du document Questions comptables).                                               |
| Virements internes (remise de chèques/cartes)    | Oui, numérotés `VIR-AAAA-NNNN`                                                                                                                                         | Aucun.                                                                                                                                                                     |
| Grand livre auxiliaire des mandants              | Oui : export avec colonnes « Tiers » et « Nature », balance auxiliaire par propriétaire                                                                                | Aucun.                                                                                                                                                                     |
| Charges constatées d'avance                      | Oui, migrées vers `476` (le `486` mal qualifié n'est plus utilisé pour ce flux)                                                                                        | Aucun.                                                                                                                                                                     |

### Contrôles de mise en production déjà couverts par le code

Sur les cinq contrôles listés ci-dessous, le code du lot 10 couvre directement les points 2 et 4 :

- **Contre-passation (point 4)** : `reverseDocumentEntryTx` (`packages/api/src/lib/owner-account/sync.ts`) passe une écriture inverse liée à l'originale par `voidedByEntryId`, sans jamais modifier les lignes déjà postées ; couvert par des tests (`apps/web/src/__tests__/finance/comptabilite.test.tsx`).
- **Balance auxiliaire des mandants, par propriétaire (point 3, en partie)** : `packages/api/src/lib/accounting-exports/service.ts` produit un grand livre et une balance groupés par `thirdPartyAccountId` et `fundsNature`, avec reclassement automatique (`reconcileOwnerAuxiliaryTx`) quand les quotes-parts d'un bien en indivision changent, pour que la somme des auxiliaires reste égale au solde du `4731` collectif.
- Les points 1 (configurer et tester chaque compte en recette), 3 pour le volet rapprochement bancaire et portefeuilles Mobile Money, et 5 (validation d'un fichier d'import par le cabinet) restent des actions opérationnelles à mener avant la mise en service, non automatisables dans le code.

## Sources de référence

- [AUDCIF / SYSCOHADA révisé — OHADA](https://www.ohada.org/acte-uniforme-relatif-au-droit-comptable-et-a-linformation-financiere-audcif/4/)
- [Plan et fonctionnement SYSCOHADA révisé : comptes 473, 55, 57, 70, 44 et 165](https://www.msg-innov.online/gallery/ACTE%20UNIFORME%20SYSCOHADA%20REVISE.pdf)
- [DGI : fiscalité des sociétés civiles immobilières de gestion](https://www.dgi.gouv.ci/assets/documents/pdf/note_service/note_service_0035_0001.pdf)
- [DGI : TVA et exigibilité des prestations de services](https://www.dgi.gouv.ci/assets/documents/depliants/De%CC%81pliant%20digitalisation%20de%20la%20TVA%20re%CC%81duitt.pdf)
- [DGI FNE : FAQ et commissions des agences immobilières](https://www.fne.dgi.gouv.ci/faq.php)
- [DGI : doctrine sur la clôture des exercices](https://www.dgi.gouv.ci/assets/documents/pdf/DOCTRINE_FISCALE_2022.pdf)
