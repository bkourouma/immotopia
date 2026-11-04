import React from 'react';
import { useParams } from 'react-router-dom';
import { Button, DatePicker, Space, Typography } from 'antd';
import dayjs from 'dayjs';
import type { SyncMeta } from '../../../../services/accounting-exports-service';
import { ContexteMontants, deviseParDefaut } from '../../../../components/primitives/MoneyValue';
import { t } from '../../../../i18n/t';
import { useAccountingPeriod } from './useAccountingPeriod';
import { SyncBanner, SyncStatus, useAccountingSync } from './useAccountingSync';

const { RangePicker } = DatePicker;
const { Text } = Typography;

const ISO = 'YYYY-MM-DD';

/** Les montants d'un tableau comptable ne répètent pas la devise : elle se dit une fois, en pied. */
const SANS_DEVISE = { sansDevise: true, signaler: () => undefined };

export interface AccountingFrameProps {
  /** `data?.sync` de la lecture principale de la page ; `undefined` tant qu'elle n'a pas répondu. */
  sync: SyncMeta | undefined;
  /** Boutons d'export (un seul jeu par écran) : `<ExportButtons />`. */
  actions?: React.ReactNode;
  /** Filtres propres à la page, posés sous la période. */
  filters?: React.ReactNode;
  children?: React.ReactNode;
}

/**
 * Cadre commun des sous-pages de la comptabilité de l'agence. Le titre et les
 * onglets viennent de `<FinanceWorkspaceLayout family="comptabilite">` : le
 * cadre n'ajoute pas d'en-tête.
 *
 * De haut en bas : la note « comptabilité opérationnelle », la période (URL :
 * `from`/`to`) avec ses raccourcis, les filtres de la page, la barre
 * synchronisation + actions, le bandeau « Mise à jour des écritures en cours… »,
 * le contenu, puis la mention de devise.
 */
export const AccountingFrame: React.FC<AccountingFrameProps> = ({ sync, actions, filters, children }) => {
  const { tenantId } = useParams<{ tenantId: string }>();
  const { from, to, setPeriod } = useAccountingPeriod();
  const syncState = useAccountingSync(tenantId, sync);

  const raccourci = (debut: dayjs.Dayjs, fin: dayjs.Dayjs) => setPeriod(debut.format(ISO), fin.format(ISO));
  const moisPrecedent = dayjs().subtract(1, 'month');
  const anneePrecedente = dayjs().subtract(1, 'year');

  return (
    <div>
      <Text type="secondary" style={{ display: 'block', marginBlockEnd: 'var(--space-4)' }}>
        {t(
          "Comptabilité opérationnelle de l'agence : gestion locative, fournisseurs, chantiers. Les copropriétés ont leur propre comptabilité."
        )}
      </Text>

      <div style={{ marginBlockEnd: 'var(--space-4)' }}>
        <div>
          <label htmlFor="comptabilite-periode">{t('Période')}</label>
        </div>
        <Space wrap align="start">
          <RangePicker
            id="comptabilite-periode"
            format="DD/MM/YYYY"
            value={[dayjs(from), dayjs(to)]}
            onChange={dates => {
              if (dates && dates[0] && dates[1]) setPeriod(dates[0].format(ISO), dates[1].format(ISO));
            }}
            allowClear={false}
          />
          <Space wrap>
            <Button onClick={() => raccourci(dayjs().startOf('month'), dayjs())}>{t('Mois en cours')}</Button>
            <Button onClick={() => raccourci(moisPrecedent.startOf('month'), moisPrecedent.endOf('month'))}>
              {t('Mois précédent')}
            </Button>
            <Button onClick={() => raccourci(dayjs().startOf('year'), dayjs())}>{t('Année en cours')}</Button>
            <Button onClick={() => raccourci(anneePrecedente.startOf('year'), anneePrecedente.endOf('year'))}>
              {t('Année précédente')}
            </Button>
          </Space>
        </Space>
      </div>

      {filters ? <div style={{ marginBlockEnd: 'var(--space-4)' }}>{filters}</div> : null}

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 'var(--space-3)',
          marginBlockEnd: 'var(--space-4)'
        }}
      >
        <SyncStatus state={syncState} />
        {actions}
      </div>

      <SyncBanner state={syncState} />

      <ContexteMontants.Provider value={SANS_DEVISE}>{children}</ContexteMontants.Provider>

      <Text type="secondary" style={{ display: 'block', marginBlockStart: 'var(--space-3)' }}>
        {t('Tous les montants sont en {{devise}}.', { devise: deviseParDefaut() })}
      </Text>
    </div>
  );
};
