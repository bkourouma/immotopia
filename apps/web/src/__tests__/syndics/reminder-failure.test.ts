import { reminderExclusionLabel, reminderFailureLabel } from '../../components/syndics/reminder-failure';

describe('reminderFailureLabel', () => {
  it('traduit chaque code connu', () => {
    expect(reminderFailureLabel('SMTP_REJECTED')).toContain('refusé');
    expect(reminderFailureLabel('TIMEOUT')).toContain('Délai dépassé');
    expect(reminderFailureLabel('NO_EMAIL')).toContain('adresse e-mail');
    expect(reminderFailureLabel('ALREADY_PAID')).toContain('soldé');
    expect(reminderFailureLabel('REMINDER_NOT_FOUND')).toBe('Relance introuvable');
  });

  it('retombe sur le message brut puis sur le code pour une cause inconnue', () => {
    expect(reminderFailureLabel('WEIRD', 'boom')).toBe('boom');
    expect(reminderFailureLabel('WEIRD')).toBe('WEIRD');
    expect(reminderFailureLabel(null)).toBe('');
  });
});

describe('reminderExclusionLabel', () => {
  it('traduit les motifs connus', () => {
    expect(reminderExclusionLabel('PAYMENT_PLAN_ACTIVE')).toBe('Plan de paiement actif');
    expect(reminderExclusionLabel('REMINDER_TOO_RECENT')).toBe('Relance trop récente');
    expect(reminderExclusionLabel('DECLARED_PAYMENT_PENDING')).toBe('Paiement déclaré en cours de vérification');
  });

  it('retombe sur le libellé fourni ou le motif brut', () => {
    expect(reminderExclusionLabel('X', 'Libellé API')).toBe('Libellé API');
    expect(reminderExclusionLabel('X')).toBe('X');
  });
});
