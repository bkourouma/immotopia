# Spécification 048 — Paiement instantané PI-SPI (BCEAO)

**Statut** : brouillon du 2026-11-09, avant réalisation · **Plan** : [plan.md](./plan.md) ·
**Tâches** : [tasks.md](./tasks.md) · **Étude et niveaux de preuve** :
[docs/integrations/PI-SPI-ETUDE.md](../../docs/integrations/PI-SPI-ETUDE.md)

Décisions prises : modèle **agences clientes directes** (D1), participant de type **opérateur de
monnaie électronique** (D2, opérateur à choisir). Ouvertes : D3 (mTLS du webhook), D4 (alias demandé au
payeur), D5 (frais de l'API Business) ; voir le plan.

## 1. Objet

Permettre à une agence, à un syndic ou à ImmoTopia d'encaisser (et, plus tard, de décaisser) via
PI-SPI, la plateforme de paiement instantané de la BCEAO, avec une **demande de paiement** que le
payeur approuve dans son application bancaire ou son portefeuille. Le paiement est irrévocable à
l'état `IRREVOCABLE`.

Hors objet : tout ce que PI-SPI interdit ou ne couvre pas (prélèvement automatique, QR dans un
paiement en ligne, devises autres que le FCFA, pays hors UEMOA, chargeback) ; la remise de fonds
détenus par ImmoTopia (ImmoTopia ne détient jamais les fonds).

## 2. Acteurs

- **Agence / syndic (client business, type B)** : détient un compte chez un participant, un
  certificat et des identifiants propres ; configure son compte dans ImmoTopia.
- **Gestionnaire** : suit les encaissements, relance, décaisse, tranche les cas à revoir.
- **Locataire, copropriétaire, propriétaire (payeur ou bénéficiaire, type P le plus souvent)**.
- **Participant** : banque ou opérateur de monnaie électronique qui expose l'API Business.
- **Super-administrateur ImmoTopia** : compte plateforme pour les abonnements.

## 3. Récits utilisateur

### US1 — Le locataire paie son loyer par demande de paiement (priorité 1, lot P2)

En tant que locataire, depuis mon portail ou un lien de paiement, je saisis mon numéro (ou alias), je
vérifie que le nom affiché est le mien, puis j'approuve la demande dans mon application ; la page
m'indique le résultat en direct.

Scénarios :

1. **Succès** : saisie valide, approbation avant 3 minutes → statut `IRREVOCABLE`, paiement créé,
   échéances affectées, quittance émise comme aujourd'hui.
2. **Alias inconnu** : rejet immédiat (`BE23`), message clair, saisie corrigeable.
3. **Refus ou expiration** : statut `FAILED` ou `EXPIRED`, aucune écriture comptable, possibilité de
   relancer sans doublon.
4. **Rejeu du même événement** : aucun double crédit.
5. **Fermeture de la page** : le paiement approuvé plus tard est quand même rapproché.

### US2 — Le gestionnaire configure le compte PI-SPI de son agence (priorité 1, lot P1)

En tant que gestionnaire autorisé, je renseigne les éléments fournis par mon participant, je teste la
connexion et je suis averti avant l'expiration de mon certificat. Aucun secret n'est jamais
réaffiché.

### US3 — Le copropriétaire paie un appel de charges (priorité 2, lot P3)

Même parcours que US1 sur le portail copropriétaire et le lien « Payer cet appel », avec un compte
**par copropriété**, sans repli sur le compte du cabinet.

### US4 — Le syndic envoie les appels en masse avec escompte (priorité 2, lot P3)

En tant que syndic, j'envoie l'appel trimestriel à tous les copropriétaires en une demande groupée,
avec une remise si le paiement a lieu avant la date limite ; je suis la progression par lot.

### US5 — ImmoTopia encaisse l'abonnement d'une agence (priorité 3, lot P4)

Mêmes règles que US1 sur le compte plateforme d'ImmoTopia ; un règlement n'avance l'abonnement que
d'une période, au règlement confirmé.

### US6 — Le gestionnaire reverse un propriétaire instantanément (priorité 3, lot P5)

Après double validation, le reversement est envoyé à l'alias du propriétaire ; le nom du bénéficiaire
est confirmé avant l'envoi ; le reversement n'est marqué payé qu'à `IRREVOCABLE`.

### US7 — Les encaissements non sollicités sont reconnus (priorité 3, lot P6)

Un paiement reçu sur l'alias d'une copropriété ou d'un site, par QR sur place ou virement direct, est
rapproché par référence ; un paiement non reconnu entre dans une file de revue.

## 4. Exigences fonctionnelles

**Rail et statuts**

- FR-001 Le rail instantané est distinct du rail à page hébergée ; les deux coexistent par agence.
- FR-002 États PI-SPI normalisés : `INITIE`, `ENVOYE`, `CONFIRME` → en attente ; `IRREVOCABLE` →
  réussi ; `REJETE` → échoué ; `ANNULE` → annulé ; échéance dépassée → expiré ; état inconnu → en
  attente avec avertissement.
- FR-003 **Seul `IRREVOCABLE` crédite.** Aucun crédit sur un webhook, une redirection ou une saisie.
- FR-004 Un succès ne redescend jamais ; une contradiction tardive passe en revue manuelle.
- FR-005 Le montant confirmé par PI-SPI est comparé au montant attendu ; un écart passe en revue.

**Identifiants et idempotence**

- FR-010 `txId` = notre code de paiement (≤ 25 caractères, `A-Za-z0-9_-`), unique ; un rejeu `DU03`
  relit le statut et ne crée rien.
- FR-011 Chaque événement entrant est journalisé une seule fois (unicité `txId` + code d'événement
  - `endToEndId`) ; le rejeu est sans effet.

**Webhook**

- FR-020 Le corps brut est conservé ; `X-Signature` (HMAC-SHA256) est vérifié en temps constant avant
  toute lecture.
- FR-021 Si D3 l'exige, le certificat client est vérifié contre la CA de la BCEAO à l'entrée (nginx).
- FR-022 Le webhook ne sert que de déclencheur : le statut est relu serveur à serveur avant écriture.
- FR-023 La réponse 200 n'est rendue qu'après journalisation durable ; une signature invalide répond
  sans corps utile et ne crée aucun enregistrement.

**Payeur**

- FR-030 Saisie d'un numéro ou d'un alias ; recherche ; nom et pays affichés pour confirmation avant
  l'envoi de la demande (mode `confirmation: true`).
- FR-031 Compte à rebours cohérent avec l'échéance ; relance possible ; jamais de redirection externe.
- FR-032 Le numéro n'est jamais conservé en clair (masqué + empreinte) ; les recherches d'alias sont
  limitées en débit et journalisées.

**Configuration par agence**

- FR-040 Hôtes, URL de jeton, limites et délais sont propres à chaque agence, jamais en dur.
- FR-041 Certificat, clé, identifiants OAuth, clé API et secret de webhook sont chiffrés en base,
  jamais renvoyés par l'API, jamais journalisés ; alerte d'expiration à 30 jours.
- FR-042 Un droit RBAC dédié protège la configuration ; un test de connexion est disponible.

**Rapprochement**

- FR-050 Les demandes en attente sont relues à échéance et par la tâche planifiée (filet).
- FR-051 Un paiement reçu non sollicité est affecté par référence ou alias ; sinon file de revue.

**Sortant**

- FR-060 Un reversement sortant exige une confirmation du nom du bénéficiaire, une double validation
  interne et un plafond par agence ; il est journalisé.
- FR-061 Un échec ne marque pas le reversement payé.

**Transversal**

- FR-070 Aucune route ni modèle sans garde tenant ; textes via `t()` ; propriétés logiques (RTL).
- FR-071 Le classeur des fonctionnalités est mis à jour dans chaque PR qui change un écran ou une route.

## 5. Entités (aperçu, détail dans le plan)

- Configuration PI-SPI par agence et par copropriété (secrets chiffrés).
- Colonnes ajoutées aux trois checkouts : rail, alias payeur masqué, `endToEndId`, échéance, raison
  de statut.
- Journal des événements PI-SPI.
- Plus tard : file de revue des paiements non reconnus.

## 6. Cas limites

- Webhook arrivé avant la réponse de création ; webhook perdu ; événements dans le désordre.
- Deux demandes ouvertes pour la même échéance (reprise d'une demande récente, comme aujourd'hui).
- Montant partiel ou excédentaire : mêmes règles d'avance que l'existant.
- Certificat expiré ou révoqué en cours de journée : paiement refusé proprement, alerte au
  gestionnaire.
- Participant indisponible : erreur lisible, aucun crédit, aucune demande fantôme.
- Plafond du compte de l'opérateur atteint : erreur du participant remontée au gestionnaire.
- Le payeur change d'avis après approbation : aucun retour possible ; passer par un retour de fonds.

## 7. Exigences non fonctionnelles

- Sécurité : conforme à `docs/governance/SECURITY.md` ; une section dédiée sera ajoutée.
- Disponibilité : un échec PI-SPI n'empêche jamais le rail PaySecureHub ni la saisie manuelle.
- Observabilité : événements d'audit à chaque démarrage, rapprochement, revue et décaissement.
- Performance : relecture d'une RTP en attente sous 15 s ; aucune tâche ne bloque le serveur.

## 8. Critères de réussite

- SC-001 Un paiement sandbox de bout en bout (US1) passe dans le navigateur avec rejeu sans double
  crédit.
- SC-002 Deux agences configurées côte à côte restent étanches (test d'isolation).
- SC-003 Aucun secret n'apparaît dans une réponse d'API, un journal ou un fichier statique.
- SC-004 Un paiement réel de faible montant aboutit chez l'agence pilote, avec plafond du compte
  connu.

## 9. Questions ouvertes

1. **Opérateur** : lequel, et figure-t-il parmi les API Business homologuées ? (P0)
2. **Plafond** d'un compte professionnel de monnaie électronique : solde, flux mensuels, par opération.
3. **Frais** de l'API Business et frais éventuels pour le payeur (D5).
4. **mTLS** : exigé ou HMAC seul accepté (D3).
5. **Alias payeur** : le numéro de téléphone est-il accepté en `payeurAlias` (D4) ?
6. **Mandat** de l'agence à ImmoTopia et responsabilité en cas d'erreur d'alias (juridique).
7. **Texte de l'Avis BCEAO n° 0019** et grille tarifaire des entreprises : non lus à ce jour.
8. **Wave** : statut réel dans PI-SPI.
