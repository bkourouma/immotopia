import React, { useRef, useState } from 'react';
import { Button, Modal, Skeleton, Typography } from 'antd';
import { ZoomInOutlined } from '@ant-design/icons';
import { t } from '../../i18n/t';
import { useReceivingAccountQr } from './useReceivingAccountQr';

export interface ReceivingAccountQrProps {
  qrPath: string | null | undefined;
  /** Établissement, pour les noms accessibles. */
  institution: string;
  /** Faux : image simple, sans bouton d'agrandissement. */
  zoomable?: boolean;
  size?: number;
  /** Version de l'image (`updatedAt` côté gestion) : un changement la recharge. */
  version?: string | null;
}

/**
 * Image du QR de l'agence, chargée par la route authentifiée. Cliquable pour
 * l'agrandir : la fenêtre piège le focus et le rend au bouton à la fermeture.
 */
export function ReceivingAccountQr({
  qrPath,
  institution,
  zoomable = true,
  size = 160,
  version
}: ReceivingAccountQrProps): React.ReactElement | null {
  const { url, loading, failed } = useReceivingAccountQr(qrPath, true, version);
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  if (!qrPath) return null;
  if (loading) return <Skeleton.Image active style={{ width: size, height: size }} />;
  if (failed || !url) {
    return <Typography.Text type="secondary">{t('Le QR ne peut pas être affiché pour le moment.')}</Typography.Text>;
  }

  const alt = t('QR de paiement {{institution}}', { institution });
  const image = (width: number) => (
    <img
      src={url}
      alt={alt}
      width={width}
      height={width}
      style={{ display: 'block', maxWidth: '100%', height: 'auto', background: '#fff' }}
    />
  );

  if (!zoomable) return image(size);

  return (
    <>
      <Button
        ref={triggerRef}
        type="text"
        onClick={() => setOpen(true)}
        aria-label={t('Agrandir le QR {{institution}}', { institution })}
        style={{ height: 'auto', padding: 4, border: '1px solid var(--ant-color-border-secondary, #f0f0f0)' }}
      >
        {image(size)}
        <span style={{ display: 'block', fontSize: 12 }}>
          <ZoomInOutlined aria-hidden /> {t('Agrandir')}
        </span>
      </Button>
      <Modal
        open={open}
        title={t('QR de paiement {{institution}}', { institution })}
        footer={null}
        onCancel={() => setOpen(false)}
        afterClose={() => triggerRef.current?.focus()}
        centered
        width={420}
        destroyOnClose
      >
        <div style={{ display: 'flex', justifyContent: 'center' }}>{image(360)}</div>
      </Modal>
    </>
  );
}

export default ReceivingAccountQr;
