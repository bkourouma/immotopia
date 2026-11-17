import React, { useCallback, useEffect, useState } from 'react';
import { Alert, App, Skeleton, Space, Typography } from 'antd';
import { getFormUnlocks, setFormUnlock, type FormUnlockEntry } from '../../../services/form-settings-service';
import { UnlockFieldsEditor } from '../../form-settings/UnlockFieldsEditor';
import { useConfirmAction } from '../../primitives';
import { t } from '../../../i18n/t';

const { Paragraph } = Typography;

/**
 * Onglet « Formulaires » de la fiche agence (super-admin) : champs « sous
 * condition » que l'agence peut régler une fois déverrouillés. Re-verrouiller
 * un champ demande confirmation : l'agence retrouve le comportement par défaut.
 */
export const TenantFormUnlocksTab: React.FC<{ tenantId: string }> = ({ tenantId }) => {
  const { message } = App.useApp();
  const confirmAction = useConfirmAction();
  const [entries, setEntries] = useState<FormUnlockEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setEntries(await getFormUnlocks(tenantId));
    } catch {
      setError(t('Impossible de charger les déverrouillages de formulaires.'));
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  const apply = async (formKey: string, fieldKey: string, unlocked: boolean, reason?: string) => {
    setSaving(true);
    try {
      await setFormUnlock(tenantId, { formKey, fieldKey, unlocked, ...(reason ? { reason } : {}) });
      message.success(unlocked ? t('Réglage autorisé pour cette agence.') : t('Réglage verrouillé pour cette agence.'));
      await load();
    } catch {
      message.error(t('Impossible de modifier le déverrouillage.'));
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = (formKey: string, fieldKey: string, unlocked: boolean, reason?: string) => {
    if (unlocked) {
      void apply(formKey, fieldKey, true, reason);
      return;
    }
    confirmAction({
      title: t('Verrouiller ce champ ?'),
      description: t(
        "L'agence ne pourra plus régler ce champ et reviendra au comportement par défaut. Son réglage est conservé et reprendra effet si vous déverrouillez à nouveau."
      ),
      okText: t('Verrouiller'),
      danger: true,
      onConfirm: () => apply(formKey, fieldKey, false)
    });
  };

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Paragraph type="secondary" style={{ marginBottom: 0 }}>
        {t(
          'Autorisez cette agence à régler des champs « facultatifs sous condition ». Sans autorisation, le formulaire garde son comportement actuel.'
        )}
      </Paragraph>
      {error && <Alert type="error" showIcon message={error} />}
      {loading && entries.length === 0 ? (
        <Skeleton active />
      ) : (
        <UnlockFieldsEditor entries={entries} onToggle={handleToggle} loading={saving} />
      )}
    </Space>
  );
};
