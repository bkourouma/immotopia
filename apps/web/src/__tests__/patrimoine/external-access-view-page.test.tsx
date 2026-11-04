import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import { ExternalAccessViewPage } from '../../pages/public/ExternalAccessViewPage';
import apiClient from '../../utils/api-client';

/** Le mock se pose à la frontière réseau ; le vrai service tourne par-dessus. */
vi.mock('../../utils/api-client', () => ({
  __esModule: true,
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }
}));

// La barre de recherche des biens choisit sa mise en page selon la largeur : bureau.
vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));

const mockPost = (apiClient as unknown as { post: ReturnType<typeof vi.fn> }).post;

const INVALID = 'Lien invalide ou expiré.';

const baseProperty = {
  reference: 'BIEN-001',
  title: 'Villa des Palmiers',
  address: 'Rue des Jardins',
  city: 'Abidjan',
  sharePercent: null
};

function makeView(overrides: Record<string, unknown> = {}) {
  return {
    agencyName: 'Agence Soleil',
    grantType: 'NOTARY',
    recipientName: 'Maître Koné',
    ownerName: 'Awa Konan',
    linkExpiresAt: '2026-10-15T10:00:00.000Z',
    accessExpiresAt: null,
    currency: 'XOF',
    sections: ['VALUATIONS'],
    summary: { propertyCount: 1, totalEstimatedValue: 120000000, totalLatentCapitalGain: 20000000 },
    properties: [
      {
        ...baseProperty,
        valuation: {
          estimatedValue: 120000000,
          valuatedAt: '2026-09-01T00:00:00.000Z',
          acquisitionCost: 100000000,
          currency: 'XOF',
          latentCapitalGain: 20000000,
          history: []
        }
      }
    ],
    ...overrides
  };
}

/** La page publique vit sous le routeur de l'application : la recherche des biens écrit dans l'URL. */
function renderPage() {
  return render(
    <BrowserRouter>
      <ExternalAccessViewPage />
    </BrowserRouter>
  );
}

// Délai large : la suite complète tourne en parallèle et peut être lente.
const T = { timeout: 8000 };

const openTab = (name: string) => userEvent.click(screen.getByRole('tab', { name }));

function setHash(hash: string) {
  window.history.replaceState(null, '', `/acces-partage${hash}`);
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  window.history.replaceState(null, '', '/');
  vi.restoreAllMocks();
});

describe('ExternalAccessViewPage', () => {
  it('lit le jeton du fragment, le retire de l’adresse et le poste en corps seulement', async () => {
    setHash('#jeton-abc');
    mockPost.mockResolvedValueOnce({ status: 200, data: { success: true, data: makeView() } });

    const { container } = renderPage();

    expect(await screen.findByText('Accès en lecture seule accordé par Agence Soleil')).toBeInTheDocument();
    expect(window.location.hash).toBe('');
    expect(window.location.href).not.toContain('jeton-abc');
    expect(mockPost).toHaveBeenCalledTimes(1);
    const [url, body, config] = mockPost.mock.calls[0];
    expect(url).toBe('/public/external-access/patrimoine');
    expect(url).not.toContain('jeton-abc');
    expect(body).toEqual({ token: 'jeton-abc' });
    expect(config).toMatchObject({ withCredentials: false });
    expect(container.innerHTML).not.toContain('jeton-abc');
  });

  it('ne poste qu’une fois sous React.StrictMode (une ouverture = une consultation)', async () => {
    setHash('#jeton-abc');
    mockPost.mockResolvedValue({ status: 200, data: { success: true, data: makeView() } });

    render(
      <React.StrictMode>
        <BrowserRouter>
          <ExternalAccessViewPage />
        </BrowserRouter>
      </React.StrictMode>
    );

    expect(await screen.findByText('Accès en lecture seule accordé par Agence Soleil')).toBeInTheDocument();
    expect(mockPost).toHaveBeenCalledTimes(1);
  });

  it('est en lecture seule : aucun champ de saisie ni lien sortant', async () => {
    setHash('#jeton-abc');
    mockPost.mockResolvedValueOnce({ status: 200, data: { success: true, data: makeView() } });
    const { container } = renderPage();
    await screen.findByText(/Accès en lecture seule accordé par/);
    // Seule saisie : le champ de recherche local des biens (aucun formulaire, rien n'est envoyé).
    expect(container.querySelectorAll('form, textarea')).toHaveLength(0);
    for (const field of Array.from(container.querySelectorAll('input, select'))) {
      expect(field.closest('[role="search"]')).not.toBeNull();
    }
    expect(container.querySelectorAll('a[href]')).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Imprimer / enregistrer en PDF' })).toBeInTheDocument();
  });

  it('pose noindex et no-referrer le temps du montage', async () => {
    setHash('#jeton-abc');
    mockPost.mockResolvedValueOnce({ status: 200, data: { success: true, data: makeView() } });
    const { unmount } = renderPage();
    await screen.findByText(/Accès en lecture seule accordé par/);
    expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex, nofollow');
    expect(document.querySelector('meta[name="referrer"]')?.getAttribute('content')).toBe('no-referrer');
    unmount();
    expect(document.querySelector('meta[name="robots"]')).toBeNull();
    expect(document.querySelector('meta[name="referrer"]')).toBeNull();
  });

  it('ne rend que les rubriques présentes dans la réponse', async () => {
    setHash('#jeton-abc');
    mockPost.mockResolvedValueOnce({ status: 200, data: { success: true, data: makeView() } });
    renderPage();

    expect(await screen.findByText('Valorisations')).toBeInTheDocument();
    expect(screen.getByText('Plus-value latente')).toBeInTheDocument();
    for (const absent of [
      'Rendement et ratios',
      'Emprunts',
      'Dépenses',
      'Baux et loyers',
      'Documents partageables',
      'Titres et propriété'
    ]) {
      expect(screen.queryByText(absent)).not.toBeInTheDocument();
    }
  });

  it('rend chaque rubrique accordée', async () => {
    setHash('#jeton-abc');
    const view = makeView({
      sections: ['VALUATIONS', 'YIELD_RATIOS', 'LOANS', 'EXPENSES', 'RENTS', 'DOCUMENTS', 'TITLES_OWNERSHIP'],
      properties: [
        {
          ...baseProperty,
          sharePercent: 50,
          yield: { grossYield: 8, netYield: 6, netNetYield: null, annualRent: 9600000, annualExpenses: 1200000 },
          loans: [
            {
              lender: 'Banque Atlantique',
              capitalAmount: 50000000,
              remainingCapital: 30000000,
              interestRate: 7,
              monthlyPayment: 600000,
              currency: 'XOF',
              startDate: '2022-01-01T00:00:00.000Z',
              endDate: null,
              status: 'ACTIVE'
            }
          ],
          expenses: {
            totalLast12Months: 1200000,
            items: [{ date: '2026-03-01T00:00:00.000Z', category: 'Taxe foncière', amount: 400000 }]
          },
          rents: [
            {
              status: 'ACTIVE',
              startDate: '2025-01-01T00:00:00.000Z',
              endDate: null,
              rentAmount: 800000,
              chargesAmount: null,
              billingFrequency: 'MONTHLY'
            }
          ],
          titles: {
            propertyType: 'VILLA',
            surface: 240,
            holdings: [
              {
                entityName: 'SCI Les Palmiers',
                legalForm: 'SCI',
                country: 'CI',
                rccm: null,
                taxId: null,
                sharePercent: 100
              }
            ],
            ownerSharePercent: 50
          },
          documents: [
            {
              ref: 'ref-1',
              fileName: 'acte.pdf',
              documentType: 'NOTARIAL_DEED',
              fileSize: 2048,
              mimeType: 'application/pdf',
              createdAt: '2026-01-01T00:00:00.000Z'
            }
          ],
          valuation: undefined
        }
      ]
    });
    mockPost.mockResolvedValueOnce({ status: 200, data: { success: true, data: view } });
    renderPage();

    // Une rubrique par onglet, dans l'ordre ; « Aperçu » d'abord.
    await screen.findByRole('tab', { name: 'Aperçu' }, T);
    expect(screen.getAllByRole('tab').map(tab => tab.textContent)).toEqual([
      'Aperçu',
      'Rendement et ratios',
      'Emprunts',
      'Dépenses',
      'Baux et loyers',
      'Titres et propriété',
      'Documents partageables'
    ]);
    expect(screen.queryByText('Banque Atlantique')).not.toBeInTheDocument();

    await openTab('Emprunts');
    expect(await screen.findByText('Banque Atlantique')).toBeInTheDocument();
    await openTab('Titres et propriété');
    expect(await screen.findByText('SCI Les Palmiers')).toBeInTheDocument();
    // Le contenu de l'onglet quitté est démonté (destroyOnHidden).
    expect(screen.queryByText('Banque Atlantique')).not.toBeInTheDocument();
    await openTab('Documents partageables');
    expect(await screen.findByText('acte.pdf')).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Valorisations' })).not.toBeInTheDocument();
  });

  it('télécharge un document en POST corps, jeton gardé en mémoire', async () => {
    setHash('#jeton-abc');
    const view = makeView({
      sections: ['DOCUMENTS'],
      properties: [
        {
          ...baseProperty,
          documents: [
            {
              ref: 'ref-1',
              fileName: 'acte.pdf',
              documentType: 'NOTARIAL_DEED',
              fileSize: 2048,
              mimeType: 'application/pdf',
              createdAt: '2026-01-01T00:00:00.000Z'
            }
          ]
        }
      ]
    });
    mockPost.mockResolvedValueOnce({ status: 200, data: { success: true, data: view } });
    const blob = new Blob(['pdf']);
    mockPost.mockResolvedValueOnce({
      status: 200,
      data: blob,
      headers: { 'content-disposition': 'attachment; filename="acte.pdf"' }
    });
    const createObjectURL = vi.fn(() => 'blob:fake');
    const revokeObjectURL = vi.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    let savedAs = '';
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      savedAs = this.download;
    });

    renderPage();
    await userEvent.click(await screen.findByRole('tab', { name: 'Documents partageables' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Télécharger acte.pdf' }));

    await waitFor(() => expect(createObjectURL).toHaveBeenCalledWith(blob));
    expect(savedAs).toBe('acte.pdf');
    const [url, body, config] = mockPost.mock.calls[1];
    expect(url).toBe('/public/external-access/documents/download');
    expect(url).not.toContain('jeton-abc');
    expect(body).toEqual({ token: 'jeton-abc', documentRef: 'ref-1' });
    expect(config).toMatchObject({ withCredentials: false, responseType: 'blob' });
    expect(window.location.href).not.toContain('jeton-abc');
  });

  it('affiche l’erreur uniforme quand le téléchargement est refusé', async () => {
    setHash('#jeton-abc');
    const view = makeView({
      sections: ['DOCUMENTS'],
      properties: [
        {
          ...baseProperty,
          documents: [
            {
              ref: 'ref-1',
              fileName: 'acte.pdf',
              documentType: 'NOTARIAL_DEED',
              fileSize: 2048,
              mimeType: 'application/pdf',
              createdAt: '2026-01-01T00:00:00.000Z'
            }
          ]
        }
      ]
    });
    mockPost.mockResolvedValueOnce({ status: 200, data: { success: true, data: view } });
    mockPost.mockResolvedValueOnce({ status: 404, data: new Blob(['{}']) });
    renderPage();
    await userEvent.click(await screen.findByRole('tab', { name: 'Documents partageables' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Télécharger acte.pdf' }));
    expect(await screen.findByText(INVALID)).toBeInTheDocument();
  });

  it('affiche l’erreur uniforme sur 404 (lien inconnu, expiré ou révoqué)', async () => {
    setHash('#expire');
    mockPost.mockResolvedValueOnce({ status: 404, data: { success: false } });
    renderPage();
    expect(await screen.findByText(INVALID)).toBeInTheDocument();
  });

  it('distingue la panne du service de l’écran de lien invalide', async () => {
    setHash('#jeton');
    mockPost.mockResolvedValueOnce({ status: 503, data: { success: false } });
    renderPage();
    expect(
      await screen.findByText('Service momentanément indisponible, réessayez dans quelques minutes.')
    ).toBeInTheDocument();
    expect(screen.queryByText(INVALID)).not.toBeInTheDocument();
  });

  it('affiche l’erreur uniforme sans appel réseau quand le jeton manque', async () => {
    setHash('');
    renderPage();
    await waitFor(() => expect(screen.getByText(INVALID)).toBeInTheDocument());
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('traduit les codes d’énumération et n’expose pas le mode de détention', async () => {
    setHash('#jeton-abc');
    const view = makeView({
      sections: ['VALUATIONS', 'LOANS', 'EXPENSES', 'TITLES_OWNERSHIP'],
      properties: [
        {
          ...baseProperty,
          valuation: {
            estimatedValue: 100,
            valuatedAt: '2026-09-01T00:00:00.000Z',
            acquisitionCost: null,
            currency: 'XOF',
            latentCapitalGain: null,
            history: [{ valuatedAt: '2026-01-01T00:00:00.000Z', estimatedValue: 90, method: 'EXPERT_APPRAISAL' }]
          },
          loans: [
            {
              lender: 'Banque Nord',
              capitalAmount: 10,
              remainingCapital: 5,
              interestRate: 7,
              monthlyPayment: 1,
              currency: 'XOF',
              startDate: '2022-01-01T00:00:00.000Z',
              endDate: null,
              status: 'DEFAULTED'
            }
          ],
          expenses: {
            totalLast12Months: 10,
            items: [{ date: '2026-03-01T00:00:00.000Z', category: 'PROPERTY_TAX', amount: 10 }]
          },
          titles: {
            propertyType: 'APPARTEMENT',
            surface: null,
            ownershipType: 'CLIENT',
            holdings: [
              {
                entityName: 'SCI Les Palmiers',
                legalForm: 'SCI',
                country: 'CI',
                rccm: null,
                taxId: null,
                sharePercent: 60
              }
            ],
            ownerSharePercent: 40,
            otherHoldersSharePercent: 0
          }
        }
      ]
    });
    mockPost.mockResolvedValueOnce({ status: 200, data: { success: true, data: view } });
    const { container } = renderPage();

    const RAW = ['EXPERT_APPRAISAL', 'DEFAULTED', 'PROPERTY_TAX', 'APPARTEMENT', 'CLIENT'];
    const expectNoRawCode = () => {
      for (const raw of RAW) expect(container.textContent).not.toContain(raw);
    };

    expect(await screen.findByText('Expertise')).toBeInTheDocument();
    expectNoRawCode();
    await openTab('Emprunts');
    expect(await screen.findByText('Défaillant')).toBeInTheDocument();
    expectNoRawCode();
    await openTab('Dépenses');
    expect(await screen.findByText('Taxe foncière')).toBeInTheDocument();
    expect(screen.getByText('(détail sur 24 mois)')).toBeInTheDocument();
    expectNoRawCode();
    await openTab('Titres et propriété');
    expect(await screen.findByText('Part des autres détenteurs')).toBeInTheDocument();
    expect(screen.getAllByText('Appartement').length).toBeGreaterThan(0);
    expect(screen.queryByText('Mode de détention')).not.toBeInTheDocument();
    expectNoRawCode();
  });

  it('affiche les rubriques sans donnée : aucune valorisation, rendement non valorisé', async () => {
    setHash('#jeton-abc');
    const view = makeView({
      sections: ['VALUATIONS', 'YIELD_RATIOS'],
      properties: [
        {
          ...baseProperty,
          valuation: null,
          yield: { grossYield: null, netYield: null, netNetYield: null, annualRent: 0, annualExpenses: 0 }
        }
      ]
    });
    mockPost.mockResolvedValueOnce({ status: 200, data: { success: true, data: view } });
    renderPage();
    expect(await screen.findByText('Aucune valorisation.')).toBeInTheDocument();
    await openTab('Rendement et ratios');
    expect(await screen.findAllByText('Non valorisé')).toHaveLength(2);
  });

  it('signale la quote-part appliquée et la troncature du périmètre', async () => {
    setHash('#jeton-abc');
    const view = makeView({
      summary: { propertyCount: 100, totalEstimatedValue: 10, ownerShareApplied: true, truncated: true }
    });
    mockPost.mockResolvedValueOnce({ status: 200, data: { success: true, data: view } });
    renderPage();
    expect(await screen.findByText('Totaux calculés selon la quote-part de Awa Konan')).toBeInTheDocument();
    expect(screen.getByText('Seuls les 100 premiers biens du périmètre sont affichés.')).toBeInTheDocument();
  });

  it('n’affiche aucune note quand la quote-part n’est pas appliquée', async () => {
    setHash('#jeton-abc');
    mockPost.mockResolvedValueOnce({ status: 200, data: { success: true, data: makeView() } });
    renderPage();
    await screen.findByText(/Accès en lecture seule accordé par/);
    expect(screen.queryByText(/Totaux calculés selon/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Seuls les 100 premiers/)).not.toBeInTheDocument();
  });
});
