import React, { useMemo } from 'react';
import { Button, Card, Empty, List, Space, Tag, Typography } from 'antd';
import { ThunderboltOutlined, UserOutlined } from '@ant-design/icons';
import { DEV_TENANT_ACCOUNTS } from './dev-accounts';
import type { DevAccount } from './dev-accounts';

const { Text } = Typography;

/**
 * Panneau « Comptes par tenant », à côté du formulaire de connexion.
 *
 * Affiché en développement, et en production si `VITE_SHOW_DEMO_ACCOUNTS=true`
 * au build. Voir `dev-accounts.ts`.
 *
 * Le panneau ne connecte personne : il remplit le formulaire et laisse la
 * soumission à l'utilisateur. Se connecter d'un seul clic sauterait l'étape où
 * l'on voit quel compte part — précisément l'information qu'on vient chercher
 * quand on jongle entre quatre personas.
 */

const PERSONA_COLORS: Record<DevAccount['persona'], string> = {
  'Super-admin': 'blue',
  Collaborateur: 'green',
  Propriétaire: 'purple',
  Locataire: 'orange'
};

export interface DevAccountsPanelProps {
  /** Reçoit le compte choisi, pour remplir le formulaire de connexion. */
  onPick: (account: DevAccount) => void;
  /** Adresse actuellement chargée dans le formulaire, pour la marquer ici. */
  activeEmail?: string;
}

export const DevAccountsPanel: React.FC<DevAccountsPanelProps> = ({ onPick, activeEmail }) => {
  /**
   * Tous les comptes, à plat.
   *
   * Le sélecteur de tenant a été retiré : deux entrées, dont une à un seul
   * compte, coûtaient un clic pour n'en cacher que trois.
   */
  const accounts = useMemo(() => DEV_TENANT_ACCOUNTS.flatMap(tenant => tenant.accounts), []);

  return (
    <Card
      title={
        <Space>
          <ThunderboltOutlined />
          <span>Comptes par tenant</span>
        </Space>
      }
      style={{ height: '100%' }}
    >
      <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
        {accounts.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Aucun compte de démonstration" />
        ) : (
          <List
            dataSource={accounts}
            renderItem={account => {
              const isActive = activeEmail === account.email;
              return (
                <List.Item
                  key={account.email}
                  style={{
                    cursor: 'pointer',
                    borderRadius: 8,
                    padding: 'var(--space-3)',
                    marginBottom: 'var(--space-2)',
                    background: isActive ? 'var(--ant-color-primary-bg)' : undefined,
                    border: `1px solid ${
                      isActive ? 'var(--ant-color-primary-border)' : 'var(--ant-color-border-secondary, #f0f0f0)'
                    }`
                  }}
                  onClick={() => onPick(account)}
                  actions={[
                    <Button
                      key="fill"
                      type={isActive ? 'primary' : 'default'}
                      size="small"
                      onClick={event => {
                        // Le `List.Item` porte déjà le clic : sans cela, le
                        // bouton déclencherait deux fois le même remplissage.
                        event.stopPropagation();
                        onPick(account);
                      }}
                    >
                      {isActive ? 'Chargé' : 'Utiliser'}
                    </Button>
                  ]}
                >
                  {/* Nom et rôle, rien de plus : l'adresse et le mot de passe
                      atterrissent dans le formulaire au clic, les répéter ici
                      ne servait qu'à allonger la ligne. */}
                  <List.Item.Meta
                    avatar={<UserOutlined style={{ fontSize: 18, color: 'var(--ant-color-primary)' }} />}
                    title={
                      <Space size={6} wrap>
                        <Text strong>{account.fullName}</Text>
                        <Tag color={PERSONA_COLORS[account.persona]}>{account.persona}</Tag>
                      </Space>
                    }
                  />
                </List.Item>
              );
            }}
          />
        )}
      </Space>
    </Card>
  );
};

export default DevAccountsPanel;
