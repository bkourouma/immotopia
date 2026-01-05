# PROMPT CURSOR AI — MODULE DE GÉNÉRATION AUTOMATIQUE DE DOCUMENTS

## CONTEXTE PROJET
Tu travailles dans le codebase **ImmoTopia**, une plateforme immobilière **multi-tenant**.

Objectif : implémenter un **module complet de génération automatique de documents (DOCX, PDF optionnel)** à partir :
- des **données en base (Prisma / PostgreSQL)**
- du **type de document (docType)**
- de **templates DOCX tenant-spécifiques**

Les champs (placeholders) sont communs, mais **chaque tenant peut avoir ses propres templates**.

---

## DOSSIERS DE STOCKAGE

### Templates
- Templates globaux (fallback) :  
  `D:\APP\Immobillier\assets\modeles_documents\default\`

- Templates par tenant :  
  `D:\APP\Immobillier\assets\modeles_documents\tenants\{tenantId}\`

### Documents générés
- `D:\APP\Immobillier\assets\generated_documents\{tenantId}\{docType}\{YYYY}\{MM}\`
- Nom du fichier :  
  `{DOCUMENT_NUMBER}_{docType}_{sourceKey}.docx`

---

## FORMAT DES TEMPLATES
- Fichiers **DOCX uniquement**
- Placeholders obligatoires au format :  
  `{{VARIABLE}}`

Exemples :
- `{{BAILLEUR_NOM}}`
- `{{LOCATAIRE_NOM}}`
- `{{LOYER_MENSUEL}}`

---

## TYPES DE DOCUMENTS SUPPORTÉS

| docType | Source | Description |
|------|------|------|
| LEASE_HABITATION | leaseId | Contrat de bail habitation |
| LEASE_COMMERCIAL | leaseId | Contrat de bail commercial |
| RENT_RECEIPT | paymentId (+installmentId) | Reçu de loyer |
| RENT_STATEMENT | leaseId + période | Relevé de compte locatif |

---

## RÈGLES DE SÉLECTION DES TEMPLATES (OBLIGATOIRE)

Lors d’une génération :

1. Si `templateId` est fourni dans la requête :
   - utiliser ce template **uniquement s’il appartient au tenant**, correspond au `docType` et est **ACTIF**

2. Sinon :
   - utiliser le template **par défaut du tenant** pour ce `docType`

3. Sinon :
   - utiliser le **dernier template ACTIF** du tenant pour ce `docType`

4. Sinon :
   - fallback vers le template global par défaut (`/default`)

5. Sinon :
   - retourner une erreur claire : *"Aucun template disponible pour ce type de document"*

---

## EXIGENCES TECHNIQUES GÉNÉRALES

- **Multi-tenant strict** : toute requête DB et tout accès fichier doivent être tenant-scopés
- **Sécurité** :
  - pas de path traversal
  - nom de fichier généré côté serveur
  - limite de taille (ex : 10 MB)
  - validation MIME + extension
- **Idempotence** :
  - génération = nouvelle version
  - regeneration = version +1, ancien document marqué `SUPERSEDED`
- **Audit log obligatoire** pour :
  - upload template
  - activation / désactivation
  - génération / régénération document

---

## MODÈLES PRISMA À CRÉER / VÉRIFIER

### 1) DocumentTemplate

Champs :
- id (uuid)
- tenant_id (nullable pour templates globaux)
- doc_type (enum)
- name
- status (ACTIVE | INACTIVE | DELETED)
- is_default (bool)
- original_filename
- stored_filename
- storage_path
- file_size
- mime_type
- file_hash_sha256
- placeholders (Json[])
- version
- created_by_user_id
- created_at / updated_at

Contraintes :
- 1 seul template `is_default=true` par `(tenant_id, doc_type)`

---

### 2) RentalDocument (ou Document)

Champs clés :
- id, tenant_id, type, status
- lease_id / payment_id / installment_id
- document_number
- template_id utilisé
- template_hash
- file_path
- file_hash
- issued_at
- revision
- superseded_by_id
- created_by_user_id
- metadata (Json)

---

### 3) DocumentCounter

- tenant_id
- doc_type
- period_key (ex: `2025`, `2025-07`)
- last_number

Unique : `(tenant_id, doc_type, period_key)`

---

## NUMÉROTATION DES DOCUMENTS

| Type | Format |
|----|----|
| LEASE_* | BAIL-YYYY-XXXX |
| RENT_RECEIPT | RCU-YYYYMM-XXXX |
| RENT_STATEMENT | RLV-YYYYMM-XXXX |

Numérotation **par tenant**, **par type**, **par période**.

---

## SERVICES À IMPLÉMENTER

### DocumentTemplateService
- uploadTemplate()
- listTemplates()
- activate / deactivate
- setDefault()
- delete (soft)
- extractPlaceholders()
- resolveTemplate()

---

### DocumentContextBuilder

Fonctions par docType pour construire le contexte depuis la DB :
- jointures : Tenant, TenantClient, Property, RentalLease, RentalPayment, Installments…
- formatage :
  - dates : DD/MM/YYYY
  - montants FCFA : séparateurs milliers, sans décimales

Validation :
- comparer placeholders du template vs clés du contexte
- champs critiques manquants = erreur bloquante

---

### DocxRenderer

- charger template DOCX
- injecter contexte
- générer buffer DOCX
- calcul SHA-256
- écrire fichier disque

---

### DocumentService

- generateDocument()
- regenerateDocument()
- getDocumentFile()

---

## API À EXPOSER

### Templates
- POST   /api/v1/templates/upload
- GET    /api/v1/templates
- PATCH  /api/v1/templates/:id
- POST   /api/v1/templates/:id/set-default
- DELETE /api/v1/templates/:id

### Documents
- POST /api/v1/documents/generate
- POST /api/v1/documents/:id/regenerate
- GET  /api/v1/documents/:id/download

---

## UI MINIMALE À FOURNIR

### Tenant Settings → Templates
- Upload template
- Liste par docType
- Voir placeholders
- Activer / Désactiver
- Définir par défaut

### Pages Métier
- Bail → Générer contrat
- Paiement → Générer reçu
- Bail → Générer relevé

---

## TESTS OBLIGATOIRES

- Résolution du template (priorités)
- Extraction des placeholders
- Numérotation incrémentale
- Sécurité tenant (aucun accès croisé)

---

## LIVRABLE ATTENDU

- Implémentation complète (pas partielle)
- Code prêt à commit
- README expliquant :
  - ajout d’un nouveau docType
  - ajout d’un nouveau template tenant
  - mapping placeholders

---

## INSTRUCTION FINALE

➡ Implémente **l’intégralité** de ce module sans casser l’existant.
➡ Respecte les conventions du projet ImmoTopia.
➡ Ne laisse aucun TODO bloquant.

