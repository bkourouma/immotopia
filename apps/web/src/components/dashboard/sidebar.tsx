import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Building2,
  Users,
  FileText,
  Settings,
  ChevronDown,
  Home,
  Package,
  BarChart3,
  Bell,
  HelpCircle,
  Shield,
  CreditCard,
  UserPlus,
  Mail,
  Activity,
  Briefcase,
  Calendar,
  UserCheck,
  TrendingUp,
  Key,
  FileCode,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useAuth } from '../../hooks/useAuth';

interface NavItem {
  title: string;
  href?: string;
  icon: React.ReactNode;
  children?: { title: string; href: string }[];
  requiredRole?: 'SUPER_ADMIN' | 'TENANT_USER' | 'PUBLIC';
}

export function Sidebar() {
  const location = useLocation();
  const [expandedItems, setExpandedItems] = useState<string[]>([]);
  const { user, tenantMembership, isLoadingMembership } = useAuth();

  const toggleExpand = (title: string) => {
    setExpandedItems((prev) =>
      prev.includes(title)
        ? prev.filter((item) => item !== title)
        : [...prev, title]
    );
  };

  const isActive = (href: string) => {
    if (!href) return false;
    // For exact matches
    if (location.pathname === href) return true;
    // For parent routes (e.g., /crm/contacts should be active when on /crm/contacts/:id)
    if (href.includes('/crm/') && location.pathname.startsWith(href.split('?')[0])) {
      return true;
    }
    return false;
  };

  // Determine user type
  const isSuperAdmin = user?.globalRole === 'SUPER_ADMIN';
  const isTenantUser = !isSuperAdmin && tenantMembership !== null;
  const isPublicUser = !isSuperAdmin && !isTenantUser && !isLoadingMembership;

  // Platform Admin Navigation (SUPER_ADMIN only)
  const adminNavigationItems: NavItem[] = [
    {
      title: 'Tableau de bord',
      href: '/dashboard',
      icon: <LayoutDashboard className="h-5 w-5" />,
      requiredRole: 'SUPER_ADMIN',
    },
    {
      title: 'Administration',
      icon: <Shield className="h-5 w-5" />,
      requiredRole: 'SUPER_ADMIN',
      children: [
        { title: 'Tenants', href: '/admin/tenants' },
        { title: 'Statistiques', href: '/admin/statistics' },
        { title: 'Journaux d\'audit', href: '/admin/audit' },
      ],
    },
  ];

  // Tenant User Navigation (Tenant collaborators only)
  const tenantNavigationItems: NavItem[] = [
    {
      title: 'Tableau de bord',
      href: '/dashboard',
      icon: <LayoutDashboard className="h-5 w-5" />,
      requiredRole: 'TENANT_USER',
    },
    {
      title: 'Gestion',
      icon: <Users className="h-5 w-5" />,
      requiredRole: 'TENANT_USER',
      children: [
        { title: 'Collaborateurs', href: `/tenant/${tenantMembership?.tenantId}/collaborators` },
        { title: 'Invitations', href: `/tenant/${tenantMembership?.tenantId}/invitations` },
        { title: 'Paramètres', href: `/tenant/${tenantMembership?.tenantId}/settings` },
      ],
    },
    {
      title: 'Propriétés',
      icon: <Building2 className="h-5 w-5" />,
      requiredRole: 'TENANT_USER',
      children: [
        { title: 'Toutes les propriétés', href: `/tenant/${tenantMembership?.tenantId}/properties` },
        { title: 'Calendrier des visites', href: `/tenant/${tenantMembership?.tenantId}/properties/visits/calendar` },
        { title: 'Ajouter une propriété', href: `/tenant/${tenantMembership?.tenantId}/properties/new` },
      ],
    },
    {
      title: 'Clients',
      icon: <Users className="h-5 w-5" />,
      requiredRole: 'TENANT_USER',
      children: [
        { title: 'Tous les clients', href: '/clients' },
        { title: 'Ajouter un client', href: '/clients/new' },
        { title: 'Groupes', href: '/clients/groups' },
      ],
    },
    {
      title: 'Transactions',
      icon: <FileText className="h-5 w-5" />,
      requiredRole: 'TENANT_USER',
      children: [
        { title: 'Toutes les transactions', href: '/transactions' },
        { title: 'Ventes', href: '/transactions/sales' },
        { title: 'Locations', href: '/transactions/rentals' },
      ],
    },
    {
      title: 'Rapports',
      href: '/reports',
      icon: <BarChart3 className="h-5 w-5" />,
      requiredRole: 'TENANT_USER',
    },
    {
      title: 'CRM',
      icon: <TrendingUp className="h-5 w-5" />,
      requiredRole: 'TENANT_USER',
      children: [
        { title: 'Tableau de bord', href: `/tenant/${tenantMembership?.tenantId}/crm/dashboard` },
        { title: 'Calendrier', href: `/tenant/${tenantMembership?.tenantId}/crm/calendar` },
        { title: 'Contacts', href: `/tenant/${tenantMembership?.tenantId}/crm/contacts` },
        { title: 'Nouveau contact', href: `/tenant/${tenantMembership?.tenantId}/crm/contacts/new` },
        { title: 'Affaires', href: `/tenant/${tenantMembership?.tenantId}/crm/deals` },
        { title: 'Suivis', href: `/tenant/${tenantMembership?.tenantId}/crm/activities` },
        { title: 'Rendez-vous', href: `/tenant/${tenantMembership?.tenantId}/crm/appointments` },
      ],
    },
    {
      title: 'Gestion Locative',
      icon: <Key className="h-5 w-5" />,
      requiredRole: 'TENANT_USER',
      children: [
        { title: 'Baux', href: `/tenant/${tenantMembership?.tenantId}/rental/leases` },
        { title: 'Nouveau bail', href: `/tenant/${tenantMembership?.tenantId}/rental/leases/new` },
        { title: 'Échéances', href: `/tenant/${tenantMembership?.tenantId}/rental/installments` },
        { title: 'Paiements', href: `/tenant/${tenantMembership?.tenantId}/rental/payments` },
        { title: 'Templates de documents', href: `/tenant/${tenantMembership?.tenantId}/documents/templates` },
      ],
    },
  ];

  // Public User Navigation (can see multiple tenants)
  const publicNavigationItems: NavItem[] = [
    {
      title: 'Tableau de bord',
      href: '/dashboard',
      icon: <LayoutDashboard className="h-5 w-5" />,
      requiredRole: 'PUBLIC',
    },
    {
      title: 'Propriétés',
      icon: <Building2 className="h-5 w-5" />,
      requiredRole: 'PUBLIC',
      children: [
        { title: 'Toutes les propriétés', href: '/properties' },
        { title: 'Catégories', href: '/properties/categories' },
      ],
    },
  ];

  // Select navigation based on user type
  let navigationItems: NavItem[] = [];
  if (isSuperAdmin) {
    navigationItems = adminNavigationItems;
  } else if (isTenantUser && !isLoadingMembership) {
    navigationItems = tenantNavigationItems;
  } else if (isPublicUser && !isLoadingMembership) {
    navigationItems = publicNavigationItems;
  }

  if (isLoadingMembership) {
    return (
      <aside className="fixed left-0 top-0 z-30 h-screen w-64 bg-slate-900 text-slate-100">
        <div className="flex h-16 items-center justify-center border-b border-slate-800 px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600">
              <Home className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">ImmoPro</h1>
              <p className="text-xs text-slate-400">Gestion Immobilière</p>
            </div>
          </div>
        </div>
        <div className="flex h-full items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      </aside>
    );
  }

  return (
    <aside className="fixed left-0 top-0 z-30 h-screen w-64 bg-slate-900 text-slate-100">
      {/* Logo Section */}
      <div className="flex h-16 items-center justify-center border-b border-slate-800 px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600">
            <Home className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">ImmoPro</h1>
            <p className="text-xs text-slate-400">Gestion Immobilière</p>
          </div>
        </div>
      </div>

      {/* Navigation Section */}
      <nav className="h-[calc(100vh-4rem)] overflow-y-auto px-3 py-4">
        <ul className="space-y-1">
          {navigationItems.map((item) => (
            <li key={item.title}>
              {item.children ? (
                <div>
                  <button
                    onClick={() => toggleExpand(item.title)}
                    className={cn(
                      'flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-slate-800',
                      expandedItems.includes(item.title) && 'bg-slate-800'
                    )}
                  >
                    <div className="flex items-center gap-3">
                      {item.icon}
                      <span>{item.title}</span>
                    </div>
                    <ChevronDown
                      className={cn(
                        'h-4 w-4 transition-transform duration-200',
                        expandedItems.includes(item.title) && 'rotate-180'
                      )}
                    />
                  </button>
                  {expandedItems.includes(item.title) && (
                    <ul className="mt-1 space-y-1">
                      {item.children.map((child) => (
                        <li key={child.href}>
                          <Link
                            to={child.href}
                            className={cn(
                              'flex items-center rounded-lg py-2 pl-11 pr-3 text-sm transition-colors hover:bg-slate-800',
                              isActive(child.href) &&
                                'border-l-2 border-blue-600 bg-slate-800'
                            )}
                          >
                            {child.title}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : (
                <Link
                  to={item.href!}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-slate-800',
                    isActive(item.href!) &&
                      'border-l-2 border-blue-600 bg-slate-800'
                  )}
                >
                  {item.icon}
                  <span>{item.title}</span>
                </Link>
              )}
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}

