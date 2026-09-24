# PaySecureHub (BMI Finance CI) — agrégateur de paiement

Agrégateur retenu le 24 septembre 2026 pour le paiement en ligne des loyers
(lot 7 de la gestion locative). Il remplace CinetPay, envisagé jusque-là.

Source : documentation remise par l'éditeur (fichier Word « documentation
payhubsecure », conservé hors du dépôt : ses exemples contiennent les
coordonnées d'une personne réelle). Le produit s'appelle PayHub, mais toutes les
adresses sont en `paysecurehub.com`.

## Décisions ImmoTopia

- **Un compte marchand par agence.** Chaque agence saisit son `ApiKey` et son
  `MerchantId` dans ses paramètres. Les loyers arrivent sur son compte de
  collecte à elle ; ImmoTopia ne détient jamais l'argent (pas de mode
  agrégateur, pas de question d'agrément BCEAO).
- **Page de paiement hébergée** (`build-away`) : le locataire choisit son
  moyen (Wave, Orange Money, MTN, Moov, carte Visa) sur la page PaySecureHub.
  Pas d'OTP ni de redirection Wave à gérer chez nous.
- **La notification (IPN) n'est jamais crue sur parole.** Elle n'est pas
  signée : n'importe qui peut en fabriquer une. À sa réception, on redemande le
  statut à PaySecureHub avec la clé de l'agence (`status/transact`) et seule
  cette réponse fait foi.
- **Simulateur.** Tant que les identifiants de test ne sont pas fournis, une
  agence peut basculer en mode `SIMULATOR` : une fausse page de paiement servie
  par l'API reproduit les trois issues (payé, échoué, annulé).

## API

Base : `https://rest-airtime.paysecurehub.com/api`. En-têtes : `ApiKey`,
`MerchantId` (sauf `/data-ws/pays` et `/data-ws/providers`), `Content-Type:
application/json`.

| Appel                                               | Usage chez nous                                                                                                                                         |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /payhub-ws/build-away`                        | Crée la demande et renvoie `{ tokens, url, code, message }` ; `url` est la page où rediriger le locataire.                                              |
| `POST /airtime/status/transact` `{ codePaiement }`  | Statut faisant foi. Réponse : `payments.state`, `payments.transactionId`, `payments.amount`, `payments.fees`, `payments.serviceName`, `payments.error`. |
| `GET /data-ws/solde`                                | Solde du compte de collecte ; sert de « tester la connexion ».                                                                                          |
| `GET /data-ws/providers`                            | Opérateurs disponibles (non utilisé au lot 7).                                                                                                          |
| `POST /mrchd_ws/paymentReq` puis `/{pmId}/payments` | Paiement direct sans page hébergée — non retenu.                                                                                                        |

Corps de `build-away` : `code_paiement` (notre référence, renvoyée dans
l'IPN), `nom_usager`, `prenom_usager`, `telephone`, `email`,
`libelle_article`, `quantite`, `montant` (entier, en FCFA), `lib_order`,
`Url_Retour`, `Url_Callback`.

Les frais de la plateforme s'ajoutent au montant ou sont retenus sur l'agence
selon un paramétrage fait **chez PaySecureHub** ; ImmoTopia se contente de le
recopier (`feesPaidBy`) pour l'annoncer au locataire.

## Points ouverts à poser à BMI

1. Liste exhaustive des valeurs de `payments.state` (vus : `PENDDING`,
   `CANCEL` ; supposés : `SUCCESSFUL`, `FAILED`) et du champ `code` de l'IPN.
2. Environnement de test (URL et identifiants de bac à sable).
3. Signature ou adresses IP sources de l'IPN, pour filtrer en amont.
4. `montant` du statut : montant demandé ou montant frais compris ? (l'exemple
   de statut montre 5 USD et 5 de frais).
5. Reversement du compte de collecte vers la banque de l'agence : délai,
   frais, relevé téléchargeable pour le rapprochement.
6. Pays couverts : la documentation ne montre que la Côte d'Ivoire et le
   Sénégal (XOF). Guinée (GNF) ?
7. Durée de validité d'un lien `build-away` non utilisé.
