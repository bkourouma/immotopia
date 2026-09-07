# API Documentation: Authentication & Login Module

**Version**: 1.0.0  
**Base URL**: `http://localhost:8000/api` (development)  
**Base URL**: `https://api.immotopia.com/api` (production)

---

## Authentication

L'API utilise des cookies HTTP-only pour stocker les tokens JWT. Les cookies sont automatiquement envoyés par le navigateur avec chaque requête.

- **Access Token** : Stocké dans le cookie `accessToken`, expire après 15 minutes
- **Refresh Token** : Stocké dans le cookie `refreshToken`, expire après 7 jours

---

## Endpoints

### 1. Inscription

**POST** `/api/auth/register`

Crée un nouveau compte utilisateur.

**Body**:
```json
{
  "email": "user@example.com",
  "password": "Password@123",
  "confirmPassword": "Password@123",
  "fullName": "Jean Dupont",
  "role": "STUDENT"
}
```

**Response** (201):
```json
{
  "success": true,
  "message": "Inscription réussie ! Veuillez vérifier votre email.",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "full_name": "Jean Dupont",
    "role": "STUDENT",
    "email_verified": false
  }
}
```

**Rate Limit**: 3 tentatives par heure

---

### 2. Vérification d'email

**GET** `/api/auth/verify-email?token=XXX`

Vérifie l'adresse email d'un utilisateur avec le token reçu par email.

**Query Parameters**:
- `token` (string, required) : Token de vérification

**Response** (200):
```json
{
  "success": true,
  "message": "Email vérifié avec succès !",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "full_name": "Jean Dupont",
    "role": "STUDENT",
    "email_verified": true
  }
}
```

---

### 3. Renvoi de vérification d'email

**POST** `/api/auth/resend-verification`

Renvoye un email de vérification.

**Body**:
```json
{
  "email": "user@example.com"
}
```

**Response** (200):
```json
{
  "success": true,
  "message": "Si cette adresse email existe et n'est pas encore vérifiée, un nouvel email de vérification a été envoyé."
}
```

**Rate Limit**: 3 tentatives par heure

---

### 4. Connexion

**POST** `/api/auth/login`

Authentifie un utilisateur et retourne des tokens JWT dans des cookies HTTP-only.

**Body**:
```json
{
  "email": "user@example.com",
  "password": "Password@123"
}
```

**Response** (200) - Cookies:
- `accessToken` (HTTP-only, Secure, SameSite=Strict, 15 min)
- `refreshToken` (HTTP-only, Secure, SameSite=Strict, 7 jours)

```json
{
  "success": true,
  "message": "Connexion réussie.",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "full_name": "Jean Dupont",
    "role": "STUDENT",
    "email_verified": true
  }
}
```

**Rate Limit**: 5 tentatives par 15 minutes  
**Brute Force Protection**: Compte bloqué pendant 30 minutes après 5 échecs

---

### 5. Rafraîchir le token

**POST** `/api/auth/refresh`

Rafraîchit le token d'accès à partir du refresh token.

**Response** (200) - Cookie:
- `accessToken` (nouveau token, 15 min)

```json
{
  "success": true,
  "message": "Token rafraîchi avec succès."
}
```

---

### 6. Obtenir l'utilisateur actuel

**GET** `/api/auth/me`

Récupère les informations de l'utilisateur authentifié.

**Authentication**: Requis (cookie `accessToken`)

**Response** (200):
```json
{
  "success": true,
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "full_name": "Jean Dupont",
    "role": "STUDENT",
    "email_verified": true,
    "is_active": true,
    "created_at": "2025-11-12T10:00:00.000Z",
    "updated_at": "2025-11-12T10:00:00.000Z",
    "last_login": "2025-11-12T10:30:00.000Z"
  }
}
```

---

### 7. Déconnexion

**POST** `/api/auth/logout`

Révoque le refresh token et supprime les cookies.

**Response** (200):
```json
{
  "success": true,
  "message": "Déconnexion réussie."
}
```

---

### 8. Mot de passe oublié

**POST** `/api/auth/forgot-password`

Envoie un email de réinitialisation de mot de passe.

**Body**:
```json
{
  "email": "user@example.com"
}
```

**Response** (200):
```json
{
  "success": true,
  "message": "Si cette adresse email existe, un email de réinitialisation de mot de passe a été envoyé."
}
```

**Rate Limit**: 3 tentatives par heure

---

### 9. Réinitialisation de mot de passe

**POST** `/api/auth/reset-password`

Réinitialise le mot de passe avec un token.

**Body**:
```json
{
  "token": "reset-token-from-email",
  "newPassword": "NewPassword@123",
  "confirmPassword": "NewPassword@123"
}
```

**Response** (200):
```json
{
  "success": true,
  "message": "Mot de passe réinitialisé avec succès ! Vous pouvez maintenant vous connecter."
}
```

---

## Codes d'erreur

- **400** : Requête invalide (validation échouée)
- **401** : Non authentifié (token manquant ou invalide)
- **403** : Accès refusé (permissions insuffisantes)
- **404** : Ressource non trouvée
- **409** : Conflit (ressource déjà existe)
- **429** : Trop de tentatives (rate limit dépassé)
- **500** : Erreur serveur

---

## Exemples d'erreurs

**Validation Error** (400):
```json
{
  "success": false,
  "message": "Les données fournies sont invalides.",
  "errors": [
    {
      "field": "email",
      "message": "Veuillez entrer une adresse email valide"
    }
  ]
}
```

**Authentication Error** (401):
```json
{
  "success": false,
  "message": "Token d'accès manquant. Veuillez vous connecter."
}
```

**Rate Limit Error** (429):
```json
{
  "success": false,
  "message": "Trop de tentatives. Veuillez réessayer dans quelques instants."
}
```

---

## Notes de sécurité

1. Tous les tokens sont stockés dans des cookies HTTP-only (protection XSS)
2. Les cookies sont sécurisés en production (flag `Secure` uniquement sur HTTPS)
3. SameSite=Strict pour protection CSRF
4. Rate limiting sur tous les endpoints sensibles
5. Protection brute force (5 échecs = blocage 30 min)
6. Mots de passe hashés avec bcrypt (salt factor 12)
7. Refresh tokens hashés avant stockage en base (SHA-256)

---

**Dernière mise à jour** : 2025-11-12

