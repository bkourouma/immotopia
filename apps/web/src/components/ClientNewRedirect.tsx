import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export const ClientNewRedirect: React.FC = () => {
  const { tenantMembership } = useAuth();
  if (!tenantMembership?.tenantId) {
    return <Navigate to="/dashboard" replace />;
  }
  return <Navigate to={`/tenant/${tenantMembership.tenantId}/crm/contacts/new`} replace />;
};

