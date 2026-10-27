# Signature électronique : prestataire externe (Yousign)

Spec 044, lot S6 (SG-R1, SG-R13). Adaptateur de référence : Yousign API v3,
dans `packages/api/src/lib/signature/provider/external/yousign.ts`.

## Principe

Le prestataire porte le parcours du signataire (invitation par e-mail,
authentification, signature) et la valeur juridique. ImmoTopia garde la demande,
sa machine d'états et sa piste de preuve chaînée. Le noyau ne connaît que le
contrat `ExternalSignatureClient` (`external/types.ts`) ; l'adaptateur est
remplaçable. Un webhook n'est jamais cru sur parole : après authentification
HMAC, ImmoTopia relit l'état auprès du prestataire.

## Variables d'environnement

| Variable                        | Rôle                                                                                                 |
| ------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `SIGNATURE_PROVIDER=yousign`    | active le prestataire externe                                                                        |
| `YOUSIGN_API_KEY`               | clé API (Bearer). Requise. Aucun défaut                                                              |
| `YOUSIGN_WEBHOOK_SECRET`        | secret du webhook (16 caractères au moins). Requis. Aucun défaut                                     |
| `YOUSIGN_API_BASE_URL`          | https uniquement. Défaut : sandbox                                                                   |
| `YOUSIGN_ALLOW_SANDBOX`         | `1` lève le refus de la base sandbox quand `NODE_ENV=production` (staging seulement). Défaut `0`     |
| `YOUSIGN_SIGNATURE_LEVEL`       | `electronic_signature` (défaut), `advanced_electronic_signature` ou `qualified_electronic_signature` |
| `SIGNATURE_PROVIDER_TIMEOUT_MS` | délai d'un appel, 2000 à 60000 (défaut 20000)                                                        |

Sans clé ou sans secret, le serveur refuse de démarrer. En production
(`NODE_ENV=production`), une base contenant « sandbox » est refusée au démarrage,
sauf avec `YOUSIGN_ALLOW_SANDBOX=1` : le staging tourne lui aussi en
`NODE_ENV=production` (`make-env.sh`) et doit pouvoir brancher la sandbox sans
produire de vraies signatures facturées. Avec le drapeau, le serveur démarre en
avertissant que « les signatures n'ont aucune valeur ». Le drapeau ne lève aucun
autre contrôle (https, clé API, secret de webhook) et `deploy.sh prod` le refuse
(voir [Brancher la sandbox sur le staging](#brancher-la-sandbox-sur-le-staging)).

**Niveau de signature et qualification (SG-R1).** Le fournisseur Yousign n'est
déclaré « qualifié » que si `YOUSIGN_SIGNATURE_LEVEL` vaut
`advanced_electronic_signature` ou `qualified_electronic_signature`. Avec le
défaut (`electronic_signature`, signature simple), il n'est PAS qualifié : les
types de `SIGNATURE_PROVIDER_REQUIRED_KINDS` (le compromis de vente par défaut)
restent refusés. C'est voulu tant que l'avis juridique n'est pas rendu.

Les demandes externes ne sont ni relancées par le noyau (rappels automatiques et
relance manuelle) ni servies par le parcours public interne : le prestataire s'en charge.

## Sandbox et production

- Sandbox : `https://api-sandbox.yousign.app/v3` (défaut, sans valeur juridique).
- Production : `https://api.yousign.app/v3`.

La documentation développeur de Yousign est désormais servie sous
`developers.youtrust.com` (redirection depuis `developers.yousign.com`).

## Brancher la sandbox sur le staging

Le staging (https://app.immotopia.cloud) tourne en `NODE_ENV=production` et ne doit
porter aucun identifiant de production ni notifier de vraies personnes
([DEPLOIEMENT.md](../workflows/DEPLOIEMENT.md), « Lot 044 — Signature électronique »).
La base de production Yousign y produirait de vraies signatures facturées : on y
branche la sandbox, avec le drapeau explicite.

Dans `/home/deployer/immotopia-saas.env` (édité à la main par l'administrateur du
serveur, jamais collé dans une conversation) :

```bash
SIGNATURE_PROVIDER=yousign
YOUSIGN_API_KEY=<clé API de la sandbox Yousign>
YOUSIGN_WEBHOOK_SECRET=<secret du webhook, 32 caractères>
YOUSIGN_API_BASE_URL=https://api-sandbox.yousign.app/v3
YOUSIGN_ALLOW_SANDBOX=1
```

Puis `./infra/scripts/deploy.sh staging --no-build` pour recréer l'API avec le nouveau
fichier ([Modifier une variable d'environnement](../workflows/DEPLOIEMENT.md#modifier-une-variable-denvironnement)).
Au démarrage, le journal de l'API doit porter l'avertissement « SIGNATURE_PROVIDER=yousign
en production avec la base SANDBOX […] les signatures n'ont aucune valeur ». S'il porte
« la base SANDBOX Yousign est refusée en production », `YOUSIGN_ALLOW_SANDBOX=1` manque ;
s'il nomme `YOUSIGN_ALLOW_SANDBOX` lui-même, la valeur n'est ni `0` ni `1`.

Webhook, à déclarer chez Yousign **dans la sandbox** (voir
[Créer le webhook chez Yousign](#créer-le-webhook-chez-yousign)) :
`https://app.immotopia.cloud/api/public/signature-provider/yousign`.

**À savoir avant de s'en servir :**

- `SIGNATURE_PROVIDER` est **unique** pour tout le serveur : avec `yousign`, ni la
  signature interne (jeton + code à usage unique) ni les canaux WhatsApp, SMS ou
  « sur place » ne sont servis. Une demande dont un signataire n'est pas joignable
  par e-mail est refusée (« Ce prestataire de signature n'accepte que des signataires
  joignables par e-mail »).
- **Le canal SMS ne se teste donc pas en même temps que Yousign.** Il faut
  `SIGNATURE_PROVIDER=internal` (ou `log`) et un `SMS_PROVIDER`. Sur le staging,
  `SMS_PROVIDER=log` est **refusé au démarrage** (`NODE_ENV=production` : le transport
  `log` n'est accepté que si `NODE_ENV` vaut `development` ou `test`) ; il reste
  `orange` avec un compte Orange CI dédié au staging, ou `disabled`. Basculer entre les
  deux essais demande de modifier le fichier de secrets et de redéployer.
- Les signatures de la sandbox n'ont aucune valeur juridique. N'y saisir que des
  adresses e-mail de test : **non vérifié** si la sandbox Yousign envoie ou non de
  vraies invitations aux adresses indiquées ; ne pas y mettre l'adresse d'un vrai client.
- Le niveau `electronic_signature` (défaut) ne qualifie pas le fournisseur : le
  compromis de vente (`SALE_AGREEMENT`) reste refusé tant que
  `YOUSIGN_SIGNATURE_LEVEL` n'est pas avancé ou qualifié (SG-R1).

**Garde-fou production.** `deploy.sh prod` refuse un fichier de secrets qui porte
`YOUSIGN_ALLOW_SANDBOX=1`, quelle que soit l'écriture (`export`, guillemets,
espaces), comme pour `PAYMENT_GATEWAY_SIMULATOR`. Et, sans le drapeau, `env.ts`
refuse déjà une base « sandbox » en production : la sandbox n'atteint pas la
production, ni par le script ni au démarrage. **Retour à la production Yousign** :
retirer `YOUSIGN_ALLOW_SANDBOX`, mettre `YOUSIGN_API_BASE_URL=https://api.yousign.app/v3`,
une nouvelle clé API et un nouveau secret de webhook (ceux de la sandbox ne valent pas
en production).

## Créer le webhook chez Yousign

1. Dans l'espace Yousign (sandbox d'abord), créer un abonnement webhook (ou
   `POST /webhooks`, champ `sandbox` selon l'environnement).
2. URL : `https://<api>/api/public/signature-provider/yousign` ; staging (sandbox) :
   `https://app.immotopia.cloud/api/public/signature-provider/yousign`.
3. Secret : le même que `YOUSIGN_WEBHOOK_SECRET` (32 caractères côté Yousign).
4. Événements à cocher : `signature_request.done`, `signature_request.declined`,
   `signature_request.expired`, `signature_request.canceled`, `signer.done`,
   `signer.declined`. Activer les relances automatiques (`auto_retry`).
5. En-tête de signature : `X-Yousign-Signature-256` = `sha256=` + HMAC-SHA256
   (hexadécimal) du corps brut. Corps : `event_id`, `event_name`,
   `data.signature_request.id`.

## Flux complet

1. Création : `POST /signature_requests` (nom, `delivery_mode: email`, ordre,
   expiration), téléversement du PDF figé, un signataire par partie avec un
   champ de signature chacun, activation.
2. Yousign envoie les invitations par e-mail et gère authentification et signature.
3. Yousign appelle le webhook ; ImmoTopia vérifie le HMAC, dédoublonne, puis
   relit la demande (`GET /signature_requests/{id}`).
4. Demande terminée : téléchargement du PDF signé et du dossier de preuve,
   rattachés à la demande ; statut `COMPLETED`.
5. Annulation côté ImmoTopia : `POST .../cancel` (idempotent). Échec en cours de
   création : suppression best effort de la demande côté prestataire.

## Vérifié et non vérifié

Vérifié dans la documentation : bases d'URL, authentification Bearer, routes et
corps de création, document (multipart), signataire, activation, annulation,
lecture, statuts, noms d'événements, webhook (en-tête, algorithme, corps).

| NON VÉRIFIÉ (à éprouver en sandbox)                                                       | Comportement actuel                                                    |
| ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Unité et origine des coordonnées du champ de signature                                    | `DEFAULT_SIGNATURE_BOX` (page 1, bas de page, un cadre par signataire) |
| Téléchargement du document signé : PDF ou ZIP ?                                           | seul un PDF est accepté, sinon erreur `INVALID_RESPONSE`               |
| Dossier de preuve (`audit_trails/download`) : route restreinte, activation par le support | à demander à Yousign avant la production                               |
| Date de signature par signataire                                                          | absente : `signedAt` toujours null                                     |
| Code HTTP d'une annulation sur demande déjà terminée                                      | l'état est relu pour décider                                           |
| Suppression d'une demande brouillon (`DELETE /signature_requests/{id}`)                   | best effort                                                            |
| Effet de `ordered_signers` + `insert_after_id` sur l'ordre réel                           | signataires ajoutés dans l'ordre des positions                         |
| Nom de famille obligatoire                                                                | un nom d'un seul mot est répété                                        |
| Niveau de signature (qualifié ou non) et authentification                                 | `electronic_signature` + `otp_email` ; option `signatureLevel`         |
| Fuseau et format de l'expiration                                                          | UTC, borné entre 1 minute et 364 jours                                 |

## Limites

- Canal e-mail uniquement ; pas de signature sur place, ni WhatsApp, ni SMS.
- `SIGNATURE_PROVIDER` est unique pour le serveur : avec `yousign`, le canal SMS
  (Orange CI) et la signature interne sont indisponibles.
- L'arabe n'est pas une langue Yousign : invitations et preuve en français (`ARABIC_FALLBACK_LOCALE`).
- `qualified: true` est déclaré à titre provisoire : choix de prestataire et avis juridique non rendus.
- Le niveau réellement délivré (simple, avancé, qualifié) dépend de l'option `signatureLevel` et du contrat Yousign.

## Remplacer l'adaptateur

1. Implémenter `ExternalSignatureClient` (nouveau fichier dans `external/`).
2. L'enregistrer dans `build()` de `external/index.ts`.
3. Ajouter sa valeur à l'enum `SIGNATURE_PROVIDER` et ses variables à
   `config/env.ts` et `env.example`.
4. Écrire des tests avec un transport HTTP mocké (modèle :
   `__tests__/unit/signature-yousign-client.test.ts`).

## À tester en sandbox avant la production

- Parcours complet à deux signataires, séquentiel puis parallèle.
- Position du cadre de signature sur un PDF réel (A4).
- Format du téléchargement du document signé (PDF ou ZIP) et du dossier de preuve.
- Refus, expiration et annulation ; reprise après webhook perdu (relecture).
- Réception du webhook avec la signature réelle (secret de 32 caractères).
- Limites de débit (HTTP 429, `Retry-After`) et quotas du plan.
- Bascule `YOUSIGN_API_BASE_URL` vers la production et nouvelle clé API.
