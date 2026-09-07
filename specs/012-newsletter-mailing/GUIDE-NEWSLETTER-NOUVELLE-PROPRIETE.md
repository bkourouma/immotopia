# Newsletter : proposer une nouvelle propriété à des contacts

Guide étape par étape pour créer et envoyer une newsletter afin de proposer une nouvelle propriété à vos contacts.

---

## Étape 1 : Créer la liste de diffusion

1. Connectez-vous au back-office et allez dans **Communication** → **Newsletter**
2. Cliquez sur **Nouvelle liste**
3. Renseignez :
   - **Nom** : ex. « Prospects biens neufs » ou « Contacts annonces »
   - **Type** : **Manuelle** (si vous allez ajouter des contacts à la main ou importer un CSV) ou **Contacts CRM** (si vos prospects sont dans le CRM)
   - **Double opt-in** : activé ou non selon vos besoins
4. Validez

---

## Étape 2 : Ajouter les destinataires

### Option A — Import CSV

1. Ouvrez la liste créée
2. Cliquez sur **Importer CSV**
3. Préparez un fichier CSV avec les colonnes `email` et `name` :
   ```csv
   email,name
   jean.dupont@email.com,Jean Dupont
   marie.martin@email.com,Marie Martin
   ```
4. Importez le fichier

### Option B — Inscription publique

1. Dans le détail de la liste, section **Formulaire d'inscription publique**
2. Copiez le lien (ex. `https://votresite.com/newsletter/subscribe?token=lst_xxx`)
3. Partagez ce lien à vos prospects pour qu'ils s'inscrivent eux-mêmes

### Option C — Liste dérivée (Contacts CRM)

Si vous avez créé une liste de type **Contacts CRM**, les destinataires sont résolus automatiquement parmi les contacts ayant donné leur accord email.

---

## Étape 3 : Créer la campagne

1. Allez dans **Communication** → **Campagnes**
2. Cliquez sur **Nouvelle campagne**
3. Sélectionnez la **liste** créée à l'étape 1
4. Renseignez le **sujet** : ex. « Nouvelle propriété disponible — [Ville] »
5. Rédigez le **corps HTML** de l'email

---

## Étape 4 : Rédiger le contenu de la newsletter

Exemple de contenu pour proposer une nouvelle propriété :

```html
<p>Bonjour {{prenom}},</p>

<p>Nous avons le plaisir de vous présenter une nouvelle propriété qui pourrait vous intéresser :</p>

<h3>Bien situé à [Ville]</h3>
<ul>
  <li>Surface : X m²</li>
  <li>Prix : XXX 000 €</li>
  <li>Caractéristiques : [liste]</li>
</ul>

<p>Contactez-nous pour une visite ou plus d'informations.</p>

<p>Cordialement,<br>Votre agence</p>

<p><a href="{{lien_desinscription}}">Se désabonner</a></p>
```

**Important** : incluez obligatoirement le lien `{{lien_desinscription}}` dans chaque email (obligation légale).

Variables disponibles : `{{prenom}}`, `{{nom}}`, `{{email}}`, etc.

---

## Étape 5 : Vérifier l’aperçu

1. Sauvegardez la campagne (statut Brouillon)
2. Cliquez sur **Aperçu**
3. Vérifiez le rendu : sujet, mise en forme, lien de désinscription

---

## Étape 6 : Envoyer la campagne

### Envoi immédiat

1. Cliquez sur **Envoyer** sur la campagne
2. Confirmez
3. Les emails sont envoyés immédiatement

### Envoi planifié

1. Cliquez sur **Planifier**
2. Choisissez la date et l’heure
3. Validez
4. La campagne sera envoyée automatiquement à l’heure prévue

---

## Résumé des étapes

| Étape | Action |
|-------|--------|
| 1 | Créer une liste (Manuelle ou Contacts CRM) |
| 2 | Ajouter les contacts (CSV, inscription publique ou liste dérivée) |
| 3 | Créer une campagne et sélectionner la liste |
| 4 | Rédiger sujet et corps HTML avec `{{lien_desinscription}}` |
| 5 | Vérifier l’aperçu |
| 6 | Envoyer immédiatement ou planifier |

---

## Astuce : utiliser un template

Pour un rendu homogène et réutilisable :

1. Allez dans **Communication** → **Templates**
2. Créez un template (en-tête, pied de page, mise en forme)
3. Lors de la création d’une campagne, sélectionnez ce template
4. Le contenu spécifique (annonce de la propriété) remplace la variable `{{contenu}}` dans le template
