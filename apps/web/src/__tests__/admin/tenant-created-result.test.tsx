import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TenantCreatedResult } from '../../components/admin/TenantCreatedResult';
import type { ProvisionTenantResult } from '../../services/tenant-service';

/** BUG-2026-09-30-008 : un rejeu ne se présente pas comme une création et ne montre pas de faux lien. */
function result(overrides: Partial<ProvisionTenantResult> = {}): ProvisionTenantResult {
  return {
    tenant: { id: 't1', name: 'Agence Kipe', slug: 'agence-kipe', type: 'AGENCY', status: 'ACTIVE' },
    modules: ['MODULE_AGENCY'],
    subscription: {
      planKey: null,
      billingCycle: 'MONTHLY',
      status: 'TRIALING',
      currentPeriodEnd: '2026-10-30T00:00:00Z'
    },
    admin: { userId: 'u1', email: 'a@x.test', fullName: 'Awa', existingUser: false },
    invitation: { id: 'i1', expiresAt: '2026-10-07T00:00:00Z', acceptUrl: 'http://x/accept?token=abc' },
    emailSent: true,
    ...overrides
  };
}

function renderResult(r: ProvisionTenantResult) {
  return render(
    <MemoryRouter>
      <TenantCreatedResult
        result={r}
        onResend={vi.fn()}
        resending={false}
        onCreateAnother={vi.fn()}
        onClose={vi.fn()}
      />
    </MemoryRouter>
  );
}

describe('<TenantCreatedResult>', () => {
  it('création : « Agence créée » et lien affiché', () => {
    renderResult(result());
    expect(screen.getByText('Agence créée')).toBeInTheDocument();
    expect(screen.getByDisplayValue('http://x/accept?token=abc')).toBeInTheDocument();
  });

  it('rejeu : « Agence déjà créée », pas de champ de lien, invitation précédente valide', () => {
    renderResult(
      result({
        alreadyExisted: true,
        emailSent: false,
        invitation: { id: 'i1', expiresAt: '2026-10-07T00:00:00Z', acceptUrl: '' }
      })
    );
    expect(screen.getByText('Agence déjà créée')).toBeInTheDocument();
    expect(screen.queryByText('Agence créée')).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getAllByText(/reste valide/).length).toBeGreaterThan(0);
  });
});
