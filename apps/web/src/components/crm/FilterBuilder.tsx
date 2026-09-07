import React, { useState, useEffect } from 'react';
import { Collapse, Input, Button, Checkbox, Select, Space } from 'antd';
import { useParams } from 'react-router-dom';
import { listTags } from '../../services/crm-service';
import { listMembers } from '../../services/membership-service';
import { getAllCommunes } from '../../services/geographic-service';
import type { ContactSearchFilters } from '../../services/contact-search.service';
import type { CrmTag } from '../../types/crm-types';

interface FilterBuilderProps {
  initialFilters: Partial<ContactSearchFilters>;
  onApply: (filters: ContactSearchFilters) => void;
  onCancel: () => void;
}

const STATUS_OPTIONS = [
  { value: 'LEAD', label: 'Lead' },
  { value: 'ACTIVE_CLIENT', label: 'Client actif' },
  { value: 'ARCHIVED', label: 'Archivé' }
];

const TYPE_OPTIONS = [
  { value: 'PERSON', label: 'Personne' },
  { value: 'COMPANY', label: 'Société' }
];

const MATURITY_OPTIONS = [
  { value: 'COLD', label: 'Froid' },
  { value: 'WARM', label: 'Tiède' },
  { value: 'HOT', label: 'Chaud' }
];

const DEAL_TYPE_OPTIONS = [
  { value: 'ACHAT', label: 'Achat' },
  { value: 'LOCATION', label: 'Location' },
  { value: 'VENTE', label: 'Vente' },
  { value: 'GESTION', label: 'Gestion' },
  { value: 'MANDAT', label: 'Mandat' }
];

const BORROWING_OPTIONS = [
  { value: 'YES', label: 'Oui' },
  { value: 'NO', label: 'Non' },
  { value: 'UNKNOWN', label: 'Inconnu' }
];

export function FilterBuilder({ initialFilters, onApply, onCancel }: FilterBuilderProps) {
  const { tenantId } = useParams<{ tenantId: string }>();
  const [filters, setFilters] = useState<Partial<ContactSearchFilters>>(initialFilters || {});
  const [tags, setTags] = useState<CrmTag[]>([]);
  const [users, setUsers] = useState<Array<{ id: string; fullName: string | null }>>([]);
  const [communes, setCommunes] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    if (!tenantId) return;
    listTags(tenantId)
      .then((r) => setTags(r.data || []))
      .catch(() => {});
    listMembers(tenantId)
      .then((r) => setUsers((r.data?.members || []).map((m) => ({ id: m.userId, fullName: m.user?.fullName ?? m.user?.email ?? null }))))
      .catch(() => {});
    getAllCommunes()
      .then((list) => setCommunes(list.map((c) => ({ id: c.communeId, name: c.displayName || c.commune }))))
      .catch(() => {});
  }, [tenantId]);

  const update = (key: keyof ContactSearchFilters, value: unknown) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const handleApply = () => {
    onApply(filters as ContactSearchFilters);
  };

  return (
    <div>
      <Collapse defaultActiveKey={['identity', 'status', 'location']}>
        <Collapse.Panel header="Identité et contact" key="identity">
          <Space direction="vertical" style={{ width: '100%' }} size="small">
            <Input
              placeholder="Prénom"
              value={filters.firstName ?? ''}
              onChange={(e) => update('firstName', e.target.value || undefined)}
            />
            <Input
              placeholder="Nom"
              value={filters.lastName ?? ''}
              onChange={(e) => update('lastName', e.target.value || undefined)}
            />
            <Input
              placeholder="Email"
              value={filters.email ?? ''}
              onChange={(e) => update('email', e.target.value || undefined)}
            />
            <Input
              placeholder="Téléphone"
              value={filters.phone ?? ''}
              onChange={(e) => update('phone', e.target.value || undefined)}
            />
          </Space>
        </Collapse.Panel>

        <Collapse.Panel header="Localisation" key="location">
          <Space direction="vertical" style={{ width: '100%' }} size="small">
            <Select
              mode="multiple"
              placeholder="Communes"
              style={{ width: '100%' }}
              value={filters.communeIds ?? []}
              onChange={(v) => update('communeIds', v)}
              options={communes.map((c) => ({ value: c.id, label: c.name }))}
              filterOption={(input, opt) =>
                (opt?.label ?? '').toString().toLowerCase().includes(input.toLowerCase())
              }
              showSearch
            />
            <Input
              placeholder="Ville"
              value={filters.city ?? ''}
              onChange={(e) => update('city', e.target.value || undefined)}
            />
            <Input
              placeholder="Quartier"
              value={filters.district ?? ''}
              onChange={(e) => update('district', e.target.value || undefined)}
            />
          </Space>
        </Collapse.Panel>

        <Collapse.Panel header="Statut et type" key="status">
          <Space direction="vertical" style={{ width: '100%' }} size="small">
            <div>
              <div style={{ marginBottom: 4 }}>Statuts</div>
              <Checkbox.Group
                value={filters.statuses ?? []}
                onChange={(v) => update('statuses', v as string[])}
                options={STATUS_OPTIONS}
              />
            </div>
            <div>
              <div style={{ marginBottom: 4 }}>Types</div>
              <Checkbox.Group
                value={filters.contactTypes ?? []}
                onChange={(v) => update('contactTypes', v as string[])}
                options={TYPE_OPTIONS}
              />
            </div>
            <div>
              <div style={{ marginBottom: 4 }}>Maturité</div>
              <Checkbox.Group
                value={filters.maturityLevels ?? []}
                onChange={(v) => update('maturityLevels', v as string[])}
                options={MATURITY_OPTIONS}
              />
            </div>
          </Space>
        </Collapse.Panel>

        <Collapse.Panel header="Projet immobilier" key="project">
          <Space direction="vertical" style={{ width: '100%' }} size="small">
            <div>
              <div style={{ marginBottom: 4 }}>Types de deals</div>
              <Checkbox.Group
                value={filters.dealTypes ?? []}
                onChange={(v) => update('dealTypes', v as string[])}
                options={DEAL_TYPE_OPTIONS}
              />
            </div>
            <Input
              type="number"
              placeholder="Budget min (FCFA)"
              value={filters.budgetMin ?? ''}
              onChange={(e) => update('budgetMin', e.target.value ? Number(e.target.value) : undefined)}
            />
            <Input
              type="number"
              placeholder="Budget max (FCFA)"
              value={filters.budgetMax ?? ''}
              onChange={(e) => update('budgetMax', e.target.value ? Number(e.target.value) : undefined)}
            />
            <Select
              mode="multiple"
              placeholder="Zones cibles (communes recherchées)"
              style={{ width: '100%' }}
              value={filters.targetCommuneIds ?? []}
              onChange={(v) => update('targetCommuneIds', v)}
              options={communes.map((c) => ({ value: c.id, label: c.name }))}
              filterOption={(input, opt) =>
                (opt?.label ?? '').toString().toLowerCase().includes(input.toLowerCase())
              }
              showSearch
            />
          </Space>
        </Collapse.Panel>

        <Collapse.Panel header="Tags et assignation" key="tags">
          <Space direction="vertical" style={{ width: '100%' }} size="small">
            <Select
              mode="multiple"
              placeholder="Tags"
              style={{ width: '100%' }}
              value={filters.tagIds ?? []}
              onChange={(v) => update('tagIds', v)}
              options={tags.map((t) => ({ value: t.id, label: t.name }))}
            />
            <Checkbox
              checked={filters.hasAllTags === true}
              onChange={(e) => update('hasAllTags', e.target.checked || undefined)}
            >
              Doit avoir TOUS les tags (sinon au moins un)
            </Checkbox>
            <Select
              mode="multiple"
              placeholder="Assigné à"
              style={{ width: '100%' }}
              value={filters.assignedToUserIds ?? []}
              onChange={(v) => update('assignedToUserIds', v)}
              options={users.map((u) => ({ value: u.id, label: u.fullName || u.id }))}
            />
            <Checkbox
              checked={filters.unassigned === true}
              onChange={(e) => update('unassigned', e.target.checked || undefined)}
            >
              Inclure les contacts non assignés
            </Checkbox>
          </Space>
        </Collapse.Panel>

        <Collapse.Panel header="Informations financières" key="financial">
          <Space direction="vertical" style={{ width: '100%' }} size="small">
            <Input
              type="number"
              placeholder="Revenu min (FCFA)"
              value={filters.incomeMin ?? ''}
              onChange={(e) => update('incomeMin', e.target.value ? Number(e.target.value) : undefined)}
            />
            <Input
              type="number"
              placeholder="Revenu max (FCFA)"
              value={filters.incomeMax ?? ''}
              onChange={(e) => update('incomeMax', e.target.value ? Number(e.target.value) : undefined)}
            />
            <div>
              <div style={{ marginBottom: 4 }}>Capacité d&apos;emprunt</div>
              <Checkbox.Group
                value={filters.borrowingCapacities ?? []}
                onChange={(v) => update('borrowingCapacities', v as string[])}
                options={BORROWING_OPTIONS}
              />
            </div>
          </Space>
        </Collapse.Panel>

        <Collapse.Panel header="Consentements" key="consents">
          <Space direction="vertical">
            <Checkbox
              checked={filters.consentEmail === true}
              onChange={(e) => update('consentEmail', e.target.checked || undefined)}
            >
              Consentement Email
            </Checkbox>
            <Checkbox
              checked={filters.consentWhatsapp === true}
              onChange={(e) => update('consentWhatsapp', e.target.checked || undefined)}
            >
              Consentement WhatsApp
            </Checkbox>
            <Checkbox
              checked={filters.consentMarketing === true}
              onChange={(e) => update('consentMarketing', e.target.checked || undefined)}
            >
              Consentement Marketing
            </Checkbox>
          </Space>
        </Collapse.Panel>
      </Collapse>

      <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <Button onClick={onCancel}>Annuler</Button>
        <Button type="primary" onClick={handleApply}>
          Appliquer les filtres
        </Button>
      </div>
    </div>
  );
}
