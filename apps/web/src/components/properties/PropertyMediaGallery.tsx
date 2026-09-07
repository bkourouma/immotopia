import React, { useState, useEffect } from 'react';
import { Button, Popconfirm, message, Spin } from 'antd';
import {
  StarOutlined,
  DeleteOutlined,
  DragOutlined,
  PictureOutlined,
  PlayCircleOutlined,
} from '@ant-design/icons';
import { PropertyMedia, PropertyMediaType } from '../../types/property-types';
import apiClient from '../../utils/api-client';
import { API_URL } from '../../config/api';

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
  mediaType: filterMediaType,
}) => {
  const [media, setMedia] = useState<PropertyMedia[]>([]);
  const [loading, setLoading] = useState(true);
  const [reordering, setReordering] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  useEffect(() => {
    loadMedia();
  }, [propertyId, tenantId, refreshTrigger]);

  const loadMedia = async () => {
    try {
      setLoading(true);
      const response = await apiClient.get<{ success: boolean; data: PropertyMedia[] }>(
        `/tenants/${tenantId}/properties/${propertyId}/media`
      );
      // Filter by media type if specified
      const allMedia = response.data.data;
      const filteredMedia = filterMediaType 
        ? allMedia.filter(m => m.mediaType === filterMediaType)
        : allMedia;
      setMedia(filteredMedia);
    } catch (error) {
      console.error('Error loading media:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSetPrimary = async (mediaId: string) => {
    try {
      await apiClient.post(
        `/tenants/${tenantId}/properties/${propertyId}/media/primary`,
        { mediaId }
      );
      await loadMedia();
      if (onUpdate) onUpdate();
      message.success('Photo principale mise à jour');
    } catch (error: any) {
      message.error(error.response?.data?.error || 'Erreur lors de la mise à jour');
    }
  };

  const handleDelete = async (mediaId: string) => {
    try {
      await apiClient.delete(
        `/tenants/${tenantId}/properties/${propertyId}/media/${mediaId}`
      );
      await loadMedia();
      if (onUpdate) onUpdate();
      message.success('Média supprimé avec succès');
    } catch (error: any) {
      message.error(error.response?.data?.error || 'Erreur lors de la suppression');
    }
  };

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null) return;

    const newMedia = [...media];
    const draggedItem = newMedia[draggedIndex];
    newMedia.splice(draggedIndex, 1);
    newMedia.splice(index, 0, draggedItem);
    setMedia(newMedia);
    setDraggedIndex(index);
  };

  const handleDragEnd = async () => {
    if (draggedIndex === null) return;

    try {
      setReordering(true);
      const mediaOrders = media.map((item, index) => ({
        mediaId: item.id,
        displayOrder: index,
      }));

      await apiClient.post(
        `/tenants/${tenantId}/properties/${propertyId}/media/reorder`,
        { mediaOrders }
      );

      if (onUpdate) onUpdate();
      message.success('Ordre des médias mis à jour');
    } catch (error: any) {
      message.error(error.response?.data?.error || 'Erreur lors du réordonnancement');
      await loadMedia(); // Reload on error
    } finally {
      setReordering(false);
      setDraggedIndex(null);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '48px 0' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (media.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '48px 0', color: '#8c8c8c' }}>
        <PictureOutlined style={{ fontSize: 48, color: '#bfbfbf', marginBottom: 16 }} />
        <p>Aucun média pour cette propriété</p>
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

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
      {media.map((item, index) => (
        <div
          key={item.id}
          style={{
            position: 'relative',
            border: item.isPrimary ? '2px solid #1890ff' : '1px solid #d9d9d9',
            borderRadius: 8,
            overflow: 'hidden',
            opacity: reordering ? 0.5 : 1,
            cursor: 'move',
          }}
          draggable
          onDragStart={() => handleDragStart(index)}
          onDragOver={(e) => handleDragOver(e, index)}
          onDragEnd={handleDragEnd}
          onMouseEnter={(e) => {
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.boxShadow = 'none';
          }}
        >
          <div
            style={{
              aspectRatio: '1',
              backgroundColor: '#f0f0f0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
            }}
          >
            {item.mediaType === PropertyMediaType.PHOTO ? (
              <img
                src={getMediaUrl(item)}
                alt={item.fileName}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : item.mediaType === PropertyMediaType.VIDEO ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, color: '#8c8c8c' }}>
                <PlayCircleOutlined style={{ fontSize: 48 }} />
                <span style={{ fontSize: 12 }}>Vidéo</span>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, color: '#8c8c8c' }}>
                <PictureOutlined style={{ fontSize: 48 }} />
                <span style={{ fontSize: 12 }}>Tour 360°</span>
              </div>
            )}
          </div>

          {/* Overlay with actions */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              backgroundColor: 'rgba(0, 0, 0, 0)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              transition: 'background-color 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0)';
            }}
          >
            <Button
              type="default"
              icon={<StarOutlined />}
              onClick={() => handleSetPrimary(item.id)}
              style={{
                backgroundColor: item.isPrimary ? '#1890ff' : 'rgba(255, 255, 255, 0.9)',
                color: item.isPrimary ? '#fff' : '#000',
                border: 'none',
              }}
            />
            <Popconfirm
              title="Supprimer le média"
              description={`Êtes-vous sûr de vouloir supprimer ${item.mediaType === PropertyMediaType.PHOTO ? 'cette photo' : 'cette vidéo'} ?`}
              onConfirm={() => handleDelete(item.id)}
              okText="Supprimer"
              cancelText="Annuler"
              okButtonProps={{ danger: true }}
            >
              <Button
                type="default"
                danger
                icon={<DeleteOutlined />}
                style={{
                  backgroundColor: 'rgba(255, 255, 255, 0.9)',
                  border: 'none',
                }}
              />
            </Popconfirm>
            <div style={{ cursor: 'move', color: '#fff' }}>
              <DragOutlined style={{ fontSize: 16 }} />
            </div>
          </div>

          {/* Primary badge */}
          {item.isPrimary && (
            <div
              style={{
                position: 'absolute',
                top: 8,
                left: 8,
                backgroundColor: '#1890ff',
                color: '#fff',
                fontSize: 12,
                padding: '4px 8px',
                borderRadius: 4,
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <StarOutlined style={{ fontSize: 12 }} />
              Principal
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

