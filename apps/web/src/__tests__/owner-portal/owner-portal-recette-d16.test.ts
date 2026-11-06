import { describe, expect, it } from 'vitest';
import { portalPersonName } from '../../pages/OwnerPortal/owner-portal-people';
import { formatPercent } from '../../pages/OwnerPortal/owner-patrimoine-labels';

describe('portalPersonName (BUG-2026-11-04-007)', () => {
  it('lit fullName d’un utilisateur', () => {
    expect(portalPersonName({ fullName: 'Fatoumata Diabaté', email: 'f@x.ci' })).toBe('Fatoumata Diabaté');
  });
  it('compose prénom et nom d’un contact', () => {
    expect(portalPersonName({ firstName: 'Awa', lastName: 'Traoré' })).toBe('Awa Traoré');
  });
  it('retombe sur l’e-mail puis null, jamais « undefined »', () => {
    expect(portalPersonName({ email: 'a@x.ci' })).toBe('a@x.ci');
    expect(portalPersonName(null)).toBeNull();
    expect(portalPersonName({})).toBeNull();
  });
});

describe('formatPercent (BUG-2026-11-04-010)', () => {
  it('affiche « Non renseigné » sans donnée, un pourcentage sinon', () => {
    expect(formatPercent(null)).toBe('Non renseigné');
    expect(formatPercent(undefined)).toBe('Non renseigné');
    expect(formatPercent(0)).toContain('0,00');
    expect(formatPercent(7.5)).toContain('7,50');
  });
});
