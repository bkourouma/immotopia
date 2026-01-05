# Prompt pour Cursor AI — Améliorer la Landing Page ImmoTopia (objectif : sign-ups)

## Contexte
Tu travailles sur la landing page (page d’accueil) du site SaaS **ImmoTopia**.

**Cible principale** :
- Propriétaires / dirigeants d’agences immobilières
- Gestionnaires locatifs / property managers

**Objectif principal** : maximiser les **inscriptions (sign-ups)** à l’application **SaaS cloud**.

**IMPORTANT** : Retirer le terme **« multi-tenant »** (trop technique / inutile pour les clients). Ne pas l’utiliser dans la landing page.

**Technos existantes** : Next.js, Tailwind CSS, shadcn/ui, Framer Motion, TypeScript.

## Ce que tu dois produire
1) Une **version améliorée de la landing page** (UI + copywriting) centrée sur la conversion.
2) Un **copywriting complet** (titres, sous-titres, bénéfices, CTA, micro-copy de réassurance, FAQ).
3) Des **recommandations SEO/tech** applicables dans le code (metadata, structure Hn, performance).
4) Des **améliorations UX** (réduction des distractions, parcours de conversion, mobile-first).

Livrables attendus dans le repo :
- Mise à jour de `apps/web/src/app/page.tsx` et/ou `HomePageContent.tsx` + sections associées.
- Ajout d’une section FAQ (avec schema.org FAQ si possible).
- Mise à jour du SEO (title, description, OG tags).
- Mise en place d’un composant **Signup** clair (form + option Google si dispo) et tracking.

---

## Principes (à respecter)
### 1) Conversion d’abord
- **Un CTA primaire unique** : « Créer mon compte » / « Commencer gratuitement » / « Essai gratuit » (choisir une formule cohérente avec le produit).
- CTA répété : Hero + milieu + final CTA + header sticky.
- **Réduire la navigation** sur la landing : garder 3–4 liens max + CTA.
- Ajouter de la **réassurance** près du CTA (ex : « Sans engagement », « Configuration rapide », « Support inclus »).

### 2) Copywriting orienté bénéfices (pas technique)
- Le H1 doit dire **le bénéfice principal** en langage simple.
- Pas de jargon : éviter « multi-tenant », « ERP », « API » dans le hero.
- Mettre en avant les gains : temps, productivité, visibilité, encaissement, suivi client.

### 3) Preuve sociale et crédibilité
- Mettre une ligne de preuve sociale au-dessus ou juste sous le Hero :
  - « Déjà utilisé par … » (si chiffres réels) ou « Conçu pour les pros de l’immobilier en Côte d’Ivoire / Afrique de l’Ouest »
- Témoignages : 3–6, courts, concrets, avec résultat.
- Ajouter logos clients/partenaires si disponibles.

### 4) Démonstration produit (visuel)
- Dans le Hero ou juste après : mockup / screenshot / mini démo.
- Option : GIF léger ou vidéo courte (non auto-play son).

### 5) SEO et performance
- Title + meta description orientés mots-clés :
  - « logiciel immobilier », « gestion locative », « CRM immobilier », « portail d’annonces ».
- Structure Hn propre : 1 seul H1, sections en H2, sous-sections en H3.
- Images optimisées (Next/Image, WebP), lazy loading sous la fold.
- Minimiser scripts, pas d’animations lourdes inutiles.
- Accessibilité : contraste, focus visibles, aria-labels.

---

## Nouvelle structure recommandée (page)
### Header (sticky)
- Logo
- Liens (max 4) : Fonctionnalités, Tarifs, Ressources (option), Connexion
- CTA bouton : **Créer mon compte**

### Section 1 — Hero (au-dessus de la fold)
- Badge : « Logiciel immobilier cloud » / « Pour agences & gestionnaires »
- H1 (orienté bénéfice)
- Sous-titre : 1–2 phrases max
- 3 bullets bénéfices (icônes)
- CTA primaire : « Créer mon compte »
- CTA secondaire (option) : « Voir la démo » (si démo disponible)
- Micro-copy de réassurance sous CTA (ex : « Sans engagement · Mise en place rapide · Support inclus »)
- Visuel produit (screenshot/preview)

### Section 2 — Problème → Solution (clarté)
- 3 pains typiques :
  - perte de temps administratif
  - dispersion outils (Excel/WhatsApp/Docs)
  - manque de suivi prospects / relances
- 3 solutions ImmoTopia correspondantes

### Section 3 — Fonctionnalités phares (focus conversion)
Mettre 4–6 features max (le reste renvoie à la page fonctionnalités) :
- Gestion des biens
- CRM immobilier
- Gestion locative
- Portail d’annonces
- Paiements Mobile Money (si disponible)
- Reporting
Chaque feature : titre + bénéfice + 2 bullets

### Section 4 — “Comment ça marche” (3 étapes)
1. Créez votre compte
2. Importez/ajoutez vos biens et contacts
3. Gérez et publiez (annonces + suivi)

### Section 5 — Personas (Agences / Gestionnaires)
- 2 cartes principales seulement (ne pas trop diluer)
- CTA contextualisé : « Créer mon compte Agence » / « Créer mon compte Gestion locative » (même endpoint)

### Section 6 — Témoignages + métriques
- Témoignages courts (avec rôle)
- 3 métriques (si réelles) : ex. temps gagné, productivité, taux de relance

### Section 7 — Tarifs (aperçu)

Présenter clairement le **modèle économique** sans complexité, avec un message rassurant et orienté valeur.

**Logiciel de gestion immobilière – Modèle SaaS**
- Frais d’activation (one-time) : **250 000 FCFA**
- Abonnements mensuels :
  - **Basic** : 35 000 FCFA / mois
  - **Pro** : 50 000 FCFA / mois
  - **Elite** : 100 000 FCFA / mois

**Licence perpétuelle (option alternative)**
- **Offre : Licence Perpétuelle ImmoTopia**
- **Tarification : Nous appeler**
- Maintenance annuelle obligatoire après 12 mois : **400 000 FCFA / an****

**Règles de présentation UX**
- Ne pas afficher tous les détails techniques sur la landing.
- Mettre en avant la flexibilité : SaaS **ou** Licence perpétuelle.
- Ajouter des labels de réassurance : « Sans engagement (SaaS) », « Support inclus », « Solution évolutive ».
- Bouton CTA par plan : **Commencer** / **Créer mon compte**.

### Section 8 — FAQ
- 6–10 questions (objections)
- Ajout schema.org FAQ

### Final CTA
- Rappel promesse + CTA primaire

### Footer
- Minimal : liens légaux + contact + réseaux

---

## Copywriting à produire (en français)
### Hero — 3 propositions de H1 (choisir la meilleure)
1) « Gérez votre agence immobilière en un seul outil — plus vite, plus simple. »
2) « Le logiciel immobilier cloud pour gérer vos biens, clients et locations. »
3) « Moins d’administratif, plus de ventes : centralisez toute votre gestion immobilière. »

### Sous-titre (proposition)
« Centralisez vos biens, vos contacts, vos locations et la publication de vos annonces sur une plateforme unique, pensée pour les professionnels de l’immobilier en Afrique de l’Ouest. »

### 3 bullets bénéfices (exemples)
- « Suivi complet des biens et des dossiers »
- « CRM + rendez-vous + relances »
- « Gestion locative et paiements simplifiés »

### CTA
- CTA primaire : « Créer mon compte »
- Micro-copy : « Sans engagement · Configuration rapide · Support inclus »

---

## UX/UI : règles de design
- Réduire les animations “pulse” multiples si elles impactent la lisibilité/perf.
- Prioriser la **lisibilité** : taille texte, contrastes, whitespace.
- Mettre le CTA en évidence (couleur primaire), et limiter les autres boutons.
- Mobile : boutons full-width, sections condensées, visuel optimisé.

---

## SEO : checklist
- `title` : inclure « logiciel immobilier », « gestion locative », « CRM immobilier »
- `meta description` : claire + bénéfice + CTA implicite
- OpenGraph/Twitter cards
- `Organization` + `WebSite` schema (déjà présent) + ajouter `FAQPage`
- H1 unique, H2 par section
- Pages liées : /fonctionnalites, /tarifs, /ressources

---

## Tracking & Analytics
- Garder `trackCTAClick()` et étendre :
  - `signup_start`, `signup_complete`
  - `pricing_view`, `feature_click`, `faq_expand`
- Ajouter des IDs stables sur les CTA (ex: `cta-hero-signup`)

---

## Implémentation (instructions code)
1) Refactor la landing pour intégrer la structure ci-dessus.
2) Remplacer toutes les mentions « multi-tenant » par une formulation client :
   - « plateforme cloud », « espace agence », « compte entreprise », « gestion centralisée ».
3) Ajouter un composant `SignupCard` :
   - Email + mot de passe + bouton
   - Option Google si disponible
   - États : loading, error, success
   - Réassurance
4) Ajouter section FAQ (accordion shadcn/ui) + JSON-LD FAQ
5) Optimiser médias : Next/Image, lazy loading
6) Vérifier accessibilité : focus, aria-label, contraste

---

## Critères d’acceptation
- Le H1 + sous-titre sont compréhensibles en 5 secondes.
- Le CTA « Créer mon compte » est visible au-dessus de la fold (desktop + mobile).
- La landing guide vers le sign-up, sans distractions inutiles.
- Performance correcte (LCP, CLS), pas d’animations lourdes.
- SEO propre : title/description + Hn + OG + FAQ schema.

---

## Notes
- Tout le texte doit être cohérent avec ImmoTopia : logiciel de gestion immobilière + portail d’annonces + CRM + gestion locative + paiements (si activés).
- Garder un ton professionnel, rassurant, orienté résultats.

