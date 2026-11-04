import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Select } from 'antd';
import type { SelectProps } from 'antd';
import { contactDisplayNameWithEmail } from '../../utils/contact-display';
import { dealStageLabel, dealTypeLabel } from '../../utils/crm-labels';
import { formatMoney } from '../primitives';
import { getContact, getDeal, listContacts, listDeals } from '../../services/crm-service';
import { t } from '../../i18n/t';

/** Nombre d'options demandées au serveur à chaque frappe. */
export const REMOTE_SELECT_LIMIT = 20;
/** Délai entre la dernière frappe et la requête. */
export const REMOTE_SELECT_DEBOUNCE_MS = 300;

export interface RemoteOption {
  value: string;
  label: string;
}

export interface RemoteSelectProps extends Pick<
  SelectProps<string>,
  'placeholder' | 'allowClear' | 'disabled' | 'style' | 'status' | 'id' | 'className' | 'notFoundContent'
> {
  value?: string | null;
  onChange?: (value: string | undefined) => void;
  /** Options correspondant à la saisie (le serveur filtre, `REMOTE_SELECT_LIMIT` au plus). */
  loadOptions: (search: string) => Promise<RemoteOption[]>;
  /** Libellé de l'option déjà choisie (édition, préremplissage) quand elle n'est pas dans les résultats. */
  loadSelected?: (id: string) => Promise<RemoteOption | null>;
  /** Relance la liste quand cette clé change (ex. le contact dont on choisit l'affaire). */
  reloadKey?: string;
  debounceMs?: number;
}

/**
 * Liste déroulante à recherche distante : jamais la liste entière.
 *
 * La liste est demandée à l'ouverture, puis à chaque frappe (après un court
 * délai) avec le texte saisi ; le serveur filtre. L'option déjà choisie garde
 * son libellé même quand la recherche ne la renvoie plus : il est lu une fois
 * puis conservé.
 */
export function RemoteSelect({
  value,
  onChange,
  loadOptions,
  loadSelected,
  reloadKey,
  debounceMs = REMOTE_SELECT_DEBOUNCE_MS,
  placeholder,
  allowClear,
  disabled,
  style,
  status,
  id,
  className,
  notFoundContent
}: RemoteSelectProps) {
  const [results, setResults] = useState<RemoteOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [, forceRender] = useState(0);
  // Libellés connus : résultats déjà vus et option choisie.
  const labels = useRef(new Map<string, string>());
  const requestId = useRef(0);
  const loadOptionsRef = useRef(loadOptions);
  loadOptionsRef.current = loadOptions;
  const loadSelectedRef = useRef(loadSelected);
  loadSelectedRef.current = loadSelected;

  // Une nouvelle clé (autre contact) : la liste précédente ne vaut plus.
  useEffect(() => {
    setResults([]);
    setOpen(false);
    setSearch('');
  }, [reloadKey]);

  // Requête filtrée : à l'ouverture, puis après un court délai à chaque saisie.
  useEffect(() => {
    if (!open || disabled) return undefined;
    const current = ++requestId.current;
    const timer = setTimeout(
      () => {
        setLoading(true);
        loadOptionsRef
          .current(search)
          .then(options => {
            if (current !== requestId.current) return;
            options.forEach(option => labels.current.set(option.value, option.label));
            setResults(options);
          })
          .catch(() => {
            if (current === requestId.current) setResults([]);
          })
          .finally(() => {
            if (current === requestId.current) setLoading(false);
          });
      },
      search === '' ? 0 : debounceMs
    );
    return () => clearTimeout(timer);
  }, [open, search, disabled, debounceMs, reloadKey]);

  // Option déjà choisie : son libellé est lu une fois.
  useEffect(() => {
    if (!value || labels.current.has(value) || !loadSelectedRef.current) return undefined;
    let cancelled = false;
    loadSelectedRef
      .current(value)
      .then(option => {
        if (cancelled || !option) return;
        labels.current.set(option.value, option.label);
        forceRender(n => n + 1);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [value]);

  const options = [...results];
  if (value && !options.some(option => option.value === value)) {
    options.unshift({ value, label: labels.current.get(value) ?? t('Chargement...') });
  }

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) setSearch('');
  };

  return (
    <Select<string>
      id={id}
      className={className}
      style={style}
      status={status}
      value={value || undefined}
      placeholder={placeholder}
      allowClear={allowClear}
      disabled={disabled}
      showSearch
      open={open}
      filterOption={false}
      loading={loading}
      options={options}
      notFoundContent={loading ? t('Chargement...') : notFoundContent}
      onSearch={setSearch}
      onOpenChange={handleOpenChange}
      onChange={next => onChange?.(next ?? undefined)}
    />
  );
}

// ---------------------------------------------------------------------------
// Contacts et affaires du CRM
// ---------------------------------------------------------------------------

interface CrmSelectBase extends Omit<RemoteSelectProps, 'loadOptions' | 'loadSelected' | 'reloadKey'> {
  tenantId: string;
}

/** Choix d'un contact : recherche par nom, raison sociale, e-mail ou téléphone. */
export function ContactRemoteSelect({ tenantId, ...rest }: CrmSelectBase) {
  const loadOptions = useCallback(
    async (search: string): Promise<RemoteOption[]> => {
      const response = await listContacts(tenantId, {
        search: search || undefined,
        page: 1,
        limit: REMOTE_SELECT_LIMIT
      });
      return (response.contacts ?? []).map(contact => ({
        value: contact.id,
        label: contactDisplayNameWithEmail(contact)
      }));
    },
    [tenantId]
  );
  const loadSelected = useCallback(
    async (contactId: string): Promise<RemoteOption | null> => {
      const response = await getContact(tenantId, contactId);
      return response.success ? { value: contactId, label: contactDisplayNameWithEmail(response.data) } : null;
    },
    [tenantId]
  );
  return <RemoteSelect {...rest} loadOptions={loadOptions} loadSelected={loadSelected} />;
}

/** Libellé d'une affaire dans un sélecteur : « Achat - Visite - 25 000 000 FCFA ». */
export function dealOptionLabel(deal: { type: string; stage: string; budgetMax?: number | string | null }): string {
  const budget = deal.budgetMax ? ` - ${formatMoney(Number(deal.budgetMax))}` : '';
  return `${dealTypeLabel(deal.type)} - ${dealStageLabel(deal.stage)}${budget}`;
}

interface DealSelectProps extends CrmSelectBase {
  /** Affaires de ce contact seulement ; absent : toutes les affaires de l'agence. */
  contactId?: string;
}

/** Choix d'une affaire (celles d'un contact quand `contactId` est donné). */
export function DealRemoteSelect({ tenantId, contactId, ...rest }: DealSelectProps) {
  const loadOptions = useCallback(
    async (search: string): Promise<RemoteOption[]> => {
      const response = await listDeals(tenantId, {
        contactId: contactId || undefined,
        search: search || undefined,
        page: 1,
        limit: REMOTE_SELECT_LIMIT
      });
      return (response.deals ?? []).map(deal => ({ value: deal.id, label: dealOptionLabel(deal) }));
    },
    [tenantId, contactId]
  );
  const loadSelected = useCallback(
    async (dealId: string): Promise<RemoteOption | null> => {
      const response = await getDeal(tenantId, dealId);
      return response.success ? { value: dealId, label: dealOptionLabel(response.data) } : null;
    },
    [tenantId]
  );
  return <RemoteSelect {...rest} loadOptions={loadOptions} loadSelected={loadSelected} reloadKey={contactId ?? ''} />;
}
