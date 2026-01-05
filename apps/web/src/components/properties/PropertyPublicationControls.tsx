import React, { useState } from 'react';
import { Button } from '../ui/button';
import { Globe, EyeOff, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import { Property } from '../../types/property-types';
import { publishProperty, unpublishProperty } from '../../services/property-service';

interface PropertyPublicationControlsProps {
  property: Property;
  tenantId: string;
  onUpdate?: () => void;
}

export const PropertyPublicationControls: React.FC<PropertyPublicationControlsProps> = ({
  property,
  tenantId,
  onUpdate,
}) => {
  const [publishing, setPublishing] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  const handlePublish = async () => {
    setPublishing(true);
    setValidationErrors([]);
    try {
      await publishProperty(tenantId, property.id);
      if (onUpdate) {
        onUpdate();
      }
    } catch (error: any) {
      const errorMessage = error.response?.data?.error || 'Erreur lors de la publication';
      if (errorMessage.includes('requirements not met')) {
        // Extract validation errors from message
        const errors = errorMessage.split(':')[1]?.split(',') || [errorMessage];
        setValidationErrors(errors.map((e: string) => e.trim()));
      } else {
        setValidationErrors([errorMessage]);
      }
    } finally {
      setPublishing(false);
    }
  };

  const handleUnpublish = async () => {
    if (!confirm('Êtes-vous sûr de vouloir retirer cette propriété du portail public ?')) {
      return;
    }

    setPublishing(true);
    try {
      await unpublishProperty(tenantId, property.id);
      if (onUpdate) {
        onUpdate();
      }
    } catch (error: any) {
      alert(error.response?.data?.error || 'Erreur lors de la dépublication');
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Publication Status */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Publication</h3>
            <p className="text-sm text-gray-600">
              {property.isPublished
                ? 'Cette propriété est visible sur le portail public'
                : 'Cette propriété n\'est pas publiée'}
            </p>
          </div>
          {property.isPublished ? (
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle className="h-5 w-5" />
              <span className="font-medium">Publié</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-gray-400">
              <EyeOff className="h-5 w-5" />
              <span className="font-medium">Non publié</span>
            </div>
          )}
        </div>

        {/* Validation Errors */}
        {validationErrors.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h4 className="font-medium text-red-900 mb-2">
                  Conditions de publication non remplies
                </h4>
                <ul className="list-disc list-inside text-sm text-red-700 space-y-1">
                  {validationErrors.map((error, index) => (
                    <li key={index}>{error}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          {property.isPublished ? (
            <Button
              variant="outline"
              onClick={handleUnpublish}
              disabled={publishing}
              className="flex-1"
            >
              {publishing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Dépublication...
                </>
              ) : (
                <>
                  <EyeOff className="h-4 w-4 mr-2" />
                  Retirer du portail public
                </>
              )}
            </Button>
          ) : (
            <Button
              onClick={handlePublish}
              disabled={publishing}
              className="flex-1"
            >
              {publishing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Publication...
                </>
              ) : (
                <>
                  <Globe className="h-4 w-4 mr-2" />
                  Publier sur le portail public
                </>
              )}
            </Button>
          )}
        </div>

        {/* Publication Info */}
        {property.isPublished && property.publishedAt && (
          <div className="mt-4 pt-4 border-t text-sm text-gray-600">
            Publié le{' '}
            {new Date(property.publishedAt).toLocaleDateString('fr-FR', {
              dateStyle: 'long',
            })}
          </div>
        )}
      </div>
    </div>
  );
};

