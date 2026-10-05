import React, { useEffect, useState } from 'react';
import { Link, Route, Routes, useSearchParams } from 'react-router-dom';
import { Dashboard } from '../../pages/Dashboard';
import { Properties } from '../../pages/properties/Properties';
import { PropertyDetail } from '../../pages/properties/PropertyDetail';
import { Installments } from '../../pages/rental/Installments';
import { Penalties } from '../../pages/rental/Penalties';
import { Payments } from '../../pages/rental/Payments';
import { BalanceClients } from '../../pages/finance/BalanceClients';
import { BalanceAgee } from '../../pages/finance/BalanceAgee';
import { Releve } from '../../pages/finance/Releve';
import { Facturation } from '../../pages/finance/Facturation';
import { Fournisseurs } from '../../pages/finance/Fournisseurs';
import { BalanceFournisseurs } from '../../pages/finance/BalanceFournisseurs';
import { FactureFournisseur } from '../../pages/finance/FactureFournisseur';
import { Chantiers } from '../../pages/finance/Chantiers';
import { ChantierDetail } from '../../pages/finance/ChantierDetail';
import { PieceDeCaisse } from '../../pages/finance/PieceDeCaisse';
import { FileDeValidation } from '../../pages/finance/FileDeValidation';
import { BudgetChantier } from '../../pages/finance/BudgetChantier';
import { BonsDeCommande } from '../../pages/finance/BonsDeCommande';
import { BonDeCommande } from '../../pages/finance/BonDeCommande';
import { TableauDeBordChantiers } from '../../pages/finance/TableauDeBordChantiers';
import { BauxDeTerrain } from '../../pages/finance/BauxDeTerrain';
import { BailDeTerrain } from '../../pages/finance/BailDeTerrain';
import { StockMagasin } from '../../pages/finance/StockMagasin';
import { StockInventaire } from '../../pages/finance/StockInventaire';
import { StockPreneurs } from '../../pages/finance/StockPreneurs';
import { StockControle } from '../../pages/finance/StockControle';
import { StockWhatsapp } from '../../pages/finance/StockWhatsapp';
import { StockComptagesTerrain } from '../../pages/finance/StockComptagesTerrain';
import { Documents } from '../../pages/rental/Documents';
import { DocumentTemplates } from '../../pages/documents/DocumentTemplates';
import { CalendarPage } from '../../pages/crm/Calendar';
import { PatrimoineOverviewPage } from '../../pages/patrimoine/PatrimoineOverviewPage';
import { WorkProgramsPage } from '../../pages/patrimoine/work-programs/WorkProgramsPage';
import { SceneDefilementListe, SceneDefilementDetail } from './SceneDefilement';
import { useScrollRestoration } from '../../hooks/useScrollRestoration';
import { installerFausseApi, retirerFausseApi, type Scenario } from './mock-api';
import AuthContext from '../../context/AuthContext';
import { AppNavigation } from '../../components/shell/AppNavigation';
import { getNavigation } from '../../navigation/model';
import type { PersonaId } from '../../navigation/model';
import type { AuthContextType } from '../../types/auth-types';
import {
  DataCard,
  StateBlock,
  StatCard,
  StatusTag,
  MoneyValue,
  PageHeader,
  SkeletonList,
  SkeletonTable
} from '../../components/primitives';

/**
 * Atelier — vérification visuelle sans authentification.
 *
 * Le problème qu'il résout : les tests prouvent le comportement, pas
 * l'apparence. Grille, hauteurs de contrôle, feuille de filtres, ratio réservé
 * des vignettes, contraste — rien de tout cela n'est visible depuis une suite
 * jsdom, et l'application réelle demande un mot de passe que personne ne devrait
 * avoir à taper pour regarder un écran.
 *
 * L'atelier monte donc les **vrais écrans**, avec une fausse API branchée sous
 * `apiClient`. Services, intercepteurs, cache et composants s'exécutent comme en
 * production ; seule la source des octets change.
 *
 * Les scènes vivent sous `/atelier/*`, dans le routeur de l'application et non
 * dans un routeur imbriqué — React Router l'interdit, et l'atelier l'a appris de
 * la seule façon honnête : à l'écran. L'écran reçoit donc son agence par
 * `useParams()` et son état de liste par de vrais paramètres d'URL, exactement
 * comme en production.
 *
 * **Il ne part jamais en production.** La garde `import.meta.env.DEV` est posée
 * sur l'IMPORT de ce module dans `App.tsx`, pas sur la route. La poser sur la
 * seule route laissait l'import dynamique au niveau du module, et le build de
 * production contenait alors un chunk `Atelier-*.js` complet — constaté en
 * inspectant le bundle. Une étape de CI vérifie désormais l'absence.
 *
 * Ce qu'il ne couvre PAS, et qui reste du ressort de la recette authentifiée :
 * les droits et rôles réels, les données d'une vraie agence, les parcours qui
 * traversent plusieurs écrans, les mutations et leurs effets de bord, et le
 * rendu sur un terminal Android réel — le §10 le demande explicitement.
 */

type Scene = {
  id: string;
  titre: string;
  description: string;
  scenario: Scenario;
  /** Chemin relatif à `/atelier/`, paramètres de recherche compris. */
  chemin: string;
};

const AGENCE = 'agence-demo';
const TABLEAU = 'dashboard';
const BIENS = 'tenant/' + AGENCE + '/properties';
const FICHE_BIEN = BIENS + '/1';
const FICHE_IMMEUBLE = BIENS + '/4';
const ECHEANCES = 'tenant/' + AGENCE + '/rental/leases/bail-demo/installments';
const ECHEANCES_GLOBAL = 'tenant/' + AGENCE + '/rental/installments';
const PENALITES = 'tenant/' + AGENCE + '/rental/penalties';
const PAIEMENTS = 'tenant/' + AGENCE + '/rental/payments';
const DOCUMENTS = 'tenant/' + AGENCE + '/rental/documents';
const MODELES = 'tenant/' + AGENCE + '/documents/templates';
const CALENDRIER = 'tenant/' + AGENCE + '/crm/calendar';
const PATRIMOINE = 'tenant/' + AGENCE + '/patrimoine';
const TRAVAUX_CHEMIN = 'tenant/' + AGENCE + '/patrimoine/work-programs';
const BALANCE = 'tenant/' + AGENCE + '/finance/balance-clients';
const BALANCE_AGEE = 'tenant/' + AGENCE + '/finance/balance-agee';
const RELEVE = 'tenant/' + AGENCE + '/finance/comptes/00000000-0000-4000-8000-000000000001';
const FACTURATION = 'tenant/' + AGENCE + '/finance/facturation';
const FOURNISSEURS = 'tenant/' + AGENCE + '/finance/fournisseurs';
const BALANCE_FOURNISSEURS = FOURNISSEURS + '/balance';
const FACTURE_FOURNISSEUR = 'tenant/' + AGENCE + '/finance/factures-fournisseurs?fournisseur=frs-02';
const CHANTIERS = 'tenant/' + AGENCE + '/finance/chantiers';
const CHANTIER_DETAIL = CHANTIERS + '/chantier-01';
const PIECE_DE_CAISSE = 'tenant/' + AGENCE + '/finance/pieces-de-caisse?chantierId=chantier-01';
const VALIDATION = 'tenant/' + AGENCE + '/finance/validation';
// Lot 3. Le chantier « riche » de la maquette est celui qui porte un budget,
// des avenants et une alerte : c'est lui qui montre quelque chose.
const BUDGET_CHANTIER = 'tenant/' + AGENCE + '/finance/chantiers/chantier-riche-01/budget';
const BONS_DE_COMMANDE = 'tenant/' + AGENCE + '/finance/bons-de-commande';
const BON_DE_COMMANDE_NOUVEAU = BONS_DE_COMMANDE + '/nouveau?chantierId=chantier-riche-01';
const TABLEAU_DE_BORD_CHANTIERS = 'tenant/' + AGENCE + '/finance/tableau-de-bord-chantiers';
// Lot 4. Le bail « riche » de la maquette est celui qui porte un paiement
// valide et plusieurs constatations : c'est lui qui montre le mecanisme.
const BAUX_DE_TERRAIN = 'tenant/' + AGENCE + '/finance/baux-terrain';
const BAIL_DE_TERRAIN = BAUX_DE_TERRAIN + '/bail-riviera-01';
const SIDEBAR = 'coquille/sidebar';
// Lot 040, contrôle du stock. Les bancs : `finance-mock-stock-controle.ts`
// (contexte terrain, preneurs, alertes, indicateurs, réglages) et
// `finance-mock-stock-inventaire.ts` (Magasin et inventaires). Le scénario
// `partiel` y figure un magasinier, sans alertes ni valeurs.
const STOCK = 'tenant/' + AGENCE + '/finance/stock';
const STOCK_MAGASIN = STOCK + '/magasin';
const STOCK_INVENTAIRE_CLOS = STOCK + '/inventaire?inventaire=comptage-clos-03';
const STOCK_PRENEURS = STOCK + '/preneurs';
const STOCK_CONTROLE = STOCK + '/controle';
// Lot 041, inventaire par WhatsApp. Le banc : `finance-mock-stock-whatsapp.ts`
// (le contexte terrain reste celui du lot 040). Le lieu de la Riviera y est en
// comptage : les comptages terrain le masquent pour un comptable.
const STOCK_WHATSAPP = STOCK + '/whatsapp';
const STOCK_COMPTAGES_TERRAIN = STOCK + '/comptages-terrain?lieu=lieu-riviera-02';

const SCENES: Scene[] = [
  {
    id: 'stock-magasin-magasinier',
    titre: 'Magasin, téléphone, magasinier sans valeurs',
    description:
      'À regarder à 375 px. Les gestes permis au magasinier seulement, aucun montant, aucune quantité attendue pendant un comptage.',
    scenario: 'partiel',
    chemin: STOCK_MAGASIN
  },
  {
    id: 'stock-inventaire-clos',
    titre: 'Inventaire clos à justifier',
    description:
      'Comptage clos : les écarts apparaissent, chacun attend son motif ; les non comptés se mettent à l’écart avant la validation.',
    scenario: 'nominal',
    chemin: STOCK_INVENTAIRE_CLOS
  },
  {
    id: 'stock-controle',
    titre: 'Contrôle du stock — alertes à traiter',
    description:
      'Trois alertes ouvertes, dont un cumul du mois ; chaque objet mène à son écran. Titre et message viennent du serveur.',
    scenario: 'nominal',
    chemin: STOCK_CONTROLE
  },
  {
    id: 'stock-controle-alerte',
    titre: 'Contrôle du stock — alerte ouverte depuis l’accueil',
    description: 'Le lien de la file « À traiter » : l’alerte est mise en évidence et défilée en vue.',
    scenario: 'nominal',
    chemin: STOCK_CONTROLE + '?alerte=alerte-sortie-02'
  },
  {
    id: 'stock-controle-indicateurs',
    titre: 'Contrôle du stock — indicateurs',
    description: 'Six mois, par mois puis par lieu ; un mois sans inventaire validé affiche « — », jamais 0 %.',
    scenario: 'nominal',
    chemin: STOCK_CONTROLE + '?onglet=indicateurs'
  },
  {
    id: 'stock-controle-reglages',
    titre: 'Contrôle du stock — réglages de contrôle',
    description: 'Un seuil désactivé, des postes « matériaux » retenus faute de choix, la date de modification.',
    scenario: 'nominal',
    chemin: STOCK_CONTROLE + '?onglet=reglages'
  },
  {
    id: 'stock-controle-magasinier',
    titre: 'Contrôle du stock — magasinier',
    description:
      'Ni alertes ni valeurs : l’écran réservé, et le chemin vers le Magasin. Aucune route d’alertes appelée.',
    scenario: 'partiel',
    chemin: STOCK_CONTROLE
  },
  {
    id: 'stock-preneurs',
    titre: 'Carnet des preneurs',
    description: 'Trois preneurs, dont un désactivé et un sans téléphone ; l’encadré sur les données personnelles.',
    scenario: 'nominal',
    chemin: STOCK_PRENEURS
  },
  {
    id: 'stock-whatsapp-administrateur',
    titre: 'WhatsApp, administrateur',
    description:
      'Passerelle de recette (journal et simulateur), quota à 83 % ; trois inscriptions : en attente, active avec un chantier devenu inéligible, révoquée. Aucun numéro en clair.',
    scenario: 'nominal',
    chemin: STOCK_WHATSAPP
  },
  {
    id: 'stock-comptages-terrain-comptable',
    titre: 'Comptages terrain, comptable pendant un comptage',
    description:
      'Le lieu de la Riviera est en comptage : « Comptage en cours » à la place du stock théorique, aucune valeur ni écart ; rappel des non comptés, une photo retirée.',
    scenario: 'nominal',
    chemin: STOCK_COMPTAGES_TERRAIN
  },
  {
    id: 'stock-preneurs-vide',
    titre: 'Carnet des preneurs — vide',
    description: 'Le carnet invite à ajouter les chefs d’équipe et les tâcherons.',
    scenario: 'vide',
    chemin: STOCK_PRENEURS
  },
  {
    id: 'bail-de-terrain',
    titre: 'Bail de terrain — le mecanisme des douze mois',
    description:
      'On paie une fois par an, d’avance, et la charge se repand sur douze mois. L’ecran dit ce qui a ete paye, ce qui est deja consomme, et ce qu’il reste — jamais le solde brut, qui est negatif et ne se lit pas.',
    scenario: 'nominal',
    chemin: BAIL_DE_TERRAIN
  },
  {
    id: 'baux-de-terrain',
    titre: 'Baux de terrain — liste',
    description:
      'Les terrains loues par l’entreprise, leur loyer annuel, le poste de depense qui recoit la charge, et les chantiers qui en dependent.',
    scenario: 'nominal',
    chemin: BAUX_DE_TERRAIN
  },
  {
    id: 'tableau-de-bord-chantiers',
    titre: 'Tableau de bord des chantiers — nominal',
    description:
      'Budget initial, revise, engage, realise et avancement, en un seul appel. Le code couleur porte sur l’ecart contre le revise, jamais contre l’initial.',
    scenario: 'nominal',
    chemin: TABLEAU_DE_BORD_CHANTIERS
  },
  {
    id: 'budget-chantier',
    titre: 'Budget de chantier — initial, revise et avenants',
    description:
      'Un avenant valide de +1 200 000 compte dans le revise ; un avenant encore en brouillon, de -300 000, ne compte pour rien. C’est la regle que cet ecran doit rendre lisible.',
    scenario: 'nominal',
    chemin: BUDGET_CHANTIER
  },
  {
    id: 'bons-de-commande',
    titre: 'Bons de commande — liste filtrable',
    description:
      'Le statut decide (brouillon, emis, annule) et l’etat de facturation (non facture, partiel, solde) sont deux colonnes distinctes : la seconde est calculee, jamais stockee.',
    scenario: 'nominal',
    chemin: BONS_DE_COMMANDE
  },
  {
    id: 'bon-de-commande-nouveau',
    titre: 'Bon de commande — saisie',
    description:
      'Lignes par poste de depense, total calcule. L’emission est irreversible et le dit avant : c’est elle qui fait entrer le bon dans l’engage.',
    scenario: 'nominal',
    chemin: BON_DE_COMMANDE_NOUVEAU
  },
  {
    id: 'balance-fournisseurs',
    titre: 'Balance fournisseurs — nominal',
    description:
      'Le miroir de la balance clients : ce que l’agence doit, par fournisseur. Deux soldes negatifs — des acomptes verses.',
    scenario: 'nominal',
    chemin: BALANCE_FOURNISSEURS
  },
  {
    id: 'fournisseurs',
    titre: 'Fournisseurs — nominal',
    description: 'Dix fournisseurs, dont un inactif et un rattache a un prestataire de maintenance deja connu.',
    scenario: 'nominal',
    chemin: FOURNISSEURS
  },
  {
    id: 'facture-fournisseur',
    titre: 'Facture fournisseur — saisie et imputation',
    description: 'L’ecart d’imputation s’affiche en direct, et l’enregistrement reste bloque tant qu’il n’est pas nul.',
    scenario: 'nominal',
    chemin: FACTURE_FOURNISSEUR
  },
  {
    id: 'chantiers',
    titre: 'Chantiers — nominal',
    description:
      'Un chantier se cree sans bien prealable : c’est ce qui debloque le cas des chantiers sur terrain loue.',
    scenario: 'nominal',
    chemin: CHANTIERS
  },
  {
    id: 'chantier-detail',
    titre: 'Chantier — cout reel et imputations',
    description:
      'Le cout arrive calcule par le serveur, avec ses sous-totaux par poste. Aucun champ ne permet de le saisir.',
    scenario: 'nominal',
    chemin: CHANTIER_DETAIL
  },
  {
    id: 'piece-de-caisse',
    titre: 'Piece de caisse — emission',
    description: 'Formulaire court, numerotation sequentielle, et un bon imprimable.',
    scenario: 'nominal',
    chemin: PIECE_DE_CAISSE
  },
  {
    id: 'validation',
    titre: 'Pieces a valider — la file du dirigeant',
    description: 'Onze pieces des trois natures, saisies par quatre personnes. Chaque ligne nomme son saisisseur.',
    scenario: 'nominal',
    chemin: VALIDATION
  },
  {
    id: 'validation-vide',
    titre: 'Pieces a valider — file a jour',
    description: 'Rien n’attend : une bonne nouvelle, pas un etat d’erreur.',
    scenario: 'vide',
    chemin: VALIDATION
  },
  {
    id: 'balance-clients',
    titre: 'Balance clients — nominal',
    description:
      'La réserve de la cliente, levée : dix locataires, un total de contrôle en pied, et un solde créditeur pour celle qui a payé d’avance.',
    scenario: 'nominal',
    chemin: BALANCE
  },
  {
    id: 'balance-clients-vide',
    titre: 'Balance clients — agence qui démarre',
    description: 'Aucun compte ouvert : une invitation, pas une panne.',
    scenario: 'vide',
    chemin: BALANCE
  },
  {
    id: 'balance-clients-erreur',
    titre: 'Balance clients — panne',
    description: 'L’agrégat ne répond pas : l’écran le dit et propose de réessayer.',
    scenario: 'erreur',
    chemin: BALANCE
  },
  {
    id: 'balance-agee',
    titre: 'Balance âgée — nominal',
    description: 'La même créance, ventilée par ancienneté. Les cinq tranches somment au solde de la ligne.',
    scenario: 'nominal',
    chemin: BALANCE_AGEE
  },
  {
    id: 'releve',
    titre: 'Relevé de compte — nominal',
    description:
      'Une année de mouvements, dont une avance reçue puis absorbée par l’échéance suivante : le solde passe créditeur, puis revient.',
    scenario: 'nominal',
    chemin: RELEVE
  },
  {
    id: 'releve-vide',
    titre: 'Relevé de compte — période sans mouvement',
    description:
      'Le cas que la copropriété affiche faux : ouverture et clôture sont celles de l’époque, jamais le solde d’aujourd’hui.',
    scenario: 'vide',
    chemin: RELEVE
  },
  {
    id: 'facturation',
    titre: 'Facturation du mois — compte rendu',
    description:
      'Les baux facturés, les exclus avec leur motif en français, les avances imputées. Chaque ligne porte un nom, jamais un identifiant.',
    scenario: 'nominal',
    chemin: FACTURATION
  },
  {
    id: 'facturation-vide',
    titre: 'Facturation du mois — aucune campagne',
    description: 'Avant le premier lancement : l’écran propose, il ne reproche rien.',
    scenario: 'vide',
    chemin: FACTURATION
  },
  {
    id: 'sidebar-proprietaire',
    titre: 'Sidebar — portail propriétaire',
    description:
      'Quatre entrées sous deux titres. « Plus » reste sans intertitre : c’est un contenant, pas un domaine.',
    scenario: 'nominal',
    chemin: SIDEBAR + '?persona=proprietaire'
  },
  {
    id: 'sidebar',
    titre: 'Sidebar — intertitres de domaine',
    description:
      'Les onze entrées du collaborateur sous leurs six titres de domaine. Le titre ne se clique pas et ne replie rien.',
    scenario: 'nominal',
    chemin: SIDEBAR
  },
  {
    id: 'tableau-de-bord',
    titre: 'Tableau de bord — nominal',
    description: 'Six tuiles, neuf graphiques, une file de travail. Tout point de donnée mène à sa liste filtrée.',
    scenario: 'nominal',
    chemin: TABLEAU
  },
  {
    id: 'tableau-de-bord-partiel',
    titre: 'Tableau de bord — permissions partielles',
    description:
      'Sans CRM, maintenance ni copropriété : les tuiles concernées rendent « — » et leurs cartes disparaissent.',
    scenario: 'partiel',
    chemin: TABLEAU
  },
  {
    id: 'tableau-de-bord-vide',
    titre: 'Tableau de bord — agence qui démarre',
    description: 'Tout est à zéro sans être interdit : ni panne, ni tiret, et rien à traiter.',
    scenario: 'vide',
    chemin: TABLEAU
  },
  {
    id: 'tableau-de-bord-chargement',
    titre: 'Tableau de bord — chargement',
    description: 'Une seconde et demie : les tuiles tiennent leur place, les cartes rendent leur squelette.',
    scenario: 'lent',
    chemin: TABLEAU
  },
  {
    id: 'tableau-de-bord-erreur',
    titre: 'Tableau de bord — panne',
    description: 'L’API répond 500 : un bloc d’erreur avec un moyen de réessayer, pas une page blanche.',
    scenario: 'erreur',
    chemin: TABLEAU
  },
  {
    id: 'biens',
    titre: 'Biens — nominal',
    description: 'Six biens, dont un titre trop long, un immeuble sans prix et deux sans photo.',
    scenario: 'nominal',
    chemin: BIENS
  },
  {
    id: 'fiche-bien',
    titre: 'Fiche d’un bien',
    description: 'Titre long, trois actions et un fil d’Ariane : l’en-tête ne doit plus écraser le titre (P2).',
    scenario: 'nominal',
    chemin: FICHE_BIEN
  },
  {
    id: 'fiche-immeuble',
    titre: 'Fiche d’un immeuble — appartements',
    description: 'Le tableau des appartements : titres longs, colonnes prioritaires, cartes sous 992 px (§5.1).',
    scenario: 'nominal',
    chemin: FICHE_IMMEUBLE
  },
  {
    id: 'biens-filtre',
    titre: 'Biens — filtré par l’URL',
    description: 'Le filtre vient de l’adresse : l’écran doit être restaurable par son URL seule.',
    scenario: 'nominal',
    chemin: BIENS + '?status=RENTED'
  },
  {
    id: 'biens-chargement',
    titre: 'Biens — chargement',
    description: 'Réponse retardée d’une seconde et demie : le squelette doit tenir la place du contenu.',
    scenario: 'lent',
    chemin: BIENS
  },
  {
    id: 'biens-vide',
    titre: 'Biens — aucune donnée',
    description: 'Portefeuille vide, aucun filtre : l’écran doit proposer de créer.',
    scenario: 'vide',
    chemin: BIENS
  },
  {
    id: 'biens-aucun-resultat',
    titre: 'Biens — aucun résultat',
    description: 'Un filtre ne ramène rien : l’écran doit proposer d’élargir, pas de créer.',
    scenario: 'nominal',
    chemin: BIENS + '?q=zzzzz'
  },
  {
    id: 'biens-erreur',
    titre: 'Biens — panne',
    description: 'L’API répond 500 : message lisible et moyen de réessayer.',
    scenario: 'erreur',
    chemin: BIENS
  },
  {
    id: 'echeances',
    titre: 'Échéances — bail',
    description: 'Six mois, dont un partiel et un en retard avec pénalités. Actions de génération visibles.',
    scenario: 'nominal',
    chemin: ECHEANCES
  },
  {
    id: 'echeances-global',
    titre: 'Échéances — toutes agences confondues',
    description: 'Hors contexte de bail : ni génération, ni recalcul, ni suppression.',
    scenario: 'nominal',
    chemin: ECHEANCES_GLOBAL
  },
  {
    id: 'echeances-retard',
    titre: 'Échéances — en retard seulement',
    description: 'Filtre porté par l’URL, appliqué par le serveur.',
    scenario: 'nominal',
    chemin: ECHEANCES + '?overdue=true'
  },
  {
    id: 'echeances-vide',
    titre: 'Échéances — aucune',
    description: 'Bail sans échéances : l’écran doit renvoyer vers la génération.',
    scenario: 'vide',
    chemin: ECHEANCES
  },
  {
    id: 'penalites',
    titre: 'Pénalités — nominal',
    description:
      'Quatre pénalités : une brute, une ajustée avec justificatif, une raison en texte ancien, un retard de 150 jours.',
    scenario: 'nominal',
    chemin: PENALITES
  },
  {
    id: 'penalites-vide',
    titre: 'Pénalités — aucune',
    description: 'Aucun retard : l’écran doit le dire sans alarmer.',
    scenario: 'vide',
    chemin: PENALITES
  },
  {
    id: 'paiements',
    titre: 'Paiements — nominal',
    description: 'Quatre paiements : un non affecté, un partiel, un versé au dépôt, un échoué.',
    scenario: 'nominal',
    chemin: PAIEMENTS
  },
  {
    id: 'documents',
    titre: 'Documents — nominal',
    description: 'Cinq documents, dont un sans titre, un titre très long et un annulé.',
    scenario: 'nominal',
    chemin: DOCUMENTS
  },
  {
    id: 'modeles-documents',
    titre: 'Modèles de documents — nominal',
    description:
      'Quatre modèles : un par défaut, un inactif, un nom long à onze variables, un sans variable. Sous 992 px, la liste passe en cartes.',
    scenario: 'nominal',
    chemin: MODELES
  },
  {
    id: 'modeles-documents-vide',
    titre: 'Modèles de documents — vide',
    description: 'Aucun modèle et aucun filtre : le bloc invite à en ajouter un, il ne constate pas une absence.',
    scenario: 'vide',
    chemin: MODELES
  },
  {
    id: 'calendrier-agenda',
    titre: 'Calendrier — agenda',
    description: 'Vue par défaut sous 992 px. La grille et ses 60 Ko ne sont pas chargées.',
    scenario: 'nominal',
    chemin: CALENDRIER + '?vue=agenda'
  },
  {
    id: 'calendrier-mois',
    titre: 'Calendrier — grille mensuelle',
    description: 'Charge react-big-calendar à la demande. Couleurs tirées des tokens.',
    scenario: 'nominal',
    chemin: CALENDRIER + '?vue=month'
  },
  {
    id: 'patrimoine',
    titre: 'Patrimoine — aperçu',
    description: 'Deux requêtes au lieu de 101. L’agrégat, puis les travaux avec leur bien joint.',
    scenario: 'nominal',
    chemin: PATRIMOINE
  },
  {
    id: 'travaux',
    titre: 'Programmes de travaux',
    description: 'Filtrage et pagination côté serveur, statut porté par l’URL.',
    scenario: 'nominal',
    chemin: TRAVAUX_CHEMIN
  },
  {
    id: 'defilement',
    titre: 'Défilement — liste filtrée, détail, retour',
    description: 'Mesure du critère de sortie du Lot 1 : la position doit revenir au retour arrière.',
    scenario: 'nominal',
    chemin: 'defilement?categorie=B'
  },
  {
    id: 'primitives',
    titre: 'Primitives',
    description: 'Chaque primitive dans ses variantes, côte à côte.',
    scenario: 'nominal',
    chemin: 'primitives'
  }
];

function lien(scene: Scene): string {
  const separateur = scene.chemin.includes('?') ? '&' : '?';
  return '/atelier/' + scene.chemin + separateur + 'sc=' + scene.scenario;
}

function GaleriePrimitives() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <PageHeader
        title="En-tête d'écran"
        subtitle="Sous-titre de contexte"
        primaryAction={{ label: 'Action primaire', onClick: () => {} }}
        secondaryActions={[{ key: '1', label: 'Action secondaire' }]}
      />

      <section>
        <h3>Statuts</h3>
        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          {['AVAILABLE', 'RENTED', 'SOLD', 'DRAFT', 'UNDER_OFFER', 'ARCHIVED', 'OVERDUE', 'PAID', 'PENDING'].map(
            statut => (
              <StatusTag key={statut} status={statut} />
            )
          )}
        </div>
      </section>

      <section>
        <h3>Montants</h3>
        <div style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
          <MoneyValue value={1_250_000} currency="FCFA" />
          <MoneyValue value={0} currency="FCFA" />
          <MoneyValue value={null} />
          <MoneyValue value={-450_000} currency="FCFA" signed />
        </div>
      </section>

      <section>
        <h3>Indicateurs</h3>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 'var(--space-3)'
          }}
        >
          <StatCard label="Biens au portefeuille" value="57" />
          <StatCard
            label="Encaissé ce mois"
            value={<MoneyValue value={18_400_000} currency="FCFA" />}
            tone="positive"
          />
          <StatCard label="Échéances en retard" value="4" hint="dont 2 de plus de 30 jours" tone="danger" />
          <StatCard label="Taux d'occupation" value="86 %" tone="warning" onClick={() => {}} />
        </div>
      </section>

      <section>
        <h3>Cartes de liste</h3>
        <div style={{ maxWidth: 420 }}>
          <DataCard
            title="Villa 4 chambres avec piscine, quartier d'Angré Centre"
            subtitle="Angré, Cocody • Abidjan"
            status={<StatusTag status="AVAILABLE" />}
            highlight={<MoneyValue value={12_500_000} currency="FCFA" />}
            fields={[
              { label: 'Type', value: 'Maison / Villa' },
              { label: 'Surface', value: '7 pièces • 4 ch. • 320 m²' }
            ]}
            onOpen={() => {}}
            primaryAction={{ label: 'Modifier', onClick: () => {} }}
            secondaryActions={[{ key: 'x', label: 'Supprimer', danger: true }]}
          />
        </div>
      </section>

      <section>
        <h3>États</h3>
        <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
          <StateBlock variant="empty" actions={[{ label: 'Ajouter', onClick: () => {}, primary: true }]} />
          <StateBlock variant="no-results" actions={[{ label: 'Effacer les filtres', onClick: () => {} }]} />
          <StateBlock variant="error" actions={[{ label: 'Réessayer', onClick: () => {}, primary: true }]} />
          <StateBlock variant="offline" />
          <StateBlock variant="forbidden" detail="Réf. AUTH-403" />
        </div>
      </section>

      <section>
        <h3>Squelettes</h3>
        <SkeletonList rows={3} aria-label="Liste en chargement" />
        <div style={{ height: 'var(--space-4)' }} />
        <SkeletonTable rows={4} columns={4} aria-label="Tableau en chargement" />
      </section>
    </div>
  );
}

function Index() {
  return (
    <div style={{ padding: 'var(--space-6)', maxWidth: 760, margin: '0 auto' }}>
      <h1>Atelier</h1>
      <p style={{ color: 'var(--text-secondary)' }}>
        Vérification visuelle des écrans refondus, sans authentification et sans base de données. Les largeurs de
        contrôle du §10.1 sont 320, 375, 414, 768, 992, 1280 et 1600&nbsp;px.
      </p>
      <ul style={{ lineHeight: 2 }}>
        {SCENES.map(scene => (
          <li key={scene.id}>
            <Link to={lien(scene)}>{scene.titre}</Link>
            <span style={{ color: 'var(--text-tertiary)' }}> — {scene.description}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Pose la fausse API avant de rendre la scène.
 *
 * Le rendu attend que l'adaptateur soit installé : sans cette garde, le premier
 * appel partirait vers le vrai serveur et échouerait, ce qui ferait passer une
 * scène nominale pour une panne.
 */
function Scene({ children }: { children: React.ReactNode }) {
  // Le même mécanisme que la coquille, pour que ce que l'atelier montre soit
  // ce que l'application fait.
  useScrollRestoration();
  const [params] = useSearchParams();
  const scenario = (params.get('sc') as Scenario) || 'nominal';
  const [pret, setPret] = useState(false);

  useEffect(() => {
    installerFausseApi(scenario);
    setPret(true);
    return () => {
      retirerFausseApi();
      setPret(false);
    };
  }, [scenario]);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface-page)' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 'var(--space-3)',
          padding: 'var(--space-2) var(--space-4)',
          background: 'var(--surface-sunken)',
          borderBottom: '1px solid var(--border-default)',
          fontSize: 'var(--font-size-sm)'
        }}
      >
        <strong>Atelier</strong>
        <Link to="/atelier">Retour à la liste</Link>
      </div>
      <div style={{ padding: 'var(--page-padding)' }}>{pret ? children : null}</div>
    </div>
  );
}

/**
 * Session simulée.
 *
 * Le tableau de bord lit son agence dans `useAuth()`, pas dans l'URL : sans
 * contexte, il renverrait vers `/login`. Ce fournisseur pose un collaborateur
 * rattaché à l'agence de démonstration — c'est la seule chose que l'atelier
 * simule au-dessus de la fausse API.
 */
function SessionSimulee({ children }: { children: React.ReactNode }) {
  const auth = {
    user: {
      id: 'user-atelier',
      email: 'koffi@agence-demo.ci',
      fullName: 'Koffi N’Guessan',
      avatarUrl: null,
      globalRole: 'USER',
      emailVerified: true,
      isActive: true,
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString()
    },
    isAuthenticated: true,
    isLoading: false,
    error: null,
    tenantMembership: {
      id: 'membership-atelier',
      tenantId: AGENCE,
      tenant: { id: AGENCE, name: 'Agence Demo', slug: AGENCE },
      status: 'ACTIVE'
    },
    tenantClient: null,
    isLoadingMembership: false,
    login: async () => undefined,
    logout: async () => undefined,
    register: async () => undefined,
    refreshToken: async () => undefined,
    clearError: () => undefined
  } as unknown as AuthContextType;

  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
}

/**
 * Sidebar isolée.
 *
 * La coquille complète exige une session réelle ; la sidebar, elle, ne dépend
 * que du persona et de l'agence. La monter seule est le seul moyen de regarder
 * les intertitres de domaine — leur contraste sur `--surface-nav`, l'espace
 * entre un titre et le bloc précédent — sans base de données ni connexion.
 */
function SceneSidebar() {
  const [params] = useSearchParams();
  const persona = (params.get('persona') as PersonaId) || 'collaborateur';
  // `?variant=rail` monte le palier md (72 px, icônes seules) et `?variant=drawer`
  // le menu du mobile : les trois variantes partagent un fond et des états, et
  // c'est l'endroit où les comparer.
  const variant = (params.get('variant') as 'sidebar' | 'rail' | 'drawer') || 'sidebar';
  const largeur = variant === 'rail' ? 72 : variant === 'drawer' ? 288 : 256;
  return (
    <div style={{ position: 'relative', minHeight: 640 }}>
      <div style={{ width: largeur, position: 'relative', background: 'var(--surface-nav)', minHeight: 640 }}>
        <AppNavigation persona={getNavigation()[persona]} context={{ tenantId: AGENCE }} variant={variant} />
      </div>
    </div>
  );
}

export const Atelier: React.FC = () => (
  <Routes>
    <Route index element={<Index />} />
    <Route
      path="coquille/sidebar"
      element={
        <Scene>
          <SessionSimulee>
            <SceneSidebar />
          </SessionSimulee>
        </Scene>
      }
    />
    <Route
      path="tenant/:tenantId/finance/balance-clients"
      element={
        <Scene>
          <SessionSimulee>
            <BalanceClients />
          </SessionSimulee>
        </Scene>
      }
    />
    <Route
      path="tenant/:tenantId/finance/balance-agee"
      element={
        <Scene>
          <SessionSimulee>
            <BalanceAgee />
          </SessionSimulee>
        </Scene>
      }
    />
    <Route
      path="tenant/:tenantId/finance/comptes/:accountId"
      element={
        <Scene>
          <SessionSimulee>
            <Releve />
          </SessionSimulee>
        </Scene>
      }
    />
    <Route
      path="tenant/:tenantId/finance/fournisseurs"
      element={
        <Scene>
          <SessionSimulee>
            <Fournisseurs />
          </SessionSimulee>
        </Scene>
      }
    />
    <Route
      path="tenant/:tenantId/finance/fournisseurs/balance"
      element={
        <Scene>
          <SessionSimulee>
            <BalanceFournisseurs />
          </SessionSimulee>
        </Scene>
      }
    />
    <Route
      path="tenant/:tenantId/finance/factures-fournisseurs"
      element={
        <Scene>
          <SessionSimulee>
            <FactureFournisseur />
          </SessionSimulee>
        </Scene>
      }
    />
    <Route
      path="tenant/:tenantId/finance/chantiers"
      element={
        <Scene>
          <SessionSimulee>
            <Chantiers />
          </SessionSimulee>
        </Scene>
      }
    />
    <Route
      path="tenant/:tenantId/finance/chantiers/:siteId"
      element={
        <Scene>
          <SessionSimulee>
            <ChantierDetail />
          </SessionSimulee>
        </Scene>
      }
    />
    <Route
      path="tenant/:tenantId/finance/pieces-de-caisse"
      element={
        <Scene>
          <SessionSimulee>
            <PieceDeCaisse />
          </SessionSimulee>
        </Scene>
      }
    />
    <Route
      path="tenant/:tenantId/finance/validation"
      element={
        <Scene>
          <SessionSimulee>
            <FileDeValidation />
          </SessionSimulee>
        </Scene>
      }
    />
    <Route
      path="tenant/:tenantId/finance/chantiers/:siteId/budget"
      element={
        <Scene>
          <SessionSimulee>
            <BudgetChantier />
          </SessionSimulee>
        </Scene>
      }
    />
    {/*
      « nouveau » AVANT « :orderId », comme dans `App.tsx` : sans cela, React
      Router rangerait le mot « nouveau » dans le parametre et l'ecran
      chercherait un bon de commande qui n'existe pas.
    */}
    <Route
      path="tenant/:tenantId/finance/bons-de-commande"
      element={
        <Scene>
          <SessionSimulee>
            <BonsDeCommande />
          </SessionSimulee>
        </Scene>
      }
    />
    <Route
      path="tenant/:tenantId/finance/bons-de-commande/nouveau"
      element={
        <Scene>
          <SessionSimulee>
            <BonDeCommande />
          </SessionSimulee>
        </Scene>
      }
    />
    <Route
      path="tenant/:tenantId/finance/bons-de-commande/:orderId"
      element={
        <Scene>
          <SessionSimulee>
            <BonDeCommande />
          </SessionSimulee>
        </Scene>
      }
    />
    <Route
      path="tenant/:tenantId/finance/tableau-de-bord-chantiers"
      element={
        <Scene>
          <SessionSimulee>
            <TableauDeBordChantiers />
          </SessionSimulee>
        </Scene>
      }
    />
    <Route
      path="tenant/:tenantId/finance/baux-terrain"
      element={
        <Scene>
          <SessionSimulee>
            <BauxDeTerrain />
          </SessionSimulee>
        </Scene>
      }
    />
    <Route
      path="tenant/:tenantId/finance/baux-terrain/:landLeaseId"
      element={
        <Scene>
          <SessionSimulee>
            <BailDeTerrain />
          </SessionSimulee>
        </Scene>
      }
    />
    <Route
      path="tenant/:tenantId/finance/facturation"
      element={
        <Scene>
          <SessionSimulee>
            <Facturation />
          </SessionSimulee>
        </Scene>
      }
    />
    <Route
      path="dashboard"
      element={
        <Scene>
          <SessionSimulee>
            <Dashboard />
          </SessionSimulee>
        </Scene>
      }
    />
    <Route
      path="tenant/:tenantId/properties"
      element={
        <Scene>
          <Properties />
        </Scene>
      }
    />
    <Route
      path="tenant/:tenantId/properties/:id"
      element={
        <Scene>
          <SessionSimulee>
            <PropertyDetail />
          </SessionSimulee>
        </Scene>
      }
    />
    <Route
      path="tenant/:tenantId/rental/leases/:leaseId/installments"
      element={
        <Scene>
          <Installments />
        </Scene>
      }
    />
    <Route
      path="tenant/:tenantId/rental/installments"
      element={
        <Scene>
          <Installments />
        </Scene>
      }
    />
    <Route
      path="tenant/:tenantId/rental/penalties"
      element={
        <Scene>
          <Penalties />
        </Scene>
      }
    />
    <Route
      path="tenant/:tenantId/rental/payments"
      element={
        <Scene>
          <Payments />
        </Scene>
      }
    />
    <Route
      path="tenant/:tenantId/rental/documents"
      element={
        <Scene>
          <Documents />
        </Scene>
      }
    />
    <Route
      path="tenant/:tenantId/documents/templates"
      element={
        <Scene>
          <DocumentTemplates />
        </Scene>
      }
    />
    <Route
      path="tenant/:tenantId/crm/calendar"
      element={
        <Scene>
          <CalendarPage />
        </Scene>
      }
    />
    <Route
      path="tenant/:tenantId/patrimoine"
      element={
        <Scene>
          <PatrimoineOverviewPage />
        </Scene>
      }
    />
    <Route
      path="tenant/:tenantId/patrimoine/work-programs"
      element={
        <Scene>
          <WorkProgramsPage />
        </Scene>
      }
    />
    <Route
      path="tenant/:tenantId/finance/stock/magasin"
      element={
        <Scene>
          <SessionSimulee>
            <StockMagasin />
          </SessionSimulee>
        </Scene>
      }
    />
    <Route
      path="tenant/:tenantId/finance/stock/inventaire"
      element={
        <Scene>
          <SessionSimulee>
            <StockInventaire />
          </SessionSimulee>
        </Scene>
      }
    />
    <Route
      path="tenant/:tenantId/finance/stock/preneurs"
      element={
        <Scene>
          <StockPreneurs />
        </Scene>
      }
    />
    <Route
      path="tenant/:tenantId/finance/stock/controle"
      element={
        <Scene>
          <StockControle />
        </Scene>
      }
    />
    <Route
      path="tenant/:tenantId/finance/stock/whatsapp"
      element={
        <Scene>
          <StockWhatsapp />
        </Scene>
      }
    />
    <Route
      path="tenant/:tenantId/finance/stock/comptages-terrain"
      element={
        <Scene>
          <StockComptagesTerrain />
        </Scene>
      }
    />
    <Route
      path="defilement"
      element={
        <Scene>
          <SceneDefilementListe />
        </Scene>
      }
    />
    <Route
      path="defilement/:id"
      element={
        <Scene>
          <SceneDefilementDetail />
        </Scene>
      }
    />
    <Route
      path="primitives"
      element={
        <Scene>
          <GaleriePrimitives />
        </Scene>
      }
    />
  </Routes>
);

export default Atelier;
