import React, { useState } from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AppNavigation } from '../../components/shell/AppNavigation';
import { getNavigation } from '../../navigation/model';

/**
 * BUG-2026-10-19-008 : `<LocalizedScreens>` (App.tsx) remonte l'écran à chaque
 * changement de langue ; l'état d'ouverture du menu repartait vide et le groupe
 * de la page courante se refermait. `Harness` reproduit ce remontage par `key`.
 */
function Harness({ variant = 'sidebar' }: { variant?: 'sidebar' | 'rail' }) {
  const [lang, setLang] = useState('fr');
  const navigate = useNavigate();
  return (
    <>
      <button onClick={() => setLang(l => (l === 'fr' ? 'ar' : 'fr'))}>langue</button>
      <button onClick={() => navigate('/tenant/t1/crm/contacts')}>vers-contacts</button>
      <button onClick={() => navigate('/tenant/t1/properties')}>vers-baux</button>
      <React.Fragment key={lang}>
        <AppNavigation persona={getNavigation().collaborateur} context={{ tenantId: 't1' }} variant={variant} />
      </React.Fragment>
    </>
  );
}

const openGroups = () => Array.from(document.querySelectorAll('.ant-menu-submenu-open'));
const crmTitle = () => document.querySelector('[data-menu-id$="-crm"]') as HTMLElement;

function renderAt(path: string, variant: 'sidebar' | 'rail' = 'sidebar') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Harness variant={variant} />
    </MemoryRouter>
  );
}

describe('AppNavigation — groupe ouvert', () => {
  it('ouvre le groupe de la page courante et le garde après un changement de langue', () => {
    const { getByText } = renderAt('/tenant/t1/crm/calendar');
    expect(openGroups()).toHaveLength(1);
    expect(document.querySelector('.ant-menu-submenu-open [data-menu-id$="-crm"]')).not.toBeNull();
    fireEvent.click(getByText('langue'));
    fireEvent.click(getByText('langue'));
    expect(openGroups()).toHaveLength(1);
    expect(document.querySelector('.ant-menu-submenu-open [data-menu-id$="-crm"]')).not.toBeNull();
  });

  it('respecte la fermeture manuelle tant que la page ne change pas', () => {
    renderAt('/tenant/t1/crm/calendar');
    fireEvent.click(crmTitle());
    expect(openGroups()).toHaveLength(0);
  });

  it('un seul groupe ouvert : naviguer vers un autre groupe referme le precedent', async () => {
    const { getByText } = renderAt('/tenant/t1/crm/calendar');
    fireEvent.click(getByText('vers-baux'));
    await waitFor(() => {
      expect(openGroups()).toHaveLength(1);
      expect(document.querySelector('.ant-menu-submenu-open [data-menu-id$="-crm"]')).toBeNull();
    });
  });

  it('le rail n’ouvre aucun groupe', () => {
    renderAt('/tenant/t1/crm/calendar', 'rail');
    expect(openGroups()).toHaveLength(0);
  });
});
