import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { App as AntApp } from 'antd';
import { PropertyVisitsList } from '../../components/properties/PropertyVisitsList';
import { PropertyVisitCalendar } from '../../components/properties/PropertyVisitCalendar';

const getPropertyVisits = vi.fn();
const getCalendarVisits = vi.fn();

vi.mock('../../services/property-service', () => ({
  __esModule: true,
  getPropertyVisits: (...args: unknown[]) => getPropertyVisits(...args),
  updateVisitStatus: vi.fn(),
  completePropertyVisit: vi.fn(),
  getCalendarVisits: (...args: unknown[]) => getCalendarVisits(...args)
}));
vi.mock('../../services/membership-service', () => ({
  __esModule: true,
  listMembers: vi.fn(async () => ({ success: true, data: { members: [] } }))
}));

const wrap = (ui: React.ReactElement) => (
  <MemoryRouter>
    <AntApp>{ui}</AntApp>
  </MemoryRouter>
);

describe('Visites du bien : erreur et état vide', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('liste : une erreur de chargement propose « Réessayer » et recharge', async () => {
    getPropertyVisits.mockRejectedValueOnce(new Error('réseau')).mockResolvedValueOnce([]);
    render(wrap(<PropertyVisitsList propertyId="p1" tenantId="t1" />));

    const retry = await screen.findByRole('button', { name: 'Réessayer' });
    fireEvent.click(retry);

    await waitFor(() => expect(getPropertyVisits).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('Aucune visite pour ce bien')).toBeTruthy();
  });

  it('calendrier : une erreur n’est pas présentée comme un agenda vide', async () => {
    getCalendarVisits.mockRejectedValueOnce(new Error('réseau')).mockResolvedValueOnce({});
    render(wrap(<PropertyVisitCalendar tenantId="t1" />));

    expect(await screen.findByText('Impossible de charger les visites')).toBeTruthy();
    expect(screen.queryByText('Aucune visite planifiée')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(await screen.findByText('Aucune visite planifiée')).toBeTruthy();
  });
});
