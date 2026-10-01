/**
 * BUG-2026-09-29-011 : libellés et gabarits des catalogues de notifications
 * accentués, et un libellé distinct par événement.
 */
import { EMAIL_NOTIFICATION_KEYS, EMAIL_NOTIFICATION_META } from '../../src/constants/email-notification-keys';
import { EMAIL_NOTIFICATION_DEFAULT_TEMPLATES } from '../../src/constants/email-notification-default-templates';
import { featureOfNotificationKey } from '../../src/constants/notification-key-features';
import { WHATSAPP_NOTIFICATION_KEYS, WHATSAPP_NOTIFICATION_META } from '../../src/constants/whatsapp-notification-keys';
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

  describe('canaux patrimoine du propriétaire (lot A3)', () => {
    const NEW_WHATSAPP_KEYS = [
      'OWNER_LEASE_ENDING_SOON',
      'OWNER_DOCUMENT_EXPIRY_ALERT',
      'OWNER_MONTHLY_REPORT_SENT'
    ] as const;

    it('chaque nouvelle clé WhatsApp est listée une fois, a une méta, un gabarit et relève de PATRIMOINE', () => {
      for (const key of NEW_WHATSAPP_KEYS) {
        expect(WHATSAPP_NOTIFICATION_KEYS.filter(k => k === key)).toHaveLength(1);
        expect(WHATSAPP_NOTIFICATION_META[key].key).toBe(key);
        expect(WHATSAPP_NOTIFICATION_DEFAULT_TEMPLATES[key]).toBeTruthy();
        expect(featureOfNotificationKey(key)).toBe('PATRIMOINE');
      }
    });

    it('un libellé distinct par clé WhatsApp', () => {
      const labels = WHATSAPP_NOTIFICATION_KEYS.map(k => WHATSAPP_NOTIFICATION_META[k].label);
      expect(new Set(labels).size).toBe(labels.length);
      expect(new Set(WHATSAPP_NOTIFICATION_KEYS).size).toBe(WHATSAPP_NOTIFICATION_KEYS.length);
    });

    it('rapport mensuel : clé présente dans les deux catalogues, lien {{reportUrl}} dans les gabarits', () => {
      expect(EMAIL_NOTIFICATION_KEYS).toContain('OWNER_MONTHLY_REPORT_SENT');
      expect(featureOfNotificationKey('OWNER_MONTHLY_REPORT_SENT')).toBe('PATRIMOINE');
      expect(EMAIL_NOTIFICATION_DEFAULT_TEMPLATES.OWNER_MONTHLY_REPORT_SENT.bodyHtml).toContain('{{reportUrl}}');
      expect(WHATSAPP_NOTIFICATION_DEFAULT_TEMPLATES.OWNER_MONTHLY_REPORT_SENT).toContain('{{reportUrl}}');
    });

    it('accès tiers de confiance (lot B3) : clé e-mail déclarée, gabarit complet, jamais d’URL dans le sujet', () => {
      const key = 'EXTERNAL_ACCESS_LINK_SENT' as const;
      expect(EMAIL_NOTIFICATION_KEYS.filter(k => k === key)).toHaveLength(1);
      expect(EMAIL_NOTIFICATION_META[key].key).toBe(key);
      expect(featureOfNotificationKey(key)).toBe('PATRIMOINE');
      const template = EMAIL_NOTIFICATION_DEFAULT_TEMPLATES[key];
      for (const variable of ['recipientName', 'agencyName', 'accessType', 'accessUrl', 'expiresAt']) {
        expect(template.bodyHtml).toContain(`{{${variable}}}`);
      }
      expect(template.subject).not.toContain('{{accessUrl}}');
      expect(template.bodyHtml).toContain('href="{{accessUrl}}"');
      expect(
        [
          EMAIL_NOTIFICATION_META[key].label,
          EMAIL_NOTIFICATION_META[key].description,
          EMAIL_NOTIFICATION_META[key].recipientLabel,
          template.subject
        ].filter(text => UNACCENTED.test(text))
      ).toEqual([]);
    });

    it('les alertes propriétaire gardent leurs clés e-mail historiques (aucun changement pour les agences)', () => {
      expect(EMAIL_NOTIFICATION_KEYS).toEqual(expect.arrayContaining(['LEASE_ENDING_SOON', 'DOCUMENT_EXPIRY_ALERT']));
      expect(EMAIL_NOTIFICATION_KEYS).not.toContain('OWNER_LEASE_ENDING_SOON');
      expect(EMAIL_NOTIFICATION_KEYS).not.toContain('OWNER_DOCUMENT_EXPIRY_ALERT');
    });
  });
});
