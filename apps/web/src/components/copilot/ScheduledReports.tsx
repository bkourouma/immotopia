import React, { useEffect, useState } from 'react';
import { Alert, Button, Card, Drawer, Empty, Popconfirm, Space, Spin, Tag } from 'antd';
import { useAssistantTranslation } from '../../i18n/useAssistantTranslation';
import { copilotService, type ScheduledReport } from '../../services/copilot-service';

function reportDate(value: string, locale: string, timeZone?: string) {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone }).format(new Date(value));
}

export function ScheduledReports({ tenantId, onClose }: { tenantId: string; onClose(): void }) {
  const { locale, t } = useAssistantTranslation();
  const [items, setItems] = useState<ScheduledReport[]>([]);
  const [cursor, setCursor] = useState<string>();
  const [next, setNext] = useState<string>();
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<string>();
  const [error, setError] = useState<'load' | 'update'>();
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(undefined);
    void copilotService
      .listScheduledReports(tenantId, cursor, controller.signal)
      .then(page => {
        if (controller.signal.aborted) return;
        setItems(previous => (cursor ? [...previous, ...page.items] : page.items));
        setNext(page.nextCursor);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError('load');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [tenantId, cursor, revision]);

  function refresh() {
    setCursor(undefined);
    setRevision(value => value + 1);
  }

  async function update(report: ScheduledReport, action: 'toggle' | 'share' | 'remove' = 'toggle') {
    setPending(report.id);
    setError(undefined);
    try {
      if (action === 'remove') await copilotService.deleteScheduledReport(tenantId, report.id);
      else
        await copilotService.setScheduledReportActive(
          tenantId,
          report.id,
          !report.active,
          action === 'share' ? true : undefined
        );
      refresh();
    } catch {
      setError('update');
    } finally {
      setPending(undefined);
    }
  }

  const frequencies = { daily: t('Quotidien'), weekly: t('Hebdomadaire'), monthly: t('Mensuel') };
  const statuses: Record<string, string> = {
    SENT: t('Envoyé'),
    PARTIAL: t('Envoi partiel'),
    FAILED: t('Échec'),
    UNKNOWN: t('Envoi à vérifier'),
    PAUSED: t('En pause')
  };
  const weekdays = [t('Lundi'), t('Mardi'), t('Mercredi'), t('Jeudi'), t('Vendredi'), t('Samedi'), t('Dimanche')];
  return (
    <Drawer open size="min(780px, 100vw)" title={t('Rapports')} onClose={onClose}>
      <div style={{ display: 'grid', gap: 12 }} aria-busy={loading}>
        {error && (
          <Alert
            type="error"
            message={
              error === 'load' ? t('Impossible de charger les rapports.') : t('Impossible de modifier ce rapport.')
            }
            action={<Button onClick={refresh}>{t('Réessayer')}</Button>}
          />
        )}
        {loading && <Spin />}
        {!loading && !error && !items.length && <Empty description={t('Aucun rapport à afficher.')} />}
        {items.map(report => {
          const { schedule } = report;
          const label = report.active ? t('Mettre en pause') : report.lastRunAt ? t('Reprendre') : t('Activer');
          const changesShare = schedule && !report.active && !report.sharesCreated && report.shareRecipients.length > 0;
          const day =
            schedule?.frequency === 'weekly'
              ? weekdays[schedule.day - 1]
              : schedule?.frequency === 'monthly'
                ? t('Jour {{day}} du mois', { day: schedule.day })
                : '';
          return (
            <Card
              key={report.id}
              title={report.analysis.title}
              extra={
                <Tag>
                  {schedule
                    ? report.active
                      ? t('Actif')
                      : t('En pause')
                    : (statuses[report.lastStatus ?? ''] ?? t('En attente d’envoi'))}
                </Tag>
              }
            >
              <p>
                {[
                  schedule ? frequencies[schedule.frequency] : t('Envoi ponctuel'),
                  day,
                  schedule?.time,
                  schedule?.timeZone,
                  report.formats.map(format => format.toUpperCase()).join(', ')
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              {schedule && report.nextRunAt && (
                <p>
                  {t('Prochaine échéance')} · {reportDate(report.nextRunAt, locale, schedule.timeZone)}
                </p>
              )}
              {report.lastRunAt && (
                <p>
                  {t('Dernière exécution')} · {reportDate(report.lastRunAt, locale, schedule?.timeZone)}
                  {schedule && ` · ${statuses[report.lastStatus ?? ''] ?? '—'}`}
                </p>
              )}
              {schedule && (
                <Space wrap>
                  {changesShare ? (
                    <Popconfirm
                      title={t('Activer le rapport et partager l’analyse en lecture seule ?')}
                      description={report.shareRecipients.join(' · ')}
                      okText={t('Activer et partager')}
                      cancelText={t('Annuler')}
                      onConfirm={() => update(report, 'share')}
                    >
                      <Button disabled={loading || !!pending}>{label}</Button>
                    </Popconfirm>
                  ) : (
                    <Button disabled={loading || !!pending} onClick={() => void update(report)}>
                      {label}
                    </Button>
                  )}
                  <Popconfirm
                    title={t('Supprimer ce rapport programmé ?')}
                    okText={t('Supprimer')}
                    cancelText={t('Annuler')}
                    onConfirm={() => update(report, 'remove')}
                  >
                    <Button danger disabled={loading || !!pending}>
                      {t('Supprimer')}
                    </Button>
                  </Popconfirm>
                </Space>
              )}
              {!schedule && report.active && (
                <Button disabled={loading} onClick={refresh}>
                  {t('Actualiser')}
                </Button>
              )}
            </Card>
          );
        })}
        {next && !error && (
          <Button disabled={loading} onClick={() => setCursor(next)}>
            {t('Afficher plus')}
          </Button>
        )}
      </div>
    </Drawer>
  );
}
