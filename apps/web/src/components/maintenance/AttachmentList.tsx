import React from 'react';
import { List, Button, Typography, Image } from 'antd';
import { DownloadOutlined, FileOutlined } from '@ant-design/icons';
import { Attachment } from '../../types/maintenance-types';
import apiClient from '../../utils/api-client';
import { API_ORIGIN } from '../../config/api';

const { Text } = Typography;

interface AttachmentListProps {
  attachments: Attachment[];
  tenantId: string;
}

const formatFileSize = (bytes: number | undefined | null): string => {
  if (!bytes || isNaN(bytes) || bytes < 0) {
    return 'Taille inconnue';
  }
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
};

const isImage = (mimeType: string | undefined): boolean => {
  return mimeType ? mimeType.startsWith('image/') : false;
};

export const AttachmentList: React.FC<AttachmentListProps> = ({ attachments, tenantId }) => {
  if (attachments.length === 0) {
    return <Text type="secondary">Aucune pièce jointe</Text>;
  }

  const handleDownload = async (attachment: Attachment) => {
    try {
      const response = await apiClient.get(
        `/tenants/${tenantId}/maintenance/files/${attachment.id}`,
        {
          responseType: 'blob'
        }
      );

      // Create blob and download
      const url = window.URL.createObjectURL(new Blob([response.data]));
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

  const getFileUrl = (attachment: Attachment): string => {
    const baseUrl = API_ORIGIN;
    return `${baseUrl}${attachment.fileUrl}`;
  };

  return (
    <List
      dataSource={attachments}
      renderItem={(attachment) => (
        <List.Item
          actions={[
            <Button
              type="link"
              icon={<DownloadOutlined />}
              onClick={() => handleDownload(attachment)}
            >
              Télécharger
            </Button>
          ]}
        >
          <List.Item.Meta
            avatar={
              isImage(attachment.mimeType) ? (
                <Image
                  src={getFileUrl(attachment)}
                  alt={attachment.fileName}
                  width={50}
                  height={50}
                  style={{ objectFit: 'cover', borderRadius: 4 }}
                  preview
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
