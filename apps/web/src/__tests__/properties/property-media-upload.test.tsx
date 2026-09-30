import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PropertyMediaUpload } from '../../components/properties/PropertyMediaUpload';

const appels: unknown[][] = [];
let postImpl: () => Promise<unknown> = async () => ({});
vi.mock('../../utils/api-client', () => ({
  __esModule: true,
  default: {
    post: (...a: unknown[]) => {
      appels.push(a);
      return postImpl();
    }
  }
}));

function choisir(fichier: File) {
  const { container } = render(<PropertyMediaUpload propertyId="p1" tenantId="t1" />);
  fireEvent.change(container.querySelector('input[type=file]') as HTMLInputElement, { target: { files: [fichier] } });
}

/** BUG-2026-09-30-023 : un fichier refusé doit s'expliquer à l'écran. */
describe('PropertyMediaUpload', () => {
  beforeEach(() => {
    appels.length = 0;
    postImpl = async () => ({});
  });

  it('refuse un PDF côté client avec un message, sans appeler l’API', async () => {
    choisir(new File(['x'], 'titre-foncier.pdf', { type: 'application/pdf' }));
    expect(await screen.findByText(/Type de fichier non accepté pour une photo/)).toBeInTheDocument();
    expect(appels).toHaveLength(0);
  });

  it('affiche le message de l’API quand elle refuse une image', async () => {
    const refus = Object.assign(new Error('Request failed'), {
      response: { status: 400, data: { message: 'Image trop lourde.' } }
    });
    postImpl = async () => {
      throw refus;
    };
    choisir(new File(['x'], 'a.png', { type: 'image/png' }));
    await waitFor(() => expect(screen.getByText(/Image trop lourde\./)).toBeInTheDocument());
  });
});
