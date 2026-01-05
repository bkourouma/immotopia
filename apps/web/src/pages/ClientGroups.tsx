import React, { useState, useEffect } from 'react';
import { DashboardLayout } from '../components/dashboard/dashboard-layout';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Users, Plus, FolderOpen, Edit2, Trash2, Tag as TagIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { listTags, createTag, listContacts, CrmTag } from '../services/crm-service';

export const ClientGroups: React.FC = () => {
  const navigate = useNavigate();
  const { tenantMembership } = useAuth();
  const [tags, setTags] = useState<CrmTag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#3B82F6');
  const [creating, setCreating] = useState(false);
  const [tagCounts, setTagCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    if (tenantMembership?.tenantId) {
      loadTags();
      loadTagCounts();
    }
  }, [tenantMembership?.tenantId]);

  const loadTags = async () => {
    if (!tenantMembership?.tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await listTags(tenantMembership.tenantId);
      if (response.success) {
        setTags(response.data);
      } else {
        setError('Erreur lors du chargement des groupes');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur lors du chargement des groupes');
    } finally {
      setLoading(false);
    }
  };

  const loadTagCounts = async () => {
    if (!tenantMembership?.tenantId) return;
    try {
      // Load all contacts with their tags to count
      const response = await listContacts(tenantMembership.tenantId, { limit: 1000 });
      if (response.success) {
        const counts: Record<string, number> = {};
        response.contacts.forEach(contact => {
          contact.tags?.forEach((tag: CrmTag) => {
            counts[tag.id] = (counts[tag.id] || 0) + 1;
          });
        });
        setTagCounts(counts);
      }
    } catch (err) {
      console.error('Error loading tag counts:', err);
    }
  };

  const handleCreateTag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantMembership?.tenantId || !newTagName.trim()) return;

    setCreating(true);
    setError(null);
    try {
      const response = await createTag(tenantMembership.tenantId, newTagName.trim(), newTagColor);
      if (response.success) {
        setTags([...tags, response.data]);
        setNewTagName('');
        setNewTagColor('#3B82F6');
        setShowCreateModal(false);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur lors de la création du groupe');
    } finally {
      setCreating(false);
    }
  };

  const handleViewGroup = (tagId: string) => {
    navigate(`/clients?tag=${tagId}`);
  };

  const predefinedColors = [
    '#3B82F6', // Blue
    '#10B981', // Green
    '#F59E0B', // Amber
    '#EF4444', // Red
    '#8B5CF6', // Purple
    '#EC4899', // Pink
    '#06B6D4', // Cyan
    '#F97316', // Orange
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Groupes de clients</h1>
            <p className="text-gray-600 mt-1">Organisez vos clients en groupes (tags) pour une meilleure gestion</p>
          </div>
          <Button onClick={() => setShowCreateModal(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Nouveau groupe
          </Button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
            {error}
          </div>
        )}

        {loading ? (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Chargement des groupes...</p>
          </div>
        ) : tags.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <FolderOpen className="h-16 w-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">Aucun groupe</h3>
            <p className="text-gray-600 mb-4">
              Créez votre premier groupe pour organiser vos clients
            </p>
            <Button onClick={() => setShowCreateModal(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Créer un groupe
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {tags.map((tag) => (
              <div
                key={tag.id}
                className="bg-white rounded-lg shadow hover:shadow-md transition-shadow p-6 cursor-pointer"
                onClick={() => handleViewGroup(tag.id)}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-12 h-12 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: tag.color || '#3B82F6' }}
                    >
                      <TagIcon className="h-6 w-6 text-white" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">{tag.name}</h3>
                      <p className="text-sm text-gray-500">
                        {tagCounts[tag.id] || 0} client{(tagCounts[tag.id] || 0) !== 1 ? 's' : ''}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Create Tag Modal */}
        {showCreateModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">Nouveau groupe</h2>
              <form onSubmit={handleCreateTag} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nom du groupe
                  </label>
                  <Input
                    type="text"
                    value={newTagName}
                    onChange={(e) => setNewTagName(e.target.value)}
                    placeholder="Ex: VIP, Nouveaux clients, etc."
                    required
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Couleur
                  </label>
                  <div className="flex gap-2 flex-wrap">
                    {predefinedColors.map((color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setNewTagColor(color)}
                        className={`w-10 h-10 rounded-lg border-2 ${
                          newTagColor === color ? 'border-gray-900' : 'border-transparent'
                        }`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </div>
                <div className="flex gap-3 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setShowCreateModal(false);
                      setNewTagName('');
                      setNewTagColor('#3B82F6');
                      setError(null);
                    }}
                    className="flex-1"
                  >
                    Annuler
                  </Button>
                  <Button type="submit" disabled={creating || !newTagName.trim()} className="flex-1">
                    {creating ? 'Création...' : 'Créer'}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};




