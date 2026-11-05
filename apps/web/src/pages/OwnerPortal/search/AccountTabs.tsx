import type { ReactNode } from 'react';
import { Tabs } from 'antd';
import { useSearchParams } from 'react-router-dom';
import { t } from '../../../i18n/t';

const ONGLETS_COMPTE = ['versements', 'mouvements'];

/** Onglets de « Mon compte », pilotés par `?tab=versements|mouvements`. */
export function AccountTabs({ payouts, movements }: { payouts: ReactNode; movements: ReactNode }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const ongletParam = searchParams.get('tab');
  const ongletActif = ongletParam && ONGLETS_COMPTE.includes(ongletParam) ? ongletParam : 'versements';
  const changerOnglet = (cle: string) =>
    setSearchParams(
      precedent => {
        const suivant = new URLSearchParams(precedent);
        suivant.set('tab', cle);
        return suivant;
      },
      { replace: true }
    );

  return (
    <Tabs
      activeKey={ongletActif}
      onChange={changerOnglet}
      destroyOnHidden
      items={[
        { key: 'versements', label: t('Reversements reçus'), children: payouts },
        { key: 'mouvements', label: t('Détail des mouvements'), children: movements }
      ]}
    />
  );
}
