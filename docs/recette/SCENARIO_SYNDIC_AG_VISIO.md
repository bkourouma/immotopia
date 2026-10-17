# Recette — Visio intégrée à l'AG en direct (spec 045)

Instance de démo figée : web http://localhost:3300, API http://localhost:8800.
Base de démo dédiée uniquement.

## Pile locale gratuite (Docker Desktop sous Windows)

LiveKit, Redis, un stockage compatible S3 et l'Egress partagent **un seul
espace réseau** : tout s'y adresse en `localhost`, ce qui donne les mêmes
adresses au navigateur de l'hôte, à l'API (sur l'hôte) et à l'Egress. Les
images MinIO ne sont plus publiées librement : SeaweedFS (S3 compatible)
les remplace.

```bash
# Propriétaire de l'espace réseau (publie tous les ports) : Redis
docker run -d --name immotopia-visio-net -p 7880:7880 -p 7881:7881 -p 7882:7882/udp -p 8333:8333 --add-host host.docker.internal:host-gateway redis:7-alpine
docker run -d --name immotopia-livekit-dev --network container:immotopia-visio-net -v <dossier de config>:/etc/visio livekit/livekit-server:v1.9.1 --config /etc/visio/livekit.yaml
docker run -d --name immotopia-visio-s3 --network container:immotopia-visio-net -v <dossier de config>:/etc/visio chrislusf/seaweedfs server -s3 -s3.port=8333 -s3.config=/etc/visio/s3.json -dir=/data -ip=localhost -ip.bind=0.0.0.0
docker run -d --name immotopia-visio-egress --network container:immotopia-visio-net --cap-add SYS_ADMIN --shm-size=1g -e EGRESS_CONFIG_FILE=/etc/visio/egress.yaml -v <dossier de config>:/etc/visio livekit/egress
```

`livekit.yaml` : `rtc` avec `tcp_port: 7881`, `udp_port: 7882`,
`use_external_ip: false` et **`enable_loopback_candidate: true` sans
`node_ip`** (avec `node_ip: 127.0.0.1`, le Chrome de l'Egress refuse le
candidat de boucle locale et l'enregistrement échoue en « Start signal not
received ») ; `redis.address: localhost:6379` ; `keys` avec la clé de
développement ; `webhook.api_key` et
`webhook.urls: [http://host.docker.internal:8800/api/webhooks/livekit]`.
`egress.yaml` : mêmes clés, `ws_url: ws://localhost:7880`,
`redis.address: localhost:6379`, `insecure: true`. `s3.json` : une identité
SeaweedFS avec sa clé d'accès. Le bucket se crée par l'API S3
(`CreateBucket`).

L'API de démo est lancée avec `LIVEKIT_URL=ws://localhost:7880`,
`LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` et les `LIVEKIT_RECORDING_S3_*`
(endpoint `http://localhost:8333`, `FORCE_PATH_STYLE=1`), passés en
variables du processus, jamais écrits dans un `.env` ni dans ce dépôt.
Sans ces variables, le scénario V0 s'applique.

Comptes : agence « Horizon Syndic Gestion » (`SCENARIO_SYNDIC_MODULES_V2.md`
§ 1.1), copropriété « Résidence Les Flamboyants », AG de recette de
`SCENARIO_SYNDIC_AG_EN_DIRECT.md`. Les liens personnels sont des jetons : ne
pas les recopier dans un rapport.

Navigateur sans caméra ni micro : pour le gestionnaire, remplacer avant
l'activation de la caméra `navigator.mediaDevices.getUserMedia` par une
source de synthèse (`canvas.captureStream()` et un oscillateur WebAudio).
C'est un appareil de test, pas une modification de l'écran.

## V0 — Visio non configurée

V0.1 API lancée sans variables LiveKit. Page publique et console : aucune
carte « Visio intégrée », le lien externe de visio s'affiche comme avant.
`POST /api/public/assemblees/visio` répond 409.

## Gestionnaire

G1. Console « En direct » d'une AG `PLANNED` : carte « Visio intégrée »,
bouton « Ouvrir la visio ». L'ouvrir : la salle s'affiche, le gestionnaire
y est seul, nom affiché = prénom et nom.

G2. Ouvrir la séance (statut « En cours »). Activer caméra et micro
(source de synthèse). Attendu : sa tuile montre une vidéo.

## Copropriétaire A (nouvel onglet, lien personnel)

C1. Avant « Rejoindre l'assemblée » : aucune entrée en visio possible.

C2. « Rejoindre l'assemblée » puis « Rejoindre la visio ». Attendu : la
grille montre la tuile du gestionnaire avec une vidéo active et son
audio est reçu (piste audio active) ; aucun bouton micro ni caméra pour A ;
bouton « Lever la main ».

C3. Console : A apparaît dans la liste « en visio » et « En visio » dans la
liste des participants.

C4. A lève la main. Attendu (console, < 5 s) : main levée en tête de liste.

C5. Gestionnaire : « Donner la parole » à A. Attendu (A) : micro et caméra
apparaissent ; la main est baissée. « Retirer la parole » : ils
disparaissent.

## Vote pendant la visio

S1. Gestionnaire : ouvrir le vote d'une résolution. Attendu (A, sans
recharger, visio toujours connectée) : boutons Pour / Contre / Abstention.

S2. A vote « Pour ». Attendu : confirmation ; console : participation +1,
origine « copropriétaire » ; la visio n'a pas été coupée.

S3. Gestionnaire : clore le vote. Attendu (A) : résultat affiché.

## Mise en page

L1. Fenêtre ≥ 992 px : vidéo à gauche, résolutions à droite.
L2. 375 px : onglets « Visio » et « Votes » ; pastille sur « Votes » quand
un vote est ouvert ; revenir sur « Visio » : la vidéo est toujours là.
L3. Arabe : mise en page retournée, textes traduits.

## Exclusion et isolation

E1. Gestionnaire : « Exclure » A sans révoquer. Attendu (A) : « Vous avez
été retiré de la visio par le gestionnaire. » ; « Revenir dans la visio »
fonctionne.

E2. « Exclure » A en révoquant ses liens. Attendu : A ne peut plus revenir
ni voter (lien invalide).

E3. Jeton visio gestionnaire demandé pour une AG d'une autre agence : 404.

## Enregistrement

R1. Gestionnaire, AG en cours, visio ouverte : « Enregistrer la séance ».
Attendu : voyant « Enregistrement en cours » dans la console ; chez A,
bandeau « Cette assemblée est enregistrée. » dans la salle et avis sur la
page ; un copropriétaire B qui ouvre son lien voit l'avis AVANT d'entrer en
visio.

R2. Laisser tourner 20 s avec la caméra du gestionnaire, puis « Arrêter
l'enregistrement ». Attendu : le bandeau disparaît ; la carte
« Enregistrements » passe « En traitement » puis « Disponible » (webhook
`egress_ended`, rapatriement), avec durée et taille.

R3. « Lire » : la vidéo démarre dans la modale (requêtes `Range`, réponses
206). « Télécharger » : un fichier `.mp4` est obtenu.

R4. L'adresse `/uploads/…/enregistrements/…` ouverte directement : 404.
L'URL de lecture appelée sans session : 401. Un second envoi du même
webhook : sans effet. Un webhook à signature fausse : 401.

R5. « Supprimer » (confirmation) : statut « Supprimé », lecture impossible.

## Discussion écrite (spec 046)

Deux copropriétaires A et B dans la salle (deux onglets, liens personnels),
gestionnaire dans la console avec la salle ouverte.

D1. A ouvre « Discussion » : mention « Vos messages sont visibles de tous
les participants de la visio et conservés par le syndic. Un message ne vaut
pas vote. », historique vide. A écrit « Bonjour » (Entrée). Attendu : le
message apparaît chez A, chez B (sans recharger, pastille de non-lus si son
panneau est fermé) et dans la carte « Discussion » de la console, avec le nom
de A.

D2. A envoie `<img src=x onerror=alert(1)> <b>gras</b> https://exemple.test`.
Attendu : le texte s'affiche tel quel chez tous, aucune image, aucun gras,
aucun lien cliquable, aucune alerte.

D3. Maj+Entrée revient à la ligne ; le compteur bloque à 500 caractères ;
11 envois en moins d'une minute : « Vous écrivez trop vite, patientez un
instant. »

D4. Gestionnaire écrit depuis la console : message marqué « Gestionnaire »
chez A et B.

D5. Gestionnaire masque le message de A : chez A et B, « Message masqué par
le gestionnaire » ; dans la console, texte grisé marqué « masqué ». Recharger
la page de B et rouvrir la discussion : le texte masqué n'est pas servi
(réponse de `POST /api/public/assemblees/discussion` : `body: null`).
« Rétablir » : le message réapparaît chez tous.

D6. Gestionnaire : « Couper l'écriture » de A. Attendu : A voit « Le
gestionnaire a suspendu votre droit d'écrire. », son envoi est refusé ; B
écrit toujours ; marque « écriture coupée » dans la console. « Rétablir
l'écriture » : A écrit de nouveau.

D7. Gestionnaire ferme la discussion. Attendu : A et B voient « Le
gestionnaire a fermé la discussion. » et ne peuvent plus écrire ; le
gestionnaire écrit encore. Il la rouvre.

D8. A quitte la visio puis tente un envoi par l'API : 409 « Vous n'êtes pas
dans la visio ». Lien inconnu : 404. `messageId` d'une AG d'une autre agence
dans la route « masquer » : 404.

D9. 375 px : le panneau remplace la grille, « Retour à la vidéo » ; la salle
reste connectée. Arabe : panneau retourné, textes traduits.

## Clôture

F1. Clore l'AG. Attendu : la salle est fermée, les participants voient
« La visio est terminée. »

F2. Après la clôture : la console relit toute la discussion (lecture seule) ;
`POST /api/public/assemblees/discussion` répond 409.
