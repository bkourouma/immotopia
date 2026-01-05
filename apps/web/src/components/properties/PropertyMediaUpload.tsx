import React, { useState, useRef } from 'react';
import { Button } from '../ui/button';
import { Upload, X, Image, Video, Loader2, CheckCircle, XCircle } from 'lucide-react';
import { PropertyMediaType } from '../../types/property-types';
import apiClient from '../../utils/api-client';

interface PropertyMediaUploadProps {
  propertyId: string;
  tenantId: string;
  onUploadComplete?: () => void;
  mediaType?: PropertyMediaType;
}

export const PropertyMediaUpload: React.FC<PropertyMediaUploadProps> = ({
  propertyId,
  tenantId,
  onUploadComplete,
  mediaType = PropertyMediaType.PHOTO,
}) => {
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{current: number; total: number; fileName: string} | null>(null);
  const [uploadStatus, setUploadStatus] = useState<{success: boolean; message: string} | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Clear status message after 3 seconds
  React.useEffect(() => {
    if (uploadStatus) {
      const timer = setTimeout(() => setUploadStatus(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [uploadStatus]);

  const handleFileSelect = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    setUploading(true);
    setUploadStatus(null);
    const fileArray = Array.from(files);
    let successCount = 0;
    let errorCount = 0;

    try {
      for (let i = 0; i < fileArray.length; i++) {
        const file = fileArray[i];
        setUploadProgress({ current: i + 1, total: fileArray.length, fileName: file.name });

        try {
          const formData = new FormData();
          formData.append('file', file);
          formData.append('mediaType', mediaType);

          await apiClient.post(
            `/tenants/${tenantId}/properties/${propertyId}/media`,
            formData,
            {
              headers: {
                'Content-Type': 'multipart/form-data',
              },
            }
          );
          successCount++;
        } catch (error: any) {
          console.error(`Error uploading ${file.name}:`, error);
          errorCount++;
        }
      }

      if (successCount > 0 && onUploadComplete) {
        onUploadComplete();
      }

      // Show status message
      if (errorCount === 0) {
        setUploadStatus({
          success: true,
          message: `${successCount} fichier${successCount > 1 ? 's' : ''} téléchargé${successCount > 1 ? 's' : ''} avec succès !`
        });
      } else if (successCount > 0) {
        setUploadStatus({
          success: false,
          message: `${successCount} réussi${successCount > 1 ? 's' : ''}, ${errorCount} échoué${errorCount > 1 ? 's' : ''}`
        });
      } else {
        setUploadStatus({
          success: false,
          message: 'Échec du téléchargement. Veuillez réessayer.'
        });
      }
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelect(e.dataTransfer.files);
    }
  };

  return (
    <div className="space-y-2">
      {/* Status message */}
      {uploadStatus && (
        <div className={`flex items-center gap-2 p-3 rounded-lg text-sm ${
          uploadStatus.success 
            ? 'bg-green-50 text-green-700 border border-green-200' 
            : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {uploadStatus.success ? (
            <CheckCircle className="h-4 w-4 flex-shrink-0" />
          ) : (
            <XCircle className="h-4 w-4 flex-shrink-0" />
          )}
          <span>{uploadStatus.message}</span>
        </div>
      )}

      <div
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
          dragActive
            ? 'border-blue-500 bg-blue-50'
            : 'border-gray-300 hover:border-gray-400'
        } ${uploading ? 'opacity-50 pointer-events-none' : ''}`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={
            mediaType === PropertyMediaType.PHOTO
              ? 'image/jpeg,image/jpg,image/png,image/webp'
              : mediaType === PropertyMediaType.VIDEO
              ? 'video/mp4,video/webm,video/quicktime'
              : '*'
          }
          className="hidden"
          onChange={(e) => handleFileSelect(e.target.files)}
        />

        {uploading ? (
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-12 w-12 animate-spin text-blue-600" />
            {uploadProgress && (
              <div className="w-full max-w-xs">
                <div className="flex justify-between text-sm text-gray-600 mb-2">
                  <span className="truncate max-w-[200px]">{uploadProgress.fileName}</span>
                  <span>{uploadProgress.current}/{uploadProgress.total}</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${(uploadProgress.current / uploadProgress.total) * 100}%` }}
                  />
                </div>
              </div>
            )}
            <p className="text-sm text-gray-600">Téléchargement en cours...</p>
          </div>
        ) : (
          <>
            <div className="flex justify-center mb-4">
              {mediaType === PropertyMediaType.PHOTO ? (
                <Image className="h-12 w-12 text-gray-400" />
              ) : mediaType === PropertyMediaType.VIDEO ? (
                <Video className="h-12 w-12 text-gray-400" />
              ) : (
                <Upload className="h-12 w-12 text-gray-400" />
              )}
            </div>
            <p className="text-sm text-gray-600 mb-2">
              Glissez-déposez vos fichiers ici ou
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-4 w-4 mr-2" />
              Sélectionner des fichiers
            </Button>
            <p className="text-xs text-gray-500 mt-2">
              {mediaType === PropertyMediaType.PHOTO
                ? 'JPEG, PNG, WebP (max 50MB)'
                : mediaType === PropertyMediaType.VIDEO
                ? 'MP4, WebM, QuickTime (max 50MB)'
                : 'Fichiers multimédias (max 50MB)'}
            </p>
          </>
        )}
      </div>
    </div>
  );
};




