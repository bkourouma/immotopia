import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { App as AntApp } from 'antd';
import { ContactForm } from '../../components/crm/ContactForm';

/**
 * Audit 2026-10-19 : un nouveau contact ne consent à rien par défaut ; un
 * contact existant garde ses consentements.
 */

vi.mock('../../components/ui/location-selector', () => ({
  LocationSelector: () => <div>sélecteur de commune</div>
}));
vi.mock('../../services/geographic-service', () => ({
  getLocationByCommuneId: vi.fn(async () => null)
}));

const cases = () => [
  screen.getByLabelText('Consentement marketing') as HTMLInputElement,
  screen.getByLabelText('Consentement WhatsApp') as HTMLInputElement,
  screen.getByLabelText('Consentement Email') as HTMLInputElement
];

describe('ContactForm — consentements', () => {
  it('création : les trois cases sont décochées', async () => {
    render(
      <AntApp>
        <ContactForm onSubmit={vi.fn(async () => undefined)} />
      </AntApp>
    );
    await screen.findByLabelText(/Prénom/i);
    cases().forEach(c => expect(c.checked).toBe(false));
  });

  it('édition : les consentements existants restent cochés', async () => {
    const contact: any = {
      id: 'c1',
      contactType: 'PERSON',
      firstName: 'Awa',
      lastName: 'Gogoua',
      email: 'awa@example.ci',
      consentMarketing: true,
      consentWhatsapp: false,
      consentEmail: true
    };
    render(
      <AntApp>
        <ContactForm contact={contact} onSubmit={vi.fn(async () => undefined)} />
      </AntApp>
    );
    await screen.findByLabelText(/Prénom/i);
    expect(cases().map(c => c.checked)).toEqual([true, false, true]);
  });
});
