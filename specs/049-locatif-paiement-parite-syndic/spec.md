# Spec 049 — Gestion locative : paiement mobile money déclaré (parité Syndic)

**Contrats** : [contracts.md](./contracts.md) · **Tâches** : [tasks.md](./tasks.md) · **Modèle** : [spec 047](../047-syndic-paiement-declare/spec.md)

## Objectif

Donner au module Gestion locative la parité avec le Syndic pour le paiement mobile money déclaré : l'agence
enregistre ses numéros de réception, le locataire déclare un paiement au portail (référence, capture
facultative, lecture IA facultative), le gestionnaire valide (avec correction éventuelle) ou rejette, et la
validation affecte le montant à l'échéance par le service d'allocation existant. Le comportement actuel
(déclaration possible sans configuration) est conservé.

## Décisions métier (validées)

- **H1** Un compte PaySecureHub par agence (inchangé).
- **H2** Numéros de réception rattachés à l'AGENCE (pas à un bien), liés au compte de trésorerie mobile money
  de l'opérateur (5521 à 5524, `lib/treasury/accounts.ts`). Aucun nouveau compte comptable ;
  `treasuryAccountId` est dérivé de l'opérateur, jamais saisi.
- **H3** Relances manuelles ou par lot avec aperçu ; jamais d'envoi automatique.
- **H4** Déclaration activée par défaut ; référence OBLIGATOIRE pour les NOUVELLES déclarations seulement ;
  capture facultative (`proofRequired=false`) ; lecture IA désactivée par défaut ; alerte à 3 jours ouvrés.
- **H5** Compte de collecte = panneau solde + virement 5525 vers la trésorerie via le virement de trésorerie
  existant.

## Règles reprises du Syndic

Plafond 5 000 000 FCFA ; référence normalisée (majuscules, sans espaces, `^[A-Z0-9.-]{4,40}$`) ; unicité de
référence parmi les déclarations PENDING/APPROVED d'un même numéro (409) ; « doublon probable » (même montant,
même jour, même échéance, références différentes) signalé sans bloquer ; téléphones ivoiriens normalisés E.164
(`lib/syndics/declared-payment/phone.ts`) ; capture JPEG/PNG/WebP/PDF 5 Mo au plus, privée, lecture
journalisée ; lecture IA : une panne fournisseur répond 200 `UNREADABLE`, seuls indisponibilité et quota sont
des erreurs ; correction de montant à la validation = note obligatoire + événement
`APPROVED_WITH_CORRECTION` ; désactivation douce d'un numéro portant des déclarations.

## Hors périmètre de la famille « Déclarations »

Paiement en ligne et relances (fragments B et C du contrat), configuration de la passerelle
(`TENANT_SETTINGS_EDIT`), schéma Prisma (lot 1), comptabilité de la validation (service d'allocation existant,
inchangé). Les lignes anciennes gardent `reference` nulle ; le statut `CANCELED` existe déjà dans
`PaymentDeclarationStatus`.
