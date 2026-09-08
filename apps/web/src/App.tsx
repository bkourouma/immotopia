import React, { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { App as AntApp, ConfigProvider, Spin } from 'antd';
import frFR from 'antd/locale/fr_FR';
import { buildAntdTheme } from './theme/antd-theme';
import { FeedbackBridge } from './lib/feedback';
// `NotFound` est `lazy` pour la meme raison qu'`AccessDenied` : il tire
// `Result` d'Ant Design pour un ecran que l'on n'atteint qu'en se trompant
// d'adresse.
const NotFound = lazy(() => import('./components/primitives/NotFound').then(m => ({ default: m.NotFound })));
// La coquille est `lazy` au meme titre que les ecrans : elle n'est utile
// qu'apres authentification, et l'importer statiquement faisait payer a
// /login tout le Menu, le Layout et le Drawer d'Ant Design — mesure : +102 Ko
// gzip sur le chunk d'entree.
const AppShell = lazy(() =>
  import(/* webpackChunkName: "shell" */ './components/shell/AppShell').then(m => ({ default: m.AppShell }))
);
import { useBreakpoint } from './hooks/useBreakpoint';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { ErrorBoundary } from './components/ErrorBoundary';
import { TenantRedirect } from './components/TenantRedirect';
const Register = lazy(() =>
  import(/* webpackChunkName: "pages-root" */ './pages/Register').then(m => ({ default: m.Register }))
);
const VerifyEmail = lazy(() =>
  import(/* webpackChunkName: "pages-root" */ './pages/VerifyEmail').then(m => ({ default: m.VerifyEmail }))
);
const Login = lazy(() =>
  import(/* webpackChunkName: "pages-root" */ './pages/Login').then(m => ({ default: m.Login }))
);
const Dashboard = lazy(() =>
  import(/* webpackChunkName: "pages-root" */ './pages/Dashboard').then(m => ({ default: m.Dashboard }))
);
const Properties = lazy(() =>
  import(/* webpackChunkName: "properties" */ './pages/properties/Properties').then(m => ({ default: m.Properties }))
);
const PropertyCreate = lazy(() =>
  import(/* webpackChunkName: "properties" */ './pages/properties/PropertyCreate').then(m => ({
    default: m.PropertyCreate
  }))
);
const PropertyEdit = lazy(() =>
  import(/* webpackChunkName: "properties" */ './pages/properties/PropertyEdit').then(m => ({
    default: m.PropertyEdit
  }))
);
const PropertyDetail = lazy(() =>
  import(/* webpackChunkName: "properties" */ './pages/properties/PropertyDetail').then(m => ({
    default: m.PropertyDetail
  }))
);
const PropertyVisitsCalendar = lazy(() =>
  import(/* webpackChunkName: "properties" */ './pages/properties/PropertyVisitsCalendar').then(m => ({
    default: m.PropertyVisitsCalendar
  }))
);
const PatrimoineOverviewPage = lazy(() =>
  import(/* webpackChunkName: "patrimoine" */ './pages/patrimoine/PatrimoineOverviewPage').then(m => ({
    default: m.PatrimoineOverviewPage
  }))
);
const PatrimoinePerformancePage = lazy(() =>
  import(/* webpackChunkName: "patrimoine" */ './pages/patrimoine/PatrimoinePerformancePage').then(m => ({
    default: m.PatrimoinePerformancePage
  }))
);
const WorkProgramsPage = lazy(() =>
  import(/* webpackChunkName: "patrimoine" */ './pages/patrimoine/work-programs/WorkProgramsPage').then(m => ({
    default: m.WorkProgramsPage
  }))
);
const OwnerStatementsPage = lazy(() =>
  import(/* webpackChunkName: "patrimoine" */ './pages/patrimoine/statements/OwnerStatementsPage').then(m => ({
    default: m.OwnerStatementsPage
  }))
);
const OwnerStatementDetailPage = lazy(() =>
  import(/* webpackChunkName: "patrimoine" */ './pages/patrimoine/statements/OwnerStatementDetailPage').then(m => ({
    default: m.OwnerStatementDetailPage
  }))
);
const SyndicsList = lazy(() =>
  import(/* webpackChunkName: "syndics" */ './pages/syndics/SyndicsList').then(m => ({ default: m.SyndicsList }))
);
const SyndicDetail = lazy(() =>
  import(/* webpackChunkName: "syndics" */ './pages/syndics/SyndicDetail').then(m => ({ default: m.SyndicDetail }))
);
const SyndicLots = lazy(() =>
  import(/* webpackChunkName: "syndics" */ './pages/syndics/SyndicLots').then(m => ({ default: m.SyndicLots }))
);
const SyndicCharges = lazy(() =>
  import(/* webpackChunkName: "syndics" */ './pages/syndics/SyndicCharges').then(m => ({ default: m.SyndicCharges }))
);
const SyndicMeetings = lazy(() =>
  import(/* webpackChunkName: "syndics" */ './pages/syndics/SyndicMeetings').then(m => ({ default: m.SyndicMeetings }))
);
const SyndicMeetingDetail = lazy(() =>
  import(/* webpackChunkName: "syndics" */ './pages/syndics/SyndicMeetingDetail').then(m => ({
    default: m.SyndicMeetingDetail
  }))
);
const SyndicProviders = lazy(() =>
  import(/* webpackChunkName: "syndics" */ './pages/syndics/SyndicProviders').then(m => ({
    default: m.SyndicProviders
  }))
);
const SyndicDocuments = lazy(() =>
  import(/* webpackChunkName: "syndics" */ './pages/syndics/SyndicDocuments').then(m => ({
    default: m.SyndicDocuments
  }))
);
const SyndicFinances = lazy(() =>
  import(/* webpackChunkName: "syndics" */ './pages/syndics/SyndicFinances').then(m => ({ default: m.SyndicFinances }))
);
const SyndicRecovery = lazy(() =>
  import(/* webpackChunkName: "syndics" */ './pages/syndics/SyndicRecovery').then(m => ({ default: m.SyndicRecovery }))
);
const SyndicOwnerAccount = lazy(() =>
  import(/* webpackChunkName: "syndics" */ './pages/syndics/SyndicOwnerAccount').then(m => ({
    default: m.SyndicOwnerAccount
  }))
);
const SyndicAccounting = lazy(() =>
  import(/* webpackChunkName: "syndics" */ './pages/syndics/SyndicAccounting').then(m => ({
    default: m.SyndicAccounting
  }))
);
const SyndicBudgets = lazy(() =>
  import(/* webpackChunkName: "syndics" */ './pages/syndics/SyndicBudgets').then(m => ({ default: m.SyndicBudgets }))
);
const SyndicProfilesIncidents = lazy(() =>
  import(/* webpackChunkName: "syndics" */ './pages/syndics/SyndicProfilesIncidents').then(m => ({
    default: m.SyndicProfilesIncidents
  }))
);
const ForgotPassword = lazy(() =>
  import(/* webpackChunkName: "pages-root" */ './pages/ForgotPassword').then(m => ({ default: m.ForgotPassword }))
);
const ResetPassword = lazy(() =>
  import(/* webpackChunkName: "pages-root" */ './pages/ResetPassword').then(m => ({ default: m.ResetPassword }))
);
const AuthCallback = lazy(() =>
  import(/* webpackChunkName: "pages-root" */ './pages/AuthCallback').then(m => ({ default: m.AuthCallback }))
);
const AcceptInvitePage = lazy(() =>
  import(/* webpackChunkName: "auth" */ './pages/auth/AcceptInvitePage').then(m => ({ default: m.AcceptInvitePage }))
);
const SettingsLayout = lazy(() =>
  import(/* webpackChunkName: "settings" */ './pages/settings/SettingsLayout').then(m => ({
    default: m.SettingsLayout
  }))
);
const ProfilePage = lazy(() =>
  import(/* webpackChunkName: "settings" */ './pages/settings/ProfilePage').then(m => ({ default: m.ProfilePage }))
);
// Admin pages
const TenantsList = lazy(() =>
  import(/* webpackChunkName: "admin" */ './pages/admin/TenantsList').then(m => ({ default: m.TenantsList }))
);
const TenantDetail = lazy(() =>
  import(/* webpackChunkName: "admin" */ './pages/admin/TenantDetail').then(m => ({ default: m.TenantDetail }))
);
const TenantCreate = lazy(() =>
  import(/* webpackChunkName: "admin" */ './pages/admin/TenantCreate').then(m => ({ default: m.TenantCreate }))
);
const Statistics = lazy(() =>
  import(/* webpackChunkName: "admin" */ './pages/admin/Statistics').then(m => ({ default: m.Statistics }))
);
const AuditLogs = lazy(() =>
  import(/* webpackChunkName: "admin" */ './pages/admin/AuditLogs').then(m => ({ default: m.AuditLogs }))
);
const AdminCollaboratorDetail = lazy(() =>
  import(/* webpackChunkName: "admin" */ './pages/admin/AdminCollaboratorDetail').then(m => ({
    default: m.AdminCollaboratorDetail
  }))
);
const AdminInviteCollaborator = lazy(() =>
  import(/* webpackChunkName: "admin" */ './pages/admin/AdminInviteCollaborator').then(m => ({
    default: m.AdminInviteCollaborator
  }))
);
const RolesPermissions = lazy(() =>
  import(/* webpackChunkName: "admin" */ './pages/admin/RolesPermissions').then(m => ({ default: m.RolesPermissions }))
);
// Tenant pages
const CollaboratorsList = lazy(() =>
  import(/* webpackChunkName: "tenant" */ './pages/tenant/CollaboratorsList').then(m => ({
    default: m.CollaboratorsList
  }))
);
const CollaboratorDetail = lazy(() =>
  import(/* webpackChunkName: "tenant" */ './pages/tenant/CollaboratorDetail').then(m => ({
    default: m.CollaboratorDetail
  }))
);
const InviteCollaborator = lazy(() =>
  import(/* webpackChunkName: "tenant" */ './pages/tenant/InviteCollaborator').then(m => ({
    default: m.InviteCollaborator
  }))
);
const InvitationsList = lazy(() =>
  import(/* webpackChunkName: "tenant" */ './pages/tenant/InvitationsList').then(m => ({ default: m.InvitationsList }))
);
const TenantSettings = lazy(() =>
  import(/* webpackChunkName: "tenant" */ './pages/tenant/TenantSettings').then(m => ({ default: m.TenantSettings }))
);
// CRM pages
const Contacts = lazy(() =>
  import(/* webpackChunkName: "crm" */ './pages/crm/Contacts').then(m => ({ default: m.Contacts }))
);
const ContactFormPage = lazy(() =>
  import(/* webpackChunkName: "crm" */ './pages/crm/ContactFormPage').then(m => ({ default: m.ContactFormPage }))
);
const ContactDetailPage = lazy(() =>
  import(/* webpackChunkName: "crm" */ './pages/crm/ContactDetailPage').then(m => ({ default: m.ContactDetailPage }))
);
const Deals = lazy(() => import(/* webpackChunkName: "crm" */ './pages/crm/Deals').then(m => ({ default: m.Deals })));
const DealDetailPage = lazy(() =>
  import(/* webpackChunkName: "crm" */ './pages/crm/DealDetailPage').then(m => ({ default: m.DealDetailPage }))
);
const DealFormPage = lazy(() =>
  import(/* webpackChunkName: "crm" */ './pages/crm/DealFormPage').then(m => ({ default: m.DealFormPage }))
);
const Activities = lazy(() =>
  import(/* webpackChunkName: "crm" */ './pages/crm/Activities').then(m => ({ default: m.Activities }))
);
const CrmDashboard = lazy(() =>
  import(/* webpackChunkName: "crm" */ './pages/crm/Dashboard').then(m => ({ default: m.CrmDashboard }))
);
const CalendarPage = lazy(() =>
  import(/* webpackChunkName: "crm" */ './pages/crm/Calendar').then(m => ({ default: m.CalendarPage }))
);
// Rental pages
const Leases = lazy(() =>
  import(/* webpackChunkName: "rental" */ './pages/rental/Leases').then(m => ({ default: m.Leases }))
);
const LeaseFormPage = lazy(() =>
  import(/* webpackChunkName: "rental" */ './pages/rental/LeaseFormPage').then(m => ({ default: m.LeaseFormPage }))
);
const LeaseDetailPage = lazy(() =>
  import(/* webpackChunkName: "rental" */ './pages/rental/LeaseDetailPage').then(m => ({ default: m.LeaseDetailPage }))
);
const Installments = lazy(() =>
  import(/* webpackChunkName: "rental" */ './pages/rental/Installments').then(m => ({ default: m.Installments }))
);
const InstallmentDetailPage = lazy(() =>
  import(/* webpackChunkName: "rental" */ './pages/rental/InstallmentDetailPage').then(m => ({
    default: m.InstallmentDetailPage
  }))
);
const Payments = lazy(() =>
  import(/* webpackChunkName: "rental" */ './pages/rental/Payments').then(m => ({ default: m.Payments }))
);
const Penalties = lazy(() =>
  import(/* webpackChunkName: "rental" */ './pages/rental/Penalties').then(m => ({ default: m.Penalties }))
);
const Deposits = lazy(() =>
  import(/* webpackChunkName: "rental" */ './pages/rental/Deposits').then(m => ({ default: m.Deposits }))
);
const Documents = lazy(() =>
  import(/* webpackChunkName: "rental" */ './pages/rental/Documents').then(m => ({ default: m.Documents }))
);
const PaymentDetailPage = lazy(() =>
  import(/* webpackChunkName: "rental" */ './pages/rental/PaymentDetailPage').then(m => ({
    default: m.PaymentDetailPage
  }))
);
// Maintenance pages
const TicketList = lazy(() =>
  import(/* webpackChunkName: "tenant" */ './pages/tenant/maintenance/TicketList').then(m => ({
    default: m.TicketList
  }))
);
const TicketDetail = lazy(() =>
  import(/* webpackChunkName: "tenant" */ './pages/tenant/maintenance/TicketDetail').then(m => ({
    default: m.TicketDetail
  }))
);
const CreateTicket = lazy(() =>
  import(/* webpackChunkName: "tenant" */ './pages/tenant/maintenance/CreateTicket').then(m => ({
    default: m.CreateTicket
  }))
);
const EditTicket = lazy(() =>
  import(/* webpackChunkName: "tenant" */ './pages/tenant/maintenance/EditTicket').then(m => ({
    default: m.EditTicket
  }))
);
const ManagerTickets = lazy(() =>
  import(/* webpackChunkName: "admin" */ './pages/admin/maintenance/Tickets').then(m => ({ default: m.Tickets }))
);
const ManagerTicketDetail = lazy(() =>
  import(/* webpackChunkName: "admin" */ './pages/admin/maintenance/TicketDetail').then(m => ({
    default: m.TicketDetail
  }))
);
const Vendors = lazy(() =>
  import(/* webpackChunkName: "admin" */ './pages/admin/maintenance/Vendors').then(m => ({ default: m.Vendors }))
);
// Communication pages (email + WhatsApp notifications)
const EmailNotificationsUnifiedPage = lazy(() =>
  import(/* webpackChunkName: "communication" */ './pages/communication/EmailNotificationsUnifiedPage').then(m => ({
    default: m.EmailNotificationsUnifiedPage
  }))
);
const WhatsAppNotificationsPage = lazy(() =>
  import(/* webpackChunkName: "communication" */ './pages/communication/WhatsAppNotificationsPage').then(m => ({
    default: m.WhatsAppNotificationsPage
  }))
);
const WhatsAppGroupMessagePage = lazy(() =>
  import(/* webpackChunkName: "communication" */ './pages/communication/WhatsAppGroupMessagePage').then(m => ({
    default: m.WhatsAppGroupMessagePage
  }))
);
// Newsletter pages
const NewsletterListsPage = lazy(() =>
  import(/* webpackChunkName: "newsletter" */ './pages/newsletter/NewsletterListsPage').then(m => ({
    default: m.NewsletterListsPage
  }))
);
const NewsletterCampaignsPage = lazy(() =>
  import(/* webpackChunkName: "newsletter" */ './pages/newsletter/NewsletterCampaignsPage').then(m => ({
    default: m.NewsletterCampaignsPage
  }))
);
const NewsletterTemplatesPage = lazy(() =>
  import(/* webpackChunkName: "newsletter" */ './pages/newsletter/NewsletterTemplatesPage').then(m => ({
    default: m.NewsletterTemplatesPage
  }))
);
const UnsubscribePage = lazy(() =>
  import(/* webpackChunkName: "newsletter" */ './pages/newsletter/UnsubscribePage').then(m => ({
    default: m.UnsubscribePage
  }))
);
const ConfirmPage = lazy(() =>
  import(/* webpackChunkName: "newsletter" */ './pages/newsletter/ConfirmPage').then(m => ({ default: m.ConfirmPage }))
);
const SubscribePage = lazy(() =>
  import(/* webpackChunkName: "newsletter" */ './pages/newsletter/SubscribePage').then(m => ({
    default: m.SubscribePage
  }))
);
// Client pages
const DocumentTemplates = lazy(() =>
  import(/* webpackChunkName: "documents" */ './pages/documents/DocumentTemplates').then(m => ({
    default: m.DocumentTemplates
  }))
);
// Transactions page
// Reports page
// Tenant Portal pages
const TenantDashboard = lazy(() => import(/* webpackChunkName: "tenant-portal" */ './pages/TenantPortal/Dashboard'));
const TenantLease = lazy(() => import(/* webpackChunkName: "tenant-portal" */ './pages/TenantPortal/Lease'));
const TenantPayments = lazy(() => import(/* webpackChunkName: "tenant-portal" */ './pages/TenantPortal/Payments'));
const TenantDeposit = lazy(() => import(/* webpackChunkName: "tenant-portal" */ './pages/TenantPortal/Deposit'));
const TenantMaintenance = lazy(
  () => import(/* webpackChunkName: "tenant-portal" */ './pages/TenantPortal/Maintenance')
);
const TenantDocuments = lazy(() => import(/* webpackChunkName: "tenant-portal" */ './pages/TenantPortal/Documents'));
// Owner Portal pages
const OwnerDashboard = lazy(() => import(/* webpackChunkName: "owner-portal" */ './pages/OwnerPortal/Dashboard'));
const OwnerProperties = lazy(() => import(/* webpackChunkName: "owner-portal" */ './pages/OwnerPortal/Properties'));
const OwnerPropertyDetails = lazy(
  () => import(/* webpackChunkName: "owner-portal" */ './pages/OwnerPortal/PropertyDetails')
);
const OwnerLeases = lazy(() => import(/* webpackChunkName: "owner-portal" */ './pages/OwnerPortal/Leases'));
const OwnerLeaseDetails = lazy(() => import(/* webpackChunkName: "owner-portal" */ './pages/OwnerPortal/LeaseDetails'));
const OwnerRevenues = lazy(() => import(/* webpackChunkName: "owner-portal" */ './pages/OwnerPortal/Revenues'));
const OwnerInstallments = lazy(() => import(/* webpackChunkName: "owner-portal" */ './pages/OwnerPortal/Installments'));
const OwnerPayments = lazy(() => import(/* webpackChunkName: "owner-portal" */ './pages/OwnerPortal/Payments'));
const OwnerDeposits = lazy(() => import(/* webpackChunkName: "owner-portal" */ './pages/OwnerPortal/Deposits'));
const OwnerMaintenance = lazy(() => import(/* webpackChunkName: "owner-portal" */ './pages/OwnerPortal/Maintenance'));
const OwnerDocuments = lazy(() => import(/* webpackChunkName: "owner-portal" */ './pages/OwnerPortal/Documents'));
const OwnerReports = lazy(() => import(/* webpackChunkName: "owner-portal" */ './pages/OwnerPortal/Reports'));
const OwnerPreferences = lazy(() => import(/* webpackChunkName: "owner-portal" */ './pages/OwnerPortal/Preferences'));

/** Shown while a route's chunk is being fetched. */
const RouteFallback: React.FC = () => (
  <div
    role="status"
    aria-live="polite"
    aria-label="Chargement de la page"
    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}
  >
    <Spin size="large" />
  </div>
);

/**
 * Le thème est lu une fois, au premier rendu : les variables de `tokens.css`
 * sont résolues à ce moment et ne changent plus (§3.2).
 */
const antdTheme = buildAntdTheme();

/**
 * `componentSize` est le seul levier qui applique `controlHeightLG` a tous les
 * composants AntD d'un coup. Sous 992 px, chaque controle passe donc a 44 px
 * (plancher tactile) et les champs a `fontSizeLG` = 16 px, la regle non
 * negociable du §3.2 contre le zoom automatique d'iOS Safari.
 */
function ThemedApp({ children }: { children: React.ReactNode }) {
  const { isDesktop } = useBreakpoint();
  return (
    <ConfigProvider theme={antdTheme} locale={frFR} componentSize={isDesktop ? 'middle' : 'large'}>
      {children}
    </ConfigProvider>
  );
}

function App() {
  return (
    <ErrorBoundary>
      {/* `locale` francise DatePicker, Pagination, Table, Upload et Empty (§3.5). */}
      <ThemedApp>
        {/* <App> fournit message/notification/modal contextualises : les
            fonctions statiques d'AntD ignorent le ConfigProvider depuis la v5
            et s'afficheraient au theme par defaut (§5.7). */}
        <AntApp>
          <FeedbackBridge />
          <AuthProvider>
            <Router>
              {/* Every page below is code-split; this boundary covers chunk loading. */}
              <Suspense fallback={<RouteFallback />}>
                <Routes>
                  <Route path="/login" element={<Login />} />
                  <Route path="/register" element={<Register />} />
                  <Route path="/verify-email" element={<VerifyEmail />} />
                  <Route path="/forgot-password" element={<ForgotPassword />} />
                  <Route path="/reset-password" element={<ResetPassword />} />
                  <Route path="/auth/callback" element={<AuthCallback />} />
                  <Route path="/auth/accept-invite" element={<AcceptInvitePage />} />
                  <Route path="/newsletter/unsubscribe" element={<UnsubscribePage />} />
                  <Route path="/newsletter/confirm" element={<ConfirmPage />} />
                  <Route path="/newsletter/subscribe" element={<SubscribePage />} />
                  {/* Coquille — routes authentifiees. <AppShell> est monte UNE fois et persiste
                      d un ecran a l autre : c est ce que <Outlet/> apporte, la ou les 81 pages
                      remontaient DashboardLayout a chaque navigation (§4.1). */}
                  <Route
                    element={
                      <ProtectedRoute>
                        <AppShell />
                      </ProtectedRoute>
                    }
                  >
                    <Route path="/dashboard" element={<Dashboard />} />
                    <Route path="/properties" element={<Properties />} />
                    {/* Fusions du §4.3. Les ecrans disparaissent, les URL en
                        circulation sont redirigees et non cassees.
                        Clients -> CRM Contacts : meme entite, deux listes,
                        deux interfaces. /clients/new etait deja une
                        redirection vers le formulaire de contact CRM.
                        Transactions -> Affaires filtrees par type, Rapports ->
                        Releves : deux pages-passerelles qui n'affichaient
                        qu'un Empty ou des cartes de redirection, au prix de
                        trois clics. */}
                    <Route path="/clients" element={<TenantRedirect to="crm/contacts" />} />
                    <Route path="/clients/new" element={<TenantRedirect to="crm/contacts/new" />} />
                    <Route
                      path="/clients/groups"
                      element={<TenantRedirect to="crm/contacts" keepParams={['group']} />}
                    />
                    <Route path="/transactions" element={<TenantRedirect to="crm/deals" />} />
                    <Route
                      path="/transactions/sales"
                      element={<TenantRedirect to="crm/deals" query={{ type: 'SALE' }} />}
                    />
                    <Route
                      path="/transactions/rentals"
                      element={<TenantRedirect to="crm/deals" query={{ type: 'RENT' }} />}
                    />
                    <Route path="/reports" element={<TenantRedirect to="patrimoine/statements" />} />
                    {/* SettingsLayout n'est plus qu'un <Outlet/> : la coquille
                        lui vient desormais du parent, comme aux autres ecrans. */}
                    <Route path="/settings" element={<SettingsLayout />}>
                      <Route index element={<Navigate to="/settings/profile" replace />} />
                      <Route path="profile" element={<ProfilePage />} />
                    </Route>
                  </Route>
                  {/* Coquille — routes d'agence. requireTenant est active ICI, en un seul point,
                      au lieu de 63 routes a annoter une par une. La prop existait mais
                      n etait passee nulle part : les routes /tenant/:tenantId/* ne verifiaient
                      pas que l agence de l URL etait celle de l utilisateur (§4.1). */}
                  <Route
                    element={
                      <ProtectedRoute requireTenant>
                        <AppShell />
                      </ProtectedRoute>
                    }
                  >
                    <Route path="/tenant/:tenantId/properties" element={<Properties />} />
                    <Route path="/tenant/:tenantId/properties/new" element={<PropertyCreate />} />
                    <Route path="/tenant/:tenantId/properties/visits/calendar" element={<PropertyVisitsCalendar />} />
                    <Route path="/tenant/:tenantId/properties/:id/edit" element={<PropertyEdit />} />
                    <Route path="/tenant/:tenantId/properties/:id" element={<PropertyDetail />} />
                    <Route path="/tenant/:tenantId/patrimoine" element={<PatrimoineOverviewPage />} />
                    <Route path="/tenant/:tenantId/patrimoine/performance" element={<PatrimoinePerformancePage />} />
                    <Route path="/tenant/:tenantId/patrimoine/work-programs" element={<WorkProgramsPage />} />
                    <Route path="/tenant/:tenantId/patrimoine/statements" element={<OwnerStatementsPage />} />
                    <Route path="/tenant/:tenantId/patrimoine/statements/:id" element={<OwnerStatementDetailPage />} />
                    <Route path="/tenant/:tenantId/syndics" element={<SyndicsList />} />
                    <Route path="/tenant/:tenantId/syndics/:syndicId" element={<SyndicDetail />} />
                    <Route path="/tenant/:tenantId/syndics/:syndicId/lots" element={<SyndicLots />} />
                    <Route
                      path="/tenant/:tenantId/syndics/:syndicId/lots/:lotId/compte"
                      element={<SyndicOwnerAccount />}
                    />
                    <Route path="/tenant/:tenantId/syndics/:syndicId/charges" element={<SyndicCharges />} />
                    <Route path="/tenant/:tenantId/syndics/:syndicId/assemblees" element={<SyndicMeetings />} />
                    <Route
                      path="/tenant/:tenantId/syndics/:syndicId/assemblees/:meetingId"
                      element={<SyndicMeetingDetail />}
                    />
                    <Route path="/tenant/:tenantId/syndics/:syndicId/prestataires" element={<SyndicProviders />} />
                    <Route path="/tenant/:tenantId/syndics/:syndicId/documents" element={<SyndicDocuments />} />
                    <Route path="/tenant/:tenantId/syndics/:syndicId/finances" element={<SyndicFinances />} />
                    <Route path="/tenant/:tenantId/syndics/:syndicId/recouvrement" element={<SyndicRecovery />} />
                    <Route path="/tenant/:tenantId/syndics/:syndicId/comptabilite" element={<SyndicAccounting />} />
                    <Route path="/tenant/:tenantId/syndics/:syndicId/budgets" element={<SyndicBudgets />} />
                    <Route
                      path="/tenant/:tenantId/syndics/:syndicId/profils-incidents"
                      element={<SyndicProfilesIncidents />}
                    />
                    <Route path="/tenant/:tenantId/collaborators" element={<CollaboratorsList />} />
                    <Route path="/tenant/:tenantId/collaborators/:userId" element={<CollaboratorDetail />} />
                    <Route path="/tenant/:tenantId/invite" element={<InviteCollaborator />} />
                    <Route path="/tenant/:tenantId/invitations" element={<InvitationsList />} />
                    <Route path="/tenant/:tenantId/settings" element={<TenantSettings />} />
                    <Route path="/tenant/:tenantId/documents/templates" element={<DocumentTemplates />} />
                    <Route path="/tenant/:tenantId/crm/contacts" element={<Contacts />} />
                    <Route path="/tenant/:tenantId/crm/contacts/new" element={<ContactFormPage />} />
                    <Route path="/tenant/:tenantId/crm/contacts/:contactId" element={<ContactDetailPage />} />
                    <Route path="/tenant/:tenantId/crm/contacts/:contactId/edit" element={<ContactFormPage />} />
                    <Route path="/tenant/:tenantId/crm/deals" element={<Deals />} />
                    <Route path="/tenant/:tenantId/crm/deals/new" element={<DealFormPage />} />
                    <Route path="/tenant/:tenantId/crm/deals/:dealId" element={<DealDetailPage />} />
                    <Route path="/tenant/:tenantId/crm/deals/:dealId/edit" element={<DealFormPage />} />
                    <Route path="/tenant/:tenantId/crm/activities" element={<Activities />} />
                    <Route path="/tenant/:tenantId/crm/dashboard" element={<CrmDashboard />} />
                    <Route path="/tenant/:tenantId/crm/calendar" element={<CalendarPage />} />
                    <Route path="/tenant/:tenantId/rental/leases" element={<Leases />} />
                    <Route path="/tenant/:tenantId/rental/leases/new" element={<LeaseFormPage />} />
                    <Route path="/tenant/:tenantId/rental/leases/:leaseId" element={<LeaseDetailPage />} />
                    <Route path="/tenant/:tenantId/rental/leases/:leaseId/edit" element={<LeaseFormPage />} />
                    <Route path="/tenant/:tenantId/rental/installments" element={<Installments />} />
                    <Route
                      path="/tenant/:tenantId/rental/installments/:installmentId"
                      element={<InstallmentDetailPage />}
                    />
                    <Route path="/tenant/:tenantId/rental/payments" element={<Payments />} />
                    <Route path="/tenant/:tenantId/rental/payments/:paymentId" element={<PaymentDetailPage />} />
                    <Route path="/tenant/:tenantId/maintenance" element={<TicketList />} />
                    <Route path="/tenant/:tenantId/maintenance/new" element={<CreateTicket />} />
                    <Route path="/tenant/:tenantId/maintenance/:ticketId/edit" element={<EditTicket />} />
                    <Route path="/tenant/:tenantId/maintenance/:ticketId" element={<TicketDetail />} />
                    <Route path="/tenant/:tenantId/admin/maintenance/tickets" element={<ManagerTickets />} />
                    <Route
                      path="/tenant/:tenantId/admin/maintenance/tickets/:ticketId"
                      element={<ManagerTicketDetail />}
                    />
                    <Route path="/tenant/:tenantId/admin/maintenance/vendors" element={<Vendors />} />
                    <Route
                      path="/tenant/:tenantId/communication/email-notifications"
                      element={<EmailNotificationsUnifiedPage />}
                    />
                    <Route
                      path="/tenant/:tenantId/communication/whatsapp-notifications"
                      element={<WhatsAppNotificationsPage />}
                    />
                    <Route
                      path="/tenant/:tenantId/communication/whatsapp-group-message"
                      element={<WhatsAppGroupMessagePage />}
                    />
                    <Route path="/tenant/:tenantId/email-notifications" element={<EmailNotificationsUnifiedPage />} />
                    <Route path="/tenant/:tenantId/newsletter/lists" element={<NewsletterListsPage />} />
                    <Route path="/tenant/:tenantId/newsletter/campaigns" element={<NewsletterCampaignsPage />} />
                    <Route path="/tenant/:tenantId/newsletter/templates" element={<NewsletterTemplatesPage />} />
                  </Route>
                  {/* Coquille — administration de la plateforme. */}
                  <Route
                    element={
                      <ProtectedRoute requiredRole="SUPER_ADMIN">
                        <AppShell />
                      </ProtectedRoute>
                    }
                  >
                    <Route path="/admin/tenants" element={<TenantsList />} />
                    <Route path="/admin/tenants/new" element={<TenantCreate />} />
                    <Route path="/admin/tenants/:tenantId" element={<TenantDetail />} />
                    <Route path="/admin/tenants/:tenantId/edit" element={<TenantDetail />} />
                    <Route
                      path="/admin/tenants/:tenantId/collaborators/:userId"
                      element={<AdminCollaboratorDetail />}
                    />
                    <Route path="/admin/tenants/:tenantId/collaborators/invite" element={<AdminInviteCollaborator />} />
                    <Route path="/admin/statistics" element={<Statistics />} />
                    <Route path="/admin/audit" element={<AuditLogs />} />
                    <Route path="/admin/roles-permissions" element={<RolesPermissions />} />
                  </Route>
                  {/* Property Routes */}
                  {/* Legacy route for backward compatibility */}
                  {/* Admin Routes */}
                  {/* Tenant Routes */}
                  {/* Client Routes */}
                  {/* CRM Routes */}
                  {/* Rental Management Routes */}
                  {/* Maintenance Routes */}
                  {/* Manager Maintenance Routes */}
                  {/* Communication: email + WhatsApp notifications */}
                  {/* Transactions Routes */}
                  {/* Reports Route */}
                  {/* Portail locataire — meme coquille que le reste (§4.1).
                      La sidebar de 256 px et le drawer de ce portail sont
                      supprimes : quatre onglets couvrent ses six destinations,
                      et son usage est 100 % mobile (§4.2). */}
                  <Route
                    path="/tenant"
                    element={
                      <ProtectedRoute>
                        <AppShell />
                      </ProtectedRoute>
                    }
                  >
                    <Route index element={<TenantDashboard />} />
                    <Route path="lease" element={<TenantLease />} />
                    <Route path="payments" element={<TenantPayments />} />
                    <Route path="deposit" element={<TenantDeposit />} />
                    <Route path="maintenance" element={<TenantMaintenance />} />
                    <Route path="documents" element={<TenantDocuments />} />
                  </Route>
                  {/* Portail proprietaire — meme coquille. La garde defensive
                      qui manquait a OwnerPortal/Layout est desormais posee par
                      <AppShell> pour les deux portails a la fois (§4.3). */}
                  <Route
                    path="/owner"
                    element={
                      <ProtectedRoute>
                        <AppShell />
                      </ProtectedRoute>
                    }
                  >
                    <Route index element={<OwnerDashboard />} />
                    <Route path="properties" element={<OwnerProperties />} />
                    <Route path="properties/:id" element={<OwnerPropertyDetails />} />
                    <Route path="leases" element={<OwnerLeases />} />
                    <Route path="leases/:id" element={<OwnerLeaseDetails />} />
                    <Route path="revenues" element={<OwnerRevenues />} />
                    <Route path="installments" element={<OwnerInstallments />} />
                    <Route path="payments" element={<OwnerPayments />} />
                    <Route path="deposits" element={<OwnerDeposits />} />
                    <Route path="maintenance" element={<OwnerMaintenance />} />
                    <Route path="documents" element={<OwnerDocuments />} />
                    <Route path="reports" element={<OwnerReports />} />
                    <Route path="preferences" element={<OwnerPreferences />} />
                  </Route>
                  {/* User Settings & Profile Routes */}
                  <Route path="/" element={<Navigate to="/dashboard" replace />} />
                  {/* Route attrape-tout. Sans elle, toute URL non reconnue
                      affichait une page blanche, sans erreur ni redirection
                      (§4.3) — c'etait le cas de /properties/categories, promise
                      par le menu public et jamais implementee. */}
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
            </Router>
          </AuthProvider>
        </AntApp>
      </ThemedApp>
    </ErrorBoundary>
  );
}

export default App;
