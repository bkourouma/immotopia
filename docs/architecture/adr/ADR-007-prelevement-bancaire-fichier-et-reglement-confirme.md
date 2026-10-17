# ADR-007 : Prélèvement bancaire par fichier de remise, IBAN chiffré, règlement confirmé au relevé

## Statut

Accepté

## Date

2026-10-15

## Contexte

Les agences veulent encaisser loyers puis charges de copropriété par
prélèvement sur le compte bancaire du débiteur (spécification
`specs/042-prelevement-bancaire/`). En Côte d'Ivoire, le prélèvement circule
par la compensation interbancaire de l'UEMOA : l'agence (ou le syndicat)
signe une convention d'émetteur avec sa banque, chaque débiteur signe une
autorisation de prélèvement déposée à sa banque, et l'agence charge un
fichier de remise sur la banque en ligne. Il n'existe pas d'API bancaire
ouverte ni de format de fichier commun aux banques. L'agrégateur déjà branché
(PaySecureHub, lot 7) ne connaît pas le paiement récurrent.

Trois contraintes du dépôt pèsent sur la décision :

- l'argent ne transite jamais par ImmoTopia (décision du lot 7) ;
- les encaissements de loyers alimentent le compte propriétaire et les
  reversements (`lib/owner-account/sync.ts`) : un loyer compté comme payé
  puis rejeté peut avoir déjà été reversé ;
- l'IBAN est une donnée personnelle (loi ivoirienne 2013-450) et un moyen
  d'action sur un compte.

## Décision

1. **Fichier de remise, pas d'API bancaire.** ImmoTopia prépare la remise,
   produit le fichier, puis rapproche le retour de la banque. Le chargement
   du fichier sur la banque en ligne reste un geste humain. Le format est
   porté par un **adaptateur par banque** ; un CSV générique sert tant que la
   banque pilote n'a pas fourni de fichier exemple.
2. **Une remise n'est jamais envoyée automatiquement.** La tâche planifiée
   prépare des brouillons ; un utilisateur habilité les valide.
3. **IBAN chiffré au repos** avec l'aide existante
   `lib/payment-gateway/crypto.ts` (AES-256-GCM, clé `PAYMENT_SECRETS_KEY`).
   Seuls le code banque et les quatre derniers caractères sont stockés en
   clair, pour l'affichage masqué. L'IBAN complet n'est déchiffré que pour
   produire un fichier de remise ; il ne sort jamais dans une réponse d'API,
   un journal ou un export.
   _Ajout du 2026-10-16_ : l'IBAN n'est plus chiffré avec `PAYMENT_SECRETS_KEY`
   mais avec une clé **dédiée** et versionnée, `DIRECT_DEBIT_IBAN_KEY`
   (`lib/direct-debit/iban-crypto.ts`, format `ddk1:<id de clé>:…`, trousseau
   d'anciennes clés `DIRECT_DEBIT_IBAN_PREVIOUS_KEYS` pour la rotation, script
   de rechiffrement idempotent). Les valeurs `pg1` déjà écrites restent lisibles.
4. **Contrôle de l'IBAN** : longueur et structure ivoirienne (28 caractères,
   `CI` + 2 chiffres de contrôle + 24 caractères) et clé ISO 13616
   (modulo 97), bloquants. La clé RIB UEMOA n'est qu'un **avertissement**
   tant que son calcul (lettres du code banque) n'a pas été confirmé sur des
   RIB réels.
5. **Règlement confirmé au relevé** (décision D3). Une ligne de remise
   devient un encaissement (`RentalPayment` en `DIRECT_DEBIT`, statut
   `SUCCESS`) seulement quand la banque a confirmé le crédit — constat manuel
   ou import du relevé. Un rejet tardif passe par l'annulation existante
   (`updatePaymentStatusTx`, contre-passation).
6. **Idempotence** : une même échéance ne peut figurer que dans une seule
   ligne de remise non annulée (contrainte d'unicité en base).

## Conséquences positives

- Fonctionne avec n'importe quelle banque dès qu'un adaptateur existe ; rien
  ne dépend d'un partenariat bancaire.
- Aucun loyer n'est reversé au propriétaire avant que la banque ait confirmé
  le crédit.
- Une fuite de la base ne livre pas d'IBAN exploitable sans la clé.

## Conséquences négatives

- Le loyer prélevé apparaît comme payé avec quelques jours de retard (délai
  de compensation et de saisie du retour).
- Le geste de chargement du fichier reste manuel, avec un risque d'oubli :
  l'écran de remise doit le rendre visible (statut `EXPORTED` non soumis).
- Perdre la clé des IBAN rend les IBAN illisibles : les mandats
  devraient être ressaisis. La clé doit être sauvegardée hors de la base.
  _Ajout du 2026-10-16_ : cette clé est désormais `DIRECT_DEBIT_IBAN_KEY` (et ses
  anciennes clés `DIRECT_DEBIT_IBAN_PREVIOUS_KEYS` tant qu'un rechiffrement n'est
  pas terminé) ; `PAYMENT_SECRETS_KEY` n'est plus nécessaire qu'à la lecture des
  valeurs `pg1` non encore rechiffrées.
- Chaque nouvelle banque demande un adaptateur et un fichier exemple.

## Alternatives écartées

- **Règlement optimiste à la date de prélèvement** — plus simple, mais un
  rejet après reversement crée un solde propriétaire négatif à recouvrer.
- **Prélèvement par Mobile Money via PaySecureHub** — l'agrégateur ne propose
  ni jeton ni paiement récurrent.
- **IBAN en clair, masqué à l'affichage** — un export de base ou un journal
  suffirait à le divulguer.
- **Intégration bancaire directe (host-to-host)** — aucune banque partenaire,
  coût et délai hors de proportion pour un premier lot.

## Liens

- `specs/042-prelevement-bancaire/` (spec, modèle de données, plan).
- `packages/api/src/lib/payment-gateway/crypto.ts`.
- `packages/api/src/services/rental-payment-service.ts`
  (`createPayment`, `allocatePaymentTx`, `updatePaymentStatusTx`).
- ADR-006 (audit à deux niveaux) pour la traçabilité des mandats.
