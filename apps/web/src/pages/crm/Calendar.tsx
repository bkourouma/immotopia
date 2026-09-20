import React, { lazy, Suspense, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { App, Button, Checkbox, Space, Typography, Modal, Drawer, Tag, Divider, Segmented } from 'antd';
import { PlusOutlined, DownloadOutlined, FileExcelOutlined, CheckCircleOutlined } from '@ant-design/icons';
import type { View } from 'react-big-calendar';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getCalendarEvents,
  rescheduleFollowUp,
  markFollowUpDone,
  createActivity,
  CalendarScope,
  CreateCrmActivityRequest
} from '../../services/crm-service';
import { ActivityForm } from '../../components/crm/ActivityForm';
import { AdvancedFilters, AdvancedFilters as AdvancedFiltersType } from '../../components/crm/AdvancedFilters';
import { exportToCSV, exportToExcel } from '../../utils/export-utils';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { useListParams } from '../../hooks/useListParams';
import { queryKey, STALE_TIME } from '../../lib/query-keys';
import { PageHeader, StateBlock, StatusTag, SkeletonList, DataCard } from '../../components/primitives';
import {
  EvenementAgenda,
  versEvenementAgenda,
  filtrerEvenements,
  grouperParJour,
  lignesExport
} from './calendar-model';
import { t } from '../../i18n/t';

import { activeLocale } from '../../i18n/format';
const { Text, Title } = Typography;

/**
 * Calendrier CRM — dernier des six écrans hybrides (§9.7).
 *
 * **`react-big-calendar` ne se charge plus que sur demande.** Le §8.1 le
 * demande nommément : « l'écran par défaut sous 992 px est la vue agenda, qui
 * n'en a pas besoin → import dynamique à l'intérieur de la page ». La grille et
 * sa feuille de style pèsent 191 795 o bruts et 11 828 o de CSS ; un
 * collaborateur en tournée ne les télécharge plus.
 *
 * **La vue agenda est la vue par défaut sous 992 px**, et ce n'est pas qu'une
 * question de poids : une grille mensuelle sur 375 px est illisible, et
 * l'ancienne version la rendait quand même, dans un conteneur en
 * `overflow: auto` — soit un calendrier qu'il fallait faire glisser dans les
 * deux directions.
 *
 * **Trois couleurs littérales** — `#10b981`, `#3b82f6`, `#9ca3af` — que le
 * §10.1 interdit et qu'aucun contrôle de contraste ne couvrait, passent aux
 * tokens.
 *
 * **Deux boutons faisaient exactement la même chose.** « Nouvelle activité » et
 * « Nouvelle relance » ouvraient le même formulaire avec les mêmes valeurs. Il
 * n'en reste qu'un.
 *
 * Le bloc de préparation des données d'export, recopié à l'identique pour le
 * CSV et pour le tableur, est écrit une fois. `draggedEvent`, écrit et jamais
 * lu, est retiré.
 */

/** La grille n'est demandée qu'au moment où elle est affichée. */
const CalendarGrid = lazy(() => import('./CalendarGrid'));

type Vue = 'agenda' | 'month' | 'week' | 'day';
type Filtres = { vue: string; perimetre: string; relances: string };
const FILTER_KEYS = ['vue', 'perimetre', 'relances'] as const;

const VUES: { value: Vue; label: string }[] = [
  { value: 'agenda', label: t('Agenda') },
  { value: 'month', label: t('Mois') },
  { value: 'week', label: t('Semaine') },
  { value: 'day', label: t('Jour') }
];

function memeJour(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function titreDeJour(jour: Date): string {
  const aujourdhui = new Date();
  const demain = new Date(aujourdhui);
  demain.setDate(demain.getDate() + 1);

  const formate = jour.toLocaleDateString(activeLocale(), { weekday: 'long', day: 'numeric', month: 'long' });
  if (memeJour(jour, aujourdhui)) return t("Aujourd'hui — {{formate}}", { formate: formate });
  if (memeJour(jour, demain)) return t('Demain — {{formate}}', { formate: formate });
  return formate.charAt(0).toUpperCase() + formate.slice(1);
}

function heure(date: Date): string {
  return date.toLocaleTimeString(activeLocale(), { hour: '2-digit', minute: '2-digit' });
}

export const CalendarPage: React.FC = () => {
  const { message } = App.useApp();
  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isDesktop } = useBreakpoint();

  const list = useListParams<Filtres>({ filterKeys: FILTER_KEYS });
  const [dateCourante, setDateCourante] = useState(new Date());
  const [evenementSelectionne, setEvenementSelectionne] = useState<EvenementAgenda | null>(null);
  const [formulaireOuvert, setFormulaireOuvert] = useState(false);
  const [filtresAvances, setFiltresAvances] = useState<AdvancedFiltersType>({});

  /**
   * La vue par défaut dépend du palier : agenda sous 992 px, mois au-dessus.
   * Un choix explicite, lui, est porté par l'URL et l'emporte — y compris sur
   * mobile, où l'on peut vouloir la grille malgré tout.
   */
  const vue = (list.filters.vue as Vue) || (isDesktop ? 'month' : 'agenda');
  const perimetre: CalendarScope = list.filters.perimetre === 'mine' ? 'MINE' : 'GLOBAL';
  const avecRelances = list.filters.relances !== 'non';

  const fenetre = useMemo(() => {
    const unite = vue === 'week' ? 7 : vue === 'day' ? 1 : 31;
    const debut = new Date(dateCourante);
    const fin = new Date(dateCourante);
    // La fenêtre déborde de part et d'autre : une vue mensuelle montre les
    // jours des mois voisins, et les événements qui s'y trouvent doivent être
    // chargés aussi.
    debut.setDate(debut.getDate() - unite);
    fin.setDate(fin.getDate() + unite);
    return { from: debut, to: fin };
  }, [dateCourante, vue]);

  const typesCharges = useMemo(() => {
    if (filtresAvances.type === 'FOLLOWUP') return ['followups' as const, 'propertyVisits' as const];
    if (filtresAvances.type) return ['propertyVisits' as const];
    return avecRelances ? (['followups', 'propertyVisits'] as const) : (['propertyVisits'] as const);
  }, [filtresAvances.type, avecRelances]);

  const {
    data,
    isPending,
    isFetching,
    error: erreurRequete,
    refetch
  } = useQuery({
    queryKey: queryKey('calendar', tenantId, {
      from: fenetre.from.toISOString().slice(0, 10),
      to: fenetre.to.toISOString().slice(0, 10),
      scope: perimetre,
      types: typesCharges.join(',')
    }),
    queryFn: () =>
      getCalendarEvents(tenantId as string, {
        from: fenetre.from,
        to: fenetre.to,
        scope: perimetre,
        types: [...typesCharges]
      }),
    enabled: Boolean(tenantId),
    staleTime: STALE_TIME.list
  });

  const evenements = useMemo(() => {
    const bruts = (data?.events ?? []).map(versEvenementAgenda).filter(Boolean) as EvenementAgenda[];
    return filtrerEvenements(bruts, filtresAvances);
  }, [data, filtresAvances]);

  const journees = useMemo(() => grouperParJour(evenements), [evenements]);

  const rafraichir = () => queryClient.invalidateQueries({ queryKey: ['calendar', tenantId] });

  const handleDrop = async ({ event, start }: { event: EvenementAgenda; start: Date; end: Date }) => {
    if (!tenantId || !event.canDrag) return;
    if (event.eventType === 'PROPERTY_VISIT') {
      message.info(t("Le déplacement d'une visite de bien n'est pas encore disponible."));
      return;
    }
    try {
      await rescheduleFollowUp(tenantId, event.eventId, { nextActionAt: start });
      await rafraichir();
      message.success(t('Relance déplacée.'));
    } catch (err: any) {
      message.error(err?.response?.data?.message || t('Le déplacement a échoué.'));
    }
  };

  const handleMarkDone = async () => {
    if (!tenantId || !evenementSelectionne) return;
    try {
      if (evenementSelectionne.eventType === 'FOLLOWUP') {
        await markFollowUpDone(tenantId, evenementSelectionne.eventId);
      } else if (evenementSelectionne.propertyId) {
        const { completePropertyVisit } = await import('../../services/property-service');
        await completePropertyVisit(tenantId, evenementSelectionne.propertyId, evenementSelectionne.eventId);
      }
      setEvenementSelectionne(null);
      await rafraichir();
      message.success(t('Événement marqué comme terminé.'));
    } catch (err: any) {
      message.error(err?.response?.data?.message || t('La mise à jour a échoué.'));
    }
  };

  const handleCreate = async (donnees: CreateCrmActivityRequest) => {
    if (!tenantId) return;
    try {
      await createActivity(tenantId, {
        ...donnees,
        activityType: 'TASK',
        nextActionAt: donnees.nextActionAt || new Date()
      });
      setFormulaireOuvert(false);
      await rafraichir();
      message.success(t('Relance créée.'));
    } catch (err: any) {
      message.error(err?.response?.data?.message || t('La création a échoué.'));
    }
  };

  if (!tenantId) {
    return <StateBlock variant="empty" title={t('Aucune agence sélectionnée')} />;
  }

  const agenda = (
    <div>
      {journees.map(({ jour, evenements: duJour }) => (
        <section key={jour.toISOString()} style={{ marginBottom: 'var(--space-5)' }}>
          <h3
            style={{
              margin: '0 0 var(--space-3)',
              fontSize: 'var(--font-size-base)',
              color: 'var(--text-secondary)'
            }}
          >
            {titreDeJour(jour)}
          </h3>
          {duJour.map(evenement => (
            <DataCard
              key={evenement.eventId}
              title={evenement.title}
              aria-label={t('{{title}}, {{value}} à {{value2}}', {
                title: evenement.title,
                value: titreDeJour(jour),
                value2: heure(evenement.start)
              })}
              subtitle={`${heure(evenement.start)} · ${evenement.contactName}`}
              status={
                <StatusTag
                  status={evenement.status}
                  // Le type d'événement importe autant que son statut, et un
                  // événement sans statut n'en a pas moins une nature.
                  label={evenement.status ? undefined : evenement.eventType === 'FOLLOWUP' ? t('Relance') : t('Visite')}
                  tone={evenement.eventType === 'FOLLOWUP' ? 'success' : 'info'}
                />
              }
              fields={[
                ...(evenement.dealLabel ? [{ label: 'Affaire', value: evenement.dealLabel }] : []),
                ...(evenement.location ? [{ label: 'Lieu', value: evenement.location }] : [])
              ]}
              onOpen={() => setEvenementSelectionne(evenement)}
            />
          ))}
        </section>
      ))}
    </div>
  );

  const contenu = () => {
    if (erreurRequete) {
      return (
        <StateBlock
          variant="error"
          description={t('Impossible de charger le calendrier.')}
          actions={[{ label: t('Réessayer'), onClick: () => refetch(), primary: true }]}
        />
      );
    }

    if (isPending) {
      return <SkeletonList rows={5} aria-label={t('Calendrier en cours de chargement')} />;
    }

    if (vue === 'agenda') {
      return evenements.length === 0 ? (
        <StateBlock
          variant="empty"
          title={t('Aucun événement sur cette période')}
          description={t('Créez une relance, ou changez de période.')}
          actions={[{ label: t('Nouvelle relance'), onClick: () => setFormulaireOuvert(true), primary: true }]}
        />
      ) : (
        agenda
      );
    }

    return (
      // Le repli du `Suspense` est un squelette et non un tourniquet : la
      // grille pèse assez pour que son chargement se voie sur un réseau lent,
      // et la place qu'elle occupera doit être tenue d'avance.
      <Suspense fallback={<SkeletonList rows={6} aria-label={t('Grille en cours de chargement')} />}>
        <CalendarGrid
          events={evenements}
          view={vue as View}
          onView={v => list.setFilters({ vue: v })}
          date={dateCourante}
          onNavigate={setDateCourante}
          onSelectEvent={setEvenementSelectionne}
          onEventDrop={handleDrop}
          onEventResize={handleDrop}
        />
      </Suspense>
    );
  };

  const exporter = (format: 'csv' | 'excel') => {
    const lignes = lignesExport(evenements);
    if (lignes.length === 0) {
      message.info(t('Aucun événement à exporter sur cette période.'));
      return;
    }
    if (format === 'csv') exportToCSV(lignes, 'calendrier');
    else exportToExcel(lignes, 'calendrier', 'Calendrier');
  };

  return (
    <>
      <PageHeader
        title={t('Calendrier')}
        subtitle={
          evenements.length > 0
            ? t('{{length}} événement{{value}}', { length: evenements.length, value: evenements.length > 1 ? 's' : '' })
            : undefined
        }
        // Une seule action primaire. L'ancienne version en offrait deux,
        // « Nouvelle activité » et « Nouvelle relance », qui ouvraient le même
        // formulaire avec les mêmes valeurs.
        primaryAction={{
          label: t('Nouvelle relance'),
          icon: <PlusOutlined />,
          onClick: () => setFormulaireOuvert(true)
        }}
        secondaryActions={[
          { key: 'today', label: t("Revenir à aujourd'hui"), onClick: () => setDateCourante(new Date()) },
          { type: 'divider' },
          { key: 'csv', label: t('Exporter en CSV'), icon: <DownloadOutlined />, onClick: () => exporter('csv') },
          { key: 'xls', label: t('Exporter en tableur'), icon: <FileExcelOutlined />, onClick: () => exporter('excel') }
        ]}
      />

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 'var(--space-4)',
          alignItems: 'center',
          marginBottom: 'var(--space-4)'
        }}
      >
        <Segmented<Vue>
          value={vue}
          onChange={valeur => list.setFilters({ vue: valeur })}
          options={VUES}
          // Le choix de vue est une navigation, pas un filtre de données :
          // il mérite un nom accessible propre.
          aria-label={t('Choisir la vue du calendrier')}
        />
        <Checkbox
          checked={perimetre === 'MINE'}
          onChange={e => list.setFilters({ perimetre: e.target.checked ? 'mine' : undefined })}
        >
          {t('Mon calendrier')}
        </Checkbox>
        <Checkbox
          checked={avecRelances}
          onChange={e => list.setFilters({ relances: e.target.checked ? undefined : 'non' })}
        >
          {t('Afficher les relances')}
        </Checkbox>
        {isFetching && !isPending && <Text type="secondary">{t('Mise à jour…')}</Text>}
      </div>

      <AdvancedFilters
        tenantId={tenantId}
        config={{
          showDateRange: true,
          showAssignedTo: true,
          showType: true,
          showContactName: true,
          dateRangeLabel: t('Période personnalisée'),
          typeLabel: t("Type d'événement"),
          contactNameLabel: t('Nom du client'),
          typeOptions: [
            { value: 'RDV', label: 'Rendez-vous' },
            { value: 'VISITE', label: 'Visite' },
            { value: 'FOLLOWUP', label: 'Relance' }
          ]
        }}
        filters={filtresAvances}
        onFiltersChange={nouveaux => {
          setFiltresAvances(nouveaux);
          if (nouveaux.startDate) setDateCourante(new Date(nouveaux.startDate));
        }}
      />

      <div style={{ marginTop: 'var(--space-4)' }}>{contenu()}</div>

      <Drawer
        title={t("Détails de l'événement")}
        placement={isDesktop ? 'right' : 'bottom'}
        height={isDesktop ? undefined : '70%'}
        width={isDesktop ? 420 : undefined}
        onClose={() => setEvenementSelectionne(null)}
        open={evenementSelectionne !== null}
      >
        {evenementSelectionne && (
          <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
            <div>
              <Title level={4} style={{ margin: '0 0 var(--space-2)' }}>
                {evenementSelectionne.title}
              </Title>
              <Space wrap>
                {evenementSelectionne.badges.map(badge => (
                  <Tag key={badge}>{badge}</Tag>
                ))}
              </Space>
            </div>

            <Divider style={{ margin: 0 }} />

            <dl style={{ display: 'grid', gap: 'var(--space-2)', margin: 0 }}>
              <div>
                <dt style={{ color: 'var(--text-secondary)' }}>{t('Quand')}</dt>
                <dd style={{ margin: 0 }}>
                  {evenementSelectionne.start.toLocaleString(activeLocale())}
                  {evenementSelectionne.end.getTime() !== evenementSelectionne.start.getTime() && (
                    <> — {heure(evenementSelectionne.end)}</>
                  )}
                </dd>
              </div>
              {evenementSelectionne.location && (
                <div>
                  <dt style={{ color: 'var(--text-secondary)' }}>{t('Lieu')}</dt>
                  <dd style={{ margin: 0 }}>{evenementSelectionne.location}</dd>
                </div>
              )}
            </dl>

            <Space orientation="vertical" size="small" style={{ width: '100%' }}>
              <Button
                block
                onClick={() => navigate(`/tenant/${tenantId}/crm/contacts/${evenementSelectionne.contactId}`)}
              >
                {t('Voir')} {evenementSelectionne.contactName}
              </Button>
              {evenementSelectionne.dealId && (
                <Button block onClick={() => navigate(`/tenant/${tenantId}/crm/deals/${evenementSelectionne.dealId}`)}>
                  {t("Voir l'affaire")}
                </Button>
              )}
              {evenementSelectionne.propertyId && (
                <Button
                  block
                  onClick={() => navigate(`/tenant/${tenantId}/properties/${evenementSelectionne.propertyId}`)}
                >
                  {t('Voir le bien')}
                </Button>
              )}
            </Space>

            <Button
              type="primary"
              block
              icon={<CheckCircleOutlined />}
              onClick={handleMarkDone}
              disabled={evenementSelectionne.status === 'DONE' || evenementSelectionne.status === 'CANCELED'}
            >
              {t('Marquer comme terminé')}
            </Button>
          </Space>
        )}
      </Drawer>

      <Modal
        title={t('Nouvelle relance')}
        open={formulaireOuvert}
        onCancel={() => setFormulaireOuvert(false)}
        footer={null}
        width={720}
        destroyOnHidden
      >
        <ActivityForm tenantId={tenantId} onSubmit={handleCreate} onCancel={() => setFormulaireOuvert(false)} />
      </Modal>
    </>
  );
};
