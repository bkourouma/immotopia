import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Avatar, Button, Dropdown, Layout, Space, Typography } from 'antd';
import type { MenuProps } from 'antd';
import { LogoutOutlined, MenuOutlined, SettingOutlined, UserOutlined } from '@ant-design/icons';
import { useAuth } from '../../hooks/useAuth';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { Breadcrumbs } from './Breadcrumbs';

const { Header: AntHeader } = Layout;
const { Text } = Typography;

/**
 * `<AppHeader>` — en-tête unique de l'application (REFONTE_UI_UX.md §3.6, §4.4).
 *
 * Deux éléments de l'ancien header ont **disparu**, et c'est volontaire :
 *
 *   - le **champ de recherche** n'avait ni `onChange` ni `onSearch`
 *     (`header.tsx:107-112`) : purement décoratif depuis toujours. Le §4.4
 *     tranche — afficher un champ inerte treize semaines de plus contredit le
 *     principe P6 (« rien d'inerte à l'écran »). La recherche globale est
 *     spécifiée au §4.4 et livrée au Lot 3, avec son endpoint.
 *   - le **bouton « FR »** n'ouvrait aucun sélecteur : une seule langue est
 *     supportée, et l'i18n n'est pas au périmètre (Q7).
 *
 * La place libérée revient au fil d'Ariane, absent du dépôt jusqu'ici.
 */
export interface AppHeaderProps {
  /** Ouvre le drawer de navigation ; absent quand le persona n'en a pas. */
  onOpenNavigation?: () => void;
}

export const AppHeader: React.FC<AppHeaderProps> = ({ onOpenNavigation }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { isDesktop } = useBreakpoint();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const initials = (name: string) =>
    name
      .split(' ')
      .map(part => part[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);

  const userMenuItems: MenuProps['items'] = [
    {
      key: 'profile',
      label: 'Profil',
      icon: <UserOutlined />,
      onClick: () => navigate('/settings/profile')
    },
    {
      key: 'settings',
      label: 'Paramètres',
      icon: <SettingOutlined />,
      onClick: () => navigate('/settings')
    },
    { type: 'divider' },
    {
      key: 'logout',
      label: 'Déconnexion',
      icon: <LogoutOutlined />,
      danger: true,
      onClick: handleLogout
    }
  ];

  return (
    <AntHeader
      role="banner"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 'var(--z-header)' as unknown as number,
        height: 64,
        borderBottom: '1px solid var(--border-subtle)',
        backgroundColor: 'var(--surface-card)',
        paddingInline: 'var(--space-4)',
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-4)'
      }}
    >
      {!isDesktop && onOpenNavigation && (
        <Button
          type="text"
          aria-label="Ouvrir la navigation"
          icon={<MenuOutlined style={{ fontSize: 20 }} />}
          onClick={onOpenNavigation}
          // 44 px : plancher tactile du §3.2.
          style={{ minWidth: 44, height: 44, flexShrink: 0 }}
        />
      )}

      {/* Le fil d'Ariane occupe la place laissée par le champ de recherche. */}
      <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
        <Breadcrumbs />
      </div>

      <Space size="middle" style={{ flexShrink: 0 }}>
        <Dropdown menu={{ items: userMenuItems }} placement="bottomRight" trigger={['click']}>
          <Button
            type="text"
            aria-label="Menu du compte"
            style={{ height: 'auto', padding: 'var(--space-1) var(--space-3)', display: 'flex', alignItems: 'center' }}
          >
            <Space>
              <Avatar src={user?.avatarUrl} style={{ backgroundColor: 'var(--color-primary)' }}>
                {user?.fullName ? initials(user.fullName) : 'U'}
              </Avatar>
              {/* Le nom disparaît sous 992 px : l'avatar suffit à identifier. */}
              {isDesktop && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                  <Text strong style={{ fontSize: 'var(--font-size-small)', lineHeight: 1.2 }}>
                    {user?.fullName || 'Utilisateur'}
                  </Text>
                  <Text type="secondary" style={{ fontSize: 'var(--font-size-caption)', lineHeight: 1.2 }}>
                    {user?.globalRole === 'SUPER_ADMIN' ? 'Administrateur' : 'Utilisateur'}
                  </Text>
                </div>
              )}
            </Space>
          </Button>
        </Dropdown>
      </Space>
    </AntHeader>
  );
};
