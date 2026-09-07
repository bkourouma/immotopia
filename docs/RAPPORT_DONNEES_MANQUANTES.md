# Rapport des Données Manquantes dans les Contrats de Bail

**Date de génération** : 2026-01-08  
**Total de baux vérifiés** : 34  
**Baux avec données manquantes** : 34  
**Baux complets** : 0

---

## 📊 Résumé par Type de Données Manquantes

### Informations Agence (Tenant)
**Tous les 34 baux** ont des informations d'agence manquantes :
- ❌ Adresse (AGENCE_ADRESSE) : 34 baux
- ❌ Téléphone (AGENCE_TELEPHONE) : 34 baux
- ❌ Email (AGENCE_EMAIL) : 34 baux

**Action requise** : Renseigner une seule fois dans les paramètres du tenant  
**URL** : `http://localhost:3000/tenant/e3e428d1-364b-42c9-a102-a22daa9329c5/settings`

---

### Informations Bien (Property)
**8 baux** ont des informations de bien manquantes :
- ❌ Adresse (BIEN_ADRESSE) : 8 baux
- ❌ Nombre de pièces (BIEN_PIECES) : 8 baux
- ❌ Nombre de chambres (BIEN_CHAMBRES) : 8 baux

**Baux concernés** :
1. BAIL-2026-0008 → Propriété `50db45b9-47b6-47a0-bab5-74d5404a5473`
2. BAIL-2026-0003 → Propriété `211a61f2-c23f-45f7-843c-6aefc3ab43f4`
3. BAIL-2026-0002 → Propriété `50db45b9-47b6-47a0-bab5-74d5404a5473`
4. BAIL-2026-0001 → Propriété `211a61f2-c23f-45f7-843c-6aefc3ab43f4`
5. 1244 → Propriété `211a61f2-c23f-45f7-843c-6aefc3ab43f4`

---

### Informations Locataire (Téléphone)
**26 baux** ont le téléphone du locataire manquant :
- ❌ Téléphone (LOCATAIRE_TELEPHONE) : 26 baux

**Note** : Certains baux ont des URLs vers les contacts CRM, d'autres nécessitent une mise à jour via l'API.

---

### Informations Bailleur (Téléphone)
**26 baux** ont le téléphone du bailleur manquant :
- ❌ Téléphone (BAILLEUR_TELEPHONE) : 26 baux

**Note** : Certains baux ont des URLs vers les contacts CRM, d'autres nécessitent une mise à jour via l'API.

---

## 🎯 Priorités d'Action

### Priorité 1 : Informations Agence (Impact sur TOUS les baux)
**Action immédiate** : Renseigner les informations de l'agence une seule fois
- URL : `http://localhost:3000/tenant/e3e428d1-364b-42c9-a102-a22daa9329c5/settings`
- Champs à remplir :
  - Adresse complète
  - Téléphone de contact
  - Email de contact

**Impact** : Résoudra les problèmes pour les 34 baux en une seule action !

---

### Priorité 2 : Bail BAIL-2026-0008 (Votre cas spécifique)

#### Informations Agence manquantes
- URL : `http://localhost:3000/tenant/e3e428d1-364b-42c9-a102-a22daa9329c5/settings`

#### Informations Bien manquantes
- URL : `http://localhost:3000/tenant/e3e428d1-364b-42c9-a102-a22daa9329c5/properties/50db45b9-47b6-47a0-bab5-74d5404a5473/edit`
- Champs à remplir :
  - Adresse complète du bien
  - Nombre de pièces
  - Nombre de chambres

#### Informations Contacts (si nécessaire)
- Locataire : `http://localhost:3000/tenant/e3e428d1-364b-42c9-a102-a22daa9329c5/crm/contacts/8eae3f25-4792-487c-b5d8-a7887f54531a`
- Bailleur : `http://localhost:3000/tenant/e3e428d1-364b-42c9-a102-a22daa9329c5/crm/contacts/3df5df48-418a-4c2b-b9ab-6158f959d6a4`

---

## 📋 Liste Détaillée des Baux

### Baux avec Informations Bien Manquantes

| Bail N° | Propriété ID | URL Édition Propriété |
|---------|--------------|------------------------|
| BAIL-2026-0008 | `50db45b9-47b6-47a0-bab5-74d5404a5473` | [Éditer](http://localhost:3000/tenant/e3e428d1-364b-42c9-a102-a22daa9329c5/properties/50db45b9-47b6-47a0-bab5-74d5404a5473/edit) |
| BAIL-2026-0003 | `211a61f2-c23f-45f7-843c-6aefc3ab43f4` | [Éditer](http://localhost:3000/tenant/e3e428d1-364b-42c9-a102-a22daa9329c5/properties/211a61f2-c23f-45f7-843c-6aefc3ab43f4/edit) |
| BAIL-2026-0002 | `50db45b9-47b6-47a0-bab5-74d5404a5473` | [Éditer](http://localhost:3000/tenant/e3e428d1-364b-42c9-a102-a22daa9329c5/properties/50db45b9-47b6-47a0-bab5-74d5404a5473/edit) |
| BAIL-2026-0001 | `211a61f2-c23f-45f7-843c-6aefc3ab43f4` | [Éditer](http://localhost:3000/tenant/e3e428d1-364b-42c9-a102-a22daa9329c5/properties/211a61f2-c23f-45f7-843c-6aefc3ab43f4/edit) |
| 1244 | `211a61f2-c23f-45f7-843c-6aefc3ab43f4` | [Éditer](http://localhost:3000/tenant/e3e428d1-364b-42c9-a102-a22daa9329c5/properties/211a61f2-c23f-45f7-843c-6aefc3ab43f4/edit) |

**Note** : La propriété `50db45b9-47b6-47a0-bab5-74d5404a5473` est utilisée dans 2 baux (BAIL-2026-0008 et BAIL-2026-0002).  
**Note** : La propriété `211a61f2-c23f-45f7-843c-6aefc3ab43f4` est utilisée dans 4 baux.

---

## 🔄 Comment Utiliser ce Rapport

1. **Commencer par les informations d'agence** (Priorité 1) - Résout 34 baux en une action
2. **Pour chaque bail spécifique** :
   - Cliquer sur l'URL du bail pour voir les détails
   - Utiliser les URLs fournies pour renseigner les informations manquantes
3. **Vérifier après chaque modification** :
   ```bash
   cd packages/api
   npm run check:missing-lease-data
   ```

---

## 📝 Notes Importantes

- Les informations d'agence manquent pour **TOUS** les baux. C'est la priorité absolue.
- Certains contacts CRM ont déjà des URLs directes, d'autres nécessitent une mise à jour via l'API.
- Le rapport JSON complet est disponible dans : `packages/api/missing-lease-data-report.json`

---

**Dernière mise à jour** : 2026-01-08
