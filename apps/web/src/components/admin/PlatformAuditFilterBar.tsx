import React, { useEffect, useMemo, useState } from 'react';
import { Button, Card, Col, DatePicker, Input, Row, Select, Typography } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { listTenants } from '../../services/tenant-service';
import {
  TENANT_AUDIT_CATEGORIES,
  TENANT_AUDIT_OUTCOMES,
  type TenantAuditActorType
} from '../../services/tenant-audit-service';
import {
  getAuditActorTypeLabelFr,
  getAuditCategoryLabelFr,
  getAuditOutcomeLabelFr
} from '../../constants/audit-labels';
import { dateFormat } from '../../i18n/format';
import { t } from '../../i18n/t';

const { Text } = Typography;
const { RangePicker } = DatePicker;

export type VisibilityChoice = 'ALL' | 'TENANT' | 'PLATFORM_ONLY';

/** État brut des champs (les deux champs texte sont appliqués après une courte temporisation par la page). */
export interface PlatformAuditFilterState {
  tenantId?: string;
  category?: string;
  outcome?: string;
  actorType?: string;
  visibility: VisibilityChoice;
  range: [string, string] | null;
  actionText: string;
  requestIdText: string;
}

export const EMPTY_AUDIT_FILTERS: PlatformAuditFilterState = {
  visibility: 'ALL',
  range: null,
  actionText: '',
  requestIdText: ''
};

const ACTOR_TYPES: TenantAuditActorType[] = ['USER', 'SUPER_ADMIN', 'PORTAL', 'SYSTEM', 'AI'];
const TENANT_SEARCH_DELAY_MS = 300;
const TENANT_PAGE_SIZE = 20;

interface TenantOption {
  value: string;
  label: string;
}

/** Agences proposées par la liste déroulante : recherche côté serveur, l'agence choisie reste proposée. */
function useTenantOptions(selectedId: string | undefined) {
  const [search, setSearch] = useState('');
  const [found, setFound] = useState<TenantOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<TenantOption | null>(null);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      setLoading(true);
      listTenants({ search: search.trim() || undefined, page: 1, limit: TENANT_PAGE_SIZE })
        .then(response => {
          if (!cancelled) setFound(response.data.tenants.map(tenant => ({ value: tenant.id, label: tenant.name })));
        })
        .catch(() => {
          if (!cancelled) setFound([]);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, TENANT_SEARCH_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [search]);

  const options = useMemo(() => {
    const keep = selected && selected.value === selectedId && !found.some(o => o.value === selected.value);
    return keep ? [selected, ...found] : found;
  }, [found, selected, selectedId]);

  const remember = (value: string | undefined) => setSelected(options.find(o => o.value === value) ?? null);
  return { options, loading, setSearch, remember };
}

interface FilterBarProps {
  value: PlatformAuditFilterState;
  onChange: (patch: Partial<PlatformAuditFilterState>) => void;
  onReset: () => void;
  hasFilters: boolean;
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text strong style={{ display: 'block', marginBottom: 8 }}>
      {children}
    </Text>
  );
}

function enumOptions(values: readonly string[], label: (value: string) => string) {
  return values.map(value => ({ value, label: label(value) }));
}

export const PlatformAuditFilterBar: React.FC<FilterBarProps> = ({ value, onChange, onReset, hasFilters }) => {
  const tenants = useTenantOptions(value.tenantId);
  const visibilityOptions = [
    { value: 'ALL', label: t('Toutes') },
    { value: 'TENANT', label: t("Visibles de l'agence") },
    { value: 'PLATFORM_ONLY', label: t('Réservées à la plateforme') }
  ];

  return (
    <Card>
      <Row gutter={[16, 16]} align="bottom">
        <Col xs={24} sm={12} md={8}>
          <FieldLabel>{t('Agence')}</FieldLabel>
          <Select
            style={{ width: '100%' }}
            showSearch
            filterOption={false}
            placeholder={t('Toutes les agences')}
            aria-label={t('Agence')}
            value={value.tenantId}
            loading={tenants.loading}
            options={tenants.options}
            onSearch={tenants.setSearch}
            onChange={id => {
              tenants.remember(id);
              onChange({ tenantId: id });
            }}
            allowClear
          />
        </Col>
        <Col xs={24} sm={12} md={4}>
          <FieldLabel>{t('Catégorie')}</FieldLabel>
          <Select
            style={{ width: '100%' }}
            placeholder={t('Toutes les catégories')}
            aria-label={t('Catégorie')}
            value={value.category}
            onChange={category => onChange({ category })}
            options={enumOptions(TENANT_AUDIT_CATEGORIES, getAuditCategoryLabelFr)}
            allowClear
          />
        </Col>
        <Col xs={24} sm={12} md={4}>
          <FieldLabel>{t('Résultat')}</FieldLabel>
          <Select
            style={{ width: '100%' }}
            placeholder={t('Tous les résultats')}
            aria-label={t('Résultat')}
            value={value.outcome}
            onChange={outcome => onChange({ outcome })}
            options={enumOptions(TENANT_AUDIT_OUTCOMES, getAuditOutcomeLabelFr)}
            allowClear
          />
        </Col>
        <Col xs={24} sm={12} md={4}>
          <FieldLabel>{t("Type d'acteur")}</FieldLabel>
          <Select
            style={{ width: '100%' }}
            placeholder={t('Tous les acteurs')}
            aria-label={t("Type d'acteur")}
            value={value.actorType}
            onChange={actorType => onChange({ actorType })}
            options={enumOptions(ACTOR_TYPES, getAuditActorTypeLabelFr)}
            allowClear
          />
        </Col>
        <Col xs={24} sm={12} md={4}>
          <FieldLabel>{t('Visibilité')}</FieldLabel>
          <Select
            style={{ width: '100%' }}
            aria-label={t('Visibilité')}
            value={value.visibility}
            onChange={visibility => onChange({ visibility })}
            options={visibilityOptions}
          />
        </Col>
        <Col xs={24} sm={12} md={8}>
          <FieldLabel>{t('Période')}</FieldLabel>
          <RangePicker
            style={{ width: '100%' }}
            value={value.range ? [dayjs(value.range[0]), dayjs(value.range[1])] : null}
            onChange={dates =>
              onChange({
                range: dates?.[0] && dates[1] ? [dates[0].format('YYYY-MM-DD'), dates[1].format('YYYY-MM-DD')] : null
              })
            }
            format={dateFormat('short')}
          />
        </Col>
        <Col xs={24} sm={12} md={6}>
          <FieldLabel>{t('Action')}</FieldLabel>
          <Input
            placeholder={t('Clé exacte, ex. PROPERTY_CREATED')}
            aria-label={t('Action')}
            value={value.actionText}
            onChange={e => onChange({ actionText: e.target.value.toUpperCase() })}
            allowClear
          />
        </Col>
        <Col xs={24} sm={12} md={6}>
          <FieldLabel>{t('Identifiant de requête')}</FieldLabel>
          <Input
            placeholder={t('Identifiant de requête')}
            aria-label={t('Identifiant de requête')}
            value={value.requestIdText}
            onChange={e => onChange({ requestIdText: e.target.value })}
            allowClear
          />
        </Col>
        <Col xs={24} sm={12} md={4}>
          <Button icon={<ReloadOutlined />} onClick={onReset} disabled={!hasFilters} block>
            {t('Réinitialiser')}
          </Button>
        </Col>
      </Row>
    </Card>
  );
};
