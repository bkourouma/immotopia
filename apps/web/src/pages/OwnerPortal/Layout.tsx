import React, { useState, useEffect } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Layout as AntLayout, Menu, Drawer, Spin } from 'antd';
import type { MenuProps } from 'antd';
import {
  HomeOutlined,
  BankOutlined,
  FileTextOutlined,
  DollarOutlined,
  CalendarOutlined,
  WalletOutlined,
  SafetyOutlined,
  ToolOutlined,
  FolderOutlined,
  FileSearchOutlined,
  SettingOutlined
} from '@ant-design/icons';
import { useAuth } from '../../hooks/useAuth';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { Header } from '../../components/dashboard/header';
import { SidebarProvider, useSidebar } from '../../context/SidebarContext';

const { Sider, Content } = AntLayout;

function OwnerPortalLayoutContent() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isLoadingMembership } = useAuth();
  const { isMobileSidebarOpen, closeMobileSidebar } = useSidebar();
  const [openKeys, setOpenKeys] = useState<string[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  // Bascule au palier lg (992 px), aligne sur la grille AntD (§3.4).
  const { isDesktop } = useBreakpoint();

  const menuItems: MenuProps['items'] = [
    {
      key: '/owner',
      icon: <HomeOutlined />,
      label: 'Tableau de bord'
    },
    {
      key: '/owner/properties',
      icon: <BankOutlined />,
      label: 'Mes propriétés'
    },
    {
      key: '/owner/leases',
      icon: <FileTextOutlined />,
      label: 'Baux'
    },
    {
      key: '/owner/revenues',
      icon: <DollarOutlined />,
      label: 'Revenus'
    },
    {
      key: '/owner/installments',
      icon: <CalendarOutlined />,
      label: 'Échéances'
    },
    {
      key: '/owner/payments',
      icon: <WalletOutlined />,
      label: 'Paiements'
    },
    {
      key: '/owner/deposits',
      icon: <SafetyOutlined />,
      label: 'Dépôts de garantie'
    },
    {
      key: '/owner/maintenance',
      icon: <ToolOutlined />,
      label: 'Maintenance'
    },
    {
      key: '/owner/documents',
      icon: <FolderOutlined />,
      label: 'Documents'
    },
    {
      key: '/owner/reports',
      icon: <FileSearchOutlined />,
      label: 'Rapports'
    },
    {
      key: '/owner/preferences',
      icon: <SettingOutlined />,
      label: 'Préférences'
    }
  ];

  // Update selected keys based on current location
  useEffect(() => {
    const currentPath = location.pathname;
    setSelectedKeys([currentPath]);
  }, [location.pathname]);

  const handleMenuClick: MenuProps['onClick'] = ({ key }) => {
    navigate(key as string);
    if (!isDesktop) {
      closeMobileSidebar();
    }
  };

  // Render sidebar content (logo + menu)
  const renderSidebarContent = () => (
    <>
      {/* Logo Section */}
      <div
        style={{
          display: 'flex',
          height: 64,
          alignItems: 'center',
          justifyContent: 'center',
          borderBottom: '1px solid #1e293b',
          padding: '0 24px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              display: 'flex',
              width: 40,
              height: 40,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 8,
              backgroundColor: '#1890ff'
            }}
          >
            <BankOutlined style={{ fontSize: 24, color: '#fff' }} />
          </div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 'bold', color: '#fff' }}>ImmoPro</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>Portail Propriétaire</div>
          </div>
        </div>
      </div>

      {/* Navigation Section */}
      <Menu
        mode="inline"
        theme="dark"
        selectedKeys={selectedKeys}
        openKeys={openKeys}
        onOpenChange={setOpenKeys}
        onClick={handleMenuClick}
        items={menuItems}
        style={{
          height: 'calc(100vh - 64px)',
          overflowY: 'auto',
          backgroundColor: '#0f172a',
          borderRight: 0
        }}
      />
    </>
  );

  if (isLoadingMembership) {
    const loadingContent = (
      <>
        <div
          style={{
            display: 'flex',
            height: 64,
            alignItems: 'center',
            justifyContent: 'center',
            borderBottom: '1px solid #1e293b',
            padding: '0 24px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                display: 'flex',
                width: 40,
                height: 40,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 8,
                backgroundColor: '#1890ff'
              }}
            >
              <BankOutlined style={{ fontSize: 24, color: '#fff' }} />
            </div>
            <div>
              <div style={{ fontSize: 20, fontWeight: 'bold', color: '#fff' }}>ImmoPro</div>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>Portail Propriétaire</div>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
          <Spin size="large" />
        </div>
      </>
    );

    return (
      <AntLayout style={{ minHeight: '100vh' }}>
        {/* Desktop Sidebar */}
        {isDesktop && (
          <Sider
            width={256}
            style={{
              position: 'fixed',
              left: 0,
              top: 0,
              bottom: 0,
              backgroundColor: '#0f172a',
              zIndex: 30
            }}
          >
            {loadingContent}
          </Sider>
        )}

        {/* Mobile Drawer - handled by SidebarProvider */}

        <AntLayout style={{ marginLeft: isDesktop ? 256 : 0 }}>
          <Content style={{ padding: '24px', background: '#f0f2f5', minHeight: '100vh' }}>
            <Spin size="large" tip="Chargement..." />
          </Content>
        </AntLayout>
      </AntLayout>
    );
  }

  return (
    <AntLayout style={{ minHeight: '100vh' }}>
      {/* Desktop Sidebar */}
      {isDesktop && (
        <Sider
          width={256}
          style={{
            position: 'fixed',
            left: 0,
            top: 0,
            bottom: 0,
            backgroundColor: '#0f172a',
            zIndex: 30
          }}
        >
          {renderSidebarContent()}
        </Sider>
      )}

      {/* Mobile Drawer */}
      {!isDesktop && (
        <Drawer
          title={null}
          placement="left"
          closable={false}
          onClose={closeMobileSidebar}
          open={isMobileSidebarOpen}
          width={256}
          bodyStyle={{ padding: 0, backgroundColor: '#0f172a' }}
          style={{ zIndex: 50 }}
        >
          {renderSidebarContent()}
        </Drawer>
      )}

      <AntLayout style={{ marginLeft: isDesktop ? 256 : 0 }}>
        {/* Header */}
        <Header />

        {/* Main Content */}
        <Content style={{ padding: '24px', background: '#f0f2f5', minHeight: 'calc(100vh - 64px)' }}>
          <Outlet />
        </Content>
      </AntLayout>
    </AntLayout>
  );
}

export default function OwnerPortalLayout() {
  return (
    <SidebarProvider>
      <OwnerPortalLayoutContent />
    </SidebarProvider>
  );
}
