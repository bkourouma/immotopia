import React, { useMemo } from 'react';
import { Button, Card, Empty, List, Space, Tag, Typography } from 'antd';
import { LoginOutlined, ThunderboltOutlined, UserOutlined } from '@ant-design/icons';
import { DEV_TENANT_ACCOUNTS } from './dev-accounts';
import type { DevAccount } from './dev-accounts';

const { Text } = Typography;

/**
 * Panneau « Comptes par tenant », à côté du formulaire de connexion.
 *
 * Affiché en développement, et en production si `VITE_SHOW_DEMO_ACCOUNTS=true`
 * au build. Voir `dev-accounts.ts`.
 *
 * Deux gestes par ligne, et ce n'est pas une redondance :
 *
 * - « Utiliser » remplit le formulaire et laisse soumettre. C'est le geste
 *   d'origine : on voit quel compte part avant qu'il parte.
 * - « Se connecter » ouvre la session directement. Il a été ajouté pour la
 *   recette : changer de persona dix fois dans un parcours coûtait deux clics
 *   à chaque fois, et un agent qui s'interdit de toucher un champ de mot de
 *   passe ne pouvait pas dérouler les parties « portail locataire »,
 *   « portail propriétaire » et « administration ». La ligne nomme déjà le
 *   compte et son rôle : ce que l'étape intermédiaire donnait à voir est
 *   toujours là.
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
  /** Reçoit le compte à connecter tout de suite, sans passer par le formulaire. */
  onConnect?: (account: DevAccount) => void;
  /** Adresse actuellement chargée dans le formulaire, pour la marquer ici. */
  activeEmail?: string;
}

export const DevAccountsPanel: React.FC<DevAccountsPanelProps> = ({ onPick, onConnect, activeEmail }) => {
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
                      size="small"
                      onClick={event => {
                        // Le `List.Item` porte déjà le clic : sans cela, le
                        // bouton déclencherait deux fois le même remplissage.
                        event.stopPropagation();
                        onPick(account);
                      }}
                    >
                      {isActive ? 'Chargé' : 'Utiliser'}
                    </Button>,
                    ...(onConnect
                      ? [
                          <Button
                            key="connect"
                            type="primary"
                            size="small"
                            icon={<LoginOutlined />}
                            onClick={event => {
                              event.stopPropagation();
                              onConnect(account);
                            }}
                          >
                            Se connecter
                          </Button>
                        ]
                      : [])
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
