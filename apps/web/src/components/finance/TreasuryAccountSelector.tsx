import React, { useMemo } from 'react';
import { Select, Spin } from 'antd';
import type { SelectProps } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { listTreasuryAccounts, TreasuryAccountDto, TreasuryAccountKind } from '../../services/treasury-service';
import { queryKey, STALE_TIME } from '../../lib/query-keys';
import { t } from '../../i18n/t';

/**
 * Sélecteur de compte de trésorerie — lot 10, conformité SYSCOHADA (contrat
 * commun `LOT10-CONTRAT.md`).
 *
 * Partagé par tous les formulaires qui règlent ou encaissent quelque chose :
 * encaissement locataire, reversement au propriétaire, ouverture de caisse.
 * Il ne fait qu'une chose — proposer les comptes actifs compatibles avec le
 * moyen de paiement déjà choisi dans le formulaire appelant — et la même
 * chose partout, plutôt qu'un filtrage réécrit à chaque écran.
 *
 * `services/treasury-service.ts` (écran Trésorerie complet) porte déjà
 * `listTreasuryAccounts` : ce composant le réutilise sans dupliquer le
 * service réseau.
 */
export type TreasuryPaymentMethod = 'CASH' | 'BANK_TRANSFER' | 'MOBILE_MONEY' | 'CHECK' | 'CARD' | 'OTHER';

/**
 * Sens du mouvement. `in` (défaut) : un encaissement, où un chèque ou une carte
 * reçus attendent en « à encaisser ». `out` : un règlement sortant, qui sort de
 * la caisse (espèces), d'un portefeuille (Mobile Money) ou de la banque (virement,
 * chèque émis, carte) — jamais d'un compte « à encaisser ». Miroir de
 * `outflowKindsForMethod` côté API.
 */
export type TreasuryDirection = 'in' | 'out';

function outflowKindsFor(method: TreasuryPaymentMethod | null | undefined): TreasuryAccountKind[] {
  switch (method) {
    case 'CASH':
      return ['CASH'];
    case 'MOBILE_MONEY':
      return ['MOBILE_MONEY'];
    case 'BANK_TRANSFER':
    case 'CHECK':
    case 'CARD':
      return ['BANK'];
    default:
      return ['CASH', 'BANK', 'MOBILE_MONEY'];
  }
}

/** Natures de compte acceptées pour un moyen de paiement. `null` = toutes. */
function kindsAcceptedFor(method: TreasuryPaymentMethod | null | undefined): TreasuryAccountKind[] | null {
  switch (method) {
    case 'CASH':
      return ['CASH'];
    case 'BANK_TRANSFER':
      return ['BANK'];
    case 'MOBILE_MONEY':
      return ['MOBILE_MONEY'];
    case 'CHECK':
      return ['CHECKS_TO_CASH', 'BANK'];
    case 'CARD':
      return ['CARDS_TO_CASH', 'BANK'];
    case 'OTHER':
    default:
      return null;
  }
}

/** Libellé affiché : nom du compte, numéro, et opérateur Mobile Money s'il y en a un. */
function libelleCompte(compte: TreasuryAccountDto): string {
  const segments = [compte.label, compte.accountNumber];
  if (compte.mmOperator) segments.push(compte.mmOperator);
  return segments.filter(Boolean).join(' · ');
}

interface TreasuryAccountSelectorProps {
  tenantId: string;
  paymentMethod: TreasuryPaymentMethod | null | undefined;
  /** `out` pour un règlement sortant (fournisseur…). Défaut : `in`. */
  direction?: TreasuryDirection;
  /**
   * Facultatifs : dans un `<Form.Item name="…">`, Ant Design les injecte lui-même
   * (dépense d'un bien, mouvement de dépôt). Hors formulaire, les passer.
   */
  value?: string | null;
  onChange?: (id: string | null) => void;
  disabled?: boolean;
  placeholder?: string;
  style?: React.CSSProperties;
  id?: string;
  size?: SelectProps['size'];
}

export const TreasuryAccountSelector: React.FC<TreasuryAccountSelectorProps> = ({
  tenantId,
  paymentMethod,
  direction = 'in',
  value,
  onChange,
  disabled,
  placeholder,
  style,
  id,
  size
}) => {
  const { data: comptes = [], isPending } = useQuery({
    queryKey: queryKey('treasury-accounts', tenantId),
    queryFn: () => listTreasuryAccounts(tenantId),
    enabled: Boolean(tenantId),
    staleTime: STALE_TIME.reference
  });

  const options = useMemo(() => {
    const naturesAcceptees = direction === 'out' ? outflowKindsFor(paymentMethod) : kindsAcceptedFor(paymentMethod);
    return comptes
      .filter(compte => compte.isActive)
      .filter(compte => !naturesAcceptees || naturesAcceptees.includes(compte.kind))
      .map(compte => ({ value: compte.id, label: libelleCompte(compte) }));
  }, [comptes, paymentMethod, direction]);

  return (
    <Select
      id={id}
      size={size}
      style={style ?? { width: '100%' }}
      value={value ?? undefined}
      onChange={next => onChange?.(next ?? null)}
      allowClear
      placeholder={placeholder ?? t('Compte par défaut')}
      disabled={disabled}
      loading={isPending}
      notFoundContent={isPending ? <Spin size="small" /> : t('Aucun compte de trésorerie disponible')}
      showSearch
      optionFilterProp="label"
      options={options}
    />
  );
};

export default TreasuryAccountSelector;
