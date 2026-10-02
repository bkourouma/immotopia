import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { AuditIntegrityCard } from '../../components/admin/AuditIntegrityCard';
import type { AuditIntegrityFinding, AuditIntegrityReport } from '../../services/audit-service';

/**
 * Carte « Intégrité du journal » de la console d'audit plateforme. Seul
 * `apiClient` est simulé, à la frontière réseau : `getAuditIntegrity` tourne par-dessus
 * (Vitest refuse tout import qu'un `vi.mock` ne déclare pas).
 */

vi.mock('../../utils/api-client', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn()
  }
}));

import apiClient from '../../utils/api-client';

const get = apiClient.get as unknown as ReturnType<typeof vi.fn>;

const HASH = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90';

function finding(overrides: Partial<AuditIntegrityFinding> = {}): AuditIntegrityFinding {
  return {
    sealDate: '2026-09-14',
    tenantKey: 'tenant-soleil',
    visibility: 'TENANT',
    status: 'ALTERED',
    sealedRows: 120,
    foundRows: 118,
    ...overrides
  };
}

function report(overrides: Partial<AuditIntegrityReport['partitions']> = {}, ok = true): AuditIntegrityReport {
  return {
    ok,
    chain: { ok: true, sealsChecked: 42, head: { seq: 42, sealDate: '2026-09-30', chainHash: HASH } },
    partitions: { checked: 87, ok: 87, expired: 0, lateRows: [], tampered: [], truncated: false, ...overrides }
  };
}

function reply(data: AuditIntegrityReport) {
  get.mockResolvedValue({ data: { success: true, data } });
}

function mount() {
  return render(
    <AntApp>
      <AuditIntegrityCard />
    </AntApp>
  );
}

const verifier = () => userEvent.click(screen.getByRole('button', { name: /Vérifier l'intégrité/ }));

describe('AuditIntegrityCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("n'appelle pas l'API au montage, seulement au clic, sans période par défaut", async () => {
    reply(report());
    mount();

    expect(get).not.toHaveBeenCalled();
    await verifier();

    await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
    expect(get).toHaveBeenCalledWith('/admin/audit/integrity', { params: {} });
  });

  it("envoie la période choisie en jours AAAA-MM-JJ, et rien d'autre", async () => {
    reply(report());
    mount();
    const [debut, fin] = screen.getAllByRole('textbox');

    await userEvent.click(debut);
    await userEvent.type(debut, '01/09/2026');
    await userEvent.keyboard('{Enter}');
    await userEvent.type(fin, '15/09/2026');
    await userEvent.keyboard('{Enter}');
    await verifier();

    await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
    expect(get).toHaveBeenCalledWith('/admin/audit/integrity', { params: { from: '2026-09-01', to: '2026-09-15' } });
  });

  it('affiche « Journal intègre », le nombre de partitions et la tête de chaîne tronquée', async () => {
    reply(report());
    mount();
    await verifier();

    expect(await screen.findByText('Journal intègre')).toBeInTheDocument();
    expect(screen.getByText(/87 partition\(s\) vérifiée\(s\) sur 42 scellé\(s\)/)).toBeInTheDocument();
    expect(screen.getByText(/scellé n° 42 du 30\/09\/2026/)).toBeInTheDocument();
    expect(screen.getByText(`${HASH.slice(0, 12)}…`)).toBeInTheDocument();
    expect(screen.queryByText(HASH)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: "Copier l'empreinte complète" })).toBeInTheDocument();
    expect(screen.queryByText(/Intégrité du journal compromise/)).not.toBeInTheDocument();
  });

  it("montre l'altération avec le statut libellé, la chaîne rompue et les lignes scellées/trouvées", async () => {
    const data = report({ ok: 86, tampered: [finding()] }, false);
    data.chain = { ok: false, sealsChecked: 42, brokenAtSeq: 17, head: null };
    reply(data);
    mount();
    await verifier();

    expect(await screen.findByText('Intégrité du journal compromise')).toBeInTheDocument();
    expect(screen.queryByText('Journal intègre')).not.toBeInTheDocument();
    expect(screen.getByText('La chaîne des scellés est rompue au scellé n° 17.')).toBeInTheDocument();
    const ligne = screen.getByText('tenant-soleil').closest('tr') as HTMLElement;
    expect(within(ligne).getByText('14/09/2026')).toBeInTheDocument();
    expect(within(ligne).getByText('Contenu altéré')).toBeInTheDocument();
    expect(within(ligne).getByText('120')).toBeInTheDocument();
    expect(within(ligne).getByText('118')).toBeInTheDocument();
    expect(within(ligne).getByText("Visible de l'agence")).toBeInTheDocument();
  });

  it('signale à part les lignes arrivées après le scellement, sans alerte rouge', async () => {
    reply(report({ lateRows: [finding({ status: 'LATE_ROWS', tenantKey: 'tenant-tardif', foundRows: 125 })] }));
    mount();
    await verifier();

    expect(await screen.findByText(/pas forcément une altération/)).toBeInTheDocument();
    const ligne = screen.getByText('tenant-tardif').closest('tr') as HTMLElement;
    expect(within(ligne).getByText('Lignes arrivées après le scellement')).toBeInTheDocument();
    expect(screen.getByText('Journal intègre')).toBeInTheDocument();
    expect(screen.queryByText('Intégrité du journal compromise')).not.toBeInTheDocument();
  });

  it('mentionne les partitions purgées comme normales et avertit quand le résultat est tronqué', async () => {
    reply(report({ expired: 5, truncated: true }));
    mount();
    await verifier();

    expect(
      await screen.findByText(/5 partition\(s\) purgée\(s\) après la durée de rétention : situation normale/)
    ).toBeInTheDocument();
    expect(screen.getByText(/restreignez la période/)).toBeInTheDocument();
  });

  it("affiche l'erreur de l'API (429 compris) et permet de relancer", async () => {
    get
      .mockRejectedValueOnce({ response: { status: 429, data: { message: 'Trop de requêtes, réessayez plus tard.' } } })
      .mockResolvedValueOnce({ data: { success: true, data: report() } });
    mount();

    await verifier();
    expect(await screen.findByText('Trop de requêtes, réessayez plus tard.')).toBeInTheDocument();
    expect(screen.queryByText('Journal intègre')).not.toBeInTheDocument();

    await verifier();
    expect(await screen.findByText('Journal intègre')).toBeInTheDocument();
    expect(screen.queryByText('Trop de requêtes, réessayez plus tard.')).not.toBeInTheDocument();
  });

  it("retombe sur un message par défaut quand l'erreur n'a pas de corps", async () => {
    get.mockRejectedValue(new Error('Network Error'));
    mount();
    await verifier();

    expect(await screen.findByText("Erreur lors de la vérification de l'intégrité du journal")).toBeInTheDocument();
  });
});
