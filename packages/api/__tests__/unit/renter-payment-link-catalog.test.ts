/** Catalogues de notifications : clé `RENTER_PAYMENT_LINK_SENT` (lot C5, spec 039). */
import { EMAIL_NOTIFICATION_KEYS, EMAIL_NOTIFICATION_META } from '../../src/constants/email-notification-keys';
import { EMAIL_NOTIFICATION_DEFAULT_TEMPLATES } from '../../src/constants/email-notification-default-templates';
import { featureOfNotificationKey } from '../../src/constants/notification-key-features';
import { WHATSAPP_NOTIFICATION_KEYS, WHATSAPP_NOTIFICATION_META } from '../../src/constants/whatsapp-notification-keys';
import { WHATSAPP_NOTIFICATION_DEFAULT_TEMPLATES } from '../../src/constants/whatsapp-notification-default-templates';
import { defaultWhatsappEnabled } from '../../src/services/whatsapp-notification-config-service';

const KEY = 'RENTER_PAYMENT_LINK_SENT' as const;

describe('RENTER_PAYMENT_LINK_SENT', () => {
  it('présente une fois dans les catalogues e-mail et WhatsApp, destinataire Locataire', () => {
    expect(EMAIL_NOTIFICATION_KEYS.filter(k => k === KEY)).toHaveLength(1);
    expect(WHATSAPP_NOTIFICATION_KEYS.filter(k => k === KEY)).toHaveLength(1);
    expect(EMAIL_NOTIFICATION_META[KEY]).toMatchObject({ key: KEY, recipientLabel: 'Locataire' });
    expect(WHATSAPP_NOTIFICATION_META[KEY]).toMatchObject({ key: KEY, recipientLabel: 'Locataire' });
  });

  it('rattachée à la fonctionnalité RENTAL', () => {
    expect(featureOfNotificationKey(KEY)).toBe('RENTAL');
  });

  it('WhatsApp en opt-in (désactivée par défaut)', () => {
    expect(defaultWhatsappEnabled(KEY)).toBe(false);
  });

  it('gabarits : {{paymentUrl}} dans le corps, jamais dans le sujet e-mail', () => {
    const email = EMAIL_NOTIFICATION_DEFAULT_TEMPLATES[KEY];
    expect(email.bodyHtml).toContain('{{paymentUrl}}');
    expect(email.subject).not.toMatch(/url/i);
    expect(WHATSAPP_NOTIFICATION_DEFAULT_TEMPLATES[KEY]).toContain('{{paymentUrl}}');
  });
});
