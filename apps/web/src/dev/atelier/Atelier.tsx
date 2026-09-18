import React, { useEffect, useState } from 'react';
import { Link, Route, Routes, useSearchParams } from 'react-router-dom';
import { Dashboard } from '../../pages/Dashboard';
import { Properties } from '../../pages/properties/Properties';
import { PropertyDetail } from '../../pages/properties/PropertyDetail';
import { Installments } from '../../pages/rental/Installments';
import { Penalties } from '../../pages/rental/Penalties';
import { Payments } from '../../pages/rental/Payments';
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
import { NAVIGATION } from '../../navigation/model';
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
const SIDEBAR = 'coquille/sidebar';

const SCENES: Scene[] = [
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
          <MoneyValue value={1_250_000} currency="GNF" />
          <MoneyValue value={0} currency="GNF" />
          <MoneyValue value={null} />
          <MoneyValue value={-450_000} currency="GNF" signed />
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
          <StatCard label="Encaissé ce mois" value={<MoneyValue value={18_400_000} currency="GNF" />} tone="positive" />
          <StatCard label="Échéances en retard" value="4" hint="dont 2 de plus de 30 jours" tone="danger" />
          <StatCard label="Taux d'occupation" value="86 %" tone="warning" onClick={() => {}} />
        </div>
      </section>

      <section>
        <h3>Cartes de liste</h3>
        <div style={{ maxWidth: 420 }}>
          <DataCard
            title="Villa 4 chambres avec piscine, quartier de Kipé Centre"
            subtitle="Kipé, Ratoma • Conakry"
            status={<StatusTag status="AVAILABLE" />}
            highlight={<MoneyValue value={12_500_000} currency="GNF" />}
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
        <AppNavigation persona={NAVIGATION[persona]} context={{ tenantId: AGENCE }} variant={variant} />
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
