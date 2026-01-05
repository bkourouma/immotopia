import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { DashboardLayout } from '../../components/dashboard/dashboard-layout';
import apiClient from '../../utils/api-client';

interface DocumentTemplate {
  id: string;
  doc_type: string;
  name: string;
  status: string;
  is_default: boolean;
  original_filename: string;
  placeholders: string[];
  created_at: string;
}

const DOC_TYPES = [
  { value: 'LEASE_HABITATION', label: 'Bail Habitation' },
  { value: 'LEASE_COMMERCIAL', label: 'Bail Commercial' },
  { value: 'RENT_RECEIPT', label: 'Reçu de Loyer' },
  { value: 'RENT_STATEMENT', label: 'Relevé de Compte' }
];

export function DocumentTemplates() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadForm, setUploadForm] = useState({
    docType: 'LEASE_HABITATION',
    name: '',
    file: null as File | null
  });
  const [filterDocType, setFilterDocType] = useState<string>('');

  useEffect(() => {
    if (tenantId) {
      loadTemplates();
    }
  }, [tenantId, filterDocType]);

  const loadTemplates = async () => {
    try {
      setLoading(true);
      const url = filterDocType
        ? `/tenants/${tenantId}/documents/templates?docType=${filterDocType}`
        : `/tenants/${tenantId}/documents/templates`;
      
      const response = await apiClient.get(url);
      const data = response.data;

      if (data.success) {
        setTemplates(data.data || []);
      } else {
        setError(data.message || 'Erreur lors du chargement des templates');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur lors du chargement des templates');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadForm.file || !uploadForm.name) {
      setError('Veuillez remplir tous les champs');
      return;
    }

    try {
      setUploading(true);
      setError(null);

      const formData = new FormData();
      formData.append('file', uploadForm.file);
      formData.append('docType', uploadForm.docType);
      formData.append('name', uploadForm.name);

      const response = await apiClient.post(
        `/tenants/${tenantId}/documents/templates/upload`,
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data'
          }
        }
      );

      const data = response.data;

      if (data.success) {
        setShowUploadModal(false);
        setUploadForm({ docType: 'LEASE_HABITATION', name: '', file: null });
        loadTemplates();
      } else {
        setError(data.message || 'Erreur lors du téléchargement');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur lors du téléchargement');
      console.error(err);
    } finally {
      setUploading(false);
    }
  };

  const handleSetDefault = async (templateId: string) => {
    try {
      const response = await apiClient.post(
        `/tenants/${tenantId}/documents/templates/${templateId}/set-default`
      );

      const data = response.data;
      if (data.success) {
        loadTemplates();
      } else {
        setError(data.message || 'Erreur lors de la définition du template par défaut');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur lors de la définition du template par défaut');
      console.error(err);
    }
  };

  const handleToggleStatus = async (templateId: string, currentStatus: string) => {
    try {
      const newStatus = currentStatus === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
      const response = await apiClient.patch(
        `/tenants/${tenantId}/documents/templates/${templateId}`,
        { status: newStatus }
      );

      const data = response.data;
      if (data.success) {
        loadTemplates();
      } else {
        setError(data.message || 'Erreur lors de la mise à jour');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur lors de la mise à jour');
      console.error(err);
    }
  };

  const handleDelete = async (templateId: string) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer ce template ?')) {
      return;
    }

    try {
      const response = await apiClient.delete(
        `/tenants/${tenantId}/documents/templates/${templateId}`
      );

      const data = response.data;
      if (data.success) {
        loadTemplates();
      } else {
        setError(data.message || 'Erreur lors de la suppression');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur lors de la suppression');
      console.error(err);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Templates de Documents</h1>
            <p className="text-muted-foreground">Gérez vos templates de documents</p>
          </div>
          <button
            onClick={() => setShowUploadModal(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
          >
            + Ajouter un template
          </button>
        </div>

        {error && (
          <div className="bg-destructive/10 text-destructive px-4 py-3 rounded-md">
            {error}
          </div>
        )}

        {/* Filter */}
        <div className="flex items-center gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">Filtrer par type</label>
            <select
              value={filterDocType}
              onChange={(e) => setFilterDocType(e.target.value)}
              className="border rounded-lg px-4 py-2 w-full max-w-xs"
            >
              <option value="">Tous les types</option>
              {DOC_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-8">Chargement...</div>
        ) : templates.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            Aucun template trouvé
          </div>
        ) : (
          <div className="border rounded-lg">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Nom
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Statut
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Placeholders
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {templates.map((template) => (
                  <tr key={template.id}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <span className="text-sm font-medium text-gray-900">{template.name}</span>
                        {template.is_default && (
                          <span className="ml-2 px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded">
                            Par défaut
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-gray-500">{template.original_filename}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {DOC_TYPES.find((t) => t.value === template.doc_type)?.label ||
                        template.doc_type}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-2 py-1 text-xs rounded ${
                          template.status === 'ACTIVE'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {template.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      <div className="max-w-xs">
                        <div className="flex flex-wrap gap-1">
                          {(template.placeholders || []).slice(0, 3).map((p) => (
                            <span
                              key={p}
                              className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded"
                            >
                              {p}
                            </span>
                          ))}
                          {(template.placeholders || []).length > 3 && (
                            <span className="px-2 py-1 text-gray-500 text-xs">
                              +{(template.placeholders || []).length - 3}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex gap-2">
                        {!template.is_default && (
                          <button
                            onClick={() => handleSetDefault(template.id)}
                            className="text-blue-600 hover:text-blue-900"
                          >
                            Définir par défaut
                          </button>
                        )}
                        <button
                          onClick={() => handleToggleStatus(template.id, template.status)}
                          className="text-gray-600 hover:text-gray-900"
                        >
                          {template.status === 'ACTIVE' ? 'Désactiver' : 'Activer'}
                        </button>
                        <button
                          onClick={() => handleDelete(template.id)}
                          className="text-red-600 hover:text-red-900"
                        >
                          Supprimer
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Upload Modal */}
        {showUploadModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-md w-full">
              <h2 className="text-xl font-bold mb-4">Ajouter un template</h2>
              <form onSubmit={handleUpload}>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Type de document
                  </label>
                  <select
                    value={uploadForm.docType}
                    onChange={(e) =>
                      setUploadForm({ ...uploadForm, docType: e.target.value })
                    }
                    className="border border-gray-300 rounded-lg px-4 py-2 w-full"
                    required
                  >
                    {DOC_TYPES.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Nom du template
                  </label>
                  <input
                    type="text"
                    value={uploadForm.name}
                    onChange={(e) => setUploadForm({ ...uploadForm, name: e.target.value })}
                    className="border border-gray-300 rounded-lg px-4 py-2 w-full"
                    required
                  />
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Fichier DOCX
                  </label>
                  <input
                    type="file"
                    accept=".docx"
                    onChange={(e) =>
                      setUploadForm({
                        ...uploadForm,
                        file: e.target.files?.[0] || null
                      })
                    }
                    className="border border-gray-300 rounded-lg px-4 py-2 w-full"
                    required
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowUploadModal(false)}
                    className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    disabled={uploading}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    {uploading ? 'Téléchargement...' : 'Télécharger'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}


