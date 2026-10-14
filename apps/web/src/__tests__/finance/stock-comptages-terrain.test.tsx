import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StockComptagesTerrain } from '../../pages/finance/StockComptagesTerrain';
import type { CaptureView, FieldCountRow } from '../../types/finance-stock-whatsapp-types';

/**
 * W-E2 — Comptages terrain (lot 041, ecrans §3 et §8). Service réel,
 * `apiClient` simulé.
 *
 * Ce qui compte : l'écran ne montre que ce que le serveur rend (quantité
 * masquée → « Comptage en cours », valeurs absentes → pas de colonne), il ne
 * calcule aucun écart, et il ne lit aucune photo avant l'ouverture du tiroir.
 */

vi.mock('../../utils/api-client', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn()
  }
}));

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));

import apiClient from '../../utils/api-client';

const get = apiClient.get as unknown as ReturnType<typeof vi.fn>;

const TENANT = 'agence-1';
const RIVIERA = 'lieu-riviera-02';
const MAGASIN = 'lieu-magasin-01';
const CAPTURE = 'capture-ciment-01';

const LIGNE_AVEUGLE: FieldCountRow = {
  locationId: RIVIERA,
  locationLabel: 'Dépôt de la Villa Riviera',
  siteId: 'chantier-riviera',
  siteName: 'Villa de la Riviera',
  itemId: 'article-ciment-01',
  itemReference: 'CIM-42',
  itemLabel: 'Ciment CPJ 42,5',
  unit: 'sac',
  theoreticalQuantity: null,
  theoreticalValue: null,
  averageUnitCost: null,
  lastCount: {
    countId: 'comptage-whatsapp-03',
    countStatus: 'COUNTED',
    countSource: 'WHATSAPP',
    countedQuantity: 60,
    countedAtServer: '2026-10-04T09:40:12.000Z',
    countedByLabel: 'Koffi Yao',
    captureId: CAPTURE,
    hasPhoto: true,
    outcome: 'CORRECTED'
  }
};

const LIGNE_MAGASIN: FieldCountRow = {
  locationId: MAGASIN,
  locationLabel: "Magasin central d'Angré",
  siteId: null,
  siteName: null,
  itemId: 'article-fer-02',
  itemReference: 'FER-12',
  itemLabel: 'Fer à béton HA 12',
  unit: 'barre',
  theoreticalQuantity: 340,
  theoreticalValue: null,
  averageUnitCost: null,
  lastCount: {
    countId: 'comptage-web-01',
    countStatus: 'VALIDATED',
    countSource: 'WEB',
    countedQuantity: 338,
    countedAtServer: '2026-09-19T11:00:00.000Z',
    countedByLabel: 'Fatou Koné',
    captureId: 'capture-retiree',
    hasPhoto: false,
    outcome: null
  }
};

const DETAIL: CaptureView = {
  id: CAPTURE,
  receivedAt: '2026-10-04T09:39:31.000Z',
  outcome: 'CORRECTED',
  via: 'META',
  hasPhoto: true,
  unit: 'sac',
  sha256: '3fa9b2c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6ec21e',
  chefLabel: 'Koffi Yao',
  canReadConversation: false,
  canRemovePhoto: false
};

function fieldContext() {
  return {
    data: {
      success: true,
      data: {
        locations: [
          { id: RIVIERA, label: 'Dépôt de la Villa Riviera', siteId: 'chantier-riviera' },
          { id: MAGASIN, label: "Magasin central d'Angré", siteId: null }
        ],
        sites: [{ id: 'chantier-riviera', name: 'Villa de la Riviera', locationId: RIVIERA }],
        items: [],
        abilities: { canManageSettings: false, valuesVisible: false }
      },
      meta: { valuesVisible: false, blindLocationIds: [RIVIERA] }
    }
  };
}

function routerGet(valuesVisible: boolean, rows: FieldCountRow[] = [LIGNE_AVEUGLE, LIGNE_MAGASIN]) {
  get.mockImplementation(async (url: string) => {
    if (url.endsWith('/stock/field-context')) return fieldContext();
    if (url.includes('/stock/whatsapp/field-counts')) {
      return {
        data: { success: true, data: rows, meta: { valuesVisible, blindLocationIds: [RIVIERA], nextCursor: null } }
      };
    }
    if (url.endsWith(`/stock/whatsapp/captures/${CAPTURE}/file`)) {
      return { data: new Blob(['jpeg'], { type: 'image/jpeg' }) };
    }
    if (url.endsWith(`/stock/whatsapp/captures/${CAPTURE}`)) return { data: { success: true, data: DETAIL } };
    throw new Error(`GET inattendu : ${url}`);
  });
}

function monter(url = `/tenant/${TENANT}/finance/stock/comptages-terrain`) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <MemoryRouter initialEntries={[url]}>
          <Routes>
            <Route path="/tenant/:tenantId/finance/stock/comptages-terrain" element={<StockComptagesTerrain />} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

const lecturesDeFichier = () => get.mock.calls.filter(call => String(call[0]).endsWith('/file'));

beforeEach(() => {
  vi.clearAllMocks();
  URL.createObjectURL = vi.fn(() => 'blob:photo-1');
  URL.revokeObjectURL = vi.fn();
});

describe('Comptages terrain — masques du lot 040', () => {
  it('affiche « Comptage en cours » à la place d’une quantité masquée', async () => {
    routerGet(false);
    monter();
    expect(await screen.findByText('Ciment CPJ 42,5')).toBeInTheDocument();
    expect(screen.getAllByText('Comptage en cours').length).toBeGreaterThan(0);
    // La quantité visible du magasin, elle, est rendue telle quelle.
    expect(screen.getByText(/^340 barre$/)).toBeInTheDocument();
  });

  it('sans valeurs visibles : aucune colonne Valeur, aucun « 0 FCFA »', async () => {
    routerGet(false);
    monter();
    await screen.findByText('Ciment CPJ 42,5');
    expect(screen.queryByRole('columnheader', { name: 'Valeur' })).not.toBeInTheDocument();
    expect(document.body.textContent ?? '').not.toMatch(/FCFA|XOF/);
  });

  it('aucune colonne d’écart, même avec les valeurs visibles', async () => {
    routerGet(true);
    monter();
    await screen.findByText('Ciment CPJ 42,5');
    expect(screen.getByRole('columnheader', { name: 'Valeur' })).toBeInTheDocument();
    const entetes = screen.getAllByRole('columnheader').map(cell => cell.textContent ?? '');
    expect(entetes.some(texte => /cart/i.test(texte))).toBe(false);
  });

  it('montre la source, « corrigé », « Photo retirée » et le rappel des non comptés', async () => {
    routerGet(false);
    monter();
    await screen.findByText('Ciment CPJ 42,5');
    expect(screen.getByText('corrigé')).toBeInTheDocument();
    expect(screen.getByText('Photo retirée')).toBeInTheDocument();
    expect(screen.getByText(/crée une ligne « non comptée »/)).toBeInTheDocument();
  });

  it('bandeau de l’aveugle quand le lieu filtré est en comptage', async () => {
    routerGet(false);
    monter(`/tenant/${TENANT}/finance/stock/comptages-terrain?lieu=${RIVIERA}`);
    expect(await screen.findByText('Comptage à l’aveugle')).toBeInTheDocument();
    const appel = get.mock.calls.map(call => String(call[0])).find(url => url.includes('/field-counts'));
    expect(appel).toContain(`locationId=${RIVIERA}`);
  });
});

describe('Comptages terrain — la photo ne se lit qu’à l’ouverture du tiroir', () => {
  it('aucune lecture de fichier avant le clic, une seule après', async () => {
    routerGet(false);
    monter();
    await screen.findByText('Ciment CPJ 42,5');
    expect(lecturesDeFichier()).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: 'Voir la photo' }));
    expect(await screen.findByText('Comptage par photo')).toBeInTheDocument();
    await waitFor(() => expect(lecturesDeFichier()).toHaveLength(1));
    const [, options] = lecturesDeFichier()[0];
    expect(options).toEqual({ responseType: 'blob' });
  });

  it('affiche l’état vide sans proposer d’inscription à qui ne paramètre pas', async () => {
    routerGet(false, []);
    monter();
    expect(await screen.findByText('Aucun comptage pour ces filtres.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Inscrire un chef de chantier' })).not.toBeInTheDocument();
  });
});
