import React from 'react';
import { Select, Spin } from 'antd';
import type { SelectProps } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { listProperties } from '../../services/property-service';
import { listContacts } from '../../services/crm-service';
import { listDeals } from '../../services/crm-service';
import { getOwnerClients } from '../../services/tenant-service';
import { listMembers } from '../../services/membership-service';
import { queryKey, STALE_TIME } from '../../lib/query-keys';
import { contactLabel, propertyLabel } from './helpers';
import { t } from '../../i18n/t';

/**
 * Sélecteurs cherchables du lot 9 (ventes) — même réglage partout :
 * `showSearch` + `optionFilterProp="label"` (commits `151ca6c`, `e772a73`).
 *
 * Chaque sélecteur charge une liste bornée côté client plutôt qu'une
 * recherche serveur au fil de la frappe : les agences de démonstration ont un
 * portefeuille de quelques dizaines à quelques centaines d'entrées, et c'est
 * la même approche que les sélecteurs déjà en place (`LeaseManagementTermsCard`,
 * `PropertyOwnershipCard`).
 */

interface BaseSelectProps {
  tenantId: string;
  value?: string | null;
  onChange?: (value: string | null) => void;
  disabled?: boolean;
  placeholder?: string;
  style?: React.CSSProperties;
  id?: string;
  size?: SelectProps['size'];
}

/** Bien de l'agence — mandat de vente. */
export const PropertySelect: React.FC<BaseSelectProps> = ({
  tenantId,
  value,
  onChange,
  disabled,
  placeholder,
  style,
  id,
  size
}) => {
  const { data, isPending } = useQuery({
    queryKey: queryKey('properties-select', tenantId),
    queryFn: () => listProperties(tenantId, { limit: 500 }),
    enabled: Boolean(tenantId),
    staleTime: STALE_TIME.reference
  });

  const options = (data?.properties ?? []).map(property => ({
    value: property.id,
    label: propertyLabel(property)
  }));

  return (
    <Select
      id={id}
      size={size}
      style={style ?? { width: '100%' }}
      value={value ?? undefined}
      onChange={next => onChange?.(next ?? null)}
      allowClear
      placeholder={placeholder ?? t('Sélectionner un bien')}
      disabled={disabled}
      loading={isPending}
      notFoundContent={isPending ? <Spin size="small" /> : t('Aucun bien')}
      showSearch
      optionFilterProp="label"
      options={options}
    />
  );
};

/**
 * Vendeur — un `TenantClient` de type `OWNER` (décision P1 du lot 9). La liste
 * passe par `getOwnerClients` : elle rattrape les contacts convertis au rôle
 * Propriétaire avant que la conversion ne crée leur client (BUG-019).
 */
export const SellerClientSelect: React.FC<BaseSelectProps> = ({
  tenantId,
  value,
  onChange,
  disabled,
  placeholder,
  style,
  id,
  size
}) => {
  const { data, isPending } = useQuery({
    queryKey: queryKey('tenant-clients-owners', tenantId),
    queryFn: () => getOwnerClients(tenantId),
    enabled: Boolean(tenantId),
    staleTime: STALE_TIME.reference
  });

  const options = (data ?? []).map(client => ({
    value: client.id,
    label: `${client.user.fullName} (${client.user.email})`
  }));

  return (
    <Select
      id={id}
      size={size}
      style={style ?? { width: '100%' }}
      value={value ?? undefined}
      onChange={next => onChange?.(next ?? null)}
      allowClear
      placeholder={placeholder ?? t('Sélectionner un propriétaire')}
      disabled={disabled}
      loading={isPending}
      notFoundContent={isPending ? <Spin size="small" /> : t('Aucun propriétaire')}
      showSearch
      optionFilterProp="label"
      options={options}
    />
  );
};

/** Acquéreur — un contact CRM (P2 : un prospect n'a ni compte ni `TenantClient`). */
export const BuyerContactSelect: React.FC<BaseSelectProps> = ({
  tenantId,
  value,
  onChange,
  disabled,
  placeholder,
  style,
  id,
  size
}) => {
  const { data, isPending } = useQuery({
    queryKey: queryKey('crm-contacts-select', tenantId),
    queryFn: () => listContacts(tenantId, { limit: 500 }),
    enabled: Boolean(tenantId),
    staleTime: STALE_TIME.reference
  });

  const options = (data?.contacts ?? []).map(contact => ({ value: contact.id, label: contactLabel(contact) }));

  return (
    <Select
      id={id}
      size={size}
      style={style ?? { width: '100%' }}
      value={value ?? undefined}
      onChange={next => onChange?.(next ?? null)}
      allowClear
      placeholder={placeholder ?? t('Sélectionner un acquéreur')}
      disabled={disabled}
      loading={isPending}
      notFoundContent={isPending ? <Spin size="small" /> : t('Aucun contact')}
      showSearch
      optionFilterProp="label"
      options={options}
    />
  );
};

/** Négociateur — un collaborateur de l'agence. */
export const AgentSelect: React.FC<BaseSelectProps> = ({
  tenantId,
  value,
  onChange,
  disabled,
  placeholder,
  style,
  id,
  size
}) => {
  const { data, isPending } = useQuery({
    queryKey: queryKey('members-select', tenantId),
    queryFn: () => listMembers(tenantId, { limit: 500 }),
    enabled: Boolean(tenantId),
    staleTime: STALE_TIME.reference
  });

  const options = (data?.data.members ?? []).map(member => ({
    value: member.userId,
    label: member.user.fullName || member.user.email
  }));

  return (
    <Select
      id={id}
      size={size}
      style={style ?? { width: '100%' }}
      value={value ?? undefined}
      onChange={next => onChange?.(next ?? null)}
      allowClear
      placeholder={placeholder ?? t('Aucun négociateur')}
      disabled={disabled}
      loading={isPending}
      notFoundContent={isPending ? <Spin size="small" /> : t('Aucun collaborateur')}
      showSearch
      optionFilterProp="label"
      options={options}
    />
  );
};

/** Affaire CRM d'origine de l'offre — facultative. */
export const DealSelect: React.FC<BaseSelectProps> = ({
  tenantId,
  value,
  onChange,
  disabled,
  placeholder,
  style,
  id,
  size
}) => {
  const { data, isPending } = useQuery({
    queryKey: queryKey('crm-deals-select', tenantId),
    queryFn: () => listDeals(tenantId, { limit: 500 }),
    enabled: Boolean(tenantId),
    staleTime: STALE_TIME.reference
  });

  const options = (data?.deals ?? []).map(deal => ({
    value: deal.id,
    label: `${deal.type} · ${deal.stage}`
  }));

  return (
    <Select
      id={id}
      size={size}
      style={style ?? { width: '100%' }}
      value={value ?? undefined}
      onChange={next => onChange?.(next ?? null)}
      allowClear
      placeholder={placeholder ?? t('Aucune affaire liée')}
      disabled={disabled}
      loading={isPending}
      notFoundContent={isPending ? <Spin size="small" /> : t('Aucune affaire')}
      showSearch
      optionFilterProp="label"
      options={options}
    />
  );
};
