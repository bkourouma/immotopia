import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { App as AntApp } from 'antd';
import type { FormInstance } from 'antd';
import { onAntFormValidationFailed } from '../../lib/antFormFailure';
import { FeedbackBridge } from '../../lib/feedback';

/**
 * `onAntFormValidationFailed` est le geste partagé posé sur `onFinishFailed`
 * de plusieurs formulaires (fiche d'un bien, fiche contact CRM, bail, fiche
 * agence...) : sans lui, un champ obligatoire resté vide en haut d'un long
 * formulaire échouait à la soumission sans qu'aucun signe ne le montre.
 */
describe('onAntFormValidationFailed', () => {
  it('défile jusqu’au premier champ en erreur, avec un défilement doux et centré', () => {
    const scrollToField = vi.fn();
    const form = { scrollToField } as unknown as FormInstance;

    onAntFormValidationFailed(form)({
      errorFields: [
        { name: ['ownerUserId'], errors: ['Le propriétaire est requis'] },
        { name: ['title'], errors: ['Le titre est requis'] }
      ]
    });

    // Le PREMIER champ en erreur, pas le dernier ni tous.
    expect(scrollToField).toHaveBeenCalledTimes(1);
    expect(scrollToField).toHaveBeenCalledWith(['ownerUserId'], { behavior: 'smooth', block: 'center' });
  });

  it('n’essaie pas de défiler quand la liste des champs en erreur est vide', () => {
    const scrollToField = vi.fn();
    const form = { scrollToField } as unknown as FormInstance;

    onAntFormValidationFailed(form)({ errorFields: [] });

    expect(scrollToField).not.toHaveBeenCalled();
  });

  it('affiche le message d’échec via le pont de retour d’action', async () => {
    const form = { scrollToField: vi.fn() } as unknown as FormInstance;

    render(
      <AntApp>
        <FeedbackBridge />
      </AntApp>
    );

    onAntFormValidationFailed(form)({
      errorFields: [{ name: ['title'], errors: ['Le titre est requis'] }]
    });

    await waitFor(() => {
      expect(screen.getByText('Le formulaire contient des erreurs — voir les champs en rouge.')).toBeInTheDocument();
    });
  });
});
