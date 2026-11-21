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

function monter() {
  return render(<PropertyMediaUpload propertyId="p1" tenantId="t1" />);
}

function choisir(container: HTMLElement, fichiers: File[]) {
  fireEvent.change(container.querySelector('input[type=file]') as HTMLInputElement, { target: { files: fichiers } });
}

describe('PropertyMediaUpload — suivi par fichier (lot 4 UX)', () => {
  beforeEach(() => {
    appels.length = 0;
    postImpl = async () => ({});
  });

  it('refuse une photo trop lourde avant l’envoi, avec la taille et la limite', async () => {
    const { container } = monter();
    const lourde = new File(['x'], 'villa.jpg', { type: 'image/jpeg' });
    Object.defineProperty(lourde, 'size', { value: 60 * 1024 * 1024 });
    choisir(container, [lourde]);
    expect(await screen.findByText(/la limite est de 50 Mo/)).toBeInTheDocument();
    expect(screen.getByText('Refusé')).toBeInTheDocument();
    expect(appels).toHaveLength(0);
  });

  it('explique le refus d’une photo HEIC d’iPhone', async () => {
    const { container } = monter();
    choisir(container, [new File(['x'], 'IMG_0001.HEIC', { type: 'image/heic' })]);
    expect(await screen.findByText(/format HEIC/)).toBeInTheDocument();
    expect(appels).toHaveLength(0);
  });

  it('propose « Réessayer » après un échec, puis envoie le fichier', async () => {
    postImpl = async () => {
      throw Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' });
    };
    const { container } = monter();
    choisir(container, [new File(['x'], 'salon.png', { type: 'image/png' })]);

    expect(await screen.findByText(/Connexion impossible/)).toBeInTheDocument();
    const relance = await screen.findByRole('button', { name: /Réessayer l’envoi de salon\.png/ });

    postImpl = async () => ({});
    fireEvent.click(relance);
    await waitFor(() => expect(appels).toHaveLength(2));
    await waitFor(() => expect(screen.queryByRole('button', { name: /Réessayer/ })).toBeNull());
  });

  it('donne un nom accessible au bouton qui écarte un fichier refusé', async () => {
    const { container } = monter();
    choisir(container, [new File(['x'], 'titre.pdf', { type: 'application/pdf' })]);
    const ecarter = await screen.findByRole('button', { name: /Écarter titre\.pdf de la liste/ });
    fireEvent.click(ecarter);
    expect(screen.queryByText('titre.pdf')).toBeNull();
  });
});
