/**
 * Masque des jetons dans les journaux (audit 2026-11-09, AUTH-04 / SUR-06) :
 * le paramètre `token` est masqué sur TOUS les chemins, le webhook WhatsApp et
 * les chemins de signature gardent leur masque.
 */
import { maskSensitivePath, maskSensitiveQuery } from '../../src/utils/sensitive-path';
import { maskRequestUrl } from '../../src/middleware/logging-middleware';

describe('maskSensitiveQuery', () => {
  it('masque ?token=abc', () => {
    expect(maskSensitiveQuery('/api/auth/verify-email?token=abc')).toBe('/api/auth/verify-email?token=[masqué]');
  });

  it('masque un token en milieu de query et garde les autres paramètres', () => {
    expect(maskSensitiveQuery('/api/newsletter/confirm?a=1&token=SECRET&b=2')).toBe(
      '/api/newsletter/confirm?a=1&token=[masqué]&b=2'
    );
  });

  it('masque un nom de paramètre encodé (%74oken)', () => {
    expect(maskSensitiveQuery('/x?%74oken=SECRET&y=1')).toBe('/x?%74oken=[masqué]&y=1');
  });

  it('masque chaque occurrence quand il y a plusieurs paramètres token', () => {
    expect(maskSensitiveQuery('/x?token=a&token=b')).toBe('/x?token=[masqué]&token=[masqué]');
  });

  it('laisse une URL sans query inchangée', () => {
    expect(maskSensitiveQuery('/api/auth/me')).toBe('/api/auth/me');
  });

  it('ne masque pas un paramètre voisin (tokens, mytoken)', () => {
    expect(maskSensitiveQuery('/x?tokens=1&mytoken=2')).toBe('/x?tokens=1&mytoken=2');
  });

  it('ne touche pas au fragment', () => {
    expect(maskSensitiveQuery('/x?token=a#token=b')).toBe('/x?token=[masqué]#token=b');
  });

  it('ne casse pas sur un nom mal encodé', () => {
    expect(maskSensitiveQuery('/x?%E0%A4%A=1&token=a')).toBe('/x?%E0%A4%A=1&token=[masqué]');
  });
});

describe('maskRequestUrl (journal des requêtes)', () => {
  it("masque le jeton de vérification d'e-mail", () => {
    expect(maskRequestUrl('/api/auth/verify-email?token=abc')).not.toContain('abc');
  });

  it('masque le jeton de la newsletter publique', () => {
    expect(maskRequestUrl('/api/newsletter/unsubscribe?token=abc&all=1')).toBe(
      '/api/newsletter/unsubscribe?token=[masqué]&all=1'
    );
  });

  it('garde le masque du webhook WhatsApp', () => {
    expect(
      maskRequestUrl('/api/webhooks/whatsapp-cloud/events?hub.mode=subscribe&hub.verify_token=S&hub.challenge=C')
    ).toBe('/api/webhooks/whatsapp-cloud/events?hub.mode=subscribe&hub.verify_token=[masqué]&hub.challenge=[masqué]');
  });

  it('garde le masque du jeton de signature dans le chemin', () => {
    expect(maskRequestUrl('/api/public/signatures/SECRET/documents')).toBe('/api/public/signatures/[masqué]/documents');
    expect(maskSensitivePath('/api/public/signatures/SECRET?token=T')).toBe(
      '/api/public/signatures/[masqué]?token=[masqué]'
    );
  });

  it('laisse une URL ordinaire inchangée', () => {
    expect(maskRequestUrl('/api/tenants/t1/properties?page=2')).toBe('/api/tenants/t1/properties?page=2');
  });
});
