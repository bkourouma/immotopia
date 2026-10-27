import { describe, it, expect, vi, afterEach } from 'vitest';
import { copyToClipboard } from '../../utils/copy-to-clipboard';

/**
 * Copie d'une URL à jeton : le champ temporaire du repli ne doit jamais rester
 * dans le DOM, même quand le navigateur lève au lieu de répondre `false`.
 */

const URL_SECRETE = 'https://app.example.com/payer-charges#JETON-EN-CLAIR';

function setClipboard(value: unknown) {
  Object.defineProperty(navigator, 'clipboard', { value, configurable: true });
}

function setExecCommand(value: unknown) {
  Object.defineProperty(document, 'execCommand', { value, configurable: true, writable: true });
}

afterEach(() => {
  setClipboard(undefined);
  setExecCommand(undefined);
  document.body.innerHTML = '';
});

describe('copyToClipboard', () => {
  it("utilise l'API moderne quand elle existe, sans toucher au DOM", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });

    expect(await copyToClipboard(URL_SECRETE)).toBe(true);
    expect(writeText).toHaveBeenCalledWith(URL_SECRETE);
    expect(document.querySelectorAll('textarea')).toHaveLength(0);
  });

  it("se replie sur execCommand quand l'API moderne échoue, puis retire le champ", async () => {
    setClipboard({ writeText: vi.fn().mockRejectedValue(new Error('refusé')) });
    let contenuAuMomentDeLaCopie = '';
    setExecCommand(
      vi.fn(() => {
        contenuAuMomentDeLaCopie = document.querySelector('textarea')?.value ?? '';
        return true;
      })
    );

    expect(await copyToClipboard(URL_SECRETE)).toBe(true);
    expect(contenuAuMomentDeLaCopie).toBe(URL_SECRETE);
    expect(document.querySelectorAll('textarea')).toHaveLength(0);
  });

  it('retire le champ et répond false quand execCommand lève', async () => {
    setClipboard(undefined);
    setExecCommand(
      vi.fn(() => {
        throw new Error('non supporté');
      })
    );

    expect(await copyToClipboard(URL_SECRETE)).toBe(false);
    expect(document.querySelectorAll('textarea')).toHaveLength(0);
    expect(document.body.innerHTML).not.toContain('JETON-EN-CLAIR');
  });

  it('répond false quand execCommand refuse', async () => {
    setClipboard(undefined);
    setExecCommand(vi.fn(() => false));

    expect(await copyToClipboard(URL_SECRETE)).toBe(false);
    expect(document.querySelectorAll('textarea')).toHaveLength(0);
  });
});
