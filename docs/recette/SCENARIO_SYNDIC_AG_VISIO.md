# Recette — Visio intégrée à l'AG en direct (spec 045)

Instance de démo figée : web http://localhost:3300, API http://localhost:8800.
Base de démo dédiée uniquement. Serveur LiveKit **local** en mode
développement (Docker, aucune dépense) :

```bash
docker run -d --name immotopia-livekit-dev -p 7880:7880 -p 7881:7881 -p 7882:7882/udp -e LIVEKIT_KEYS="devkey: <secret aléatoire de 32 caractères ou plus>" livekit/livekit-server:v1.9.1 --dev --bind 0.0.0.0 --node-ip 127.0.0.1
```

L'API de démo est lancée avec `LIVEKIT_URL=ws://localhost:7880`,
`LIVEKIT_API_KEY=devkey` et le même secret, passés en variables du
processus (jamais écrits dans un `.env`). Sans ces variables, le scénario
V0 s'applique.

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

E3. Jeton visio gestionnaire demandé pour une AG d'une autre agence :
404.

## Clôture

F1. Clore l'AG. Attendu : la salle est fermée, les participants voient
« La visio est terminée. »
