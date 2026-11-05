import React from 'react';
import { Select, Spin } from 'antd';
import type { SelectProps } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { getProperty, listProperties } from '../../services/property-service';
import { getContact, listContacts, listDeals } from '../../services/crm-service';
import { getOwnerClients } from '../../services/tenant-service';
import { listAssignableMembers } from '../../services/membership-service';
import { queryKey, STALE_TIME } from '../../lib/query-keys';
import { contactLabel, propertyLabel } from './helpers';
import { t } from '../../i18n/t';
import { dealSummaryLabel } from '../../utils/crm-labels';
import { contactDisplayName } from '../../utils/contact-display';
import { formatMoney } from '../../components/primitives';
import { REMOTE_SELECT_LIMIT, RemoteSelect } from './remote-select';

/**
 * Sélecteurs cherchables du lot 9 (ventes).
 *
 * - Bien et acquéreur (entités nombreuses) : recherche DISTANTE (`RemoteSelect`,
 *   20 options au plus, requête 300 ms après la frappe, libellé d'une valeur
 *   préremplie retrouvé par son identifiant). Plus de `limit: 500`.
 * - Vendeur et négociateur : listes courtes de l'agence (propriétaires,
 *   collaborateurs) chargées d'un bloc, filtrées dans le navigateur
 *   (`showSearch` + `optionFilterProp="label"`).
 * - Affaire CRM : l'API des affaires n'a ni recherche texte ni libellé
 *   consolidé ; elle reste filtrée par acquéreur (voir `DealSelect`).
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

/** Bien de l'agence — mandat de vente (recherche distante : `q` = titre, adresse, référence). */
export const PropertySelect: React.FC<BaseSelectProps> = ({ placeholder, tenantId, ...rest }) => (
  <RemoteSelect
    {...rest}
    tenantId={tenantId}
    scope="properties-select"
    placeholder={placeholder ?? t('Sélectionner un bien')}
    notFound={t('Aucun bien')}
    load={async term => {
      const { properties } = await listProperties(tenantId, { q: term || undefined, limit: REMOTE_SELECT_LIMIT });
      return (properties ?? []).map(property => ({ value: property.id, label: propertyLabel(property) }));
    }}
    resolve={async id => {
      const property = await getProperty(tenantId, id);
      return property ? propertyLabel(property) : undefined;
    }}
  />
);

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
    label: client.user.fullName?.trim() ? `${client.user.fullName} (${client.user.email})` : client.user.email
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

/** Acquéreur — un contact CRM (P2 : un prospect n'a ni compte ni `TenantClient`). Recherche distante (`search`). */
export const BuyerContactSelect: React.FC<BaseSelectProps> = ({ placeholder, tenantId, ...rest }) => (
  <RemoteSelect
    {...rest}
    tenantId={tenantId}
    scope="crm-contacts-select"
    placeholder={placeholder ?? t('Sélectionner un acquéreur')}
    notFound={t('Aucun contact')}
    load={async term => {
      const { contacts } = await listContacts(tenantId, { search: term || undefined, limit: REMOTE_SELECT_LIMIT });
      return (contacts ?? []).map(contact => ({ value: contact.id, label: contactLabel(contact) }));
    }}
    resolve={async id => {
      const { data } = await getContact(tenantId, id);
      return data ? contactLabel(data) : undefined;
    }}
  />
);

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
    queryFn: () => listAssignableMembers(tenantId),
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

/** Étapes d'une affaire qui ne peut plus donner lieu à une offre. */
const ETAPES_CLOSES = ['WON', 'LOST'];

interface DealOptionSource {
  type?: string | null;
  stage?: string | null;
  contact?: {
    firstName?: string | null;
    lastName?: string | null;
    legalName?: string | null;
    contactType?: string | null;
    email?: string | null;
  } | null;
  expectedValue?: number | null;
  budgetMin?: number | null;
  budgetMax?: number | null;
}

/** « Achat — Négociation — Aminata Coulibaly — 40 000 000 FCFA ». */
export function dealOptionLabel(deal: DealOptionSource): string {
  const montant =
    deal.expectedValue ??
    (deal.budgetMin != null && deal.budgetMax != null && deal.budgetMin !== deal.budgetMax
      ? null
      : (deal.budgetMax ?? deal.budgetMin));
  const budget =
    montant != null
      ? formatMoney(montant)
      : deal.budgetMin != null && deal.budgetMax != null
        ? `${formatMoney(deal.budgetMin, { currency: null })} – ${formatMoney(deal.budgetMax)}`
        : '';
  return [dealSummaryLabel(deal.type, deal.stage), deal.contact ? contactDisplayName(deal.contact) : '', budget]
    .filter(Boolean)
    .join(' — ');
}

/**
 * Affaire CRM d'origine de l'offre — facultative. Seules les affaires
 * ouvertes (ni gagnées ni perdues) de l'acquéreur choisi sont proposées.
 */
export const DealSelect: React.FC<BaseSelectProps & { buyerContactId?: string | null }> = ({
  buyerContactId,
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
    queryKey: queryKey('crm-deals-select', tenantId, { buyerContactId: buyerContactId ?? null }),
    queryFn: () => listDeals(tenantId, { limit: 500, ...(buyerContactId ? { contactId: buyerContactId } : {}) }),
    enabled: Boolean(tenantId),
    staleTime: STALE_TIME.reference
  });

  const options = (data?.deals ?? [])
    .filter(deal => !ETAPES_CLOSES.includes(deal.stage) && (!buyerContactId || deal.contactId === buyerContactId))
    .map(deal => ({ value: deal.id, label: dealOptionLabel(deal as DealOptionSource) }));

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
