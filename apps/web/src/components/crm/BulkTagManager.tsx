import React, { useState, useEffect } from 'react';
import { Button } from '../ui/button';
import { X, Tag as TagIcon, Plus, Minus } from 'lucide-react';
import { listTags, assignTag, removeTag, CrmTag } from '../../services/crm-service';

interface BulkTagManagerProps {
  tenantId: string;
  contactIds: string[];
  contactCount: number;
  onClose: () => void;
  onComplete: () => void;
}

export const BulkTagManager: React.FC<BulkTagManagerProps> = ({
  tenantId,
  contactIds,
  contactCount,
  onClose,
  onComplete,
}) => {
  const [allTags, setAllTags] = useState<CrmTag[]>([]);
  const [selectedTagsToAdd, setSelectedTagsToAdd] = useState<string[]>([]);
  const [selectedTagsToRemove, setSelectedTagsToRemove] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState({ current: 0, total: 0 });

  useEffect(() => {
    loadTags();
  }, [tenantId]);

  const loadTags = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await listTags(tenantId);
      if (response.success) {
        setAllTags(response.data);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur lors du chargement des tags');
    } finally {
      setLoading(false);
    }
  };

  const toggleTagToAdd = (tagId: string) => {
    if (selectedTagsToAdd.includes(tagId)) {
      setSelectedTagsToAdd(selectedTagsToAdd.filter((id) => id !== tagId));
    } else {
      setSelectedTagsToAdd([...selectedTagsToAdd, tagId]);
      // Remove from "to remove" list if present
      setSelectedTagsToRemove(selectedTagsToRemove.filter((id) => id !== tagId));
    }
  };

  const toggleTagToRemove = (tagId: string) => {
    if (selectedTagsToRemove.includes(tagId)) {
      setSelectedTagsToRemove(selectedTagsToRemove.filter((id) => id !== tagId));
    } else {
      setSelectedTagsToRemove([...selectedTagsToRemove, tagId]);
      // Remove from "to add" list if present
      setSelectedTagsToAdd(selectedTagsToAdd.filter((id) => id !== tagId));
    }
  };

  const handleApply = async () => {
    setProcessing(true);
    setError(null);
    
    const totalOperations = 
      (selectedTagsToAdd.length * contactIds.length) + 
      (selectedTagsToRemove.length * contactIds.length);
    
    setProgress({ current: 0, total: totalOperations });

    let currentOperation = 0;
    const errors: string[] = [];

    try {
      // Add tags
      for (const tagId of selectedTagsToAdd) {
        for (const contactId of contactIds) {
          try {
            await assignTag(tenantId, contactId, tagId);
            currentOperation++;
            setProgress({ current: currentOperation, total: totalOperations });
          } catch (err: any) {
            errors.push(`Erreur lors de l'ajout du tag à un contact: ${err.response?.data?.message || err.message}`);
          }
        }
      }

      // Remove tags
      for (const tagId of selectedTagsToRemove) {
        for (const contactId of contactIds) {
          try {
            await removeTag(tenantId, contactId, tagId);
            currentOperation++;
            setProgress({ current: currentOperation, total: totalOperations });
          } catch (err: any) {
            // Ignore "tag not assigned" errors
            if (!err.response?.data?.message?.includes('not assigned')) {
              errors.push(`Erreur lors de la suppression du tag d'un contact: ${err.response?.data?.message || err.message}`);
            }
            currentOperation++;
            setProgress({ current: currentOperation, total: totalOperations });
          }
        }
      }

      if (errors.length > 0) {
        setError(`Opération terminée avec ${errors.length} erreur(s). Certains tags n'ont peut-être pas été modifiés.`);
      }

      // Wait a bit to show completion
      setTimeout(() => {
        onComplete();
        onClose();
      }, 500);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur lors de l\'application des tags');
      setProcessing(false);
    }
  };

  const getTagById = (tagId: string) => allTags.find((tag) => tag.id === tagId);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Gestion des tags en masse</h2>
            <p className="text-sm text-gray-600 mt-1">
              {contactCount} contact{contactCount > 1 ? 's' : ''} sélectionné{contactCount > 1 ? 's' : ''}
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={processing}
            className="text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          )}

          {loading ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <p className="mt-2 text-gray-600">Chargement...</p>
            </div>
          ) : processing ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
              <p className="text-lg font-semibold text-gray-900 mb-2">Application des modifications...</p>
              <p className="text-sm text-gray-600">
                {progress.current} / {progress.total} opérations
              </p>
              <div className="w-full max-w-md mx-auto mt-4 bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${(progress.current / progress.total) * 100}%` }}
                ></div>
              </div>
            </div>
          ) : (
            <>
              {/* Instructions */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-800">
                  <strong>Instructions:</strong> Sélectionnez les tags à ajouter ou à retirer pour tous les contacts sélectionnés.
                  Les modifications seront appliquées lorsque vous cliquerez sur "Appliquer".
                </p>
              </div>

              {/* Tags to Add */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center">
                  <Plus className="h-5 w-5 mr-2 text-green-600" />
                  Tags à ajouter ({selectedTagsToAdd.length})
                </h3>
                <div className="flex flex-wrap gap-2">
                  {allTags.map((tag) => (
                    <button
                      key={tag.id}
                      onClick={() => toggleTagToAdd(tag.id)}
                      disabled={selectedTagsToRemove.includes(tag.id)}
                      className={`inline-flex items-center px-3 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                        selectedTagsToAdd.includes(tag.id)
                          ? 'shadow-md ring-2 ring-green-500'
                          : 'border-2 hover:shadow-sm'
                      }`}
                      style={
                        selectedTagsToAdd.includes(tag.id)
                          ? {
                              backgroundColor: tag.color || '#3B82F6',
                              color: '#FFFFFF',
                            }
                          : {
                              borderColor: tag.color || '#3B82F6',
                              color: tag.color || '#3B82F6',
                            }
                      }
                    >
                      {selectedTagsToAdd.includes(tag.id) && (
                        <Plus className="h-3 w-3 mr-1" />
                      )}
                      {tag.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tags to Remove */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center">
                  <Minus className="h-5 w-5 mr-2 text-red-600" />
                  Tags à retirer ({selectedTagsToRemove.length})
                </h3>
                <div className="flex flex-wrap gap-2">
                  {allTags.map((tag) => (
                    <button
                      key={tag.id}
                      onClick={() => toggleTagToRemove(tag.id)}
                      disabled={selectedTagsToAdd.includes(tag.id)}
                      className={`inline-flex items-center px-3 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                        selectedTagsToRemove.includes(tag.id)
                          ? 'shadow-md ring-2 ring-red-500 bg-red-100 text-red-800'
                          : 'border-2 hover:shadow-sm'
                      }`}
                      style={
                        !selectedTagsToRemove.includes(tag.id)
                          ? {
                              borderColor: tag.color || '#3B82F6',
                              color: tag.color || '#3B82F6',
                            }
                          : undefined
                      }
                    >
                      {selectedTagsToRemove.includes(tag.id) && (
                        <X className="h-3 w-3 mr-1" />
                      )}
                      {tag.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Summary */}
              {(selectedTagsToAdd.length > 0 || selectedTagsToRemove.length > 0) && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <h4 className="font-semibold text-gray-900 mb-2">Résumé des modifications:</h4>
                  <ul className="space-y-1 text-sm text-gray-700">
                    {selectedTagsToAdd.length > 0 && (
                      <li className="flex items-start">
                        <Plus className="h-4 w-4 mr-2 text-green-600 mt-0.5" />
                        <span>
                          Ajouter {selectedTagsToAdd.length} tag{selectedTagsToAdd.length > 1 ? 's' : ''} à {contactCount} contact{contactCount > 1 ? 's' : ''} 
                          ({selectedTagsToAdd.length * contactCount} opérations)
                        </span>
                      </li>
                    )}
                    {selectedTagsToRemove.length > 0 && (
                      <li className="flex items-start">
                        <Minus className="h-4 w-4 mr-2 text-red-600 mt-0.5" />
                        <span>
                          Retirer {selectedTagsToRemove.length} tag{selectedTagsToRemove.length > 1 ? 's' : ''} de {contactCount} contact{contactCount > 1 ? 's' : ''} 
                          ({selectedTagsToRemove.length * contactCount} opérations)
                        </span>
                      </li>
                    )}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {!processing && (
          <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
            <Button variant="outline" onClick={onClose} disabled={processing}>
              Annuler
            </Button>
            <Button
              onClick={handleApply}
              disabled={processing || (selectedTagsToAdd.length === 0 && selectedTagsToRemove.length === 0)}
            >
              <TagIcon className="h-4 w-4 mr-2" />
              Appliquer les modifications
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};
