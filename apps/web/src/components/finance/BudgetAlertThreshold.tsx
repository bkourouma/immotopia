import React, { useContext, useEffect, useState } from 'react';
import { Alert, Button, Form, InputNumber, Modal } from 'antd';
import { useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import AuthContext from '../../context/AuthContext';
import { t } from '../../i18n/t';
import { feedback } from '../../lib/feedback';
import { entityKeyPrefix } from '../../lib/query-keys';
import { getSiteBudgetThreshold, updateSiteBudgetThreshold } from '../../services/finance-lot3-service';

const MAX_THRESHOLD_PERCENT = 2147483647;

function ThresholdDialog({
  tenantId,
  siteId,
  suggested,
  onClose
}: {
  tenantId: string;
  siteId: string;
  suggested: number | null;
  onClose(): void;
}) {
  const [site, setSite] = useState<Awaited<ReturnType<typeof getSiteBudgetThreshold>>>();
  const [value, setValue] = useState<number | null>(suggested);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const queryClient = useQueryClient();
  useEffect(() => {
    const controller = new AbortController();
    setSite(undefined);
    setError('');
    void getSiteBudgetThreshold(tenantId, siteId, controller.signal)
      .then(result => {
        if (controller.signal.aborted) return;
        setSite(result);
        setValue(suggested ?? result.budgetThresholdPercent);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(t('Impossible de charger le seuil budgétaire.'));
      });
    return () => controller.abort();
  }, [tenantId, siteId, suggested, reload]);

  const valid = value === null || (Number.isInteger(value) && value >= 1 && value <= MAX_THRESHOLD_PERCENT);
  async function save() {
    if (!site || site.status === 'CLOSED' || busy || !valid) return;
    setBusy(true);
    setError('');
    try {
      await updateSiteBudgetThreshold(tenantId, siteId, value, site.budgetThresholdPercent);
      void queryClient.invalidateQueries({ queryKey: entityKeyPrefix('sites-dashboard', tenantId) });
      feedback.success(t('Seuil budgétaire enregistré.'));
      onClose();
    } catch {
      setError(t('Impossible d’enregistrer le seuil. Rechargez le formulaire en cas de modification concurrente.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      title={t('Seuil d’alerte budgétaire')}
      okText={t('Enregistrer')}
      cancelText={t('Annuler')}
      onCancel={() => {
        if (!busy) onClose();
      }}
      onOk={() => void save()}
      confirmLoading={busy}
      okButtonProps={{ disabled: !site || site.status === 'CLOSED' || !valid }}
    >
      {site && <p>{site.name}</p>}
      {site && (
        <p>
          {t('Seuil actuel')} ·{' '}
          {site.budgetThresholdPercent === null ? t('Désactivé') : `${site.budgetThresholdPercent} %`}
        </p>
      )}
      <p>
        {t(
          'L’alerte se déclenche lorsque le montant engagé atteint ce pourcentage du budget révisé. Videz le champ pour désactiver le seuil.'
        )}
      </p>
      {error && (
        <Alert
          type="error"
          message={error}
          action={<Button onClick={() => setReload(value => value + 1)}>{t('Recharger')}</Button>}
        />
      )}
      {site?.status === 'CLOSED' && <Alert type="warning" message={t('Le chantier est clôturé.')} />}
      <Form.Item label={t('Seuil du budget révisé (%)')}>
        <InputNumber
          aria-label={t('Seuil du budget révisé (%)')}
          value={value}
          onChange={setValue}
          min={1}
          max={MAX_THRESHOLD_PERCENT}
          precision={0}
          disabled={!site || busy || site.status === 'CLOSED'}
        />
      </Form.Item>
    </Modal>
  );
}

export function BudgetAlertThreshold({ tenantId, siteId }: { tenantId: string; siteId: string }) {
  const auth = useContext(AuthContext);
  const [params, setParams] = useSearchParams();
  const [open, setOpen] = useState(false);
  const threshold = params.get('alerte-budget') ?? '';
  const suggested =
    /^\d{1,10}$/.test(threshold) && Number(threshold) >= 1 && Number(threshold) <= MAX_THRESHOLD_PERCENT
      ? Number(threshold)
      : null;
  if (!auth?.hasPermission?.(tenantId, 'FINANCE_SITES_MANAGE')) return null;
  function close() {
    setOpen(false);
    if (!params.has('alerte-budget')) return;
    setParams(
      previous => {
        const next = new URLSearchParams(previous);
        next.delete('alerte-budget');
        return next;
      },
      { replace: true }
    );
  }
  return (
    <>
      <Button onClick={() => setOpen(true)}>{t('Seuil d’alerte budgétaire')}</Button>
      {(open || suggested !== null) && (
        <ThresholdDialog tenantId={tenantId} siteId={siteId} suggested={suggested} onClose={close} />
      )}
    </>
  );
}
