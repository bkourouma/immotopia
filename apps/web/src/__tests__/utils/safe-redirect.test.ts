import { describe, it, expect } from 'vitest';
import { getSafeRedirectPath } from '../../utils/safe-redirect';

/**
 * FRI-03 : `/\evil.com` passait l'ancien contrôle `startsWith('/') && !startsWith('//')`
 * alors que les navigateurs lisent « \ » comme « / » (donc `//evil.com`).
 */

const ORIGIN = 'http://localhost:3000';
const FALLBACK = '/dashboard';
const safe = (target: string | null | undefined) => getSafeRedirectPath(target, FALLBACK, ORIGIN);

describe('getSafeRedirectPath', () => {
  it.each([
    ['barre oblique inverse', '/\\evil.com'],
    ['double barre oblique', '//evil.com'],
    ['barre inverse encodée', '/%5Cevil.com'],
    ['barre inverse encodée en minuscules', '/%5cevil.com'],
    ['URL absolue', 'https://evil.com'],
    ['URL absolue vers sa propre origine', `${ORIGIN}/dashboard`],
    ['protocole javascript', 'javascript:alert(1)'],
    ['URL sans protocole', 'evil.com/path'],
    ['chemin relatif', 'dashboard'],
    ['barre inverse après le premier segment', '/ok\\..\\evil.com'],
    ['tabulation entre les barres', '/\t/evil.com'],
    ['retour à la ligne entre les barres', '/\n/evil.com'],
    ['retour chariot', '/\r/evil.com'],
    ['caractère nul', '/\u0000/evil.com'],
    ['tabulation en tête', '\t//evil.com'],
    ['barre oblique inverse après tabulation (texte brut)', '/\\t/evil.com'],
    ['chemin vide', ''],
    ['null', null],
    ['undefined', undefined]
  ])('refuse : %s', (_label, target) => {
    expect(safe(target)).toBe(FALLBACK);
  });

  it('garde un chemin interne avec requête et ancre', () => {
    expect(safe('/ok?x=1#h')).toBe('/ok?x=1#h');
    expect(safe('/')).toBe('/');
    expect(safe('/auth/accept-invite?token=abc%2Fdef')).toBe('/auth/accept-invite?token=abc%2Fdef');
  });

  it('renvoie le repli demandé, y compris null', () => {
    expect(getSafeRedirectPath('//evil.com', '/login', ORIGIN)).toBe('/login');
    expect(getSafeRedirectPath('//evil.com', null, ORIGIN)).toBeNull();
  });

  it('utilise l’origine de la page par défaut', () => {
    expect(getSafeRedirectPath('/ok', FALLBACK)).toBe('/ok');
    expect(getSafeRedirectPath('/\\evil.com', FALLBACK)).toBe(FALLBACK);
  });
});
