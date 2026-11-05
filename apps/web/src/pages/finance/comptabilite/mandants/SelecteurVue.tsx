import React from 'react';
import { Segmented } from 'antd';
import { t } from '../../../../i18n/t';
import type { MajUrl, VueMandants } from './useMandantUrl';

/** Choix de la vue, porté par l'URL (`vue`). Changer de vue repart de la première page. */
export const SelecteurVue: React.FC<{ vue: VueMandants; maj: MajUrl }> = ({ vue, maj }) => (
  <Segmented<VueMandants>
    value={vue}
    aria-label={t('Choisir la vue des mandants')}
    options={[
      { value: 'grand-livre', label: t('Grand livre auxiliaire des mandants') },
      { value: 'balance', label: t('Balance auxiliaire des mandants') }
    ]}
    onChange={valeur =>
      maj({
        vue: valeur === 'balance' ? 'balance' : undefined,
        page: undefined,
        owner: undefined,
        nature: undefined,
        'page-lignes': undefined
      })
    }
  />
);
