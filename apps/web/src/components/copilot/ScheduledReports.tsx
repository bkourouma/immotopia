import React, { useEffect, useState } from 'react';
import { Alert, Button, Card, Drawer, Empty, Popconfirm, Space, Spin, Tag } from 'antd';
import { activeLocale } from '../../i18n/format';
import { t } from '../../i18n/t';
import { copilotService, type ScheduledReport } from '../../services/copilot-service';

function reportDate(value: string, timeZone: string) {
  return new Intl.DateTimeFormat(activeLocale(), { dateStyle: 'medium', timeStyle: 'short', timeZone }).format(
    new Date(value)
  );
}

export function ScheduledReports({ tenantId, onClose }: { tenantId: string; onClose(): void }) {
  const [items, setItems] = useState<ScheduledReport[]>([]);
  const [cursor, setCursor] = useState<string>();
  const [next, setNext] = useState<string>();
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<string>();
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    void copilotService
      .listScheduledReports(tenantId, cursor, controller.signal)
      .then(page => {
        if (controller.signal.aborted) return;
        setItems(previous => (cursor ? [...previous, ...page.items] : page.items));
        setNext(page.nextCursor);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(t('Impossible de charger les rapports.'));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [tenantId, cursor, revision]);

  async function update(report: ScheduledReport, remove = false) {
    setPending(report.id);
    setError('');
    try {
      if (remove) await copilotService.deleteScheduledReport(tenantId, report.id);
      else await copilotService.setScheduledReportActive(tenantId, report.id, !report.active);
      setCursor(undefined);
      setRevision(value => value + 1);
    } catch {
      setError(t('Impossible de modifier ce rapport.'));
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
    <Drawer open size="min(780px, 100vw)" title={t('Rapports programmés')} onClose={onClose}>
      <div style={{ display: 'grid', gap: 12 }} aria-busy={loading}>
        {error && (
          <Alert
            type="error"
            message={error}
            action={
              <Button
                onClick={() => {
                  setCursor(undefined);
                  setRevision(value => value + 1);
                }}
              >
                {t('Réessayer')}
              </Button>
            }
          />
        )}
        {loading && <Spin />}
        {!loading && !error && !items.length && <Empty description={t('Aucun rapport programmé.')} />}
        {items.map(report => {
          const { schedule } = report;
          const day =
            schedule.frequency === 'weekly'
              ? weekdays[schedule.day - 1]
              : schedule.frequency === 'monthly'
                ? t('Jour {{day}} du mois', { day: schedule.day })
                : '';
          return (
            <Card
              key={report.id}
              title={report.analysis.title}
              extra={<Tag>{report.active ? t('Actif') : t('En pause')}</Tag>}
            >
              <p>
                {[
                  frequencies[schedule.frequency],
                  day,
                  schedule.time,
                  schedule.timeZone,
                  report.formats.map(format => format.toUpperCase()).join(', ')
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              {report.nextRunAt && (
                <p>
                  {t('Prochaine échéance')} · {reportDate(report.nextRunAt, schedule.timeZone)}
                </p>
              )}
              {report.lastRunAt && (
                <p>
                  {t('Dernière exécution')} · {reportDate(report.lastRunAt, schedule.timeZone)} ·{' '}
                  {statuses[report.lastStatus ?? ''] ?? '—'}
                </p>
              )}
              <Space wrap>
                <Button disabled={loading || !!pending} onClick={() => void update(report)}>
                  {report.active ? t('Mettre en pause') : report.lastRunAt ? t('Reprendre') : t('Activer')}
                </Button>
                <Popconfirm
                  title={t('Supprimer ce rapport programmé ?')}
                  okText={t('Supprimer')}
                  cancelText={t('Annuler')}
                  onConfirm={() => update(report, true)}
                >
                  <Button danger disabled={loading || !!pending}>
                    {t('Supprimer')}
                  </Button>
                </Popconfirm>
              </Space>
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
