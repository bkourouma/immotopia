import React, { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Col, Row, Spin, Tabs, Typography } from 'antd';
import {
  AlertOutlined,
  ClockCircleOutlined,
  HomeOutlined,
  RiseOutlined,
  TeamOutlined,
  ToolOutlined
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../hooks/useAuth';
import { useBreakpoint } from '../hooks/useBreakpoint';
import { queryKey, STALE_TIME } from '../lib/query-keys';
import { resolvePersona } from '../navigation/resolve';
import { getTenantDashboard } from '../services/dashboard-service';
import type { DashboardBucket } from '../services/dashboard-service';
import { PageHeader, StatCard, StateBlock, formatMoney } from '../components/primitives';
import { ChartCard } from '../components/home/ChartCard';
import { BarBreakdown, DonutChart, TrendChart } from '../components/home/DashboardCharts';
import { ActivityFeed, WorkQueue } from '../components/home/HomeFeeds';
import {
  bucketLabel,
  categoricalColor,
  compactAmount,
  formatPercent,
  statusColor,
  topSlices,
  variation
} from '../components/home/dashboard-viz';
import { safeFormatDate } from '../utils/date-utils';

const { Text } = Typography;

/**
 * Tableau de bord d'accueil (REFONTE_UI_UX.md §6.2, §6.14).
 *
 * L'écran était un rapport : quatre `<Statistic>` et un journal, sans une seule
 * action et sans un seul graphique. On y apprenait qu'il existait 128 baux, pas
 * lequel appelait une relance. Il devient deux choses à la fois :
 *
 * **Une file de travail.** Les tuiles du haut sont les chiffres qui coûtent de
 * l'argent — impayés, échéances de la semaine, tickets ouverts — et chacune est
 * cliquable vers la liste filtrée qui la produit. La carte « À traiter
 * aujourd'hui » liste les lignes elles-mêmes, en partant de la plus grave.
 *
 * **Une vue d'ensemble.** Neuf graphiques couvrent les six modules : trésorerie
 * sur douze mois, parc par statut et par type, entonnoir commercial, échéances,
 * moyens de paiement, tickets, appels de charges, programmes de travaux. Aucun
 * n'est décoratif : une tranche, une barre ou une ligne de légende mène à
 * l'écran qui détient le détail, et le lien vient du serveur avec la donnée.
 *
 * **Ce qui est conservé du code précédent** : le rendu `—` plutôt que `0` quand
 * une permission manque (l'ancien `Dashboard.tsx:49`, que le §6.2 relevait comme
 * excellent), et les deux redirections défensives vers les portails locataire et
 * propriétaire.
 *
 * **Ce qui change de mécanique** : le chargement passe de `useState` +
 * `useEffect` à `useQuery` (§8.4). Revenir d'un écran de détail ne relance plus
 * la requête dans les trente secondes, et l'écran ne repasse jamais par son
 * squelette pour une donnée qu'il possède déjà.
 */

/** Une section absente vaut « module hors de portée », jamais « zéro ». */
const NON_AUTORISE = '—';

/** Rend une valeur, ou un tiret quand le module échappe au collaborateur. */
function valeurOuTiret(value: number | null | undefined): React.ReactNode {
  return value === null || value === undefined ? NON_AUTORISE : value.toLocaleString('fr-FR');
}

/** Somme des volumes d'une répartition. */
function totalDe(buckets: DashboardBucket[] | null | undefined): number {
  return (buckets ?? []).reduce((somme, bucket) => somme + bucket.count, 0);
}

export const Dashboard: React.FC = () => {
  const { user, isAuthenticated, isLoading, tenantClient, tenantMembership, isLoadingMembership } = useAuth();
  const navigate = useNavigate();
  const { isDesktop } = useBreakpoint();
  const tenantId = tenantMembership?.tenantId;

  const { data, isPending, error, refetch } = useQuery({
    queryKey: queryKey('tenant-dashboard', tenantId),
    queryFn: () => getTenantDashboard(tenantId as string),
    enabled: Boolean(tenantId),
    staleTime: STALE_TIME.list
  });

  const tableau = data?.data;

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate('/login');
    }
  }, [isAuthenticated, isLoading, navigate]);

  /**
   * Vers quel espace appartient ce compte.
   *
   * La question est tranchee par `resolvePersona`, la MEME fonction que la
   * coquille, la barre d'onglets et le drawer — et c'est tout l'objet de ce
   * bloc. Cet ecran portait sa propre regle, heritee d'avant la coquille :
   * « un `tenantClient` existe ? au portail ». Elle ignorait l'appartenance a
   * l'agence, alors qu'un collaborateur peut parfaitement etre AUSSI
   * enregistre comme proprietaire ou locataire d'un bien gere par son agence.
   * Ce compte-la voyait la coquille collaborateur, son menu, son tableau de
   * bord — puis etait renvoye vers `/owner` par cet effet. Le tableau de bord
   * lui etait inatteignable.
   *
   * `resolvePersona` pose l'appartenance AVANT le type de client : elle gagne.
   * Une seule regle, un seul endroit ou la corriger.
   */
  const persona = resolvePersona({
    globalRole: user?.globalRole,
    hasTenantMembership: Boolean(tenantMembership),
    clientType: tenantClient?.clientType,
    isLoadingMembership: isLoading || isLoadingMembership
  });
  const portail = persona === 'proprietaire' ? '/owner' : persona === 'locataire' ? '/tenant' : null;

  useEffect(() => {
    if (portail) {
      navigate(portail, { replace: true });
    }
  }, [portail, navigate]);

  const base = tenantId ? `/tenant/${tenantId}` : '';
  const devise = tableau?.monthlyRevenue?.currency ?? 'FCFA';
  const chargement = Boolean(tenantId) && isPending;

  /**
   * Les cartes de graphique, déclarées une fois et rendues deux fois.
   *
   * Au-dessus de 992 px, la grille les pose côte à côte ; en dessous, elles
   * passent en onglets groupés par module. Sans cette liste unique, les deux
   * dispositions divergeraient au premier ajout de graphique — c'est ce qui
   * arrive quand on écrit deux fois la même page.
   *
   * **L'ordre fait les paires.** `span` est une part des 24 colonnes d'Ant
   * Design, et la grille remplit ses lignes dans l'ordre de cette liste. Les
   * six cartes à légende valent 12 : elles se lisent donc deux par deux —
   * échéances avec moyens de paiement, parc avec types de biens, entonnoir
   * avec contacts. Les trois dernières valent 8 et tiennent à trois sur la
   * ligne suivante. Insérer une carte au milieu décale toutes les paires
   * suivantes : ajouter plutôt en fin de groupe, ou par couple.
   */
  const cartes = useMemo(() => {
    if (!tableau) return [];

    const liste: Array<{ cle: string; groupe: string; span: number; noeud: React.ReactNode }> = [];

    if (tableau.revenueSeries && tableau.revenueSeries.length > 0) {
      const encaisse = tableau.revenueSeries.reduce((somme, point) => somme + point.encaisse, 0);
      const attendu = tableau.revenueSeries.reduce((somme, point) => somme + point.attendu, 0);

      liste.push({
        cle: 'tresorerie',
        groupe: 'Finances',
        span: 16,
        noeud: (
          <ChartCard
            title="Trésorerie sur 12 mois"
            subtitle="Ce qui est entré, face à ce qui était attendu"
            link={{ label: 'Voir les paiements', to: `${base}/rental/payments` }}
            empty={encaisse === 0 && attendu === 0}
            legend={[
              {
                label: 'Encaissé',
                value: formatMoney(encaisse, { currency: devise }),
                color: 'var(--color-primary)',
                href: `${base}/rental/payments`
              },
              {
                label: 'Attendu',
                value: formatMoney(attendu, { currency: devise }),
                color: '#eb6834',
                href: `${base}/rental/installments`
              }
            ]}
          >
            <TrendChart data={tableau.revenueSeries} currency={devise} href={`${base}/rental/payments`} />
          </ChartCard>
        )
      });
    }

    const echeances = tableau.rental?.installmentsByStatus ?? null;
    if (echeances && echeances.length > 0) {
      liste.push({
        cle: 'echeances',
        groupe: 'Finances',
        span: 12,
        noeud: (
          <ChartCard
            title="Échéances par statut"
            subtitle="Longueur de barre : le reste à encaisser"
            link={{ label: 'Encaisser', to: `${base}/rental/installments` }}
            empty={echeances.every(bucket => bucket.count === 0)}
          >
            <BarBreakdown
              items={echeances}
              metric="amount"
              currency={devise}
              colorOf={cle => statusColor(cle)}
              tipOf={bucket => `${bucket.count} · ${compactAmount(bucket.amount ?? 0)}`}
              labelWidth={92}
            />
          </ChartCard>
        )
      });
    }

    const moyens = tableau.rental?.paymentsByMethod ?? null;
    if (moyens && moyens.length > 0) {
      const encaisseParMoyen = moyens.reduce((somme, bucket) => somme + (bucket.amount ?? 0), 0);
      liste.push({
        cle: 'moyens',
        groupe: 'Finances',
        span: 12,
        noeud: (
          <ChartCard
            title="Moyens de paiement"
            subtitle="Sur les 12 derniers mois"
            link={{ label: 'Voir les paiements', to: `${base}/rental/payments` }}
            empty={encaisseParMoyen === 0}
            legend={moyens.map((bucket, index) => ({
              label: bucketLabel(bucket.key),
              value: formatMoney(bucket.amount ?? 0, { currency: devise }),
              color: categoricalColor(index),
              href: bucket.href
            }))}
          >
            <DonutChart
              slices={moyens}
              colorOf={(_, index) => categoricalColor(index)}
              currency={devise}
              total={compactAmount(encaisseParMoyen)}
              totalLabel="encaissés"
            />
          </ChartCard>
        )
      });
    }

    if (tableau.properties) {
      const parts = topSlices(tableau.properties.byStatus);
      liste.push({
        cle: 'parc-statut',
        groupe: 'Parc',
        span: 12,
        noeud: (
          <ChartCard
            title="Parc par statut"
            subtitle={
              tableau.properties.occupancyRate !== null
                ? `${formatPercent(tableau.properties.occupancyRate)} du parc occupé ou vendu`
                : undefined
            }
            link={{ label: 'Voir les biens', to: `${base}/properties` }}
            empty={tableau.properties.total === 0}
            legend={parts.map((part, index) => ({
              label: bucketLabel(part.key),
              value: part.count,
              color: categoricalColor(index),
              href: part.href
            }))}
          >
            {/* Palette catégorielle et non sémantique : « Loué » et
                « Disponible » ne sont ni un bien ni un mal, ce sont deux parts
                d'un même tout. Les couleurs d'intention sont réservées à ce
                qui se juge — un retard, un impayé. Elles y seraient d'ailleurs
                illisibles : trois statuts du parc tombent sur le même gris
                neutre, et le camembert n'aurait plus distingué ses tranches. */}
            <DonutChart
              slices={parts}
              colorOf={(_, index) => categoricalColor(index)}
              total={tableau.properties.total}
              totalLabel={tableau.properties.total > 1 ? 'biens' : 'bien'}
            />
          </ChartCard>
        )
      });

      liste.push({
        cle: 'parc-type',
        groupe: 'Parc',
        span: 12,
        noeud: (
          <ChartCard
            title="Types de biens"
            subtitle="Les six premiers types du portefeuille"
            link={{ label: 'Voir les biens', to: `${base}/properties` }}
            empty={tableau.properties.byType.length === 0}
          >
            {/* Une seule couleur : les types de bien n'ont pas d'ordre naturel,
                et teinter la barre selon sa longueur encoderait deux fois la
                même information. */}
            <BarBreakdown items={topSlices(tableau.properties.byType, 6)} colorOf={() => 'var(--color-primary)'} />
          </ChartCard>
        )
      });
    }

    if (tableau.pipeline && tableau.pipeline.length > 0) {
      const affaires = totalDe(tableau.pipeline);
      // Les affaires perdues sortent de l'entonnoir : elles en sont la fuite,
      // pas une étape. Laissées dedans, leur barre — souvent la plus longue —
      // se lisait comme un aboutissement et cassait la forme en pyramide. Le
      // chiffre reste dit, en sous-titre.
      const perdues = tableau.pipeline.find(etape => etape.key === 'LOST');
      const etapes = tableau.pipeline.filter(etape => etape.key !== 'LOST');

      liste.push({
        cle: 'pipeline',
        groupe: 'Commercial',
        span: 12,
        noeud: (
          <ChartCard
            title="Entonnoir commercial"
            subtitle={
              perdues && perdues.count > 0
                ? `Affaires par étape · ${perdues.count} perdue${perdues.count > 1 ? 's' : ''}`
                : 'Affaires par étape, et valeur espérée'
            }
            link={{ label: 'Voir les affaires', to: `${base}/crm/deals` }}
            empty={affaires === 0}
          >
            {/* Les étapes de progression partagent le bleu de marque ; seule
                l'issue « gagnée » prend une couleur d'intention, et son nom est
                écrit à gauche de la barre. */}
            <BarBreakdown
              items={etapes}
              colorOf={cle => (cle === 'WON' ? 'var(--color-success)' : 'var(--color-primary)')}
              tipOf={bucket =>
                bucket.amount ? `${bucket.count} · ${compactAmount(bucket.amount)}` : String(bucket.count)
              }
              labelWidth={96}
            />
          </ChartCard>
        )
      });
    }

    if (tableau.clients && tableau.clients.total > 0) {
      const parts = topSlices(tableau.clients.byStatus);
      liste.push({
        cle: 'contacts',
        groupe: 'Commercial',
        span: 12,
        noeud: (
          <ChartCard
            title="Contacts"
            subtitle="Prospects, clients et archives"
            link={{ label: 'Voir les contacts', to: `${base}/crm/contacts` }}
            legend={parts.map((part, index) => ({
              label: bucketLabel(part.key),
              value: part.count,
              color: categoricalColor(index),
              href: part.href
            }))}
          >
            <DonutChart
              slices={parts}
              colorOf={(_, index) => categoricalColor(index)}
              total={tableau.clients.total}
              totalLabel={tableau.clients.total > 1 ? 'contacts' : 'contact'}
            />
          </ChartCard>
        )
      });
    }

    if (tableau.maintenance) {
      const ouverts = tableau.maintenance.open;
      liste.push({
        cle: 'tickets',
        groupe: 'Exploitation',
        span: 8,
        noeud: (
          <ChartCard
            title="Tickets ouverts par priorité"
            subtitle={`${ouverts} ticket${ouverts > 1 ? 's' : ''} en cours de traitement`}
            link={{ label: 'Voir les tickets', to: `${base}/admin/maintenance/tickets` }}
            empty={ouverts === 0}
            emptyText="Aucun ticket ouvert."
          >
            <BarBreakdown
              items={tableau.maintenance.byPriority}
              colorOf={cle =>
                cle === 'URGENT'
                  ? 'var(--color-error)'
                  : cle === 'HIGH'
                    ? 'var(--color-warning)'
                    : cle === 'MEDIUM'
                      ? 'var(--color-primary)'
                      : 'var(--text-tertiary)'
              }
              labelWidth={80}
            />
          </ChartCard>
        )
      });
    }

    if (tableau.syndic && tableau.syndic.syndicates > 0) {
      liste.push({
        cle: 'syndic',
        groupe: 'Exploitation',
        span: 8,
        noeud: (
          <ChartCard
            title="Appels de charges"
            subtitle={
              tableau.syndic.recoveryRate !== null
                ? `${formatPercent(tableau.syndic.recoveryRate)} recouvré · ${tableau.syndic.lots} lots`
                : `${tableau.syndic.syndicates} copropriété${tableau.syndic.syndicates > 1 ? 's' : ''} · ${tableau.syndic.lots} lots`
            }
            link={{ label: 'Voir les copropriétés', to: `${base}/syndics` }}
            empty={tableau.syndic.chargeCallsByStatus.length === 0}
            emptyText="Aucun appel de charges émis."
          >
            <BarBreakdown
              items={tableau.syndic.chargeCallsByStatus}
              metric="amount"
              currency={devise}
              colorOf={cle => statusColor(cle)}
              tipOf={bucket => `${bucket.count} · ${compactAmount(bucket.amount ?? 0)}`}
              labelWidth={92}
            />
          </ChartCard>
        )
      });
    }

    if (tableau.patrimoine && totalDe(tableau.patrimoine.workProgramsByStatus) > 0) {
      liste.push({
        cle: 'travaux',
        groupe: 'Exploitation',
        span: 8,
        noeud: (
          <ChartCard
            title="Programmes de travaux"
            subtitle={`${compactAmount(tableau.patrimoine.plannedCost)} ${devise} encore engagés`}
            link={{ label: 'Voir les travaux', to: `${base}/patrimoine/work-programs` }}
          >
            <BarBreakdown
              items={tableau.patrimoine.workProgramsByStatus}
              metric="amount"
              currency={devise}
              colorOf={cle => statusColor(cle)}
              tipOf={bucket => `${bucket.count} · ${compactAmount(bucket.amount ?? 0)}`}
              labelWidth={92}
            />
          </ChartCard>
        )
      });
    }

    return liste;
  }, [tableau, base, devise]);

  if (isLoading || isLoadingMembership) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-8)' }}>
        <Spin size="large" aria-label="Chargement" />
      </div>
    );
  }

  // La redirection est en cours : ne pas rendre le tableau de bord de l'agence
  // à quelqu'un qui n'y a pas sa place, même une fraction de seconde.
  if (portail) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-8)' }}>
        <Spin size="large" aria-label="Redirection vers votre portail" />
      </div>
    );
  }

  if (!user) return null;

  const prenom = (user.fullName || user.email || '').split(' ')[0];
  const mois = tableau?.monthlyRevenue
    ? safeFormatDate(tableau.monthlyRevenue.periodStart, 'MMMM YYYY', 'mois en cours')
    : 'mois en cours';

  const revenus = tableau?.monthlyRevenue ?? null;
  const evolution = revenus ? variation(revenus.amount, revenus.previousAmount) : null;
  const impayes = tableau?.rental?.overdue ?? null;
  const semaine = tableau?.rental?.dueThisWeek ?? null;
  const declarations = tableau?.rental?.pendingDeclarations ?? null;

  /**
   * Les six tuiles, dans l'ordre où elles coûtent de l'argent.
   *
   * Chacune mène à la liste qui la produit : une tuile qui intrigue sans mener
   * nulle part est exactement ce que la refonte retire de cet écran.
   */
  const tuiles = [
    {
      cle: 'impayes',
      label: 'Impayés',
      value: impayes ? compactAmount(impayes.amount) : NON_AUTORISE,
      hint: impayes ? `${impayes.count} échéance${impayes.count > 1 ? 's' : ''} en retard` : 'Module non accessible',
      icon: <AlertOutlined />,
      tone: 'danger' as const,
      to: impayes ? `${base}/rental/installments?status=OVERDUE` : undefined
    },
    {
      cle: 'semaine',
      label: 'À encaisser sous 7 jours',
      value: semaine ? compactAmount(semaine.amount) : NON_AUTORISE,
      hint: semaine ? `${semaine.count} échéance${semaine.count > 1 ? 's' : ''}` : 'Module non accessible',
      icon: <ClockCircleOutlined />,
      tone: 'warning' as const,
      to: semaine ? `${base}/rental/installments?status=DUE` : undefined
    },
    {
      cle: 'encaisse',
      label: `Encaissé (${mois})`,
      value: revenus ? compactAmount(revenus.amount) : NON_AUTORISE,
      hint: revenus
        ? evolution === null
          ? // Le mois précédent était vide : une variation en pourcentage n'y
            // aurait aucun sens, l'attendu du mois dit davantage.
            `objectif du mois : ${compactAmount(revenus.expected)}`
          : `${evolution >= 0 ? '+' : ''}${evolution} % vs mois précédent`
        : 'Module non accessible',
      icon: <RiseOutlined />,
      tone: 'positive' as const,
      to: revenus ? `${base}/rental/payments` : undefined
    },
    {
      cle: 'biens',
      label: 'Biens',
      value: valeurOuTiret(tableau?.properties?.total),
      hint: tableau?.properties
        ? // Le taux manque quand le portefeuille est vide : une agence qui
          // démarre voit « 0 publié », pas « module non accessible ».
          tableau.properties.occupancyRate !== null
          ? `${formatPercent(tableau.properties.occupancyRate)} occupés · ${tableau.properties.published} publiés`
          : `${tableau.properties.published} publié${tableau.properties.published > 1 ? 's' : ''}`
        : 'Module non accessible',
      icon: <HomeOutlined />,
      tone: 'neutral' as const,
      to: tableau?.properties ? `${base}/properties` : undefined
    },
    {
      cle: 'contacts',
      label: 'Contacts',
      value: valeurOuTiret(tableau?.clients?.total),
      hint: tableau?.transactions
        ? `${tableau.transactions.total} transaction${tableau.transactions.total > 1 ? 's' : ''} suivie${
            tableau.transactions.total > 1 ? 's' : ''
          }`
        : 'Module non accessible',
      icon: <TeamOutlined />,
      tone: 'neutral' as const,
      to: tableau?.clients ? `${base}/crm/contacts` : undefined
    },
    {
      cle: 'tickets',
      label: 'Tickets ouverts',
      value: valeurOuTiret(tableau?.maintenance?.open),
      hint:
        declarations !== null && declarations > 0
          ? `${declarations} déclaration${declarations > 1 ? 's' : ''} à valider`
          : tableau?.maintenance
            ? 'Aucune urgence en attente'
            : 'Module non accessible',
      icon: <ToolOutlined />,
      tone: 'neutral' as const,
      to: tableau?.maintenance ? `${base}/admin/maintenance/tickets` : undefined
    }
  ];

  const tresorerie = cartes.find(carte => carte.cle === 'tresorerie');
  const autresCartes = cartes.filter(carte => carte.cle !== 'tresorerie');
  const groupes = ['Finances', 'Parc', 'Commercial', 'Exploitation'].filter(groupe =>
    cartes.some(carte => carte.groupe === groupe)
  );

  const fileDeTravail = (
    <WorkQueue
      tasks={tableau?.workQueue ?? []}
      loading={chargement}
      link={
        tableau?.rental?.installmentsByStatus ? { label: 'Tout voir', to: `${base}/rental/installments` } : undefined
      }
    />
  );

  return (
    <>
      <PageHeader
        title="Tableau de bord"
        subtitle={
          <>
            Bonjour {prenom || user.email} · <Text type="secondary">{mois}</Text>
          </>
        }
      />

      {!tenantId ? (
        <StateBlock
          variant="empty"
          title="Aucune agence sélectionnée"
          description="Votre compte n'est rattaché à aucune agence pour le moment."
        />
      ) : error ? (
        <StateBlock
          variant="error"
          title="Impossible de charger les indicateurs"
          description="Les chiffres du tableau de bord n'ont pas pu être récupérés."
          actions={[{ label: 'Réessayer', onClick: () => void refetch(), primary: true }]}
        />
      ) : (
        <>
          {/* Les tuiles : deux colonnes au pouce, six sur un écran large. */}
          <Row gutter={[16, 16]}>
            {tuiles.map(tuile => (
              // Trois par ligne, et non six : à six, « À encaisser sous 7
              // jours » se repliait sur quatre lignes et « Encaissé (septembre
              // 2026) » sur trois, ce qui faisait perdre de vue le chiffre
              // lui-même. Deux par ligne au pouce.
              <Col key={tuile.cle} xs={12} md={8} xl={8}>
                <StatCard
                  label={tuile.label}
                  value={chargement ? '…' : tuile.value}
                  hint={tuile.hint}
                  icon={tuile.icon}
                  tone={tuile.tone}
                  onClick={tuile.to ? () => navigate(tuile.to as string) : undefined}
                />
              </Col>
            ))}
          </Row>

          {isDesktop ? (
            <>
              <Row gutter={[16, 16]} style={{ marginTop: 'var(--space-4)' }}>
                {tresorerie && (
                  <Col xs={24} xl={16}>
                    {tresorerie.noeud}
                  </Col>
                )}
                <Col xs={24} xl={tresorerie ? 8 : 24}>
                  {fileDeTravail}
                </Col>
              </Row>

              <Row gutter={[16, 16]} style={{ marginTop: 'var(--space-4)' }}>
                {autresCartes.map(carte => (
                  <Col key={carte.cle} xs={24} lg={12} xl={carte.span}>
                    {carte.noeud}
                  </Col>
                ))}
              </Row>
            </>
          ) : (
            <>
              {/* Sous 992 px, la file passe avant les graphiques : c'est elle
                  qui appelle une action. Les graphiques deviennent des onglets,
                  un seul visible à la fois — les empiler ferait défiler un
                  millier de pixels avant d'atteindre le journal. */}
              <div style={{ marginTop: 'var(--space-4)' }}>{fileDeTravail}</div>

              {groupes.length > 0 && (
                <Tabs
                  style={{ marginTop: 'var(--space-4)' }}
                  items={groupes.map(groupe => ({
                    key: groupe,
                    label: groupe,
                    children: (
                      <Row gutter={[16, 16]}>
                        {cartes
                          .filter(carte => carte.groupe === groupe)
                          .map(carte => (
                            <Col key={carte.cle} xs={24}>
                              {carte.noeud}
                            </Col>
                          ))}
                      </Row>
                    )
                  }))}
                />
              )}
            </>
          )}

          <div style={{ marginTop: 'var(--space-4)' }}>
            <ActivityFeed activities={tableau?.recentActivity ?? []} loading={chargement} />
          </div>
        </>
      )}
    </>
  );
};
