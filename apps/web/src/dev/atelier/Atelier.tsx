import React, { useEffect, useState } from 'react';
import { Link, Route, Routes, useSearchParams } from 'react-router-dom';
import { Properties } from '../../pages/properties/Properties';
import { Installments } from '../../pages/rental/Installments';
import { Penalties } from '../../pages/rental/Penalties';
import { Payments } from '../../pages/rental/Payments';
import { Documents } from '../../pages/rental/Documents';
import { installerFausseApi, retirerFausseApi, type Scenario } from './mock-api';
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
const BIENS = 'tenant/' + AGENCE + '/properties';
const ECHEANCES = 'tenant/' + AGENCE + '/rental/leases/bail-demo/installments';
const ECHEANCES_GLOBAL = 'tenant/' + AGENCE + '/rental/installments';
const PENALITES = 'tenant/' + AGENCE + '/rental/penalties';
const PAIEMENTS = 'tenant/' + AGENCE + '/rental/payments';
const DOCUMENTS = 'tenant/' + AGENCE + '/rental/documents';

const SCENES: Scene[] = [
  {
    id: 'biens',
    titre: 'Biens — nominal',
    description: 'Six biens, dont un titre trop long, un immeuble sans prix et deux sans photo.',
    scenario: 'nominal',
    chemin: BIENS
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

export const Atelier: React.FC = () => (
  <Routes>
    <Route index element={<Index />} />
    <Route
      path="tenant/:tenantId/properties"
      element={
        <Scene>
          <Properties />
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
