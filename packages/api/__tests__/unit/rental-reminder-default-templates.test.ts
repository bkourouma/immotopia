import { EMAIL_NOTIFICATION_DEFAULT_TEMPLATES } from '../../src/constants/email-notification-default-templates';
import { WHATSAPP_NOTIFICATION_DEFAULT_TEMPLATES } from '../../src/constants/whatsapp-notification-default-templates';

const KEYS = ['INSTALLMENT_DUE_REMINDER', 'INSTALLMENT_OVERDUE'] as const;

describe('gabarits de relance de loyer', () => {
  it.each(KEYS)('WhatsApp %s : paymentBlock seul, sans lien en double', key => {
    const body = (WHATSAPP_NOTIFICATION_DEFAULT_TEMPLATES as Record<string, string>)[key];
    expect(body).toContain('{{paymentBlock}}');
    expect(body).not.toContain('{{paymentUrl}}');
    expect(body).not.toContain('Payer en ligne');
  });

  it.each(KEYS)('e-mail %s : aucun lien vide quand il n y a pas de lien de paiement', key => {
    const html = EMAIL_NOTIFICATION_DEFAULT_TEMPLATES[key].bodyHtml;
    expect(html).toContain('{{paymentBlock}}');
    expect(html).not.toContain('href="{{paymentUrl}}"');
  });
});
