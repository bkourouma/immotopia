import React, { useEffect, useState } from 'react';
import { Input, Modal, Select } from 'antd';
import { t } from '../../i18n/t';
import { feedback } from '../../lib/feedback';
import { copilotService, type SavedAnalysisReference } from '../../services/copilot-service';

export function ShareAnalysisDialog({
  tenantId,
  reference,
  onClose
}: {
  tenantId: string;
  reference: Omit<SavedAnalysisReference, 'artifactId'> & { artifactId?: string };
  onClose(): void;
}) {
  const [recipients, setRecipients] = useState<Array<{ userId: string; displayName: string }>>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [sharing, setSharing] = useState(false);
  useEffect(() => {
    let active = true;
    void copilotService
      .listAnalysisRecipients(tenantId)
      .then(items => {
        if (active) setRecipients(items);
      })
      .catch(() => {
        if (active) feedback.error(t('Impossible de charger les destinataires.'));
      });
    return () => {
      active = false;
    };
  }, [tenantId]);

  async function share() {
    if (!selected.length || sharing) return;
    setSharing(true);
    try {
      await copilotService.shareAnalysis(tenantId, reference, selected, message.trim() || undefined);
      feedback.success(reference.artifactId ? t('Analyse partagée.') : t('Conversation partagée.'));
      onClose();
    } catch {
      feedback.error(t('Le partage exige des données recalculables et un destinataire habilité.'));
    } finally {
      setSharing(false);
    }
  }

  return (
    <Modal
      open
      title={reference.artifactId ? t('Partager une analyse') : t('Partager la conversation')}
      okText={t('Partager')}
      cancelText={t('Annuler')}
      onCancel={() => {
        if (!sharing) onClose();
      }}
      onOk={() => void share()}
      confirmLoading={sharing}
      okButtonProps={{ disabled: !selected.length }}
    >
      <p>
        {reference.artifactId
          ? t('Le collègue voit les résultats recalculés selon vos droits communs.')
          : t('Le partage affiche les résultats autorisés. Les messages et les pièces jointes restent privés.')}
      </p>
      <Select
        mode="multiple"
        maxCount={20}
        aria-label={t('Destinataires')}
        placeholder={t('Destinataires')}
        value={selected}
        onChange={setSelected}
        options={recipients.map(item => ({ value: item.userId, label: item.displayName }))}
        style={{ width: '100%' }}
      />
      <Input.TextArea
        aria-label={t('Message facultatif')}
        placeholder={t('Message facultatif')}
        value={message}
        onChange={event => setMessage(event.target.value)}
        maxLength={2000}
        rows={3}
        style={{ marginBlockStart: 12 }}
      />
    </Modal>
  );
}
