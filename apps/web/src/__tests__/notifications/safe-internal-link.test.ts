import { describe, expect, it } from 'vitest';
import { safeInternalLink } from '../../components/notifications/notification-labels';

describe('safeInternalLink', () => {
  it('accepte un chemin interne', () => {
    expect(safeInternalLink('/messages/abc')).toBe('/messages/abc');
  });

  it('refuse les liens dangereux ou externes', () => {
    expect(safeInternalLink('javascript:alert(1)')).toBeNull();
    expect(safeInternalLink('//evil.example/x')).toBeNull();
    expect(safeInternalLink('/\\evil.example')).toBeNull();
    expect(safeInternalLink('https://evil.example/x')).toBeNull();
    expect(safeInternalLink('/ok\n/x')).toBeNull();
    expect(safeInternalLink('/ok\t')).toBeNull();
    expect(safeInternalLink('/a b')).toBeNull();
    expect(safeInternalLink('/\u0000x')).toBeNull();
    expect(safeInternalLink(null)).toBeNull();
    expect(safeInternalLink('')).toBeNull();
  });

  it("ramène un lien absolu de l'application à son chemin", () => {
    expect(safeInternalLink(`${window.location.origin}/notifications?x=1`)).toBe('/notifications?x=1');
  });
});
