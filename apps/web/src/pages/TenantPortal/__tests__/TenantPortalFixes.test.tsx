import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from 'antd';
import { MemoryRouter } from 'react-router-dom';

/**
 * Recette gestion locative du 03/11/2026, portail locataire :
 * BUG-003 (carte « Montant retenu » du dépôt) et BUG-002 (nom de fichier
 * téléchargé). Seul `api-client` est simulé.
 */
vi.mock('../../../utils/api-client', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() }
}));

const saveSpy = vi.fn();
vi.mock('../../../utils/save-blob', async importOriginal => {
  const original = await importOriginal<typeof import('../../../utils/save-blob')>();
  return { ...original, saveBlob: (...a: unknown[]) => saveSpy(...a) };
});

import apiClient from '../../../utils/api-client';
import TenantDeposit from '../Deposit';
import TenantDocuments from '../Documents';

const get = apiClient.get as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Dépôt de garantie (BUG-2026-11-03-003)', () => {
  it('la carte « Montant retenu » affiche la retenue (0), pas le solde détenu', async () => {
    get.mockResolvedValue({
      data: {
        success: true,
        data: {
          deposit: {
            id: 'd',
            targetAmount: 330000,
            collectedAmount: 330000,
            heldAmount: 0,
            refundedAmount: 0,
            forfeitedAmount: 0,
            currency: 'XOF',
            lease: { id: 'l', lease_number: 'BAIL-1' }
          },
          movements: [],
          currentHeldAmount: 330000
        }
      }
    });

    const { container } = render(
      <MemoryRouter>
        <TenantDeposit />
      </MemoryRouter>
    );

    await waitFor(() => expect(container.querySelector('.ant-statistic')).not.toBeNull());
    const cards = Array.from(container.querySelectorAll('.ant-statistic'));
    const retenu = cards.find(c => /retenu/i.test(c.textContent ?? ''));
    expect(retenu).toBeDefined();
    expect(retenu!.querySelector('.ant-statistic-content')!.textContent).toMatch(/^[^1-9]*0[^1-9]*$/);
  });
});

describe('Dépôt de garantie avec plusieurs baux (BUG-2026-11-05-005)', () => {
  it('permet de choisir L5 et affiche son remboursement et son solde', async () => {
    get.mockImplementation(async (url: string, config?: { params?: { leaseId?: string } }) => {
      if (url === '/portal/tenant/leases') {
        return {
          data: {
            data: [
              { id: 'latest', leaseNumber: 'BAIL-2026-0107', propertyAddress: 'Bien PEN-F', isDefault: true },
              { id: 'l5', leaseNumber: 'BAIL-2026-0079', propertyAddress: 'Appartement A5' }
            ]
          }
        };
      }
      const l5 = config?.params?.leaseId === 'l5';
      return {
        data: {
          success: true,
          data: {
            deposit: {
              id: l5 ? 'deposit-l5' : 'deposit-latest',
              targetAmount: l5 ? 800000 : 90000,
              collectedAmount: l5 ? 800000 : 0,
              heldAmount: 0,
              refundedAmount: l5 ? 210100 : 0,
              forfeitedAmount: l5 ? 10000 : 0,
              currency: 'XOF',
              lease: { id: l5 ? 'l5' : 'latest', lease_number: l5 ? 'BAIL-2026-0079' : 'BAIL-2026-0107' }
            },
            movements: l5
              ? [
                  {
                    id: 'refund',
                    type: 'REFUND',
                    amount: 10000,
                    currency: 'XOF',
                    note: 'REC-GL remboursement',
                    createdAt: '2026-11-05',
                    payment: null,
                    installment: null
                  }
                ]
              : [],
            currentHeldAmount: l5 ? 579900 : 0
          }
        }
      };
    });
    render(
      <MemoryRouter>
        <TenantDeposit />
      </MemoryRouter>
    );
    expect(await screen.findByText('BAIL-2026-0107')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('combobox', { name: 'Bail' }));
    await userEvent.click(await screen.findByText(/BAIL-2026-0079 — Appartement A5/));
    await waitFor(() => expect(get).toHaveBeenCalledWith('/portal/tenant/deposit', { params: { leaseId: 'l5' } }));
    expect(await screen.findByText('REC-GL remboursement')).toBeInTheDocument();
    expect(screen.getByText('BAIL-2026-0079')).toBeInTheDocument();
  });

  it('garde le sélecteur après une erreur et permet de réessayer le même bail', async () => {
    let latestCalls = 0;
    get.mockImplementation(async (url: string, config?: { params?: { leaseId?: string } }) => {
      if (url === '/portal/tenant/leases') {
        return {
          data: {
            data: [
              { id: 'latest', leaseNumber: 'BAIL-2026-0107', propertyAddress: 'Bien PEN-F', isDefault: true },
              { id: 'l5', leaseNumber: 'BAIL-2026-0079', propertyAddress: 'Appartement A5' }
            ]
          }
        };
      }
      const l5 = config?.params?.leaseId === 'l5';
      if (!l5 && ++latestCalls <= 2) throw new Error('Erreur de chargement simulée');
      return {
        data: {
          success: true,
          data: {
            deposit: {
              id: l5 ? 'd5' : 'd7',
              targetAmount: l5 ? 800000 : 90000,
              collectedAmount: 0,
              heldAmount: 0,
              refundedAmount: 0,
              forfeitedAmount: 0,
              currency: 'XOF',
              lease: { id: l5 ? 'l5' : 'latest', lease_number: l5 ? 'BAIL-2026-0079' : 'BAIL-2026-0107' }
            },
            movements: [],
            currentHeldAmount: 0
          }
        }
      };
    });
    render(
      <MemoryRouter>
        <TenantDeposit />
      </MemoryRouter>
    );
    expect(await screen.findByRole('button', { name: 'Réessayer' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('combobox', { name: 'Bail' }));
    await userEvent.click(await screen.findByText(/BAIL-2026-0079 — Appartement A5/));
    expect(await screen.findByText('BAIL-2026-0079')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('combobox', { name: 'Bail' }));
    await userEvent.click(await screen.findByText(/BAIL-2026-0107 — Bien PEN-F/));
    expect(await screen.findByRole('button', { name: 'Réessayer' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(await screen.findByText('BAIL-2026-0107')).toBeInTheDocument();
    expect(latestCalls).toBe(3);
  });

  it('recharge la liste des baux et le dépôt après une panne initiale', async () => {
    let leasesCalls = 0;
    let depositCalls = 0;
    get.mockImplementation(async (url: string, config?: { params?: { leaseId?: string } }) => {
      if (url === '/portal/tenant/leases') {
        if (++leasesCalls === 1) throw new Error('Réseau indisponible');
        return {
          data: {
            data: [
              { id: 'latest', leaseNumber: 'BAIL-2026-0107', propertyAddress: 'Bien PEN-F', isDefault: true },
              { id: 'l5', leaseNumber: 'BAIL-2026-0079', propertyAddress: 'Appartement A5' }
            ]
          }
        };
      }
      if (++depositCalls === 1) throw new Error('Réseau indisponible');
      const l5 = config?.params?.leaseId === 'l5';
      return {
        data: {
          success: true,
          data: {
            deposit: {
              id: l5 ? 'd5' : 'd7',
              targetAmount: l5 ? 800000 : 90000,
              collectedAmount: 0,
              heldAmount: 0,
              refundedAmount: 0,
              forfeitedAmount: 0,
              currency: 'XOF',
              lease: { id: l5 ? 'l5' : 'latest', lease_number: l5 ? 'BAIL-2026-0079' : 'BAIL-2026-0107' }
            },
            movements: [],
            currentHeldAmount: 0
          }
        }
      };
    });
    render(
      <MemoryRouter>
        <TenantDeposit />
      </MemoryRouter>
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Réessayer' }));
    expect(await screen.findByRole('combobox', { name: 'Bail' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('combobox', { name: 'Bail' }));
    await userEvent.click(await screen.findByText(/BAIL-2026-0079 — Appartement A5/));
    expect(await screen.findByText('BAIL-2026-0079')).toBeInTheDocument();
    expect(leasesCalls).toBe(2);
    expect(depositCalls).toBe(3);
  });
});

describe('Téléchargement de document (BUG-2026-11-03-002)', () => {
  it('garde le nom et l’extension envoyés par le serveur (.docx)', async () => {
    const created: string[] = [];
    const original = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
      const el = original(tag);
      if (tag === 'a') {
        el.click = () => created.push(el.getAttribute('download') ?? '');
      }
      return el;
    }) as typeof document.createElement);
    window.URL.createObjectURL = vi.fn(() => 'blob:x');
    window.URL.revokeObjectURL = vi.fn();

    get.mockImplementation(async (url: string) => {
      if (url.endsWith('/download')) {
        return {
          data: new Blob(['x']),
          headers: { 'content-disposition': 'attachment; filename="AVE-202611-0005.docx"' }
        };
      }
      const doc = {
        id: 'doc-1',
        type: 'RENT_RECEIPT',
        document_number: 'AVE-202611-0005',
        title: 'Avis',
        downloadPath: '/portal/tenant/documents/doc-1/download',
        issued_at: null,
        status: 'ISSUED'
      };
      return { data: { success: true, data: { documents: [doc], groupedByType: { RENT_RECEIPT: [doc] } } } };
    });

    render(
      <MemoryRouter>
        <App>
          <TenantDocuments />
        </App>
      </MemoryRouter>
    );
    const button = await screen.findByRole('button', { name: /Télécharger/ });
    await userEvent.click(button);

    await waitFor(() => expect(created).toEqual(['AVE-202611-0005.docx']));
    expect(within(document.body).queryByText(/\.pdf/)).toBeNull();
  });
});
