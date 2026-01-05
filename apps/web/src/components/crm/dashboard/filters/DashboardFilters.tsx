import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '../../../ui/button';
import { Select } from '../../../ui/select';
import { Badge } from '../../../ui/badge';
import { X, Plus, Filter } from 'lucide-react';
import { CrmDashboardFilters, FilterChip } from '../../../../types/crmDashboard';
import { getDateRangeForPeriod, getActiveFilterChips, formatDateRange } from '../../../../lib/utils/crmFilters';
import { CrmDealStage, CrmContactStatus } from '../../../../types/crm-types';
import { useAuth } from '../../../../hooks/useAuth';

interface DashboardFiltersProps {
  filters: CrmDashboardFilters;
  onFiltersChange: (filters: CrmDashboardFilters) => void;
  availableTags?: Array<{ id: string; name: string }>;
  availableCollaborators?: Array<{ id: string; name: string; email?: string }>;
}

const PERIOD_PRESETS = [
  { value: '7d', label: '7 derniers jours' },
  { value: '30d', label: '30 derniers jours' },
  { value: '90d', label: '90 derniers jours' },
  { value: '6m', label: '6 derniers mois' },
  { value: '1y', label: '1 an' },
  { value: 'thisMonth', label: 'Ce mois' },
  { value: 'custom', label: 'Personnalisé' },
] as const;

const DEAL_STAGES: Array<{ value: CrmDealStage; label: string }> = [
  { value: 'NEW', label: 'Nouveau' },
  { value: 'QUALIFIED', label: 'Qualifié' },
  { value: 'APPOINTMENT', label: 'RDV' },
  { value: 'VISIT', label: 'Visite' },
  { value: 'NEGOTIATION', label: 'Négociation' },
  { value: 'WON', label: 'Gagné' },
  { value: 'LOST', label: 'Perdu' },
];

const CONTACT_STATUSES: Array<{ value: CrmContactStatus; label: string }> = [
  { value: 'LEAD', label: 'Lead' },
  { value: 'ACTIVE_CLIENT', label: 'Client actif' },
  { value: 'ARCHIVED', label: 'Archivé' },
];

export const DashboardFilters: React.FC<DashboardFiltersProps> = ({
  filters,
  onFiltersChange,
  availableTags = [],
  availableCollaborators = [],
}) => {
  const { user } = useAuth();
  const [selectedPeriod, setSelectedPeriod] = useState<'7d' | '30d' | '90d' | '6m' | '1y' | 'thisMonth' | 'custom'>('30d');
  const [showFilters, setShowFilters] = useState(false);

  // Initialize period from filters
  useEffect(() => {
    if (filters.start && filters.end) {
      const start = new Date(filters.start);
      const end = new Date(filters.end);
      const now = new Date();
      const daysDiff = Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      const monthsDiff = Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 30));

      if (daysDiff === 7) setSelectedPeriod('7d');
      else if (daysDiff === 30) setSelectedPeriod('30d');
      else if (daysDiff === 90) setSelectedPeriod('90d');
      else if (monthsDiff === 6) setSelectedPeriod('6m');
      else if (daysDiff >= 365 && daysDiff <= 366) setSelectedPeriod('1y');
      else if (start.getDate() === 1 && start.getMonth() === now.getMonth()) setSelectedPeriod('thisMonth');
      else setSelectedPeriod('custom');
    }
  }, [filters.start, filters.end]);

  const handlePeriodChange = (period: typeof selectedPeriod) => {
    setSelectedPeriod(period);
    if (period !== 'custom') {
      const { start, end } = getDateRangeForPeriod(period);
      onFiltersChange({
        ...filters,
        start: start.toISOString(),
        end: end.toISOString(),
      });
    }
  };

  const handleAssigneeChange = (assignee: string) => {
    onFiltersChange({
      ...filters,
      assignee: assignee === 'all' ? undefined : assignee,
    });
  };

  const handleTagToggle = (tagId: string) => {
    const currentTags = filters.tags || [];
    const newTags = currentTags.includes(tagId)
      ? currentTags.filter((id) => id !== tagId)
      : [...currentTags, tagId];
    onFiltersChange({
      ...filters,
      tags: newTags.length > 0 ? newTags : undefined,
    });
  };

  const handleStageToggle = (stage: CrmDealStage) => {
    const currentStages = filters.stages || [];
    const newStages = currentStages.includes(stage)
      ? currentStages.filter((s) => s !== stage)
      : [...currentStages, stage];
    onFiltersChange({
      ...filters,
      stages: newStages.length > 0 ? newStages : undefined,
    });
  };

  const handleStatusToggle = (status: CrmContactStatus) => {
    const currentStatuses = filters.statuses || [];
    const newStatuses = currentStatuses.includes(status)
      ? currentStatuses.filter((s) => s !== status)
      : [...currentStatuses, status];
    onFiltersChange({
      ...filters,
      statuses: newStatuses.length > 0 ? newStatuses : undefined,
    });
  };

  const removeFilter = (key: string) => {
    if (key === 'dateRange') {
      onFiltersChange({
        ...filters,
        start: undefined,
        end: undefined,
      });
      setSelectedPeriod('30d');
    } else if (key === 'assignee') {
      onFiltersChange({
        ...filters,
        assignee: undefined,
      });
    } else if (key.startsWith('tag-')) {
      const tagId = key.replace('tag-', '');
      handleTagToggle(tagId);
    } else if (key.startsWith('stage-')) {
      const stage = key.replace('stage-', '') as CrmDealStage;
      handleStageToggle(stage);
    } else if (key.startsWith('status-')) {
      const status = key.replace('status-', '') as CrmContactStatus;
      handleStatusToggle(status);
    }
  };

  const resetFilters = () => {
    const { start, end } = getDateRangeForPeriod('30d');
    onFiltersChange({
      start: start.toISOString(),
      end: end.toISOString(),
      assignee: undefined,
      tags: undefined,
      stages: undefined,
      statuses: undefined,
    });
    setSelectedPeriod('30d');
  };

  const activeChips = getActiveFilterChips(filters, {
    stageLabels: Object.fromEntries(DEAL_STAGES.map((s) => [s.value, s.label])) as Record<CrmDealStage, string>,
    statusLabels: Object.fromEntries(CONTACT_STATUSES.map((s) => [s.value, s.label])) as Record<CrmContactStatus, string>,
    tagLabels: Object.fromEntries(availableTags.map((t) => [t.id, t.name])),
    userLabels: Object.fromEntries(availableCollaborators.map((c) => [c.id, c.name || c.email || ''])),
  });

  const hasActiveFilters = activeChips.length > 0;

  return (
    <div className="space-y-4 bg-white p-4 rounded-lg border border-slate-200 sticky top-0 z-10 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4 flex-wrap">
          {/* Period Selector */}
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-slate-700">Période:</label>
            <select
              value={selectedPeriod}
              onChange={(e) => handlePeriodChange(e.target.value as typeof selectedPeriod)}
              className="px-3 py-1.5 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {PERIOD_PRESETS.map((preset) => (
                <option key={preset.value} value={preset.value}>
                  {preset.label}
                </option>
              ))}
            </select>
          </div>

          {/* Assignee Selector */}
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-slate-700">Collaborateur:</label>
            <select
              value={filters.assignee || 'all'}
              onChange={(e) => handleAssigneeChange(e.target.value)}
              className="px-3 py-1.5 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">Tous</option>
              <option value="me">Moi</option>
              {availableCollaborators.map((collab) => (
                <option key={collab.id} value={collab.id}>
                  {collab.name || collab.email}
                </option>
              ))}
            </select>
          </div>

          {/* Filter Toggle */}
          <Button
            variant={showFilters ? 'default' : 'outline'}
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter className="h-4 w-4 mr-2" />
            Filtres avancés
          </Button>

          {/* Quick Actions */}
          <div className="flex items-center gap-2 ml-auto">
            <Button variant="outline" size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Contact
            </Button>
            <Button variant="outline" size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Affaire
            </Button>
            <Button variant="outline" size="sm">
              <Plus className="h-4 w-4 mr-2" />
              RDV
            </Button>
            <Button variant="outline" size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Suivi
            </Button>
          </div>
        </div>
      </div>

      {/* Active Filter Chips */}
      <AnimatePresence>
        {hasActiveFilters && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="flex items-center gap-2 flex-wrap"
          >
            <span className="text-xs font-medium text-slate-600">Filtres actifs:</span>
            {activeChips.map((chip) => (
              <Badge
                key={chip.key}
                variant="secondary"
                className="flex items-center gap-1 cursor-pointer hover:bg-slate-200"
                onClick={() => removeFilter(chip.key)}
              >
                {chip.label}: {chip.value}
                <X className="h-3 w-3" />
              </Badge>
            ))}
            <Button variant="ghost" size="sm" onClick={resetFilters} className="text-xs">
              Réinitialiser
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Advanced Filters */}
      <AnimatePresence>
        {showFilters && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="border-t border-slate-200 pt-4 mt-4"
          >
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Tags */}
              <div>
                <label className="text-sm font-medium text-slate-700 mb-2 block">Tags</label>
                <div className="flex flex-wrap gap-2">
                  {availableTags.map((tag) => (
                    <Badge
                      key={tag.id}
                      variant={filters.tags?.includes(tag.id) ? 'default' : 'outline'}
                      className="cursor-pointer"
                      onClick={() => handleTagToggle(tag.id)}
                    >
                      {tag.name}
                    </Badge>
                  ))}
                </div>
              </div>

              {/* Stages */}
              <div>
                <label className="text-sm font-medium text-slate-700 mb-2 block">Étapes pipeline</label>
                <div className="flex flex-wrap gap-2">
                  {DEAL_STAGES.map((stage) => (
                    <Badge
                      key={stage.value}
                      variant={filters.stages?.includes(stage.value) ? 'default' : 'outline'}
                      className="cursor-pointer"
                      onClick={() => handleStageToggle(stage.value)}
                    >
                      {stage.label}
                    </Badge>
                  ))}
                </div>
              </div>

              {/* Statuses */}
              <div>
                <label className="text-sm font-medium text-slate-700 mb-2 block">Statuts contacts</label>
                <div className="flex flex-wrap gap-2">
                  {CONTACT_STATUSES.map((status) => (
                    <Badge
                      key={status.value}
                      variant={filters.statuses?.includes(status.value) ? 'default' : 'outline'}
                      className="cursor-pointer"
                      onClick={() => handleStatusToggle(status.value)}
                    >
                      {status.label}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

