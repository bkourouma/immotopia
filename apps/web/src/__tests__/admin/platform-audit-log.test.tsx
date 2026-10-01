import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { AuditLogs } from '../../pages/admin/AuditLogs';
import type { PlatformAuditLog } from '../../services/audit-service';

/**
 * Console plateforme « Journal d'audit » (spec 023, phase 4). Les services sont
 * mockés en entier (Vitest refuse tout import qu'un `vi.mock` ne déclare pas) ;
 * `useAuth` fournit le rôle, `saveBlob` évite de toucher au DOM du navigateur.
 */

const getAuditLogs = vi.fn();
const exportAuditLogs = vi.fn();
const listTenants = vi.fn();
const saveBlob = vi.fn();
const useAuthMock = vi.fn();

vi.mock('../../services/audit-service', () => ({
  getAuditLogs: (...a: unknown[]) => getAuditLogs(...a),
  exportAuditLogs: (...a: unknown[]) => exportAuditLogs(...a)
}));

vi.mock('../../services/tenant-service', () => ({
  listTenants: (...a: unknown[]) => listTenants(...a)
}));

vi.mock('../../utils/save-blob', () => ({
  saveBlob: (...a: unknown[]) => saveBlob(...a),
  filenameFromDisposition: vi.fn()
}));

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => useAuthMock()
}));

function makeLog(overrides: Partial<PlatformAuditLog> = {}): PlatformAuditLog {
  return {
    id: 'log-1',
    createdAt: '2026-09-15T10:30:00.000Z',
    action: 'PROPERTY_CREATED',
    category: 'DATA',
    outcome: 'SUCCESS',
    scope: 'TENANT',
    visibility: 'TENANT',
    actorType: 'USER',
    user: { id: 'user-1', email: 'awa@example.com', fullName: 'Awa Koné' },
    actorLabel: 'awa@example.com',
    tenantId: 'tenant-1',
    tenant: { id: 'tenant-1', name: 'Agence Soleil' },
    resourceType: 'PROPERTY',
    resourceId: 'prop-0001-aaaa',
    resourceLabel: 'Villa Les Palmiers',
    ipAddress: '10.0.0.7',
    userAgent: 'Mozilla/5.0 test',
    requestId: 'req-123',
    source: 'API',
    details: { note: '<b>gras</b>' },
    changes: { price: { before: 100, after: 200 } },
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
        action: 'AUDIT_EXPORTED',
        category: 'SECURITY',
        scope: 'PLATFORM',
        visibility: 'PLATFORM_ONLY',
        actorType: 'SUPER_ADMIN',
        user: undefined,
        actorLabel: 'root@immotopia.test',
        tenantId: undefined,
        tenant: undefined,
        resourceType: 'AUDIT_LOG',
        resourceId: 'x',
        resourceLabel: 'Journal complet',
        requestId: 'req-999'
      }),
      makeLog({
        id: 'log-3',
        action: 'AUTH_LOGIN_FAILED',
        category: 'AUTH',
        outcome: 'FAILURE',
        actorType: 'SYSTEM',
        user: undefined,
        actorLabel: undefined,
        resourceLabel: 'Tâche planifiée'
      })
    ],
    nextCursor: 'curseur-2'
  }
};

const SECONDE_PAGE = {
  success: true,
  data: { logs: [makeLog({ id: 'log-4', resourceLabel: 'Appartement Cocody' })], nextCursor: null }
};

function mount() {
  return render(
    <AntApp>
      <AuditLogs />
    </AntApp>
  );
}

async function pickFilter(name: string, option: string) {
  fireEvent.mouseDown(await screen.findByRole('combobox', { name }));
  const item = await waitFor(() => {
    const candidat = screen.getAllByText(option).find(el => el.closest('.ant-select-item'));
    if (!candidat) throw new Error(`Option « ${option} » introuvable`);
    return candidat;
  });
  fireEvent.click(item);
}

describe('AuditLogs (console plateforme)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAuditLogs.mockResolvedValue(PREMIERE_PAGE);
    listTenants.mockResolvedValue({
      success: true,
      data: { tenants: [{ id: 'tenant-1', name: 'Agence Soleil' }], pagination: {} }
    });
    useAuthMock.mockReturnValue({ user: { id: 'u', globalRole: 'SUPER_ADMIN' } });
  });

  it('affiche les lignes : agence, acteur, action, ressource, résultat, visibilité', async () => {
    mount();

    expect(await screen.findByText('Villa Les Palmiers')).toBeInTheDocument();
    expect(getAuditLogs).toHaveBeenCalledTimes(1);
    expect(getAuditLogs.mock.calls[0][0]).toEqual({});
    expect(screen.getAllByText('Agence Soleil').length).toBeGreaterThan(0);
    expect(screen.getByText('Awa Koné')).toBeInTheDocument();
    expect(screen.getByText("Création d'un nouveau bien immobilier dans le catalogue")).toBeInTheDocument();
    expect(screen.getByText('Tentative de connexion échouée')).toBeInTheDocument();
    expect(screen.getByText('Échouée')).toBeInTheDocument();
    expect(screen.getAllByText('Plateforme')).toHaveLength(1);
  });

  it("nomme l'acteur par son libellé figé, ou par son type, et montre une ligne sans agence", async () => {
    mount();
    await screen.findByText('Journal complet');

    const ligne = screen.getByText('Journal complet').closest('tr') as HTMLElement;
    expect(within(ligne).getByText('root@immotopia.test')).toBeInTheDocument();
    expect(within(ligne).getByText('—')).toBeInTheDocument();
    expect(within(ligne).getByText('Plateforme')).toBeInTheDocument();
    const systeme = screen.getByText('Tâche planifiée').closest('tr') as HTMLElement;
    expect(within(systeme).getByText('Système')).toBeInTheDocument();
  });

  it('« Charger plus » ajoute les lignes suivantes avec le curseur, puis disparaît', async () => {
    getAuditLogs.mockResolvedValueOnce(PREMIERE_PAGE).mockResolvedValueOnce(SECONDE_PAGE);
    mount();
    await screen.findByText('Villa Les Palmiers');

    await userEvent.click(screen.getByRole('button', { name: 'Charger plus' }));

    expect(await screen.findByText('Appartement Cocody')).toBeInTheDocument();
    expect(getAuditLogs.mock.calls[1][0]).toEqual(expect.objectContaining({ cursor: 'curseur-2' }));
    expect(screen.getByText('Villa Les Palmiers')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Charger plus' })).not.toBeInTheDocument();
  });

  it('un changement de filtre repart de zéro, sans curseur', async () => {
    getAuditLogs
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

    await pickFilter('Visibilité', 'Réservées à la plateforme');

    expect(await screen.findByText('Bail filtré')).toBeInTheDocument();
    expect(getAuditLogs.mock.calls[2][0]).toEqual(
      expect.objectContaining({ visibility: 'PLATFORM_ONLY', cursor: undefined })
    );
    expect(screen.queryByText('Villa Les Palmiers')).not.toBeInTheDocument();
    expect(screen.queryByText('Appartement Cocody')).not.toBeInTheDocument();
  });

  it('filtre par agence choisie dans la liste alimentée par le service des agences', async () => {
    mount();
    await screen.findByText('Villa Les Palmiers');

    await pickFilter('Agence', 'Agence Soleil');

    await waitFor(() =>
      expect(getAuditLogs).toHaveBeenLastCalledWith(expect.objectContaining({ tenantId: 'tenant-1' }))
    );
  });

  it("convertit l'action en MAJUSCULES et n'envoie rien quand le champ est vide", async () => {
    mount();
    await screen.findByText('Villa Les Palmiers');

    await userEvent.type(screen.getByRole('textbox', { name: 'Action' }), 'property_created');

    await waitFor(() =>
      expect(getAuditLogs).toHaveBeenLastCalledWith(expect.objectContaining({ actionKey: 'PROPERTY_CREATED' }))
    );
    await userEvent.clear(screen.getByRole('textbox', { name: 'Action' }));
    await waitFor(() => expect(getAuditLogs.mock.calls.at(-1)?.[0]).toEqual({}));
  });

  it("ignore la réponse d'une requête périmée quand le filtre change entre-temps", async () => {
    let resoudrePremiere: (value: unknown) => void = () => undefined;
    getAuditLogs
      .mockImplementationOnce(() => new Promise(resolve => (resoudrePremiere = resolve)))
      .mockResolvedValueOnce({
        success: true,
        data: { logs: [makeLog({ id: 'log-6', resourceLabel: 'Ligne récente' })], nextCursor: null }
      });
    mount();

    await pickFilter('Résultat', 'Échouée');
    expect(await screen.findByText('Ligne récente')).toBeInTheDocument();

    resoudrePremiere(PREMIERE_PAGE);
    await waitFor(() => expect(getAuditLogs).toHaveBeenCalledTimes(2));
    expect(screen.getByText('Ligne récente')).toBeInTheDocument();
    expect(screen.queryByText('Villa Les Palmiers')).not.toBeInTheDocument();
  });

  it("ouvre le détail, rend le JSON en texte, et un clic sur l'identifiant de requête applique le filtre", async () => {
    getAuditLogs.mockResolvedValueOnce(PREMIERE_PAGE).mockResolvedValueOnce(SECONDE_PAGE);
    mount();
    await userEvent.click(await screen.findByText('Villa Les Palmiers'));

    const modale = await screen.findByRole('dialog');
    expect(within(modale).getByText('10.0.0.7')).toBeInTheDocument();
    expect(within(modale).getByText('Mozilla/5.0 test')).toBeInTheDocument();
    expect(within(modale).getByText('Modifications')).toBeInTheDocument();
    // Contenu utilisateur : du texte, jamais du HTML.
    expect(modale.querySelector('pre')?.textContent).toContain('<b>gras</b>');
    expect(modale.querySelector('pre b')).toBeNull();

    await userEvent.click(within(modale).getByRole('button', { name: 'Voir toute la requête' }));

    await waitFor(() =>
      expect(getAuditLogs).toHaveBeenLastCalledWith(expect.objectContaining({ requestId: 'req-123' }))
    );
    expect(await screen.findByText('Appartement Cocody')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Identifiant de requête' })).toHaveValue('req-123');
  });

  it("montre l'état vide", async () => {
    getAuditLogs.mockResolvedValue({ success: true, data: { logs: [], nextCursor: null } });
    mount();

    expect(await screen.findByText('Aucune activité enregistrée pour ces critères')).toBeInTheDocument();
  });

  it("montre l'erreur de l'API et « Réessayer » relance la requête", async () => {
    getAuditLogs
      .mockRejectedValueOnce({ response: { data: { message: 'Service indisponible' } } })
      .mockResolvedValueOnce(PREMIERE_PAGE);
    mount();

    expect(await screen.findByText('Service indisponible')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Réessayer' }));

    expect(await screen.findByText('Villa Les Palmiers')).toBeInTheDocument();
    expect(screen.queryByText('Service indisponible')).not.toBeInTheDocument();
  });

  describe('export CSV', () => {
    const blob = new Blob(['a']);

    it("n'affiche pas le bouton à qui n'est pas super-administrateur", async () => {
      useAuthMock.mockReturnValue({ user: { id: 'u', globalRole: 'USER' } });
      mount();
      await screen.findByText('Villa Les Palmiers');

      expect(screen.queryByRole('button', { name: /Exporter en CSV/ })).not.toBeInTheDocument();
    });

    it('exporte avec les filtres courants et enregistre le fichier', async () => {
      exportAuditLogs.mockResolvedValue({ blob, filename: 'journal-audit-2026-10-01.csv', truncated: false });
      mount();
      await screen.findByText('Villa Les Palmiers');
      await pickFilter('Catégorie', 'Authentification');
      await waitFor(() => expect(getAuditLogs).toHaveBeenCalledTimes(2));

      await userEvent.click(screen.getByRole('button', { name: /Exporter en CSV/ }));

      await waitFor(() => expect(saveBlob).toHaveBeenCalledWith(blob, 'journal-audit-2026-10-01.csv'));
      const filtres = exportAuditLogs.mock.calls[0][0];
      expect(filtres).toEqual(expect.objectContaining({ category: 'AUTH' }));
      expect(filtres).not.toHaveProperty('cursor');
      expect(filtres).not.toHaveProperty('limit');
      expect(screen.queryByText(/limité à 50 000 lignes/)).not.toBeInTheDocument();
    });

    it("avertit quand l'export est tronqué", async () => {
      exportAuditLogs.mockResolvedValue({ blob, filename: 'j.csv', truncated: true });
      mount();
      await screen.findByText('Villa Les Palmiers');

      await userEvent.click(screen.getByRole('button', { name: /Exporter en CSV/ }));

      expect(
        await screen.findByText(
          "L'export est limité à 50 000 lignes : affinez les filtres pour obtenir tout le journal."
        )
      ).toBeInTheDocument();
    });

    it("retire le bouton après un refus 403 et affiche le message de l'API", async () => {
      exportAuditLogs.mockRejectedValue({ response: { status: 403, data: { message: 'Droit manquant' } } });
      mount();
      await screen.findByText('Villa Les Palmiers');

      await userEvent.click(screen.getByRole('button', { name: /Exporter en CSV/ }));

      expect(await screen.findByText('Droit manquant')).toBeInTheDocument();
      expect(saveBlob).not.toHaveBeenCalled();
      await waitFor(() => expect(screen.queryByRole('button', { name: /Exporter en CSV/ })).not.toBeInTheDocument());
    });
  });
});
