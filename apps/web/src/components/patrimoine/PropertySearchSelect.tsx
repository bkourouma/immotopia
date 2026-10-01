import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Select, Spin } from 'antd';
import { listProperties } from '../../services/property-service';
import { t } from '../../i18n/t';

/**
 * Sélecteur de bien à recherche côté serveur : fonctionne pour une agence de
 * plusieurs centaines de biens, là où une liste unique plafonnée à 100 rendait
 * les biens suivants introuvables.
 *
 * - la saisie interroge l'API (`q` : titre, adresse, référence), avec debounce ;
 * - les réponses périmées sont annulées (AbortController + compteur de séquence) ;
 * - la page suivante se charge quand le menu est défilé jusqu'en bas ;
 * - le bien choisi garde son libellé même s'il n'est plus dans la page courante.
 */

const PAGE_SIZE = 30;
const SEARCH_DELAY_MS = 300;
const SCROLL_THRESHOLD_PX = 24;

interface Option {
  value: string;
  label: string;
}

export interface PropertySearchSelectProps {
  tenantId?: string;
  value?: string;
  onChange: (propertyId: string | undefined) => void;
  id?: string;
  placeholder?: string;
  ariaLabel?: string;
  style?: React.CSSProperties;
  pageSize?: number;
}

export const PropertySearchSelect: React.FC<PropertySearchSelectProps> = ({
  tenantId,
  value,
  onChange,
  id,
  placeholder,
  ariaLabel,
  style,
  pageSize = PAGE_SIZE
}) => {
  const [options, setOptions] = useState<Option[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Option | undefined>(undefined);

  const search = useRef('');
  const page = useRef(0);
  const totalPages = useRef(1);
  const sequence = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadingRef = useRef(false);

  const load = useCallback(
    async (nextPage: number) => {
      if (!tenantId) return;
      controller.current?.abort();
      const ctrl = new AbortController();
      controller.current = ctrl;
      const mine = ++sequence.current;
      loadingRef.current = true;
      setLoading(true);
      try {
        const result = await listProperties(
          tenantId,
          { page: nextPage, limit: pageSize, q: search.current.trim() || undefined },
          { signal: ctrl.signal }
        );
        if (mine !== sequence.current) return;
        const fresh = (result.properties ?? []).map(property => ({ value: property.id, label: property.title }));
        page.current = nextPage;
        totalPages.current = result.pagination?.totalPages ?? nextPage;
        setOptions(previous => {
          if (nextPage === 1) return fresh;
          const known = new Set(previous.map(option => option.value));
          return [...previous, ...fresh.filter(option => !known.has(option.value))];
        });
      } catch {
        if (mine !== sequence.current) return;
        if (nextPage === 1) setOptions([]);
      } finally {
        if (mine === sequence.current) {
          loadingRef.current = false;
          setLoading(false);
        }
      }
    },
    [tenantId, pageSize]
  );

  useEffect(() => {
    search.current = '';
    page.current = 0;
    totalPages.current = 1;
    // Changement (ou perte) d'agence : jamais d'options ni d'indicateur de chargement de l'ancienne.
    loadingRef.current = false;
    setOptions([]);
    setSelected(undefined);
    setLoading(false);
    void load(1);
    return () => {
      sequence.current += 1;
      controller.current?.abort();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [load]);

  const handleSearch = (input: string) => {
    search.current = input;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void load(1), SEARCH_DELAY_MS);
  };

  const handleScroll = (event: React.UIEvent<HTMLDivElement>) => {
    const el = event.currentTarget;
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - SCROLL_THRESHOLD_PX;
    if (atBottom && !loadingRef.current && page.current >= 1 && page.current < totalPages.current) {
      void load(page.current + 1);
    }
  };

  // Le bien choisi reste dans la liste même s'il n'appartient pas à la page courante.
  const shown =
    selected && value === selected.value && !options.some(option => option.value === selected.value)
      ? [selected, ...options]
      : options;

  return (
    <Select<string, Option>
      id={id}
      aria-label={ariaLabel}
      showSearch
      allowClear
      filterOption={false}
      style={style}
      placeholder={placeholder}
      value={value}
      options={shown}
      loading={loading}
      notFoundContent={loading ? <Spin size="small" /> : t('Aucun bien')}
      onSearch={handleSearch}
      onPopupScroll={handleScroll}
      onClear={() => {
        setSelected(undefined);
      }}
      onChange={(next, option) => {
        const picked = Array.isArray(option) ? option[0] : option;
        setSelected(next && picked ? { value: next, label: String(picked.label) } : undefined);
        onChange(next ?? undefined);
        // La saisie est vidée à la sélection : on revient à la liste complète.
        if (search.current) {
          search.current = '';
          if (timer.current) clearTimeout(timer.current);
          void load(1);
        }
      }}
      onOpenChange={open => {
        if (!open && search.current) {
          search.current = '';
          if (timer.current) clearTimeout(timer.current);
          void load(1);
        }
      }}
    />
  );
};
