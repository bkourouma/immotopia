# 043 — Signature électronique

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
- Pas d'envoi SMS implémenté (le lot SMS-1 est sur une branche non intégrée).

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
- **SG-R2 Immutabilité.** Le document source est figé par son SHA-256 à
  l'envoi. Toute modification après envoi annule la demande (`CANCELED`) et
  en crée une nouvelle.
- **SG-R3 Jeton.** 32 octets aléatoires, seul le SHA-256 est stocké (comme
  `SecureLink`), TTL 7 jours par défaut, 30 max. Un jeton par signataire.
- **SG-R4 Code à usage unique.** 6 chiffres, HMAC-SHA256, comparaison à temps
  constant, 5 essais, validité 10 minutes, renvoi limité (3). Canaux : e-mail,
  WhatsApp (consentement CRM), SMS quand le lot SMS-1 sera intégré. Le code
  n'est jamais journalisé.
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
- **SG-R10 Signature sur place.** Pour l'état des lieux (et tout document en
  présence), mode « tablette » : l'agent ouvre la demande, le signataire dessine
  sa signature ; le code à usage unique est optionnel, la présence est tracée.
- **SG-R11 Refus et expiration.** Un signataire peut refuser (motif) ; un
  job marque `EXPIRED` les demandes échues et notifie l'émetteur.
- **SG-R12 Facturation.** Capacité d'abonnement `SIGNATURES_MENSUELLES`,
  réservation atomique à l'envoi, politique selon `SUBSCRIPTION_ENFORCEMENT`
  (modèle : `lib/stock-whatsapp/quota.ts`) ; restitution si l'envoi échoue.
- **SG-R13 Fournisseur.** Variable `SIGNATURE_PROVIDER` =
  `disabled` | `log` | `internal` (défaut `disabled`), plus tard un nom de
  prestataire ; passe par `config/env.ts` et `env.example`.
- **SG-R14 Libellés.** Tous les textes passent par `t()`, trilingue fr/en/ar,
  marges logiques ; le certificat est produit dans la langue du document.

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
6. **SMS** : dépend de l'intégration du lot SMS-1 ; en attendant, e-mail et
   WhatsApp.
7. **Numérotation spec** : 043 choisi (042 est réservé au plan de paiement mobile Syndic, voir HANDOFF).
