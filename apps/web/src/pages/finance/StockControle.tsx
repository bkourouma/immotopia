import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Alert,
  App,
  Button,
  Card,
  Checkbox,
  Col,
  DatePicker,
  Input,
  InputNumber,
  Modal,
  Row,
  Select,
  Space,
  Switch,
  Tabs,
  Typography
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { type Dayjs } from 'dayjs';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  acknowledgeStockAlert,
  getStockControls,
  getStockIndicators,
  listStockAlerts,
  updateStockControls
} from '../../services/finance-stock-controle-service';
import {
  STOCK_ALERT_KIND_LABELS,
  STOCK_ALERT_SEVERITY_DISPLAY,
  type ControlsSettingsPatch,
  type StockAlertKind,
  type StockAlertStatus,
  type StockAlertView,
  type StockControlsSettings,
  type StockFieldContext,
  type StockIndicatorRow
} from '../../types/finance-stock-controle-types';
import { STOCK_FIELD_CONTEXT_ENTITY, useStockFieldContext } from '../../hooks/useStockFieldContext';
import { entityKeyPrefix, queryKey, STALE_TIME } from '../../lib/query-keys';
import {
  DataCard,
  DataView,
  MoneyValue,
  PageHeader,
  SkeletonList,
  StatCard,
  StateBlock,
  StatusTag,
  formatMoney
} from '../../components/primitives';
import { ModuleNotIncluded } from '../../components/primitives/ModuleNotIncluded';
import { isModuleNotIncludedError } from '../../utils/module-not-included';
import { montantSaisiProps } from '../../utils/montant-saisi';
import { safeFormatDate } from '../../utils/date-utils';
import { formatNumber } from '../../i18n/format';
import { t } from '../../i18n/t';

const { Text, Paragraph } = Typography;

/**
 * E5 — Contrôle du stock (lot 040, ecrans §8 ; spec B7, B8, A9).
 *
 * Trois onglets, chacun selon un droit LU dans le contexte terrain (une seule
 * source, ecrans §0.1 règle 3) :
 *
 * - « Alertes » si `abilities.canViewAlerts` ;
 * - « Indicateurs » et « Réglages de contrôle » si les valeurs sont visibles,
 *   le formulaire n'étant modifiable qu'avec `abilities.canManageSettings`.
 *
 * Un magasinier n'a aucun des deux : la page affiche d'emblée l'état réservé,
 * SANS appeler les routes d'alertes (ecrans §2.2, §8.1).
 *
 * Montré, pas jugé (D2) : une alerte signale un fait au-dessus d'un seuil. Son
 * titre et son message viennent traduits du serveur et s'affichent tels
 * quels ; les indicateurs portent sur des lieux et des mois, jamais sur des
 * personnes, et aucun chiffre n'est recalculé à l'écran.
 */

type Onglet = 'alertes' | 'indicateurs' | 'reglages';

interface ErreurServeur {
  status?: number;
  code?: string;
  message?: string;
  /** Détail d'un refus de validation (`errors[{ field, message }]` d'un `400`), par champ. */
  champs: Record<string, string>;
}

function lireChamps(errors: unknown): Record<string, string> {
  const champs: Record<string, string> = {};
  if (!Array.isArray(errors)) return champs;
  for (const detail of errors as Array<{ field?: unknown; message?: unknown }>) {
    if (typeof detail?.field === 'string' && typeof detail.message === 'string' && !(detail.field in champs)) {
      champs[detail.field] = detail.message;
    }
  }
  return champs;
}

function lireErreur(error: unknown): ErreurServeur {
  const response = (
    error as {
      response?: {
        status?: number;
        data?: { code?: unknown; message?: unknown; errors?: unknown; data?: { existingTakerId?: unknown } };
      };
    } | null
  )?.response;
  return {
    status: response?.status,
    code: typeof response?.data?.code === 'string' ? (response.data.code as string) : undefined,
    message: typeof response?.data?.message === 'string' ? (response.data.message as string) : undefined,
    champs: lireChamps(response?.data?.errors)
  };
}

/** Une part de 0 à 1, en pourcentage de la langue active (une décimale au plus). */
function pourcent(part: number | null | undefined): string {
  if (part === null || part === undefined) return '—';
  return formatNumber(part, { style: 'percent', maximumFractionDigits: 1 });
}

function joursMoyens(jours: number | null | undefined): string {
  if (jours === null || jours === undefined) return '—';
  return t('{{n}} j', { n: formatNumber(jours, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) });
}

function libelleMois(mois: string): string {
  const date = dayjs(`${mois}-01`);
  return date.isValid() ? date.format('MMMM YYYY') : mois;
}

// ---------------------------------------------------------------------------
// L'écran
// ---------------------------------------------------------------------------

export function StockControle(): React.ReactElement {
  const { tenantId = '' } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const contexte = useStockFieldContext(tenantId);

  const entete = (
    <>
      <PageHeader title={t('Contrôle du stock')} subtitle={t('Alertes, indicateurs et réglages')} />
      <Paragraph type="secondary">
        {t(
          'Une alerte ou un indicateur signale un fait au-dessus d’un seuil. Il ne désigne personne et n’interdit rien : c’est à vous de regarder et de qualifier.'
        )}
      </Paragraph>
    </>
  );

  if (contexte.isLoading) {
    return (
      <>
        {entete}
        <SkeletonList rows={5} aria-label={t('Contrôle du stock en cours de chargement')} />
      </>
    );
  }
  if (contexte.error || !contexte.data) {
    return (
      <>
        {entete}
        <EtatContexte error={contexte.error} onRetry={() => void contexte.refetch()} />
      </>
    );
  }

  const champ = contexte.data.data;
  const valeursVisibles = contexte.data.meta?.valuesVisible ?? champ.abilities.valuesVisible;
  const visibles: Onglet[] = [
    ...(champ.abilities.canViewAlerts ? (['alertes'] as const) : []),
    ...(valeursVisibles ? (['indicateurs', 'reglages'] as const) : [])
  ];

  if (visibles.length === 0) {
    return (
      <>
        {entete}
        <StateBlock
          variant="forbidden"
          title={t('Cet écran est réservé aux responsables du stock.')}
          description={t('Les gestes du terrain se font depuis l’écran Magasin.')}
          actions={[
            {
              label: t('Aller à l’écran Magasin'),
              onClick: () => navigate(`/tenant/${tenantId}/finance/stock/magasin`),
              primary: true
            }
          ]}
        />
      </>
    );
  }

  const demande = params.get('alerte') ? 'alertes' : (params.get('onglet') as Onglet | null);
  const actif: Onglet = demande && visibles.includes(demande) ? demande : visibles[0];
  const changerOnglet = (cle: string) => {
    const suivant = new URLSearchParams(params);
    suivant.set('onglet', cle);
    if (cle !== 'alertes') suivant.delete('alerte');
    setParams(suivant, { replace: true });
  };

  const items = visibles.map(cle => {
    if (cle === 'alertes') {
      return {
        key: cle,
        label: t('Alertes'),
        children: <OngletAlertes tenantId={tenantId} champ={champ} alerteId={params.get('alerte')} />
      };
    }
    if (cle === 'indicateurs') {
      return { key: cle, label: t('Indicateurs'), children: <OngletIndicateurs tenantId={tenantId} champ={champ} /> };
    }
    return {
      key: cle,
      label: t('Réglages de contrôle'),
      children: <OngletReglages tenantId={tenantId} champ={champ} peutModifier={champ.abilities.canManageSettings} />
    };
  });

  return (
    <>
      {entete}
      <Tabs activeKey={actif} onChange={changerOnglet} items={items} />
    </>
  );
}

/** Le contexte terrain a échoué : refus du stock, module absent, ou panne (ecrans §3.3). */
const EtatContexte: React.FC<{ error: unknown; onRetry: () => void }> = ({ error, onRetry }) => {
  if (isModuleNotIncludedError(error)) return <ModuleNotIncluded />;
  const erreur = lireErreur(error);
  if (erreur.status === 403) {
    return (
      <StateBlock
        variant="forbidden"
        title={t('Le stock ne vous est pas ouvert')}
        description={t(
          "Votre rôle ne comprend pas la consultation du stock. Demandez à l'administrateur de l'agence de vous attribuer le rôle Magasinier ou un rôle qui la comprend."
        )}
      />
    );
  }
  return (
    <StateBlock
      variant="error"
      description={erreur.message || t('Le stock n’a pas pu être chargé.')}
      actions={[{ label: t('Réessayer'), onClick: onRetry, primary: true }]}
    />
  );
};

// ---------------------------------------------------------------------------
// Onglet « Alertes » (B7)
// ---------------------------------------------------------------------------

type FiltreStatut = StockAlertStatus | 'ALL';

interface FiltresAlertes {
  statut: FiltreStatut;
  kind?: StockAlertKind;
  siteId?: string;
  locationId?: string;
  from?: Dayjs | null;
  to?: Dayjs | null;
}

const ALERTS_ENTITY = 'stock-alerts';

/** Le lien de l'objet d'une alerte, selon sa nature (ecrans §8.2). */
function lienObjet(tenantId: string, alerte: StockAlertView): string | null {
  const base = `/tenant/${tenantId}/finance`;
  switch (alerte.subjectType) {
    case 'StockSlip':
      return `${base}/stock?bon=${encodeURIComponent(alerte.subjectId)}`;
    case 'StockCount':
      return `${base}/stock/inventaire?inventaire=${encodeURIComponent(alerte.subjectId)}`;
    case 'StockMovement':
      return `${base}/stock?onglet=journal&mouvement=${encodeURIComponent(alerte.subjectId)}`;
    case 'SupplierInvoice':
      return `${base}/stock?facture=${encodeURIComponent(alerte.subjectId)}`;
    case 'CashVoucher':
      // Aucune route n'ouvre une pièce de caisse par son identifiant : la
      // fiche du chantier est la destination la plus proche.
      return alerte.site ? `${base}/chantiers/${encodeURIComponent(alerte.site.id)}` : null;
    default:
      return null;
  }
}

function ouEst(alerte: StockAlertView): string {
  return [alerte.site?.name, alerte.location?.label].filter(Boolean).join(' · ');
}

interface OngletAlertesProps {
  tenantId: string;
  champ: StockFieldContext;
  alerteId: string | null;
}

const OngletAlertes: React.FC<OngletAlertesProps> = ({ tenantId, champ, alerteId }) => {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [filtres, setFiltres] = useState<FiltresAlertes>({ statut: 'OPEN' });
  const [elargi, setElargi] = useState(false);
  const [aTraiter, setATraiter] = useState<StockAlertView | null>(null);
  const [note, setNote] = useState('');
  const [envoi, setEnvoi] = useState(false);

  const requete = {
    status: filtres.statut === 'ALL' ? undefined : filtres.statut,
    kind: filtres.kind,
    siteId: filtres.siteId,
    locationId: filtres.locationId,
    from: filtres.from ? filtres.from.format('YYYY-MM-DD') : undefined,
    to: filtres.to ? filtres.to.format('YYYY-MM-DD') : undefined
  };

  const liste = useInfiniteQuery({
    queryKey: queryKey(ALERTS_ENTITY, tenantId, requete),
    queryFn: ({ pageParam }) => listStockAlerts(tenantId, { ...requete, cursor: pageParam, limit: 50 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: derniere => derniere.meta?.nextCursor ?? undefined,
    staleTime: STALE_TIME.list
  });

  const alertes = useMemo(() => (liste.data?.pages ?? []).flatMap(page => page.data), [liste.data]);
  const valeursVisibles = liste.data?.pages[0]?.meta?.valuesVisible ?? champ.abilities.valuesVisible;

  // `?alerte=<id>` absente de la première page « À traiter » (alerte ancienne
  // ou déjà traitée) : la liste s'élargit une fois à « Toutes ».
  useEffect(() => {
    if (!alerteId || elargi || liste.isLoading || liste.error) return;
    if (filtres.statut !== 'ALL' && !alertes.some(alerte => alerte.id === alerteId)) {
      setElargi(true);
      setFiltres(courant => ({ ...courant, statut: 'ALL' }));
    }
  }, [alerteId, elargi, liste.isLoading, liste.error, alertes, filtres.statut]);

  // Défiler jusqu'à l'alerte mise en évidence une fois rendue.
  useEffect(() => {
    if (!alerteId) return;
    const element = document.getElementById(`alerte-${alerteId}`);
    if (element && typeof element.scrollIntoView === 'function') {
      element.scrollIntoView({ block: 'center' });
    }
  }, [alerteId, alertes]);

  const traiter = async () => {
    if (!aTraiter) return;
    setEnvoi(true);
    try {
      await acknowledgeStockAlert(tenantId, aTraiter.id, note);
      message.success(t('Alerte marquée comme traitée.'));
      setATraiter(null);
      setNote('');
    } catch (error) {
      const erreur = lireErreur(error);
      if (erreur.code === 'STOCK_ALERT_ALREADY_ACKNOWLEDGED') {
        message.warning(t('Cette alerte a déjà été traitée.'));
        setATraiter(null);
        setNote('');
      } else {
        message.error(erreur.message || t('L’alerte n’a pas pu être marquée comme traitée.'));
        return;
      }
    } finally {
      setEnvoi(false);
    }
    await queryClient.invalidateQueries({ queryKey: entityKeyPrefix(ALERTS_ENTITY, tenantId) });
  };

  const erreurListe = liste.error ? lireErreur(liste.error) : null;
  if (erreurListe?.status === 403) {
    return (
      <StateBlock variant="forbidden" title={t('Les alertes du stock sont réservées aux responsables du stock.')} />
    );
  }

  const enEvidence = (alerte: StockAlertView) => alerte.id === alerteId;

  const titreAlerte = (alerte: StockAlertView) => (
    <div
      id={`alerte-${alerte.id}`}
      aria-current={enEvidence(alerte) ? 'true' : undefined}
      style={
        enEvidence(alerte)
          ? { background: 'var(--color-warning-bg)', padding: 'var(--space-2)', borderRadius: 'var(--radius-md)' }
          : undefined
      }
    >
      <Text strong>{alerte.title}</Text>
      {alerte.mode === 'MONTHLY_CUMUL' ? (
        <span style={{ marginInlineStart: 8 }}>
          <StatusTag status="MONTHLY_CUMUL" tone="info" label={t('Cumul du mois')} />
        </span>
      ) : null}
      <div>
        <Text type="secondary">{alerte.message}</Text>
      </div>
    </div>
  );

  const montant = (alerte: StockAlertView) =>
    valeursVisibles && alerte.amount !== null ? (
      <span>
        <MoneyValue value={alerte.amount} currency={alerte.currency || undefined} />
        {alerte.threshold !== null ? (
          <Text type="secondary" style={{ display: 'block' }}>
            {t('seuil {{threshold}}', { threshold: formatMoney(alerte.threshold, { currency: alerte.currency }) })}
          </Text>
        ) : null}
      </span>
    ) : null;

  const objet = (alerte: StockAlertView) => {
    const libelle = alerte.subjectLabel || STOCK_ALERT_KIND_LABELS[alerte.kind];
    const lien = lienObjet(tenantId, alerte);
    return lien ? <Link to={lien}>{libelle}</Link> : <span>{libelle}</span>;
  };

  const statut = (alerte: StockAlertView) =>
    alerte.status === 'OPEN' ? (
      <StatusTag status="OPEN" tone="warning" label={t('À traiter')} />
    ) : (
      <span>
        <Text>
          {t('Traitée le {{date}} par {{nom}}', {
            date: safeFormatDate(alerte.acknowledgedAt, 'DD/MM/YYYY'),
            nom: alerte.acknowledgedByLabel ?? ''
          })}
        </Text>
        {alerte.acknowledgeNote ? (
          <Text type="secondary" style={{ display: 'block' }}>
            {alerte.acknowledgeNote}
          </Text>
        ) : null}
      </span>
    );

  const gravite = (alerte: StockAlertView) => {
    const affichage = STOCK_ALERT_SEVERITY_DISPLAY[alerte.severity];
    return <StatusTag status={alerte.severity} tone={affichage.tone} label={affichage.label} />;
  };

  const ouvrirTraitement = (alerte: StockAlertView) => {
    setNote('');
    setATraiter(alerte);
  };

  const columns: ColumnsType<StockAlertView> = [
    { key: 'gravite', title: t('Gravité'), render: (_, alerte) => gravite(alerte) },
    { key: 'alerte', title: t('Alerte'), render: (_, alerte) => titreAlerte(alerte) },
    ...(valeursVisibles
      ? [
          {
            key: 'montant',
            title: t('Montant · seuil'),
            render: (_: unknown, alerte: StockAlertView) => montant(alerte)
          }
        ]
      : []),
    { key: 'ou', title: t('Où'), render: (_, alerte) => ouEst(alerte) },
    { key: 'objet', title: t('Objet'), render: (_, alerte) => objet(alerte) },
    { key: 'levee', title: t('Levée le'), render: (_, alerte) => safeFormatDate(alerte.raisedAt) },
    { key: 'statut', title: t('Statut'), render: (_, alerte) => statut(alerte) },
    {
      key: 'action',
      title: t('Action'),
      align: 'end',
      render: (_, alerte) =>
        alerte.status === 'OPEN' ? (
          <Button size="small" onClick={() => ouvrirTraitement(alerte)}>
            {t('Marquer comme traitée')}
          </Button>
        ) : null
    }
  ];

  const carte = (alerte: StockAlertView) => (
    <div
      id={`alerte-carte-${alerte.id}`}
      style={
        enEvidence(alerte) ? { outline: '2px solid var(--color-warning)', borderRadius: 'var(--radius-lg)' } : undefined
      }
    >
      <DataCard
        title={alerte.title}
        subtitle={alerte.message}
        status={gravite(alerte)}
        highlight={montant(alerte) ?? undefined}
        fields={[
          { label: t('Où'), value: ouEst(alerte) },
          { label: t('Objet'), value: objet(alerte) },
          { label: t('Levée le'), value: safeFormatDate(alerte.raisedAt) },
          { label: t('Statut'), value: statut(alerte) }
        ]}
        primaryAction={
          alerte.status === 'OPEN'
            ? { label: t('Marquer comme traitée'), onClick: () => ouvrirTraitement(alerte) }
            : undefined
        }
      />
    </div>
  );

  const parDefaut =
    filtres.statut === 'OPEN' &&
    !filtres.kind &&
    !filtres.siteId &&
    !filtres.locationId &&
    !filtres.from &&
    !filtres.to;

  return (
    <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
      <Row gutter={[12, 12]}>
        <Col xs={24} sm={12} lg={4}>
          <Select<FiltreStatut>
            aria-label={t('Statut')}
            style={{ width: '100%' }}
            value={filtres.statut}
            onChange={statut => setFiltres(courant => ({ ...courant, statut }))}
            options={[
              { value: 'OPEN', label: t('À traiter') },
              { value: 'ACKNOWLEDGED', label: t('Traitées') },
              { value: 'ALL', label: t('Toutes') }
            ]}
          />
        </Col>
        <Col xs={24} sm={12} lg={5}>
          <Select<StockAlertKind>
            aria-label={t('Nature')}
            placeholder={t('Nature')}
            allowClear
            style={{ width: '100%' }}
            value={filtres.kind}
            onChange={kind => setFiltres(courant => ({ ...courant, kind }))}
            options={(Object.keys(STOCK_ALERT_KIND_LABELS) as StockAlertKind[]).map(kind => ({
              value: kind,
              label: STOCK_ALERT_KIND_LABELS[kind]
            }))}
          />
        </Col>
        <Col xs={24} sm={12} lg={5}>
          <Select<string>
            aria-label={t('Chantier')}
            placeholder={t('Chantier')}
            allowClear
            showSearch
            optionFilterProp="label"
            style={{ width: '100%' }}
            value={filtres.siteId}
            onChange={siteId => setFiltres(courant => ({ ...courant, siteId }))}
            options={champ.sites.map(site => ({ value: site.id, label: site.name }))}
          />
        </Col>
        <Col xs={24} sm={12} lg={4}>
          <Select<string>
            aria-label={t('Lieu')}
            placeholder={t('Lieu')}
            allowClear
            showSearch
            optionFilterProp="label"
            style={{ width: '100%' }}
            value={filtres.locationId}
            onChange={locationId => setFiltres(courant => ({ ...courant, locationId }))}
            options={champ.locations.map(lieu => ({ value: lieu.id, label: lieu.label }))}
          />
        </Col>
        <Col xs={12} lg={3}>
          <DatePicker
            aria-label={t('Du')}
            placeholder={t('Du')}
            style={{ width: '100%' }}
            value={filtres.from ?? null}
            onChange={from => setFiltres(courant => ({ ...courant, from }))}
          />
        </Col>
        <Col xs={12} lg={3}>
          <DatePicker
            aria-label={t('Au')}
            placeholder={t('Au')}
            style={{ width: '100%' }}
            value={filtres.to ?? null}
            onChange={to => setFiltres(courant => ({ ...courant, to }))}
          />
        </Col>
      </Row>

      {!liste.isLoading && !liste.error && alertes.length === 0 ? (
        <StateBlock
          variant={parDefaut ? 'empty' : 'no-results'}
          title={parDefaut ? t('Aucune alerte à traiter.') : t('Aucune alerte pour ces filtres.')}
          actions={
            parDefaut
              ? undefined
              : [{ label: t('Effacer les filtres'), onClick: () => setFiltres({ statut: 'OPEN' }), primary: true }]
          }
        />
      ) : (
        <DataView<StockAlertView>
          aria-label={t('Alertes du stock')}
          items={alertes}
          total={alertes.length}
          page={1}
          pageSize={Math.max(alertes.length, 1)}
          paginated={false}
          onPageChange={() => undefined}
          loading={liste.isLoading}
          isReloading={liste.isFetching && !liste.isLoading}
          error={erreurListe ? erreurListe.message || t('Les alertes n’ont pas pu être chargées.') : null}
          onRetry={() => void liste.refetch()}
          rowKey={alerte => alerte.id}
          columns={columns}
          renderCard={carte}
        />
      )}

      {liste.hasNextPage ? (
        <Button onClick={() => void liste.fetchNextPage()} loading={liste.isFetchingNextPage}>
          {t('Charger plus')}
        </Button>
      ) : null}

      <Modal
        open={aTraiter !== null}
        title={t('Marquer l’alerte comme traitée ?')}
        okText={t('Marquer comme traitée')}
        cancelText={t('Annuler')}
        confirmLoading={envoi}
        onOk={() => void traiter()}
        onCancel={() => setATraiter(null)}
        destroyOnHidden
      >
        <Paragraph>{t('Elle quittera la file « À traiter » et restera consultable.')}</Paragraph>
        <label htmlFor="note-alerte" style={{ display: 'block', marginBlockEnd: 4 }}>
          {t('Note (facultative)')}
        </label>
        <Input.TextArea
          id="note-alerte"
          value={note}
          onChange={event => setNote(event.target.value)}
          maxLength={1000}
          showCount
          autoSize={{ minRows: 3, maxRows: 6 }}
        />
      </Modal>
    </Space>
  );
};

// ---------------------------------------------------------------------------
// Onglet « Indicateurs » (B8)
// ---------------------------------------------------------------------------

const MOIS_MAX = 24;

function periodeParDefaut(): [Dayjs, Dayjs] {
  const maintenant = dayjs().startOf('month');
  return [maintenant.subtract(5, 'month'), maintenant];
}

function nombreDeMois(debut: Dayjs, fin: Dayjs): number {
  return fin.startOf('month').diff(debut.startOf('month'), 'month') + 1;
}

/** Les colonnes communes au tableau par mois et au tableau par lieu. */
function colonnesIndicateurs(): ColumnsType<StockIndicatorRow> {
  return [
    {
      key: 'ecart',
      title: t('Taux d’écart'),
      render: (_, ligne) => (
        <span>
          {pourcent(ligne.varianceRate)}
          {ligne.setAsideVarianceValue ? (
            <Text type="secondary" style={{ display: 'block' }}>
              {t('dont lignes écartées : {{montant}}', { montant: formatMoney(ligne.setAsideVarianceValue) })}
            </Text>
          ) : null}
        </span>
      )
    },
    { key: 'non-comptees', title: t('Lignes non comptées'), render: (_, ligne) => formatNumber(ligne.uncountedLines) },
    { key: 'aveugle', title: t('Lignes comptées à l’aveugle'), render: (_, ligne) => pourcent(ligne.blindLineShare) },
    {
      key: 'valides',
      title: t('Inventaires validés'),
      render: (_, ligne) =>
        t('{{n}} (dont {{m}} par une autre personne)', {
          n: formatNumber(ligne.countsValidated),
          m: formatNumber(ligne.countsValidatedByOther)
        })
    },
    {
      key: 'sorties',
      title: t('Sorties'),
      render: (_, ligne) =>
        t('{{n}} (dont {{m}} avec preneur)', {
          n: formatNumber(ligne.issuesCount),
          m: formatNumber(ligne.issuesWithTaker)
        })
    },
    {
      key: 'rebuts',
      title: t('Rebuts'),
      render: (_, ligne) => (
        <span>
          <MoneyValue value={ligne.scrapValue} />
          <Text type="secondary" style={{ display: 'block' }}>
            {pourcent(ligne.scrapShare)}
          </Text>
        </span>
      )
    },
    { key: 'delai', title: t('Délai moyen de saisie'), render: (_, ligne) => joursMoyens(ligne.averageEntryLagDays) },
    { key: 'jour-meme', title: t('Saisies le jour même'), render: (_, ligne) => pourcent(ligne.sameDayShare) }
  ];
}

function carteIndicateur(ligne: StockIndicatorRow, titre: string): React.ReactNode {
  return (
    <DataCard
      title={titre}
      highlight={pourcent(ligne.varianceRate)}
      fields={[
        { label: t('Lignes non comptées'), value: formatNumber(ligne.uncountedLines) },
        { label: t('Lignes comptées à l’aveugle'), value: pourcent(ligne.blindLineShare) },
        {
          label: t('Inventaires validés'),
          value: t('{{n}} (dont {{m}} par une autre personne)', {
            n: formatNumber(ligne.countsValidated),
            m: formatNumber(ligne.countsValidatedByOther)
          })
        },
        {
          label: t('Sorties'),
          value: t('{{n}} (dont {{m}} avec preneur)', {
            n: formatNumber(ligne.issuesCount),
            m: formatNumber(ligne.issuesWithTaker)
          })
        },
        { label: t('Rebuts'), value: formatMoney(ligne.scrapValue) },
        { label: t('Délai moyen de saisie'), value: joursMoyens(ligne.averageEntryLagDays) },
        { label: t('Saisies le jour même'), value: pourcent(ligne.sameDayShare) }
      ]}
    />
  );
}

const OngletIndicateurs: React.FC<{ tenantId: string; champ: StockFieldContext }> = ({ tenantId, champ }) => {
  const [saisie, setSaisie] = useState<[Dayjs | null, Dayjs | null]>(periodeParDefaut());
  const [periode, setPeriode] = useState<[Dayjs, Dayjs]>(periodeParDefaut());
  const [lieu, setLieu] = useState<string | undefined>(undefined);

  const debut = saisie[0];
  const fin = saisie[1];
  const tropLong = Boolean(debut && fin && nombreDeMois(debut, fin) > MOIS_MAX);
  const envoiPossible = Boolean(debut && fin) && !tropLong;

  const requete = { from: periode[0].format('YYYY-MM'), to: periode[1].format('YYYY-MM') };
  const indicateurs = useQuery({
    queryKey: queryKey('stock-indicators', tenantId, requete),
    queryFn: () => getStockIndicators(tenantId, requete),
    staleTime: STALE_TIME.list
  });

  const totaux = useMemo(
    () => [...(indicateurs.data?.totals ?? [])].sort((a, b) => a.month.localeCompare(b.month)),
    [indicateurs.data]
  );
  const lignes = useMemo(
    () => (indicateurs.data?.rows ?? []).filter(ligne => !lieu || ligne.locationId === lieu),
    [indicateurs.data, lieu]
  );
  const dernier = totaux[totaux.length - 1];
  const sansValeursFigees = totaux.reduce((somme, ligne) => somme + (ligne.countsWithoutFrozenValues || 0), 0);

  const colonnesParMois: ColumnsType<StockIndicatorRow> = [
    { key: 'mois', title: t('Mois'), render: (_, ligne) => libelleMois(ligne.month) },
    ...colonnesIndicateurs()
  ];
  const colonnesParLieu: ColumnsType<StockIndicatorRow> = [
    { key: 'lieu', title: t('Lieu'), render: (_, ligne) => ligne.locationLabel ?? '' },
    { key: 'mois', title: t('Mois'), render: (_, ligne) => libelleMois(ligne.month) },
    ...colonnesIndicateurs()
  ];

  return (
    <Space orientation="vertical" size="large" style={{ width: '100%' }}>
      <Space wrap align="start">
        <div>
          <DatePicker.RangePicker
            picker="month"
            aria-label={t('Période')}
            value={saisie}
            onChange={valeurs => setSaisie([valeurs?.[0] ?? null, valeurs?.[1] ?? null])}
            allowClear={false}
          />
          {tropLong ? (
            <Text type="danger" style={{ display: 'block' }}>
              {t('24 mois au plus.')}
            </Text>
          ) : null}
        </div>
        <Button
          type="primary"
          disabled={!envoiPossible}
          onClick={() => {
            if (debut && fin) setPeriode([debut, fin]);
          }}
        >
          {t('Afficher')}
        </Button>
      </Space>

      {indicateurs.isLoading ? (
        <SkeletonList rows={4} aria-label={t('Indicateurs en cours de chargement')} />
      ) : indicateurs.error ? (
        <StateBlock
          variant="error"
          description={lireErreur(indicateurs.error).message || t('Les indicateurs n’ont pas pu être chargés.')}
          actions={[{ label: t('Réessayer'), onClick: () => void indicateurs.refetch(), primary: true }]}
        />
      ) : (
        <>
          {dernier ? (
            <Row gutter={[12, 12]}>
              <Col xs={24} sm={12} lg={6}>
                <StatCard
                  label={t('Taux d’écart')}
                  value={pourcent(dernier.varianceRate)}
                  hint={
                    dernier.varianceRate === null
                      ? t('Aucun inventaire validé ce mois-ci.')
                      : t('Écarts des inventaires validés rapportés à la valeur comptée. Hors inventaires d’ouverture.')
                  }
                />
              </Col>
              <Col xs={24} sm={12} lg={6}>
                <StatCard
                  label={t('Sorties avec preneur identifié')}
                  value={pourcent(dernier.takerShare)}
                  hint={t('Sorties dont le preneur vient du carnet.')}
                />
              </Col>
              <Col xs={24} sm={12} lg={6}>
                <StatCard
                  label={t('Inventaires validés par une autre personne')}
                  value={pourcent(dernier.otherValidatorShare)}
                  hint={t('Inventaires validés par quelqu’un qui n’a pas compté.')}
                />
              </Col>
              <Col xs={24} sm={12} lg={6}>
                <StatCard
                  label={t('Délai moyen de saisie')}
                  value={joursMoyens(dernier.averageEntryLagDays)}
                  hint={t('Écart moyen entre la date déclarée et le jour de saisie. Saisis le jour même : {{part}}.', {
                    part: pourcent(dernier.sameDayShare)
                  })}
                />
              </Col>
            </Row>
          ) : null}

          <Card title={t('Par mois')} size="small">
            <DataView<StockIndicatorRow>
              aria-label={t('Indicateurs par mois')}
              items={totaux}
              total={totaux.length}
              page={1}
              pageSize={Math.max(totaux.length, 1)}
              paginated={false}
              onPageChange={() => undefined}
              emptyDescription={t('Aucun mouvement ni inventaire sur la période.')}
              rowKey={ligne => ligne.month}
              columns={colonnesParMois}
              renderCard={ligne => carteIndicateur(ligne, libelleMois(ligne.month))}
            />
          </Card>

          <Card
            title={t('Par lieu et par mois')}
            size="small"
            extra={
              <Select<string>
                aria-label={t('Lieu')}
                placeholder={t('Tous les lieux')}
                allowClear
                style={{ minWidth: 200 }}
                value={lieu}
                onChange={setLieu}
                options={champ.locations.map(item => ({ value: item.id, label: item.label }))}
              />
            }
          >
            <DataView<StockIndicatorRow>
              aria-label={t('Indicateurs par lieu et par mois')}
              items={lignes}
              total={lignes.length}
              page={1}
              pageSize={Math.max(lignes.length, 1)}
              paginated={false}
              onPageChange={() => undefined}
              isFiltered={Boolean(lieu)}
              onClearFilters={() => setLieu(undefined)}
              emptyDescription={t('Aucun mouvement ni inventaire sur la période.')}
              rowKey={ligne => `${ligne.locationId ?? ''}-${ligne.month}`}
              columns={colonnesParLieu}
              renderCard={ligne => carteIndicateur(ligne, `${ligne.locationLabel ?? ''} · ${libelleMois(ligne.month)}`)}
            />
          </Card>

          {sansValeursFigees > 0 ? (
            <Text type="secondary">
              {t(
                '{{n}} inventaire(s) validé(s) avant la mise en place de ce contrôle ne sont pas comptés dans le taux d’écart : leurs valeurs n’ont pas été figées.',
                { n: sansValeursFigees }
              )}
            </Text>
          ) : null}
        </>
      )}

      <Text type="secondary">{t('Ces indicateurs portent sur des lieux et des mois, jamais sur des personnes.')}</Text>
    </Space>
  );
};

// ---------------------------------------------------------------------------
// Onglet « Réglages de contrôle » (A5-R4, B2-R3, B7, A9)
// ---------------------------------------------------------------------------

type Seuil = 'issueAlertAmount' | 'countVarianceAlertAmount' | 'countVarianceAlertPercent' | 'cashMaterialAlertAmount';

const SEUILS: Seuil[] = [
  'issueAlertAmount',
  'countVarianceAlertAmount',
  'countVarianceAlertPercent',
  'cashMaterialAlertAmount'
];

interface Brouillon {
  backdatingLimitDays: number | null;
  requireTaker: boolean;
  valeurs: Record<Seuil, number | null>;
  desactive: Record<Seuil, boolean>;
  materialCostCategoryIds: string[];
}

function brouillonDe(reglages: StockControlsSettings): Brouillon {
  const valeurs = {} as Record<Seuil, number | null>;
  const desactive = {} as Record<Seuil, boolean>;
  for (const seuil of SEUILS) {
    valeurs[seuil] = reglages[seuil];
    desactive[seuil] = reglages[seuil] === null;
  }
  return {
    backdatingLimitDays: reglages.backdatingLimitDays,
    requireTaker: reglages.requireTaker,
    valeurs,
    desactive,
    materialCostCategoryIds: [...reglages.materialCostCategoryIds]
  };
}

/**
 * Les SEULS champs modifiés ; « Désactiver » envoie `null` (contrat
 * `ControlsSettingsPatch`), comme un seuil laissé vide : l'API refuse un seuil
 * à zéro et attend `null` pour désactiver une alerte.
 */
function patchDe(reglages: StockControlsSettings, brouillon: Brouillon): ControlsSettingsPatch {
  const patch: ControlsSettingsPatch = {};
  if (brouillon.backdatingLimitDays !== null && brouillon.backdatingLimitDays !== reglages.backdatingLimitDays) {
    patch.backdatingLimitDays = brouillon.backdatingLimitDays;
  }
  if (brouillon.requireTaker !== reglages.requireTaker) patch.requireTaker = brouillon.requireTaker;
  for (const seuil of SEUILS) {
    const effectif = brouillon.desactive[seuil] ? null : brouillon.valeurs[seuil];
    if (effectif !== reglages[seuil]) patch[seuil] = effectif;
  }
  const avant = [...reglages.materialCostCategoryIds].sort().join(',');
  const apres = [...brouillon.materialCostCategoryIds].sort().join(',');
  if (avant !== apres) patch.materialCostCategoryIds = brouillon.materialCostCategoryIds;
  return patch;
}

/**
 * Un seuil saisi à zéro (ou moins) : refusé par l'API, qui ferait sinon
 * sonner l'alerte à chaque opération. Vide, il désactive l'alerte.
 */
function seuilNonPositif(brouillon: Brouillon, seuil: Seuil): boolean {
  const valeur = brouillon.valeurs[seuil];
  return !brouillon.desactive[seuil] && valeur !== null && valeur <= 0;
}

const seuilPositifTexte = (): string =>
  t("Un seuil d'alerte doit être supérieur à zéro. Laissez-le vide pour désactiver l'alerte.");

/** La borne d'antériorité doit porter une valeur ; un seuil saisi doit être strictement positif. */
function brouillonValide(brouillon: Brouillon): boolean {
  if (brouillon.backdatingLimitDays === null) return false;
  return SEUILS.every(seuil => !seuilNonPositif(brouillon, seuil));
}

function lectureSeuleTexte(): string {
  return t('Seule une personne qui peut paramétrer la finance de l’agence peut modifier ces réglages.');
}

interface OngletReglagesProps {
  tenantId: string;
  champ: StockFieldContext;
  peutModifier: boolean;
}

const OngletReglages: React.FC<OngletReglagesProps> = ({ tenantId, champ, peutModifier }) => {
  const reglages = useQuery({
    queryKey: queryKey('stock-controls', tenantId),
    queryFn: () => getStockControls(tenantId),
    staleTime: STALE_TIME.list
  });

  if (reglages.isLoading) {
    return <SkeletonList rows={4} aria-label={t('Réglages en cours de chargement')} />;
  }
  if (reglages.error || !reglages.data) {
    return (
      <StateBlock
        variant="error"
        description={lireErreur(reglages.error).message || t('Les réglages n’ont pas pu être chargés.')}
        actions={[{ label: t('Réessayer'), onClick: () => void reglages.refetch(), primary: true }]}
      />
    );
  }
  return (
    <FormulaireReglages
      key={reglages.data.updatedAt ?? 'defaut'}
      tenantId={tenantId}
      champ={champ}
      reglages={reglages.data}
      peutModifier={peutModifier}
    />
  );
};

interface FormulaireReglagesProps extends OngletReglagesProps {
  reglages: StockControlsSettings;
}

const FormulaireReglages: React.FC<FormulaireReglagesProps> = ({ tenantId, champ, reglages, peutModifier }) => {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [brouillon, setBrouillon] = useState<Brouillon>(() => brouillonDe(reglages));
  const [refuse, setRefuse] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  // Le refus `400` du serveur, champ par champ, effacé dès qu'on retouche le seuil.
  const [refusParSeuil, setRefusParSeuil] = useState<Partial<Record<Seuil, string>>>({});
  const lectureSeule = !peutModifier || refuse;

  const patch = patchDe(reglages, brouillon);
  const modifie = Object.keys(patch).length > 0;
  const libellePoste = (id: string) => champ.costCategories.find(poste => poste.id === id)?.label ?? id;

  const oublierRefus = (seuil: Seuil) =>
    setRefusParSeuil(courant => {
      if (!(seuil in courant)) return courant;
      const reste = { ...courant };
      delete reste[seuil];
      return reste;
    });
  const changerValeur = (seuil: Seuil, valeur: number | null) => {
    oublierRefus(seuil);
    setBrouillon(courant => ({ ...courant, valeurs: { ...courant.valeurs, [seuil]: valeur } }));
  };
  const changerDesactive = (seuil: Seuil, desactive: boolean) => {
    oublierRefus(seuil);
    setBrouillon(courant => ({ ...courant, desactive: { ...courant.desactive, [seuil]: desactive } }));
  };

  const enregistrer = async () => {
    setEnvoi(true);
    try {
      const resultat = await updateStockControls(tenantId, patch);
      message.success(t('Réglages enregistrés.'));
      // L'antériorité et l'exigence d'un preneur sont lues par les gestes.
      await queryClient.invalidateQueries({ queryKey: entityKeyPrefix(STOCK_FIELD_CONTEXT_ENTITY, tenantId) });
      // En dernier : la nouvelle date de modification remonte le formulaire.
      queryClient.setQueryData(queryKey('stock-controls', tenantId), resultat);
    } catch (error) {
      const erreur = lireErreur(error);
      if (erreur.status === 403) {
        setRefuse(true);
        message.error(lectureSeuleTexte());
      } else {
        // Un `400` de validation porte sa raison champ par champ : la montrer
        // sous le seuil visé, et dans le message plutôt que « données invalides ».
        const refusSeuils: Partial<Record<Seuil, string>> = {};
        for (const seuil of SEUILS) {
          if (erreur.champs[seuil]) refusSeuils[seuil] = erreur.champs[seuil];
        }
        setRefusParSeuil(refusSeuils);
        const details = [...new Set(Object.values(erreur.champs))];
        message.error(
          details.length > 0 ? details.join(' ') : erreur.message || t('Les réglages n’ont pas pu être enregistrés.')
        );
      }
    } finally {
      setEnvoi(false);
    }
  };

  /**
   * Un seuil : strictement positif, ou vide pour désactiver l'alerte (comme la
   * case). Zéro n'est pas ramené en silence à une petite valeur — une alerte à
   * 1 FCFA sonnerait à chaque opération : le champ le refuse en clair et
   * l'enregistrement attend une correction.
   */
  const champSeuil = (seuil: Seuil, libelle: string, aide: string, pourcentage = false) => {
    const refusLocal = seuilNonPositif(brouillon, seuil);
    const erreur = refusLocal ? seuilPositifTexte() : brouillon.desactive[seuil] ? undefined : refusParSeuil[seuil];
    const idAide = `seuil-${seuil}-aide`;
    const idErreur = `seuil-${seuil}-erreur`;
    const commun = {
      id: `seuil-${seuil}`,
      min: 0,
      status: erreur ? ('error' as const) : undefined,
      'aria-invalid': erreur ? true : undefined,
      'aria-describedby': erreur ? `${idErreur} ${idAide}` : idAide,
      disabled: lectureSeule || brouillon.desactive[seuil],
      value: brouillon.desactive[seuil] ? null : brouillon.valeurs[seuil]
    };
    return (
      <div style={{ marginBlockEnd: 'var(--space-4)' }}>
        <label htmlFor={`seuil-${seuil}`} style={{ display: 'block', fontWeight: 600, marginBlockEnd: 4 }}>
          {libelle}
        </label>
        <Space wrap>
          {pourcentage ? (
            <InputNumber<number>
              {...commun}
              max={100}
              suffix="%"
              onChange={valeur => changerValeur(seuil, valeur ?? null)}
            />
          ) : (
            <InputNumber
              {...commun}
              {...montantSaisiProps}
              suffix="FCFA"
              style={{ minWidth: 180 }}
              onChange={valeur => {
                const nombre = valeur === null || valeur === undefined || valeur === '' ? null : Number(valeur);
                changerValeur(seuil, nombre !== null && Number.isFinite(nombre) ? nombre : null);
              }}
            />
          )}
          <Checkbox
            checked={brouillon.desactive[seuil]}
            disabled={lectureSeule}
            onChange={event => changerDesactive(seuil, event.target.checked)}
          >
            {t('Désactiver cette alerte')}
          </Checkbox>
        </Space>
        {erreur ? (
          <Text type="danger" id={idErreur} style={{ display: 'block' }}>
            {erreur}
          </Text>
        ) : null}
        <Text type="secondary" id={idAide} style={{ display: 'block' }}>
          {aide}
        </Text>
      </div>
    );
  };

  return (
    <Space orientation="vertical" size="middle" style={{ width: '100%', maxWidth: 760 }}>
      <Alert
        type="info"
        showIcon
        title={t('Les seuils proposés sont des points de départ. Ajustez-les à la taille de vos chantiers.')}
      />
      {lectureSeule ? <Alert type="warning" showIcon title={lectureSeuleTexte()} /> : null}

      <Card size="small">
        <div style={{ marginBlockEnd: 'var(--space-4)' }}>
          <label htmlFor="reglage-anteriorite" style={{ display: 'block', fontWeight: 600, marginBlockEnd: 4 }}>
            {t('Antériorité maximale d’une date de mouvement')}
          </label>
          <InputNumber<number>
            id="reglage-anteriorite"
            min={0}
            max={365}
            precision={0}
            suffix={t('jours')}
            disabled={lectureSeule}
            value={brouillon.backdatingLimitDays}
            onChange={valeur => setBrouillon(courant => ({ ...courant, backdatingLimitDays: valeur ?? null }))}
          />
          <Text type="secondary" style={{ display: 'block' }}>
            {t(
              'Une réception, une sortie ou un inventaire ne peut pas être daté de plus loin. Pour reprendre un historique, relevez la borne le temps de l’import, puis remettez-la.'
            )}
          </Text>
        </div>

        <div style={{ marginBlockEnd: 'var(--space-4)' }}>
          <Space>
            <Switch
              id="reglage-preneur"
              checked={brouillon.requireTaker}
              disabled={lectureSeule}
              onChange={requireTaker => setBrouillon(courant => ({ ...courant, requireTaker }))}
            />
            <label htmlFor="reglage-preneur" style={{ fontWeight: 600 }}>
              {t('Exiger un preneur du carnet')}
            </label>
          </Space>
          <Text type="secondary" style={{ display: 'block' }}>
            {t(
              'Activé : chaque sortie et chaque transfert doit nommer un preneur du carnet. Désactivé : un nom saisi à la main suffit.'
            )}
          </Text>
        </div>

        <Paragraph type="secondary" style={{ marginBlockEnd: 'var(--space-3)' }}>
          {t(
            'Un seuil saisi doit être supérieur à zéro. Un seuil laissé vide désactive son alerte, comme la case « Désactiver cette alerte ».'
          )}
        </Paragraph>

        {champSeuil(
          'issueAlertAmount',
          t('Sortie importante'),
          t('Alerte quand un bon de sortie ou un rebut atteint ce montant.')
        )}
        {champSeuil(
          'countVarianceAlertAmount',
          t('Écart d’inventaire — montant'),
          t('Alerte quand l’écart d’un inventaire validé atteint ce montant…')
        )}
        {champSeuil(
          'countVarianceAlertPercent',
          t('Écart d’inventaire — taux'),
          t('… ou ce pourcentage de la valeur comptée.'),
          true
        )}
        {champSeuil(
          'cashMaterialAlertAmount',
          t('Achats de matériaux en espèces'),
          t('Alerte quand une pièce de caisse de matériaux, ou leur cumul du mois sur un chantier, atteint ce montant.')
        )}

        <div>
          <label htmlFor="reglage-postes" style={{ display: 'block', fontWeight: 600, marginBlockEnd: 4 }}>
            {t('Postes « matériaux »')}
          </label>
          <Select<string[]>
            id="reglage-postes"
            mode="multiple"
            allowClear
            optionFilterProp="label"
            style={{ width: '100%' }}
            disabled={lectureSeule}
            value={brouillon.materialCostCategoryIds}
            onChange={materialCostCategoryIds => setBrouillon(courant => ({ ...courant, materialCostCategoryIds }))}
            options={champ.costCategories.map(poste => ({ value: poste.id, label: poste.label }))}
          />
          {brouillon.materialCostCategoryIds.length === 0 ? (
            <Text type="secondary" style={{ display: 'block' }}>
              {t('Postes retenus faute de choix : {{postes}} (postes proposés par vos articles).', {
                postes: reglages.effectiveMaterialCostCategoryIds.map(libellePoste).join(', ') || t('aucun')
              })}
            </Text>
          ) : null}
        </div>
      </Card>

      {reglages.updatedAt ? (
        <Text type="secondary">
          {t('Modifié le {{date}} par {{nom}}.', {
            date: safeFormatDate(reglages.updatedAt),
            nom: reglages.updatedByLabel ?? ''
          })}
        </Text>
      ) : null}

      {!lectureSeule ? (
        <Space>
          <Button
            type="primary"
            disabled={!modifie || !brouillonValide(brouillon)}
            loading={envoi}
            onClick={() => void enregistrer()}
          >
            {t('Enregistrer les réglages')}
          </Button>
          <Button disabled={!modifie || envoi} onClick={() => setBrouillon(brouillonDe(reglages))}>
            {t('Annuler les modifications')}
          </Button>
        </Space>
      ) : null}
    </Space>
  );
};

export default StockControle;
