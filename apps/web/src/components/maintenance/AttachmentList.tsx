import React, { useEffect, useState } from 'react';
import { List, Button, Typography, Image, Skeleton } from 'antd';
import { DownloadOutlined, FileOutlined } from '@ant-design/icons';
import { Attachment } from '../../types/maintenance-types';
import {
  fetchMaintenanceAttachment,
  fetchMaintenanceAttachmentBlob,
  maintenanceAttachmentPath,
  type MaintenanceAttachmentSource
} from '../../services/maintenance-attachment-files';
import { t } from '../../i18n/t';

const { Text } = Typography;

/** Ce dont la liste a besoin d'une pièce jointe — ni son `fileUrl`, ni son ticket. */
export type AttachmentListItem = Pick<Attachment, 'id' | 'fileName' | 'mimeType'> & {
  fileSize?: number | null;
};

interface AttachmentListProps {
  attachments: AttachmentListItem[];
  /**
   * La route qui sert les fichiers de cet écran : gestion de l'agence, portail
   * locataire ou portail propriétaire. Aucune pièce n'est plus lue en statique
   * (`/uploads/maintenance` répond 404).
   */
  source: MaintenanceAttachmentSource;
}

/** Pièce jointe telle que la renvoient les portails (colonnes Prisma brutes). */
export interface PortalAttachment {
  id: string;
  file_name: string;
  mime_type?: string | null;
  file_size?: number | null;
}

export const fromPortalAttachment = (attachment: PortalAttachment): AttachmentListItem => ({
  id: attachment.id,
  fileName: attachment.file_name,
  mimeType: attachment.mime_type ?? undefined,
  fileSize: attachment.file_size ?? null
});

const formatFileSize = (bytes: number | undefined | null): string => {
  if (!bytes || isNaN(bytes) || bytes < 0) {
    return t('Taille inconnue');
  }
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
};

const IMAGE_EXTENSION = /\.(jpe?g|png|gif|webp)$/i;

/** Le type MIME d'abord ; à défaut (anciens enregistrements), l'extension. */
export const isImageAttachment = (attachment: Pick<AttachmentListItem, 'fileName' | 'mimeType'>): boolean =>
  attachment.mimeType ? attachment.mimeType.startsWith('image/') : IMAGE_EXTENSION.test(attachment.fileName);

/**
 * Vignette d'une image : le fichier arrive en blob par le client API (qui
 * porte la session), s'affiche par une URL `blob:` et cette URL est libérée
 * au démontage — ou quand la pièce change.
 */
const AttachmentThumbnail: React.FC<{ path: string; alt: string }> = ({ path, alt }) => {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let objectUrl: string | null = null;
    let active = true;
    setSrc(null);
    setFailed(false);

    fetchMaintenanceAttachmentBlob(path, controller.signal)
      .then(blob => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      })
      .catch(() => {
        if (active) setFailed(true);
      });

    return () => {
      active = false;
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path]);

  if (failed) {
    return <FileOutlined style={{ fontSize: 24 }} />;
  }
  if (!src) {
    return <Skeleton.Image active style={{ width: 50, height: 50 }} />;
  }
  return (
    <Image src={src} alt={alt} width={50} height={50} style={{ objectFit: 'cover', borderRadius: 4 }} preview />
  );
};

export const AttachmentList: React.FC<AttachmentListProps> = ({ attachments, source }) => {
  if (attachments.length === 0) {
    return <Text type="secondary">{t('Aucune pièce jointe')}</Text>;
  }

  const handleDownload = async (attachment: AttachmentListItem) => {
    try {
      const blob = await fetchMaintenanceAttachment(source, attachment.id);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', attachment.fileName);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading attachment:', error);
    }
  };

  return (
    <List
      dataSource={attachments}
      renderItem={attachment => (
        <List.Item
          actions={[
            <Button type="link" icon={<DownloadOutlined />} onClick={() => handleDownload(attachment)}>
              {t('Télécharger')}
            </Button>
          ]}
        >
          <List.Item.Meta
            avatar={
              isImageAttachment(attachment) ? (
                <AttachmentThumbnail
                  path={maintenanceAttachmentPath(source, attachment.id)}
                  alt={attachment.fileName}
                />
              ) : (
                <FileOutlined style={{ fontSize: 24 }} />
              )
            }
            title={attachment.fileName}
            description={formatFileSize(attachment.fileSize)}
          />
        </List.Item>
      )}
    />
  );
};
