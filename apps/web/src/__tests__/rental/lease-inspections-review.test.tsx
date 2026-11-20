import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { LeaseInspectionsPanel } from '../../components/rental/inspections/LeaseInspectionsPanel';

/**
 * Revue fonctionnelle du 2026-11-20 — états des lieux : brouillon local.
 */

const listInspections = vi.fn();
const updateInspection = vi.fn();

vi.mock('../../services/lease-inspections-service', () => ({
  listInspections: (...a: unknown[]) => listInspections(...a),
  createInspection: vi.fn(),
  updateInspection: (...a: unknown[]) => updateInspection(...a),
  finalizeInspection: vi.fn(),
  deleteInspection: vi.fn(),
  compareInspections: vi.fn(),
  uploadInspectionPhoto: vi.fn(),
  deleteInspectionPhoto: vi.fn(),
  fetchInspectionPhotoBlob: vi.fn()
}));

const DRAFT_KEY = 'immotopia:inspection-draft:insp-entree';

function makeInspection() {
  return {
    id: 'insp-entree',
    type: 'ENTRY',
    status: 'DRAFT',
    inspectionDate: '2026-01-10',
    rooms: [
      {
        id: 'room-1',
        name: 'Séjour',
        items: [{ id: 'item-1', label: 'Sol', condition: 'GOOD', comment: null }]
      }
    ],
    meters: { electricity: '', water: '', gas: '' },
    keysCount: null,
    generalComment: '',
    tenantPresent: false,
    tenantSignatoryName: null,
    agentSignatoryName: null,
    deductions: [],
    finalizedAt: null,
    photos: []
  };
}

function mount() {
  return render(
    <AntApp>
      <LeaseInspectionsPanel tenantId="agence-1" leaseId="bail-1" />
    </AntApp>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
});

describe('Brouillon local — revue', () => {
  it('n’écrit aucune copie locale tant que rien n’a été modifié', async () => {
    const user = userEvent.setup({ delay: null });
    listInspections.mockResolvedValue({ success: true, data: [makeInspection()] });
    mount();

    await user.click(await screen.findByRole('button', { name: 'Continuer' }));
    await screen.findByText('Observations générales');

    expect(window.localStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it('ne propose pas de restauration en rouvrant un brouillon laissé intact', async () => {
    const user = userEvent.setup({ delay: null });
    listInspections.mockResolvedValue({ success: true, data: [makeInspection()] });
    mount();

    await user.click(await screen.findByRole('button', { name: 'Continuer' }));
    await screen.findByText('Observations générales');
    await user.click(screen.getByRole('button', { name: 'Retour' }));
    await user.click(await screen.findByRole('button', { name: 'Continuer' }));
    await screen.findByText('Observations générales');

    expect(screen.queryByText('Une saisie locale non enregistrée a été trouvée pour cet état des lieux.')).toBeNull();
  });

  it('garde une copie locale dès qu’une saisie diffère du serveur', async () => {
    const user = userEvent.setup({ delay: null });
    listInspections.mockResolvedValue({ success: true, data: [makeInspection()] });
    mount();

    await user.click(await screen.findByRole('button', { name: 'Continuer' }));
    await screen.findByText('Observations générales');
    const [commentaire] = screen.getAllByRole('textbox').filter(node => node.tagName === 'TEXTAREA');
    await user.type(commentaire, 'Fuite sous l’évier');

    await waitFor(() => expect(window.localStorage.getItem(DRAFT_KEY)).toContain('Fuite sous l’évier'));
  });
});
