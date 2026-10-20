import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { App as AntApp } from 'antd';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { InviteCollaborator } from '../../pages/tenant/InviteCollaborator';
import { isInvitationEmailNotSent } from '../../services/invitation-service';

/** BUG-2026-10-19-007 : l'écran annonce un succès alors que l'e-mail n'est pas parti. */

const inviteCollaborator = vi.hoisted(() => vi.fn());
const apiGet = vi.hoisted(() => vi.fn());

vi.mock('../../services/invitation-service', async importOriginal => ({
  ...(await importOriginal<typeof import('../../services/invitation-service')>()),
  inviteCollaborator: (...args: unknown[]) => inviteCollaborator(...args)
}));
vi.mock('../../utils/api-client', () => ({ default: { get: (...args: unknown[]) => apiGet(...args) } }));

const WARNING = "Invitation créée, mais l'e-mail n'a pas pu être envoyé. Utilisez « Renvoyer » pour réessayer.";

function renderPage() {
  return render(
    <AntApp>
      <MemoryRouter initialEntries={['/tenant/t1/invite']}>
        <Routes>
          <Route path="/tenant/:tenantId/invite" element={<InviteCollaborator />} />
          <Route path="/tenant/:tenantId/invitations" element={<div>Liste des invitations</div>} />
        </Routes>
      </MemoryRouter>
    </AntApp>
  );
}

async function submit() {
  fireEvent.change(await screen.findByRole('textbox'), { target: { value: 'nouveau@exemple.test' } });
  fireEvent.click(await screen.findByText('Agent'));
  fireEvent.click(screen.getByRole('button', { name: /Envoyer l.invitation/ }));
}

describe('InviteCollaborator : e-mail non parti', () => {
  beforeEach(() => {
    inviteCollaborator.mockReset();
    apiGet.mockReset();
    apiGet.mockResolvedValue({
      data: { data: [{ id: 'r1', key: 'AGENT', name: 'Agent', description: null, scope: 'TENANT' }] }
    });
  });

  it('affiche l’avertissement du serveur, pas un succès', async () => {
    inviteCollaborator.mockResolvedValue({ success: true, message: WARNING, data: {} });
    renderPage();
    await submit();
    expect(await screen.findByText(WARNING)).toBeInTheDocument();
    expect(screen.queryByText('Invitation envoyée avec succès')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Liste des invitations')).toBeInTheDocument());
  });

  it('annonce le succès quand l’e-mail est parti', async () => {
    inviteCollaborator.mockResolvedValue({ success: true, message: 'Invitation envoyée avec succès.', data: {} });
    renderPage();
    await submit();
    expect(await screen.findByText('Invitation envoyée avec succès')).toBeInTheDocument();
  });
});

describe('isInvitationEmailNotSent', () => {
  it('privilégie le champ emailSent, sinon reconnaît le message d’avertissement', () => {
    expect(isInvitationEmailNotSent({ emailSent: false, message: 'ok' }, WARNING)).toBe(true);
    expect(isInvitationEmailNotSent({ emailSent: true, message: WARNING }, WARNING)).toBe(false);
    expect(isInvitationEmailNotSent({ message: WARNING }, WARNING)).toBe(true);
    expect(isInvitationEmailNotSent({ message: 'Invitation envoyée avec succès.' }, WARNING)).toBe(false);
    expect(isInvitationEmailNotSent({}, WARNING)).toBe(false);
  });
});
