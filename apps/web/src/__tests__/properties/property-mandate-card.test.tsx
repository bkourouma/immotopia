import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { PropertyMandateCard } from '../../components/properties/PropertyMandateCard';

/**
 * Mandat de gestion d'un bien en mandat (CLIENT) : consulté, créé, révoqué
 * depuis la fiche. Invisible pour un bien de l'agence (BUG-2026-09-28-019).
 */

const getProperty = vi.fn();
const getPropertyMandates = vi.fn();
const createMandate = vi.fn();
const revokeMandate = vi.fn();

vi.mock('../../services/property-service', () => ({
  getProperty: (...a: unknown[]) => getProperty(...a),
  getPropertyMandates: (...a: unknown[]) => getPropertyMandates(...a),
  createMandate: (...a: unknown[]) => createMandate(...a),
  revokeMandate: (...a: unknown[]) => revokeMandate(...a)
}));

const MANDAT = {
  id: 'm1',
  startDate: '2026-09-01T00:00:00.000Z',
  owner: { fullName: 'Kouassi Yao OI', email: 'proprio.oi@recette.test' }
};

function monter() {
  return render(
    <AntApp>
      <PropertyMandateCard tenantId="agence-1" propertyId="bien-1" />
    </AntApp>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('PropertyMandateCard', () => {
  it("n'affiche rien pour un bien de l'agence", async () => {
    getProperty.mockResolvedValue({ id: 'bien-1', ownershipType: 'TENANT' });
    const { container } = monter();
    await waitFor(() => expect(getProperty).toHaveBeenCalled());
    expect(getPropertyMandates).not.toHaveBeenCalled();
    expect(container.textContent).toBe('');
  });

  it('montre le propriétaire du mandat actif et le révoque', async () => {
    getProperty.mockResolvedValue({ id: 'bien-1', ownershipType: 'CLIENT' });
    getPropertyMandates.mockResolvedValueOnce([MANDAT]).mockResolvedValue([]);
    revokeMandate.mockResolvedValue({});
    monter();

    expect(await screen.findByText('Kouassi Yao OI')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Révoquer le mandat' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Révoquer' }));

    await waitFor(() => expect(revokeMandate).toHaveBeenCalledWith('agence-1', 'bien-1', 'm1'));
    expect(await screen.findByText("Aucun mandat de gestion actif pour l'agence.")).toBeInTheDocument();
  });

  it('crée un mandat quand il n’y en a plus', async () => {
    getProperty.mockResolvedValue({ id: 'bien-1', ownershipType: 'CLIENT' });
    getPropertyMandates.mockResolvedValueOnce([]).mockResolvedValue([MANDAT]);
    createMandate.mockResolvedValue(MANDAT);
    monter();

    await userEvent.click(await screen.findByRole('button', { name: 'Créer un mandat de gestion' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Créer le mandat' }));

    await waitFor(() =>
      expect(createMandate).toHaveBeenCalledWith(
        'agence-1',
        'bien-1',
        expect.objectContaining({ startDate: expect.any(String) })
      )
    );
    expect(await screen.findByText('Kouassi Yao OI')).toBeInTheDocument();
  });
});
