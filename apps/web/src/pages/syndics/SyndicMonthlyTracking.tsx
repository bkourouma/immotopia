import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Pagination, Select, Space, Tag, Tooltip, Typography } from 'antd';
import { formatMoney, ListSearch, MoneyValue, SkeletonTable, StateBlock } from '../../components/primitives';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { useLocalListSearch } from '../../utils/list-search';
import type { SearchCriterion } from '../../utils/list-search';
import { getMonthlyTracking } from '../../services/syndic-lot-payment-service';
import { listBudgets } from '../../services/syndic-service';
import {
  MonthlyTracking,
  MonthlyTrackingLotRow,
  MonthlyTrackingStatus,
  SyndicateBudget
} from '../../types/syndic-types';
import { useSyndicRouteContext } from './useSyndicRouteContext';
import { t } from '../../i18n/t';
import { displayCurrency } from '../../utils/syndic-currency';
import { HelpSectionTitle } from '../../help';

import { localizedList, localizedRecord } from '../../i18n/localized';
const { Paragraph, Title, Text } = Typography;

const MONTH_LABELS = localizedList(() => [
  t('Janv.'),
  t('Févr.'),
  t('Mars'),
  t('Avr.'),
  t('Mai'),
  t('Juin'),
  t('Juil.'),
  t('Août'),
  t('Sept.'),
  t('Oct.'),
  t('Nov.'),
  t('Déc.')
]);

/**
 * Couleurs et libellés d'un mois du suivi (lot S2, besoin 5). Le libellé
 * n'est jamais que décoratif : la légende et le texte de la cellule portent
 * l'information, la couleur seule ne suffit jamais (accessibilité).
 */
const STATUS_CONFIG: Record<MonthlyTrackingStatus, { color: string; textColor: string; label: string }> =
  localizedRecord(() => ({
    PAID: {
      color: 'var(--color-success-bg, #e6f7e9)',
      textColor: 'var(--color-success-text, #237a3f)',
      label: t('Réglé')
    },
    PARTIAL: {
      color: 'var(--color-warning-bg, #fff3e0)',
      textColor: 'var(--color-warning-text, #ad6800)',
      label: t('Partiel')
    },
    DUE: { color: 'var(--color-info-bg, #e6f0ff)', textColor: 'var(--color-info-text, #1d4ed8)', label: t('Dû') },
    OVERDUE: {
      color: 'var(--color-error-bg, #fde8e8)',
      textColor: 'var(--color-error-text, #c0202c)',
      label: t('En retard')
    },
    NONE: { color: 'transparent', textColor: 'var(--text-secondary, #999)', label: t('—') }
  }));

/** Colonne du lot figée au défilement horizontal (propriétés logiques : suit le sens de lecture). */
const STICKY_LOT: React.CSSProperties = {
  position: 'sticky',
  insetInlineStart: 0,
  zIndex: 1,
  background: 'var(--surface-card, #fff)'
};

/** Budget créé en dernier : celui que la page affiche tant qu'on n'en choisit pas un autre. */
function latestCreatedBudget(budgets: SyndicateBudget[]): SyndicateBudget | null {
  return budgets.reduce<SyndicateBudget | null>(
    (latest, item) => (!latest || item.createdAt > latest.createdAt ? item : latest),
    null
  );
}

// Statuts proposés au critère : NONE (« — », aucun appel ce mois-ci) n'est pas un statut à chercher.
const STATUTS_RECHERCHABLES: MonthlyTrackingStatus[] = ['PAID', 'PARTIAL', 'DUE', 'OVERDUE'];

// Accesseurs stables (hors du composant) : le filtrage reste mémoïsé.
const TEXTE_RECHERCHE = [(row: MonthlyTrackingLotRow) => row.lotNumber, (row: MonthlyTrackingLotRow) => row.ownerName];
const ACCESSEURS = {
  // Tableau : une ligne passe si l'un de ses mois porte l'un des statuts choisis.
  statut: (row: MonthlyTrackingLotRow) => row.months.map(cell => cell.status)
};

export const SyndicMonthlyTracking: React.FC = () => {
  const { tenantId: effectiveTenantId, syndicId } = useSyndicRouteContext();
  const { isMobile } = useBreakpoint();
  // Incrémenté par « Réessayer » : relance le chargement de la grille.
  const [reloadKey, setReloadKey] = useState(0);
  // Budget affiché : le dernier créé par défaut. Vide seulement quand la copropriété n'a aucun budget.
  const [budgetId, setBudgetId] = useState('');
  const [budgets, setBudgets] = useState<SyndicateBudget[]>([]);
  const [budgetsLoaded, setBudgetsLoaded] = useState(false);
  const [tracking, setTracking] = useState<MonthlyTracking | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Liste des budgets : la grille attend sa réponse pour savoir quel budget afficher. Son échec laisse
  // simplement la grille de l'année courante, sans filtre.
  useEffect(() => {
    if (!effectiveTenantId || !syndicId) return;
    let cancelled = false;
    listBudgets(effectiveTenantId, syndicId)
      .then(data => {
        if (cancelled) return;
        const list = Array.isArray(data) ? data : [];
        setBudgets(list);
        setBudgetId(current => current || latestCreatedBudget(list)?.id || '');
      })
      .catch(() => {
        if (!cancelled) setBudgets([]);
      })
      .finally(() => {
        if (!cancelled) setBudgetsLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [effectiveTenantId, syndicId]);

  useEffect(() => {
    if (!effectiveTenantId || !syndicId) {
      setLoading(false);
      setError(t('Paramètres suivi mensuel manquants'));
      return;
    }
    if (!budgetsLoaded) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    // L'année n'est pas demandée : l'API la déduit du budget (celle de ses appels).
    getMonthlyTracking(effectiveTenantId, syndicId, undefined, budgetId || undefined)
      .then(data => {
        if (!cancelled) setTracking(data);
      })
      .catch((err: any) => {
        if (!cancelled) setError(err.response?.data?.error || t('Impossible de charger le suivi mensuel'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [effectiveTenantId, syndicId, budgetsLoaded, budgetId, reloadKey]);

  const budgetOptions = useMemo(
    () => budgets.map(budget => ({ value: budget.id, label: `${budget.label} (${budget.fiscalYear})` })),
    [budgets]
  );
  const currency = tracking?.currency;

  const lots = useMemo(() => tracking?.lots ?? [], [tracking]);
  const criteria: SearchCriterion[] = [
    {
      key: 'q',
      type: 'text',
      label: t('Rechercher'),
      placeholder: t('N° de lot, copropriétaire…')
    },
    {
      key: 'statut',
      type: 'multiSelect',
      label: t('Statut sur au moins un mois'),
      primary: true,
      options: STATUTS_RECHERCHABLES.map(status => ({ value: status, label: STATUS_CONFIG[status].label }))
    }
  ];
  const local = useLocalListSearch<MonthlyTrackingLotRow>(lots, {
    ariaLabel: t('Rechercher un lot'),
    criteria,
    text: TEXTE_RECHERCHE,
    accessors: ACCESSEURS
  });
  const { clampPage, total: totalFiltre } = local;
  useEffect(() => {
    clampPage?.(totalFiltre);
  }, [clampPage, totalFiltre]);

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <Space direction="vertical" size={4}>
          <Title level={2} style={{ margin: 0 }}>
            {t('Suivi mensuel')}
          </Title>
          <Paragraph type="secondary" style={{ marginBottom: 0 }}>
            {t('Chaque lot, mois par mois : réglé, partiel, dû ou en retard.')}
          </Paragraph>
        </Space>

        {budgetOptions.length > 0 ? (
          <Space size={8} wrap style={isMobile ? { width: '100%' } : undefined}>
            <Text>{t('Budget')}</Text>
            <Select
              aria-label={t('Budget')}
              style={isMobile ? { width: '100%', minWidth: 200 } : { minWidth: 280 }}
              showSearch
              optionFilterProp="label"
              value={budgetId}
              options={budgetOptions}
              onChange={setBudgetId}
            />
            {tracking ? <Tag>{tracking.year}</Tag> : null}
          </Space>
        ) : null}
      </div>

      {error ? (
        <Alert
          type="error"
          message={error}
          showIcon
          action={
            effectiveTenantId && syndicId ? (
              <Button size="small" onClick={() => setReloadKey(key => key + 1)}>
                {t('Réessayer')}
              </Button>
            ) : undefined
          }
        />
      ) : null}

      {loading ? (
        <SkeletonTable rows={6} columns={6} aria-label={t('Chargement du suivi mensuel')} />
      ) : (
        <Card title={<HelpSectionTitle title={t('Suivi mensuel')} helpId="syndic.suivi.liste.grille" />}>
          {lots.length > 0 || local.isFiltered ? <ListSearch {...local.searchProps} /> : null}
          {isMobile && lots.length > 0 ? (
            <Text type="secondary" style={{ display: 'block', margin: '8px 0' }}>
              {t('Faites glisser la grille pour voir tous les mois ; le numéro de lot reste affiché.')}
            </Text>
          ) : null}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 900 }}>
              <thead>
                <tr>
                  <th style={{ ...STICKY_LOT, textAlign: 'start', padding: 8, whiteSpace: 'nowrap' }}>{t('Lot')}</th>
                  <th style={{ textAlign: 'start', padding: 8, whiteSpace: 'nowrap' }}>{t('Copropriétaire')}</th>
                  {MONTH_LABELS.map(label => (
                    <th key={label} style={{ textAlign: 'center', padding: 8, minWidth: 72 }}>
                      {label}
                    </th>
                  ))}
                  <th style={{ textAlign: 'end', padding: 8, whiteSpace: 'nowrap' }}>{t('Avance')}</th>
                </tr>
              </thead>
              <tbody>
                {local.pageItems.map(row => (
                  <tr key={row.lotId}>
                    <td style={{ ...STICKY_LOT, padding: 8, fontWeight: 600, whiteSpace: 'nowrap' }}>
                      {row.lotNumber}
                    </td>
                    <td style={{ padding: 8, whiteSpace: 'nowrap' }}>{row.ownerName || t('Sans copropriétaire')}</td>
                    {row.months.map(cell => {
                      const config = STATUS_CONFIG[cell.status];
                      const tooltip = t('{{label}} — dû {{due}}, réglé {{paid}}', {
                        label: config.label,
                        due: formatMoney(cell.due, { currency: displayCurrency(currency) ?? undefined }),
                        paid: formatMoney(cell.paid, { currency: displayCurrency(currency) ?? undefined })
                      });
                      return (
                        <td key={cell.month} style={{ padding: 4, textAlign: 'center' }}>
                          <Tooltip title={tooltip}>
                            <div
                              role="img"
                              aria-label={tooltip}
                              style={{
                                backgroundColor: config.color,
                                color: config.textColor,
                                borderRadius: 6,
                                padding: '4px 2px',
                                fontSize: 12,
                                fontWeight: 600,
                                lineHeight: 1.2
                              }}
                            >
                              {config.label}
                            </div>
                          </Tooltip>
                        </td>
                      );
                    })}
                    <td style={{ padding: 8, textAlign: 'end', whiteSpace: 'nowrap' }}>
                      <MoneyValue value={row.advance} currency={displayCurrency(currency)} />
                    </td>
                  </tr>
                ))}
                {lots.length === 0 ? (
                  <tr>
                    <td colSpan={15} style={{ padding: 16, textAlign: 'center' }}>
                      {t('Aucun lot pour cette copropriété.')}
                    </td>
                  </tr>
                ) : null}
                {lots.length > 0 && local.total === 0 ? (
                  <tr>
                    <td colSpan={15} style={{ padding: 8 }}>
                      <StateBlock
                        variant="no-results"
                        actions={[{ label: t('Effacer les critères'), onClick: local.clear, primary: true }]}
                      />
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          {local.total > local.pageSize ? (
            <Pagination
              current={local.page}
              pageSize={local.pageSize}
              total={local.total}
              showSizeChanger={false}
              onChange={page => local.setPage(page)}
              style={{ marginTop: 16, textAlign: 'end' }}
            />
          ) : null}

          <Space wrap size={16} style={{ marginTop: 16 }} aria-label={t('Légende')}>
            {(Object.keys(STATUS_CONFIG) as MonthlyTrackingStatus[]).map(status => {
              const config = STATUS_CONFIG[status];
              return (
                <Space key={status} size={6}>
                  <span
                    aria-hidden
                    style={{
                      display: 'inline-block',
                      width: 12,
                      height: 12,
                      borderRadius: 3,
                      backgroundColor: config.color,
                      border: status === 'NONE' ? '1px solid var(--border-color, #ccc)' : undefined
                    }}
                  />
                  <Text>{config.label}</Text>
                </Space>
              );
            })}
          </Space>
        </Card>
      )}
    </Space>
  );
};
