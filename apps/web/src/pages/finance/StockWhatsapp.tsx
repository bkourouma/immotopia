import React from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Tabs } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '../../components/primitives/PageHeader';
import { StateBlock } from '../../components/primitives/StateBlock';
import { ModuleNotIncluded } from '../../components/primitives/ModuleNotIncluded';
import { SkeletonDetail, SkeletonStats } from '../../components/primitives/Skeleton';
import { WhatsappOverviewCards } from '../../components/finance/stock/whatsapp/WhatsappOverviewCards';
import {
  STOCK_WHATSAPP_REGISTRATIONS_ENTITY,
  WhatsappRegistrationsTab
} from '../../components/finance/stock/whatsapp/WhatsappRegistrationsTab';
import { WhatsappSimulator } from '../../components/finance/stock/whatsapp/WhatsappSimulator';
import {
  STOCK_WHATSAPP_OVERVIEW_ENTITY,
  WhatsappMeasures
} from '../../components/finance/stock/whatsapp/WhatsappMeasures';
import { useStockFieldContext } from '../../hooks/useStockFieldContext';
import { queryKey, STALE_TIME } from '../../lib/query-keys';
import {
  getStockWhatsappOverview,
  listStockWhatsappRegistrations
} from '../../services/finance-stock-whatsapp-service';
import { isModuleNotIncludedError } from '../../utils/module-not-included';
import { handleApiError } from '../../utils/error-handler';
import { t } from '../../i18n/t';

type Onglet = 'inscriptions' | 'simulateur' | 'mesures';

/**
 * W-E1 — Onglet « WhatsApp » de Gestion du stock (ecrans §5). Réservé à
 * `FINANCE_SETTINGS_MANAGE` : sans `abilities.canManageSettings`, l'écran
 * affiche le refus SANS appeler les routes WhatsApp. Le simulateur n'existe
 * que si le serveur le déclare disponible (transport `log`).
 */
export function StockWhatsapp(): React.ReactElement {
  const { tenantId } = useParams<{ tenantId: string }>();
  const [params, setParams] = useSearchParams();
  const contexte = useStockFieldContext(tenantId);
  const canManage = Boolean(contexte.data?.data.abilities.canManageSettings);
  const enabled = Boolean(tenantId) && canManage;

  const overview = useQuery({
    queryKey: queryKey(STOCK_WHATSAPP_OVERVIEW_ENTITY, tenantId),
    queryFn: () => getStockWhatsappOverview(tenantId as string),
    enabled,
    staleTime: STALE_TIME.list
  });

  const registrations = useQuery({
    queryKey: queryKey(STOCK_WHATSAPP_REGISTRATIONS_ENTITY, tenantId),
    queryFn: () => listStockWhatsappRegistrations(tenantId as string),
    enabled,
    staleTime: STALE_TIME.list
  });

  const header = (
    <PageHeader
      title={t('Inventaire par WhatsApp')}
      subtitle={t('Chefs de chantier, quota du mois et état de la passerelle')}
    />
  );

  if (!tenantId) return <StateBlock variant="empty" title={t('Aucune agence sélectionnée')} />;

  if (contexte.isPending) {
    return (
      <>
        {header}
        <SkeletonDetail />
      </>
    );
  }
  if (contexte.error && isModuleNotIncludedError(contexte.error)) return <ModuleNotIncluded />;
  if (contexte.error || !canManage) {
    return (
      <>
        {header}
        <StateBlock
          variant="forbidden"
          title={t('Réservé aux administrateurs du stock')}
          description={t('L’inscription des chefs de chantier demande le droit de paramétrer la finance.')}
        />
      </>
    );
  }

  const simulatorAvailable = Boolean(overview.data?.simulatorAvailable);
  const demande = params.get('onglet') as Onglet | null;
  const onglet: Onglet =
    demande === 'mesures' ? 'mesures' : demande === 'simulateur' && simulatorAvailable ? 'simulateur' : 'inscriptions';

  const changerOnglet = (cle: string) => {
    setParams(
      prev => {
        const next = new URLSearchParams(prev);
        next.set('onglet', cle);
        return next;
      },
      { replace: true }
    );
  };

  const items = [
    {
      key: 'inscriptions',
      label: t('Chefs de chantier'),
      children: (
        <WhatsappRegistrationsTab
          tenantId={tenantId}
          registrations={registrations.data ?? []}
          loading={registrations.isPending}
          error={registrations.error ? handleApiError(registrations.error) : null}
          onRetry={() => void registrations.refetch()}
          botNumber={overview.data?.botNumber ?? null}
        />
      )
    },
    ...(simulatorAvailable
      ? [
          {
            key: 'simulateur',
            label: t('Simulateur'),
            children: (
              <WhatsappSimulator
                tenantId={tenantId}
                registrations={(registrations.data ?? []).filter(r => r.status !== 'REVOKED')}
              />
            )
          }
        ]
      : []),
    { key: 'mesures', label: t('Mesures'), children: <WhatsappMeasures tenantId={tenantId} /> }
  ];

  return (
    <>
      {header}
      {overview.isPending ? (
        <SkeletonStats />
      ) : overview.error ? (
        <StateBlock
          variant="error"
          description={handleApiError(overview.error)}
          actions={[{ label: t('Réessayer'), onClick: () => void overview.refetch(), primary: true }]}
        />
      ) : (
        <WhatsappOverviewCards tenantId={tenantId} overview={overview.data} canOpenSubscription />
      )}
      <Tabs activeKey={onglet} onChange={changerOnglet} items={items} destroyOnHidden />
    </>
  );
}

export default StockWhatsapp;
