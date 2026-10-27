/**
 * Spec 043 (D7) : pendant un vote ouvert, la decision provisoire est masquee
 * cote gestionnaire (« Vote en cours ») ; les decomptes restent visibles.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { VoteBoard } from '../../components/syndics/VoteBoard';
import { MeetingAgenda } from '../../components/syndics/MeetingAgenda';
import type { MeetingResolution, ResolutionVoteStatus } from '../../types/syndic-types';

function resolution(voteStatus: ResolutionVoteStatus): MeetingResolution {
  return {
    id: 'res-1',
    meetingId: 'meeting-1',
    title: 'Ravalement',
    votesFor: 3,
    votesAgainst: 1,
    votesAbstain: 0,
    sharesFor: 300,
    result: 'APPROVED',
    voteStatus,
    createdAt: '',
    updatedAt: '',
    votes: []
  };
}

describe('VoteBoard — vote ouvert', () => {
  it('masque la decision provisoire et affiche « Vote en cours », decomptes conserves', () => {
    render(<VoteBoard quorum={50} resolutions={[resolution('OPEN')]} />);

    expect(screen.getByText('Vote en cours')).toBeTruthy();
    expect(screen.queryByText('Approuvée')).toBeNull();
    expect(screen.queryByText('Rejetée')).toBeNull();
    expect(screen.getByText('3')).toBeTruthy();
    expect(screen.getByText('1')).toBeTruthy();
  });

  it.each<ResolutionVoteStatus>(['PENDING', 'CLOSED'])('affiche la decision quand le vote est %s', status => {
    render(<VoteBoard quorum={50} resolutions={[resolution(status)]} />);

    expect(screen.getByText('Approuvée')).toBeTruthy();
    expect(screen.queryByText('Vote en cours')).toBeNull();
  });

  it('affiche la decision quand l AG est figee, meme si le vote est reste ouvert', () => {
    render(<VoteBoard quorum={50} resolutions={[resolution('OPEN')]} frozen />);

    expect(screen.getByText('Approuvée')).toBeTruthy();
    expect(screen.queryByText('Vote en cours')).toBeNull();
  });
});

describe('MeetingAgenda — vote ouvert', () => {
  it('affiche « Vote en cours » sans decision provisoire', () => {
    render(<MeetingAgenda resolutions={[resolution('OPEN')]} lots={[]} onVote={async () => undefined} />);

    expect(screen.getByText('Vote en cours')).toBeTruthy();
    expect(screen.queryByText('Approuvée')).toBeNull();
  });

  it('n affiche pas « Vote en cours » quand l AG est figee', () => {
    render(<MeetingAgenda resolutions={[resolution('OPEN')]} lots={[]} onVote={async () => undefined} readOnly />);

    expect(screen.queryByText('Vote en cours')).toBeNull();
  });
});
