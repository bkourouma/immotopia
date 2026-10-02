import { describe, expect, it } from 'vitest';
import { commenceParUneFormule, estUneFormuleRefusee, neutraliserFormule } from '../../../lib/importation/formules';

describe('commenceParUneFormule', () => {
  it.each(['=SUM(A1)', '+1+1', '-2+3', '@SUM(A1)', '\tx', '\rx', '  =A1', '＝A1', '＋1', '－1', '＠A'])(
    'détecte %j',
    texte => {
      expect(commenceParUneFormule(texte)).toBe(true);
    }
  );

  it.each(['-350000', '+225', '-12,5', '3.5', '-', ' - ', 'Villa Cocody', '', 'a=b'])('laisse passer %j', texte => {
    expect(commenceParUneFormule(texte)).toBe(false);
  });
});

describe('neutraliserFormule', () => {
  it('préfixe une apostrophe devant une formule', () => {
    expect(neutraliserFormule('=HYPERLINK("x")')).toBe(`'=HYPERLINK("x")`);
    expect(neutraliserFormule('\tcmd')).toBe("'\tcmd");
  });

  it('ne touche ni le texte normal ni les nombres', () => {
    expect(neutraliserFormule('Villa')).toBe('Villa');
    expect(neutraliserFormule('-350000')).toBe('-350000');
    expect(neutraliserFormule(-5)).toBe(-5);
  });

  it('rend une chaîne vide pour null et undefined', () => {
    expect(neutraliserFormule(null)).toBe('');
    expect(neutraliserFormule(undefined)).toBe('');
  });
});

describe('estUneFormuleRefusee', () => {
  it('refuse = et @ (même précédés d’espaces) et tabulation / retour chariot', () => {
    for (const texte of ['=1', '  @x', '＝1', '＠x', '\tx', '\rx']) {
      expect(estUneFormuleRefusee(texte)).toBe(true);
    }
  });

  it('accepte le tiret et le plus en tête', () => {
    for (const texte of ['-', '+', '- Villa', '+225 07 00', 'Villa', '']) {
      expect(estUneFormuleRefusee(texte)).toBe(false);
    }
  });
});
