import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ConfigProvider } from 'antd';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ClientNewRedirect } from './components/ClientNewRedirect';
import { Register } from './pages/Register';
import { VerifyEmail } from './pages/VerifyEmail';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Properties } from './pages/properties/Properties';
import { PropertyCreate } from './pages/properties/PropertyCreate';
import { PropertyEdit } from './pages/properties/PropertyEdit';
import { PropertyDetail } from './pages/properties/PropertyDetail';
import { PropertyPublic } from './pages/properties/PropertyPublic';
import { PropertyPublicDetail } from './pages/properties/PropertyPublicDetail';
import { PropertyVisitsCalendar } from './pages/properties/PropertyVisitsCalendar';
import { PatrimoineOverviewPage } from './pages/patrimoine/PatrimoineOverviewPage';
import { PatrimoinePerformancePage } from './pages/patrimoine/PatrimoinePerformancePage';
import { WorkProgramsPage } from './pages/patrimoine/work-programs/WorkProgramsPage';
import { OwnerStatementsPage } from './pages/patrimoine/statements/OwnerStatementsPage';
import { OwnerStatementDetailPage } from './pages/patrimoine/statements/OwnerStatementDetailPage';
import { SyndicsList } from './pages/syndics/SyndicsList';
import { SyndicDetail } from './pages/syndics/SyndicDetail';
import { SyndicLots } from './pages/syndics/SyndicLots';
import { SyndicCharges } from './pages/syndics/SyndicCharges';
import { SyndicMeetings } from './pages/syndics/SyndicMeetings';
import { SyndicMeetingDetail } from './pages/syndics/SyndicMeetingDetail';
import { SyndicProviders } from './pages/syndics/SyndicProviders';
import { SyndicDocuments } from './pages/syndics/SyndicDocuments';
import { SyndicFinances } from './pages/syndics/SyndicFinances';
import { SyndicRecovery } from './pages/syndics/SyndicRecovery';
import { SyndicOwnerAccount } from './pages/syndics/SyndicOwnerAccount';
import { SyndicAccounting } from './pages/syndics/SyndicAccounting';
import { SyndicBudgets } from './pages/syndics/SyndicBudgets';
import { SyndicProfilesIncidents } from './pages/syndics/SyndicProfilesIncidents';
import { ForgotPassword } from './pages/ForgotPassword';
import { ResetPassword } from './pages/ResetPassword';
import { AuthCallback } from './pages/AuthCallback';
import { AcceptInvitePage } from './pages/auth/AcceptInvitePage';
import { SettingsLayout } from './pages/settings/SettingsLayout';
import { ProfilePage } from './pages/settings/ProfilePage';
// Admin pages
import { TenantsList } from './pages/admin/TenantsList';
import { TenantDetail } from './pages/admin/TenantDetail';
import { TenantCreate } from './pages/admin/TenantCreate';
import { Statistics } from './pages/admin/Statistics';
import { AuditLogs } from './pages/admin/AuditLogs';
import { AdminCollaboratorDetail } from './pages/admin/AdminCollaboratorDetail';
import { AdminInviteCollaborator } from './pages/admin/AdminInviteCollaborator';
import { RolesPermissions } from './pages/admin/RolesPermissions';
// Tenant pages
import { CollaboratorsList } from './pages/tenant/CollaboratorsList';
import { CollaboratorDetail } from './pages/tenant/CollaboratorDetail';
import { InviteCollaborator } from './pages/tenant/InviteCollaborator';
import { InvitationsList } from './pages/tenant/InvitationsList';
import { TenantSettings } from './pages/tenant/TenantSettings';
// CRM pages
import { Contacts } from './pages/crm/Contacts';
import { ContactFormPage } from './pages/crm/ContactFormPage';
import { ContactDetailPage } from './pages/crm/ContactDetailPage';
import { Deals } from './pages/crm/Deals';
import { DealDetailPage } from './pages/crm/DealDetailPage';
import { DealFormPage } from './pages/crm/DealFormPage';
import { Activities } from './pages/crm/Activities';
import { CrmDashboard } from './pages/crm/Dashboard';
import { CalendarPage } from './pages/crm/Calendar';
// Rental pages
import { Leases } from './pages/rental/Leases';
import { LeaseFormPage } from './pages/rental/LeaseFormPage';
import { LeaseDetailPage } from './pages/rental/LeaseDetailPage';
import { Installments } from './pages/rental/Installments';
import { InstallmentDetailPage } from './pages/rental/InstallmentDetailPage';
import { Payments } from './pages/rental/Payments';
import { Penalties } from './pages/rental/Penalties';
import { Deposits } from './pages/rental/Deposits';
import { Documents } from './pages/rental/Documents';
import { PaymentDetailPage } from './pages/rental/PaymentDetailPage';
// Maintenance pages
import { TicketList } from './pages/tenant/maintenance/TicketList';
import { TicketDetail } from './pages/tenant/maintenance/TicketDetail';
import { CreateTicket } from './pages/tenant/maintenance/CreateTicket';
import { EditTicket } from './pages/tenant/maintenance/EditTicket';
import { Tickets as ManagerTickets } from './pages/admin/maintenance/Tickets';
import { TicketDetail as ManagerTicketDetail } from './pages/admin/maintenance/TicketDetail';
import { Vendors } from './pages/admin/maintenance/Vendors';
// Communication pages (email + WhatsApp notifications)
import { EmailNotificationsUnifiedPage } from './pages/communication/EmailNotificationsUnifiedPage';
import { WhatsAppNotificationsPage } from './pages/communication/WhatsAppNotificationsPage';
import { WhatsAppGroupMessagePage } from './pages/communication/WhatsAppGroupMessagePage';
// Newsletter pages
import { NewsletterListsPage } from './pages/newsletter/NewsletterListsPage';
import { NewsletterCampaignsPage } from './pages/newsletter/NewsletterCampaignsPage';
import { NewsletterTemplatesPage } from './pages/newsletter/NewsletterTemplatesPage';
import { UnsubscribePage } from './pages/newsletter/UnsubscribePage';
import { ConfirmPage } from './pages/newsletter/ConfirmPage';
import { SubscribePage } from './pages/newsletter/SubscribePage';
// Client pages
import { Clients } from './pages/Clients';
import { ClientGroups } from './pages/ClientGroups';
import { DocumentTemplates } from './pages/documents/DocumentTemplates';
// Transactions page
import { Transactions } from './pages/Transactions';
// Reports page
import { Reports } from './pages/Reports';
// Tenant Portal pages
import TenantPortalLayout from './pages/TenantPortal/Layout';
import TenantDashboard from './pages/TenantPortal/Dashboard';
import TenantLease from './pages/TenantPortal/Lease';
import TenantPayments from './pages/TenantPortal/Payments';
import TenantDeposit from './pages/TenantPortal/Deposit';
import TenantMaintenance from './pages/TenantPortal/Maintenance';
import TenantDocuments from './pages/TenantPortal/Documents';
// Owner Portal pages
import OwnerPortalLayout from './pages/OwnerPortal/Layout';
import OwnerDashboard from './pages/OwnerPortal/Dashboard';
import OwnerProperties from './pages/OwnerPortal/Properties';
import OwnerPropertyDetails from './pages/OwnerPortal/PropertyDetails';
import OwnerLeases from './pages/OwnerPortal/Leases';
import OwnerLeaseDetails from './pages/OwnerPortal/LeaseDetails';
import OwnerRevenues from './pages/OwnerPortal/Revenues';
import OwnerInstallments from './pages/OwnerPortal/Installments';
import OwnerPayments from './pages/OwnerPortal/Payments';
import OwnerDeposits from './pages/OwnerPortal/Deposits';
import OwnerMaintenance from './pages/OwnerPortal/Maintenance';
import OwnerDocuments from './pages/OwnerPortal/Documents';
import OwnerReports from './pages/OwnerPortal/Reports';
import OwnerPreferences from './pages/OwnerPortal/Preferences';

function App() {
  return (
    <ErrorBoundary>
      <ConfigProvider>
        <AuthProvider>
          <Router>
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
          </Router>
        </AuthProvider>
      </ConfigProvider>
    </ErrorBoundary>
  );
}

export default App;
