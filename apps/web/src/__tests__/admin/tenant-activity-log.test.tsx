import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { TenantActivityLog } from '../../pages/tenant/TenantActivityLog';
import type { TenantAuditLog } from '../../services/tenant-audit-service';

/**
 * Page « Journal d'activité » de l'agence (spec 023, phase 2).
 * `services/tenant-audit-service.ts` est mocké en entier : Vitest refuse tout
 * import qu'un `vi.mock` ne déclare pas. Les constantes de filtres sont
 * reprises du vrai module.
 */

const getTenantAuditLogs = vi.fn();

vi.mock('../../services/tenant-audit-service', async importOriginal => {
  const actual = await importOriginal<typeof import('../../services/tenant-audit-service')>();
  return {
    ...actual,
    getTenantAuditLogs: (...a: unknown[]) => getTenantAuditLogs(...a)
  };
});

function makeLog(overrides: Partial<TenantAuditLog> = {}): TenantAuditLog {
  return {
    id: 'log-1',
    createdAt: '2026-09-15T10:30:00.000Z',
    action: 'PROPERTY_CREATED',
    category: 'DATA',
    outcome: 'SUCCESS',
    actorType: 'USER',
    user: { id: 'user-1', email: 'awa@example.com', fullName: 'Awa Koné' },
    actorLabel: 'awa@example.com',
    resourceType: 'PROPERTY',
    resourceId: 'prop-0001-aaaa',
    resourceLabel: 'Villa Les Palmiers',
    ipAddress: '10.0.0.7',
    userAgent: 'Mozilla/5.0 test',
    requestId: 'req-123',
    ...overrides
  };
}

const PREMIERE_PAGE = {
  success: true,
  data: {
    logs: [
      makeLog(),
      makeLog({
        id: 'log-2',
        action: 'AUTH_LOGIN_FAILED',
        category: 'AUTH',
        outcome: 'FAILURE',
        user: undefined,
        actorLabel: 'inconnu@example.com',
        resourceType: 'USER',
        resourceId: 'user-9',
        resourceLabel: 'Compte inconnu'
      }),
      makeLog({
        id: 'log-3',
        action: 'SUBSCRIPTION_PACK_CHANGED',
        category: 'BILLING',
        actorType: 'SUPER_ADMIN',
        user: undefined,
        actorLabel: undefined,
        ipAddress: undefined,
        userAgent: undefined,
        resourceType: 'Subscription',
        resourceId: 'sub-1',
        resourceLabel: 'Abonnement Pro'
      })
    ],
    nextCursor: 'curseur-2'
  }
};

const SECONDE_PAGE = {
  success: true,
  data: {
    logs: [makeLog({ id: 'log-4', resourceLabel: 'Appartement Cocody' })],
    nextCursor: null
  }
};

function mount() {
  return render(
    <AntApp>
      <MemoryRouter initialEntries={['/tenant/tenant-1/activity']}>
        <Routes>
          <Route path="/tenant/:tenantId/activity" element={<TenantActivityLog />} />
        </Routes>
      </MemoryRouter>
    </AntApp>
  );
}

/** Le `<Select>` d'AntD s'ouvre sur `mousedown` ; ses options se lisent dans `.ant-select-item`. */
async function pickFilter(name: string, option: string) {
  fireEvent.mouseDown(await screen.findByRole('combobox', { name }));
  const item = await waitFor(() => {
    const candidat = screen.getAllByText(option).find(el => el.closest('.ant-select-item'));
    if (!candidat) throw new Error(`Option « ${option} » introuvable`);
    return candidat;
  });
  fireEvent.click(item);
}

describe('TenantActivityLog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getTenantAuditLogs.mockResolvedValue(PREMIERE_PAGE);
  });

  it("charge le journal de l'agence de l'URL et affiche les lignes", async () => {
    mount();

    expect(await screen.findByText('Villa Les Palmiers')).toBeInTheDocument();
    expect(getTenantAuditLogs).toHaveBeenCalledTimes(1);
    expect(getTenantAuditLogs.mock.calls[0][0]).toBe('tenant-1');
    // Libellé français de l'action, acteur, résultat coloré.
    expect(screen.getByText("Création d'un nouveau bien immobilier dans le catalogue")).toBeInTheDocument();
    expect(screen.getByText('Awa Koné')).toBeInTheDocument();
    expect(screen.getByText('Tentative de connexion échouée')).toBeInTheDocument();
    expect(screen.getByText('inconnu@example.com')).toBeInTheDocument();
    expect(screen.getAllByText('Réussie')).toHaveLength(2);
    expect(screen.getByText('Échouée')).toBeInTheDocument();
    // Pas de filtre vide dans la première requête.
    expect(getTenantAuditLogs.mock.calls[0][1]).toEqual(
      expect.objectContaining({ category: undefined, outcome: undefined, cursor: undefined })
    );
  });

  it('affiche « Support ImmoTopia » pour un acteur SUPER_ADMIN, sans identité', async () => {
    mount();

    expect(await screen.findByText('Support ImmoTopia')).toBeInTheDocument();
    expect(screen.getByText('Abonnement Pro')).toBeInTheDocument();
  });

  it('« Charger plus » ajoute les lignes suivantes avec le curseur, puis disparaît', async () => {
    getTenantAuditLogs.mockResolvedValueOnce(PREMIERE_PAGE).mockResolvedValueOnce(SECONDE_PAGE);
    mount();
    await screen.findByText('Villa Les Palmiers');

    await userEvent.click(screen.getByRole('button', { name: 'Charger plus' }));

    expect(await screen.findByText('Appartement Cocody')).toBeInTheDocument();
    expect(getTenantAuditLogs).toHaveBeenCalledTimes(2);
    expect(getTenantAuditLogs.mock.calls[1][1]).toEqual(expect.objectContaining({ cursor: 'curseur-2' }));
    // Les lignes de la première page restent affichées.
    expect(screen.getByText('Villa Les Palmiers')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Charger plus' })).not.toBeInTheDocument();
  });

  it('un changement de filtre repart de zéro, sans curseur', async () => {
    getTenantAuditLogs
      .mockResolvedValueOnce(PREMIERE_PAGE)
      .mockResolvedValueOnce(SECONDE_PAGE)
      .mockResolvedValueOnce({
        success: true,
        data: { logs: [makeLog({ id: 'log-5', resourceLabel: 'Bail filtré' })], nextCursor: null }
      });
    mount();
    await screen.findByText('Villa Les Palmiers');
    await userEvent.click(screen.getByRole('button', { name: 'Charger plus' }));
    await screen.findByText('Appartement Cocody');

    await pickFilter('Catégorie', 'Authentification');

    expect(await screen.findByText('Bail filtré')).toBeInTheDocument();
    const dernierAppel = getTenantAuditLogs.mock.calls[2];
    expect(dernierAppel[1]).toEqual(expect.objectContaining({ category: 'AUTH', cursor: undefined }));
    // Les lignes des pages précédentes ont disparu.
    expect(screen.queryByText('Villa Les Palmiers')).not.toBeInTheDocument();
    expect(screen.queryByText('Appartement Cocody')).not.toBeInTheDocument();
  });

  it("ignore la réponse d'une requête périmée quand le filtre change entre-temps", async () => {
    let resoudrePremiere: (value: unknown) => void = () => undefined;
    getTenantAuditLogs
      .mockImplementationOnce(() => new Promise(resolve => (resoudrePremiere = resolve)))
      .mockResolvedValueOnce({
        success: true,
        data: { logs: [makeLog({ id: 'log-6', resourceLabel: 'Ligne récente' })], nextCursor: null }
      });
    mount();

    await pickFilter('Résultat', 'Échouée');
    expect(await screen.findByText('Ligne récente')).toBeInTheDocument();

    resoudrePremiere(PREMIERE_PAGE);
    await waitFor(() => expect(getTenantAuditLogs).toHaveBeenCalledTimes(2));
    expect(screen.getByText('Ligne récente')).toBeInTheDocument();
    expect(screen.queryByText('Villa Les Palmiers')).not.toBeInTheDocument();
  });

  it('« Réinitialiser » efface les filtres et recharge sans critère', async () => {
    mount();
    await screen.findByText('Villa Les Palmiers');
    await pickFilter('Résultat', 'Refusée');
    await waitFor(() => expect(getTenantAuditLogs).toHaveBeenCalledTimes(2));
    expect(getTenantAuditLogs.mock.calls[1][1]).toEqual(expect.objectContaining({ outcome: 'DENIED' }));

    await userEvent.click(screen.getByRole('button', { name: /Réinitialiser/ }));

    await waitFor(() => expect(getTenantAuditLogs).toHaveBeenCalledTimes(3));
    expect(getTenantAuditLogs.mock.calls[2][1]).toEqual(expect.objectContaining({ outcome: undefined }));
  });

  it("affiche un état vide quand le journal n'a aucune ligne", async () => {
    getTenantAuditLogs.mockResolvedValue({ success: true, data: { logs: [], nextCursor: null } });
    mount();

    expect(await screen.findByText('Aucune activité enregistrée pour ces critères')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Charger plus' })).not.toBeInTheDocument();
  });

  it("affiche le message de l'API en cas d'erreur", async () => {
    getTenantAuditLogs.mockRejectedValue({ response: { data: { message: 'Accès refusé au journal' } } });
    mount();

    expect(await screen.findByText('Accès refusé au journal')).toBeInTheDocument();
    expect(screen.queryByText('Aucune activité enregistrée pour ces critères')).not.toBeInTheDocument();
  });

  it("affiche un texte par défaut quand l'erreur n'a pas de message", async () => {
    getTenantAuditLogs.mockRejectedValue(new Error('réseau'));
    mount();

    expect(await screen.findByText("Erreur lors du chargement du journal d'activité")).toBeInTheDocument();
  });

  it('ouvre le détail au clic : acteur, modifications avant → après, détails en texte', async () => {
    getTenantAuditLogs.mockResolvedValue({
      success: true,
      data: {
        logs: [
          makeLog({
            changes: { title: { before: 'Ancien titre', after: 'Nouveau titre' } },
            details: { note: '<img src=x onerror=alert(1)>' }
          })
        ],
        nextCursor: null
      }
    });
    mount();

    await userEvent.click(await screen.findByText('Villa Les Palmiers'));

    const dialogue = await screen.findByRole('dialog');
    expect(within(dialogue).getByText('Awa Koné')).toBeInTheDocument();
    expect(within(dialogue).getByText('10.0.0.7')).toBeInTheDocument();
    expect(within(dialogue).getByText('req-123')).toBeInTheDocument();
    expect(within(dialogue).getByText('Modifications')).toBeInTheDocument();
    expect(within(dialogue).getByText('Ancien titre')).toBeInTheDocument();
    expect(within(dialogue).getByText('Nouveau titre')).toBeInTheDocument();
    // Le payload est du texte brut dans un <pre>, jamais du HTML interprété.
    expect(dialogue.querySelector('pre')?.textContent).toContain('<img src=x onerror=alert(1)>');
    expect(dialogue.querySelector('img')).toBeNull();
  });

  it("n'affiche ni IP ni navigateur dans le détail d'une action du support", async () => {
    getTenantAuditLogs.mockResolvedValue({
      success: true,
      data: {
        logs: [
          makeLog({
            id: 'log-s',
            actorType: 'SUPER_ADMIN',
            user: undefined,
            resourceLabel: 'Ressource support',
            // Défense en profondeur : même si l'API en envoyait, l'écran n'en montre pas.
            ipAddress: '203.0.113.9',
            userAgent: 'agent-support'
          })
        ],
        nextCursor: null
      }
    });
    mount();

    await userEvent.click(await screen.findByText('Ressource support'));

    const dialogue = await screen.findByRole('dialog');
    expect(within(dialogue).getByText('Support ImmoTopia')).toBeInTheDocument();
    expect(within(dialogue).queryByText('203.0.113.9')).not.toBeInTheDocument();
    expect(within(dialogue).queryByText('agent-support')).not.toBeInTheDocument();
  });
});
