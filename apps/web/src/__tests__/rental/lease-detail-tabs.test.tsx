import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { LeaseDetailPage } from '../../pages/rental/LeaseDetailPage';
import { defaultLeaseTab, resolveLeaseTab, withLeaseTab, withTabLifecycle } from '../../pages/rental/lease-detail-tabs';

/** Fiche du bail : onglet actif dans l'URL, un seul onglet monté à la fois. */

const getLease = vi.hoisted(() => vi.fn());
let permissions: Set<string> | null = null;

vi.mock('../../services/rental-service', () => ({
  getLease: (...a: unknown[]) => getLease(...a),
  updateLeaseStatus: vi.fn()
}));
vi.mock('../../services/crm-service', () => ({ getContact: vi.fn() }));
vi.mock('../../hooks/useMenuAccess', () => ({
  useMyMenuAccess: () => ({ disabled: new Set(), enabled: new Set(), permissions, ready: true })
}));
function Onglet({ nom }: { nom: string }) {
  const [params] = useSearchParams();
  return <div>{`${nom} status=${params.get('status') ?? 'aucun'}`}</div>;
}
vi.mock('../../pages/rental/Installments', () => ({
  Installments: () => (
    <>
      <div>mock-installments</div>
      <Onglet nom="echeances" />
    </>
  )
}));
vi.mock('../../pages/rental/Payments', () => ({
  Payments: () => (
    <>
      <div>mock-payments</div>
      <Onglet nom="paiements" />
    </>
  )
}));
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
  permissions = null;
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

  it('withLeaseTab purge les critères des onglets et conserve les paramètres globaux', () => {
    const precedent = new URLSearchParams(
      'ech.q=abc&pai.page=2&pen.status=LATE&doc.type=LEASE&origine=crm&origine=biens'
    );
    const suivant = withLeaseTab(precedent, 'penalties');
    expect(suivant.get('onglet')).toBe('penalties');
    for (const cle of ['ech.q', 'pai.page', 'pen.status', 'doc.type']) expect(suivant.has(cle)).toBe(false);
    expect(suivant.getAll('origine')).toEqual(['crm', 'biens']);
    expect(precedent.get('ech.q')).toBe('abc');
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

  it('changer d’onglet écrit l’URL, démonte l’ancien et efface ses critères', async () => {
    const user = userEvent.setup();
    renderPage('?ech.q=abc&origine=crm');
    await screen.findByText('mock-installments', undefined, T);
    await user.click(screen.getByRole('tab', { name: /Pénalités/ }));
    expect(await screen.findByText('mock-penalties', undefined, T)).toBeInTheDocument();
    await vi.waitFor(() => expect(montes()).toEqual(['mock-penalties']), T);
    const url = screen.getByTestId('url').textContent ?? '';
    expect(url).toContain('onglet=penalties');
    expect(url).not.toContain('ech.q=abc');
    expect(url).toContain('origine=crm');
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

describe('Régressions locatives conservées pendant la fusion', () => {
  it("l'onglet Paiements ne reprend pas le filtre Statut des Échéances", async () => {
    const user = userEvent.setup({ delay: null });
    renderPage('?status=OVERDUE');
    await screen.findByText('echeances status=OVERDUE', undefined, T);
    await user.click(screen.getByRole('tab', { name: /Paiements/ }));
    expect(await screen.findByText('paiements status=aucun', undefined, T)).toBeInTheDocument();
  });

  it("active l'onglet dès l'appui souris, avant le déplacement de la barre", async () => {
    renderPage();
    await screen.findByText('echeances status=aucun', undefined, T);
    fireEvent.mouseDown(screen.getByText('Paiements'));
    expect(await screen.findByText('paiements status=aucun', undefined, T)).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Paiements/ })).toHaveAttribute('aria-selected', 'true');
  });

  it('accepte un lien historique ?tab=payments et garde le sous-onglet transmis', async () => {
    renderPage('?tab=payments&onglet=declarations');
    expect(await screen.findByText('paiements status=aucun', undefined, T)).toBeInTheDocument();
    expect(screen.getByTestId('url').textContent).toContain('onglet=declarations');
  });

  it('écrit aussi ?tab= pour les anciens liens et purge le filtre quitté', async () => {
    const user = userEvent.setup({ delay: null });
    renderPage('?status=OVERDUE');
    await screen.findByText('echeances status=OVERDUE', undefined, T);
    await user.click(screen.getByRole('tab', { name: /Paiements/ }));
    await screen.findByText('paiements status=aucun', undefined, T);
    expect(screen.getByTestId('url').textContent).toContain('tab=payments');
    expect(screen.getByTestId('url').textContent).not.toContain('status=');
  });

  it('garde un filtre reçu si l’onglet déjà affiché est pressé', async () => {
    renderPage('?status=OVERDUE');
    await screen.findByText('echeances status=OVERDUE', undefined, T);
    fireEvent.mouseDown(screen.getByText('Échéances'));
    fireEvent.click(screen.getByRole('tab', { name: /Échéances/ }));
    expect(screen.getByTestId('url').textContent).toContain('status=OVERDUE');
  });

  it('suit un lien historique puis le retour et le suivant du navigateur', async () => {
    function Nav() {
      const navigate = useNavigate();
      return (
        <>
          <button onClick={() => navigate('/tenant/t1/rental/leases/l1?tab=documents')}>documents-lien</button>
          <button onClick={() => navigate(-1)}>précédent-lien</button>
          <button onClick={() => navigate(1)}>suivant-lien</button>
        </>
      );
    }
    render(
      <AntApp>
        <MemoryRouter initialEntries={['/tenant/t1/rental/leases/l1']}>
          <Url />
          <Nav />
          <Routes>
            <Route path="/tenant/:tenantId/rental/leases/:leaseId" element={<LeaseDetailPage />} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    );
    await screen.findByText('mock-installments', undefined, T);
    fireEvent.click(screen.getByText('documents-lien'));
    expect(await screen.findByText('mock-documents', undefined, T)).toBeInTheDocument();
    fireEvent.click(screen.getByText('précédent-lien'));
    expect(await screen.findByText('mock-installments', undefined, T)).toBeInTheDocument();
    fireEvent.click(screen.getByText('suivant-lien'));
    expect(await screen.findByText('mock-documents', undefined, T)).toBeInTheDocument();
  });

  it('cache Modifier sans droit RENTAL_LEASES_EDIT', async () => {
    permissions = new Set(['RENTAL_LEASES_VIEW']);
    renderPage();
    await screen.findByText('mock-installments', undefined, T);
    expect(screen.queryByRole('button', { name: /Modifier/ })).toBeNull();
  });

  it('affiche Modifier avec le droit RENTAL_LEASES_EDIT', async () => {
    permissions = new Set(['RENTAL_LEASES_VIEW', 'RENTAL_LEASES_EDIT']);
    renderPage();
    await screen.findByText('mock-installments', undefined, T);
    expect(screen.getByRole('button', { name: /Modifier/ })).toBeInTheDocument();
  });
});
