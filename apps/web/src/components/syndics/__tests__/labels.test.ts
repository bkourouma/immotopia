import { describe, it, expect, beforeAll } from 'vitest';
import i18next from 'i18next';
import { paymentMethodLabel, reminderChannelLabel, paymentScheduleStatusLabel } from '../labels';

// Initialize i18next for testing
beforeAll(async () => {
  if (!i18next.isInitialized) {
    await i18next.init({
      lng: 'fr',
      fallbackLng: 'fr',
      ns: ['translation'],
      defaultNS: 'translation',
      resources: {
        fr: {
          translation: {}
        }
      }
    });
  }
});

describe('paymentMethodLabel', () => {
  it('should return empty string for null or undefined', () => {
    expect(paymentMethodLabel(null)).toBe('');
    expect(paymentMethodLabel(undefined)).toBe('');
  });

  it('should return localized label for CASH', () => {
    expect(paymentMethodLabel('CASH')).toContain('Espèces');
  });

  it('should return localized label for BANK_TRANSFER', () => {
    expect(paymentMethodLabel('BANK_TRANSFER')).toContain('Virement');
  });

  it('should return localized label for CHECK', () => {
    expect(paymentMethodLabel('CHECK')).toContain('Chèque');
  });

  it('should return localized label for MOBILE_MONEY', () => {
    expect(paymentMethodLabel('MOBILE_MONEY')).toContain('Mobile');
  });

  it('should return localized label for CARD', () => {
    expect(paymentMethodLabel('CARD')).toContain('Carte');
  });

  it('should return localized label for ONLINE', () => {
    expect(paymentMethodLabel('ONLINE')).toContain('Paiement');
  });

  it('should return original value for unknown method', () => {
    expect(paymentMethodLabel('UNKNOWN_METHOD')).toBe('UNKNOWN_METHOD');
  });
});

describe('reminderChannelLabel', () => {
  it('should return empty string for null or undefined', () => {
    expect(reminderChannelLabel(null)).toBe('');
    expect(reminderChannelLabel(undefined)).toBe('');
  });

  it('should return localized label for EMAIL', () => {
    expect(reminderChannelLabel('EMAIL')).toContain('mail');
  });

  it('should return localized label for SMS', () => {
    expect(reminderChannelLabel('SMS')).toBe('SMS');
  });

  it('should return localized label for WHATSAPP', () => {
    expect(reminderChannelLabel('WHATSAPP')).toContain('WhatsApp');
  });

  it('should return localized label for CALL', () => {
    expect(reminderChannelLabel('CALL')).toContain('Appel');
  });

  it('should return localized label for LETTER', () => {
    expect(reminderChannelLabel('LETTER')).toContain('Courrier');
  });

  it('should return original value for unknown channel', () => {
    expect(reminderChannelLabel('UNKNOWN_CHANNEL')).toBe('UNKNOWN_CHANNEL');
  });
});

describe('paymentScheduleStatusLabel', () => {
  it('should return empty string for null or undefined', () => {
    expect(paymentScheduleStatusLabel(null)).toBe('');
    expect(paymentScheduleStatusLabel(undefined)).toBe('');
  });

  it('should return localized label for ACTIVE', () => {
    expect(paymentScheduleStatusLabel('ACTIVE')).toContain('Actif');
  });

  it('should return localized label for COMPLETED', () => {
    expect(paymentScheduleStatusLabel('COMPLETED')).toContain('Terminé');
  });

  it('should return localized label for CANCELLED', () => {
    expect(paymentScheduleStatusLabel('CANCELLED')).toContain('Annulé');
  });

  it('should return localized label for DEFAULTED', () => {
    expect(paymentScheduleStatusLabel('DEFAULTED')).toContain('défaut');
  });

  it('should return original value for unknown status', () => {
    expect(paymentScheduleStatusLabel('UNKNOWN_STATUS')).toBe('UNKNOWN_STATUS');
  });
});
