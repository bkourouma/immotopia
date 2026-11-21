import React, { useState } from 'react';
import { App, Button, Space, Upload } from 'antd';
import { CameraOutlined, CloseCircleFilled } from '@ant-design/icons';
import { ConfirmAction } from '../../primitives';
import { InspectionPhoto } from '../../../services/lease-inspections-service';
import { InspectionPhotoImage } from './InspectionPhotoImage';
import { t } from '../../../i18n/t';

interface ItemPhotosProps {
  tenantId: string;
  leaseId: string;
  inspectionId: string;
  photos: InspectionPhoto[];
  readOnly: boolean;
  onUpload: (file: File) => Promise<void>;
  onDelete: (photoId: string) => Promise<void>;
}

/**
 * Photos d'un élément (ou d'une pièce) : bouton d'ajout et vignettes.
 *
 * `capture="environment"` ouvre directement l'appareil photo arrière sur
 * mobile plutôt que la galerie : pendant une visite, la photo à prendre est
 * celle du mur en face, pas une déjà existante.
 */
export const ItemPhotos: React.FC<ItemPhotosProps> = ({
  tenantId,
  leaseId,
  inspectionId,
  photos,
  readOnly,
  onUpload,
  onDelete
}) => {
  const { message } = App.useApp();
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      await onUpload(file);
    } catch (error: any) {
      message.error(error?.response?.data?.message || t("Échec de l'envoi de la photo"));
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (photoId: string) => {
    setDeletingId(photoId);
    try {
      await onDelete(photoId);
    } catch (error: any) {
      message.error(error?.response?.data?.message || t('Échec de la suppression de la photo'));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <Space wrap size={8} style={{ marginTop: 4 }}>
      {photos.map(photo => (
        <div key={photo.id} style={{ position: 'relative' }}>
          <InspectionPhotoImage
            tenantId={tenantId}
            leaseId={leaseId}
            inspectionId={inspectionId}
            photoId={photo.id}
            alt={photo.caption || photo.fileName}
          />
          {!readOnly && (
            <ConfirmAction
              title={t('Supprimer cette photo ?')}
              description={t('La photo sera retirée de l’état des lieux.')}
              okText={t('Supprimer')}
              danger
              disabled={deletingId !== null}
              onConfirm={() => handleDelete(photo.id)}
            >
              {/* Zone tactile de 44 px autour d'une icône de 20 px. */}
              <button
                type="button"
                aria-label={t('Supprimer la photo')}
                disabled={deletingId !== null}
                style={{
                  position: 'absolute',
                  top: -12,
                  insetInlineEnd: -12,
                  width: 44,
                  height: 44,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: 0,
                  background: 'transparent',
                  padding: 0,
                  cursor: deletingId ? 'not-allowed' : 'pointer'
                }}
              >
                <CloseCircleFilled
                  style={{ fontSize: 20, color: '#f5222d', background: '#fff', borderRadius: '50%' }}
                />
              </button>
            </ConfirmAction>
          )}
        </div>
      ))}

      {!readOnly && (
        <Upload
          accept="image/*"
          capture="environment"
          showUploadList={false}
          disabled={uploading}
          beforeUpload={file => {
            void handleUpload(file as File);
            return false;
          }}
        >
          <Button icon={<CameraOutlined />} loading={uploading} style={{ minHeight: 44 }}>
            {t('Photo')}
          </Button>
        </Upload>
      )}
    </Space>
  );
};

export default ItemPhotos;
