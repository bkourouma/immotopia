import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
// eslint-disable-next-line no-restricted-imports -- test du composant gelé lui-même
import { LocationSelector } from '../../components/ui/location-selector';

vi.mock('../../services/geographic-service', () => ({
  getAllCommunes: vi.fn(),
  getLocationByCommuneId: vi.fn()
}));

import { getAllCommunes } from '../../services/geographic-service';

const make = (commune: string, id: string) => ({
  id,
  country: 'Côte d’Ivoire',
  countryId: 'ci',
  region: 'Abidjan',
  regionId: 'abj',
  commune,
  communeId: id,
  displayName: commune,
  searchText: commune
});

const COMMUNES = [make('Cocody', 'c1'), make('Yopougon', 'c2'), make('Abobo', 'c3'), make('Adjamé', 'c4')];

async function setup() {
  vi.mocked(getAllCommunes).mockResolvedValue(COMMUNES);
  const onChange = vi.fn();
  render(<LocationSelector onChange={onChange} />);
  await waitFor(() => expect(getAllCommunes).toHaveBeenCalled());
  const input = screen.getByRole('combobox');
  return { onChange, input };
}

describe('LocationSelector - saisie libre', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sélectionne la commune tapée exactement (sans accents ni casse) au blur', async () => {
    const { onChange, input } = await setup();
    fireEvent.change(input, { target: { value: 'ADJAME' } });
    fireEvent.blur(input);
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(COMMUNES[3]));
  });

  it('sélectionne la commune quand le fragment ne laisse qu un résultat', async () => {
    const { onChange, input } = await setup();
    fireEvent.change(input, { target: { value: 'yopou' } });
    fireEvent.blur(input);
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(COMMUNES[1]));
  });

  it('affiche une aide et ne sélectionne rien pour un texte ambigu ou inconnu', async () => {
    const { onChange, input } = await setup();
    fireEvent.change(input, { target: { value: 'o' } }); // Cocody, Yopougon, Abobo : ambigu
    fireEvent.blur(input);
    expect(await screen.findByText('Choisissez une commune dans la liste')).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: '' } });
    await waitFor(() => expect(screen.queryByText('Choisissez une commune dans la liste')).toBeNull());
  });

  it('garde le clic sur une option inchangé', async () => {
    const { onChange, input } = await setup();
    fireEvent.mouseDown(input);
    const option = await screen.findByText('Cocody', { selector: '.ant-select-item-option-content' });
    fireEvent.click(option);
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(COMMUNES[0]));
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
