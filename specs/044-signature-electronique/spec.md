# 044 — Signature électronique

**Branche :** `docs/spec-signature-electronique` · **Statut :** brouillon à valider
**Décision utilisateur (2026-10-15) :** approche hybride (couche `SignatureProvider`,
fournisseur interne d'abord, prestataire branchable ensuite), pour **tous** les
documents candidats : bail, mandats, état des lieux, compromis de vente.

## 1. Objectif

Permettre à une agence de faire signer un document à distance (lien + code à
usage unique) ou sur place (signature tactile), puis de conserver un PDF scellé
et un dossier de preuve, sans que le signataire ait besoin d'un compte.

## 2. Base vérifiée dans le code (2026-10-15)

- Aucun module de signature. Seuls existent `SaleAgreement.signedAt`,
  `LeaseInspection.tenantSignatoryName` / `agentSignatoryName` et la signature
  et le cachet d'agence (`lib/documents/document-branding.ts`).
- Le bail est généré en **DOCX** (`document-generation-service.ts`,
  `RentalDocument`) ; aucun convertisseur PDF. `assets/` est absent des images
  Docker (HANDOFF) : la génération de contrats est cassée sur le staging.
- Mandat de gestion (`PropertyMandate`), mandat de vente (`SaleMandate`),
  compromis (`SaleAgreement`) et état des lieux (`LeaseInspection`) n'ont
  **aucun fichier** associé. `PropertyMandate` n'a pas de statut.
- Briques réutilisables : `SecureLink` (jeton haché, TTL, rate-limit),
  code à usage unique d'activation WhatsApp (`lib/stock-whatsapp/registrations/activation.ts` :
  HMAC, comparaison à temps constant, 5 essais), envoi e-mail et WhatsApp,
  audit (`audit-service`, `audit-catalog`), quotas d'abonnement
  (`subscription/catalog.ts`, modèle `StockWhatsappUsage`), transport
  pluggable (`lib/stock-whatsapp/transport`), `pdf-lib`.
- Envoi SMS : transport minimal `lib/sms/` (lot S7) ; le lot SMS-1 complet reste sur une branche non intégrée.

## 3. Périmètre

Types de documents (`SignatureDocumentKind`) : `LEASE_CONTRACT`,
`MANAGEMENT_MANDATE`, `SALE_MANDATE`, `LEASE_INSPECTION`, `SALE_AGREEMENT`.

Hors périmètre : actes authentiques notariés (restent chez le notaire),
certificat qualifié en interne, horodatage qualifié tiers (réservé au
prestataire, lot S6).

## 4. Règles

- **SG-R1 Niveau.** Le fournisseur interne délivre une signature électronique
  **simple** : preuve = lien à jeton, code à usage unique, consentement
  explicite, horodatage, IP, empreinte du document. La valeur juridique exacte
  (droit ivoirien et OHADA, à valider par un juriste) conditionne l'usage pour
  la vente : prévoir un drapeau par type de document « prestataire requis ».
  Mise en oeuvre (lot S4, 2026-10-15) : la variable
  `SIGNATURE_PROVIDER_REQUIRED_KINDS` (liste de kinds, défaut `SALE_AGREEMENT`)
  alimente `providerRequired` de la source ; le noyau refuse alors la signature
  interne (400, « prestataire de signature qualifié ; contactez le support ») et
  l'écran désactive l'envoi. Le compromis de vente est donc livré mais inutilisable
  avec le fournisseur interne tant que le type n'est pas retiré de la variable ;
  **l'avis juridique n'est pas rendu** : ce retrait est une décision du fondateur,
  après cet avis. Les clauses du PDF du compromis sont des clauses types à faire
  valider par un juriste.
  Lot S6 : le fournisseur externe `yousign` déclare `qualified: true`
  (provisoire : prestataire et avis juridique non rendus) ; il satisfait donc
  `providerRequired`. Voir `docs/integrations/signature-prestataire.md`.
- **SG-R2 Immutabilité.** Le document source est figé par son SHA-256 à
  l'envoi. Toute modification après envoi annule la demande (`CANCELED`) et
  en crée une nouvelle.
- **SG-R3 Jeton.** 32 octets aléatoires, seul le SHA-256 est stocké (comme
  `SecureLink`), TTL 7 jours par défaut, 30 max. Un jeton par signataire.
- **SG-R4b Canaux et contacts.** Décisions du 2026-10-15 : le canal WhatsApp
  exige un contact CRM (`contactId`) ayant consenti ; deux signataires peuvent
  partager le même contact (couple, colocataires), chacun avec son jeton et son
  code.
- **SG-R4 Code à usage unique.** 6 chiffres, HMAC-SHA256, comparaison à temps
  constant, 5 essais, validité 10 minutes, renvoi limité (3). Canaux : e-mail,
  WhatsApp (consentement CRM), SMS (lot S7, ci-dessous). Le code n'est jamais
  journalisé.
- **SG-R4 / S7 Canal SMS.** Livré par un transport minimal `lib/sms/`
  (`SMS_PROVIDER` = `disabled` par défaut, `log`, `orange` ; compte Orange CI
  unique d'ImmoTopia), sans reprendre les réglages d'agence ni la migration du
  lot SMS-1 (branche non fusionnée). Le signataire SMS exige un numéro E.164 et
  un contact CRM de l'agence (`contactId`) ; le CRM ne porte pas de
  consentement SMS (seulement `consentWhatsapp`) : limite connue, à lever par un
  champ `consentSms` hors de ce sprint. Lien et code partent en texte court
  (lien jamais tronqué) ; mêmes règles HMAC, essais et renvois que pour les
  autres canaux ; contact masqué dans les réponses. Un SMS n'ajoute aucune
  capacité d'abonnement : le quota compte les demandes de signature, le coût
  du SMS reste à la charge de la plateforme (compte unique).
- **SG-R5 Consentement.** Case explicite « Je reconnais avoir lu le document et
  je consens à le signer électroniquement » ; le texte affiché est haché et
  conservé avec l'événement.
- **SG-R6 Ordre.** Signature parallèle par défaut ; ordre séquentiel
  optionnel. Plusieurs signataires par document (co-locataires inclus).
- **SG-R7 Scellement.** Quand tous ont signé : pdf-lib appose les signatures
  visibles, ajoute une page « Certificat de signature » (signataires, dates,
  canal, IP tronquée, empreintes), calcule le SHA-256 final, stocke le PDF
  scellé en fichier privé (jamais servi en statique).
- **SG-R8 Piste d'audit.** `SignatureEvent` append-only, chaînage de hachage
  (chaque événement inclut le hachage du précédent). Actions d'audit critiques
  ajoutées à `audit-catalog`.
- **SG-R9 Isolation.** Toute lecture/écriture filtrée par `tenantId` ; l'objet
  cible (bail, mandat…) est vérifié comme appartenant à l'agence
  (`assertBelongsToTenant`). Routes publiques : aucune fuite d'existence
  (même réponse pour jeton inconnu, expiré ou révoqué).
- **SG-R10 Signature sur place.** Pour tout document (bail compris), mode
  « tablette » : l'agent ouvre la demande, le signataire dessine sa signature.
  Décisions du 2026-10-15 (revue sécurité) : sans code à usage unique, la
  présence ne tient qu'à la signature manuscrite, donc **le mode DRAWN est
  obligatoire** (un nom saisi est refusé). Traçabilité : le jeton sur place (24 h
  au plus, jamais en cache) est remis une seule fois ; sa remise ou sa
  réémission écrit un événement `IN_PERSON_TOKEN_ISSUED` et une action d'audit
  critique, `SignatureSigner.inPersonIssuedBy` désigne l'utilisateur de
  l'agence, et l'événement `SIGNED` consigne cet utilisateur comme agent présent.
- **SG-R11 Refus et expiration.** Un signataire peut refuser (motif) ; un
  job marque `EXPIRED` les demandes échues et notifie l'émetteur.
- **SG-R12 Facturation.** Capacité d'abonnement `SIGNATURES_MENSUELLES`,
  réservation atomique à l'envoi, politique selon `SUBSCRIPTION_ENFORCEMENT`
  (modèle : `lib/stock-whatsapp/quota.ts`) ; restitution si l'envoi échoue.
  Décision du 2026-10-15 : la réservation précède la conversion LibreOffice
  (coûteuse) ; toute erreur ultérieure la restitue. Pas de facturation de
  dépassement : au-delà du plafond, la création est refusée (409).
- **SG-R13 Fournisseur.** Variable `SIGNATURE_PROVIDER` =
  `disabled` | `log` | `internal` (défaut `disabled`), plus tard un nom de
  prestataire ; passe par `config/env.ts` et `env.example`.
  Lot S6 : `yousign` (Yousign API v3) est un fournisseur externe ; il déclare
  `qualified: true` à titre **provisoire** (choix de prestataire et avis
  juridique non rendus). Voir
  [docs/integrations/signature-prestataire.md](../../docs/integrations/signature-prestataire.md).
- **SG-R14 Libellés.** Tous les textes passent par `t()`, trilingue fr/en/ar,
  marges logiques ; le certificat est produit dans la langue du document.
  **Limite acceptée** : les PDF générés à la volée (mandats, compromis, état des
  lieux) sont en français avec la police standard Helvetica (WinAnsi) ; tout
  caractère hors de ce jeu (arabe, par exemple, dans un nom ou un libellé saisi)
  est imprimé « ? » par `sanitizeForPdf` au lieu de faire échouer la génération.
  Une police Unicode embarquée lèverait la limite.

## 5. Écrans

- Fiche bail / mandat / vente / état des lieux : bouton « Envoyer pour
  signature », statut et historique, téléchargement du PDF scellé.
- Page publique `/signer/:jeton` : lecture du PDF, consentement, code,
  signature (saisie ou dessin), confirmation. Mobile d'abord.
- Écran agence « Signatures » : liste, filtres par statut, relance, annulation.

## 6. Prérequis et points ouverts

1. **PDF source.** Choisir : générer les PDF en pdf-lib (cohérent avec syndic
   et finance) ou convertir les DOCX (LibreOffice dans l'image Docker, plus
   lourd). Recommandation : PDF natif pour mandats, compromis, état des lieux ;
   pour le bail, convertir le DOCX existant tant que les modèles sont en DOCX.
2. **Corriger `assets/` dans l'image Docker** (HANDOFF) avant de promettre des
   baux signables.
3. **Statut de `PropertyMandate`** inexistant : ajouter un état « signé ».
4. **Valeur juridique** par document et pays : avis juridique requis.
5. **Prestataire** : comparaison à faire (couverture Afrique francophone,
   tarifs, hébergement des données) avant le lot S6.
6. **SMS** : transport minimal livré au lot S7 ; réglages d'agence et quota SMS
   du lot SMS-1 non intégrés ; consentement SMS du CRM à créer.
7. **Numérotation spec** : 044 (042 est réservé au paiement mobile Syndic, 043 à l'AG en direct Syndic ; renumérotée de 043 en 044 le 2026-10-15).

## 7. Ajout du 17/10/2026 : mandat de prélèvement bancaire

Deux types de document s'ajoutent à ceux du §3 : `DIRECT_DEBIT_MANDATE`
(mandat de prélèvement locatif) et `SYNDIC_DIRECT_DEBIT_MANDATE` (mandat de
copropriété). La signature y est une **option** de la spec
[042](../042-prelevement-bancaire/spec.md) (exigence PB7) ; le contrat complet
est dans [042 data-model.md §10](../042-prelevement-bancaire/data-model.md).
Ces ajouts ne changent rien aux cinq types existants ni à leurs parcours.

- **Nouvelles options de source**, toutes facultatives et sans effet quand elles
  sont absentes : `codeBeforeView` (le code est demandé avant de montrer le
  document), `allowedChannels` (canaux admis à la création ; `IN_PERSON` refusé
  pour ces types, SG-R10 ne s'y applique donc pas) et `externalGateway` (la
  porte reste chez ImmoTopia quand un fournisseur externe signe).
- **Parcours « code avant consultation ».** Le lien ne révèle ni le PDF ni
  l'IBAN sans le code à usage unique. Nouvelle route publique
  `POST /api/public/signatures/:token/otp/verify` : elle vérifie le code
  (mêmes essais et verrouillage que SG-R4), le consomme, et remet un **jeton de
  consultation** valable 15 minutes, que le navigateur renvoie dans l'en-tête
  `X-Signature-View-Token` pour lire le fichier et signer. Chaque lecture du
  fichier est auditée avant l'envoi. Titre de la demande, messages et réponses
  publiques ne portent jamais l'IBAN complet.
- **Passerelle vers Yousign.** Avec ce fournisseur, la demande est créée sans
  envoi par Yousign (`delivery_mode: 'none'`) : invitations et codes partent
  d'ImmoTopia. Le lien de signature Yousign n'est remis qu'après vérification du
  code, par `GET /api/public/signatures/:token/external-link`, lu en direct chez
  Yousign, jamais stocké ni journalisé. Yousign demande en plus son propre
  code au moment de signer.
- **Fin de parcours.** Le PDF scellé tient lieu de scan signé du mandat ; le
  mandat reste en brouillon jusqu'à l'activation par l'agence.
