# Audit de sécurité du 9 novembre 2026

## Synthèse pour le propriétaire du produit

- Nous avons passé l'application au crible, sans rien modifier, sur quatre sujets : connexion et configuration, séparation entre agences, fichiers et paiement, site web et serveurs.
- Résultat : aucune faille « critique », mais 7 failles graves (« élevées ») et 16 moyennes, plus 25 faibles. Les plus sérieuses : un fichier piégé déposé sur un bien pouvait attaquer les visiteurs ; une agence pouvait rattacher un bien d'une autre agence ; un gestionnaire pouvait se nommer administrateur ; le compte super-administrateur du site de test était connu et visible.
- Presque tout ce qui relève du code est corrigé dans cette PR, sans changement de base de données (donc sans migration).
- Vous devez agir vous-même sur 10 points (section 6) : changer le mot de passe du super-administrateur du site de test et le fermer au public, activer la revue obligatoire sur GitHub, poser une protection HTTPS dans les serveurs, changer une clé Twilio exposée, lancer le script qui repère les fichiers suspects avant la mise en ligne, relire les fichiers de configuration réels.
- Restent différés : la double authentification (MFA), la refonte de l'inscription, plusieurs mises à jour de bibliothèques qui changent de version majeure, et le passage de la garde d'isolation en mode bloquant.
- Plusieurs règles métier ont été choisies par prudence : elles sont à valider (section 4).

## 1. Périmètre et méthode

- Base auditée : `origin/main` au commit `aa857a25`, le 2026-11-09.
- Quatre territoires audités en lecture seule :
  1. authentification et configuration ;
  2. isolation entre agences et portails ;
  3. fichiers, paiement, injection, IA ;
  4. front, infrastructure, dépendances.
- Correctifs ensuite livrés en 7 lots sur une branche d'intégration (`orch/2026-11-09-audit-securite`), sans migration de schéma : lot 1 (connexion, sessions, journaux, CSRF), lot 2 (fichiers téléversés, DOCX), lot 3 (isolation, droits), lot 4 (configuration, paiement, e-mail), lot 5 (front), lot 6 (infrastructure, CI, dépendances, graines de données), lot 7 (reliquats, traductions, classeur des fonctionnalités, documentation).
- Chaque lot a été relu par un vérificateur indépendant ; les lots 1 à 4 et 6 ont eu au moins un aller-retour de corrections, et le lot 2 une seconde vérification.
- Les statuts du tableau ont été recoupés avec le code du lot 7 pour les points principaux (voir le rapport de remise pour ce qui n'a pas été relu).

## 2. Synthèse chiffrée

Décompte recompté dans `constats.md` : 0 critique, 7 élevées, 16 moyennes, 25 faibles, soit 48 constats numérotés (AUTH 11, SUR 11, FRI 19, TEN 7), plus un lot de constats mineurs regroupés (TEN-M).

| Famille   | Critique | Élevée | Moyenne | Faible |  Total |
| --------- | -------: | -----: | ------: | -----: | -----: |
| AUTH      |        0 |      1 |       3 |      7 |     11 |
| SUR       |        0 |      1 |       3 |      7 |     11 |
| FRI       |        0 |      2 |       7 |     10 |     19 |
| TEN       |        0 |      3 |       3 |      1 |      7 |
| **Total** |    **0** |  **7** |  **16** | **25** | **48** |

Les sept élevées : AUTH-01, SUR-01, FRI-01, FRI-02, TEN-01, TEN-02, TEN-04.

Répartition par statut (48 constats) :

| Statut                         | Nombre |
| ------------------------------ | -----: |
| Corrigé dans cette PR          |     29 |
| Partiellement corrigé          |     13 |
| Différé                        |      4 |
| Action requise du propriétaire |      2 |

## 3. Tableau des constats

Légende des statuts : « corrigé » = corrigé dans cette PR ; « partiel » = partiellement corrigé ; « différé » = non traité, recommandation ; « action » = action requise du propriétaire.

### AUTH : authentification et configuration

| ID      | Gravité | Titre court                                                            | Statut  | Note                                                                                                           |
| ------- | ------- | ---------------------------------------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------- |
| AUTH-01 | Élevée  | Limiteurs de connexion contournables en IPv6, pas de verrou e-mail     | partiel | Verrou dur par (e-mail, IP/64) et global à 15 s, gardé en mémoire (H4) : se vide au redémarrage                |
| AUTH-02 | Moyenne | Pas de double authentification (MFA/TOTP)                              | différé | Migration et écran nécessaires (voir section 5)                                                                |
| AUTH-03 | Moyenne | Messages d'erreur bruts à la connexion, vérification, réinitialisation | corrigé |                                                                                                                |
| AUTH-04 | Moyenne | Jeton de vérification d'e-mail tracé dans les journaux et nginx        | corrigé | Masque de jeton dans les journaux API et dans nginx                                                            |
| AUTH-05 | Faible  | Pas de contrôle Origin / Sec-Fetch-Site sur les méthodes non sûres     | corrigé | `express.urlencoded` global conservé (mode réel du PSP non validé)                                             |
| AUTH-06 | Faible  | SPA sans CSP ni HSTS                                                   | partiel | CSP en Report-Only et Permissions-Policy posées ; HSTS à poser à la main dans les blocs 443                    |
| AUTH-07 | Faible  | Différence de temps de réponse forgot-password / resend                | corrigé |                                                                                                                |
| AUTH-08 | Faible  | JWT non révocable, durée non bornée                                    | partiel | Durée bornée à 30 min et unité obligatoire ; le JWT reste non révocable avant expiration                       |
| AUTH-09 | Faible  | Pré-détournement de compte à l'inscription                             | partiel | Mitigation minimale seulement ; refonte du flux différée                                                       |
| AUTH-10 | Faible  | Rafraîchissement de session non atomique                               | corrigé | Risque accepté : jeton révoqué dans les 5 s suivant une autre session peut obtenir un accessToken sans refresh |
| AUTH-11 | Faible  | Hygiène de configuration (NODE_ENV, process.env, cookie, select)       | corrigé | Cookie de rafraîchissement limité à `/api/auth` ; à confirmer derrière nginx en staging                        |

### SUR : fichiers, paiement, injection

| ID     | Gravité | Titre court                                                  | Statut  | Note                                                                               |
| ------ | ------- | ------------------------------------------------------------ | ------- | ---------------------------------------------------------------------------------- |
| SUR-01 | Élevée  | XSS stockée via les médias de bien (même origine)            | corrigé | Fichiers déjà déposés : lancer le script d'inventaire (section 7)                  |
| SUR-02 | Moyenne | Paiement confirmé sans montant considéré comme encaissé      | corrigé | Échec fermé (REVIEW) ; mode réel PaySecureHub à valider                            |
| SUR-03 | Moyenne | DOCX non borné (zip bomb)                                    | corrigé | Seconde vérification active : 150 000 mutations sans divergence                    |
| SUR-04 | Moyenne | Signature de fichier non contrôlée sur la plupart des dépôts | corrigé | Contrôle du type réel, extension dérivée du type détecté                           |
| SUR-05 | Faible  | Secrets lus hors `env.ts`                                    | partiel | Variables `WHATSAPP_GROUP_*` encore lues directement : non déclarées dans `env.ts` |
| SUR-06 | Faible  | Jetons dans les URL journalisées (newsletter)                | corrigé | Même correctif qu'AUTH-04                                                          |
| SUR-07 | Faible  | Variables non échappées dans le HTML des campagnes           | corrigé |                                                                                    |
| SUR-08 | Faible  | Simulateur de passerelle de paiement disponible              | corrigé |                                                                                    |
| SUR-09 | Faible  | `decodeURIComponent` sans garde sur `/uploads`               | corrigé | 404 au lieu d'une erreur                                                           |
| SUR-10 | Faible  | Verrou de tâches planifiées qui s'ouvre en cas de panne      | corrigé | Échec fermé pour les tâches financières                                            |
| SUR-11 | Faible  | Téléversements mémoire sans limite de fichiers ni de champs  | corrigé | Pas de limiteur de débit dédié aux uploads (section 5)                             |

### FRI : front, infrastructure, dépendances

| ID     | Gravité | Titre court                                                        | Statut  | Note                                                                                                                         |
| ------ | ------- | ------------------------------------------------------------------ | ------- | ---------------------------------------------------------------------------------------------------------------------------- |
| FRI-01 | Élevée  | Super-admin et comptes de démo connus, visibles sur le staging     | action  | Code : groupe plateforme retiré du menu, refus en production, documents purgés. Reste : mot de passe et fermeture du staging |
| FRI-02 | Élevée  | Paquets vulnérables (body-parser, compression, qs, proxy-addr)     | corrigé | Reste un `npm audit` à 1 critique, 3 élevées, 4 moyennes (majeures : tar, exceljs, nodemailer, zod, uuid, react-router)      |
| FRI-03 | Moyenne | Redirection ouverte à la connexion                                 | corrigé |                                                                                                                              |
| FRI-04 | Moyenne | CSRF sur les méthodes non sûres (= AUTH-05)                        | corrigé |                                                                                                                              |
| FRI-05 | Moyenne | Node 20 en fin de vie                                              | partiel | Passage à Node 22 dans les Dockerfile et la CI ; `docker build` non testé (docker indisponible)                              |
| FRI-06 | Moyenne | `TENANT_GUARD_MODE=warn` livré                                     | partiel | Avertissement ajouté à `deploy.sh` ; le passage en `enforce` reste une décision d'exploitation                               |
| FRI-07 | Moyenne | Pas de Code Owners ni de revue obligatoire                         | partiel | `.github/CODEOWNERS` créé ; la règle de branche GitHub est à activer par le propriétaire                                     |
| FRI-08 | Moyenne | nodemailer 6.10.1 (nombreux avis)                                  | partiel | Validation des adresses à l'entrée ; montée en 10.x différée                                                                 |
| FRI-09 | Moyenne | zod 3.25 (déni de service mémoire)                                 | différé | Zod 4 : migration majeure ; limite globale `express.json` toujours à 10 Mo                                                   |
| FRI-10 | Faible  | En-têtes de sécurité de la SPA (= AUTH-06)                         | partiel | Voir AUTH-06                                                                                                                 |
| FRI-11 | Faible  | `localStorage` non purgé à la déconnexion                          | corrigé | La clé de langue est volontairement conservée                                                                                |
| FRI-12 | Faible  | CI sans `permissions`, actions par tag, pas de dependabot          | partiel | `permissions` et `dependabot.yml` ajoutés ; actions et images non épinglées par SHA                                          |
| FRI-13 | Faible  | Postgres exposé sur toutes les interfaces, mot de passe par défaut | corrigé | `127.0.0.1` et `POSTGRES_PASSWORD` obligatoire dans le `docker-compose.yml` racine                                           |
| FRI-14 | Faible  | Durcissement des conteneurs                                        | partiel | `no-new-privileges` posé ; `cap_drop`, limites mémoire/CPU et nginx non privilégié non posés                                 |
| FRI-15 | Faible  | Sauvegardes en clair et `.env` rapatrié                            | partiel | `.env` rapatrié seulement avec `--with-env` ; sauvegardes toujours non chiffrées                                             |
| FRI-16 | Faible  | Graines et scripts de démo sans garde de production                | corrigé | Y compris `syndic-demo-seed.ts` (lot 7)                                                                                      |
| FRI-17 | Faible  | SID Twilio et IP serveur dans les documents                        | action  | Documents purgés ; le SID reste dans l'historique git : rotation à faire                                                     |
| FRI-18 | Faible  | Montées de patch du lockfile                                       | corrigé | Lockfile régénéré en Node 24 / npm 11 : à confirmer par la CI                                                                |
| FRI-19 | Faible  | pdf-lib, exceljs, archiver peu maintenus                           | différé | Surveillance                                                                                                                 |

### TEN : isolation entre agences et droits

| ID     | Gravité | Titre court                                                                      | Statut  | Note                                                                                                            |
| ------ | ------- | -------------------------------------------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------- |
| TEN-01 | Élevée  | Création de bien avec un conteneur parent d'une autre agence                     | corrigé | Compteurs `containerChildren` encore sans `tenantId` (section 6)                                                |
| TEN-02 | Élevée  | Lot de copropriété pointant le bien d'une autre agence                           | corrigé | Un immeuble pointé est refusé en 422 (H5)                                                                       |
| TEN-03 | Moyenne | `PATCH client-details` ouvert à tout client de l'agence                          | corrigé | Endpoint supprimé (non utilisé par le front)                                                                    |
| TEN-04 | Élevée  | Un gestionnaire peut se donner le rôle administrateur                            | corrigé | Étendu aux invitations d'administrateur et aux comptes super-admin cibles                                       |
| TEN-05 | Moyenne | Gabarits d'e-mail modifiables sans droit d'écriture                              | corrigé | Réservé à `TENANT_SETTINGS_EDIT`, contenu assaini (H3) ; lecture GET laissée ouverte                            |
| TEN-06 | Moyenne | Garde d'isolation en `warn`, couverture partielle de l'extension                 | différé | Décision d'exploitation ; l'extension ne couvre pas tout (`SyndicateLot`, `ChargeCall`, SQL brut)               |
| TEN-07 | Faible  | `ownerUserId` d'un bien accepté sans contrôle                                    | corrigé | Propriétaire externe par identifiant refusé en 404                                                              |
| TEN-M  | Mineurs | Routes non classées, MAINTENANCE_TENANT, `leaseId`, routes de rôles, verrous SQL | partiel | Verrou `FOR UPDATE` de `fund-credits.ts` toujours sans `tenantId` ; autres mineurs non traités individuellement |

## 4. Hypothèses métier à valider

| Id  | Question                                                                                            | Choix appliqué                                                                                         |
| --- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| H1  | Un gestionnaire peut-il attribuer ou retirer le rôle administrateur, ou toucher un administrateur ? | Non : réservé à `TENANT_ADMIN` et `SUPER_ADMIN`. L'édition des rôles non administrateurs reste permise |
| H2  | Que faire d'un paiement confirmé sans montant par le prestataire ?                                  | Il passe en REVIEW (échec fermé) au lieu d'être encaissé                                               |
| H3  | Qui modifie les gabarits d'e-mail de notification ?                                                 | Seul `TENANT_SETTINGS_EDIT` : un gestionnaire perd cette édition. La lecture reste ouverte             |
| H4  | Verrou de connexion par e-mail                                                                      | Verrou temporaire gardé en mémoire (dur par e-mail et IP/64, global court de 15 s), jamais définitif   |
| H5  | Lot de copropriété pointant un immeuble                                                             | Refusé en 422, même règle qu'à la création                                                             |
| H6  | Propriétaire externe d'un bien désigné par identifiant                                              | Refusé en 404 (traité comme un objet inexistant)                                                       |
| H7  | Vidéo ou photo pour une visite à 360 degrés                                                         | `TOUR_360` accepte une photo ou une vidéo ; `PHOTO` image seule, `VIDEO` vidéo seule                   |
| H8  | Médias historiques dont l'extension n'est pas dans la liste blanche                                 | Renvoyés en 404 (le script d'inventaire les repère)                                                    |
| H9  | Devise lue dans la réponse du prestataire de paiement                                               | Lue dans `payments.currency` ou `devise` (supposition, alias « F CFA » et 952 reconnus)                |
| H10 | `JWT_EXPIRES_IN` sans unité                                                                         | Refusé au démarrage ; durée maximale de 30 minutes                                                     |
| H11 | `NODE_ENV` absent                                                                                   | Plus de défaut `development` silencieux : vérifier les `.env` réels                                    |
| H12 | Image TIFF comme preuve de paiement de plateforme                                                   | Retirée de la liste acceptée                                                                           |
| H13 | Un jeton révoqué par déconnexion dans les 5 s après une autre session                               | Peut recevoir un accessToken de 15 min sans refresh (risque accepté)                                   |

## 5. Recommandations non implémentées

Effort : S (moins d'une journée), M (quelques jours), L (plusieurs semaines).

| Recommandation                                                                                  | Raison de l'avoir différée                                                          | Effort |
| ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------ |
| MFA / TOTP (AUTH-02), surtout pour les super-admins                                             | Migration de schéma, écran d'enrôlement, risque de verrouillage                     | L      |
| Refonte du flux d'inscription (AUTH-09)                                                         | Changement de parcours utilisateur                                                  | M      |
| Zod 4                                                                                           | Migration majeure, régressions possibles sur tous les schémas                       | L      |
| nodemailer 10                                                                                   | Version majeure ; validation des adresses posée en attendant                        | M      |
| react-router 7                                                                                  | Version majeure côté front                                                          | M      |
| bcrypt 6 et tar (node-pre-gyp)                                                                  | Majeures, module natif                                                              | M      |
| `TENANT_GUARD_MODE=enforce`                                                                     | Décision d'exploitation après lecture des journaux ; l'extension ne couvre pas tout | M      |
| Règle de branche GitHub : Code Owners requis, job d'isolation requis, relecteur pour le staging | Réglage GitHub, hors du dépôt                                                       | S      |
| Épinglage des images et des actions GitHub par SHA                                              | À faire avec dependabot pour ne pas figer des versions vulnérables                  | S      |
| Chiffrement des sauvegardes                                                                     | Gestion de clés à décider                                                           | M      |
| `cap_drop`, limites mémoire/CPU, image nginx non privilégiée                                    | Non testables sans docker ; `no-new-privileges` déjà posé par le lot 6              | M      |
| CSP en mode bloquant (`enforce`)                                                                | Observer d'abord les rapports de la CSP en Report-Only                              | M      |
| `express.json` et `urlencoded` : limites par route plutôt que 10 Mo global                      | Mode réel du prestataire de paiement non validé                                     | S      |
| Limiteur de débit dédié aux téléversements                                                      | Lot 2 : hors périmètre                                                              | S      |
| `lockFundsTx` sans `tenantId` (`lib/syndics/fund-credits.ts:89`)                                | Verrou SQL ; essai de correction annulé au lot 3 pour éviter une régression         | S      |
| `containerChildren` sans `tenantId` (compteurs, `property-service`)                             | Compteurs seulement, pas de lecture de lignes                                       | S      |
| Nom d'entrée DOCX : latin1 contre extra 0x7075                                                  | Sans impact de sécurité identifié                                                   | S      |
| Déclarer les variables `WHATSAPP_GROUP_*` dans `env.ts` et `env.example`                        | Seules variables encore lues par `process.env`                                      | S      |
| Vérification des `.env` réels avant déploiement                                                 | Hors du dépôt ; voir section 6                                                      | S      |

## 6. Actions requises du propriétaire

- [ ] Changer le mot de passe du super-administrateur du staging et fermer le staging au public (authentification de base ou liste d'adresses IP) : les identifiants étaient visibles dans le bundle et dans le dépôt public.
- [ ] Poser `Strict-Transport-Security` dans les blocs 443 des fichiers nginx de `app.immotopia.cloud` et `clients.immotopia.cloud` (volontairement non posé dans `spa.conf`, servi en HTTP).
- [ ] Activer la règle GitHub sur `main` : revue obligatoire des Code Owners (`.github/CODEOWNERS` existe), job d'isolation requis.
- [ ] Faire tourner (rotation) le SID Twilio présent dans l'historique git.
- [ ] Lancer l'inventaire des fichiers suspects en staging puis en production AVANT le déploiement : `npm run ops:list-suspect-uploads -w @immotopia/api` depuis la racine (ou `npm run ops:list-suspect-uploads` depuis `packages/api`). Le script ne supprime rien ; il liste les fichiers `html`, `js`, `svg`, `xml` ou à extension inattendue déposés comme médias, qui seront désormais refusés en 404.
- [ ] Valider `docker build` sous Node 22 (non testé : docker indisponible) et le mode réel de PaySecureHub (montant et devise présents dans la réponse, sinon tout paiement part en REVIEW).
- [ ] Valider les hypothèses métier H1 à H13 (section 4), en particulier H1 et H3 (un gestionnaire perd des droits) et H8 (médias historiques en 404).
- [ ] Contrôler les `.env` réels de staging et de production : `JWT_EXPIRES_IN` avec unité et au plus 30 min, `FRONTEND_URL`, `BACKEND_URL`, `CLIENT_URL` non locales, `EMAIL_SMTP_PORT` correct, `NODE_ENV` explicite.
- [ ] Confirmer par la CI que `npm ci` passe avec le `package-lock.json` régénéré (Node 24 / npm 11, lot 6).
- [ ] Supprimer le fichier vide `D:\tmp_tsc_out.txt`, créé hors du dépôt par un vérificateur (suppression refusée par le contrôle de sécurité).

## 7. Annexe

### Lots et commits

| Lot | Contenu                                      | Commit     | Fusion dans l'intégration |
| --- | -------------------------------------------- | ---------- | ------------------------- |
| 1   | Auth, sessions, journaux, CSRF               | `a6ea1428` | `94edcc62`                |
| 3   | Isolation et droits                          | `f6a5c586` | `9b765d3b`                |
| 5   | Front                                        | `a00faf17` | `fc70ab96`                |
| 2   | Fichiers, médias, DOCX                       | `c2a6fdf3` | `c6b785cf`                |
| 4   | Configuration, paiement, e-mail              | `ce65424f` | `4494c4be`                |
| 6   | Infrastructure, CI, dépendances, seeds, docs | `8a9b6e81` | `201d915b`                |
| 7   | Reliquats, traductions, classeur, documents  | à commiter | sur l'intégration         |

Reliquats du lot 7 : typage de `sendDetached` réparé ; `TOUR_360` accepte photo ou vidéo ; détection PDF avec bourrage évaluée en dernier (`%PDF-\d\.\d`, pas de `<` avant) ; `readDirSafe` journalise les erreurs autres que ENOENT ; limiteurs propres de `newsletter-public` et `coowner-portal` clés sur `clientIpKey` (le limiteur `finance-stock-whatsapp` est clé par agence et utilisateur, inchangé) ; `process.env` remplacé par `env` (sauf `WHATSAPP_GROUP_*`) ; `syndic-demo-seed.ts` gardé par `assertNotProduction` ; traductions en anglais et en arabe ; classeur des fonctionnalités à jour.

### Commandes de vérification

```bash
npm run typecheck
npm run lint
npm run check:architecture
npm test                      # backend (ciblé : npx jest <fichiers> dans packages/api)
npm run test:web              # frontend
npm run test:isolation        # base dédiée DATABASE_URL_TEST
npm run wiki:check
npm audit                     # état attendu : 1 critique, 3 élevées, 4 moyennes
bash infra/scripts/check-infra.sh
docker compose config
npm run ops:list-suspect-uploads -w @immotopia/api
```
