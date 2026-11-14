import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HelpContext, INERT_HELP } from '../../help/help-context';
import { HelpCenterPage } from '../../pages/help/HelpCenterPage';

/** Registre réel : le contenu rédigé du module locatif est listé et trouvable. */
describe('HelpCenterPage (contenu réel)', () => {
  it("liste et trouve l'entrée locatif.baux.liste", async () => {
    const openHelp = vi.fn();
    render(
      <MemoryRouter>
        <HelpContext.Provider value={{ ...INERT_HELP, available: true, openHelp }}>
          <HelpCenterPage />
        </HelpContext.Provider>
      </MemoryRouter>
    );
    expect((await screen.findAllByText('Liste des baux', {}, { timeout: 5000 })).length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText("Rechercher dans l'aide"), { target: { value: 'liste des baux' } });
    // Attend la liste de résultats (anti-rebond), sinon le clic vise la carte de la liste par module, remplacée entre-temps.
    await screen.findByText(/^Résultats : /, {}, { timeout: 5000 });
    const card = await screen.findByRole('button', { name: /^Liste des baux/ }, { timeout: 5000 });
    fireEvent.click(card);
    expect(openHelp).toHaveBeenCalledWith('locatif.baux.liste');
  });
});
