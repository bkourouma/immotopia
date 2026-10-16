# Recette — AG en direct (spec 043)

Instance de démo figée : web http://localhost:3300, API http://localhost:8800
(révision `npm run demo:status`). Base de démo dédiée uniquement.
Adresses e-mail en `@exemple.test` uniquement.

Comptes : panneau de démo de l'écran de connexion (« Pack Syndic », sinon
`apps/web/src/dev/dev-accounts.ts`). Un agent ne saisit pas d'autre mot de
passe que ceux de ces fichiers.

Lecture : `read_page` / `get_page_text` / `find`, clics par `ref`. Capture
d'écran seulement si le panneau est affiché, une par écran clé.

## Préparation

P1. Se connecter en gestionnaire d'une agence Syndic ; ouvrir une
copropriété qui a au moins 3 lots avec propriétaires (contacts) et
tantièmes. Noter l'URL `/tenant/<T>/syndics/<S>`. Sinon, créer la
copropriété, 3 lots, 3 copropriétaires (`@exemple.test`).

P2. Assemblées et documents → créer une AG ordinaire (date du jour + 1 h,
lieu « Salle du conseil ») avec deux résolutions (« Approbation des
comptes » art. 24, « Travaux de toiture » art. 25). Attendu : AG planifiée,
résultat de convocation affiché.

## Gestionnaire — préparation de séance

G1. Fiche de l'AG → section « En direct » : participants listés (noms,
lots), aucun en ligne. Attendu : quorum 0 %.

G2. Renseigner une URL de visio `https://meet.exemple.test/ag` ; puis
essayer `http://…` → refus. Attendu : enregistrement de l'https seulement.

G3. « Copier le lien » pour le copropriétaire A : une URL
`http://localhost:3300/ag-direct#…` est obtenue (presse-papiers ou
affichage). La noter (ne pas la recopier dans le rapport, c'est un jeton).
Idem pour B.

## Copropriétaire A — page publique (nouvel onglet)

C1. Ouvrir le lien de A. Attendu : jeton retiré de la barre d'adresse,
nom de l'AG, copropriété, visio, « Rejoindre l'assemblée », mes lots,
résolutions non ouvertes, aucun bouton de vote.

C2. Cliquer « Rejoindre ». Attendu : statut rejoint, lots de A présents.

C3. Onglet gestionnaire : en moins de 5 s, les lots de A sont « présents »
(en ligne), le quorum a augmenté des tantièmes de A, A apparaît en ligne.

## Séance

S1. Gestionnaire : ouvrir la séance (statut « En cours »).

S2. Émarger le lot de C « présent en salle » ; le quorum augmente. Émarger
B « absent » puis le remettre présent. Émargement en masse sur 2 lots.

S3. Ouvrir le vote de « Approbation des comptes ». Attendu (A, < 5 s) :
boutons Pour / Contre / Abstention visibles.

S4. A vote « Pour » pour tous ses lots. Attendu : confirmation, « mes
votes » affichés, participation 1 lot (ou plus) côté A, sens des votes des
autres jamais visible, aucun résultat affiché pendant le vote.

S5. Gestionnaire : décompte en direct mis à jour (vote de A, origine
copropriétaire). Saisir le vote « Contre » du lot de C (saisie existante).

S6. Ouvrir le lien de B, rejoindre, voter « Abstention ».

S7. Gestionnaire : saisir un vote pour le lot de A (« Contre ») ; puis A
tente de revoter en ligne. Attendu : refus avec message clair (vote saisi
par le syndic).

S8. Gestionnaire : « Clore le vote ». Attendu (A et B, < 5 s) : résultat
affiché (décision, tantièmes pour/contre/abstention), plus de bouton.

S9. Projection : ouvrir « Projeter » ; quorum, résultat de la résolution
close ; ouvrir le vote de la 2e résolution → elle apparaît en cours.

S10. Révoquer les liens de B ; recharger la page de B (lien d'origine) →
« lien invalide ».

S11. Clôturer la séance. Attendu : votes ouverts clos, page de A affiche
l'AG terminée et ses résultats ; compte rendu Word généré (le télécharger
seulement si cela ne demande pas de confirmation).

## Portail (si un copropriétaire a un compte portail dans la démo)

R1. Mes assemblées : bouton « Rejoindre l'AG en direct » sur une AG
planifiée ou en cours, qui ouvre la page en direct.

## Transverse

T1. Page publique en mobile (375 px) : pas de défilement horizontal,
boutons de vote utilisables. T2. Page publique et console en arabe : mise
en page retournée, textes traduits. T3. Console du navigateur : aucune
erreur rouge pendant le scénario.
