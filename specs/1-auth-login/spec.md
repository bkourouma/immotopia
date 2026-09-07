# Module d'Authentification & Connexion

**Created**: 2025-11-12
**Status**: Draft
**Feature**: 1-auth-login
**Owner**: ImmoTopia Platform Team

---

## Overview

### Purpose

Ce module établit le système d'authentification et d'autorisation complet pour la plateforme ImmoTopia. Il permet aux utilisateurs de créer un compte, de vérifier leur adresse e-mail, de se connecter de manière sécurisée, de gérer leurs mots de passe, et d'accéder à un tableau de bord personnalisé selon leur rôle. Le système garantit que seuls les utilisateurs authentifiés et vérifiés peuvent accéder aux ressources protégées de la plateforme.

### Business Value

- **Sécurité renforcée** : Protection des données utilisateurs et des ressources de la plateforme via JWT et tokens de rafraîchissement
- **Conformité** : Respect des bonnes pratiques de sécurité (vérification e-mail, stockage sécurisé des mots de passe, gestion de sessions)
- **Expérience utilisateur fluide** : Processus d'inscription et de connexion intuitifs en français, récupération de mot de passe simplifiée
- **Contrôle d'accès granulaire** : Système de rôles permettant de différencier étudiants, instructeurs et administrateurs
- **Fondation évolutive** : Base solide pour les fonctionnalités futures nécessitant authentification et autorisation

---

## User Scenarios & Testing

### Primary User Flow - Inscription

1. L'utilisateur visite la page d'accueil et clique sur "S'inscrire"
2. L'utilisateur remplit le formulaire d'inscription (nom complet, email, mot de passe, confirmation mot de passe, sélection du rôle souhaité)
3. Le système valide les données (email unique, mot de passe conforme aux critères de sécurité)
4. Le système crée le compte en statut "non vérifié" et envoie un email de vérification
5. L'utilisateur reçoit l'email et clique sur le lien de vérification
6. Le système marque le compte comme "vérifié" et affiche un message de confirmation
7. L'utilisateur est redirigé vers la page de connexion

### Primary User Flow - Connexion

1. L'utilisateur visite la page de connexion
2. L'utilisateur saisit son email et mot de passe
3. Le système vérifie les identifiants et le statut de vérification du compte
4. Si les identifiants sont valides et le compte vérifié :
   - Le système génère un JWT access token (durée de vie courte : 15 minutes) et un refresh token (durée de vie longue : 7 jours)
   - Les tokens sont stockés de manière sécurisée (HTTP-only cookies)
   - L'utilisateur est redirigé vers son tableau de bord personnalisé selon son rôle
5. Le tableau de bord affiche : nom complet, email, rôle, date d'inscription, statistiques de base selon le rôle

### Primary User Flow - Réinitialisation de Mot de Passe

1. L'utilisateur clique sur "Mot de passe oublié ?" depuis la page de connexion
2. L'utilisateur saisit son adresse email
3. Le système vérifie que l'email existe, génère un token de réinitialisation unique avec expiration (1 heure), et envoie un email avec un lien
4. L'utilisateur clique sur le lien dans l'email
5. L'utilisateur est redirigé vers une page de réinitialisation avec le token dans l'URL
6. L'utilisateur saisit son nouveau mot de passe et la confirmation
7. Le système valide le token, vérifie que le mot de passe respecte les critères de sécurité, et met à jour le mot de passe
8. L'utilisateur reçoit une confirmation et est redirigé vers la page de connexion

### Primary User Flow - Rafraîchissement de Token

1. L'utilisateur navigue sur la plateforme avec un access token valide
2. L'access token expire (après 15 minutes)
3. L'application détecte l'expiration lors de la prochaine requête API
4. L'application envoie automatiquement le refresh token au endpoint `/api/auth/refresh`
5. Le système valide le refresh token et génère un nouvel access token
6. L'application continue de fonctionner sans interruption pour l'utilisateur

### Edge Cases & Variations

- **Inscription avec email déjà existant** : Le système affiche un message d'erreur en français "Cette adresse email est déjà utilisée" sans révéler l'existence du compte
- **Connexion avec compte non vérifié** : Le système affiche "Veuillez vérifier votre adresse email. Un nouveau lien de vérification a été envoyé." et renvoie un email
- **Token de vérification expiré** : L'utilisateur peut demander un nouveau lien de vérification depuis une page dédiée
- **Token de réinitialisation expiré** : Le système affiche "Ce lien a expiré. Veuillez faire une nouvelle demande de réinitialisation."
- **Demandes multiples de réinitialisation de mot de passe** : Si un utilisateur demande plusieurs réinitialisations avant d'utiliser le premier token, tous les tokens précédents sont invalidés et seul le nouveau token est valide. L'utilisateur reçoit uniquement l'email contenant le dernier token généré.
- **Tentative d'accès au tableau de bord sans authentification** : L'utilisateur est redirigé vers la page de connexion avec un message "Vous devez vous connecter pour accéder à cette page"
- **Tentative d'accès avec token invalide** : L'utilisateur est déconnecté et redirigé vers la page de connexion
- **Refresh token expiré** : L'utilisateur est déconnecté et redirigé vers la page de connexion avec message "Votre session a expiré. Veuillez vous reconnecter."
- **Tentatives de connexion multiples échouées** : Après 5 tentatives échouées en 15 minutes, le compte est temporairement bloqué pendant 30 minutes

### Error Scenarios

- **Email invalide lors de l'inscription** : "Veuillez entrer une adresse email valide"
- **Mot de passe non conforme** : "Le mot de passe doit contenir au moins 8 caractères, une majuscule, une minuscule, un chiffre et un caractère spécial"
- **Mots de passe ne correspondent pas** : "Les mots de passe ne correspondent pas"
- **Identifiants de connexion incorrects** : "Email ou mot de passe incorrect" (message générique pour ne pas révéler quelle information est incorrecte)
- **Erreur d'envoi d'email** : "Une erreur est survenue lors de l'envoi de l'email. Veuillez réessayer dans quelques instants."
- **Erreur serveur** : "Une erreur est survenue. Veuillez réessayer plus tard."
- **Déconnexion** : L'utilisateur peut se déconnecter manuellement, ce qui invalide le refresh token côté serveur et supprime les cookies

---

## Functional Requirements

### Core Requirements

**REQ-001 : Inscription utilisateur**  
Le système doit permettre à un nouvel utilisateur de créer un compte en fournissant : nom complet, adresse email unique, mot de passe, confirmation du mot de passe, et sélection du rôle (STUDENT par défaut, INSTRUCTOR sur demande, ADMIN non disponible à l'inscription). Le mot de passe doit respecter les critères de sécurité (minimum 8 caractères, au moins une majuscule, une minuscule, un chiffre, un caractère spécial). Le système doit hasher le mot de passe avant stockage (bcrypt avec salt factor 10 minimum).

**REQ-002 : Vérification par email**  
Lors de l'inscription, le système doit créer le compte en statut `emailVerified: false`, générer un token de vérification unique (JWT avec expiration 24h ou UUID), envoyer un email contenant un lien de vérification vers `/api/auth/verify-email?token=XXX`. Lorsque l'utilisateur clique sur le lien, le système doit valider le token, marquer le compte comme vérifié (`emailVerified: true`), et afficher une page de confirmation.

**REQ-003 : Connexion sécurisée**  
Le système doit permettre à un utilisateur de se connecter avec son email et mot de passe. Le système doit vérifier que le compte existe, que le mot de passe est correct (comparaison avec hash bcrypt), et que `emailVerified: true`. Si toutes les conditions sont remplies, le système génère un JWT access token (durée 15 minutes) contenant userId, email, role, et un refresh token (durée 7 jours, stocké en base de données avec référence utilisateur). Les tokens doivent être retournés dans des cookies HTTP-only, Secure (HTTPS uniquement en production), SameSite=Strict.

**REQ-004 : Gestion des tokens JWT**  
Le JWT access token doit contenir les claims : userId, email, role, iat (issued at), exp (expiration). Le token doit être signé avec une clé secrète stockée en variable d'environnement (minimum 256 bits). Chaque requête API protégée doit valider le token et extraire les informations utilisateur. En cas de token invalide ou expiré, retourner HTTP 401 Unauthorized.

**REQ-005 : Rafraîchissement de token**  
Le système doit exposer un endpoint `/api/auth/refresh` qui accepte le refresh token (depuis cookie HTTP-only). Le système valide le refresh token, vérifie qu'il existe en base de données et n'est pas révoqué, et génère un nouveau access token. Si le refresh token est invalide, expiré ou révoqué, retourner HTTP 401 et demander une nouvelle connexion.

**REQ-006 : Réinitialisation de mot de passe - Demande**  
Le système doit exposer un endpoint `/api/auth/forgot-password` qui accepte une adresse email. Si l'email existe en base, invalider tous les tokens de réinitialisation précédents pour cet utilisateur, générer un nouveau token de réinitialisation unique avec expiration 1 heure, le stocker en base associé à l'utilisateur, et envoyer un email avec lien vers `/reset-password?token=XXX`. Si l'email n'existe pas, retourner le même message de succès pour ne pas révéler l'existence du compte.

**REQ-007 : Réinitialisation de mot de passe - Exécution**  
Le système doit exposer un endpoint `/api/auth/reset-password` qui accepte un token et un nouveau mot de passe. Valider le token, vérifier qu'il n'est pas expiré, vérifier que le nouveau mot de passe respecte les critères de sécurité, hasher le nouveau mot de passe, mettre à jour en base, invalider le token de réinitialisation, et retourner un succès.

**REQ-008 : Contrôle d'accès basé sur les rôles**  
Le système doit implémenter trois rôles minimum : STUDENT, INSTRUCTOR, ADMIN. Chaque endpoint API protégé doit vérifier que l'utilisateur authentifié possède le rôle requis. Par exemple, seuls les ADMIN peuvent accéder à `/api/admin/*`, les INSTRUCTOR peuvent créer des cours, tous les utilisateurs authentifiés peuvent accéder à leur profil.

**REQ-009 : Protection des routes frontend**  
L'application React doit implémenter une vérification d'authentification avant d'afficher les routes protégées (comme `/dashboard`, `/profile`, `/courses/create`). Si l'utilisateur n'est pas authentifié (pas de token valide), rediriger vers `/login` avec un message approprié. L'état d'authentification doit être géré globalement (React Context ou Redux).

**REQ-010 : Tableau de bord utilisateur**  
Après connexion réussie, l'utilisateur doit être redirigé vers `/dashboard`. Le tableau de bord doit afficher : nom complet, email, rôle, date d'inscription. Le contenu du tableau de bord doit varier selon le rôle :
- **STUDENT** : Mes cours inscrits, Progression, Certificats
- **INSTRUCTOR** : Mes cours créés, Statistiques d'engagement, Créer un cours
- **ADMIN** : Statistiques globales, Gestion utilisateurs, Gestion contenus

**REQ-011 : Déconnexion**  
Le système doit exposer un endpoint `/api/auth/logout` qui invalide le refresh token en base (suppression ou marque comme révoqué), supprime les cookies contenant les tokens, et retourne un succès. L'utilisateur est ensuite redirigé vers la page de connexion.

**REQ-012 : Renvoi d'email de vérification**  
Le système doit exposer un endpoint `/api/auth/resend-verification` permettant à un utilisateur avec compte non vérifié de demander un nouvel email de vérification. Générer un nouveau token, invalider l'ancien, et envoyer l'email.

**REQ-013 : Protection contre les attaques par force brute**  
Le système doit limiter les tentatives de connexion à 5 par période de 15 minutes par adresse email. Après 5 échecs, bloquer temporairement le compte pendant 30 minutes. Stocker les tentatives en base ou en cache (Redis recommandé).

### User Interface Requirements

**UI-001 : Page d'inscription (`/register`)**  
Formulaire contenant : Nom complet (input text), Email (input email), Mot de passe (input password avec indicateur de force), Confirmation mot de passe (input password), Rôle souhaité (radio buttons : Étudiant / Instructeur), Bouton "S'inscrire", Lien vers page de connexion. Affichage des messages d'erreur en français sous chaque champ concerné. Validation côté client (email format, mot de passe complexité, correspondance mots de passe) avant envoi.

**UI-002 : Page de connexion (`/login`)**  
Formulaire contenant : Email (input email), Mot de passe (input password), Case à cocher "Se souvenir de moi" (optionnel, prolonge durée refresh token), Bouton "Se connecter", Lien "Mot de passe oublié ?", Lien "Créer un compte". Affichage des messages d'erreur génériques en français.

**UI-003 : Page mot de passe oublié (`/forgot-password`)**  
Formulaire contenant : Email (input email), Bouton "Envoyer le lien de réinitialisation", Lien retour vers connexion. Message de confirmation après envoi (sans révéler si email existe).

**UI-004 : Page de réinitialisation (`/reset-password`)**  
Formulaire contenant : Nouveau mot de passe (input password avec indicateur de force), Confirmation nouveau mot de passe (input password), Bouton "Réinitialiser le mot de passe". Le token est dans l'URL. Validation des critères de mot de passe. Message de succès avec redirection automatique vers login.

**UI-005 : Page de vérification d'email (`/verify-email`)**  
Page déclenchée par le clic sur le lien dans l'email. Affiche un loader pendant la vérification, puis soit un message de succès "Votre email a été vérifié avec succès ! Vous pouvez maintenant vous connecter." avec bouton vers login, soit un message d'erreur "Le lien de vérification est invalide ou a expiré." avec lien pour demander un nouveau.

**UI-006 : Tableau de bord (`/dashboard`)**  
Navigation avec menu (Tableau de bord, Mon profil, Mes cours, Déconnexion). Section principale affichant :
- En-tête : "Bienvenue [Nom de l'utilisateur]"
- Carte d'information : Nom complet, Email, Rôle, Membre depuis [Date]
- Section spécifique au rôle (voir REQ-010)
- Design moderne, responsive, utilisant une librairie UI (Material-UI, Ant Design, ou Tailwind CSS)

**UI-007 : Gestion de l'état d'authentification**  
Utiliser React Context (AuthContext) ou Redux pour gérer l'état d'authentification global. Le contexte doit contenir : `user` (objet avec userId, email, role, fullName), `isAuthenticated` (boolean), `isLoading` (boolean), fonctions `login()`, `logout()`, `refreshToken()`. Tous les composants peuvent accéder à cet état via `useAuth()` hook.

**UI-008 : Composant ProtectedRoute**  
Créer un composant wrapper `ProtectedRoute` qui vérifie si l'utilisateur est authentifié avant de rendre un composant. Si non authentifié, rediriger vers `/login` et stocker l'URL de destination pour rediriger après connexion réussie.

### Integration Requirements

**INT-001 : Service d'envoi d'emails**  
Le système doit intégrer un service d'envoi d'emails transactionnels (SendGrid, Mailgun, AWS SES, ou serveur SMTP). Les emails doivent être en français, avec templates HTML professionnels incluant : logo de la plateforme, message clair, bouton d'action visible, footer avec lien de contact et de désinscription. Gérer les erreurs d'envoi et logger les échecs.

**INT-002 : Base de données PostgreSQL via Prisma**  
Le système doit utiliser Prisma ORM pour gérer les interactions avec PostgreSQL. Créer les modèles Prisma pour : User, RefreshToken, PasswordResetToken, EmailVerificationToken. Utiliser les migrations Prisma pour gérer le schéma de base de données. Configurer la connexion via variable d'environnement `DATABASE_URL`.

**INT-003 : Gestion des secrets et configuration**  
Toutes les informations sensibles doivent être stockées en variables d'environnement : `JWT_SECRET`, `REFRESH_TOKEN_SECRET`, `DATABASE_URL`, `EMAIL_SERVICE_API_KEY`, `FRONTEND_URL`, `BACKEND_URL`. Utiliser un fichier `.env` (non versionné) et `.env.example` (versionné comme template).

---

## Success Criteria

- [ ] Un nouvel utilisateur peut s'inscrire et recevoir un email de vérification en moins de 5 secondes
- [ ] Un utilisateur vérifié peut se connecter et accéder à son tableau de bord en moins de 3 secondes
- [ ] 100% des mots de passe sont hashés avec bcrypt avant stockage (aucun mot de passe en clair)
- [ ] Les tentatives d'accès non autorisées aux routes protégées sont bloquées avec redirection vers login
- [ ] Le système supporte 100 utilisateurs simultanés sans dégradation de performance
- [ ] Les tokens JWT expirent correctement et le rafraîchissement automatique fonctionne sans interruption pour l'utilisateur
- [ ] Les emails de vérification et de réinitialisation sont reçus dans les 2 minutes suivant la demande
- [ ] Tous les messages d'interface utilisateur sont en français correct
- [ ] Le processus de réinitialisation de mot de passe fonctionne dans 100% des cas avec un token valide
- [ ] Les comptes sont protégés contre les attaques par force brute (blocage après 5 tentatives)
- [ ] L'expérience utilisateur est fluide sur desktop et mobile (design responsive)

---

## Key Entities

### User

**Purpose** : Représente un utilisateur de la plateforme avec ses informations d'authentification et d'autorisation.

**Key Attributes** :
- `id` : UUID, identifiant unique
- `email` : String, unique, format email valide
- `password_hash` : String, hash bcrypt du mot de passe
- `full_name` : String, nom complet de l'utilisateur
- `role` : Enum (STUDENT, INSTRUCTOR, ADMIN), rôle de l'utilisateur
- `email_verified` : Boolean, statut de vérification de l'email
- `is_active` : Boolean, compte actif ou désactivé
- `created_at` : Timestamp, date de création du compte
- `updated_at` : Timestamp, dernière mise à jour
- `last_login` : Timestamp, dernière connexion réussie
- `failed_login_attempts` : Integer, nombre de tentatives échouées
- `locked_until` : Timestamp nullable, date de fin de blocage temporaire

**Relationships** :
- Un User peut avoir plusieurs RefreshToken (one-to-many)
- Un User peut avoir un PasswordResetToken actif (one-to-one)
- Un User peut avoir un EmailVerificationToken actif (one-to-one)

### RefreshToken

**Purpose** : Stocke les tokens de rafraîchissement pour permettre le renouvellement des access tokens sans nouvelle authentification.

**Key Attributes** :
- `id` : UUID, identifiant unique
- `token` : String, unique, le token de rafraîchissement (hash ou UUID)
- `user_id` : UUID, référence vers User
- `expires_at` : Timestamp, date d'expiration
- `created_at` : Timestamp, date de création
- `revoked` : Boolean, indique si le token a été révoqué
- `revoked_at` : Timestamp nullable, date de révocation
- `device_info` : String nullable, information sur le device (user-agent)

**Relationships** :
- Un RefreshToken appartient à un User (many-to-one)

### PasswordResetToken

**Purpose** : Stocke les tokens temporaires pour la réinitialisation de mot de passe.

**Key Attributes** :
- `id` : UUID, identifiant unique
- `token` : String, unique, le token de réinitialisation
- `user_id` : UUID, référence vers User
- `expires_at` : Timestamp, date d'expiration (1 heure après création)
- `created_at` : Timestamp, date de création
- `used` : Boolean, indique si le token a été utilisé

**Relationships** :
- Un PasswordResetToken appartient à un User (many-to-one)

### EmailVerificationToken

**Purpose** : Stocke les tokens temporaires pour la vérification d'email.

**Key Attributes** :
- `id` : UUID, identifiant unique
- `token` : String, unique, le token de vérification
- `user_id` : UUID, référence vers User
- `expires_at` : Timestamp, date d'expiration (24 heures après création)
- `created_at` : Timestamp, date de création
- `used` : Boolean, indique si le token a été utilisé

**Relationships** :
- Un EmailVerificationToken appartient à un User (many-to-one)

---

## Assumptions & Dependencies

### Assumptions

- L'infrastructure serveur supporte Node.js v18+ et PostgreSQL 14+
- Le service d'envoi d'emails est configuré et opérationnel avant la mise en production
- Les utilisateurs ont accès à leur boîte email pour vérifier leur compte
- Le frontend est hébergé sur un domaine avec HTTPS en production (requis pour cookies Secure)
- Le backend et frontend peuvent communiquer (CORS configuré correctement)
- Les utilisateurs utilisent des navigateurs modernes supportant les cookies HTTP-only et JavaScript

### Dependencies

- **Prisma ORM** : Pour la gestion de la base de données PostgreSQL
- **bcrypt** : Pour le hashing des mots de passe
- **jsonwebtoken** : Pour la génération et validation des JWT
- **Service d'email** : SendGrid, Mailgun, AWS SES ou SMTP pour l'envoi d'emails
- **React** : Framework frontend avec TypeScript
- **React Router** : Pour la gestion des routes côté client
- **Axios ou Fetch** : Pour les appels API
- **React Context API ou Redux** : Pour la gestion de l'état d'authentification
- **Librairie UI** : Material-UI, Ant Design, ou Tailwind CSS pour l'interface
- **Express.js ou Nest.js** : Framework backend Node.js
- **cookie-parser** : Pour la gestion des cookies côté serveur
- **validator** : Pour la validation des inputs (email, etc.)
- **Redis** (optionnel mais recommandé) : Pour le stockage en cache des tentatives de connexion

---

## Out of Scope

- OAuth2 / connexion via réseaux sociaux (Google, Facebook, LinkedIn) - sera implémenté dans une future version
- Authentification à deux facteurs (2FA) - sera implémenté dans une future version
- Gestion avancée des sessions (multiple devices, voir toutes les sessions actives) - sera implémenté dans une future version
- API publique pour développeurs tiers - sera implémenté dans une future version
- Audit trail complet des actions utilisateurs - sera implémenté dans une future version
- Fonctionnalités de profil utilisateur avancées (photo de profil, biographie, réseaux sociaux) - sera implémenté après ce module
- Système de permissions granulaires au-delà des 3 rôles de base - sera implémenté après ce module
- Internationalisation multi-langues - cette version est uniquement en français
- Gestion des organisations et comptes entreprises - sera implémenté après les fonctionnalités de base

---

## Security & Compliance Considerations

### Sécurité des Mots de Passe

- Les mots de passe doivent être hashés avec bcrypt (salt factor minimum 10, recommandé 12)
- Aucun mot de passe ne doit être stocké en clair, même temporairement
- Les mots de passe doivent respecter une complexité minimale (8 caractères, majuscule, minuscule, chiffre, caractère spécial)
- Les messages d'erreur ne doivent pas révéler si un email existe dans le système

### Sécurité des Tokens

- Les JWT access tokens doivent avoir une durée de vie courte (15 minutes maximum)
- Les refresh tokens doivent être stockés de manière sécurisée en base de données avec possibilité de révocation
- Les tokens doivent être transmis via cookies HTTP-only pour prévenir les attaques XSS
- Les cookies doivent avoir les flags Secure (HTTPS only) et SameSite=Strict pour prévenir les attaques CSRF
- Les secrets JWT doivent être robustes (minimum 256 bits) et stockés en variables d'environnement

### Protection contre les Attaques

- **Force brute** : Limiter les tentatives de connexion (5 échecs = blocage 30 minutes)
- **XSS** : Sanitization des inputs utilisateurs, utilisation de HTTP-only cookies pour les tokens
- **CSRF** : Utilisation de SameSite cookies, validation de l'origine des requêtes
- **SQL Injection** : Utilisation de Prisma ORM avec prepared statements
- **Timing attacks** : Utiliser des réponses avec temps constant pour ne pas révéler l'existence d'emails

### RGPD et Confidentialité

- Les utilisateurs doivent pouvoir accéder à leurs données personnelles
- Les utilisateurs doivent pouvoir supprimer leur compte (à implémenter dans un module futur)
- Les emails de vérification et réinitialisation doivent inclure une mention de confidentialité
- Les logs ne doivent jamais contenir de mots de passe ou tokens en clair

### Transport et Stockage

- HTTPS obligatoire en production
- Les variables d'environnement ne doivent jamais être versionnées
- Les clés secrètes doivent être générées aléatoirement et uniques par environnement
- Les sauvegardes de base de données doivent être chiffrées

---

## Acceptance Criteria

### Scenario 1 : Inscription et Vérification Réussie

**Given** un nouvel utilisateur visite la page d'inscription  
**When** il remplit le formulaire avec des informations valides (email unique, mot de passe conforme) et soumet  
**Then** le système crée le compte, envoie un email de vérification, et affiche "Inscription réussie ! Veuillez vérifier votre email."  
**And When** l'utilisateur clique sur le lien dans l'email  
**Then** le système marque le compte comme vérifié et affiche "Email vérifié avec succès !"  
**And** l'utilisateur peut maintenant se connecter

### Scenario 2 : Connexion Réussie avec Redirection vers Dashboard

**Given** un utilisateur avec compte vérifié visite la page de connexion  
**When** il saisit son email et mot de passe corrects et clique sur "Se connecter"  
**Then** le système génère les tokens JWT, les stocke dans des cookies HTTP-only, redirige vers `/dashboard`  
**And** le tableau de bord affiche son nom complet, email, rôle, et date d'inscription

### Scenario 3 : Tentative de Connexion avec Compte Non Vérifié

**Given** un utilisateur avec compte non vérifié tente de se connecter  
**When** il saisit ses identifiants corrects  
**Then** le système refuse la connexion et affiche "Veuillez vérifier votre adresse email. Un nouveau lien de vérification a été envoyé."  
**And** un nouvel email de vérification est envoyé automatiquement

### Scenario 4 : Réinitialisation de Mot de Passe Réussie

**Given** un utilisateur a oublié son mot de passe  
**When** il clique sur "Mot de passe oublié ?", saisit son email, et soumet  
**Then** le système envoie un email avec lien de réinitialisation  
**And When** l'utilisateur clique sur le lien et saisit un nouveau mot de passe valide  
**Then** le système met à jour le mot de passe et affiche "Mot de passe réinitialisé avec succès !"  
**And** l'utilisateur peut se connecter avec le nouveau mot de passe

### Scenario 5 : Rafraîchissement Automatique du Token

**Given** un utilisateur est connecté et navigue sur la plateforme  
**When** son access token expire (après 15 minutes)  
**And** il effectue une action nécessitant une requête API  
**Then** l'application détecte l'expiration, utilise automatiquement le refresh token pour obtenir un nouveau access token  
**And** l'action de l'utilisateur est exécutée sans interruption visible

### Scenario 6 : Protection des Routes Non Authentifiées

**Given** un visiteur non connecté tente d'accéder directement à `/dashboard` via l'URL  
**When** la page tente de se charger  
**Then** l'application détecte l'absence d'authentification et redirige vers `/login`  
**And** affiche le message "Vous devez vous connecter pour accéder à cette page"

### Scenario 7 : Protection contre Force Brute

**Given** un attaquant tente de forcer un compte  
**When** il échoue 5 tentatives de connexion consécutives en 15 minutes  
**Then** le système bloque temporairement le compte pendant 30 minutes  
**And** affiche "Trop de tentatives de connexion. Votre compte est temporairement bloqué."

### Scenario 8 : Déconnexion Réussie

**Given** un utilisateur est connecté  
**When** il clique sur "Déconnexion"  
**Then** le système révoque le refresh token, supprime les cookies, et redirige vers `/login`  
**And** l'utilisateur ne peut plus accéder aux routes protégées

### Scenario 9 : Affichage du Dashboard selon le Rôle

**Given** trois utilisateurs connectés avec des rôles différents (STUDENT, INSTRUCTOR, ADMIN)  
**When** chacun accède à `/dashboard`  
**Then** chaque utilisateur voit un contenu personnalisé selon son rôle :
- STUDENT voit ses cours inscrits et sa progression
- INSTRUCTOR voit ses cours créés et peut créer un nouveau cours
- ADMIN voit les statistiques globales et les liens de gestion

---

## Clarifications

### Session 2025-11-12

- Q: Que se passe-t-il lorsqu'un utilisateur demande plusieurs réinitialisations de mot de passe avant d'utiliser le premier token ? → A: Invalider tous les tokens précédents et créer un nouveau token (Option B). Cette approche garantit la sécurité en évitant la réutilisation de tokens obsolètes et aligne le comportement avec REQ-012 (renvoi de vérification email).

## Open Questions

Toutes les questions ont été résolues en utilisant les bonnes pratiques de sécurité et d'expérience utilisateur standard.

---

## Appendix

### References

- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
- [JWT Best Practices](https://tools.ietf.org/html/rfc8725)
- [Prisma Documentation](https://www.prisma.io/docs)
- [React Context API](https://react.dev/reference/react/useContext)
- ImmoTopia Project Constitution (.cursorrules)

### Change Log

| Date | Author | Change |
|------|--------|--------|
| 2025-11-12 | ImmoTopia Platform Team | Initial draft - Complete authentication & login module specification |

---

## Données de Test (Seed)

Pour faciliter les tests et la validation, les comptes suivants doivent être créés via un script de seed Prisma :

### Admin Account
- **Email** : admin@immotopia.com
- **Password** : Admin@123456
- **Full Name** : Administrateur Principal
- **Role** : ADMIN
- **Email Verified** : true

### Instructor Account
- **Email** : instructeur@immotopia.com
- **Password** : Instructor@123456
- **Full Name** : Jean Dupont
- **Role** : INSTRUCTOR
- **Email Verified** : true

### Student Account
- **Email** : etudiant@immotopia.com
- **Password** : Student@123456
- **Full Name** : Marie Martin
- **Role** : STUDENT
- **Email Verified** : true

**Note** : Ces mots de passe doivent être hashés avec bcrypt avant insertion. Ces comptes sont uniquement pour les environnements de développement et test, **jamais en production**.
