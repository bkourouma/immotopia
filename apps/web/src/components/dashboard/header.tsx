import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout, Input, Avatar, Dropdown, Button, Space, Typography } from 'antd';
import type { MenuProps } from 'antd';
import {
  SearchOutlined,
  GlobalOutlined,
  UserOutlined,
  LogoutOutlined,
  SettingOutlined,
  MenuOutlined
} from '@ant-design/icons';
import { useAuth } from '../../hooks/useAuth';
import { useSidebar } from '../../context/SidebarContext';
import { useBreakpoint } from '../../hooks/useBreakpoint';

const { Header: AntHeader } = Layout;
const { Text } = Typography;

export function Header() {
  const { user, logout, tenantMembership } = useAuth();
  const navigate = useNavigate();
  const { toggleMobileSidebar } = useSidebar();
  // Bascule au palier lg (992 px), aligne sur la grille AntD (§3.4).
  const { isDesktop } = useBreakpoint();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

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
    {
      type: 'divider'
    },
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
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 40,
        height: 64,
        borderBottom: '1px solid #f0f0f0',
        backgroundColor: '#fff',
        padding: '0 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16
      }}
    >
      {/* Mobile Menu Button - Only visible on mobile */}
      {!isDesktop && (
        <Button
          type="text"
          icon={<MenuOutlined style={{ fontSize: 20 }} />}
          onClick={toggleMobileSidebar}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minWidth: 40,
            height: 40
          }}
        />
      )}

      {/* Left Section - Search */}
      <div style={{ flex: 1, maxWidth: 400 }}>
        <Input
          size="large"
          placeholder="Rechercher propriétés, clients, documents..."
          prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
          style={{ width: '100%' }}
        />
      </div>

      {/* Right Section - User Controls */}
      <Space size="middle" style={{ marginLeft: 'auto', flexShrink: 0 }}>
        {/* Language Selector */}
        <Button type="text" icon={<GlobalOutlined />} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          FR
        </Button>

        {/* User Menu */}
        <Dropdown menu={{ items: userMenuItems }} placement="bottomRight" trigger={['click']}>
          <Button
            type="text"
            style={{
              height: 'auto',
              padding: '4px 12px',
              display: 'flex',
              alignItems: 'center'
            }}
          >
            <Space>
              <Avatar src={user?.avatarUrl} style={{ backgroundColor: '#1890ff' }}>
                {user?.fullName ? getInitials(user.fullName) : 'U'}
              </Avatar>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                <Text strong style={{ fontSize: 14, lineHeight: 1.2 }}>
                  {user?.fullName || 'Utilisateur'}
                </Text>
                <Text type="secondary" style={{ fontSize: 12, lineHeight: 1.2 }}>
                  {user?.globalRole === 'SUPER_ADMIN' ? 'Administrateur' : 'Utilisateur'}
                </Text>
              </div>
            </Space>
          </Button>
        </Dropdown>
      </Space>
    </AntHeader>
  );
}
