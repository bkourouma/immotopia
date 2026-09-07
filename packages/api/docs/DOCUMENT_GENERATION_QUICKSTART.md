# Guide de Démarrage Rapide - Module de Génération de Documents

## Installation

1. **Installer les dépendances** (déjà fait) :
```bash
cd packages/api
npm install docxtemplater pizzip crypto-js
```

2. **Appliquer la migration** :
```bash
cd packages/api
npx prisma migrate deploy
# ou en développement :
npx prisma migrate dev
```

3. **Créer les dossiers de stockage** (déjà fait) :
- `assets/modeles_documents/default/` - Templates globaux
- `assets/modeles_documents/tenants/{tenantId}/` - Templates par tenant
- `assets/generated_documents/` - Documents générés

## Utilisation

### 1. Uploader un template

**Via l'interface** :
- Aller sur `/tenant/:tenantId/documents/templates`
- Cliquer sur "Ajouter un template"
- Sélectionner le type de document
- Uploader le fichier DOCX

**Via l'API** :
```bash
POST /api/tenants/:tenantId/documents/templates/upload
Content-Type: multipart/form-data

{
  "docType": "LEASE_HABITATION",
  "name": "Contrat Bail Standard",
  "file": <fichier.docx>
}
```

### 2. Créer un template DOCX

Le template doit utiliser des placeholders au format `{{VARIABLE}}` :

```
CONTRAT DE BAIL HABITATION

Entre :
{{AGENCE_NOM}}
{{AGENCE_ADRESSE}}

Et :
{{LOCATAIRE_NOM}}
{{LOCATAIRE_EMAIL}}

Pour le bien situé au :
{{BIEN_ADRESSE}}

Montant du loyer : {{BAIL_LOYER_MENSUEL}} FCFA
Date de début : {{BAIL_DATE_DEBUT}}
```

### 3. Générer un document

**Via l'API** :
```bash
POST /api/tenants/:tenantId/documents/generate
{
  "docType": "LEASE_HABITATION",
  "sourceKey": "<leaseId>",
  "templateId": "<templateId>" // Optionnel
}
```

**Depuis une page métier** :
- Dans la page de détail d'un bail, ajouter un bouton "Générer contrat"
- Dans la page de paiement, ajouter un bouton "Générer reçu"

### 4. Télécharger un document

```bash
GET /api/tenants/:tenantId/documents/:id/download
```

## Placeholders disponibles

### Pour les baux (LEASE_HABITATION, LEASE_COMMERCIAL)

- `AGENCE_NOM`, `AGENCE_ADRESSE`, `AGENCE_TELEPHONE`, `AGENCE_EMAIL`
- `BAIL_NUMERO`, `BAIL_DATE_DEBUT`, `BAIL_DATE_FIN`
- `BAIL_LOYER_MENSUEL`, `BAIL_CHARGES`, `BAIL_DEPOT_GARANTIE`
- `BAIL_FREQUENCE`, `BAIL_JOUR_ECHEANCE`
- `LOCATAIRE_NOM`, `LOCATAIRE_EMAIL`
- `BAILLEUR_NOM`, `BAILLEUR_EMAIL`
- `BIEN_ADRESSE`, `BIEN_TYPE`, `BIEN_SURFACE`, `BIEN_PIECES`, `BIEN_CHAMBRES`
- `DATE_GENERATION`, `DATE_SIGNATURE`

### Pour les reçus (RENT_RECEIPT)

- `AGENCE_NOM`, `AGENCE_ADRESSE`, `AGENCE_TELEPHONE`, `AGENCE_EMAIL`
- `BAIL_NUMERO`, `BAIL_LOYER_MENSUEL`
- `LOCATAIRE_NOM`, `LOCATAIRE_EMAIL`
- `PAIEMENT_MONTANT`, `PAIEMENT_METHODE`, `PAIEMENT_DATE`, `PAIEMENT_NUMERO`
- `PERIODE_MOIS`, `PERIODE_ANNEE`
- `DATE_GENERATION`

### Pour les relevés (RENT_STATEMENT)

- `AGENCE_NOM`, `AGENCE_ADRESSE`, `AGENCE_TELEPHONE`, `AGENCE_EMAIL`
- `BAIL_NUMERO`, `BAIL_LOYER_MENSUEL`
- `LOCATAIRE_NOM`, `LOCATAIRE_EMAIL`
- `PERIODE_DEBUT`, `PERIODE_FIN`
- `TOTAL_DU`, `TOTAL_PAYE`, `SOLDE`
- `DATE_GENERATION`

## Exemple d'intégration dans une page React

```tsx
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

export function LeaseDetailPage() {
  const { tenantId, leaseId } = useParams();
  const { getAuthHeaders } = useAuth();
  const [generating, setGenerating] = useState(false);

  const handleGenerateContract = async () => {
    try {
      setGenerating(true);
      const headers = getAuthHeaders();
      const response = await fetch(
        `/api/tenants/${tenantId}/documents/generate`,
        {
          method: 'POST',
          headers: {
            ...headers,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            docType: 'LEASE_HABITATION',
            sourceKey: leaseId
          })
        }
      );

      const data = await response.json();
      if (data.success) {
        // Télécharger le document
        window.open(`/api/tenants/${tenantId}/documents/${data.data.id}/download`);
      }
    } catch (error) {
      console.error('Erreur lors de la génération', error);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div>
      <button onClick={handleGenerateContract} disabled={generating}>
        {generating ? 'Génération...' : 'Générer le contrat'}
      </button>
    </div>
  );
}
```

## Dépannage

### Erreur "Aucun template disponible"
- Vérifier qu'un template ACTIF existe pour ce type de document
- Vérifier que le template appartient au tenant ou qu'un template global existe

### Erreur "Champs critiques manquants"
- Vérifier que les données nécessaires sont présentes dans la base
- Vérifier que le bail/locataire/propriétaire sont correctement liés

### Erreur lors du rendu du template
- Vérifier que tous les placeholders utilisés dans le template sont disponibles
- Vérifier la syntaxe des placeholders : `{{VARIABLE}}` (double accolades)

## Prochaines étapes

1. Ajouter des boutons de génération dans les pages métier
2. Personnaliser les templates selon vos besoins
3. Ajouter de nouveaux placeholders si nécessaire
4. Configurer les permissions RBAC pour l'accès aux templates

