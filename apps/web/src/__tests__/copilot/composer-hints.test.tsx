import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CopilotComposer } from '../../components/copilot/CopilotComposer';

function Harness({ onSubmit, streaming = false }: { onSubmit: (v: string) => void; streaming?: boolean }) {
  const [value, setValue] = React.useState('');
  return (
    <CopilotComposer value={value} onChange={setValue} onSubmit={onSubmit} onStop={vi.fn()} streaming={streaming} />
  );
}

describe('CopilotComposer : aides à la saisie', () => {
  it("décrit le champ avec l'indication Entrée / Maj+Entrée", () => {
    render(<Harness onSubmit={vi.fn()} />);
    const field = screen.getByRole('textbox', { name: 'Votre message' });
    const hint = screen.getByText('Entrée pour envoyer, Maj+Entrée pour un saut de ligne');
    expect(field.getAttribute('aria-describedby')).toBe(hint.id);
  });

  it('rend le focus à la saisie après un clic sur « Envoyer »', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);
    const field = screen.getByRole('textbox', { name: 'Votre message' });
    await user.type(field, 'Bonjour');
    await user.click(screen.getByRole('button', { name: 'Envoyer' }));
    expect(onSubmit).toHaveBeenCalledWith('Bonjour');
    await vi.waitFor(() => expect(document.activeElement).toBe(field));
  });
});
