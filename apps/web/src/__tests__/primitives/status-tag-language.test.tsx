import React from 'react';
import { render, screen } from '@testing-library/react';
import i18next from 'i18next';
import { afterEach, describe, expect, it } from 'vitest';
import { StatusTag, statusLabel } from '../../components/primitives/StatusTag';

/**
 * Les libellés sont résolus au rendu, pas au chargement du module : passer du
 * français à l'arabe sans recharger doit retraduire « Disponible / Loué / Vendu ».
 */
afterEach(async () => {
  await i18next.changeLanguage('fr');
});

describe('StatusTag — changement de langue à chaud', () => {
  it('retraduit les libellés sans remonter le module', async () => {
    i18next.addResourceBundle('ar', 'app', { Disponible: 'متاح', Loué: 'مؤجر', Vendu: 'مباع' }, true, true);

    const view = render(<StatusTag status="AVAILABLE" />);
    expect(screen.getByText('Disponible')).toBeInTheDocument();
    expect(statusLabel('RENTED')).toBe('Loué');

    await i18next.changeLanguage('ar');
    view.rerender(<StatusTag status="available" />);
    expect(screen.getByText('متاح')).toBeInTheDocument();
    expect(statusLabel('RENTED')).toBe('مؤجر');
    expect(statusLabel('SOLD')).toBe('مباع');

    await i18next.changeLanguage('fr');
    view.rerender(<StatusTag status="AVAILABLE" />);
    expect(screen.getByText('Disponible')).toBeInTheDocument();
  });
});
