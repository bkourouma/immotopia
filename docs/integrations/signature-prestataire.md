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
| `YOUSIGN_SIGNATURE_LEVEL`       | `electronic_signature` (défaut), `advanced_electronic_signature` ou `qualified_electronic_signature` |
| `SIGNATURE_PROVIDER_TIMEOUT_MS` | délai d'un appel, 2000 à 60000 (défaut 20000)                                                        |

Sans clé ou sans secret, le serveur refuse de démarrer. En production
(`NODE_ENV=production`), une base contenant « sandbox » est refusée au démarrage.

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

## Créer le webhook chez Yousign

1. Dans l'espace Yousign (sandbox d'abord), créer un abonnement webhook (ou
   `POST /webhooks`, champ `sandbox` selon l'environnement).
2. URL : `https://<api>/api/public/signature-provider/yousign`.
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

- Canal e-mail uniquement ; pas de signature sur place.
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
