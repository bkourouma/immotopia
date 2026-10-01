import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ClaimStatusTimeline } from '../../components/insurance/ClaimStatusTimeline';

describe('ClaimStatusTimeline', () => {
  it('montre le parcours nominal avec une étape en cours', () => {
    render(<ClaimStatusTimeline status="EXPERTISE" />);
    for (const libelle of ['Déclaré', 'Assureur prévenu', 'Expertise', 'Indemnisé', 'Clos']) {
      expect(screen.getByText(libelle)).toBeInTheDocument();
    }
    expect(screen.queryByText('Rejeté')).not.toBeInTheDocument();
    expect(document.querySelector('.ant-steps-item-process')).toHaveTextContent('Expertise');
    expect(document.querySelectorAll('.ant-steps-item-finish')).toHaveLength(2);
  });

  it('remplace « Indemnisé » par « Rejeté » en erreur quand le sinistre est rejeté', () => {
    render(<ClaimStatusTimeline status="REJECTED" />);
    expect(screen.getByText('Rejeté')).toBeInTheDocument();
    expect(screen.queryByText('Indemnisé')).not.toBeInTheDocument();
    expect(document.querySelector('.ant-steps-item-error')).toHaveTextContent('Rejeté');
  });

  it('un sinistre rejeté puis clos garde l’étape « Rejeté » et jamais « Indemnisé » terminé', () => {
    render(<ClaimStatusTimeline status="CLOSED" rejectedAt="2026-04-02T08:00:00.000Z" />);
    expect(screen.getByText('Rejeté')).toBeInTheDocument();
    expect(screen.queryByText('Indemnisé')).not.toBeInTheDocument();
    expect(document.querySelector('.ant-steps-item-error')).toHaveTextContent('Rejeté');
    expect(document.querySelectorAll('.ant-steps-item-finish')).toHaveLength(4);
  });

  it('montre toutes les étapes terminées pour un sinistre indemnisé puis clos', () => {
    render(<ClaimStatusTimeline status="CLOSED" rejectedAt={null} />);
    expect(screen.getByText('Indemnisé')).toBeInTheDocument();
    expect(document.querySelectorAll('.ant-steps-item-finish')).toHaveLength(5);
    expect(document.querySelector('.ant-steps-item-process')).toBeNull();
  });
});
