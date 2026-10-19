import React from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AppNavigation } from '../../components/shell/AppNavigation';
import { getNavigation } from '../../navigation/model';

/**
 * Popup du rail : AntD le rend dans <body>, hors de `.ant-layout-sider`, avec un
 * fond blanc. Sans la classe `app-nav-popup`, index.css ne peut pas l'atteindre
 * et la destination courante y reste en orange fonce, non grasse. jsdom ne
 * calcule pas le cssinjs : on verifie ici la classe et la presence des regles,
 * les couleurs finales se mesurent dans un vrai navigateur.
 */
describe('AppNavigation — popup du rail', () => {
  it('pose la classe app-nav-popup sur le popup d’un groupe', async () => {
    render(
      <MemoryRouter initialEntries={['/tenant/t1/crm/contacts']}>
        <AppNavigation persona={getNavigation().collaborateur} context={{ tenantId: 't1' }} variant="rail" />
      </MemoryRouter>
    );
    const title = document.querySelector('[data-menu-id$="-crm"]');
    expect(title).not.toBeNull();
    fireEvent.mouseEnter(title as Element);
    await waitFor(() => expect(document.body.querySelector('.ant-menu-submenu-popup.app-nav-popup')).not.toBeNull(), {
      timeout: 3000
    });
    // Le popup est bien hors de la sidebar.
    expect(document.querySelector('.ant-layout-sider .app-nav-popup')).toBeNull();
    expect(screen.queryByRole('menuitem', { name: 'Contacts' })).not.toBeNull();
  });

  it('index.css style le popup, l’entrée sélectionnée et le titre du groupe parent', () => {
    const css = readFileSync(resolve(__dirname, '../../index.css'), 'utf8');
    expect(css).toContain('.app-nav-popup');
    expect(css).toMatch(
      /\.ant-menu-submenu-selected > \.ant-menu-submenu-title\s*\{[^}]*font-weight: var\(--font-weight-semibold\)/
    );
  });
});
