import React, { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ConfigProvider, Spin } from 'antd';
import frFR from 'antd/locale/fr_FR';
import { buildAntdTheme } from './theme/antd-theme';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ClientNewRedirect } from './components/ClientNewRedirect';
const Register = lazy(() =>
  import(/* webpackChunkName: "pages-root" */ './pages/Register').then(m => ({ default: m.Register }))
);
const VerifyEmail = lazy(() =>
  import(/* webpackChunkName: "pages-root" */ './pages/VerifyEmail').then(m => ({ default: m.VerifyEmail }))
);
import { Login } from './pages/Login';
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
const PropertyPublic = lazy(() =>
  import(/* webpackChunkName: "properties" */ './pages/properties/PropertyPublic').then(m => ({
    default: m.PropertyPublic
  }))
);
const PropertyPublicDetail = lazy(() =>
  import(/* webpackChunkName: "properties" */ './pages/properties/PropertyPublicDetail').then(m => ({
    default: m.PropertyPublicDetail
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
const Clients = lazy(() =>
  import(/* webpackChunkName: "pages-root" */ './pages/Clients').then(m => ({ default: m.Clients }))
);
const ClientGroups = lazy(() =>
  import(/* webpackChunkName: "pages-root" */ './pages/ClientGroups').then(m => ({ default: m.ClientGroups }))
);
const DocumentTemplates = lazy(() =>
  import(/* webpackChunkName: "documents" */ './pages/documents/DocumentTemplates').then(m => ({
    default: m.DocumentTemplates
  }))
);
// Transactions page
const Transactions = lazy(() =>
  import(/* webpackChunkName: "pages-root" */ './pages/Transactions').then(m => ({ default: m.Transactions }))
);
// Reports page
const Reports = lazy(() =>
  import(/* webpackChunkName: "pages-root" */ './pages/Reports').then(m => ({ default: m.Reports }))
);
// Tenant Portal pages
const TenantPortalLayout = lazy(() => import(/* webpackChunkName: "tenant-portal" */ './pages/TenantPortal/Layout'));
const TenantDashboard = lazy(() => import(/* webpackChunkName: "tenant-portal" */ './pages/TenantPortal/Dashboard'));
const TenantLease = lazy(() => import(/* webpackChunkName: "tenant-portal" */ './pages/TenantPortal/Lease'));
const TenantPayments = lazy(() => import(/* webpackChunkName: "tenant-portal" */ './pages/TenantPortal/Payments'));
const TenantDeposit = lazy(() => import(/* webpackChunkName: "tenant-portal" */ './pages/TenantPortal/Deposit'));
const TenantMaintenance = lazy(
  () => import(/* webpackChunkName: "tenant-portal" */ './pages/TenantPortal/Maintenance')
);
const TenantDocuments = lazy(() => import(/* webpackChunkName: "tenant-portal" */ './pages/TenantPortal/Documents'));
// Owner Portal pages
const OwnerPortalLayout = lazy(() => import(/* webpackChunkName: "owner-portal" */ './pages/OwnerPortal/Layout'));
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

function App() {
  return (
    <ErrorBoundary>
      {/* `locale` francise DatePicker, Pagination, Table, Upload et Empty (§3.5). */}
      <ConfigProvider theme={antdTheme} locale={frFR}>
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
                <Route
                  path="/dashboard"
                  element={
                    <ProtectedRoute>
                      <Dashboard />
                    </ProtectedRoute>
                  }
                />
                {/* Property Routes */}
                <Route
                  path="/tenant/:tenantId/properties"
                  element={
                    <ProtectedRoute>
                      <Properties />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/tenant/:tenantId/properties/new"
                  element={
                    <ProtectedRoute>
                      <PropertyCreate />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/tenant/:tenantId/properties/visits/calendar"
                  element={
                    <ProtectedRoute>
                      <PropertyVisitsCalendar />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/tenant/:tenantId/properties/:id/edit"
                  element={
                    <ProtectedRoute>
                      <PropertyEdit />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/tenant/:tenantId/properties/:id"
                  element={
                    <ProtectedRoute>
                      <PropertyDetail />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/tenant/:tenantId/patrimoine"
                  element={
                    <ProtectedRoute>
                      <PatrimoineOverviewPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/tenant/:tenantId/patrimoine/performance"
                  element={
                    <ProtectedRoute>
                      <PatrimoinePerformancePage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/tenant/:tenantId/patrimoine/work-programs"
                  element={
                    <ProtectedRoute>
                      <WorkProgramsPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/tenant/:tenantId/patrimoine/statements"
                  element={
                    <ProtectedRoute>
                      <OwnerStatementsPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/tenant/:tenantId/patrimoine/statements/:id"
                  element={
                    <ProtectedRoute>
                      <OwnerStatementDetailPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/tenant/:tenantId/syndics"
                  element={
                    <ProtectedRoute>
                      <SyndicsList />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/tenant/:tenantId/syndics/:syndicId"
                  element={
                    <ProtectedRoute>
                      <SyndicDetail />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/tenant/:tenantId/syndics/:syndicId/lots"
                  element={
                    <ProtectedRoute>
                      <SyndicLots />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/tenant/:tenantId/syndics/:syndicId/lots/:lotId/compte"
                  element={
                    <ProtectedRoute>
                      <SyndicOwnerAccount />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/tenant/:tenantId/syndics/:syndicId/charges"
                  element={
                    <ProtectedRoute>
                      <SyndicCharges />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/tenant/:tenantId/syndics/:syndicId/assemblees"
                  element={
                    <ProtectedRoute>
                      <SyndicMeetings />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/tenant/:tenantId/syndics/:syndicId/assemblees/:meetingId"
                  element={
                    <ProtectedRoute>
                      <SyndicMeetingDetail />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/tenant/:tenantId/syndics/:syndicId/prestataires"
                  element={
                    <ProtectedRoute>
                      <SyndicProviders />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/tenant/:tenantId/syndics/:syndicId/documents"
                  element={
                    <ProtectedRoute>
                      <SyndicDocuments />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/tenant/:tenantId/syndics/:syndicId/finances"
                  element={
                    <ProtectedRoute>
                      <SyndicFinances />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/tenant/:tenantId/syndics/:syndicId/recouvrement"
                  element={
                    <ProtectedRoute>
                      <SyndicRecovery />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/tenant/:tenantId/syndics/:syndicId/comptabilite"
                  element={
                    <ProtectedRoute>
                      <SyndicAccounting />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/tenant/:tenantId/syndics/:syndicId/budgets"
                  element={
                    <ProtectedRoute>
                      <SyndicBudgets />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/tenant/:tenantId/syndics/:syndicId/profils-incidents"
                  element={
                    <ProtectedRoute>
                      <SyndicProfilesIncidents />
                    </ProtectedRoute>
                  }
                />
                {/* Legacy route for backward compatibility */}
                <Route
                  path="/properties"
                  element={
                    <ProtectedRoute>
                      <Properties />
                    </ProtectedRoute>
                  }
                />
                {/* Admin Routes */}
                <Route
                  path="/admin/tenants"
                  element={
                    <ProtectedRoute requiredRole="SUPER_ADMIN">
                      <TenantsList />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/admin/tenants/new"
                  element={
                    <ProtectedRoute requiredRole="SUPER_ADMIN">
                      <TenantCreate />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/admin/tenants/:tenantId"
                  element={
                    <ProtectedRoute requiredRole="SUPER_ADMIN">
                      <TenantDetail />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/admin/tenants/:tenantId/edit"
                  element={
                    <ProtectedRoute requiredRole="SUPER_ADMIN">
                      <TenantDetail />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/admin/tenants/:tenantId/collaborators/:userId"
                  element={
                    <ProtectedRoute requiredRole="SUPER_ADMIN">
                      <AdminCollaboratorDetail />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/admin/tenants/:tenantId/collaborators/invite"
                  element={
                    <ProtectedRoute requiredRole="SUPER_ADMIN">
                      <AdminInviteCollaborator />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/admin/statistics"
                  element={
                    <ProtectedRoute requiredRole="SUPER_ADMIN">
                      <Statistics />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/admin/audit"
                  element={
                    <ProtectedRoute requiredRole="SUPER_ADMIN">
                      <AuditLogs />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/admin/roles-permissions"
                  element={
                    <ProtectedRoute requiredRole="SUPER_ADMIN">
                      <RolesPermissions />
                    </ProtectedRoute>
                  }
                />
                {/* Tenant Routes */}
                <Route
                  path="/tenant/:tenantId/collaborators"
                  element={
                    <ProtectedRoute>
                      <CollaboratorsList />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/tenant/:tenantId/collaborators/:userId"
                  element={
                    <ProtectedRoute>
                      <CollaboratorDetail />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/tenant/:tenantId/invite"
                  element={
                    <ProtectedRoute>
                      <InviteCollaborator />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/tenant/:tenantId/invitations"
                  element={
                    <ProtectedRoute>
                      <InvitationsList />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/tenant/:tenantId/settings"
                  element={
                    <ProtectedRoute>
                      <TenantSettings />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/tenant/:tenantId/documents/templates"
                  element={
                    <ProtectedRoute>
                      <DocumentTemplates />
                    </ProtectedRoute>
                  }
                />
                {/* Client Routes */}
                <Route
                  path="/clients"
                  element={
                    <ProtectedRoute>
                      <Clients />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/clients/new"
                  element={
                    <ProtectedRoute>
                      <ClientNewRedirect />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/clients/groups"
                  element={
                    <ProtectedRoute>
                      <ClientGroups />
                    </ProtectedRoute>
                  }
                />
                {/* CRM Routes */}
                <Route
                  path="/tenant/:tenantId/crm/contacts"
                  element={
                    <ProtectedRoute>
                      <Contacts />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/tenant/:tenantId/crm/contacts/new"
                  element={
                    <ProtectedRoute>
                      <ContactFormPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/tenant/:tenantId/crm/contacts/:contactId"
                  element={
                    <ProtectedRoute>
                      <ContactDetailPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/tenant/:tenantId/crm/contacts/:contactId/edit"
                  element={
                    <ProtectedRoute>
                      <ContactFormPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/tenant/:tenantId/crm/deals"
                  element={
                    <ProtectedRoute>
                      <Deals />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/tenant/:tenantId/crm/deals/new"
                  element={
                    <ProtectedRoute>
                      <DealFormPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/tenant/:tenantId/crm/deals/:dealId"
                  element={
                    <ProtectedRoute>
                      <DealDetailPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/tenant/:tenantId/crm/deals/:dealId/edit"
                  element={
                    <ProtectedRoute>
                      <DealFormPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/tenant/:tenantId/crm/activities"
                  element={
                    <ProtectedRoute>
                      <Activities />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/tenant/:tenantId/crm/dashboard"
                  element={
                    <ProtectedRoute>
                      <CrmDashboard />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/tenant/:tenantId/crm/calendar"
                  element={
                    <ProtectedRoute>
                      <CalendarPage />
                    </ProtectedRoute>
                  }
                />
                {/* Rental Management Routes */}
                <Route
                  path="/tenant/:tenantId/rental/leases"
                  element={
                    <ProtectedRoute>
                      <Leases />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/tenant/:tenantId/rental/leases/new"
                  element={
                    <ProtectedRoute>
                      <LeaseFormPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/tenant/:tenantId/rental/leases/:leaseId"
                  element={
                    <ProtectedRoute>
                      <LeaseDetailPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/tenant/:tenantId/rental/leases/:leaseId/edit"
                  element={
                    <ProtectedRoute>
                      <LeaseFormPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/tenant/:tenantId/rental/installments"
                  element={
                    <ProtectedRoute>
                      <Installments />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/tenant/:tenantId/rental/installments/:installmentId"
                  element={
                    <ProtectedRoute>
                      <InstallmentDetailPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/tenant/:tenantId/rental/payments"
                  element={
                    <ProtectedRoute>
                      <Payments />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/tenant/:tenantId/rental/payments/:paymentId"
                  element={
                    <ProtectedRoute>
                      <PaymentDetailPage />
                    </ProtectedRoute>
                  }
                />
                {/* Maintenance Routes */}
                <Route
                  path="/tenant/:tenantId/maintenance"
                  element={
                    <ProtectedRoute>
                      <TicketList />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/tenant/:tenantId/maintenance/new"
                  element={
                    <ProtectedRoute>
                      <CreateTicket />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/tenant/:tenantId/maintenance/:ticketId/edit"
                  element={
                    <ProtectedRoute>
                      <EditTicket />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/tenant/:tenantId/maintenance/:ticketId"
                  element={
                    <ProtectedRoute>
                      <TicketDetail />
                    </ProtectedRoute>
                  }
                />
                {/* Manager Maintenance Routes */}
                <Route
                  path="/tenant/:tenantId/admin/maintenance/tickets"
                  element={
                    <ProtectedRoute>
                      <ManagerTickets />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/tenant/:tenantId/admin/maintenance/tickets/:ticketId"
                  element={
                    <ProtectedRoute>
                      <ManagerTicketDetail />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/tenant/:tenantId/admin/maintenance/vendors"
                  element={
                    <ProtectedRoute>
                      <Vendors />
                    </ProtectedRoute>
                  }
                />
                {/* Communication: email + WhatsApp notifications */}
                <Route
                  path="/tenant/:tenantId/communication/email-notifications"
                  element={
                    <ProtectedRoute>
                      <EmailNotificationsUnifiedPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/tenant/:tenantId/communication/whatsapp-notifications"
                  element={
                    <ProtectedRoute>
                      <WhatsAppNotificationsPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/tenant/:tenantId/communication/whatsapp-group-message"
                  element={
                    <ProtectedRoute>
                      <WhatsAppGroupMessagePage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/tenant/:tenantId/email-notifications"
                  element={
                    <ProtectedRoute>
                      <EmailNotificationsUnifiedPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/tenant/:tenantId/newsletter/lists"
                  element={
                    <ProtectedRoute>
                      <NewsletterListsPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/tenant/:tenantId/newsletter/campaigns"
                  element={
                    <ProtectedRoute>
                      <NewsletterCampaignsPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/tenant/:tenantId/newsletter/templates"
                  element={
                    <ProtectedRoute>
                      <NewsletterTemplatesPage />
                    </ProtectedRoute>
                  }
                />
                {/* Transactions Routes */}
                <Route
                  path="/transactions"
                  element={
                    <ProtectedRoute>
                      <Transactions />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/transactions/sales"
                  element={
                    <ProtectedRoute>
                      <Transactions />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/transactions/rentals"
                  element={
                    <ProtectedRoute>
                      <Transactions />
                    </ProtectedRoute>
                  }
                />
                {/* Reports Route */}
                <Route
                  path="/reports"
                  element={
                    <ProtectedRoute>
                      <Reports />
                    </ProtectedRoute>
                  }
                />
                {/* Tenant Portal Routes */}
                <Route
                  path="/tenant"
                  element={
                    <ProtectedRoute>
                      <TenantPortalLayout />
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
                {/* Owner Portal routes */}
                <Route
                  path="/owner"
                  element={
                    <ProtectedRoute>
                      <OwnerPortalLayout />
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
                <Route
                  path="/settings"
                  element={
                    <ProtectedRoute>
                      <SettingsLayout />
                    </ProtectedRoute>
                  }
                >
                  <Route index element={<Navigate to="/settings/profile" replace />} />
                  <Route path="profile" element={<ProfilePage />} />
                </Route>
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
              </Routes>
            </Suspense>
          </Router>
        </AuthProvider>
      </ConfigProvider>
    </ErrorBoundary>
  );
}

export default App;
