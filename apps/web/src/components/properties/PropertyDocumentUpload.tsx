import React, { useState, useRef, useId } from 'react';
import { Button } from '../ui/button';
import { Upload, X, FileText, Loader2 } from 'lucide-react';
import { PropertyDocumentType } from '../../types/property-types';
import apiClient from '../../utils/api-client';
import { App } from 'antd';
import { t } from '../../i18n/t';
import { documentTypeLabel } from '../patrimoine/patrimoine-labels';
import { apiErrorText } from './property-api-errors';

/** Poids maximal annoncé à l'écran (« max 10MB ») et contrôlé avant l'envoi. */
const TAILLE_MAX_OCTETS = 10 * 1024 * 1024;
const EXTENSIONS_ACCEPTEES = /\.(pdf|doc|docx|jpe?g|png|tiff?)$/i;

interface PropertyDocumentUploadProps {
  propertyId: string;
  tenantId: string;
  onUploadComplete?: () => void;
}

export const PropertyDocumentUpload: React.FC<PropertyDocumentUploadProps> = ({
  propertyId,
  tenantId,
  onUploadComplete
}) => {
  const { message } = App.useApp();
  const idBase = useId();
  const [uploading, setUploading] = useState(false);
  const [progression, setProgression] = useState(0);
  const [formData, setFormData] = useState({
    documentType: PropertyDocumentType.OTHER,
    expirationDate: '',
    isRequired: false
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  // Motif de refus du fichier choisi (type ou poids), affiché sous la zone.
  const [fileError, setFileError] = useState<string | null>(null);
  // Échec de l'envoi : reste affiché près du bouton, avec la possibilité de relancer.
  const [submitError, setSubmitError] = useState<string | null>(null);

  const resetFileInput = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSubmitError(null);
    const file = e.target.files && e.target.files.length > 0 ? e.target.files[0] : null;
    if (!file) return;

    if (!EXTENSIONS_ACCEPTEES.test(file.name)) {
      setSelectedFile(null);
      setFileError(
        t('Format non accepté. Choisissez un PDF, un document Word (DOC, DOCX) ou une image (JPEG, PNG, TIFF).')
      );
      resetFileInput();
      return;
    }
    if (file.size > TAILLE_MAX_OCTETS) {
      setSelectedFile(null);
      setFileError(t('Ce fichier dépasse 10 Mo. Réduisez sa taille, puis choisissez-le à nouveau.'));
      resetFileInput();
      return;
    }
    setFileError(null);
    setSelectedFile(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (uploading) return;

    if (!selectedFile) {
      message.warning(t('Veuillez sélectionner un fichier'));
      return;
    }

    setUploading(true);
    setProgression(0);
    setSubmitError(null);
    try {
      const uploadFormData = new FormData();
      uploadFormData.append('file', selectedFile);
      uploadFormData.append('documentType', formData.documentType);
      if (formData.expirationDate) {
        uploadFormData.append('expirationDate', formData.expirationDate);
      }
      uploadFormData.append('isRequired', formData.isRequired.toString());

      await apiClient.post(`/tenants/${tenantId}/properties/${propertyId}/documents`, uploadFormData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        },
        onUploadProgress: event => {
          if (event.total) setProgression(Math.round((event.loaded / event.total) * 100));
        }
      });

      // Reset form
      setSelectedFile(null);
      setFormData({
        documentType: PropertyDocumentType.OTHER,
        expirationDate: '',
        isRequired: false
      });
      resetFileInput();

      if (onUploadComplete) {
        onUploadComplete();
      }
    } catch (error: unknown) {
      console.error('Error uploading document:', error);
      const texte = apiErrorText(error, t('Erreur lors du téléchargement'));
      setSubmitError(texte);
      message.error(texte);
    } finally {
      setUploading(false);
    }
  };

  // Libellés partagés avec le module Patrimoine (`patrimoine-labels.ts`) :
  // les documents du patrimoine SONT des documents de bien, mêmes types.
  const documentTypeOptions = Object.values(PropertyDocumentType).map(value => ({
    value,
    label: documentTypeLabel(value)
  }));

  const typeId = `${idBase}-type`;
  const expirationId = `${idBase}-expiration`;
  const requiredId = `${idBase}-required`;
  const erreurFichierId = `${idBase}-erreur-fichier`;

  return (
    <form onSubmit={handleSubmit} className="space-y-4" aria-busy={uploading}>
      <div className={`border-2 border-dashed rounded-lg p-6 ${fileError ? 'border-red-300' : 'border-gray-300'}`}>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.tiff"
          aria-label={t('Choisir un document')}
          aria-describedby={fileError ? erreurFichierId : undefined}
          className="hidden"
          onChange={handleFileSelect}
        />

        {selectedFile ? (
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <FileText className="h-5 w-5 flex-shrink-0 text-gray-400" aria-hidden="true" />
              <span className="truncate text-sm text-gray-700">{selectedFile.name}</span>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={uploading}
              aria-label={t('Retirer le fichier {{value}}', { value: selectedFile.name })}
              onClick={() => {
                setSelectedFile(null);
                resetFileInput();
              }}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        ) : (
          <div className="text-center">
            <FileText className="h-12 w-12 text-gray-400 mx-auto mb-2" aria-hidden="true" />
            <p className="text-sm text-gray-600 mb-2">{t('Aucun fichier sélectionné')}</p>
            <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()}>
              <Upload className="h-4 w-4 me-2" aria-hidden="true" />
              {t('Sélectionner un fichier')}
            </Button>
            <p className="text-xs text-gray-500 mt-2">{t('PDF, DOC, DOCX, JPEG, PNG, TIFF (max 10MB)')}</p>
          </div>
        )}
      </div>
      {fileError && (
        <p id={erreurFichierId} role="alert" className="m-0 text-sm text-red-700">
          {fileError}
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label htmlFor={typeId} className="block text-sm font-medium text-gray-700 mb-1">
            {t('Type de document')} <span className="text-red-500">*</span>
          </label>
          <select
            id={typeId}
            value={formData.documentType}
            onChange={e =>
              setFormData(prev => ({
                ...prev,
                documentType: e.target.value as PropertyDocumentType
              }))
            }
            className="w-full rounded-md border border-gray-300 px-3 py-2 min-h-[44px] lg:min-h-0"
            required
          >
            {documentTypeOptions.map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor={expirationId} className="block text-sm font-medium text-gray-700 mb-1">
            {t("Date d'expiration (optionnel)")}
          </label>
          <input
            id={expirationId}
            type="date"
            value={formData.expirationDate}
            onChange={e => setFormData(prev => ({ ...prev, expirationDate: e.target.value }))}
            className="w-full rounded-md border border-gray-300 px-3 py-2 min-h-[44px] lg:min-h-0"
          />
        </div>
      </div>

      <div className="flex items-center gap-2 min-h-[44px] lg:min-h-0">
        <input
          type="checkbox"
          id={requiredId}
          checked={formData.isRequired}
          onChange={e => setFormData(prev => ({ ...prev, isRequired: e.target.checked }))}
          className="h-5 w-5 rounded border-gray-300 text-primary lg:h-4 lg:w-4"
        />
        <label htmlFor={requiredId} className="text-sm text-gray-700">
          {t('Document requis')}
        </label>
      </div>

      {uploading && (
        <div
          role="progressbar"
          aria-label={t('Envoi du document en cours')}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progression}
          className="h-2 w-full rounded-full bg-gray-200"
        >
          <div
            className="h-2 rounded-full bg-primary transition-all duration-300"
            style={{ width: `${progression}%` }}
          />
        </div>
      )}

      {submitError && (
        <p role="alert" className="m-0 whitespace-pre-line text-sm text-red-700">
          {submitError} {t('Votre fichier est conservé : vous pouvez relancer l’envoi.')}
        </p>
      )}

      <Button type="submit" disabled={uploading || !selectedFile} className="w-full">
        {uploading ? (
          <>
            <Loader2 className="h-4 w-4 me-2 animate-spin" aria-hidden="true" />
            {t('Téléchargement...')} {progression > 0 ? `${progression} %` : ''}
          </>
        ) : (
          <>
            <Upload className="h-4 w-4 me-2" aria-hidden="true" />
            {submitError ? t('Réessayer') : t('Télécharger le document')}
          </>
        )}
      </Button>
    </form>
  );
};
