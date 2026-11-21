/**
 * Résumé d'envoi d'une convocation (`describeConvocation`) : un renvoi où tous
 * les copropriétaires ont déjà été servis ne doit pas annoncer « aucun
 * copropriétaire à convoquer ».
 */
import { describeConvocation } from '../../components/syndics/meeting-governance';
import type { MeetingConvocationResult } from '../../types/syndic-types';

const base: MeetingConvocationResult = {
  owners: 0,
  emailEnabled: true,
  emailSent: 0,
  emailFailed: 0,
  emailSkippedNoAddress: 0,
  whatsappSent: 0,
  failures: []
};

describe('describeConvocation', () => {
  it('renvoi sans personne à relancer : dit que tous ont déjà été convoqués', () => {
    const summary = describeConvocation({ ...base, alreadyServed: 12 });
    expect(summary.type).toBe('info');
    expect(summary.failed).toBe(false);
    expect(summary.text).toMatch(/déjà été convoqués/);
    expect(summary.text).not.toMatch(/Aucun copropriétaire à convoquer/);
  });

  it('copropriété sans destinataire : garde le message « aucun copropriétaire »', () => {
    expect(describeConvocation({ ...base, skipped: 'NO_OWNER_CONTACT' }).text).toMatch(/Aucun copropriétaire/);
    expect(describeConvocation(base).text).toMatch(/Aucun copropriétaire/);
  });

  it('envoi normal : compte les e-mails et propose le renvoi en cas d échec', () => {
    const summary = describeConvocation({ ...base, owners: 3, emailSent: 2, emailFailed: 1 });
    expect(summary.type).toBe('warning');
    expect(summary.failed).toBe(true);
  });
});
