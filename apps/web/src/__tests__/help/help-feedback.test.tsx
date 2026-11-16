import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { HelpFeedback } from '../../help/components/HelpFeedback';

const sendHelpFeedback = vi.fn();

vi.mock('../../help/feedback-api', () => ({
  sendHelpFeedback: (payload: unknown) => sendHelpFeedback(payload)
}));
vi.mock('../../help/registry', () => ({
  currentHelpLanguage: () => 'fr'
}));

describe('HelpFeedback', () => {
  beforeEach(() => {
    sendHelpFeedback.mockReset();
    sendHelpFeedback.mockResolvedValue({ id: '1' });
  });

  it('Oui envoie un avis positif puis remercie', async () => {
    render(<HelpFeedback helpId="locatif.baux.liste" />);
    fireEvent.click(screen.getByRole('button', { name: 'Oui' }));
    await waitFor(() => expect(screen.getByText('Merci pour votre retour.')).toBeTruthy());
    expect(sendHelpFeedback).toHaveBeenCalledWith({
      helpId: 'locatif.baux.liste',
      useful: true,
      path: window.location.pathname,
      locale: 'fr'
    });
  });

  it('Non envoie l’avis puis la question saisie', async () => {
    render(<HelpFeedback helpId="locatif.baux.liste" />);
    fireEvent.click(screen.getByRole('button', { name: 'Non' }));
    const field = await screen.findByLabelText('Que manque-t-il ? (facultatif)');
    expect(sendHelpFeedback).toHaveBeenCalledWith(expect.objectContaining({ useful: false }));
    const send = screen.getByRole('button', { name: 'Envoyer' });
    expect((send as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(field, { target: { value: '  Comment faire ?  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }));
    await waitFor(() => expect(screen.getByText('Merci pour votre retour.')).toBeTruthy());
    expect(sendHelpFeedback).toHaveBeenLastCalledWith({
      helpId: 'locatif.baux.liste',
      question: 'Comment faire ?',
      path: window.location.pathname,
      locale: 'fr'
    });
  });

  it('« Ma question n’est pas couverte » ouvre le champ sans avis', async () => {
    render(<HelpFeedback helpId="locatif.baux.liste" />);
    fireEvent.click(screen.getByRole('button', { name: "Ma question n'est pas couverte" }));
    await screen.findByLabelText('Que manque-t-il ? (facultatif)');
    expect(sendHelpFeedback).not.toHaveBeenCalled();
  });

  it('affiche un message neutre en cas d’échec', async () => {
    sendHelpFeedback.mockRejectedValue(new Error('réseau'));
    render(<HelpFeedback helpId="locatif.baux.liste" />);
    fireEvent.click(screen.getByRole('button', { name: 'Oui' }));
    await screen.findByText("Votre retour n'a pas pu être envoyé. Vous pouvez réessayer plus tard.");
    expect((screen.getByRole('button', { name: 'Oui' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('limite le champ à 1000 caractères', async () => {
    render(<HelpFeedback helpId="locatif.baux.liste" />);
    fireEvent.click(screen.getByRole('button', { name: "Ma question n'est pas couverte" }));
    const field = await screen.findByLabelText('Que manque-t-il ? (facultatif)');
    expect(field.getAttribute('maxlength')).toBe('1000');
  });

  it('se remet à zéro quand la fiche change', async () => {
    const { rerender } = render(<HelpFeedback helpId="locatif.a.b" />);
    fireEvent.click(screen.getByRole('button', { name: 'Oui' }));
    await screen.findByText('Merci pour votre retour.');
    rerender(<HelpFeedback helpId="locatif.c.d" />);
    expect(await screen.findByRole('button', { name: 'Oui' })).toBeTruthy();
  });
});
