import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { BrandingImageField } from '../../components/documents/BrandingImageField';

/**
 * `<BrandingImageField>` — aperçu et envoi d'une image d'identité de document
 * (logo, signature, cachet). Toujours privée (voir `AGENTS.md`) : l'aperçu
 * passe par un blob révoqué au démontage/changement, jamais par un `<img
 * src="…">` pointant l'API directement.
 */

const createObjectURL = vi.fn();
const revokeObjectURL = vi.fn();
let urls = 0;

beforeEach(() => {
  vi.clearAllMocks();
  urls = 0;
  createObjectURL.mockImplementation(() => `blob:http://localhost:3000/image-${++urls}`);
  Object.assign(URL, { createObjectURL, revokeObjectURL });
});

afterEach(() => {
  vi.restoreAllMocks();
});

function renderField(props: Partial<React.ComponentProps<typeof BrandingImageField>> = {}) {
  const fetchImage = props.fetchImage ?? (async () => new Blob(['contenu'], { type: 'image/png' }));
  const onUpload = props.onUpload ?? vi.fn().mockResolvedValue(undefined);
  const onRemove = props.onRemove ?? vi.fn().mockResolvedValue(undefined);
  return {
    onUpload,
    onRemove,
    ...render(
      <AntApp>
        <BrandingImageField
          label="Logo"
          hasImage={props.hasImage ?? true}
          fetchImage={fetchImage}
          onUpload={onUpload}
          onRemove={onRemove}
          imageVersion={props.imageVersion ?? 0}
        />
      </AntApp>
    )
  };
}

describe('BrandingImageField', () => {
  it('charge l’image en blob et l’affiche', async () => {
    const fetchImage = vi.fn().mockResolvedValue(new Blob(['contenu'], { type: 'image/png' }));
    renderField({ fetchImage });

    const image = await screen.findByAltText('Logo');
    expect(image.getAttribute('src')).toBe('blob:http://localhost:3000/image-1');
    expect(fetchImage).toHaveBeenCalledTimes(1);
  });

  it('révoque l’URL de l’objet au démontage', async () => {
    const fetchImage = vi.fn().mockResolvedValue(new Blob(['contenu'], { type: 'image/png' }));
    const { unmount } = renderField({ fetchImage });

    await screen.findByAltText('Logo');
    unmount();

    expect(revokeObjectURL).toHaveBeenCalledWith('blob:http://localhost:3000/image-1');
  });

  it('recharge l’image quand `imageVersion` change (après un remplacement)', async () => {
    const fetchImage = vi
      .fn()
      .mockResolvedValueOnce(new Blob(['v1'], { type: 'image/png' }))
      .mockResolvedValueOnce(new Blob(['v2'], { type: 'image/png' }));

    const { rerender } = render(
      <AntApp>
        <BrandingImageField
          label="Logo"
          hasImage
          fetchImage={fetchImage}
          onUpload={vi.fn()}
          onRemove={vi.fn()}
          imageVersion={0}
        />
      </AntApp>
    );

    await screen.findByAltText('Logo');
    expect(fetchImage).toHaveBeenCalledTimes(1);

    rerender(
      <AntApp>
        <BrandingImageField
          label="Logo"
          hasImage
          fetchImage={fetchImage}
          onUpload={vi.fn()}
          onRemove={vi.fn()}
          imageVersion={1}
        />
      </AntApp>
    );

    await waitFor(() => expect(fetchImage).toHaveBeenCalledTimes(2));
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:http://localhost:3000/image-1');
  });

  it('n’affiche aucune image et ne charge rien quand `hasImage` est faux', async () => {
    const fetchImage = vi.fn();
    renderField({ hasImage: false, fetchImage });

    expect(await screen.findByText('Aucune image')).toBeTruthy();
    expect(fetchImage).not.toHaveBeenCalled();
  });

  it('rejette un fichier trop volumineux avant tout appel réseau', async () => {
    const user = userEvent.setup();
    const onUpload = vi.fn();
    renderField({ hasImage: false, onUpload });

    const bigFile = new File([new Uint8Array(3 * 1024 * 1024)], 'grand.png', { type: 'image/png' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, bigFile);

    expect(await screen.findByText('Le fichier ne doit pas dépasser 2 Mo')).toBeTruthy();
    expect(onUpload).not.toHaveBeenCalled();
  });

  it('rejette un format non supporté avant tout appel réseau', async () => {
    const onUpload = vi.fn();
    renderField({ hasImage: false, onUpload });

    // `userEvent.upload` filtre lui-même selon l'attribut `accept` du champ
    // (image/png,image/jpeg) et ignorerait silencieusement ce PDF avant même
    // que `beforeUpload` s'exécute — `fireEvent` dépose le fichier sans ce
    // filtre, comme le ferait un glisser-déposer ou un « Tous les fichiers ».
    const pdfFile = new File(['contenu'], 'document.pdf', { type: 'application/pdf' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [pdfFile] } });

    expect(await screen.findByText('Format non supporté (PNG ou JPEG uniquement)')).toBeTruthy();
    expect(onUpload).not.toHaveBeenCalled();
  });

  it('envoie un fichier valide via `onUpload`', async () => {
    const user = userEvent.setup();
    const onUpload = vi.fn().mockResolvedValue(undefined);
    renderField({ hasImage: false, onUpload });

    const validFile = new File(['contenu'], 'logo.png', { type: 'image/png' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, validFile);

    await waitFor(() => expect(onUpload).toHaveBeenCalledWith(validFile));
  });

  it('affiche le message du serveur (403 ou 400) quand l’envoi échoue', async () => {
    const user = userEvent.setup();
    const onUpload = vi.fn().mockRejectedValue({
      response: { status: 400, data: { success: false, message: 'Image trop grande : 3000 x 3000 pixels maximum.' } }
    });
    renderField({ hasImage: false, onUpload });

    const validFile = new File(['contenu'], 'logo.png', { type: 'image/png' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, validFile);

    expect(await screen.findByText('Image trop grande : 3000 x 3000 pixels maximum.')).toBeTruthy();
  });

  it('retire l’image via `onRemove`', async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn().mockResolvedValue(undefined);
    renderField({ hasImage: true, onRemove });

    await screen.findByAltText('Logo');
    await user.click(screen.getByRole('button', { name: /Retirer/ }));

    await waitFor(() => expect(onRemove).toHaveBeenCalledTimes(1));
  });
});
