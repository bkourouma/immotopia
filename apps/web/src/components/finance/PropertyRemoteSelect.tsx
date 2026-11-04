import React, { useEffect, useMemo, useState } from 'react';
import { Select } from 'antd';
import type { SelectProps } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { getProperty, listProperties } from '../../services/property-service';
import { detailKey, queryKey, STALE_TIME } from '../../lib/query-keys';
import { t } from '../../i18n/t';

/**
 * Sélecteur de bien à recherche distante, pour les écrans finance.
 *
 * Remplace les `listProperties({ limit: 100 | 200 })` chargés au montage pour
 * remplir un `<Select>` : au-delà de la limite, un bien n'était jamais
 * proposé. Ici, chaque frappe interroge le serveur (`q`, 20 résultats), et le
 * bien déjà choisi (venu de l'URL, par exemple) est relu par son identifiant
 * pour afficher son nom même s'il n'est pas dans les résultats courants.
 *
 * Ce n'est pas un composant de recherche de liste (`ListSearch`, lot 0) :
 * seulement un champ de formulaire ou de filtre qui choisit UN bien.
 */
export interface PropertyRemoteSelectProps extends Omit<
  SelectProps<string>,
  'options' | 'onSearch' | 'filterOption' | 'showSearch' | 'value' | 'onChange'
> {
  tenantId: string;
  value?: string;
  onChange?: (propertyId: string | undefined) => void;
  /** Biens à ne pas proposer (déjà rattachés, par exemple). */
  excludeIds?: readonly string[];
}

const LIMITE = 20;
const DELAI_MS = 300;

export function PropertyRemoteSelect({
  tenantId,
  value,
  onChange,
  excludeIds,
  placeholder,
  ...rest
}: PropertyRemoteSelectProps) {
  const [saisie, setSaisie] = useState('');
  const [recherche, setRecherche] = useState('');

  useEffect(() => {
    const minuteur = window.setTimeout(() => setRecherche(saisie.trim()), DELAI_MS);
    return () => window.clearTimeout(minuteur);
  }, [saisie]);

  const resultats = useQuery({
    queryKey: queryKey('properties', tenantId, { q: recherche, limit: LIMITE, usage: 'remote-select' }),
    queryFn: ({ signal }) => listProperties(tenantId, { q: recherche || undefined, limit: LIMITE }, { signal }),
    enabled: Boolean(tenantId),
    staleTime: STALE_TIME.reference
  });

  const proposes = useMemo(() => resultats.data?.properties ?? [], [resultats.data]);
  const choisiConnu = Boolean(value && proposes.some(bien => bien.id === value));

  const choisi = useQuery({
    queryKey: detailKey('properties', tenantId, value ?? ''),
    queryFn: () => getProperty(tenantId, value as string),
    // Attendre les premiers résultats : inutile de relire un bien qu'ils contiennent.
    enabled: Boolean(tenantId && value) && resultats.isFetched && !choisiConnu,
    staleTime: STALE_TIME.reference
  });

  const options = useMemo(() => {
    const exclus = new Set(excludeIds ?? []);
    const liste = proposes
      .filter(bien => !exclus.has(bien.id))
      .map(bien => ({ value: bien.id, label: bien.title || bien.id }));
    if (value && !liste.some(option => option.value === value)) {
      const libelle = choisi.data?.title;
      liste.unshift({ value, label: libelle || t('Bien sélectionné') });
    }
    return liste;
  }, [proposes, excludeIds, value, choisi.data]);

  return (
    <Select<string>
      {...rest}
      showSearch
      allowClear
      filterOption={false}
      value={value}
      placeholder={placeholder ?? t('Rechercher un bien')}
      onSearch={setSaisie}
      onChange={next => {
        setSaisie('');
        onChange?.(next || undefined);
      }}
      loading={resultats.isFetching}
      notFoundContent={resultats.isFetching ? t('Recherche…') : t('Aucun bien trouvé')}
      options={options}
    />
  );
}

export default PropertyRemoteSelect;
