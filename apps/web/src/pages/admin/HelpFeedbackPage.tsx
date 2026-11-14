import React, { useEffect, useState } from 'react';
import { Segmented, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useParams } from 'react-router-dom';
import { PageHeader, StateBlock, Table } from '../../components/primitives';
import {
  fetchPlatformHelpFeedback,
  fetchTenantHelpFeedback,
  type HelpFeedbackItem,
  type HelpFeedbackQuestion
} from '../../services/help-feedback-admin-service';
import { t } from '../../i18n/t';
import { safeFormatDate } from '../../utils/date-utils';

const { Text } = Typography;

type Scope = 'platform' | 'agency';

const PERIODS = [7, 30, 90] as const;

function localeLabel(locale: HelpFeedbackQuestion['locale']): string {
  if (locale === 'fr') return t('Français');
  if (locale === 'en') return t('Anglais');
  return t('Arabe');
}

function QuestionsList({ item, showTenant }: { item: HelpFeedbackItem; showTenant: boolean }) {
  if (item.questions.length === 0) return <Text type="secondary">{t('Aucune question.')}</Text>;
  return (
    <ul style={{ margin: 0, paddingInlineStart: 16 }}>
      {item.questions.map((q, index) => (
        <li key={`${q.createdAt}-${index}`} style={{ marginBlockEnd: 8 }}>
          <div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{q.text}</div>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {safeFormatDate(q.createdAt)} · {localeLabel(q.locale)}
            {showTenant && q.tenantName ? ` · ${t('Agence')} : ${q.tenantName}` : ''}
          </Text>
        </li>
      ))}
    </ul>
  );
}

export default function HelpFeedbackPage({ scope = 'platform' }: { scope?: Scope }) {
  const { tenantId } = useParams<{ tenantId: string }>();
  const [days, setDays] = useState<number>(30);
  const [items, setItems] = useState<HelpFeedbackItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const isPlatform = scope === 'platform';

  useEffect(() => {
    if (!isPlatform && !tenantId) return;
    let cancelled = false;
    setLoading(true);
    setError(false);
    const request = isPlatform ? fetchPlatformHelpFeedback(days) : fetchTenantHelpFeedback(tenantId as string, days);
    request
      .then(summary => {
        if (cancelled) return;
        setItems(summary.items);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError(true);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isPlatform, tenantId, days, reloadKey]);

  const columns: ColumnsType<HelpFeedbackItem> = [
    { title: t('Fiche'), dataIndex: 'helpId', key: 'helpId' },
    { title: t('Utile'), dataIndex: 'useful', key: 'useful', align: 'end' },
    { title: t('Pas utile'), dataIndex: 'notUseful', key: 'notUseful', align: 'end' },
    { title: t('Questions'), dataIndex: 'questionsCount', key: 'questionsCount', align: 'end' },
    {
      title: t('Dernier avis'),
      dataIndex: 'lastAt',
      key: 'lastAt',
      render: (value: string) => safeFormatDate(value)
    }
  ];

  let content: React.ReactNode;
  if (loading) {
    content = <StateBlock variant="loading" />;
  } else if (error) {
    content = (
      <StateBlock
        variant="error"
        description={t("Les avis n'ont pas pu être chargés.")}
        actions={[{ label: t('Réessayer'), primary: true, onClick: () => setReloadKey(k => k + 1) }]}
      />
    );
  } else if (items.length === 0) {
    content = <StateBlock variant="empty" title={t('Aucun avis sur cette période.')} description=" " />;
  } else {
    content = (
      <Table<HelpFeedbackItem>
        rowKey="helpId"
        columns={columns}
        dataSource={items}
        pagination={false}
        exportable={false}
        scroll={{ x: 'max-content' }}
        expandable={{
          expandRowByClick: true,
          rowExpandable: item => item.questions.length > 0,
          expandedRowRender: item => <QuestionsList item={item} showTenant={isPlatform} />
        }}
      />
    );
  }

  return (
    <div>
      <PageHeader
        title={t("Avis sur l'aide")}
        subtitle={
          isPlatform
            ? t("Retours sur les fiches d'aide des écrans, toutes agences confondues.")
            : t("Retours sur les fiches d'aide des écrans, pour votre agence.")
        }
        extra={
          <Segmented<number>
            aria-label={t('Période')}
            value={days}
            onChange={setDays}
            options={PERIODS.map(p => ({ value: p, label: t('{{count}} jours', { count: p }) }))}
          />
        }
      />
      {content}
    </div>
  );
}
