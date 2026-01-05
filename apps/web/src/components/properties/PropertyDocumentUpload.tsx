import React, { useState, useRef } from 'react';
import { Button } from '../ui/button';
import { Upload, X, FileText, Loader2 } from 'lucide-react';
import { PropertyDocumentType } from '../../types/property-types';
import apiClient from '../../utils/api-client';

interface PropertyDocumentUploadProps {
  propertyId: string;
  tenantId: string;
  onUploadComplete?: () => void;
}

export const PropertyDocumentUpload: React.FC<PropertyDocumentUploadProps> = ({
  propertyId,
  tenantId,
  onUploadComplete,
}) => {
  const [uploading, setUploading] = useState(false);
  const [formData, setFormData] = useState({
    documentType: PropertyDocumentType.OTHER,
    expirationDate: '',
    isRequired: false,
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedFile) {
      alert('Veuillez sélectionner un fichier');
      return;
    }

    setUploading(true);
    try {
      const uploadFormData = new FormData();
      uploadFormData.append('file', selectedFile);
      uploadFormData.append('documentType', formData.documentType);
      if (formData.expirationDate) {
        uploadFormData.append('expirationDate', formData.expirationDate);
      }
      uploadFormData.append('isRequired', formData.isRequired.toString());

      await apiClient.post(
        `/tenants/${tenantId}/properties/${propertyId}/documents`,
        uploadFormData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        }
      );

      // Reset form
      setSelectedFile(null);
      setFormData({
        documentType: PropertyDocumentType.OTHER,
        expirationDate: '',
        isRequired: false,
      });
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

      if (onUploadComplete) {
        onUploadComplete();
      }
    } catch (error: any) {
      console.error('Error uploading document:', error);
      alert(error.response?.data?.error || 'Erreur lors du téléchargement');
    } finally {
      setUploading(false);
    }
  };

  const documentTypeLabels: Record<PropertyDocumentType, string> = {
    [PropertyDocumentType.TITLE_DEED]: 'Titre de propriété',
    [PropertyDocumentType.MANDATE]: 'Mandat',
    [PropertyDocumentType.PLAN]: 'Plan',
    [PropertyDocumentType.TAX_DOCUMENT]: 'Document fiscal',
    [PropertyDocumentType.OTHER]: 'Autre',
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="border-2 border-dashed border-gray-300 rounded-lg p-6">
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.tiff"
          className="hidden"
          onChange={handleFileSelect}
        />

        {selectedFile ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-gray-400" />
              <span className="text-sm text-gray-700">{selectedFile.name}</span>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setSelectedFile(null);
                if (fileInputRef.current) {
                  fileInputRef.current.value = '';
                }
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div className="text-center">
            <FileText className="h-12 w-12 text-gray-400 mx-auto mb-2" />
            <p className="text-sm text-gray-600 mb-2">
              Aucun fichier sélectionné
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-4 w-4 mr-2" />
              Sélectionner un fichier
            </Button>
            <p className="text-xs text-gray-500 mt-2">
              PDF, DOC, DOCX, JPEG, PNG, TIFF (max 10MB)
            </p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Type de document <span className="text-red-500">*</span>
          </label>
          <select
            value={formData.documentType}
            onChange={(e) =>
              setFormData((prev) => ({
                ...prev,
                documentType: e.target.value as PropertyDocumentType,
              }))
            }
            className="w-full rounded-md border border-gray-300 px-3 py-2"
            required
          >
            {Object.entries(documentTypeLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Date d'expiration (optionnel)
          </label>
          <input
            type="date"
            value={formData.expirationDate}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, expirationDate: e.target.value }))
            }
            className="w-full rounded-md border border-gray-300 px-3 py-2"
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="isRequired"
          checked={formData.isRequired}
          onChange={(e) =>
            setFormData((prev) => ({ ...prev, isRequired: e.target.checked }))
          }
          className="h-4 w-4 rounded border-gray-300 text-blue-600"
        />
        <label htmlFor="isRequired" className="text-sm text-gray-700">
          Document requis
        </label>
      </div>

      <Button type="submit" disabled={uploading || !selectedFile} className="w-full">
        {uploading ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Téléchargement...
          </>
        ) : (
          <>
            <Upload className="h-4 w-4 mr-2" />
            Télécharger le document
          </>
        )}
      </Button>
    </form>
  );
};





