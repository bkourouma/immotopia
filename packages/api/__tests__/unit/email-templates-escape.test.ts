/**
 * Le nom saisi par l'utilisateur est interpolé dans les e-mails légitimes de
 * vérification / réinitialisation / création de compte : il est échappé.
 */
import {
  getEmailVerificationTemplate,
  getPasswordResetTemplate,
  getAccountCreationTemplate
} from '../../src/utils/email-templates';

const EVIL = '<a href="https://evil.test">Cliquez ici</a><script>alert(1)</script>';

describe('email-templates : champs utilisateur échappés', () => {
  it('vérification', () => {
    const html = getEmailVerificationTemplate('https://app.test/verify?a=1&b="2"', EVIL, 'fr');
    expect(html).not.toContain('<a href="https://evil.test">');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;a href=&quot;https://evil.test&quot;&gt;');
    expect(html).toContain('a=1&amp;b=&quot;2&quot;');
  });

  it('réinitialisation', () => {
    const html = getPasswordResetTemplate('https://app.test/reset?t=1', EVIL, 'fr');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<a href="https://evil.test">');
  });

  it('création de compte', () => {
    const html = getAccountCreationTemplate('https://app.test/r', EVIL, 'Agence', 'B-1', null, 'RENTER', 'fr');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<a href="https://evil.test">');
  });
});
