# Module de Génération Automatique de Documents

## Vue d'ensemble

Ce module permet la génération automatique de documents (DOCX) à partir de templates tenant-spécifiques. Les documents sont générés en injectant des données de la base de données dans des templates DOCX avec des placeholders au format `{{VARIABLE}}`.

## Architecture

### Modèles de données

#### DocumentTemplate
Stocke les templates DOCX avec leurs métadonnées :
- `tenant_id` : Nullable pour templates globaux (fallback)
- `doc_type` : Type de document (LEASE_HABITATION, LEASE_COMMERCIAL, RENT_RECEIPT, RENT_STATEMENT)
- `status` : ACTIVE, INACTIVE, DELETED
- `is_default` : Un seul template par défaut par tenant/docType
- `placeholders` : Liste des placeholders extraits du template

#### DocumentCounter
Gère la numérotation séquentielle des documents par tenant, type et période.

#### RentalDocument (étendu)
Ajout des champs :
- `template_id` : Template utilisé pour générer le document
- `template_hash` : Hash du template au moment de la génération
- `file_path` : Chemin du fichier généré
- `file_hash` : Hash du fichier généré
- `revision` : Numéro de révision
- `superseded_by_id` : ID du document qui remplace celui-ci

### Services

#### DocumentTemplateService
- `uploadTemplate()` : Télécharge et enregistre un template
- `listTemplates()` : Liste les templates d'un tenant
- `activateTemplate()` / `deactivateTemplate()` : Active/désactive un template
- `setDefaultTemplate()` : Définit un template par défaut
- `deleteTemplate()` : Suppression logique
- `extractPlaceholders()` : Extrait les placeholders d'un template DOCX
- `resolveTemplate()` : Résout le template à utiliser selon les règles de priorité

#### DocumentContextBuilder
Construit le contexte de données pour chaque type de document :
- `buildLeaseHabitationContext()` : Contexte pour contrat de bail habitation
- `buildLeaseCommercialContext()` : Contexte pour contrat de bail commercial
- `buildRentReceiptContext()` : Contexte pour reçu de loyer
- `buildRentStatementContext()` : Contexte pour relevé de compte locatif
- `validateContext()` : Valide que tous les placeholders critiques sont présents

#### DocxRenderer
- `renderDocx()` : Rend un template DOCX avec un contexte de données
- `calculateHash()` : Calcule le hash SHA-256 d'un buffer
- `saveGeneratedDocument()` : Sauvegarde un document généré sur disque

#### DocumentGenerationService
- `generateDocument()` : Génère un nouveau document
- `regenerateDocument()` : Régénère un document (nouvelle révision)
- `getDocumentFile()` : Récupère le fichier d'un document

## Structure des dossiers

```
assets/
├── modeles_documents/
│   ├── default/              # Templates globaux (fallback)
│   └── tenants/
│       └── {tenantId}/        # Templates par tenant
└── generated_documents/
    └── {tenantId}/
        └── {docType}/
            └── {YYYY}/
                └── {MM}/
                    └── {DOCUMENT_NUMBER}_{docType}_{sourceKey}.docx
```

## Règles de résolution des templates

Lors de la génération d'un document, le template est résolu selon cette priorité :

1. Si `templateId` est fourni : utiliser ce template (s'il appartient au tenant, correspond au docType et est ACTIF)
2. Sinon : utiliser le template par défaut du tenant pour ce docType
3. Sinon : utiliser le dernier template ACTIF du tenant pour ce docType
4. Sinon : fallback vers le template global par défaut (`/default`)
5. Sinon : fallback vers le dernier template global ACTIF
6. Sinon : erreur "Aucun template disponible pour ce type de document"

## Numérotation des documents

| Type | Format | Période |
|------|--------|---------|
| LEASE_HABITATION | BAIL-YYYY-XXXX | Annuelle |
| LEASE_COMMERCIAL | BAIL-YYYY-XXXX | Annuelle |
| RENT_RECEIPT | RCU-YYYYMM-XXXX | Mensuelle |
| RENT_STATEMENT | RLV-YYYYMM-XXXX | Mensuelle |

La numérotation est incrémentale par tenant, type et période.

## Placeholders disponibles

### Placeholders communs
- `AGENCE_NOM` : Nom de l'agence (tenant)
- `AGENCE_ADRESSE` : Adresse de l'agence
- `AGENCE_TELEPHONE` : Téléphone de l'agence
- `AGENCE_EMAIL` : Email de l'agence
- `DATE_GENERATION` : Date de génération (DD/MM/YYYY)

### Placeholders pour baux (LEASE_HABITATION, LEASE_COMMERCIAL)
- `BAIL_NUMERO` : Numéro du bail
- `BAIL_DATE_DEBUT` : Date de début (DD/MM/YYYY)
- `BAIL_DATE_FIN` : Date de fin (DD/MM/YYYY)
- `BAIL_LOYER_MENSUEL` : Loyer mensuel (formaté FCFA)
- `BAIL_CHARGES` : Charges (formaté FCFA)
- `BAIL_DEPOT_GARANTIE` : Dépôt de garantie (formaté FCFA)
- `BAIL_FREQUENCE` : Fréquence de facturation
- `BAIL_JOUR_ECHEANCE` : Jour d'échéance
- `LOCATAIRE_NOM` : Nom du locataire
- `LOCATAIRE_EMAIL` : Email du locataire
- `BAILLEUR_NOM` : Nom du bailleur
- `BAILLEUR_EMAIL` : Email du bailleur
- `BIEN_ADRESSE` : Adresse du bien
- `BIEN_TYPE` : Type de bien
- `BIEN_SURFACE` : Surface (formaté)
- `BIEN_PIECES` : Nombre de pièces
- `BIEN_CHAMBRES` : Nombre de chambres

### Placeholders pour reçus (RENT_RECEIPT)
- `PAIEMENT_MONTANT` : Montant payé (formaté FCFA)
- `PAIEMENT_METHODE` : Méthode de paiement
- `PAIEMENT_DATE` : Date de paiement (DD/MM/YYYY)
- `PAIEMENT_NUMERO` : Numéro de paiement
- `PERIODE_MOIS` : Période (MM/YYYY)
- `PERIODE_ANNEE` : Année

### Placeholders pour relevés (RENT_STATEMENT)
- `PERIODE_DEBUT` : Date de début de période (DD/MM/YYYY)
- `PERIODE_FIN` : Date de fin de période (DD/MM/YYYY)
- `TOTAL_DU` : Total dû (formaté FCFA)
- `TOTAL_PAYE` : Total payé (formaté FCFA)
- `SOLDE` : Solde (formaté FCFA)
- `ECHEANCES` : Tableau des échéances (pour utilisation avancée)

## API Endpoints

### Templates

- `POST /api/tenants/:tenantId/documents/templates/upload`
  - Body: `{ docType, name }` + fichier DOCX
  - Upload un nouveau template

- `GET /api/tenants/:tenantId/documents/templates`
  - Query: `?docType=...&status=...`
  - Liste les templates

- `PATCH /api/tenants/:tenantId/documents/templates/:id`
  - Body: `{ status: 'ACTIVE' | 'INACTIVE' }`
  - Active/désactive un template

- `POST /api/tenants/:tenantId/documents/templates/:id/set-default`
  - Définit un template par défaut

- `DELETE /api/tenants/:tenantId/documents/templates/:id`
  - Supprime un template (soft delete)

### Documents

- `POST /api/tenants/:tenantId/documents/generate`
  - Body: `{ docType, sourceKey, templateId?, installmentId?, startDate?, endDate? }`
  - Génère un nouveau document

- `POST /api/tenants/:tenantId/documents/:id/regenerate`
  - Body: `{ templateId? }`
  - Régénère un document (nouvelle révision)

- `GET /api/tenants/:tenantId/documents/:id/download`
  - Télécharge le fichier DOCX

## Ajout d'un nouveau type de document

1. Ajouter le type dans l'enum `DocumentType` dans `schema.prisma`
2. Créer une fonction `build{NewType}Context()` dans `document-context-builder.ts`
3. Ajouter le cas dans `buildDocumentContext()`
4. Ajouter le format de numérotation dans `generateDocumentNumber()`
5. Mettre à jour la documentation des placeholders

## Ajout d'un nouveau template tenant

1. Créer un fichier DOCX avec des placeholders au format `{{VARIABLE}}`
2. Utiliser l'API `POST /api/tenants/:tenantId/documents/templates/upload`
3. Le système extraira automatiquement les placeholders
4. Définir le template comme défaut si nécessaire

## Mapping des placeholders

Les placeholders sont extraits automatiquement lors de l'upload du template. Le système valide que les placeholders critiques sont présents dans le contexte avant la génération.

Placeholders critiques (doivent être présents) :
- `AGENCE_NOM`
- `LOCATAIRE_NOM`
- `BAIL_NUMERO`
- `BAIL_LOYER_MENSUEL`

Les autres placeholders sont optionnels mais génèrent un avertissement s'ils sont manquants.

## Sécurité

- Validation de la taille des fichiers (max 10 MB)
- Validation du type MIME (DOCX uniquement)
- Vérification du hash pour éviter les doublons
- Isolation stricte par tenant
- Protection contre le path traversal lors du téléchargement
- Audit log pour toutes les opérations

## Idempotence

- Chaque génération crée une nouvelle version
- La régénération incrémente le numéro de révision
- L'ancien document est marqué `SUPERSEDED`
- Le numéro de document reste le même entre les révisions

## Tests

Les tests doivent couvrir :
- Résolution du template (priorités)
- Extraction des placeholders
- Numérotation incrémentale
- Sécurité tenant (aucun accès croisé)
- Validation du contexte
- Génération et régénération


