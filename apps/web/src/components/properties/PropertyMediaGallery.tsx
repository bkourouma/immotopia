import React, { useState, useEffect } from 'react';
import { Button } from '../ui/button';
import { Star, Trash2, GripVertical, Image as ImageIcon, Video, Loader2 } from 'lucide-react';
import { PropertyMedia, PropertyMediaType } from '../../types/property-types';
import apiClient from '../../utils/api-client';

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
    } catch (error: any) {
      alert(error.response?.data?.error || 'Erreur lors de la mise à jour');
    }
  };

  const handleDelete = async (mediaId: string) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer ce média ?')) {
      return;
    }

    try {
      await apiClient.delete(
        `/tenants/${tenantId}/properties/${propertyId}/media/${mediaId}`
      );
      await loadMedia();
      if (onUpdate) onUpdate();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Erreur lors de la suppression');
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
    } catch (error: any) {
      alert(error.response?.data?.error || 'Erreur lors du réordonnancement');
      await loadMedia(); // Reload on error
    } finally {
      setReordering(false);
      setDraggedIndex(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (media.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <ImageIcon className="h-12 w-12 mx-auto mb-4 text-gray-400" />
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
      const apiBaseUrl = process.env.REACT_APP_API_URL || 'http://localhost:8001/api';
      const baseUrl = apiBaseUrl.replace('/api', '');
      return `${baseUrl}${item.fileUrl}`;
    }
    return '';
  };

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {media.map((item, index) => (
        <div
          key={item.id}
          className={`relative group border rounded-lg overflow-hidden ${
            item.isPrimary ? 'ring-2 ring-blue-500' : ''
          } ${reordering ? 'opacity-50' : ''}`}
          draggable
          onDragStart={() => handleDragStart(index)}
          onDragOver={(e) => handleDragOver(e, index)}
          onDragEnd={handleDragEnd}
        >
          <div className="aspect-square bg-gray-100 flex items-center justify-center">
            {item.mediaType === PropertyMediaType.PHOTO ? (
              <img
                src={getMediaUrl(item)}
                alt={item.fileName}
                className="w-full h-full object-cover"
              />
            ) : item.mediaType === PropertyMediaType.VIDEO ? (
              <div className="flex flex-col items-center gap-2 text-gray-400">
                <Video className="h-12 w-12" />
                <span className="text-xs">Vidéo</span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 text-gray-400">
                <ImageIcon className="h-12 w-12" />
                <span className="text-xs">Tour 360°</span>
              </div>
            )}
          </div>

          {/* Overlay with actions */}
          <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-50 transition-opacity flex items-center justify-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => handleSetPrimary(item.id)}
              className={item.isPrimary ? 'bg-blue-600 text-white' : ''}
            >
              <Star className={`h-4 w-4 ${item.isPrimary ? 'fill-current' : ''}`} />
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => handleDelete(item.id)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
            <div className="cursor-move">
              <GripVertical className="h-4 w-4 text-white" />
            </div>
          </div>

          {/* Primary badge */}
          {item.isPrimary && (
            <div className="absolute top-2 left-2 bg-blue-600 text-white text-xs px-2 py-1 rounded flex items-center gap-1">
              <Star className="h-3 w-3 fill-current" />
              Principal
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

