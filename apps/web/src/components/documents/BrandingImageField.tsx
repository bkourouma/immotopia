import React, { useEffect, useState } from 'react';
import { App, Button, Space, Spin, Typography, Upload } from 'antd';
import { DeleteOutlined, UploadOutlined } from '@ant-design/icons';
import { validateBrandingImageFile } from '../../services/document-branding-service';
import { downscaleImageFile } from '../../utils/downscale-image';
import { t } from '../../i18n/t';

const { Text } = Typography;

interface BrandingImageFieldProps {
  label: string;
  /** `true` si une image existe côté serveur (`hasLogo`/`hasSignature`/`hasStamp`). */
  hasImage: boolean;
  /**
   * Charge le fichier en blob via `apiClient` (jamais un `<img src="…">`
   * direct : l'image est privée et authentifiée). Rappelée à chaque
   * changement de `hasImage` ou de `imageVersion`.
   */
  fetchImage: () => Promise<Blob>;
  onUpload: (file: File) => Promise<void>;
  onRemove: () => Promise<void>;
  /** Incrémenté par l'appelant après un envoi réussi pour forcer un rechargement. */
  imageVersion?: number;
  disabled?: boolean;
}

/**
 * Aperçu et envoi d'une image d'identité de document (logo, signature,
 * cachet). Toujours privée : l'aperçu passe par un blob révoqué au
 * démontage, jamais par une URL d'API directement dans `<img src>` (voir
 * `AGENTS.md` — fichiers uploadés jamais servis en statique).
 */
export const BrandingImageField: React.FC<BrandingImageFieldProps> = ({
  label,
  hasImage,
  fetchImage,
  onUpload,
  onRemove,
  imageVersion = 0,
  disabled = false
}) => {
  const { message } = App.useApp();
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [loadingImage, setLoadingImage] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    let url: string | null = null;
    let cancelled = false;

    if (!hasImage) {
      setObjectUrl(null);
      return;
    }

    setLoadingImage(true);
    fetchImage()
      .then(blob => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setObjectUrl(url);
      })
      .catch(() => {
        if (!cancelled) setObjectUrl(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingImage(false);
      });

    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasImage, imageVersion]);

  const handleSelect = async (file: File) => {
    // Réduit d'abord (sans effet si le fichier est déjà petit, dans un
    // format non pris en charge, ou si le navigateur ne sait pas faire) afin
    // que la limite de poids ci-dessous s'applique APRÈS réduction : une
    // grande image, une fois ramenée à 800 px, redevient acceptable.
    const candidate = await downscaleImageFile(file);
    const validationError = validateBrandingImageFile(candidate);
    if (validationError) {
      message.error(validationError);
      return Upload.LIST_IGNORE;
    }
    setUploading(true);
    try {
      await onUpload(candidate);
      message.success(t('Image mise à jour'));
    } catch (err: any) {
      message.error(err.response?.data?.message || err.response?.data?.error || t('Erreur lors du téléversement'));
    } finally {
      setUploading(false);
    }
    return Upload.LIST_IGNORE;
  };

  const handleRemove = async () => {
    setRemoving(true);
    try {
      await onRemove();
      message.success(t('Image retirée'));
    } catch (err: any) {
      message.error(err.response?.data?.message || err.response?.data?.error || t('Erreur lors du retrait'));
    } finally {
      setRemoving(false);
    }
  };

  const boxStyle: React.CSSProperties = {
    width: 88,
    height: 88,
    borderRadius: 8,
    border: '1px solid var(--border-default, #d9d9d9)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    background: '#fafafa',
    flexShrink: 0
  };

  return (
    <Space align="start" wrap>
      <div style={boxStyle}>
        {loadingImage ? (
          <Spin size="small" />
        ) : objectUrl ? (
          <img src={objectUrl} alt={label} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        ) : (
          <Text type="secondary" style={{ fontSize: 'var(--font-size-caption, 12px)', textAlign: 'center' }}>
            {t('Aucune image')}
          </Text>
        )}
      </div>
      <Space direction="vertical">
        <Text strong>{label}</Text>
        <Space>
          <Upload accept="image/png,image/jpeg" showUploadList={false} disabled={disabled} beforeUpload={handleSelect}>
            <Button icon={<UploadOutlined />} loading={uploading} disabled={disabled} size="small">
              {hasImage ? t('Remplacer') : t('Téléverser')}
            </Button>
          </Upload>
          {hasImage ? (
            <Button
              danger
              size="small"
              icon={<DeleteOutlined />}
              loading={removing}
              disabled={disabled}
              onClick={() => void handleRemove()}
            >
              {t('Retirer')}
            </Button>
          ) : null}
        </Space>
        <Text type="secondary" style={{ fontSize: 'var(--font-size-caption, 12px)' }}>
          {t('PNG ou JPEG, 2 Mo maximum, 3000 × 3000 px maximum')}
        </Text>
        <Text type="secondary" style={{ fontSize: 'var(--font-size-caption, 12px)' }}>
          {t('Les grandes images sont réduites automatiquement à 800 px.')}
        </Text>
      </Space>
    </Space>
  );
};

export default BrandingImageField;
