import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { DashboardLayout } from '../../components/dashboard/dashboard-layout';
import { PropertyForm } from '../../components/properties/PropertyForm';
import { PropertyPublicationControls } from '../../components/properties/PropertyPublicationControls';
import { PropertyMediaUpload } from '../../components/properties/PropertyMediaUpload';
import { PropertyMediaGallery } from '../../components/properties/PropertyMediaGallery';
import { getProperty, updateProperty } from '../../services/property-service';
import { Property, UpdatePropertyRequest, PropertyMediaType } from '../../types/property-types';
import { useAuth } from '../../hooks/useAuth';
import { ArrowLeft, Loader2, Image, Video } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '../../components/ui/button';

export const PropertyEdit: React.FC = () => {
  const navigate = useNavigate();
  const { tenantId, id } = useParams<{ tenantId: string; id: string }>();
  const { tenantMembership } = useAuth();
  const effectiveTenantId = tenantId || tenantMembership?.tenantId;

  const [property, setProperty] = useState<Property | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mediaRefreshKey, setMediaRefreshKey] = useState(0);

  useEffect(() => {
    if (!effectiveTenantId || !id) {
      setError('Paramètres manquants');
      setLoading(false);
      return;
    }

    loadProperty();
  }, [effectiveTenantId, id]);

  const loadProperty = async () => {
    if (!effectiveTenantId || !id) return;

    try {
      setLoading(true);
      const data = await getProperty(effectiveTenantId, id);
      setProperty(data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erreur lors du chargement de la propriété');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (data: UpdatePropertyRequest) => {
    if (!effectiveTenantId || !id) return;

    try {
      await updateProperty(effectiveTenantId, id, data);
      navigate(`/tenant/${effectiveTenantId}/properties/${id}`);
    } catch (error) {
      console.error('Error updating property:', error);
      throw error;
    }
  };

  const handleCancel = () => {
    if (!effectiveTenantId || !id) return;
    navigate(`/tenant/${effectiveTenantId}/properties/${id}`);
  };

  if (!effectiveTenantId) {
    return (
      <DashboardLayout>
        <div className="text-center py-12">
          <p className="text-slate-600">Aucun tenant sélectionné</p>
        </div>
      </DashboardLayout>
    );
  }

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      </DashboardLayout>
    );
  }

  if (error || !property) {
    return (
      <DashboardLayout>
        <div className="text-center py-12">
          <p className="text-red-600">{error || 'Propriété non trouvée'}</p>
          <Link to={`/tenant/${effectiveTenantId}/properties`}>
            <Button variant="outline" className="mt-4">
              Retour à la liste
            </Button>
          </Link>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to={`/tenant/${effectiveTenantId}/properties/${id}`}>
              <Button variant="outline" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Retour
              </Button>
            </Link>
            <div>
              <h1 className="text-3xl font-bold text-slate-900">Modifier la propriété</h1>
              <p className="mt-2 text-sm text-slate-600">
                {property.title}
              </p>
            </div>
          </div>
        </div>

        {/* Publication Controls */}
        {property && effectiveTenantId && (
          <PropertyPublicationControls
            property={property}
            tenantId={effectiveTenantId}
            onUpdate={loadProperty}
          />
        )}

        {/* Form */}
        <div className="bg-white rounded-lg shadow p-6">
          <PropertyForm
            property={property}
            tenantId={effectiveTenantId}
            onSubmit={handleSubmit}
            onCancel={handleCancel}
          />
        </div>

        {/* Media Section */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold text-slate-900 mb-6 flex items-center gap-2">
            <Image className="h-5 w-5" />
            Photos et Vidéos
          </h2>
          
          <div className="space-y-8">
            {/* Photos Section */}
            <div>
              <h3 className="text-lg font-medium text-slate-800 mb-4 flex items-center gap-2">
                <Image className="h-4 w-4" />
                Photos
              </h3>
              <PropertyMediaUpload
                propertyId={id!}
                tenantId={effectiveTenantId}
                mediaType={PropertyMediaType.PHOTO}
                onUploadComplete={() => setMediaRefreshKey(prev => prev + 1)}
              />
              <div className="mt-4">
                <PropertyMediaGallery
                  propertyId={id!}
                  tenantId={effectiveTenantId}
                  mediaType={PropertyMediaType.PHOTO}
                  refreshTrigger={mediaRefreshKey}
                />
              </div>
            </div>

            {/* Videos Section */}
            <div>
              <h3 className="text-lg font-medium text-slate-800 mb-4 flex items-center gap-2">
                <Video className="h-4 w-4" />
                Vidéos
              </h3>
              <PropertyMediaUpload
                propertyId={id!}
                tenantId={effectiveTenantId}
                mediaType={PropertyMediaType.VIDEO}
                onUploadComplete={() => setMediaRefreshKey(prev => prev + 1)}
              />
              <div className="mt-4">
                <PropertyMediaGallery
                  propertyId={id!}
                  tenantId={effectiveTenantId}
                  mediaType={PropertyMediaType.VIDEO}
                  refreshTrigger={mediaRefreshKey}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

