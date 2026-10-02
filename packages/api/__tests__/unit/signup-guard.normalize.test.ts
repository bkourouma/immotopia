/**
 * Regroupement des adresses avant hachage du limiteur d'inscription : IPv6 par
 * /64, IPv4 mappee ramenee a son IPv4, IPv4 inchangee.
 */
import { hashSignupIp, normalizeSignupIp } from '../../src/services/signup-guard-service';

describe('normalizeSignupIp', () => {
  it('laisse une IPv4 telle quelle', () => {
    expect(normalizeSignupIp('203.0.113.7')).toBe('203.0.113.7');
  });

  it('ramene une IPv4 mappee en IPv6 a son IPv4', () => {
    expect(normalizeSignupIp('::ffff:203.0.113.7')).toBe('203.0.113.7');
    expect(normalizeSignupIp('::ffff:cb00:7107')).toBe('203.0.113.7');
  });

  it('reduit une IPv6 a son prefixe /64, forme compressee ou developpee', () => {
    const expected = '2001:db8:aaaa:bbbb::/64';
    expect(normalizeSignupIp('2001:db8:aaaa:bbbb::1')).toBe(expected);
    expect(normalizeSignupIp('2001:DB8:AAAA:BBBB:1:2:3:4')).toBe(expected);
    expect(normalizeSignupIp('2001:0db8:aaaa:bbbb:ffff:ffff:ffff:ffff')).toBe(expected);
    expect(normalizeSignupIp('2001:db8:aaaa:bbbb::')).toBe(expected);
    expect(normalizeSignupIp('fe80::1%eth0')).toBe('fe80:0:0:0::/64');
  });

  it('deux /64 differents restent distincts', () => {
    expect(normalizeSignupIp('2001:db8:aaaa:bbbb::1')).not.toBe(normalizeSignupIp('2001:db8:aaaa:bbbc::1'));
  });

  it('adresse absente : cle commune ; adresse illisible : inchangee', () => {
    expect(normalizeSignupIp(undefined)).toBe('inconnue');
    expect(normalizeSignupIp('pas-une-ip')).toBe('pas-une-ip');
  });

  it('le hachage suit le regroupement et reste hexadecimal de 64 caracteres', () => {
    expect(hashSignupIp('2001:db8::1')).toBe(hashSignupIp('2001:db8:0:0:9:9:9:9'));
    expect(hashSignupIp('2001:db8::1')).toMatch(/^[0-9a-f]{64}$/);
    expect(hashSignupIp('::ffff:203.0.113.7')).toBe(hashSignupIp('203.0.113.7'));
  });
});
