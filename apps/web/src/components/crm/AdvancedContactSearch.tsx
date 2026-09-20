import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { App, Input, Button, Tag, Modal } from 'antd';
import { SearchOutlined, FilterOutlined, SaveOutlined, FolderOpenOutlined, DownloadOutlined } from '@ant-design/icons';
import contactSearchService, {
  type ContactSearchFilters,
  type ContactSearchResultItem
} from '../../services/contact-search.service';
import { ContactSearchResults } from './ContactSearchResults';
import { FilterBuilder } from './FilterBuilder';
import { SavedSearchesList } from './SavedSearchesList';
import { t } from '../../i18n/t';

interface AdvancedContactSearchProps {
  onSelectContacts?: (contacts: ContactSearchResultItem[]) => void;
  mode?: 'select' | 'view';
  multiSelect?: boolean;
}

function countActiveFilters(filters: Partial<ContactSearchFilters>): number {
  return Object.entries(filters).filter(([key, value]) => {
    if (value === undefined || value === null) return false;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === 'string') return value.trim() !== '';
    return true;
  }).length;
}

export function AdvancedContactSearch({
  onSelectContacts,
  mode = 'view',
  multiSelect = true
}: AdvancedContactSearchProps) {
  const { message } = App.useApp();

  const { tenantId } = useParams<{ tenantId: string }>();
  const [filters, setFilters] = useState<Partial<ContactSearchFilters>>({});
  const [results, setResults] = useState<{
    contacts: ContactSearchResultItem[];
    pagination: { total: number; page: number; limit: number; totalPages: number };
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedContacts, setSelectedContacts] = useState<ContactSearchResultItem[]>([]);
  const [filterModalOpen, setFilterModalOpen] = useState(false);
  const [savedModalOpen, setSavedModalOpen] = useState(false);

  const activeCount = countActiveFilters(filters);

  // Recherche initiale à l'ouverture pour afficher les contacts
  useEffect(() => {
    if (tenantId) {
      runSearch(1, 50);
    }
  }, [tenantId]);

  const runSearch = async (page = 1, limit = 50) => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const data = await contactSearchService.search(tenantId, {
        ...filters,
        page,
        limit
      });
      const contacts = Array.isArray(data?.contacts) ? data.contacts : [];
      const pagination = data?.pagination ?? { total: 0, page: 1, limit: 50, totalPages: 0 };
      setResults({ contacts, pagination });
    } catch {
      message.error(t('Recherche impossible'));
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => runSearch(1, results?.pagination.limit ?? 50);

  const handleApplyFilters = (newFilters: ContactSearchFilters) => {
    setFilters(newFilters);
    setFilterModalOpen(false);
    runSearch(1, results?.pagination.limit ?? 50);
  };

  const handleUseSavedSearch = async (searchId: string) => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const data = await contactSearchService.useSavedSearch(tenantId, searchId);
      const contacts = Array.isArray(data?.contacts) ? data.contacts : [];
      const pagination = data?.pagination ?? { total: 0, page: 1, limit: 50, totalPages: 0 };
      setResults({ contacts, pagination });
      setFilters(data?.appliedFilters || {});
      setSavedModalOpen(false);
    } catch {
      message.error(t('Impossible de charger la recherche'));
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSearch = async () => {
    if (!tenantId) return;
    const name = window.prompt(t('Nom de la recherche :'));
    if (!name?.trim()) return;
    try {
      await contactSearchService.saveSearch(tenantId, {
        name: name.trim(),
        filters: filters as ContactSearchFilters,
        scope: 'PERSONAL'
      });
      message.success(t('Recherche sauvegardée'));
    } catch {
      message.error(t('Sauvegarde impossible'));
    }
  };

  const handleExport = async () => {
    if (!tenantId) return;
    try {
      const blob = await contactSearchService.exportSearch(tenantId, filters as ContactSearchFilters);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `contacts-${Date.now()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      message.success(t('Export terminé'));
    } catch {
      message.error(t('Export impossible'));
    }
  };

  const removeFilter = (key: string) => {
    const next = { ...filters };
    delete next[key as keyof ContactSearchFilters];
    setFilters(next);
  };

  const handlePageChange = (page: number, limit: number) => {
    runSearch(page, limit);
  };

  const handleConfirmSelection = () => {
    onSelectContacts?.(selectedContacts);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <Input
          placeholder={t('Recherche rapide (nom, email, téléphone...)')}
          value={filters.searchQuery ?? ''}
          onChange={e => setFilters(prev => ({ ...prev, searchQuery: e.target.value }))}
          onPressEnter={handleSearch}
          style={{ maxWidth: 320 }}
          allowClear
        />
        <Button icon={<FilterOutlined />} onClick={() => setFilterModalOpen(true)}>
          {t('Filtres avancés')}
          {activeCount > 0 && <Tag style={{ marginInlineStart: 4 }}>{activeCount}</Tag>}
        </Button>
        <Button icon={<FolderOpenOutlined />} onClick={() => setSavedModalOpen(true)}>
          {t('Recherches sauvegardées')}
        </Button>
        <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch} loading={loading}>
          {t('Rechercher')}
        </Button>
      </div>

      {activeCount > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          {Object.entries(filters).map(([key, value]) => {
            if (value === undefined || value === null || (Array.isArray(value) && value.length === 0)) return null;
            const display = Array.isArray(value)
              ? value.join(', ')
              : typeof value === 'object'
                ? JSON.stringify(value)
                : String(value);
            const short = display.length > 35 ? display.slice(0, 35) + '…' : display;
            return <Tag key={key} closable onClose={() => removeFilter(key)}>{`${key}: ${short}`}</Tag>;
          })}
          <Button type="link" size="small" onClick={() => setFilters({})}>
            {t('Tout effacer')}
          </Button>
        </div>
      )}

      {results && (
        <>
          <div
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}
          >
            <span style={{ color: '#666' }}>
              {results.pagination.total} {t('contact(s) trouvé(s)')}
              {mode === 'select' &&
                selectedContacts.length > 0 &&
                t('· {{length}} sélectionné(s)', { length: selectedContacts.length })}
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              {activeCount > 0 && (
                <Button size="small" icon={<SaveOutlined />} onClick={handleSaveSearch}>
                  {t('Sauvegarder')}
                </Button>
              )}
              <Button size="small" icon={<DownloadOutlined />} onClick={handleExport}>
                {t('Exporter CSV')}
              </Button>
            </div>
          </div>

          <ContactSearchResults
            contacts={results.contacts}
            selectedContacts={selectedContacts}
            onSelectionChange={
              mode === 'select'
                ? selectedRows => {
                    const pageIds = new Set(results.contacts.map(c => c.id));
                    setSelectedContacts(prev => prev.filter(c => !pageIds.has(c.id)).concat(selectedRows));
                  }
                : undefined
            }
            mode={mode}
            multiSelect={multiSelect}
            loading={loading}
            pagination={results.pagination}
            onPageChange={handlePageChange}
          />

          {mode === 'select' && selectedContacts.length > 0 && (
            <div
              style={{
                padding: 16,
                background: '#fafafa',
                borderRadius: 8,
                display: 'flex',
                flexWrap: 'wrap',
                gap: 8,
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
            >
              <span style={{ fontWeight: 500 }}>
                {selectedContacts.length} {t('contact(s) sélectionné(s)')}
              </span>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button onClick={() => setSelectedContacts([])}>{t('Annuler')}</Button>
                <Button type="primary" onClick={handleConfirmSelection}>
                  {t('Confirmer la sélection')}
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      <Modal
        title={t('Filtres avancés')}
        open={filterModalOpen}
        onCancel={() => setFilterModalOpen(false)}
        footer={null}
        width={640}
        destroyOnClose
      >
        <FilterBuilder
          initialFilters={filters}
          onApply={handleApplyFilters}
          onCancel={() => setFilterModalOpen(false)}
        />
      </Modal>

      <Modal
        title={t('Recherches sauvegardées')}
        open={savedModalOpen}
        onCancel={() => setSavedModalOpen(false)}
        footer={null}
        width={520}
        destroyOnClose
      >
        <SavedSearchesList onSelectSearch={handleUseSavedSearch} onClose={() => setSavedModalOpen(false)} />
      </Modal>
    </div>
  );
}
