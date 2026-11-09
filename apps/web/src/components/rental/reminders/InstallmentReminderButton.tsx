import React, { useState } from 'react';
import { Button } from 'antd';
import { BellOutlined } from '@ant-design/icons';
import { InstallmentReminderModal, canOfferReminder } from './InstallmentReminderModal';
import { t } from '../../../i18n/t';

export interface InstallmentReminderButtonProps {
  tenantId: string;
  installmentId: string;
  periodLabel?: string;
  remaining: number;
  status?: string | null;
  leaseStatus?: string;
  /** Droit `RENTAL_PAYMENTS_ALLOCATE` ; l'API reste l'autorité. */
  canAllocate: boolean;
  onSent?: () => void;
}

/** Bouton « Relancer » ouvrant la fenêtre de relance manuelle. */
export const InstallmentReminderButton: React.FC<InstallmentReminderButtonProps> = ({
  tenantId,
  installmentId,
  periodLabel,
  remaining,
  status,
  leaseStatus,
  canAllocate,
  onSent
}) => {
  const [open, setOpen] = useState(false);
  if (!canAllocate || !canOfferReminder(remaining, status, leaseStatus)) return null;
  return (
    <>
      <Button icon={<BellOutlined />} onClick={() => setOpen(true)}>
        {t('Relancer')}
      </Button>
      {open && (
        <InstallmentReminderModal
          tenantId={tenantId}
          installmentId={installmentId}
          periodLabel={periodLabel}
          open
          onClose={() => setOpen(false)}
          onSent={onSent}
        />
      )}
    </>
  );
};
