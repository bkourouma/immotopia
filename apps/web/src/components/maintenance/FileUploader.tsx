import React, { useState } from 'react';
import { App, Upload, Button, List, Typography } from 'antd';
import { UploadOutlined, DeleteOutlined } from '@ant-design/icons';
import type { UploadFile, UploadProps, RcFile } from 'antd/es/upload/interface';
import { t } from '../../i18n/t';

const { Text } = Typography;

interface FileUploaderProps {
  onFilesChange?: (files: File[]) => void;
  maxFiles?: number;
  maxSize?: number; // in MB
  acceptedTypes?: string[];
}

export const FileUploader: React.FC<FileUploaderProps> = ({
  onFilesChange,
  maxFiles = 10,
  maxSize = 5,
  acceptedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf']
}) => {
  const { message } = App.useApp();

  const [fileList, setFileList] = useState<File[]>([]);

  const beforeUpload = (file: RcFile, fileListParam: RcFile[]) => {
    // Check for duplicate files (by name, size, and lastModified timestamp)
    const isDuplicate = fileList.some(
      f => f.name === file.name && f.size === file.size && f.lastModified === file.lastModified
    );

    if (isDuplicate) {
      message.warning(t('Le fichier "{{name}}" est déjà sélectionné', { name: file.name }));
      return Upload.LIST_IGNORE;
    }

    // Validate file type
    if (!acceptedTypes.includes(file.type)) {
      message.error(t('Type de fichier non autorisé: {{type}}', { type: file.type }));
      return Upload.LIST_IGNORE;
    }

    // Validate file size
    if (file.size > maxSize * 1024 * 1024) {
      message.error(t('Fichier trop volumineux. Taille maximale: {{maxSize}}MB', { maxSize: maxSize }));
      return Upload.LIST_IGNORE;
    }

    // Validate file count
    if (fileList.length >= maxFiles) {
      message.error(t('Nombre maximum de fichiers atteint ({{maxFiles}})', { maxFiles: maxFiles }));
      return Upload.LIST_IGNORE;
    }

    // Add file to list
    const newFiles = [...fileList, file as File];
    setFileList(newFiles);
    onFilesChange?.(newFiles);
    message.success(t('Fichier "{{name}}" ajouté', { name: file.name }));

    // Return false to prevent auto upload
    return false;
  };

  const handleRemove = (file: File) => {
    const newFiles = fileList.filter(f => f !== file);
    setFileList(newFiles);
    onFilesChange?.(newFiles);
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  };

  return (
    <div>
      <Upload
        accept={acceptedTypes.join(',')}
        beforeUpload={beforeUpload}
        showUploadList={false}
        multiple
        fileList={[]}
      >
        <Button icon={<UploadOutlined />}>{t('Sélectionner des fichiers')}</Button>
      </Upload>

      {fileList.length > 0 && (
        <List
          style={{ marginTop: 16 }}
          dataSource={fileList}
          renderItem={file => (
            <List.Item
              actions={[
                <Button key="remove" type="text" danger icon={<DeleteOutlined />} onClick={() => handleRemove(file)}>
                  {t('Supprimer')}
                </Button>
              ]}
            >
              <List.Item.Meta
                title={<span style={{ wordBreak: 'break-word' }}>{file.name}</span>}
                description={formatFileSize(file.size)}
              />
            </List.Item>
          )}
        />
      )}

      {fileList.length > 0 && (
        <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 8 }}>
          {fileList.length} fichier{fileList.length > 1 ? 's' : ''} {t('sélectionné')}
          {fileList.length > 1 ? 's' : ''}
        </Text>
      )}

      <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: fileList.length > 0 ? 4 : 8 }}>
        {t('Types autorisés: JPEG, PNG, WebP, PDF. Taille maximale:')} {maxSize}
        {t('MB. Maximum:')} {maxFiles} fichiers.
      </Text>
    </div>
  );
};
