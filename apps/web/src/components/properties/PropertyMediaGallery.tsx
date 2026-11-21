import React, { useState, useEffect, useCallback } from 'react';
import { App, Button, Image } from 'antd';
import {
  StarOutlined,
  StarFilled,
  DeleteOutlined,
  DragOutlined,
  PictureOutlined,
  PlayCircleOutlined,
  LeftOutlined,
  RightOutlined
} from '@ant-design/icons';
import { PropertyMedia, PropertyMediaType } from '../../types/property-types';
import apiClient from '../../utils/api-client';
import { API_URL } from '../../config/api';
import { t } from '../../i18n/t';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { ConfirmAction } from '../primitives/ConfirmAction';
import { StateBlock } from '../primitives/StateBlock';
import { apiErrorText } from './property-api-errors';

interface PropertyMediaGalleryProps {
  propertyId: string;
  tenantId: string;
  onUpdate?: () => void;
  refreshTrigger?: number;
  mediaType?: PropertyMediaType; // Filter to show only specific media type
}

export const PropertyMediaGallery: React.FC<PropertyMediaGalleryProps> = ({
  propertyId,
  tenantId,
  onUpdate,
  refreshTrigger,
  mediaType: filterMediaType
}) => {
  const { message } = App.useApp();
  const { isDesktop } = useBreakpoint();

  const [media, setMedia] = useState<PropertyMedia[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [reordering, setReordering] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  const loadMedia = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError(false);
      const response = await apiClient.get<{ success: boolean; data: PropertyMedia[] }>(
        `/tenants/${tenantId}/properties/${propertyId}/media`
      );
      // Filter by media type if specified
      const allMedia = response.data.data;
      const filteredMedia = filterMediaType ? allMedia.filter(m => m.mediaType === filterMediaType) : allMedia;
      setMedia(filteredMedia);
    } catch (error) {
      console.error('Error loading media:', error);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [tenantId, propertyId, filterMediaType]);

  useEffect(() => {
    void loadMedia();
  }, [loadMedia, refreshTrigger]);

  const nomDuMedia = (item: PropertyMedia) =>
    item.fileName || (item.mediaType === PropertyMediaType.VIDEO ? t('cette vidéo') : t('cette photo'));

  const handleSetPrimary = async (item: PropertyMedia) => {
    try {
      await apiClient.post(`/tenants/${tenantId}/properties/${propertyId}/media/primary`, { mediaId: item.id });
      await loadMedia();
      if (onUpdate) onUpdate();
      message.success(t('Photo principale mise à jour'));
    } catch (error: unknown) {
      message.error(apiErrorText(error, t('Erreur lors de la mise à jour')));
    }
  };

  const handleDelete = async (item: PropertyMedia) => {
    try {
      await apiClient.delete(`/tenants/${tenantId}/properties/${propertyId}/media/${item.id}`);
      await loadMedia();
      if (onUpdate) onUpdate();
      message.success(t('Média supprimé avec succès'));
    } catch (error: unknown) {
      message.error(apiErrorText(error, t('Erreur lors de la suppression')));
    }
  };

  /** Enregistre l'ordre affiché ; en cas d'échec, l'ordre du serveur est rechargé. */
  const persistOrder = async (ordered: PropertyMedia[]) => {
    try {
      setReordering(true);
      const mediaOrders = ordered.map((item, index) => ({
        mediaId: item.id,
        displayOrder: index
      }));

      await apiClient.post(`/tenants/${tenantId}/properties/${propertyId}/media/reorder`, { mediaOrders });

      if (onUpdate) onUpdate();
      message.success(t('Ordre des médias mis à jour'));
    } catch (error: unknown) {
      message.error(apiErrorText(error, t('Erreur lors du réordonnancement')));
      await loadMedia(); // Reload on error
    } finally {
      setReordering(false);
    }
  };

  /** Déplacement au clavier ou au doigt : un cran avant (-1) ou après (+1). */
  const handleMove = async (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= media.length || reordering) return;
    const ordered = [...media];
    const [moved] = ordered.splice(index, 1);
    ordered.splice(target, 0, moved);
    setMedia(ordered);
    await persistOrder(ordered);
  };

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    const newMedia = [...media];
    const draggedItem = newMedia[draggedIndex];
    newMedia.splice(draggedIndex, 1);
    newMedia.splice(index, 0, draggedItem);
    setMedia(newMedia);
    setDraggedIndex(index);
  };

  const handleDragEnd = async () => {
    if (draggedIndex === null) return;
    setDraggedIndex(null);
    await persistOrder(media);
  };

  if (loading) {
    return (
      <div
        aria-busy="true"
        aria-label={t('Chargement des médias')}
        style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 16 }}
      >
        {[0, 1, 2].map(i => (
          <div
            key={i}
            style={{
              aspectRatio: '1',
              borderRadius: 8,
              background: 'var(--border-subtle)',
              opacity: 0.6
            }}
          />
        ))}
      </div>
    );
  }

  if (loadError) {
    return (
      <StateBlock
        variant="error"
        title={t('Impossible de charger les médias')}
        description={t('Vos fichiers sont conservés. Vérifiez votre connexion, puis réessayez.')}
        onRetry={() => void loadMedia()}
      />
    );
  }

  if (media.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-tertiary)' }}>
        <PictureOutlined style={{ fontSize: 48, marginBottom: 16 }} aria-hidden="true" />
        <p>{t('Aucun média pour cette propriété')}</p>
      </div>
    );
  }

  const getMediaUrl = (item: PropertyMedia) => {
    if (item.fileUrl) {
      // If already a full URL, return as is
      if (item.fileUrl.startsWith('http')) {
        return item.fileUrl;
      }
      // Otherwise, construct full URL using API base URL
      // Remove /api from base URL for static file serving
      const apiBaseUrl = API_URL;
      const baseUrl = apiBaseUrl.replace('/api', '');
      return `${baseUrl}${item.fileUrl}`;
    }
    return '';
  };

  // Cibles tactiles de 44 px sous 992 px.
  const cible: React.CSSProperties = isDesktop ? {} : { minWidth: 44, minHeight: 44 };

  return (
    <div>
      {media.length > 1 && (
        <p style={{ margin: '0 0 12px', fontSize: 'var(--font-size-small)', color: 'var(--text-secondary)' }}>
          {t("Glissez une photo ou utilisez les flèches pour changer l'ordre. L'étoile choisit la photo principale.")}
        </p>
      )}
      <ul
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
          gap: 16,
          listStyle: 'none',
          margin: 0,
          padding: 0
        }}
      >
        {media.map((item, index) => {
          const nom = nomDuMedia(item);
          return (
            <li
              key={item.id}
              style={{
                position: 'relative',
                border: item.isPrimary ? '2px solid var(--color-primary)' : '1px solid var(--border-subtle)',
                borderRadius: 8,
                overflow: 'hidden',
                opacity: reordering ? 0.5 : 1,
                background: 'var(--surface-card)'
              }}
              draggable
              onDragStart={() => handleDragStart(index)}
              onDragOver={e => handleDragOver(e, index)}
              onDragEnd={handleDragEnd}
            >
              <div
                style={{
                  aspectRatio: '1',
                  backgroundColor: 'var(--surface-sunken, #f0f0f0)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  position: 'relative'
                }}
              >
                {item.mediaType === PropertyMediaType.PHOTO ? (
                  <Image
                    src={getMediaUrl(item)}
                    alt={nom}
                    preview={{ cover: t('Aperçu') }}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    wrapperStyle={{ width: '100%', height: '100%' }}
                  />
                ) : item.mediaType === PropertyMediaType.VIDEO ? (
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 8,
                      color: 'var(--text-tertiary)'
                    }}
                  >
                    <PlayCircleOutlined style={{ fontSize: 48 }} aria-hidden="true" />
                    <span style={{ fontSize: 12 }}>{t('Vidéo')}</span>
                  </div>
                ) : (
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 8,
                      color: 'var(--text-tertiary)'
                    }}
                  >
                    <PictureOutlined style={{ fontSize: 48 }} aria-hidden="true" />
                    <span style={{ fontSize: 12 }}>{t('Tour 360°')}</span>
                  </div>
                )}

                {/* Badge « Principal » */}
                {item.isPrimary && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 8,
                      insetInlineStart: 8,
                      backgroundColor: 'var(--color-primary)',
                      color: '#fff',
                      fontSize: 12,
                      padding: '4px 8px',
                      borderRadius: 4,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      pointerEvents: 'none'
                    }}
                  >
                    <StarFilled style={{ fontSize: 12 }} aria-hidden="true" />
                    {t('Principal')}
                  </div>
                )}
              </div>

              {/* Barre d'actions toujours visible : le survol n'existe pas au doigt. */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 4,
                  padding: 6
                }}
              >
                <span style={{ display: 'inline-flex', gap: 2 }}>
                  <Button
                    type="text"
                    icon={isRtl() ? <RightOutlined /> : <LeftOutlined />}
                    disabled={index === 0 || reordering}
                    onClick={() => void handleMove(index, -1)}
                    aria-label={t('Placer {{value}} avant', { value: nom })}
                    title={t('Placer avant')}
                    style={cible}
                  />
                  <Button
                    type="text"
                    icon={isRtl() ? <LeftOutlined /> : <RightOutlined />}
                    disabled={index === media.length - 1 || reordering}
                    onClick={() => void handleMove(index, 1)}
                    aria-label={t('Placer {{value}} après', { value: nom })}
                    title={t('Placer après')}
                    style={cible}
                  />
                </span>
                <span style={{ display: 'inline-flex', gap: 2, alignItems: 'center' }}>
                  <DragOutlined
                    aria-hidden="true"
                    style={{ color: 'var(--text-tertiary)', cursor: 'grab', padding: '0 4px' }}
                  />
                  <Button
                    type="text"
                    icon={item.isPrimary ? <StarFilled style={{ color: 'var(--color-primary)' }} /> : <StarOutlined />}
                    aria-pressed={Boolean(item.isPrimary)}
                    disabled={Boolean(item.isPrimary)}
                    onClick={() => void handleSetPrimary(item)}
                    aria-label={
                      item.isPrimary
                        ? t('{{value}} est la photo principale', { value: nom })
                        : t('Définir {{value}} comme photo principale', { value: nom })
                    }
                    title={t('Photo principale')}
                    style={cible}
                  />
                  <ConfirmAction
                    danger
                    title={t('Supprimer « {{value}} » ?', { value: nom })}
                    description={t('Ce fichier sera retiré de la fiche du bien. Cette action est définitive.')}
                    okText={t('Supprimer')}
                    cancelText={t('Annuler')}
                    onConfirm={() => handleDelete(item)}
                  >
                    <Button
                      type="text"
                      danger
                      icon={<DeleteOutlined />}
                      aria-label={t('Supprimer {{value}}', { value: nom })}
                      title={t('Supprimer')}
                      style={cible}
                    />
                  </ConfirmAction>
                </span>
              </div>
              <div
                title={nom}
                style={{
                  padding: '0 8px 8px',
                  fontSize: 12,
                  color: 'var(--text-secondary)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}
              >
                {nom}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

/** Vrai quand la page est lue de droite à gauche (arabe) : les flèches s'inversent. */
function isRtl(): boolean {
  return typeof document !== 'undefined' && document.documentElement.dir === 'rtl';
}
