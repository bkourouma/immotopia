import React from 'react';
import { Alert, Button, Card, Drawer, Space, Spin, Tabs, Typography } from 'antd';
import { HistoryOutlined, PlusOutlined } from '@ant-design/icons';
import { ScheduleFormFields } from '../../components/syndics/charge-schedules/ScheduleFormFields';
import { SchedulePreviewPanel } from '../../components/syndics/charge-schedules/SchedulePreviewPanel';
import { ScheduleRunsPanel } from '../../components/syndics/charge-schedules/ScheduleRunsPanel';
import { ScheduleTable } from '../../components/syndics/charge-schedules/ScheduleTable';
import { useChargeSchedules } from '../../components/syndics/charge-schedules/useChargeSchedules';
import { useSyndicRouteContext } from './useSyndicRouteContext';
import { t } from '../../i18n/t';

const { Paragraph, Title } = Typography;

/**
 * Onglet « Programmation » (lot S4, besoin 6) : appels de charges
 * automatiques. Contrat :
 * `packages/api/src/routes/syndic-charge-schedules-routes.ts`.
 */

export const SyndicChargeSchedules: React.FC = () => {
  const { tenantId: effectiveTenantId, syndicId } = useSyndicRouteContext();
  const {
    schedules,
    loading,
    error,
    submitting,
    drawerOpen,
    editing,
    drawerTab,
    form,
    preview,
    previewLoading,
    runs,
    runsLoading,
    busyId,
    approvedBudgetOptions,
    watchedAmountSource,
    watchedFrequency,
    openCreateDrawer,
    openEditDrawer,
    closeDrawer,
    handleDrawerTabChange,
    handleSubmit,
    handlePause,
    handleResume,
    handleDelete,
    handleExecute
  } = useChargeSchedules(effectiveTenantId, syndicId);

  return (
    <>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <Space direction="vertical" size={4}>
            <Title level={2} style={{ margin: 0 }}>
              {t('Programmation des appels de charges')}
            </Title>
            <Paragraph type="secondary" style={{ marginBottom: 0 }}>
              {t(
                'Émission automatique et récurrente des appels de charges, avec imputation des avances et notification des copropriétaires.'
              )}
            </Paragraph>
          </Space>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreateDrawer}>
            {t('Nouvelle programmation')}
          </Button>
        </div>

        {error ? <Alert type="error" message={error} showIcon /> : null}

        {loading ? (
          <div style={{ minHeight: 280, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Spin size="large" />
          </div>
        ) : (
          <Card>
            <ScheduleTable
              schedules={schedules}
              busyId={busyId}
              onOpen={openEditDrawer}
              onExecute={handleExecute}
              onPause={handlePause}
              onResume={handleResume}
              onDelete={handleDelete}
            />
          </Card>
        )}
      </Space>

      <Drawer
        title={editing ? t('Programmation : {{label}}', { label: editing.label }) : t('Nouvelle programmation')}
        open={drawerOpen}
        onClose={closeDrawer}
        width={560}
        destroyOnHidden
        extra={
          <Button type="primary" loading={submitting} onClick={() => void handleSubmit()}>
            {editing ? t('Enregistrer') : t('Créer')}
          </Button>
        }
      >
        <Tabs
          activeKey={drawerTab}
          onChange={handleDrawerTabChange}
          items={[
            {
              key: 'form',
              label: t('Paramètres'),
              children: (
                <ScheduleFormFields
                  form={form}
                  editing={editing}
                  approvedBudgetOptions={approvedBudgetOptions}
                  watchedAmountSource={watchedAmountSource}
                />
              )
            },
            {
              key: 'apercu',
              label: t('Aperçu'),
              disabled: !editing,
              children: (
                <SchedulePreviewPanel
                  preview={preview}
                  loading={previewLoading}
                  currency={editing?.currency}
                  frequency={watchedFrequency}
                />
              )
            },
            {
              key: 'historique',
              label: (
                <span>
                  <HistoryOutlined /> {t('Historique')}
                </span>
              ),
              disabled: !editing,
              children: <ScheduleRunsPanel runs={runs} loading={runsLoading} />
            }
          ]}
        />
      </Drawer>
    </>
  );
};
