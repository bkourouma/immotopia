import React, { useState } from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { NumField } from '../../components/patrimoine/projections/projection-fields';
import { invalidOperationFields } from '../../components/patrimoine/projections/projection-helpers';
import { EtapeRapport } from '../../pages/patrimoine/import/EtapeImportRapport';

const Champ: React.FC = () => {
  const [valeur, setValeur] = useState('');
  return <NumField id="m" label="Montant" value={valeur} onChange={setValeur} min={0} money />;
};

describe('saisie des projections', () => {
  it('formate un montant avec séparateur de milliers et devise en suffixe', async () => {
    render(<Champ />);
    await userEvent.type(screen.getByLabelText('Montant'), '1500000');
    expect((screen.getByLabelText('Montant') as HTMLInputElement).value.replace(/\s/g, ' ')).toBe('1 500 000');
    expect(screen.getByText('FCFA')).toBeInTheDocument();
  });

  it('nomme les champs obligatoires manquants au niveau du champ', () => {
    expect(invalidOperationFields('TAKE_LOAN', { amount: '1000' })).toEqual({
      annualRatePercent: 'Champ obligatoire',
      termYears: 'Champ obligatoire',
      year: 'Champ obligatoire'
    });
    expect(invalidOperationFields('SELL_ASSET', { assetId: 'a', year: '2', feesPercent: 'x' })).toEqual({
      feesPercent: 'Valeur invalide'
    });
  });
});

describe('rapport d’import', () => {
  const ligne = (numero: number, statut: string) => ({ numero, statut, motif: '', detail: '', textes: {} });
  const monter = (lignes: unknown[]) =>
    render(
      <MemoryRouter initialEntries={['/tenant/ag1/patrimoine/importer']}>
        <Routes>
          <Route
            path="/tenant/:tenantId/patrimoine/importer"
            element={
              <EtapeRapport
                lignes={lignes as never}
                compteRendu={null}
                nbARelancer={0}
                onTelecharger={() => undefined}
                onRelancer={() => undefined}
                onRevenir={() => undefined}
                onRecommencer={() => undefined}
              />
            }
          />
        </Routes>
      </MemoryRouter>
    );

  it('propose de voir les biens importés quand des lignes ont été importées', () => {
    monter([ligne(2, 'importee')]);
    expect(screen.getByRole('button', { name: 'Voir les biens importés' })).toBeInTheDocument();
  });

  it('ne propose pas ce raccourci quand rien n’a été importé', () => {
    monter([ligne(2, 'en_erreur')]);
    expect(screen.queryByRole('button', { name: 'Voir les biens importés' })).not.toBeInTheDocument();
  });
});
