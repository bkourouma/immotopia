import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { LeaseDetailPage } from '../../pages/rental/LeaseDetailPage';
import { defaultLeaseTab, resolveLeaseTab, withLeaseTab, withTabLifecycle } from '../../pages/rental/lease-detail-tabs';

/** Fiche du bail : onglet actif dans l'URL, un seul onglet monté à la fois. */

const getLease = vi.hoisted(() => vi.fn());

vi.mock('../../services/rental-service', () => ({
  getLease: (...a: unknown[]) => getLease(...a),
  updateLeaseStatus: vi.fn()
}));
vi.mock('../../services/crm-service', () => ({ getContact: vi.fn() }));
vi.mock('../../pages/rental/Installments', () => ({ Installments: () => <div>mock-installments</div> }));
vi.mock('../../pages/rental/Payments', () => ({ Payments: () => <div>mock-payments</div> }));
vi.mock('../../pages/rental/Penalties', () => ({ Penalties: () => <div>mock-penalties</div> }));
vi.mock('../../pages/rental/Deposits', () => ({
  Deposits: () => {
    const [saisie, setSaisie] = React.useState('');
    return (
      <div>
        mock-deposits
        <input aria-label="saisie-depot" value={saisie} onChange={e => setSaisie(e.target.value)} />
      </div>
    );
  }
}));
vi.mock('../../pages/rental/Documents', () => ({ Documents: () => <div>mock-documents</div> }));
vi.mock('../../components/rental/LeaseManagementTermsCard', () => ({ LeaseManagementTermsCard: () => null }));
vi.mock('../../components/rental/LeaseLifecyclePanel', () => ({
  LeaseLifecyclePanel: () => <div>mock-lifecycle</div>
}));
vi.mock('../../components/rental/inspections/LeaseInspectionsPanel', () => ({
  LeaseInspectionsPanel: () => <div>mock-inspections</div>
}));
vi.mock('../../components/signature/SignaturesPanel', () => ({ SignaturesPanel: () => <div>mock-signatures</div> }));
vi.mock('../../components/rental/direct-debit/LeaseDirectDebitPanel', () => ({
  LeaseDirectDebitPanel: () => <div>mock-direct-debit</div>
}));

function Url() {
  return <div data-testid="url">{useLocation().search}</div>;
}

function renderPage(search = '') {
  return render(
    <AntApp>
      <MemoryRouter initialEntries={[`/tenant/t1/rental/leases/l1${search}`]}>
        <Url />
        <Routes>
          <Route path="/tenant/:tenantId/rental/leases/:leaseId" element={<LeaseDetailPage />} />
        </Routes>
      </MemoryRouter>
    </AntApp>
  );
}

const T = { timeout: 8000 };
const MOCKS = [
  'mock-installments',
  'mock-payments',
  'mock-penalties',
  'mock-deposits',
  'mock-lifecycle',
  'mock-inspections',
  'mock-signatures',
  'mock-direct-debit',
  'mock-documents'
];

/** Les onglets réellement montés dans le DOM. */
function montes() {
  return MOCKS.filter(texte => screen.queryByText(texte) !== null);
}

beforeEach(() => {
  getLease.mockReset();
  getLease.mockResolvedValue({
    success: true,
    data: {
      id: 'l1',
      lease_number: 'BAIL-001',
      status: 'ACTIVE',
      start_date: '2026-01-01',
      end_date: '2027-01-01',
      rent_amount: 100000,
      currency: 'XOF',
      property: { id: 'p1', title: 'Villa', transactionModes: ['RENTAL'] },
      primaryRenter: null,
      ownerClient: null,
      coRenters: []
    }
  });
});

describe('lease-detail-tabs (logique)', () => {
  it('défaut : documents pour une vente, échéances sinon', () => {
    expect(defaultLeaseTab(true)).toBe('documents');
    expect(defaultLeaseTab(false)).toBe('installments');
  });

  it('clé inconnue ou absente : repli sur le défaut', () => {
    const cles = ['installments', 'payments'];
    expect(resolveLeaseTab('payments', cles, 'installments')).toBe('payments');
    expect(resolveLeaseTab('bogus', cles, 'installments')).toBe('installments');
    expect(resolveLeaseTab(null, cles, 'installments')).toBe('installments');
  });

  it('withLeaseTab conserve les autres paramètres', () => {
    const suivant = withLeaseTab(new URLSearchParams('ech.q=abc&pai.page=2'), 'penalties');
    expect(suivant.get('onglet')).toBe('penalties');
    expect(suivant.get('ech.q')).toBe('abc');
    expect(suivant.get('pai.page')).toBe('2');
  });
});

describe('withTabLifecycle', () => {
  it('démonte tous les onglets sauf le dépôt de garantie', () => {
    const items = withTabLifecycle<{ key: string; destroyOnHidden?: boolean }>([
      { key: 'installments' },
      { key: 'deposit' }
    ]);
    expect(items[0].destroyOnHidden).toBe(true);
    expect(items[1].destroyOnHidden).toBe(false);
  });

  it('garde aussi monté l’onglet des états des lieux (formulaire d’édition en ligne)', () => {
    const items = withTabLifecycle<{ key: string; destroyOnHidden?: boolean }>([
      { key: 'payments' },
      { key: 'inspections' }
    ]);
    expect(items[0].destroyOnHidden).toBe(true);
    expect(items[1].destroyOnHidden).toBe(false);
  });
});

describe('Fiche du bail : onglets paresseux', () => {
  it('monte seulement l’onglet par défaut (échéances)', async () => {
    renderPage();
    expect(await screen.findByText('mock-installments', undefined, T)).toBeInTheDocument();
    expect(montes()).toEqual(['mock-installments']);
  });

  it('?onglet=payments ouvre les paiements seuls', async () => {
    renderPage('?onglet=payments');
    expect(await screen.findByText('mock-payments', undefined, T)).toBeInTheDocument();
    expect(montes()).toEqual(['mock-payments']);
  });

  it('clé inconnue : onglet par défaut', async () => {
    renderPage('?onglet=nimporte-quoi');
    expect(await screen.findByText('mock-installments', undefined, T)).toBeInTheDocument();
    expect(montes()).toEqual(['mock-installments']);
  });

  it('changer d’onglet écrit l’URL, démonte l’ancien et garde les autres paramètres', async () => {
    const user = userEvent.setup();
    renderPage('?ech.q=abc');
    await screen.findByText('mock-installments', undefined, T);
    await user.click(screen.getByRole('tab', { name: /Pénalités/ }));
    expect(await screen.findByText('mock-penalties', undefined, T)).toBeInTheDocument();
    await vi.waitFor(() => expect(montes()).toEqual(['mock-penalties']), T);
    const url = screen.getByTestId('url').textContent ?? '';
    expect(url).toContain('onglet=penalties');
    expect(url).toContain('ech.q=abc');
  });

  it('expose neuf onglets pour un bail locatif', async () => {
    renderPage();
    await screen.findByText('mock-installments', undefined, T);
    expect(within(document.body).getAllByRole('tab')).toHaveLength(9);
  });

  it('le dépôt de garantie garde sa saisie après un changement d’onglet ; les listes lourdes sont démontées', async () => {
    const user = userEvent.setup();
    renderPage('?onglet=deposit');
    await user.type(await screen.findByLabelText('saisie-depot', undefined, T), 'abc');
    await user.click(screen.getByRole('tab', { name: /Pénalités/ }));
    expect(await screen.findByText('mock-penalties', undefined, T)).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: /Échéances/ }));
    expect(await screen.findByText('mock-installments', undefined, T)).toBeInTheDocument();
    expect(screen.queryByText('mock-penalties')).toBeNull();
    await user.click(screen.getByRole('tab', { name: /Dépôt/ }));
    expect(await screen.findByLabelText('saisie-depot', undefined, T)).toHaveValue('abc');
    await vi.waitFor(() => expect(screen.queryByText('mock-installments')).toBeNull(), T);
  });
});
