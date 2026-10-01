import { useEffect, useState } from 'react';
import { vendorMaintenanceService } from '../../services/maintenance-service';
import type { MaintenanceLogEntryDto } from '../../types/insurance-types';
import { t } from '../../i18n/t';

export type VendorOption = { value: string; label: string };

/** Prestataire déjà lié à l'entrée : affiché par son nom (jamais par son identifiant). */
function linkedVendor(entry: MaintenanceLogEntryDto | null): VendorOption | null {
  if (!entry?.vendorId) return null;
  return { value: entry.vendorId, label: entry.vendorName ?? t('Prestataire (hors liste)') };
}

/**
 * Prestataires actifs de l'agence pour le formulaire du carnet. Un prestataire
 * inactif, ou au-delà de la première page chargée, reste choisi et lisible : on
 * l'ajoute à la liste avec le nom porté par l'entrée.
 */
export function useVendorOptions(open: boolean, tenantId: string, entry: MaintenanceLogEntryDto | null) {
  const [vendors, setVendors] = useState<VendorOption[]>([]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const linked = linkedVendor(entry);
    const withLinked = (list: VendorOption[]) =>
      linked && !list.some(option => option.value === linked.value) ? [linked, ...list] : list;
    setVendors(withLinked([]));
    vendorMaintenanceService
      .listVendors(tenantId, { isActive: true, limit: 100 })
      .then(response => {
        if (cancelled) return;
        const list = (response.data ?? []).map(v => ({
          value: v.id as string,
          label: (v.companyName ?? v.name) as string
        }));
        setVendors(withLinked(list));
      })
      .catch(() => {
        if (!cancelled) setVendors(withLinked([]));
      });
    return () => {
      cancelled = true;
    };
  }, [open, entry, tenantId]);

  return vendors;
}
