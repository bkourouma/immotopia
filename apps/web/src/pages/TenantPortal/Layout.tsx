import React, { useState, useEffect } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Layout as AntLayout, Menu, Drawer, Button, Spin } from 'antd';
import type { MenuProps } from 'antd';
import {
  HomeOutlined,
  FileTextOutlined,
  DollarOutlined,
  ToolOutlined,
  FolderOutlined,
  SafetyOutlined,
  MenuOutlined
} from '@ant-design/icons';
import { useAuth } from '../../hooks/useAuth';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { Header } from '../../components/dashboard/header';
import { SidebarProvider, useSidebar } from '../../context/SidebarContext';

const { Sider, Content } = AntLayout;

function TenantPortalLayoutContent() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isLoadingMembership, tenantClient } = useAuth();
  const { isMobileSidebarOpen, closeMobileSidebar } = useSidebar();
  const [openKeys, setOpenKeys] = useState<string[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  // Bascule au palier lg (992 px), aligne sur la grille AntD (§3.4).
  const { isDesktop } = useBreakpoint();

  // Redirect owners to owner portal - this is a safety check in case they somehow reach this route
  useEffect(() => {
    if (!isLoadingMembership && tenantClient) {
      if (tenantClient.clientType === 'OWNER') {
        navigate('/owner', { replace: true });
      } else if (tenantClient.clientType !== 'RENTER') {
        // If not a renter, redirect to dashboard which will handle the redirect
        navigate('/dashboard', { replace: true });
      }
    }
  }, [isLoadingMembership, tenantClient, navigate]);

  const menuItems: MenuProps['items'] = [
    {
      key: '/tenant',
      icon: <HomeOutlined />,
      label: 'Tableau de bord'
    },
    {
      key: '/tenant/lease',
      icon: <FileTextOutlined />,
      label: 'Mon bail'
    },
    {
      key: '/tenant/payments',
      icon: <DollarOutlined />,
      label: 'Paiements'
    },
    {
      key: '/tenant/deposit',
      icon: <SafetyOutlined />,
      label: 'Dépôt de garantie'
    },
    {
      key: '/tenant/maintenance',
      icon: <ToolOutlined />,
      label: 'Maintenance'
    },
    {
      key: '/tenant/documents',
      icon: <FolderOutlined />,
      label: 'Documents'
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
            <HomeOutlined style={{ fontSize: 24, color: '#fff' }} />
          </div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 'bold', color: '#fff' }}>ImmoPro</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>Portail Locataire</div>
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
              <HomeOutlined style={{ fontSize: 24, color: '#fff' }} />
            </div>
            <div>
              <div style={{ fontSize: 20, fontWeight: 'bold', color: '#fff' }}>ImmoPro</div>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>Portail Locataire</div>
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

export default function TenantPortalLayout() {
  return (
    <SidebarProvider>
      <TenantPortalLayoutContent />
    </SidebarProvider>
  );
}
