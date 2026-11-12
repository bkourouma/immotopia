# Recette Syndic — abonnement, limites et extensions (jouée dans Chrome)

Scénario à donner tel quel à Claude (extension Chrome) pour qu'il le joue
**dans l'interface, sous les yeux de Baba**. Baba est déjà connecté en
super-administrateur dans Chrome. Claude crée une agence de syndic, la
connecte, parcourt le pack Syndic, éprouve ses limites, demande des extensions
côté agence, les traite côté super-administrateur, vérifie l'option « AG en
direct » et contrôle la facturation.

Rédigé le 2026-11-12 à partir du code de `main` (catalogue
`packages/api/src/lib/subscription/catalog.ts`, onglet Abonnement du
super-admin `SubscriptionTab.tsx`, menu `navigation/model.tsx`) et de la recette
précédente [SCENARIO_SYNDIC_ABONNEMENT.md](../SCENARIO_SYNDIC_ABONNEMENT.md).
Les montants ci-dessous viennent du catalogue : **ce que l'écran affiche prime**.
Un écart de montant se consigne, il ne se corrige pas dans le scénario.

Fichiers de suivi, à remplir par Claude pendant la recette (dans ce dossier) :

- [JOURNAL.md](JOURNAL.md) — une ligne par étape : passé, échoué, bloqué, noté.
- [ANOMALIES.md](ANOMALIES.md) — les anomalies **non bloquantes** et les
  constats produit. Les bloquantes ne s'y écrivent pas : voir §1.

---

## 0. Consignes pour Claude

**Mode spectateur.** Baba regarde l'écran. Avant chaque étape, écris une ligne
« ▶ Étape X — ce que je vais faire ». Après, une ligne « ✔ ou ✖ — ce que
l'écran affiche vraiment ». Va à un rythme lisible : un clic, une lecture, un
commentaire. Pas de rafale de clics sans commentaire.

**Interface seulement.** Aucune requête API, aucun script, aucune commande, aucun
accès à la base. Tout se fait par clics et saisies dans les pages. Lire l'onglet
réseau ou la console du navigateur pour **prouver** un défaut est permis.

**Ne rien inventer.** Un résultat qui n'est pas vu à l'écran n'est pas un
résultat. Si un bouton, un écran ou un libellé n'existe pas, écris « absent » et
applique le §1. Ne devine pas le contenu d'un écran que tu n'as pas lu.

**Interdits absolus.**

- Ne jamais cliquer « Payer en ligne » ni ouvrir une passerelle de paiement.
  Le mode de paiement de l'environnement n'est pas garanti simulé.
- Ne rien supprimer : ni agence, ni utilisateur, ni copropriété, ni lot. Les
  retraits de la partie K sont des retraits d'abonnement, pas des suppressions.
- Ne jamais lancer `db:seed`, ni toucher un fichier `.env`.
- Pas de donnée réelle : noms fictifs, adresses `@exemple.test` uniquement.
- **Ne jamais jouer ce scénario en production.** Voir l'étape P1.

**Mots de passe.** Baba est déjà connecté en super-admin : tu n'as pas à saisir
son mot de passe. Pour le compte de l'agence créée par la recette, le mot de
passe de test est `SyndicTest#2026` (valeur de test, propre à ce scénario). Si
l'environnement est local ou de recette, tu peux le saisir. Si l'extension refuse
de saisir un mot de passe, ou si tu hésites, **demande à Baba de le saisir** et
attends sa confirmation.

**Deux sessions, un seul navigateur.** Le super-admin et l'administrateur de
l'agence ne peuvent pas être connectés en même temps dans la même fenêtre :
les cookies sont ceux de l'hôte. Voir l'étape P2 pour le dispositif choisi.

---

## 1. Protocole des anomalies

À chaque écart entre l'attendu et ce que tu vois, classe-le **tout de suite**.

### 1.1 Bloquant — tu t'arrêtes

Est **bloquant** tout ce qui t'empêche de poursuivre ou rend la suite
trompeuse : écran blanc, erreur 500 ou message générique sur une action
indispensable, impossible de créer l'agence ou d'accepter l'invitation,
impossible de se connecter, quota qui ne bloque pas alors que la politique est
« Bloquer » (en mode `enforce`), fuite entre agences, paiement qui se
déclenche, donnée perdue.

Dans ce cas :

1. **Ne contourne pas** et ne continue pas à l'étape suivante.
2. Ne corrige rien, ne retente pas plus de deux fois.
3. Écris dans le chat, **et seulement ça**, la fiche ci-dessous, prête à
   copier-coller (Baba la remet à l'agent qui répare) :

```text
FICHE BLOCAGE — recette Syndic Chrome
Étape : <numéro, ex. E.3>
Environnement : <adresse de l'onglet, sans paramètre ni jeton>
Compte : <super-admin | administrateur de l'agence>
Fait : <ce que tu as cliqué, dans l'ordre, en 3 à 6 lignes>
Attendu : <ce que le scénario annonçait>
Observé : <texte exact affiché, statut HTTP et message de la console si lu>
Impact : <ce qui ne peut plus être testé tant que ce n'est pas réglé>
Données créées jusque-là : <agence, copropriétés, lots, demandes — noms>
```

4. Inscris l'étape dans JOURNAL.md avec le verdict `bloqué`.
5. Attends que Baba te colle un message commençant par **« REPRISE »**. Il
   t'indiquera ce qui a été réparé. Rejoue d'abord l'étape bloquée, puis
   continue. Si elle échoue encore, refais une fiche.

### 1.2 Non bloquant — tu continues

Tout le reste : libellé non traduit, faute, mise en page, message d'erreur
imprécis mais compréhensible, ordre bizarre, lenteur, avertissement console,
montant légèrement différent mais cohérent, écran peu clair.

Dans ce cas, **ajoute une entrée à ANOMALIES.md** (format dans ce fichier),
écris `échoué (ANO-SYN-nnn)` dans JOURNAL.md, puis passe à l'étape suivante.

### 1.3 Constat produit — tu continues

Quand le comportement est cohérent avec le code mais **peut ne pas être ce que
Baba veut** (ex. : une fonction censée être payante est incluse). Tu notes
dans ANOMALIES.md, section « Constats produit », avec ce que tu as vu et ce que
tu attendais. Tu ne le présentes ni comme un succès ni comme un échec : c'est
une décision à prendre.

### 1.4 Priorités

- **important** : résultat faux (quota, montant, droit, statut), message
  trompeur, texte non traduit sur un écran principal.
- **mineur** : confort, mise en page, accent, ordre.

---

## 2. Pré-vol

### P1. Environnement

1. Lis l'adresse de l'onglet où Baba est connecté. Écris-la dans JOURNAL.md.
2. **Si l'adresse est celle de la production, arrête-toi et dis-le à Baba.** Le
   scénario crée une vraie agence et des factures futures.
3. Local ou recette : continue. Pour une adresse inconnue, demande à Baba.

### P2. Dispositif des deux sessions

Demande à Baba de choisir, puis note le choix :

- **Option 1 (recommandée) — deux profils Chrome.** Une fenêtre avec le
  super-admin, une autre (second profil, extension installée) pour
  l'administrateur de l'agence. Aucune déconnexion.
- **Option 2 — une seule fenêtre.** À chaque changement de rôle, tu demandes à
  Baba de se déconnecter puis de se reconnecter. Regroupe les actions : tout ce
  qui est du super-admin d'abord, puis l'agence, etc. L'ordre du §4 le permet
  en 8 changements de rôle.

### P3. Mode d'application des abonnements

Le comportement des limites dépend du mode du serveur (`off`, `warn`, `enforce`).

1. Super-admin : ouvre la fiche d'une agence quelconque, onglet **Abonnement**.
2. Cherche le bandeau **« Vérifications d'abonnement inactives »**.
   - Bandeau **présent** : mode `warn` ou `off`. Les menus restent tous visibles
     et **aucun quota ne bloque**, quelle que soit la politique. Les étapes
     marquées « (enforce) » ne sont pas testables : écris `non joué (mode
<warn|off>)` dans JOURNAL.md, constate seulement les jauges, et
     **demande à Baba s'il veut basculer le serveur en `enforce`** avant de
     poursuivre. Ne tente pas de le changer toi-même.
   - Bandeau **absent** : mode `enforce`. Joue tout.
3. Écris le mode constaté en tête de JOURNAL.md.

### P4. Mise en place du suivi

Ouvre JOURNAL.md et ANOMALIES.md, renseigne la date, l'adresse et le mode.

---

## 3. Données de la recette

| Objet                      | Valeur                                       |
| -------------------------- | -------------------------------------------- |
| Agence                     | `Syndic Recette 12-11`                       |
| Administrateur             | `Aminata Recette`                            |
| E-mail de l'administrateur | `admin.syndic.1211@exemple.test`             |
| Mot de passe de test       | `SyndicTest#2026`                            |
| Pack                       | **Syndic** seul, mensuel, sans mise en route |
| E-mail de contact          | `contact.syndic.1211@exemple.test`           |
| Ville, pays                | `Abidjan`, `Côte d'Ivoire`                   |
| Copropriété 1              | `Résidence Les Manguiers (Rec 1211)`         |
| Copropriété 2              | `Résidence Les Palmiers (Rec 1211)`          |
| Copropriété 3 (au-delà)    | `Résidence Les Cauris (Rec 1211)`            |
| Copropriété 4              | `Résidence Les Fromagers (Rec 1211)`         |
| Lots d'appartement         | `M001`, `M002`, … tantièmes 10               |
| Lots annexes               | `MP1` (parking, 5), `MC1` (cave, 3)          |
| Copropriétaires            | `Kouassi Test`, `Traoré Test`, `Bamba Test`  |

Valeurs du catalogue au 2026-11-12, à confronter à l'écran :

| Élément                                  | Valeur                                       |
| ---------------------------------------- | -------------------------------------------- |
| Pack Syndic                              | 49 900 FCFA HT par mois                      |
| Capacité du pack                         | 2 copropriétés, 100 lots, 50 signatures/mois |
| Extension « Copropriété supplémentaire » | 10 000 FCFA HT par mois                      |
| Extension « Bloc de 10 lots »            | 1 500 FCFA HT par mois                       |
| Extension « Signatures — bloc de 50 »    | 5 000 FCFA HT par mois                       |
| Total mensuel Syndic + 1 bloc + 1 copro  | 61 400 FCFA HT                               |
| TVA                                      | 18 %                                         |
| Essai                                    | 30 jours, puis 7 jours de grâce              |

Un bien en mode Vente ne consomme pas de lot. Seuls comptent dans la jauge
**Lots** les lots d'appartement, de bureau ou de commerce d'une copropriété
(les parkings et caves n'en consomment pas).

---

## 4. Déroulé

Rôle entre crochets : **[SA]** super-admin, **[AG]** administrateur de
l'agence. `BASE` = adresse de l'application + `/tenant/<TENANT>`.

### A. Création de l'agence [SA]

**A.1** Menu **Administration › Agences**, bouton « Nouvelle agence ». Remplis
nom, administrateur, e-mail (§3). Clique la carte **Syndic** seule.
Attendu : carte cochée, 49 900 / mois ; « Essai gratuit d'un mois » coché et
grisé ; récapitulatif Total HT mensuel 49 900.

**A.2** Sans valider, compose des devis : ajoute une unité de « Lots
supplémentaires » et une de « Copropriétés supplémentaires », lis le total, puis
remets-les à 0. Coche puis décoche « Mise en route accompagnée ».
Attendu : 61 400 avec une unité de chaque ; la mise en route apparaît en frais
uniques hors total mensuel. Pas d'extension « Chantiers » (hors pack).

**A.3** « Plus d'options » : e-mail de contact, ville, pays. Clique « Créer
l'agence ».
Attendu : écran « Agence créée », fin d'essai à J+30, champ « Lien
d'invitation » avec « Copier ». Le lien contient un jeton : **ne l'écris dans aucun fichier**, note seulement
« lien copié » dans JOURNAL.md et garde-le pour l'étape B.1.
Ouvre la fiche, relève `<TENANT>` dans l'adresse.

**A.4** Fiche de l'agence, onglet **Abonnement**.
Attendu : statut Essai, pack Syndic, politique « Facturer le dépassement »,
jours de grâce 7, consommation Copropriétés 0 / 2, Lots 0 / 100, section
« Prochaine facture (aperçu) » lisible.

### B. Invitation et première connexion [AG]

**B.1** Dans la session de l'agence (P2), ouvre le lien d'invitation. Saisis
d'abord un mot de passe faible (`faible`).
Attendu : refus avec un message sur la longueur ou la complexité.

**B.2** Saisis `SyndicTest#2026` (ou demande à Baba), valide.
Attendu : invitation acceptée. Rouvrir le même lien est refusé.

**B.3** Connecte-toi avec l'e-mail de l'administrateur.
Attendu : arrivée sur le tableau de bord de l'agence, sans erreur.

> Si B.2 ou B.3 échoue : **bloquant** (§1.1).

### C. Inventaire du pack Syndic [AG]

Pour chaque ligne : ouvrir l'écran, vérifier qu'il se charge **sans message
d'erreur**, qu'il a un titre et des libellés lisibles, noter « présent / absent ».
Pas de saisie, sauf mention. Consigner chaque écran dans JOURNAL.md.

**C.1 Menu.** Lis la barre latérale complète.
Attendu en `enforce` : entrée **Syndic** (Copropriétés, Agences mandantes,
Copropriété, Finances, Assemblées et documents) ; socle (tableau de bord, biens,
contacts, maintenance, finance opérationnelle, documents, communication,
ImmoCopilot, paramètres) ; groupe **Mon compte** (Abonnement, Facturation).
**Absents** : Gestion locative, Chantiers, CRM, Ventes, Patrimoine.
En `warn` : tout est visible, c'est normal (P3).

**C.2 Syndic — liste.** `BASE/syndics` : liste vide, bouton « Nouvelle
copropriété ».

**C.3 Agences mandantes.** `BASE/syndics/mandants` : s'ouvre, liste vide.

**C.4 Une copropriété.** Crée la copropriété 1 (voir D.1), puis parcours ses
onglets : détail, **Lots**, **Prestataires**, **Profils et incidents**.

**C.5 Finances.** Dans la copropriété 1, parcours : budgets, appels de charges,
suivi mensuel, quittances, recouvrement, finances (fonds), comptabilité,
paiements en ligne, prélèvements.
Attendu : chaque onglet s'ouvre. Un onglet vide est normal, un onglet en erreur
est une anomalie. Pour « paiements en ligne » et « prélèvements », **ne rien
activer, ne rien payer** : lire seulement l'écran.

**C.6 Assemblées et documents.** Ouvre l'onglet Assemblées : liste vide, bouton
de création. Ouvre l'onglet Documents.

**C.7 Socle.** Ouvre : tableau de bord, Biens, Contacts, Maintenance,
Finance (caisse, comptabilité, fournisseurs), Documents, Communication,
ImmoCopilot, Paramètres de l'agence.
Attendu : chacun se charge sans erreur. ImmoCopilot peut être indisponible selon
la configuration : note l'état sans le qualifier d'échec.

**C.8 Mon compte.** Ouvre **Abonnement** (`BASE/settings/abonnement`) puis
**Facturation** (`BASE/settings/facturation`).
Attendu, page Abonnement : statut Essai, cycle Mensuel, pack Syndic, période
J → J+30, jauges Copropriétés 0 / 2 et Lots 0 / 100, carte « Demander une
extension », « Mes demandes » vide. Facturation : aucune facture (essai). Ne pas
cliquer de bouton de paiement.

**C.9 Modules non souscrits (enforce).** Tape à la main :
`BASE/rental/leases`, `BASE/finance/chantiers`, `BASE/crm`, puis
`BASE/syndics` et `BASE/settings/abonnement` par contrôle.
Attendu : les trois premières adresses sont refusées par un message clair
indiquant que la fonction n'est pas comprise dans l'abonnement ; les deux
dernières s'ouvrent. Un écran blanc ou un message générique est une anomalie
**importante**. En `warn`, rien n'est refusé : noter et passer.

### D. Limites de copropriétés [AG puis SA]

**D.1 [AG] Dans la capacité.** Crée la copropriété 1 puis la 2 (« Nouvelle
copropriété », champs obligatoires seulement). Relis la jauge sur la page
Abonnement.
Attendu : Copropriétés 2 / 2.

**D.2 [SA] Politique « Bloquer ».** Fiche de l'agence › Abonnement : politique
de dépassement → **Bloquer le dépassement**. Recharge la page.
Attendu : message « Politique de dépassement mise à jour ».

**D.3 [AG] (enforce) Création refusée.** Recharge la page de l'agence (le cache
des droits dure 30 s ; attends-les si rien ne change). Crée la copropriété 3.
Attendu : **création refusée** avec un message qui dit clairement que la
capacité de copropriétés de l'abonnement est atteinte et qu'on peut demander
une extension. **Rien n'est créé** : recharge la liste et vérifie qu'elle ne
contient que deux copropriétés. Copie le texte exact du message.
Verdicts : message clair → passé ; message générique ou technique →
non bloquant, ANOMALIES (important) ; copropriété créée malgré le blocage →
**bloquant**.

**D.4 [AG] Test par un autre chemin.** Essaie de contourner : depuis la
liste, utilise l'éventuel bouton de duplication ou d'import d'une copropriété
s'il existe ; sinon écris « pas d'autre chemin ».
Attendu : même refus.

**D.5 [SA] Politique « Avertir seulement ».** Passe la politique à **Avertir
seulement**. [AG] recharge, recrée la copropriété 3.
Attendu : création acceptée. Relève s'il y a un avertissement visible pour
l'administrateur (message, bandeau) ou aucun. Jauge : Copropriétés 3 / 2.

**D.6 [SA] Politique « Facturer le dépassement ».** Passe à **Facturer le
dépassement**. Ouvre « Prochaine facture (aperçu) ».
Attendu : la ligne Syndic 49 900 et une ligne de dépassement pour la
copropriété en trop (10 000 selon le catalogue), TVA 18 %.

**D.7 Remise en état de la limite.** [SA] repasse la politique à **Bloquer** pour
la suite. [AG] n'a rien à faire.
Note : la copropriété 3 existe maintenant. Pour la suite, la jauge est 3 / 2 :
la création d'une 4e copropriété doit être refusée tant que l'agence n'a pas
de capacité (voir G.3).

### E. Limites de lots [SA puis AG]

Atteindre 100 lots par clics est trop long. On abaisse la capacité par une
**dérogation** super-admin, ce qui teste aussi cette fonction.

**E.1 [SA] Dérogation négative.** Onglet Abonnement › « Accorder une
dérogation » : capacité **Lots**, quantité **-95**, raison
`Recette 12-11 : abaisser la limite pour test`, date d'expiration demain.
Attendu : « Dérogation accordée », ligne dans le tableau « Dérogations »,
jauge Lots 0 / 5 après rechargement. Si la dérogation négative est refusée, ou
si la jauge ne bouge pas : non bloquant, ANOMALIES, et saute aux étapes E.6.

**E.2 [AG] Créer des lots.** Dans la copropriété 1, onglet **Lots**, crée
`M001` à `M005` (Appartement, tantièmes 10) avec un copropriétaire chacun
(`Kouassi Test`, `Traoré Test`, `Bamba Test`, puis réutilise-les). Crée aussi
`MP1` (Parking) et `MC1` (Cave).
Attendu : Lots 5 / 5 ; les parkings et caves ne consomment rien ; 100 % de la
jauge.

**E.3 [AG] (enforce) Sixième lot refusé.** Crée le lot `M006`.
Attendu : refus avec un message clair (capacité de lots atteinte) ; `M006`
absent de la liste. Même verdict que D.3.

**E.4 [AG] Autres entrées de lots.** Si l'écran propose un import de lots ou une
création en série, essaie d'en ajouter 3.
Attendu : les ajouts sont refusés ou tronqués avec une raison liée au quota,
sans création partielle silencieuse. Sinon : « pas de création en série ».

**E.5 [AG] Mise en vente ne consomme rien.** Dans `BASE/properties`, crée un
bien en mode **Vente**. Relis la jauge.
Attendu : Lots toujours 5 / 5.

**E.6 [SA] Révoquer la dérogation.** Tableau « Dérogations » › Révoquer (avec
confirmation).
Attendu : « Dérogation révoquée », jauge Lots 5 / 100 après rechargement.
**Ne pas oublier cette étape** : sans elle, l'agence reste à 5 lots.

### F. Contrôle de l'affichage des jauges [AG]

**F.1** Sur la page Abonnement, relis Copropriétés et Lots, ainsi que la
carte « Modules » (Syndic seul).
Attendu : valeurs identiques à celles de la fiche super-admin.

**F.2** Cherche une alerte à 80 % ou 100 % (bandeau, cloche, notification).
Attendu : elles sont envoyées par une tâche horaire, tu ne peux pas la
déclencher. Écris seulement ce que tu vois ; l'absence n'est pas un échec.

### G. Demandes complémentaires de copropriété [AG puis SA puis AG]

**G.1 [AG] Première demande.** Page Abonnement › « Demander une extension » :
offre **Copropriété supplémentaire**, quantité 1, message
`Nous reprenons deux résidences à Cocody.` → « Envoyer la demande ».
Attendu : confirmation ; « Mes demandes » affiche une ligne **En attente** avec
colonnes Offre et Quantité. Relève la liste complète des offres proposées dans
le menu déroulant.

**G.2 [AG] Seconde demande.** Même carte, offre **Bloc de 10 lots**, quantité 1,
message `Prévoir une marge de lots.`.

**G.3 [AG] Dépassement bloqué.** La jauge est à 3 / 2 depuis D.5. Tente de
créer la **copropriété 4**.
Attendu (enforce) : refus clair. Le message propose-t-il un lien ou une
indication vers la demande d'extension ? Note oui ou non.

**G.4 [SA] Comment la demande arrive chez le super-admin.** Avant d'ouvrir la
fiche, observe où une demande peut se voir : cloche de notifications, tableau de
bord super-admin, journal des notifications, et **la liste des agences** (le
serveur calcule un nombre de demandes ouvertes par agence : cherche une colonne,
une pastille ou un filtre qui l'affiche). Note **tout signalement spontané**
(oui/non, où). Puis ouvre la fiche de l'agence, onglet
Abonnement, carte des demandes d'extension.
Attendu : les deux demandes sont listées avec demandeur (Aminata Recette),
offre, quantité, message, date, et les actions **Marquer traitée** et **Refuser**.
Constat produit à noter : y a-t-il une vue globale de toutes les demandes de
toutes les agences, ou faut-il ouvrir chaque agence ? Y a-t-il une alerte ?

**G.5 [SA] Traiter la première.** Sur la demande de copropriété : **Marquer
traitée**.
Attendu : « Demande marquée traitée ». **Puis vérifie, sans rien faire de plus,
si la capacité a changé** (jauge Copropriétés, « Packs et extensions »).
Constat produit probable : « Marquer traitée » ne crée pas l'extension, il faut
l'ajouter à la main. Écris exactement ce que tu observes.

**G.6 [SA] Ajouter l'extension.** Si la capacité n'a pas changé : carte
« Packs et extensions › Ajouter » : offre **Copropriété supplémentaire**,
quantité 1. Relis la jauge et « Prochaine facture (aperçu) ».
Attendu : Copropriétés 3 / 3 (la copropriété 3 existait déjà) ; ligne
« Copropriété supplémentaire 10 000 » sur l'aperçu, dépassement disparu.

**G.7 [SA] Refuser la seconde.** Sur la demande de blocs de lots : **Refuser**.
Attendu : « Demande refusée ». L'API accepte une note de traitement :
regarde si l'écran permet de la saisir, et si elle est ensuite visible de
l'agence (G.8).

**G.8 [AG] Ce que voit l'agence.** Recharge « Mes demandes ».
Attendu : la première en **Traitée**, la seconde en **Refusée**. Relève si un
motif ou un message du super-admin est visible, et si l'agence a été prévenue
(cloche, e-mail dans le journal des notifications, bandeau).

**G.9 [AG] Quatrième copropriété.** Retente la copropriété 4.
Attendu (enforce) : toujours refusée (3 / 3). [SA] ajoute une seconde
« Copropriété supplémentaire » ; [AG] recrée la copropriété 4.
Attendu : créée, Copropriétés 4 / 4.

**G.10 [SA] Quantité négative.** Retire une extension : « Packs et
extensions », ligne d'une copropriété supplémentaire › **Retirer à
l'échéance**, raison `Recette 12-11`.
Attendu : « Retrait programmé à l'échéance », l'élément reste actif jusqu'à la
fin de la période en cours, sans remboursement (texte de l'écran).

### H. AG en direct — option payante [SA puis AG]

L'**AG en direct** (console de séance, liens personnels des copropriétaires,
vote en ligne, projection) et sa **visio** sont une extension payante du pack
Syndic : « AG en direct et visio », `EXT_AG_EN_DIRECT`, 20 000 FCFA HT par mois
selon le catalogue (l'écran prime). Sans elle, l'AG classique (convocation,
résolutions, vote saisi par le syndic, procès-verbal) reste disponible ; seule la
couche « en direct » est refusée. Le pack Opérateur intégré l'inclut d'office.

Ces étapes exigent le mode `enforce` (P3). En `warn`, rien n'est refusé : écris
`non joué (mode warn)` pour H.4 et H.6 et ne joue que H.1 à H.3.

**H.1 [SA] Catalogue.** Fiche de l'agence › Abonnement › « Ajouter un pack ou
une extension » : lis **toute** la liste d'offres proposées à cette agence.
Attendu : une offre « AG en direct et visio » avec son prix mensuel. Relève le
nom et le prix exacts. Absente : anomalie **importante**.

**H.2 [SA] Modules et fonctions.** Carte « Modules inclus » de la fiche : l'AG
en direct n'y figure pas tant que l'extension n'est pas ajoutée. Relève ce que
l'écran dit.

**H.3 [AG] Offres vues par l'agence.** Carte « Demander une extension » : relis
la liste des offres.
Attendu : « AG en direct et visio » y figure.

**H.4 [AG] (enforce) Refus sans l'option.** Dans la copropriété 1, crée trois
lots avec copropriétaires si besoin (le plafond de lots est rétabli par E.6).
Onglet **Assemblées** : crée une assemblée **classique** (date : aujourd'hui +
1 heure, lieu `Salle du conseil`) avec une résolution `Approbation des comptes`
(article 24). Ouvre sa fiche et regarde la section **« En direct »**.
Attendu :

- l'assemblée classique se crée et reste utilisable normalement ;
- la section « En direct » n'ouvre ni console, ni visio, ni liens personnels,
  et indique clairement que l'option « AG en direct » n'est pas souscrite, avec
  un moyen de la demander (lien vers la page Abonnement) ;
- si l'écran laisse une action visible (copier un lien, ouvrir la séance), son
  clic est **refusé** avec un message d'option non souscrite, et rien n'est
  créé. Une action qui réussit malgré l'absence d'option est **bloquante**.
  Un message générique ou technique à la place du message d'option est une
  anomalie **importante**.

**H.5 [AG] Demande de l'option.** Clique « Demander l'option » dans l'état de
H.4 : la page Abonnement s'ouvre avec l'offre **AG en direct et visio**
pré-sélectionnée dans « Demander une extension » (adresse avec `?offre=`) et le
champ « Quantité » masqué (l'offre n'a pas de capacité ; la demande part avec
une quantité de 1). Saisis le message `Nous voulons tenir l'AG en direct.` →
« Envoyer la demande ». L'aide sous le sélecteur doit annoncer le prix « par
mois ».
**[SA]** : la demande apparaît dans la fiche ; ajoute l'extension (« Ajouter » :
offre AG en direct et visio, quantité 1) puis **Marquer traitée** la demande.
Relève l'aperçu de facture : une ligne « AG en direct et visio » au prix du
catalogue, TVA 18 %.

**H.6 [AG] (enforce) Accès après l'option.** Recharge (cache des droits de 30 s :
attends si rien ne change). Rouvre la fiche de l'assemblée.
Attendu : la section « En direct » s'ouvre : participants listés, champ de lien
de visioconférence (refuse `http://`, accepte `https://`), « Copier le lien »
d'un copropriétaire, ouverture de la séance, « Projeter ». Ne va pas jusqu'à un
vote réel. La visio (flux vidéo) peut être indisponible faute de serveur de
visio configuré : note-le comme limite d'environnement, pas comme anomalie.

**H.7 [SA] Retrait de l'option.** Retire l'extension (« Retirer immédiatement »,
raison `Recette 12-11`). **[AG]** recharge : la section « En direct » est de
nouveau refusée comme en H.4, et un lien personnel copié en H.6 ne donne plus
accès (message neutre, sans détail sur l'agence).

**H.8 Constat.** Écris dans JOURNAL.md ce que chaque étape a montré. Rien à
ajouter à ANOMALIES.md si tout est conforme.

### I. Gestion de l'abonnement [SA puis AG]

**I.1 [SA] Ajouter un pack.** « Ajouter un pack » : **Agence**.
Attendu : remise de combinaison de 10 % sur l'Agence, total mensuel cohérent
(29 900 − 2 990 + 49 900 + extensions) lu sur l'aperçu.
**[AG]** recharge : en `enforce`, les entrées Gestion locative, CRM, Ventes,
Patrimoine **apparaissent** et leurs adresses s'ouvrent.

**I.2 [SA] Retirer le pack immédiatement.** Retire le pack **Agence** avec
« Retirer immédiatement », raison `Recette 12-11`.
Attendu : « Élément retiré immédiatement ». **[AG]** recharge : ces entrées
**disparaissent** (enforce) et leurs adresses sont de nouveau refusées.

**I.3 [SA] Prolonger l'essai.** « Prolonger » : ajoute quelques jours avec une
raison.
Attendu : « Essai prolongé », date de fin recalculée, visible côté agence.

**I.4 [SA] Lecture seule manuelle.** « Passer en lecture seule » : d'abord sans
motif (refus attendu), puis avec `Recette 12-11 : lecture seule`.
**[AG]** recharge : bandeau de lecture seule avec motif ; les listes et
l'Abonnement restent consultables ; créer une copropriété ou modifier une fiche
est refusé avec un message « abonnement en lecture seule » ; **envoyer une
demande d'extension reste permis**.
**[SA]** « Lever la lecture seule », **[AG]** vérifie que l'écriture revient.

**I.5 [SA] Changer de cycle.** Si le cycle de facturation est modifiable, passe
à **Annuel (11 mois facturés)** puis reviens à **Mensuel** ; lis l'aperçu à
chaque fois. Sinon : « non modifiable ».

### J. Facturation [SA puis AG]

**J.1 [SA]** Lis « Prochaine facture (aperçu) » dans l'état final de
l'abonnement (Syndic, extensions actives). Contrôle l'arithmétique : somme des
lignes HT, TVA à 18 %, total TTC. Les frais de mise en route peuvent n'apparaître
qu'à la première facture réelle : note-le si c'est le cas.

**J.2 [SA]** Onglet Factures de la fiche : aucune facture pendant l'essai.

**J.3 [AG]** Page Facturation : aucune facture. **Ne cliquer aucun bouton de
paiement.** Note seulement si un bouton « Payer » est visible ou non.

### K. Isolement et nettoyage

**K.1 [AG] Accès interdit.** Tape `/admin/tenants` dans l'adresse.
Attendu : refus ou redirection, aucune liste d'agences affichée.

**K.2 [AG] Autre agence.** Si Baba te donne l'identifiant d'une autre agence,
tape `/tenant/<AUTRE>/syndics`. Attendu : refus ou 404, aucune donnée. Sinon :
non joué.

**K.3 [SA] Neutraliser l'agence.** Fiche › « Suspendre ». Avant cela, retire
les extensions et le pack avec « Retirer immédiatement » (raison
`Agence de recette`), afin qu'aucune facture ne sorte à la fin de l'essai.
Attendu : l'agence ne peut plus se connecter. **Ne rien supprimer.**

**K.4** Remplis la conclusion de JOURNAL.md : mode constaté, nombre d'étapes
passées, échouées, bloquées, non jouées, liste des ANO-SYN, liste des constats
produit.

---

## 5. Ce que ce scénario ne couvre pas

Trilinguisme et arabe (RTL), affichage mobile, rôles limités d'un collaborateur,
portail copropriétaire, appels de charges et encaissements de bout en bout,
paiement en ligne réel, alertes de consommation à 80 % et 100 % (tâche horaire),
visio réelle. Ces sujets ont leurs propres scénarios dans
`docs/recette/packs/SCENARIO_PACK_SYNDIC.md` et
[SCENARIO_SYNDIC_AG_EN_DIRECT.md](../SCENARIO_SYNDIC_AG_EN_DIRECT.md).
