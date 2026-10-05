import React, { useState } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FieldCaptureDrawer } from '../../components/finance/stock/whatsapp/FieldCaptureDrawer';
import { WhatsappCountBadge } from '../../components/finance/stock/whatsapp/WhatsappCountBadge';
import { FieldCapturePhotoLink } from '../../components/finance/stock/whatsapp/FieldCapturePhotoLink';
import { useCountFieldCaptures } from '../../components/finance/stock/whatsapp/useFieldCaptures';
import type { CaptureOutcome, CaptureView, CountCaptureLine } from '../../types/finance-stock-whatsapp-types';

/**
 * W-E3 — Visualiseur de preuve (lot 041, ecrans §4 et §8), et les composants
 * autonomes du point d'accroche de l'Inventaire (ecrans §6) : pastilles
 * « Ouvert par WhatsApp » / « WhatsApp », lien photo, lecture des captures
 * d'un inventaire dont un `404` ne change rien à l'écran.
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
const post = apiClient.post as unknown as ReturnType<typeof vi.fn>;

const TENANT = 'agence-1';
const CAPTURE = 'capture-ciment-01';
const SHA = '3fa9b2c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6ec21e';

function capture(overrides: Partial<CaptureView> = {}): CaptureView {
  return {
    id: CAPTURE,
    receivedAt: '2026-10-04T09:39:31.000Z',
    outcome: 'ACCEPTED',
    via: 'SIMULATOR',
    siteName: 'Villa de la Riviera',
    itemLabel: 'Ciment CPJ 42,5',
    itemReference: 'CIM-42',
    unit: 'sac',
    proposedTotal: 60,
    confirmedQuantity: 60,
    chefLabel: 'Koffi Yao',
    countId: 'comptage-whatsapp-03',
    countStatus: 'COUNTED',
    hasPhoto: true,
    sha256: SHA,
    sessionId: 'session-1',
    analysis: {
      quality: 'OK',
      itemId: 'article-ciment-01',
      itemConfidence: 0.9,
      visibleUnits: 12,
      layers: 5,
      columns: 4,
      depthRows: 3,
      proposedTotal: 60,
      confidence: 0.86,
      method: 'SACKS_STACKED',
      explanation: 'Sacs empilés.'
    },
    vision: { provider: 'fake', model: 'fake-1', analysisMs: 2400, failureReason: null },
    photoRemoved: null,
    canRemovePhoto: false,
    canReadConversation: false,
    ...overrides
  };
}

function routerGet(detail: CaptureView) {
  get.mockImplementation(async (url: string) => {
    if (url.endsWith(`/captures/${CAPTURE}/file`)) return { data: new Blob(['jpeg'], { type: 'image/jpeg' }) };
    if (url.endsWith(`/captures/${CAPTURE}`)) return { data: { success: true, data: detail } };
    if (url.endsWith('/sessions/session-1/messages')) {
      return {
        data: {
          success: true,
          data: [
            {
              id: 'm1',
              direction: 'INBOUND',
              kind: 'TEXT',
              text: '<b>bonjour</b>',
              createdAt: '2026-10-04T09:35:00.000Z'
            },
            {
              id: 'm2',
              direction: 'OUTBOUND',
              kind: 'BUTTONS',
              text: 'Est-ce correct ?',
              captureId: CAPTURE,
              interactive: [{ id: 'confirm:yes', title: 'Oui' }],
              createdAt: '2026-10-04T09:39:35.000Z'
            }
          ]
        }
      };
    }
    throw new Error(`GET inattendu : ${url}`);
  });
}

function Harness() {
  const [ouvert, setOuvert] = useState(true);
  return <FieldCaptureDrawer tenantId={TENANT} captureId={ouvert ? CAPTURE : null} onClose={() => setOuvert(false)} />;
}

function wrap(children: React.ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return (
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <MemoryRouter>{children}</MemoryRouter>
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

describe('Visualiseur de preuve', () => {
  it('lit la photo en blob et révoque son URL au démontage', async () => {
    routerGet(capture());
    const { unmount } = render(wrap(<Harness />));
    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalledTimes(1));
    expect(lecturesDeFichier()[0][1]).toEqual({ responseType: 'blob' });
    expect(await screen.findByRole('img', { name: 'Photo du stock envoyée par le chef de chantier' })).toHaveAttribute(
      'src',
      'blob:photo-1'
    );
    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:photo-1');
  });

  it('photo retirée : cadre gris, aucune lecture de fichier, empreinte conservée', async () => {
    routerGet(
      capture({
        hasPhoto: false,
        photoRemoved: { at: '2026-10-04T12:00:00.000Z', byLabel: 'Awa Traoré', reason: 'Visage visible' }
      })
    );
    render(wrap(<Harness />));
    const cadre = await screen.findByTestId('capture-photo-removed');
    expect(cadre).toHaveTextContent('Photo retirée le 04/10/2026 par Awa Traoré — motif : Visage visible');
    expect(screen.getByText('Empreinte : 3fa9…c21e')).toBeInTheDocument();
    expect(lecturesDeFichier()).toHaveLength(0);
  });

  it('copie l’empreinte complète', async () => {
    routerGet(capture());
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(wrap(<Harness />));
    fireEvent.click(await screen.findByRole('button', { name: /Copier l’empreinte complète/ }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(SHA));
  });

  it('« Voir la conversation » absent sans canReadConversation', async () => {
    routerGet(capture({ canReadConversation: false }));
    render(wrap(<Harness />));
    await screen.findByText('Ce que le chef a fait');
    expect(screen.queryByRole('button', { name: /Voir la conversation/ })).not.toBeInTheDocument();
  });

  it('avec canReadConversation : fil en texte brut, message lié surligné', async () => {
    routerGet(capture({ canReadConversation: true }));
    render(wrap(<Harness />));
    fireEvent.click(await screen.findByRole('button', { name: /Voir la conversation/ }));
    expect(await screen.findByText('<b>bonjour</b>')).toBeInTheDocument();
    const fil = screen.getByRole('list', { name: 'Conversation WhatsApp' });
    expect(fil.querySelector('b')).toBeNull();
    const surligne = fil.querySelector('[data-highlighted="true"]');
    expect(surligne).not.toBeNull();
    expect(within(surligne as HTMLElement).getByText('Est-ce correct ?')).toBeInTheDocument();
  });

  it.each<[CaptureOutcome, string]>([
    ['ACCEPTED', 'Validée telle quelle'],
    ['CORRECTED', 'Corrigée par le chef'],
    ['CANCELLED', 'Annulée'],
    ['EXPIRED', 'Abandonnée (sans réponse)'],
    ['UNREADABLE', 'Photo illisible'],
    ['UNRECOGNIZED', 'Article non reconnu'],
    ['FAILED', 'Analyse en échec']
  ])('issue %s : « %s »', async (outcome, libelle) => {
    routerGet(capture({ outcome, hasPhoto: false }));
    render(wrap(<Harness />));
    expect(await screen.findByTestId('capture-outcome')).toHaveTextContent(libelle);
  });

  it('analyse en échec : raison lisible', async () => {
    routerGet(
      capture({
        outcome: 'FAILED',
        hasPhoto: false,
        analysis: null,
        vision: { provider: 'gemini', model: 'm', analysisMs: 12000, failureReason: 'TIMEOUT' }
      })
    );
    render(wrap(<Harness />));
    expect(await screen.findByText('L’analyse n’a pas abouti')).toBeInTheDocument();
    expect(screen.getByText('délai dépassé')).toBeInTheDocument();
  });

  it('ajout au comptage existant : ligne portée à la quantité rendue', async () => {
    routerGet(capture({ mergeMode: 'ADD', lineQuantityAfter: 110, hasPhoto: false }));
    render(wrap(<Harness />));
    expect(await screen.findByText('Ajoutée au comptage existant : ligne portée à 110 sac')).toBeInTheDocument();
  });

  it('retrait : motif envoyé seul ; 409 « déjà retirée » relit la capture', async () => {
    routerGet(capture({ canRemovePhoto: true }));
    post.mockRejectedValueOnce(
      Object.assign(new Error('déjà'), {
        response: { status: 409, data: { code: 'STOCK_WHATSAPP_PHOTO_ALREADY_REMOVED', message: 'Déjà retirée.' } }
      })
    );
    render(wrap(<Harness />));
    fireEvent.click(await screen.findByRole('button', { name: /Retirer la photo/ }));
    const dialog = (await screen.findByText('Retirer cette photo ?')).closest('.ant-modal') as HTMLElement;
    expect(dialog).not.toBeNull();
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'Visage visible' } });
    const lecturesAvant = get.mock.calls.filter(call => String(call[0]).endsWith(`/captures/${CAPTURE}`)).length;
    fireEvent.click(within(dialog).getByRole('button', { name: /Retirer la photo/ }));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post.mock.calls[0][0]).toBe(`/tenants/${TENANT}/finance/stock/whatsapp/captures/${CAPTURE}/remove-photo`);
    expect(post.mock.calls[0][1]).toEqual({ reason: 'Visage visible' });
    await waitFor(() =>
      expect(get.mock.calls.filter(call => String(call[0]).endsWith(`/captures/${CAPTURE}`)).length).toBeGreaterThan(
        lecturesAvant
      )
    );
  });
});

describe('Inventaire (point d’accroche) — composants autonomes', () => {
  const LIGNE: CountCaptureLine = {
    itemId: 'article-ciment-01',
    captureId: CAPTURE,
    outcome: 'ACCEPTED',
    confirmedAt: '2026-10-04T09:40:12.000Z',
    hasPhoto: true,
    capturesCount: 3
  };

  it('« Ouvert par WhatsApp » pour une source WHATSAPP seulement', () => {
    const { rerender } = render(wrap(<WhatsappCountBadge variant="count" source="WHATSAPP" />));
    expect(screen.getByText('Ouvert par WhatsApp')).toBeInTheDocument();
    rerender(wrap(<WhatsappCountBadge variant="count" source="WEB" />));
    expect(screen.queryByText('Ouvert par WhatsApp')).not.toBeInTheDocument();
  });

  it('pastille « WhatsApp » sur une ligne capturée, rien sinon', () => {
    const { rerender } = render(wrap(<WhatsappCountBadge variant="line" line={LIGNE} />));
    expect(screen.getByText('WhatsApp')).toBeInTheDocument();
    rerender(wrap(<WhatsappCountBadge variant="line" line={undefined} />));
    expect(screen.queryByText('WhatsApp')).not.toBeInTheDocument();
  });

  it('lien photo : bouton « Photo », « 3 photos », ouverture par l’identifiant de capture', () => {
    const onOpen = vi.fn();
    const { rerender } = render(wrap(<FieldCapturePhotoLink line={LIGNE} onOpen={onOpen} />));
    expect(screen.getByText('3 photos')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Photo' }));
    expect(onOpen).toHaveBeenCalledWith(CAPTURE);
    rerender(wrap(<FieldCapturePhotoLink line={{ ...LIGNE, hasPhoto: false, capturesCount: 1 }} onOpen={onOpen} />));
    expect(screen.getByText('Photo retirée')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Photo' })).not.toBeInTheDocument();
  });

  it('un 404 de la route des captures ne produit ni erreur ni pastille', async () => {
    get.mockRejectedValue(
      Object.assign(new Error('absent'), { response: { status: 404, data: { code: 'NOT_FOUND' } } })
    );
    function Sonde() {
      const { captures, lineByItemId, isLoading } = useCountFieldCaptures(TENANT, 'comptage-1');
      if (isLoading) return <span>chargement</span>;
      return (
        <div>
          <span data-testid="etat">{captures === null ? 'aucune' : 'des captures'}</span>
          <WhatsappCountBadge variant="count" source={captures?.source} />
          <WhatsappCountBadge variant="line" line={lineByItemId.get('article-ciment-01')} />
        </div>
      );
    }
    render(wrap(<Sonde />));
    expect(await screen.findByTestId('etat')).toHaveTextContent('aucune');
    expect(get).toHaveBeenCalledWith(`/tenants/${TENANT}/finance/stock/whatsapp/counts/comptage-1/captures`);
    expect(get).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Ouvert par WhatsApp')).not.toBeInTheDocument();
    expect(screen.queryByText('WhatsApp')).not.toBeInTheDocument();
  });
});

describe('Visualiseur de preuve — quantité indiquée par le chef', () => {
  it.each<[CaptureOutcome, string]>([
    ['ACCEPTED', 'Quantité retenue'],
    ['CORRECTED', 'Quantité retenue'],
    ['CANCELLED', 'Quantité indiquée, non retenue'],
    ['EXPIRED', 'Quantité indiquée, non retenue'],
    ['PENDING', 'Quantité indiquée par le chef']
  ])('issue %s : la valeur rendue par le serveur est affichée sous « %s »', async (outcome, libelle) => {
    routerGet(capture({ outcome, confirmedQuantity: 48, countId: null, countStatus: null }));
    render(wrap(<Harness />));
    const valeur = await screen.findByTestId('capture-confirmed-quantity');
    expect(valeur.textContent).toMatch(/48/);
    expect(screen.getByText(libelle)).toBeInTheDocument();
    if (libelle !== 'Quantité retenue') expect(screen.queryByText('Quantité retenue')).not.toBeInTheDocument();
  });

  it('sans valeur rendue, aucune ligne de quantité', async () => {
    routerGet(capture({ outcome: 'CANCELLED', confirmedQuantity: null }));
    render(wrap(<Harness />));
    expect(await screen.findByTestId('capture-outcome')).toBeInTheDocument();
    expect(screen.queryByTestId('capture-confirmed-quantity')).not.toBeInTheDocument();
  });
});
