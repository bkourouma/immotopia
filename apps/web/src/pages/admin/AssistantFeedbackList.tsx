import { useEffect, useState } from 'react';
import { Button, Empty, Select, Space, Table } from 'antd';
import { SkeletonTable, StateBlock, StatusTag } from '../../components/primitives';
import { activeLocale } from '../../i18n/format';
import { t } from '../../i18n/t';
import { listAssistantFeedback, type AssistantFeedbackEntry } from '../../services/ai-settings-service';

const PAGE_SIZE = 25;
type Rating = 'all' | 'helpful' | 'unhelpful';

export function AssistantFeedbackList() {
  const [rating, setRating] = useState<Rating>('all');
  const [offset, setOffset] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const [result, setResult] = useState<Awaited<ReturnType<typeof listAssistantFeedback>>>();
  const [error, setError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setResult(undefined);
    setError(false);
    void listAssistantFeedback(offset, rating, controller.signal)
      .then(data => {
        if (!controller.signal.aborted) setResult(data);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      });
    return () => controller.abort();
  }, [rating, offset, refresh]);

  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      <Select<Rating>
        aria-label={t('Filtrer les avis')}
        value={rating}
        onChange={value => {
          setOffset(0);
          setRating(value);
        }}
        options={[
          { value: 'all', label: t('Tous les avis') },
          { value: 'helpful', label: t('Utile') },
          { value: 'unhelpful', label: t('Peu utile') }
        ]}
      />
      {error ? (
        <StateBlock
          variant="error"
          title={t('Les avis n’ont pas pu être chargés.')}
          onRetry={() => setRefresh(value => value + 1)}
        />
      ) : !result ? (
        <SkeletonTable rows={4} columns={4} />
      ) : (
        <>
          <Table<AssistantFeedbackEntry>
            rowKey="id"
            dataSource={result.items}
            pagination={false}
            size="small"
            scroll={{ x: 700 }}
            locale={{ emptyText: <Empty description={t('Aucun avis')} /> }}
            columns={[
              { title: t('Agence'), dataIndex: 'agency' },
              {
                title: t('Date'),
                dataIndex: 'updatedAt',
                render: value => new Date(value).toLocaleString(activeLocale())
              },
              {
                title: t('Avis'),
                dataIndex: 'helpful',
                render: value => (
                  <StatusTag
                    status={value ? 'SUCCESS' : 'PENDING'}
                    tone={value ? 'success' : 'warning'}
                    label={value ? t('Utile') : t('Peu utile')}
                  />
                )
              },
              {
                title: t('Extrait de la réponse'),
                dataIndex: 'excerpt',
                render: value => (
                  <span dir="auto" style={{ overflowWrap: 'anywhere' }}>
                    {value}
                  </span>
                )
              },
              {
                title: t('Commentaire'),
                dataIndex: 'comment',
                render: value => (
                  <span dir="auto" style={{ overflowWrap: 'anywhere' }}>
                    {value}
                  </span>
                )
              }
            ]}
          />
          <Space wrap>
            <Button style={{ minHeight: 44 }} disabled={!offset} onClick={() => setOffset(value => value - PAGE_SIZE)}>
              {t('Précédent')}
            </Button>
            <Button
              style={{ minHeight: 44 }}
              disabled={!result.hasNext}
              onClick={() => setOffset(value => value + PAGE_SIZE)}
            >
              {t('Suivant')}
            </Button>
          </Space>
        </>
      )}
    </Space>
  );
}
