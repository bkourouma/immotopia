import React, { useEffect, useState } from 'react';
import { Alert, App, InputNumber, Modal, Space, Typography } from 'antd';
import { scheduleItemRemoval, type AccountItem } from '../../services/subscription-account-service';
import { apiErrorMessage, formatLongDate } from './subscription-account-labels';
import { t } from '../../i18n/t';

const { Text, Paragraph } = Typography;

interface Props {
  tenantId: string;
  item: AccountItem | null;
  /** Échéance de la période en cours : date à laquelle le retrait prend effet. */
  dueDate: string | null;
  onClose: () => void;
  onDone: () => Promise<void> | void;
}

/**
 * Confirmation d'un retrait à l'échéance. Dit la date d'effet et l'absence de
 * remboursement (AL-D3) ; pour une extension de plusieurs unités, la quantité
 * à retirer se choisit (retrait partiel).
 */
export const RemoveItemModal: React.FC<Props> = ({ tenantId, item, dueDate, onClose, onDone }) => {
  const { message } = App.useApp();
  const [quantity, setQuantity] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const itemId = item?.id;
  useEffect(() => {
    setQuantity(item?.quantity ?? 1);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId]);

  const confirm = async () => {
    if (!item) return;
    setSubmitting(true);
    setError(null);
    try {
      await scheduleItemRemoval(
        tenantId,
        item.id,
        item.kind === 'EXTENSION' && item.quantity > 1 ? quantity : undefined
      );
      message.success(t('Retrait programmé pour le {{date}}', { date: formatLongDate(dueDate) }));
      await onDone();
      onClose();
    } catch (err) {
      setError(apiErrorMessage(err, t('Erreur lors de la programmation du retrait')));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={Boolean(item)}
      title={item ? t('Retirer {{name}} ?', { name: item.name }) : ''}
      onCancel={onClose}
      onOk={confirm}
      okText={t('Retirer à l’échéance')}
      cancelText={t('Annuler')}
      okButtonProps={{ danger: true, loading: submitting }}
      cancelButtonProps={{ disabled: submitting }}
      maskClosable={false}
      destroyOnClose
      style={{ maxWidth: 'calc(100vw - 32px)' }}
    >
      {item && (
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Paragraph style={{ margin: 0 }}>
            {dueDate
              ? t('Le retrait prendra effet à l’échéance, le {{date}}. Jusque-là, l’élément reste actif.', {
                  date: formatLongDate(dueDate)
                })
              : t('Le retrait prendra effet à la prochaine échéance. Jusque-là, l’élément reste actif.')}
          </Paragraph>
          <Alert
            type="warning"
            showIcon
            message={t('Sans remboursement : la période déjà facturée reste due.')}
            description={t('Vous pourrez annuler ce retrait tant que l’échéance n’est pas passée.')}
          />
          {item.kind === 'EXTENSION' && item.quantity > 1 && (
            <div>
              <label htmlFor="remove-item-quantity">
                <Text strong>{t('Quantité à retirer')}</Text>
              </label>
              <div>
                <InputNumber<number>
                  id="remove-item-quantity"
                  min={1}
                  max={item.quantity}
                  precision={0}
                  value={quantity}
                  onChange={value => setQuantity(value ?? 1)}
                  style={{ width: 160 }}
                />
                <Text type="secondary" style={{ marginInlineStart: 'var(--space-2)' }}>
                  {t('sur {{total}}', { total: item.quantity })}
                </Text>
              </div>
            </div>
          )}
          {error && <Alert type="error" showIcon message={error} />}
        </Space>
      )}
    </Modal>
  );
};
