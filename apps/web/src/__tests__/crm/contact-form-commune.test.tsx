import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { ContactForm } from '../../components/crm/ContactForm';

/**
 * Recette staging du 17 octobre 2026 : une fiche ayant une adresse mais jamais
 * de commune ne pouvait plus être enregistrée (« La commune est requise »,
 * champ caché dans l'onglet Contact). La commune n'est exigée qu'à la création.
 */

vi.mock('../../components/ui/location-selector', () => ({
  LocationSelector: () => <div>sélecteur de commune</div>
}));
vi.mock('../../services/geographic-service', () => ({
  getLocationByCommuneId: vi.fn(async () => null)
}));

const contactSansCommune: any = {
  id: 'c1',
  contactType: 'PERSON',
  firstName: 'Awa',
  lastName: 'Gogoua',
  email: 'awa@example.ci',
  address: 'Rue des Jardins'
};

describe('ContactForm — commune', () => {
  it('enregistre la modification d’une fiche existante sans commune', async () => {
    const onSubmit = vi.fn(async () => undefined);
    const user = userEvent.setup({ delay: null });
    render(
      <AntApp>
        <ContactForm contact={contactSansCommune} onSubmit={onSubmit} />
      </AntApp>
    );
    const email = await screen.findByLabelText(/Email personnel/i);
    await user.clear(email);
    await user.type(email, 'nouveau@example.ci');
    await user.click(screen.getByRole('button', { name: /Enregistrer|Mettre à jour|Créer le contact/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1), { timeout: 8000 });
    expect(screen.queryByText('La commune est requise')).not.toBeInTheDocument();
  });

  it('exige toujours la commune à la création', async () => {
    const onSubmit = vi.fn(async () => undefined);
    const user = userEvent.setup({ delay: null });
    render(
      <AntApp>
        <ContactForm onSubmit={onSubmit} />
      </AntApp>
    );
    await user.type(await screen.findByLabelText(/Prénom/i), 'Awa');
    await user.type(screen.getByLabelText(/^Nom$/i), 'Konan');
    await user.type(screen.getByLabelText(/Email personnel/i), 'a@example.ci');
    await user.click(screen.getByRole('button', { name: /Enregistrer|Créer le contact/i }));
    expect(await screen.findByText('La commune est requise', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Contact' })).toHaveAttribute('aria-selected', 'true'));
  });
});
