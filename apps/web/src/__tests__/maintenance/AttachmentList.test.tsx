import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AttachmentList } from '../../components/maintenance/AttachmentList';

/**
 * `AttachmentList` — les pièces jointes de maintenance ne sont plus lues en
 * statique (`/uploads/maintenance` répond 404) : chaque fichier, vignette
 * comprise, arrive en blob par le client API, depuis la route de l'écran.
 */

const get = vi.fn();
vi.mock('../../utils/api-client', () => ({ default: { get: (...a: unknown[]) => get(...a) } }));

const createObjectURL = vi.fn();
const revokeObjectURL = vi.fn();
let urls = 0;

beforeEach(() => {
  vi.clearAllMocks();
  urls = 0;
  createObjectURL.mockImplementation(() => `blob:http://localhost:3000/piece-${++urls}`);
  // jsdom ne fournit pas ces deux fonctions.
  Object.assign(URL, { createObjectURL, revokeObjectURL });
  get.mockImplementation(async () => ({ data: new Blob(['contenu'], { type: 'image/jpeg' }) }));
});

afterEach(() => {
  vi.restoreAllMocks();
});

const photo = { id: 'att-1', fileName: 'fuite.jpg', mimeType: 'image/jpeg', fileSize: 2048 };
const devis = { id: 'att-2', fileName: 'devis.pdf', mimeType: 'application/pdf', fileSize: 4096 };

function sourcesEmises(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('[src], [href]')).map(
    element => element.getAttribute('src') ?? element.getAttribute('href') ?? ''
  );
}

describe('AttachmentList — fichiers lus par le client API', () => {
  it('charge la vignette par la route de gestion et l’affiche en URL blob:', async () => {
    const { container } = render(
      <AttachmentList attachments={[photo, devis]} source={{ kind: 'agency', tenantId: 'agence-1' }} />
    );

    const image = await screen.findByAltText('fuite.jpg');
    expect(image.getAttribute('src')).toBe('blob:http://localhost:3000/piece-1');
    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith(
      '/tenants/agence-1/maintenance/files/att-1',
      expect.objectContaining({ responseType: 'blob' })
    );

    // Aucune URL statique, ni jeton dans une URL.
    for (const source of sourcesEmises(container)) {
      expect(source).not.toContain('/uploads');
      expect(source).not.toMatch(/token/i);
    }
  });

  it('portails : la vignette vient de la route du portail, par ticket', async () => {
    const { unmount } = render(
      <AttachmentList attachments={[photo]} source={{ kind: 'tenant-portal', ticketId: 'ticket-9' }} />
    );
    await screen.findByAltText('fuite.jpg');
    expect(get).toHaveBeenCalledWith(
      '/portal/tenant/maintenance/ticket-9/attachments/att-1',
      expect.objectContaining({ responseType: 'blob' })
    );
    unmount();

    render(<AttachmentList attachments={[photo]} source={{ kind: 'owner-portal', ticketId: 'ticket-9' }} />);
    await screen.findByAltText('fuite.jpg');
    expect(get).toHaveBeenLastCalledWith(
      '/portal/owner/maintenance/ticket-9/attachments/att-1',
      expect.objectContaining({ responseType: 'blob' })
    );
  });

  it('libère l’URL blob: au démontage', async () => {
    const { unmount } = render(
      <AttachmentList attachments={[photo]} source={{ kind: 'agency', tenantId: 'agence-1' }} />
    );
    await screen.findByAltText('fuite.jpg');
    expect(revokeObjectURL).not.toHaveBeenCalled();

    unmount();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:http://localhost:3000/piece-1');
  });

  it('une vignette refusée par l’API n’ouvre aucune URL de repli', async () => {
    get.mockRejectedValueOnce(Object.assign(new Error('404'), { response: { status: 404 } }));
    const { container } = render(
      <AttachmentList attachments={[photo]} source={{ kind: 'agency', tenantId: 'agence-1' }} />
    );
    await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(container.querySelector('img')).toBeNull());
    expect(createObjectURL).not.toHaveBeenCalled();
    for (const source of sourcesEmises(container)) {
      expect(source).not.toContain('/uploads');
    }
  });

  it('le téléchargement passe par la même route', async () => {
    render(<AttachmentList attachments={[devis]} source={{ kind: 'owner-portal', ticketId: 'ticket-9' }} />);
    // Un PDF n'a pas de vignette : aucun appel tant qu'on ne télécharge pas.
    expect(get).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: /Télécharger/ }));
    await waitFor(() =>
      expect(get).toHaveBeenCalledWith(
        '/portal/owner/maintenance/ticket-9/attachments/att-2',
        expect.objectContaining({ responseType: 'blob' })
      )
    );
    await waitFor(() => expect(revokeObjectURL).toHaveBeenCalled());
  });
});
