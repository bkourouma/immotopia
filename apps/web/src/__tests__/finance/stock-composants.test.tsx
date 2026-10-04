import React, { useState } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * Composants partagés du contrôle du stock (lot 040, ecrans §4) et socle du
 * réseau instable (ecrans §3.7).
 *
 * Mock à la frontière réseau : `apiClient` est doublé, les vrais composants et
 * services sont montés par-dessus. Le vocabulaire (« montré, pas jugé », D2)
 * se vérifie sur le texte rendu, normalisé.
 */

vi.mock('../../utils/api-client', () => ({
  default: {
    get: vi.fn(async () => ({ data: { data: [] } })),
    post: vi.fn(async () => ({ data: { data: {} } })),
    put: vi.fn(async () => ({ data: { data: {} } })),
    patch: vi.fn(async () => ({ data: { data: {} } })),
    delete: vi.fn(async () => ({ data: { data: {} } }))
  }
}));

import apiClient from '../../utils/api-client';
import {
  StockReasonPicker,
  isStockReasonComplete,
  type StockReasonValue
} from '../../components/finance/stock/StockReasonPicker';
import { StockQuantityCell } from '../../components/finance/stock/StockQuantityCell';
import { StockTakerSelect } from '../../components/finance/stock/StockTakerSelect';
import { StockBlindBanner } from '../../components/finance/stock/StockBlindBanner';
import { StockSlipPdfButton } from '../../components/finance/stock/StockSlipPdfButton';
import { nouvelIdentifiantDeRequete, uuidV4FromRandomBytes } from '../../utils/stock-client-request-id';
import type { RequesterFields, StockReasonCode, StockTakerView } from '../../types/finance-stock-controle-types';

const TENANT = 'agence-1';
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const MOTS_INTERDITS = [/\bvols?\b/, /\bvoleurs?\b/, /\bfraud/, /\bd[ée]tourn/];

function normaliser(texte: string | null | undefined): string {
  return (texte ?? '').toLowerCase().replace(/\s+/g, ' ');
}

function sansMotInterdit(): void {
  const texte = normaliser(document.body.textContent);
  for (const mot of MOTS_INTERDITS) {
    expect(texte).not.toMatch(mot);
  }
}

function monter(element: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <MemoryRouter initialEntries={[`/tenant/${TENANT}/finance/stock`]}>
          <Routes>
            <Route path="/tenant/:tenantId/finance/stock" element={element} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

function preneur(overrides: Partial<StockTakerView> = {}): StockTakerView {
  return {
    id: 'preneur-1',
    label: 'Koné Ibrahim — Équipe maçonnerie',
    fullName: 'Koné Ibrahim',
    teamOrCompany: 'Équipe maçonnerie',
    phone: null,
    employeeId: null,
    contractorId: null,
    linkedPersonLabel: null,
    isActive: true,
    createdAt: '2026-10-01T08:00:00.000Z',
    ...overrides
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// StockReasonPicker
// ---------------------------------------------------------------------------

describe('StockReasonPicker — motif d’une liste fermée', () => {
  const CODES: StockReasonCode[] = ['BREAKAGE', 'DETERIORATION', 'OPENING_BALANCE', 'OTHER'];

  function Banc({ onValue }: { onValue: (value: StockReasonValue) => void }) {
    const [value, setValue] = useState<StockReasonValue>({ reasonCode: null, reason: '' });
    return (
      <StockReasonPicker
        codes={CODES}
        value={value}
        onChange={next => {
          setValue(next);
          onValue(next);
        }}
      />
    );
  }

  it('propose les motifs du contexte, jamais le stock d’ouverture posé par le système', () => {
    monter(<Banc onValue={() => undefined} />);
    expect(screen.getByText('Casse')).toBeInTheDocument();
    expect(screen.getByText('Détérioration (humidité, péremption)')).toBeInTheDocument();
    expect(screen.getByText('Autre (précision obligatoire)')).toBeInTheDocument();
    expect(screen.queryByText('Stock d’ouverture (posé par le système)')).not.toBeInTheDocument();
    sansMotInterdit();
  });

  it('« Autre » exige la précision : le motif reste incomplet tant qu’elle est vide', () => {
    let dernier: StockReasonValue = { reasonCode: null, reason: '' };
    monter(<Banc onValue={value => (dernier = value)} />);

    fireEvent.click(screen.getByText('Autre (précision obligatoire)'));
    expect(dernier.reasonCode).toBe('OTHER');
    expect(isStockReasonComplete(dernier)).toBe(false);
    expect(screen.getByText('Précisez le motif : il est obligatoire pour « Autre ».')).toBeInTheDocument();

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Sac éventré au déchargement' } });
    expect(isStockReasonComplete(dernier)).toBe(true);
  });

  it('un motif ordinaire est complet sans précision, et rien n’est complet sans motif', () => {
    expect(isStockReasonComplete({ reasonCode: 'BREAKAGE', reason: '' })).toBe(true);
    expect(isStockReasonComplete({ reasonCode: null, reason: 'texte' })).toBe(false);
    expect(isStockReasonComplete({ reasonCode: 'OTHER', reason: '   ' })).toBe(false);
    expect(isStockReasonComplete({ reasonCode: 'OTHER', reason: 'x'.repeat(501) })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// StockQuantityCell et StockBlindBanner
// ---------------------------------------------------------------------------

describe('StockQuantityCell — une quantité masquée n’est jamais un zéro', () => {
  it('affiche « Comptage en cours » quand le serveur rend null', () => {
    monter(<StockQuantityCell quantity={null} unit="sac" />);
    expect(screen.getByText('Comptage en cours')).toBeInTheDocument();
    expect(normaliser(document.body.textContent)).not.toMatch(/\b0\b/);
    expect(document.body.textContent).not.toContain('—');
  });

  it('affiche la quantité et son unité, quatre décimales au plus', () => {
    monter(<StockQuantityCell quantity={0.25} unit="m³" />);
    expect(screen.getByText('0,25 m³')).toBeInTheDocument();
  });
});

describe('StockBlindBanner', () => {
  it('dit que personne ne voit l’attendu, pas même un administrateur', () => {
    monter(<StockBlindBanner variant="count" />);
    expect(screen.getByText('Comptage à l’aveugle')).toBeInTheDocument();
    expect(normaliser(document.body.textContent)).toContain('pas même un administrateur');
    sansMotInterdit();
  });

  it('version Magasin : « Comptez ce que vous voyez »', () => {
    monter(<StockBlindBanner variant="magasin" />);
    expect(normaliser(document.body.textContent)).toContain('comptez ce que vous voyez');
  });
});

// ---------------------------------------------------------------------------
// StockTakerSelect
// ---------------------------------------------------------------------------

describe('StockTakerSelect — preneur du carnet, ou nom saisi selon le réglage', () => {
  function Banc({ requireTaker, onValue }: { requireTaker: boolean; onValue: (value: RequesterFields) => void }) {
    const [value, setValue] = useState<RequesterFields>({});
    return (
      <StockTakerSelect
        value={value}
        onChange={next => {
          setValue(next);
          onValue(next);
        }}
        takers={[preneur(), preneur({ id: 'preneur-inactif', label: 'Ancien preneur', isActive: false })]}
        requireTaker={requireTaker}
        canManageTakers={false}
        people={[]}
        tenantId={TENANT}
      />
    );
  }

  it('requireTaker : aucun lien « Saisir un nom… », et l’aide dit pourquoi', () => {
    monter(<Banc requireTaker onValue={() => undefined} />);
    expect(screen.queryByText('Saisir un nom sans l’ajouter au carnet')).not.toBeInTheDocument();
    expect(
      screen.getByText('Votre agence exige un preneur du carnet pour chaque sortie et chaque transfert.')
    ).toBeInTheDocument();
  });

  it('sans requireTaker : le lien bascule sur un nom saisi, qui part en `requestedBy` sans `takerId`', () => {
    let dernier: RequesterFields = {};
    monter(<Banc requireTaker={false} onValue={value => (dernier = value)} />);

    fireEvent.click(screen.getByText('Saisir un nom sans l’ajouter au carnet'));
    const champ = screen.getByLabelText('Nom du demandeur');
    fireEvent.change(champ, { target: { value: 'Chef de chantier Camara' } });

    expect(dernier).toEqual({ requestedBy: 'Chef de chantier Camara' });
    expect(dernier).not.toHaveProperty('takerId');
  });

  it('sans le droit de gérer le carnet, aucun ajout de preneur n’est proposé', () => {
    monter(<Banc requireTaker={false} onValue={() => undefined} />);
    expect(screen.queryByText('Ajouter un preneur…')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// StockSlipPdfButton
// ---------------------------------------------------------------------------

describe('StockSlipPdfButton', () => {
  const getMock = apiClient.get as unknown as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:pdf'), revokeObjectURL: vi.fn() }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('télécharge le bon en blob sur sa route, sans lien direct', async () => {
    getMock.mockResolvedValueOnce({ data: new Blob(['%PDF']), headers: {} });
    monter(<StockSlipPdfButton tenantId={TENANT} slipId="bon-1" number="BS-2026-00042" />);

    fireEvent.click(screen.getByText('Télécharger le bon (PDF)'));

    await vi.waitFor(() =>
      expect(getMock).toHaveBeenCalledWith(`/tenants/${TENANT}/finance/stock/slips/bon-1/pdf`, { responseType: 'blob' })
    );
  });

  it('variante procès-verbal sur la route de l’inventaire', async () => {
    getMock.mockResolvedValueOnce({ data: new Blob(['%PDF']), headers: {} });
    monter(<StockSlipPdfButton tenantId={TENANT} countId="inventaire-1" number="PVI-2026-00003" />);

    fireEvent.click(screen.getByText('Télécharger le procès-verbal (PDF)'));

    await vi.waitFor(() =>
      expect(getMock).toHaveBeenCalledWith(`/tenants/${TENANT}/finance/stock/counts/inventaire-1/report.pdf`, {
        responseType: 'blob'
      })
    );
  });
});

// ---------------------------------------------------------------------------
// nouvelIdentifiantDeRequete (ecrans §3.7)
// ---------------------------------------------------------------------------

describe('nouvelIdentifiantDeRequete — un UUID v4, même sans crypto.randomUUID', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('se sert de crypto.randomUUID quand il existe', () => {
    vi.stubGlobal('crypto', { randomUUID: () => '3b241101-e2bb-4255-8caf-4136c566a962' });
    expect(nouvelIdentifiantDeRequete()).toBe('3b241101-e2bb-4255-8caf-4136c566a962');
  });

  it('construit un UUID v4 avec getRandomValues quand randomUUID manque (Android ancien, hors contexte sécurisé)', () => {
    vi.stubGlobal('crypto', {
      getRandomValues: <T extends ArrayBufferView>(array: T): T => {
        const octets = array as unknown as Uint8Array;
        for (let i = 0; i < octets.length; i += 1) octets[i] = (i * 37 + 11) % 256;
        return array;
      }
    });
    const identifiant = nouvelIdentifiantDeRequete();
    expect(identifiant).toMatch(UUID_V4);
  });

  it('rend un UUID v4 même sans aucune API cryptographique', () => {
    vi.stubGlobal('crypto', undefined);
    const a = nouvelIdentifiantDeRequete();
    const b = nouvelIdentifiantDeRequete();
    expect(a).toMatch(UUID_V4);
    expect(b).toMatch(UUID_V4);
    expect(a).not.toBe(b);
  });

  it('fixe la version et la variante quels que soient les octets', () => {
    expect(uuidV4FromRandomBytes(new Uint8Array(16).fill(255))).toMatch(UUID_V4);
    expect(uuidV4FromRandomBytes(new Uint8Array(16))).toMatch(UUID_V4);
  });
});
