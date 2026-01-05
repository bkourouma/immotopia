import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { ErrorBoundary } from './components/ErrorBoundary';
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
import { ForgotPassword } from './pages/ForgotPassword';
import { ResetPassword } from './pages/ResetPassword';
import { AuthCallback } from './pages/AuthCallback';
// Admin pages
import { TenantsList } from './pages/admin/TenantsList';
import { TenantDetail } from './pages/admin/TenantDetail';
import { TenantCreate } from './pages/admin/TenantCreate';
import { Statistics } from './pages/admin/Statistics';
import { AuditLogs } from './pages/admin/AuditLogs';
import { AdminCollaboratorDetail } from './pages/admin/AdminCollaboratorDetail';
import { AdminInviteCollaborator } from './pages/admin/AdminInviteCollaborator';
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
import { Appointments } from './pages/crm/Appointments';
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
// Client pages
import { Clients } from './pages/Clients';
import { ClientGroups } from './pages/ClientGroups';
import { DocumentTemplates } from './pages/documents/DocumentTemplates';

function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <Router>
          <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
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
            path="/tenant/:tenantId/crm/appointments"
            element={
              <ProtectedRoute>
                <Appointments />
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
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </Router>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;
