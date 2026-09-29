import React, { useState } from 'react';
import { App, Button, Card, DatePicker, Input, InputNumber, Space, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { listSiteProgress, recordSiteProgress } from '../../services/finance-lot3-service';
import type { SiteProgressEntry } from '../../types/finance-lot3-types';
import { detailKey, entityKeyPrefix, STALE_TIME } from '../../lib/query-keys';
import { DataView, DataCard } from '../primitives';
import { t } from '../../i18n/t';
import { activeLocale } from '../../i18n/format';

const { Title, Text } = Typography;

/**
 * Avancement physique d'un chantier — saisie d'un point et historique
 * (BUG-2026-09-29-025 ; wiki « Saisir un point d'avancement physique » et
 * « Consulter l'historique d'avancement », lot 3 volet pilotage).
 *
 * Les routes existaient (`GET/POST .../sites/:siteId/progress`) sans aucun
 * écran : l'avancement restait à 0 % sur tous les chantiers.
 *
 * **L'historique est un fait.** On ajoute un point, on n'en modifie ni n'en
 * supprime jamais un. Le pourcentage affiché sur la fiche est celui du point le
 * plus récent au sens de la DATE de saisie, tranché par le serveur
 * (`recordSiteProgressTx`) : rattraper un relevé oublié la semaine dernière ne
 * fait donc pas reculer l'avancement. L'écran ne recalcule rien.
 */

interface AvancementChantierProps {
  tenantId: string;
  siteId: string;
}

function dateCourte(iso: string): string {
  return new Date(iso).toLocaleDateString(activeLocale());
}

export const AvancementChantier: React.FC<AvancementChantierProps> = ({ tenantId, siteId }) => {
  const { message } = App.useApp();
  const queryClient = useQueryClient();

  const [date, setDate] = useState(() => dayjs());
  const [pourcentage, setPourcentage] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [enregistrementEnCours, setEnregistrementEnCours] = useState(false);

  const {
    data: points,
    isPending,
    error,
    refetch
  } = useQuery({
    queryKey: detailKey('site-progress', tenantId, siteId),
    queryFn: () => listSiteProgress(tenantId, siteId),
    staleTime: STALE_TIME.list
  });

  const liste = points ?? [];
  const peutEnregistrer = pourcentage !== null && Number.isInteger(pourcentage);

  const enregistrer = async () => {
    if (!peutEnregistrer || pourcentage === null) {
      message.error(t("Renseignez un pourcentage d'avancement entier, entre 0 et 100."));
      return;
    }
    setEnregistrementEnCours(true);
    try {
      await recordSiteProgress(tenantId, {
        siteId,
        entryDate: date.format('YYYY-MM-DD'),
        percent: pourcentage,
        note: note.trim() || null
      });
      // Le pourcentage de la fiche (`progressPercent`) et la colonne
      // « Avancement » du tableau de bord viennent du serveur : on les relit.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: detailKey('site-progress', tenantId, siteId) }),
        queryClient.invalidateQueries({ queryKey: entityKeyPrefix('construction-sites', tenantId) }),
        queryClient.invalidateQueries({ queryKey: entityKeyPrefix('sites-dashboard', tenantId) })
      ]);
      message.success(t("Point d'avancement enregistré."));
      setPourcentage(null);
      setNote('');
      setDate(dayjs());
    } catch (err: any) {
      message.error(err?.response?.data?.message || t("L'enregistrement du point d'avancement a échoué."));
    } finally {
      setEnregistrementEnCours(false);
    }
  };

  const colonnes: ColumnsType<SiteProgressEntry> = [
    { title: t('Date'), key: 'date', width: 120, render: (_, p) => dateCourte(p.entryDate) },
    { title: t('Avancement'), key: 'pourcentage', width: 120, render: (_, p) => `${p.percent} %` },
    { title: t('Note'), key: 'note', render: (_, p) => p.note ?? '—' },
    { title: t('Saisi par'), key: 'auteur', render: (_, p) => p.createdByLabel }
  ];

  return (
    <Card style={{ marginBottom: 'var(--space-6)' }} aria-label={t('Avancement physique du chantier')}>
      <Title level={4} style={{ marginTop: 0 }}>
        {t('Avancement physique')}
      </Title>
      <Text type="secondary" style={{ display: 'block', marginBottom: 'var(--space-4)' }}>
        {t(
          "Chaque point s'ajoute à l'historique et n'est jamais modifié. L'avancement affiché sur la fiche est celui du point le plus récent par sa date."
        )}
      </Text>

      <Space wrap size="middle" align="end" style={{ width: '100%', marginBottom: 'var(--space-4)' }}>
        <div>
          <div>
            <label htmlFor="avancement-date">{t('Date du point')}</label>
          </div>
          <DatePicker
            id="avancement-date"
            format="DD/MM/YYYY"
            value={date}
            allowClear={false}
            onChange={valeur => valeur && setDate(valeur)}
          />
        </div>
        <div>
          <div>
            <label htmlFor="avancement-pourcentage">{t('Avancement (%)')}</label>
          </div>
          <InputNumber
            id="avancement-pourcentage"
            min={0}
            max={100}
            precision={0}
            value={pourcentage ?? undefined}
            onChange={valeur => setPourcentage(typeof valeur === 'number' ? valeur : null)}
          />
        </div>
        <div style={{ minWidth: 260 }}>
          <div>
            <label htmlFor="avancement-note">{t('Note')}</label>
          </div>
          <Input
            id="avancement-note"
            value={note}
            maxLength={500}
            onChange={event => setNote(event.target.value)}
            placeholder={t('Ex. Fondations terminées')}
          />
        </div>
        <Button type="primary" loading={enregistrementEnCours} disabled={!peutEnregistrer} onClick={enregistrer}>
          {t("Enregistrer le point d'avancement")}
        </Button>
      </Space>

      <DataView<SiteProgressEntry>
        paginated={false}
        items={liste}
        total={liste.length}
        page={1}
        pageSize={Math.max(liste.length, 1)}
        onPageChange={() => {}}
        loading={isPending}
        error={error ? t("Impossible de charger l'historique d'avancement.") : null}
        onRetry={() => refetch()}
        emptyDescription={t("Aucun point d'avancement n'a encore été saisi sur ce chantier.")}
        columns={colonnes}
        rowKey={p => p.id}
        aria-label={t("Historique d'avancement")}
        renderCard={p => (
          <DataCard
            title={`${p.percent} %`}
            aria-label={`${dateCourte(p.entryDate)}, ${p.percent} %`}
            subtitle={dateCourte(p.entryDate)}
            fields={[
              { label: t('Note'), value: p.note ?? '—' },
              { label: t('Saisi par'), value: p.createdByLabel }
            ]}
          />
        )}
      />
    </Card>
  );
};

export default AvancementChantier;
