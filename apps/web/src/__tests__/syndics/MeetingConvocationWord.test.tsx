import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from 'antd';
import { MeetingConvocationWord } from '../../components/syndics/MeetingConvocationWord';
import type { MeetingLot } from '../../types/syndic-types';

/**
 * `<MeetingConvocationWord>` : choix d'un lot puis téléchargement de la
 * convocation Word. Le mock se pose à la frontière du service ; le choix dans
 * le `Select` antd est piloté au clavier (jsdom n'ouvre pas le menu à la souris).
 */

const downloadMeetingConvocationWord = vi.fn();
vi.mock('../../services/syndic-service', () => ({
  downloadMeetingConvocationWord: (...args: unknown[]) => downloadMeetingConvocationWord(...args)
}));

const saveBlob = vi.fn();
vi.mock('../../utils/save-blob', () => ({
  saveBlob: (...args: unknown[]) => saveBlob(...args),
  filenameFromDisposition: vi.fn()
}));

const LOTS = [{ id: 'lot-1', lotNumber: 'A12', lotType: 'APARTMENT' }] as unknown as MeetingLot[];

const renderIt = (lots: MeetingLot[] = LOTS) =>
  render(
    <App>
      <MeetingConvocationWord tenantId="tenant-1" syndicId="syndic-1" meetingId="meeting-1" lots={lots} />
    </App>
  );

describe('<MeetingConvocationWord>', () => {
  beforeEach(() => vi.clearAllMocks());

  it('ne s’affiche pas sans lot', () => {
    renderIt([]);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('bouton désactivé tant qu’aucun lot n’est choisi', () => {
    renderIt();
    expect(screen.getByRole('button', { name: /Convocation \(Word\)/ })).toBeDisabled();
  });

  it('télécharge la convocation du lot choisi', async () => {
    downloadMeetingConvocationWord.mockResolvedValue({ blob: new Blob(['PK']), filename: 'convocation-ag-A12.docx' });
    const user = userEvent.setup();
    renderIt();

    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByText(/A12/, { selector: '.ant-select-item-option-content' }));
    await user.click(screen.getByRole('button', { name: /Convocation \(Word\)/ }));

    await waitFor(() =>
      expect(downloadMeetingConvocationWord).toHaveBeenCalledWith('tenant-1', 'syndic-1', 'meeting-1', 'lot-1')
    );
    await waitFor(() => expect(saveBlob).toHaveBeenCalledWith(expect.any(Blob), 'convocation-ag-A12.docx'));
  });
});
