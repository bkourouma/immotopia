/**
 * Liens web saisis par l'utilisateur : seuls http(s) passent (audit de
 * securite du lot S7 — un `file:` ou `javascript:` stocke servait de vecteur).
 */

import { httpUrl, isHttpUrl } from '../../src/lib/safe-url';
import { updateDocumentSchema as patrimoineDocumentUpdate } from '../../src/lib/patrimoine/schemas';
import { createContactSchema } from '../../src/types/crm-types';

describe('httpUrl', () => {
  it.each(['https://exemple.ci/logo.png', 'http://cdn.exemple.com/a/b.pdf?x=1'])('accepte %s', value => {
    expect(isHttpUrl(value)).toBe(true);
    expect(httpUrl().safeParse(value).success).toBe(true);
  });

  it.each([
    'javascript:alert(1)',
    'JAVASCRIPT:alert(1)',
    'file:///etc/passwd',
    'file:/srv/uploads/maintenance/t1/x.pdf',
    'data:text/html,<script>alert(1)</script>',
    'ftp://exemple.ci/a',
    '/uploads/properties/agency-logos/t1/logo.png',
    'pas une url',
    ''
  ])('refuse %s', value => {
    expect(httpUrl().safeParse(value).success).toBe(false);
  });

  it('garde le message personnalise du schema appelant', () => {
    const result = httpUrl('Le lien du document doit etre une URL valide').safeParse('file:///x');
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0].message).toBe('Le lien du document doit etre une URL valide');
  });

  it('s’applique aux schemas durcis (CRM, patrimoine)', () => {
    expect(createContactSchema.shape.profilePhotoUrl.safeParse('javascript:alert(1)').success).toBe(false);
    expect(createContactSchema.shape.profilePhotoUrl.safeParse('https://exemple.ci/p.jpg').success).toBe(true);
    expect(patrimoineDocumentUpdate.safeParse({ fileUrl: 'file:///etc/passwd' }).success).toBe(false);
  });
});
