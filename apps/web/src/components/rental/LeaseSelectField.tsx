import React, { useEffect, useState } from 'react';
import { Select } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { listLeases, RentalLease } from '../../services/rental-service';
import { queryKey, STALE_TIME } from '../../lib/query-keys';
import { nomDeLaPersonne, nomDuBien } from '../../lib/rental-labels';
import { t } from '../../i18n/t';

interface LeaseSelectFieldProps {
  tenantId: string;
  /** Injectés par `Form.Item` (`id` relie le champ à son libellé). */
  id?: string;
  value?: string;
  onChange?: (leaseId: string | undefined) => void;
  /** Le bail choisi (ou `undefined` si le choix est effacé), pour reprendre sa devise. */
  onLeaseChange?: (bail: RentalLease | undefined) => void;
}

/** Libellé d'un bail : numéro, bien et locataire (qui est fixé par le choix du bail). */
function libelleDuBail(bail: RentalLease): string {
  const locataire = nomDeLaPersonne(bail.primaryRenter?.user);
  return `${bail.lease_number} — ${nomDuBien(bail.property)} — ${locataire}`;
}

/**
 * Sélecteur de bail avec recherche côté serveur (numéro, bien, locataire).
 * Le choix d'un bail fixe le locataire du paiement : l'API le déduit du bail.
 */
export const LeaseSelectField: React.FC<LeaseSelectFieldProps> = ({ id, tenantId, value, onChange, onLeaseChange }) => {
  const [recherche, setRecherche] = useState('');
  const [terme, setTerme] = useState('');

  // Attente de la fin de frappe avant d'interroger l'API.
  useEffect(() => {
    const minuteur = setTimeout(() => setTerme(recherche.trim()), 300);
    return () => clearTimeout(minuteur);
  }, [recherche]);

  const { data, isFetching } = useQuery({
    queryKey: queryKey('leases', tenantId, { pour: 'saisie-paiement', search: terme }),
    queryFn: () => listLeases(tenantId, { search: terme || undefined, limit: 20 }),
    enabled: Boolean(tenantId),
    staleTime: STALE_TIME.list
  });

  // Le bail choisi reste proposé même quand une nouvelle recherche ne le ramène plus.
  const [choisi, setChoisi] = useState<RentalLease | undefined>();
  const trouves = data?.data ?? [];
  const baux = choisi && value === choisi.id && !trouves.some(b => b.id === choisi.id) ? [choisi, ...trouves] : trouves;

  return (
    <Select
      id={id}
      showSearch
      allowClear
      filterOption={false}
      value={value}
      loading={isFetching}
      placeholder={t('Rechercher un bail (numéro, bien ou locataire)')}
      notFoundContent={isFetching ? t('Chargement…') : t('Aucun bail trouvé')}
      onSearch={setRecherche}
      onChange={(id: string | undefined) => {
        const bail = baux.find(b => b.id === id);
        setChoisi(bail);
        onChange?.(id);
        onLeaseChange?.(bail);
      }}
      options={baux.map(bail => ({ value: bail.id, label: libelleDuBail(bail) }))}
    />
  );
};
