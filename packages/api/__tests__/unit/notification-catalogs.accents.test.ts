/**
 * BUG-2026-09-29-011 : libellés et gabarits des catalogues de notifications
 * accentués, et un libellé distinct par événement.
 */
import { EMAIL_NOTIFICATION_KEYS, EMAIL_NOTIFICATION_META } from '../../src/constants/email-notification-keys';
import { EMAIL_NOTIFICATION_DEFAULT_TEMPLATES } from '../../src/constants/email-notification-default-templates';
import { WHATSAPP_NOTIFICATION_META } from '../../src/constants/whatsapp-notification-keys';
import { WHATSAPP_NOTIFICATION_DEFAULT_TEMPLATES } from '../../src/constants/whatsapp-notification-default-templates';

const UNACCENTED =
  /\b(releve|gerance|envoye|proprietaires?|proprietes?|Proprietaire|Propriete|planifies?|pret|echeances?|prevu|bientot|depot|etape|assemblee|copropriete)\b/;

describe('catalogues de notifications', () => {
  it('une seule entrée par clé, avec un libellé distinct', () => {
    const labels = EMAIL_NOTIFICATION_KEYS.map(k => EMAIL_NOTIFICATION_META[k].label);
    expect(new Set(labels).size).toBe(labels.length);
    expect(new Set(EMAIL_NOTIFICATION_KEYS).size).toBe(EMAIL_NOTIFICATION_KEYS.length);
  });

  it('libellés e-mail Patrimoine accentués', () => {
    expect(EMAIL_NOTIFICATION_META.OWNER_STATEMENT_SENT.label).toBe('Relevé de gérance envoyé');
    expect(EMAIL_NOTIFICATION_META.LOAN_MATURITY_ALERT.label).toBe('Alerte fin de prêt');
  });

  it('aucun texte sans accent dans les catalogues e-mail et WhatsApp', () => {
    const texts: string[] = [];
    for (const m of Object.values<any>(EMAIL_NOTIFICATION_META)) texts.push(m.label, m.description, m.recipientLabel);
    for (const m of Object.values<any>(WHATSAPP_NOTIFICATION_META))
      texts.push(m.label, m.description, m.recipientLabel);
    for (const t of Object.values<any>(EMAIL_NOTIFICATION_DEFAULT_TEMPLATES)) texts.push(t.subject);
    texts.push(...Object.values<string>(WHATSAPP_NOTIFICATION_DEFAULT_TEMPLATES));
    expect(texts.filter(t => UNACCENTED.test(t))).toEqual([]);
  });
});
