import React, { useState, useEffect } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { X, Plus, Tag as TagIcon, Search } from 'lucide-react';
import { listTags, assignTag, removeTag, getContactTags, CrmTag } from '../../services/crm-service';

interface TagManagerProps {
  tenantId: string;
  contactId: string;
  contactName: string;
  onClose: () => void;
  onTagsUpdated?: () => void;
}

export const TagManager: React.FC<TagManagerProps> = ({
  tenantId,
  contactId,
  contactName,
  onClose,
  onTagsUpdated,
}) => {
  const [allTags, setAllTags] = useState<CrmTag[]>([]);
  const [contactTags, setContactTags] = useState<CrmTag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [processing, setProcessing] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [tenantId, contactId]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [tagsResponse, contactTagsResponse] = await Promise.all([
        listTags(tenantId),
        getContactTags(tenantId, contactId),
      ]);

      if (tagsResponse.success) {
        setAllTags(tagsResponse.data);
      }
      if (contactTagsResponse.success) {
        setContactTags(contactTagsResponse.data);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur lors du chargement des tags');
    } finally {
      setLoading(false);
    }
  };

  const handleAssignTag = async (tagId: string) => {
    setProcessing(tagId);
    setError(null);
    try {
      const response = await assignTag(tenantId, contactId, tagId);
      if (response.success) {
        // Reload contact tags
        const contactTagsResponse = await getContactTags(tenantId, contactId);
        if (contactTagsResponse.success) {
          setContactTags(contactTagsResponse.data);
        }
        onTagsUpdated?.();
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur lors de l\'assignation du tag');
    } finally {
      setProcessing(null);
    }
  };

  const handleRemoveTag = async (tagId: string) => {
    setProcessing(tagId);
    setError(null);
    try {
      const response = await removeTag(tenantId, contactId, tagId);
      if (response.success) {
        // Reload contact tags
        const contactTagsResponse = await getContactTags(tenantId, contactId);
        if (contactTagsResponse.success) {
          setContactTags(contactTagsResponse.data);
        }
        onTagsUpdated?.();
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur lors de la suppression du tag');
    } finally {
      setProcessing(null);
    }
  };

  const isTagAssigned = (tagId: string) => {
    return contactTags.some((tag) => tag.id === tagId);
  };

  const filteredTags = allTags.filter((tag) =>
    tag.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const availableTags = filteredTags.filter((tag) => !isTagAssigned(tag.id));
  const assignedTags = filteredTags.filter((tag) => isTagAssigned(tag.id));

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Gérer les tags</h2>
            <p className="text-sm text-gray-600 mt-1">{contactName}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
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
          ) : (
            <>
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <Input
                  type="text"
                  placeholder="Rechercher un tag..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>

              {/* Assigned Tags */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center">
                  <TagIcon className="h-5 w-5 mr-2" />
                  Tags assignés ({contactTags.length})
                </h3>
                {assignedTags.length === 0 ? (
                  <p className="text-gray-500 text-sm italic">
                    {searchTerm ? 'Aucun tag assigné ne correspond à votre recherche' : 'Aucun tag assigné'}
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {assignedTags.map((tag) => (
                      <div
                        key={tag.id}
                        className="inline-flex items-center px-3 py-2 rounded-lg text-sm font-medium shadow-sm"
                        style={{
                          backgroundColor: tag.color || '#3B82F6',
                          color: '#FFFFFF',
                        }}
                      >
                        <span>{tag.name}</span>
                        <button
                          onClick={() => handleRemoveTag(tag.id)}
                          disabled={processing === tag.id}
                          className="ml-2 hover:bg-white hover:bg-opacity-20 rounded-full p-1 transition-colors disabled:opacity-50"
                          title="Retirer ce tag"
                        >
                          {processing === tag.id ? (
                            <div className="h-3 w-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                          ) : (
                            <X className="h-3 w-3" />
                          )}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Available Tags */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center">
                  <Plus className="h-5 w-5 mr-2" />
                  Tags disponibles ({availableTags.length})
                </h3>
                {availableTags.length === 0 ? (
                  <p className="text-gray-500 text-sm italic">
                    {searchTerm
                      ? 'Aucun tag disponible ne correspond à votre recherche'
                      : 'Tous les tags sont déjà assignés'}
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {availableTags.map((tag) => (
                      <button
                        key={tag.id}
                        onClick={() => handleAssignTag(tag.id)}
                        disabled={processing === tag.id}
                        className="inline-flex items-center px-3 py-2 rounded-lg text-sm font-medium border-2 hover:shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        style={{
                          borderColor: tag.color || '#3B82F6',
                          color: tag.color || '#3B82F6',
                        }}
                      >
                        {processing === tag.id ? (
                          <>
                            <div
                              className="h-3 w-3 border-2 border-t-transparent rounded-full animate-spin mr-2"
                              style={{ borderColor: tag.color || '#3B82F6' }}
                            ></div>
                            <span>Ajout...</span>
                          </>
                        ) : (
                          <>
                            <Plus className="h-3 w-3 mr-1" />
                            <span>{tag.name}</span>
                          </>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex justify-end">
          <Button onClick={onClose}>Fermer</Button>
        </div>
      </div>
    </div>
  );
};
