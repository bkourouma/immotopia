import React, { useState } from 'react';
import { App, Button, Space, Upload } from 'antd';
import { CameraOutlined, CloseCircleFilled } from '@ant-design/icons';
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
            <CloseCircleFilled
              role="button"
              aria-label={t('Supprimer la photo')}
              onClick={() => (deletingId ? undefined : handleDelete(photo.id))}
              style={{
                position: 'absolute',
                top: -6,
                insetInlineEnd: -6,
                color: '#f5222d',
                background: '#fff',
                borderRadius: '50%',
                cursor: deletingId ? 'not-allowed' : 'pointer'
              }}
            />
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
