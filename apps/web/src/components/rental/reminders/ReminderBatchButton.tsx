import React, { useState } from 'react';
import { Button } from 'antd';
import { BellOutlined } from '@ant-design/icons';
import { ReminderBatchModal } from './ReminderBatchModal';
import { t } from '../../../i18n/t';

export interface ReminderBatchButtonProps {
  tenantId: string;
  canAllocate: boolean;
  leaseId?: string;
  onDone?: () => void;
}

export const ReminderBatchButton: React.FC<ReminderBatchButtonProps> = ({ tenantId, canAllocate, leaseId, onDone }) => {
  const [open, setOpen] = useState(false);
  if (!canAllocate) return null;
  return (
    <>
      <Button icon={<BellOutlined />} onClick={() => setOpen(true)}>
        {t('Envoyer des relances en lot')}
      </Button>
      {open ? (
        <ReminderBatchModal tenantId={tenantId} leaseId={leaseId} open onClose={() => setOpen(false)} onDone={onDone} />
      ) : null}
    </>
  );
};
