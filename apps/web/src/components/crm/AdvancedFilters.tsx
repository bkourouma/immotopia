import React, { useState, useEffect } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { X, Filter, ChevronDown, ChevronUp } from 'lucide-react';
import { listMembers, Member } from '../../services/membership-service';

export interface AdvancedFilterConfig {
  showDateRange?: boolean;
  showAssignedTo?: boolean;
  showSource?: boolean;
  showBudget?: boolean;
  showStatus?: boolean;
  showType?: boolean;
  dateRangeLabel?: string;
  assignedToLabel?: string;
  sourceLabel?: string;
  budgetLabel?: string;
  statusLabel?: string;
  typeLabel?: string;
  statusOptions?: Array<{ value: string; label: string }>;
  typeOptions?: Array<{ value: string; label: string }>;
}

export interface AdvancedFilters {
  startDate?: string;
  endDate?: string;
  assignedTo?: string;
  source?: string;
  budgetMin?: number;
  budgetMax?: number;
  status?: string;
  type?: string;
}

interface AdvancedFiltersProps {
  tenantId?: string;
  config: AdvancedFilterConfig;
  filters: AdvancedFilters;
  onFiltersChange: (filters: AdvancedFilters) => void;
  onClear?: () => void;
}

export const AdvancedFilters: React.FC<AdvancedFiltersProps> = ({
  tenantId,
  config,
  filters,
  onFiltersChange,
  onClear,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);

  useEffect(() => {
    if (config.showAssignedTo && tenantId) {
      loadMembers();
    }
  }, [tenantId, config.showAssignedTo]);

  const loadMembers = async () => {
    if (!tenantId) return;
    setLoadingMembers(true);
    try {
      const response = await listMembers(tenantId, { status: 'ACTIVE', limit: 100 });
      if (response.success) {
        setMembers(response.data.members);
      }
    } catch (err) {
      console.error('Error loading members:', err);
    } finally {
      setLoadingMembers(false);
    }
  };

  const updateFilter = (key: keyof AdvancedFilters, value: any) => {
    onFiltersChange({
      ...filters,
      [key]: value || undefined,
    });
  };

  const clearFilters = () => {
    const cleared: AdvancedFilters = {};
    onFiltersChange(cleared);
    if (onClear) {
      onClear();
    }
  };

  const hasActiveFilters = Object.values(filters).some((v) => v !== undefined && v !== '');

  return (
    <div className="bg-white rounded-lg shadow border border-gray-200">
      <div className="flex items-center justify-between p-3 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-gray-500" />
          <span className="text-sm font-medium text-gray-700">Filtres avancés</span>
          {hasActiveFilters && (
            <span className="px-2 py-0.5 bg-blue-100 text-blue-800 text-xs font-medium rounded-full">
              {Object.values(filters).filter((v) => v !== undefined && v !== '').length} actif(s)
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearFilters}
              className="text-xs h-7"
            >
              <X className="h-3 w-3 mr-1" />
              Effacer
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsOpen(!isOpen)}
            className="text-xs h-7"
          >
            {isOpen ? (
              <>
                <ChevronUp className="h-3 w-3 mr-1" />
                Masquer
              </>
            ) : (
              <>
                <ChevronDown className="h-3 w-3 mr-1" />
                Afficher
              </>
            )}
          </Button>
        </div>
      </div>

      {isOpen && (
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Date Range */}
            {config.showDateRange && (
              <div className="space-y-2">
                <label className="text-xs font-medium text-gray-700">
                  {config.dateRangeLabel || 'Période'}
                </label>
                <div className="flex gap-2">
                  <Input
                    type="date"
                    value={filters.startDate || ''}
                    onChange={(e) => updateFilter('startDate', e.target.value)}
                    className="text-xs h-8"
                  />
                  <Input
                    type="date"
                    value={filters.endDate || ''}
                    onChange={(e) => updateFilter('endDate', e.target.value)}
                    className="text-xs h-8"
                  />
                </div>
              </div>
            )}

            {/* Assigned To */}
            {config.showAssignedTo && (
              <div className="space-y-2">
                <label className="text-xs font-medium text-gray-700">
                  {config.assignedToLabel || 'Assigné à'}
                </label>
                {loadingMembers ? (
                  <div className="text-xs text-gray-500">Chargement...</div>
                ) : (
                  <select
                    value={filters.assignedTo || ''}
                    onChange={(e) => updateFilter('assignedTo', e.target.value)}
                    className="w-full px-3 py-1.5 text-xs border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 h-8"
                  >
                    <option value="">Tous</option>
                    {members.map((member) => (
                      <option key={member.userId} value={member.userId}>
                        {member.user.fullName || member.user.email}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}

            {/* Source */}
            {config.showSource && (
              <div className="space-y-2">
                <label className="text-xs font-medium text-gray-700">
                  {config.sourceLabel || 'Source'}
                </label>
                <Input
                  type="text"
                  placeholder="Ex: Site web, Référence..."
                  value={filters.source || ''}
                  onChange={(e) => updateFilter('source', e.target.value)}
                  className="text-xs h-8"
                />
              </div>
            )}

            {/* Budget Range */}
            {config.showBudget && (
              <div className="space-y-2">
                <label className="text-xs font-medium text-gray-700">
                  {config.budgetLabel || 'Budget (FCFA)'}
                </label>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    placeholder="Min"
                    value={filters.budgetMin || ''}
                    onChange={(e) => updateFilter('budgetMin', e.target.value ? parseFloat(e.target.value) : undefined)}
                    className="text-xs h-8"
                  />
                  <Input
                    type="number"
                    placeholder="Max"
                    value={filters.budgetMax || ''}
                    onChange={(e) => updateFilter('budgetMax', e.target.value ? parseFloat(e.target.value) : undefined)}
                    className="text-xs h-8"
                  />
                </div>
              </div>
            )}

            {/* Status */}
            {config.showStatus && config.statusOptions && (
              <div className="space-y-2">
                <label className="text-xs font-medium text-gray-700">
                  {config.statusLabel || 'Statut'}
                </label>
                <select
                  value={filters.status || ''}
                  onChange={(e) => updateFilter('status', e.target.value)}
                  className="w-full px-3 py-1.5 text-xs border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 h-8"
                >
                  <option value="">Tous</option>
                  {config.statusOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Type */}
            {config.showType && config.typeOptions && (
              <div className="space-y-2">
                <label className="text-xs font-medium text-gray-700">
                  {config.typeLabel || 'Type'}
                </label>
                <select
                  value={filters.type || ''}
                  onChange={(e) => updateFilter('type', e.target.value)}
                  className="w-full px-3 py-1.5 text-xs border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 h-8"
                >
                  <option value="">Tous</option>
                  {config.typeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};





