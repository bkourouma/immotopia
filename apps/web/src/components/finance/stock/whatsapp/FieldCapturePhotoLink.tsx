import React from 'react';
import { Button, Space, Tooltip, Typography } from 'antd';
import { CameraOutlined } from '@ant-design/icons';
import type { CountCaptureLine } from '../../../../types/finance-stock-whatsapp-types';
import { t } from '../../../../i18n/t';

export interface FieldCapturePhotoLinkProps {
  /** Capture de la ligne (`GET …/counts/{countId}/captures`), absente pour une ligne saisie au web. */
  line: CountCaptureLine | null | undefined;
  /** Ouvre le visualiseur de preuve (`?capture=<captureId>`). */
  onOpen: (captureId: string) => void;
}

/**
 * Lien photo d'une ligne d'inventaire (ecrans §6) : bouton icône « Photo »
 * quand la photo existe, « Photo retirée » sinon, et « {{n}} photos » quand
 * plusieurs captures ont été additionnées sur la ligne.
 *
 * Aucune vignette : la lecture d'un fichier est tracée, la photo ne se charge
 * qu'à l'ouverture du visualiseur.
 */
export const FieldCapturePhotoLink: React.FC<FieldCapturePhotoLinkProps> = ({ line, onOpen }) => {
  if (!line) return null;
  const plusieurs = (line.capturesCount ?? 1) > 1;

  return (
    <Space size={4}>
      {line.hasPhoto ? (
        <Tooltip title={t('Voir la photo')}>
          <Button
            size="small"
            type="text"
            icon={<CameraOutlined />}
            aria-label={t('Photo')}
            onClick={() => onOpen(line.captureId)}
          />
        </Tooltip>
      ) : (
        <Typography.Text type="secondary">{t('Photo retirée')}</Typography.Text>
      )}
      {plusieurs && (
        <Typography.Text type="secondary">{t('{{n}} photos', { n: line.capturesCount ?? 0 })}</Typography.Text>
      )}
    </Space>
  );
};

export default FieldCapturePhotoLink;
