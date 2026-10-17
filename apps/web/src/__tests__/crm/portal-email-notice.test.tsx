import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { ContactForm } from '../../components/crm/ContactForm';
import { PortalEmailNotice } from '../../components/crm/PortalEmailNotice';

vi.mock('../../services/membership-service', () => ({
  listAssignableMembers: vi.fn(async () => ({ success: true, data: [] }))
}));
vi.mock('../../services/geographic-service', () => ({
  getLocationByCommuneId: vi.fn(async () => null),
  searchLocations: vi.fn(async () => [])
}));
vi.mock('../../components/ui/location-selector', () => ({
  LocationSelector: () => <div />
}));

const baseContact = {
  id: 'c1',
  tenantId: 't1',
  firstName: 'Awa',
  lastName: 'Gogoua',
  email: 'nouvelle@example.ci',
  contactType: 'PERSON'
} as never;

function renderForm(extra: Record<string, unknown>) {
  const contact = { ...(baseContact as object), ...extra } as never;
  return render(
    <MemoryRouter>
      <AntApp>
        <ContactForm contact={contact} onSubmit={vi.fn()} />
      </AntApp>
    </MemoryRouter>
  );
}

describe('Note « avis au compte portail » de la fiche contact', () => {
  it('affiche le masque quand la fiche diffère du compte', () => {
    renderForm({ portalAccountEmailNotice: { maskedEmail: 'a•••@ex•••.ci' } });
    const note = screen.getByTestId('portal-email-notice');
    expect(note.textContent).toContain("Les avis (prélèvement, rappels…) partent à l'adresse du compte portail :");
    const bdi = note.querySelector('bdi');
    expect(bdi?.getAttribute('dir')).toBe('ltr');
    expect(bdi?.textContent).toBe('a•••@ex•••.ci');
  });

  it('est absente sans avertissement (null ou champ manquant)', () => {
    const { unmount } = renderForm({ portalAccountEmailNotice: null });
    expect(screen.queryByTestId('portal-email-notice')).toBeNull();
    unmount();
    renderForm({});
    expect(screen.queryByTestId('portal-email-notice')).toBeNull();
  });

  it('laisse le champ e-mail modifiable', () => {
    renderForm({ portalAccountEmailNotice: { maskedEmail: 'a•••@ex•••.ci' } });
    const input = screen.getByDisplayValue('nouvelle@example.ci') as HTMLInputElement;
    expect(input.disabled).toBe(false);
    expect(input.readOnly).toBe(false);
    fireEvent.change(input, { target: { value: 'autre@example.ci' } });
    expect(input.value).toBe('autre@example.ci');
  });

  it('le composant seul ne rend rien sans note', () => {
    const { container } = render(<PortalEmailNotice notice={null} />);
    expect(container.firstChild).toBeNull();
  });
});
