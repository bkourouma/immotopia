import React, { useMemo } from 'react';
import { Select, Space, Tag, Typography } from 'antd';
import { DEV_TENANT_ACCOUNTS } from './dev-accounts';
import type { DevAccount } from './dev-accounts';

const { Text } = Typography;

/**
 * Menu déroulant « Choisir un compte de test », en tête du formulaire de
 * connexion.
 *
 * Affiché en développement, et en production si `VITE_SHOW_DEMO_ACCOUNTS=true`
 * au build (staging). Voir `dev-accounts.ts` et `pages/Login.tsx`, qui le
 * charge en `lazy` pour qu'il disparaisse du bundle sans ce flag.
 *
 * Choisir un compte REMPLIT le formulaire (e-mail et mot de passe) et ne
 * soumet rien : on voit quel compte va partir avant qu'il parte. Effacer le
 * choix vide les deux champs.
 *
 * Un groupe par agence de test (un pack d'abonnement chacune), puis les
 * comptes historiques. La recherche porte sur le nom, l'agence, le persona et
 * l'adresse, ce qui permet de taper « syndic » ou « @packs ».
 */

const PERSONA_COLORS: Record<DevAccount['persona'], string> = {
  'Super-admin': 'blue',
  Collaborateur: 'green',
  Propriétaire: 'purple',
  Locataire: 'orange'
};

export interface DevAccountsSelectProps {
  /** Reçoit le compte choisi, pour remplir le formulaire de connexion. */
  onPick: (account: DevAccount) => void;
  /** Appelé quand le choix est effacé, pour vider le formulaire. */
  onClear: () => void;
  /** Adresse actuellement chargée dans le formulaire : valeur du menu. */
  activeEmail?: string;
}

interface AccountOption {
  value: string;
  label: React.ReactNode;
  /** Texte interrogé par la recherche : nom, agence, persona, e-mail. */
  searchText: string;
}

export const DevAccountsSelect: React.FC<DevAccountsSelectProps> = ({ onPick, onClear, activeEmail }) => {
  const accountsByEmail = useMemo(() => {
    const byEmail = new Map<string, DevAccount>();
    for (const tenant of DEV_TENANT_ACCOUNTS) {
      for (const account of tenant.accounts) byEmail.set(account.email, account);
    }
    return byEmail;
  }, []);

  const options = useMemo(
    () =>
      DEV_TENANT_ACCOUNTS.map(tenant => ({
        label: tenant.label ?? tenant.name,
        options: tenant.accounts.map((account): AccountOption => ({
          value: account.email,
          label: (
            <Space size={6} wrap>
              <Text>{account.fullName}</Text>
              <Tag color={PERSONA_COLORS[account.persona]} style={{ marginInlineEnd: 0 }}>
                {account.persona}
              </Tag>
            </Space>
          ),
          searchText: [tenant.label, tenant.name, account.fullName, account.persona, account.email]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()
        }))
      })),
    []
  );

  return (
    <Select<string>
      showSearch
      allowClear
      virtual={false}
      value={activeEmail}
      options={options}
      placeholder="Choisir un compte de test"
      aria-label="Choisir un compte de test"
      data-testid="dev-accounts-select"
      style={{ width: '100%' }}
      filterOption={(input, option) => String(option?.searchText ?? '').includes(input.trim().toLowerCase())}
      onChange={email => {
        const account = email ? accountsByEmail.get(email) : undefined;
        if (account) onPick(account);
      }}
      onClear={onClear}
    />
  );
};

export default DevAccountsSelect;
