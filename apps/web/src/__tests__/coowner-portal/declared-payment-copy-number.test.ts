import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { copyText, nationalNumber } from '../../components/coowner-portal/declared-payment/copy-number';

/**
 * Copie d'un numéro de réception mobile money (spec 047) : numéro national à
 * 10 chiffres, message de succès, repli sans exception si le presse-papiers
 * échoue ou n'existe pas.
 */

const success = vi.fn();
const error = vi.fn();

vi.mock('../../lib/feedback', async () => {
  const actual = await vi.importActual<typeof import('../../lib/feedback')>('../../lib/feedback');
  return {
    ...actual,
    feedback: {
      ...actual.feedback,
      success: (m: string) => success(m),
      error: (m: string) => error(m)
    }
  };
});

let writeText: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
});

afterEach(() => {
  Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
});

describe('nationalNumber', () => {
  it('retire l’indicatif +225 d’un numéro ivoirien à 10 chiffres', () => {
    expect(nationalNumber('+2250707070707')).toBe('0707070707');
  });

  it('laisse tout autre motif tel quel', () => {
    expect(nationalNumber('+22177123456')).toBe('+22177123456');
    expect(nationalNumber('0707070707')).toBe('0707070707');
  });
});

describe('copyText', () => {
  it('copie le texte et confirme', async () => {
    await copyText('0707070707', 'Numéro copié');
    expect(writeText).toHaveBeenCalledWith('0707070707');
    expect(success).toHaveBeenCalledWith('Numéro copié');
    expect(error).not.toHaveBeenCalled();
  });

  it('ne lève pas si le presse-papiers échoue et affiche le repli', async () => {
    writeText.mockRejectedValue(new Error('denied'));
    await copyText('0707070707', 'Numéro copié');
    expect(error).toHaveBeenCalledWith('Copie impossible, recopiez le numéro à la main.');
    expect(success).not.toHaveBeenCalled();
  });

  it('ne lève pas si le presse-papiers est indisponible', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    await copyText('0707070707', 'Numéro copié');
    expect(error).toHaveBeenCalled();
  });
});
