import React, { useState } from 'react';
import { Collapse, Input, Button, Checkbox, Select, Space } from 'antd';
import type { ContactSearchFilters } from '../../services/contact-search.service';
import { t as translate } from '../../i18n/t';
import { getContactRoleLabel, getContactStatusLabel, getMaturityLabel } from '../../utils/crm-utils';
import type { FilterReferences } from './contact-search-filter-labels';

interface FilterBuilderProps {
  initialFilters: Partial<ContactSearchFilters>;
  onApply: (filters: ContactSearchFilters) => void;
  onCancel: () => void;
  /** Communes, tags et collaborateurs, chargés une fois par l'écran de recherche. */
  references: FilterReferences;
}

// Fonctions (et non des constantes de module) : les libellés suivent la langue active.
const statusOptions = () =>
  ['LEAD', 'ACTIVE_CLIENT', 'ARCHIVED'].map(value => ({ value, label: getContactStatusLabel(value) }));

const typeOptions = () => [
  { value: 'PERSON', label: translate('Personne') },
  { value: 'COMPANY', label: translate('Société') }
];

const maturityOptions = () => ['COLD', 'WARM', 'HOT'].map(value => ({ value, label: getMaturityLabel(value) }));

const roleOptions = () =>
  ['PROPRIETAIRE', 'LOCATAIRE', 'COPROPRIETAIRE', 'ACQUEREUR'].map(value => ({
    value,
    label: getContactRoleLabel(value)
  }));

const dealTypeOptions = () => [
  { value: 'ACHAT', label: translate('Achat') },
  { value: 'LOCATION', label: translate('Location') },
  { value: 'VENTE', label: translate('Vente') },
  { value: 'GESTION', label: translate('Gestion') },
  { value: 'MANDAT', label: translate('Mandat') }
];

const borrowingOptions = () => [
  { value: 'YES', label: translate('Oui') },
  { value: 'NO', label: translate('Non') },
  { value: 'UNKNOWN', label: translate('Inconnu') }
];

export function FilterBuilder({ initialFilters, onApply, onCancel, references }: FilterBuilderProps) {
  const { tags, users, communes } = references;
  const [filters, setFilters] = useState<Partial<ContactSearchFilters>>(initialFilters || {});

  const update = (key: keyof ContactSearchFilters, value: unknown) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const handleApply = () => {
    onApply(filters as ContactSearchFilters);
  };

  return (
    <div>
      <Collapse defaultActiveKey={['identity', 'status', 'location']}>
        <Collapse.Panel header={translate('Identité et contact')} key="identity">
          <Space direction="vertical" style={{ width: '100%' }} size="small">
            <Input
              placeholder={translate('Prénom')}
              value={filters.firstName ?? ''}
              onChange={e => update('firstName', e.target.value || undefined)}
            />
            <Input
              placeholder={translate('Nom')}
              value={filters.lastName ?? ''}
              onChange={e => update('lastName', e.target.value || undefined)}
            />
            <Input
              placeholder={translate('Email')}
              value={filters.email ?? ''}
              onChange={e => update('email', e.target.value || undefined)}
            />
            <Input
              placeholder={translate('Téléphone')}
              value={filters.phone ?? ''}
              onChange={e => update('phone', e.target.value || undefined)}
            />
          </Space>
        </Collapse.Panel>

        <Collapse.Panel header={translate('Localisation')} key="location">
          <Space direction="vertical" style={{ width: '100%' }} size="small">
            <Select
              mode="multiple"
              placeholder={translate('Communes')}
              style={{ width: '100%' }}
              value={filters.communeIds ?? []}
              onChange={v => update('communeIds', v)}
              options={communes.map(c => ({ value: c.id, label: c.name }))}
              filterOption={(input, opt) => (opt?.label ?? '').toString().toLowerCase().includes(input.toLowerCase())}
              showSearch
            />
            <Input
              placeholder={translate('Ville')}
              value={filters.city ?? ''}
              onChange={e => update('city', e.target.value || undefined)}
            />
            <Input
              placeholder={translate('Quartier')}
              value={filters.district ?? ''}
              onChange={e => update('district', e.target.value || undefined)}
            />
          </Space>
        </Collapse.Panel>

        <Collapse.Panel header={translate('Statut et type')} key="status">
          <Space direction="vertical" style={{ width: '100%' }} size="small">
            <div>
              <div style={{ marginBottom: 4 }}>{translate('Statuts')}</div>
              <Checkbox.Group
                value={filters.statuses ?? []}
                onChange={v => update('statuses', v as string[])}
                options={statusOptions()}
              />
            </div>
            <div>
              <div style={{ marginBottom: 4 }}>{translate('Types')}</div>
              <Checkbox.Group
                value={filters.contactTypes ?? []}
                onChange={v => update('contactTypes', v as string[])}
                options={typeOptions()}
              />
            </div>
            <div>
              <div style={{ marginBottom: 4 }}>{translate('Maturité')}</div>
              <Checkbox.Group
                value={filters.maturityLevels ?? []}
                onChange={v => update('maturityLevels', v as string[])}
                options={maturityOptions()}
              />
            </div>
            <div>
              <div style={{ marginBottom: 4 }}>{translate('Rôles CRM')}</div>
              <Checkbox.Group
                value={filters.roles ?? []}
                onChange={v =>
                  update('roles', (v as string[]).length ? (v as ContactSearchFilters['roles']) : undefined)
                }
                options={roleOptions()}
              />
            </div>
          </Space>
        </Collapse.Panel>

        <Collapse.Panel header={translate('Projet immobilier')} key="project">
          <Space direction="vertical" style={{ width: '100%' }} size="small">
            <div>
              <div style={{ marginBottom: 4 }}>{translate("Types d'affaire")}</div>
              <Checkbox.Group
                value={filters.dealTypes ?? []}
                onChange={v => update('dealTypes', v as string[])}
                options={dealTypeOptions()}
              />
            </div>
            <Input
              type="number"
              placeholder={translate('Budget min (FCFA)')}
              value={filters.budgetMin ?? ''}
              onChange={e => update('budgetMin', e.target.value ? Number(e.target.value) : undefined)}
            />
            <Input
              type="number"
              placeholder={translate('Budget max (FCFA)')}
              value={filters.budgetMax ?? ''}
              onChange={e => update('budgetMax', e.target.value ? Number(e.target.value) : undefined)}
            />
            <Select
              mode="multiple"
              placeholder={translate('Zones cibles (communes recherchées)')}
              style={{ width: '100%' }}
              value={filters.targetCommuneIds ?? []}
              onChange={v => update('targetCommuneIds', v)}
              options={communes.map(c => ({ value: c.id, label: c.name }))}
              filterOption={(input, opt) => (opt?.label ?? '').toString().toLowerCase().includes(input.toLowerCase())}
              showSearch
            />
          </Space>
        </Collapse.Panel>

        <Collapse.Panel header={translate('Tags et assignation')} key="tags">
          <Space direction="vertical" style={{ width: '100%' }} size="small">
            <Select
              showSearch
              optionFilterProp="label"
              mode="multiple"
              placeholder={translate('Tags')}
              style={{ width: '100%' }}
              value={filters.tagIds ?? []}
              onChange={v => update('tagIds', v)}
              options={tags.map(t => ({ value: t.id, label: t.name }))}
            />
            <Checkbox
              checked={filters.hasAllTags === true}
              onChange={e => update('hasAllTags', e.target.checked || undefined)}
            >
              {translate('Doit avoir TOUS les tags (sinon au moins un)')}
            </Checkbox>
            <Select
              showSearch
              optionFilterProp="label"
              mode="multiple"
              placeholder={translate('Assigné à')}
              style={{ width: '100%' }}
              value={filters.assignedToUserIds ?? []}
              onChange={v => update('assignedToUserIds', v)}
              options={users.map(u => ({ value: u.id, label: u.fullName || u.id }))}
            />
            <Checkbox
              checked={filters.unassigned === true}
              onChange={e => update('unassigned', e.target.checked || undefined)}
            >
              {translate('Inclure les contacts non assignés')}
            </Checkbox>
          </Space>
        </Collapse.Panel>

        <Collapse.Panel header={translate('Informations financières')} key="financial">
          <Space direction="vertical" style={{ width: '100%' }} size="small">
            <Input
              type="number"
              placeholder={translate('Revenu min (FCFA)')}
              value={filters.incomeMin ?? ''}
              onChange={e => update('incomeMin', e.target.value ? Number(e.target.value) : undefined)}
            />
            <Input
              type="number"
              placeholder={translate('Revenu max (FCFA)')}
              value={filters.incomeMax ?? ''}
              onChange={e => update('incomeMax', e.target.value ? Number(e.target.value) : undefined)}
            />
            <div>
              <div style={{ marginBottom: 4 }}>{translate("Capacité d'emprunt")}</div>
              <Checkbox.Group
                value={filters.borrowingCapacities ?? []}
                onChange={v => update('borrowingCapacities', v as string[])}
                options={borrowingOptions()}
              />
            </div>
          </Space>
        </Collapse.Panel>

        <Collapse.Panel header={translate('Consentements')} key="consents">
          <Space direction="vertical">
            <Checkbox
              checked={filters.consentEmail === true}
              onChange={e => update('consentEmail', e.target.checked || undefined)}
            >
              {translate('Consentement Email')}
            </Checkbox>
            <Checkbox
              checked={filters.consentWhatsapp === true}
              onChange={e => update('consentWhatsapp', e.target.checked || undefined)}
            >
              {translate('Consentement WhatsApp')}
            </Checkbox>
            <Checkbox
              checked={filters.consentMarketing === true}
              onChange={e => update('consentMarketing', e.target.checked || undefined)}
            >
              {translate('Consentement Marketing')}
            </Checkbox>
          </Space>
        </Collapse.Panel>
      </Collapse>

      <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <Button onClick={onCancel}>{translate('Annuler')}</Button>
        <Button type="primary" onClick={handleApply}>
          {translate('Appliquer les filtres')}
        </Button>
      </div>
    </div>
  );
}
