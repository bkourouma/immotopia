/**
 * Normalisation du texte de la discussion de la visio (spec 046, M3) : fonction pure et schéma zod.
 */
import {
  DISCUSSION_MAX_LENGTH,
  discussionBodySchema,
  normalizeDiscussionText
} from '../../src/lib/syndics/meeting-live-schemas';

describe('normalizeDiscussionText (M3)', () => {
  it('retire les espaces de début et de fin', () => {
    expect(normalizeDiscussionText('   Bonjour à tous \n ')).toBe('Bonjour à tous');
  });

  it('unifie les retours chariot en saut de ligne', () => {
    expect(normalizeDiscussionText('a\r\nb\rc\nd')).toBe('a\nb\nc\nd');
    expect(normalizeDiscussionText('a b c')).toBe('a\nb\nc');
  });

  it('retire les caractères de contrôle, sauf le saut de ligne', () => {
    expect(normalizeDiscussionText('a\u0000b\u0007c\u001Bd\u007Fe\u0085f\tg')).toBe('abcdefg');
    expect(normalizeDiscussionText('un\ndeux')).toBe('un\ndeux');
  });

  it('au plus deux sauts de ligne consécutifs', () => {
    expect(normalizeDiscussionText('a\n\n\n\n\nb')).toBe('a\n\nb');
    expect(normalizeDiscussionText('a\r\n\r\n\r\nb')).toBe('a\n\nb');
  });

  it('ne touche ni au HTML ni aux adresses web : texte brut, jamais interprété', () => {
    const text = '<script>alert(1)</script> **gras** https://exemple.test/x?a=1&b=2';
    expect(normalizeDiscussionText(text)).toBe(text);
  });

  it('conserve les caractères accentués et l’arabe', () => {
    expect(normalizeDiscussionText(' Réunion مرحبا ')).toBe('Réunion مرحبا');
  });

  it('vide après normalisation reste vide', () => {
    expect(normalizeDiscussionText(' \n\t\u0000 ')).toBe('');
  });
});

describe('discussionBodySchema', () => {
  it('normalise puis accepte 1 à 500 caractères', () => {
    expect(discussionBodySchema.parse('  Bonjour\r\n')).toBe('Bonjour');
    expect(discussionBodySchema.parse('x'.repeat(DISCUSSION_MAX_LENGTH))).toHaveLength(DISCUSSION_MAX_LENGTH);
  });

  it('refuse le vide (après normalisation) et plus de 500 caractères', () => {
    expect(discussionBodySchema.safeParse('').success).toBe(false);
    expect(discussionBodySchema.safeParse(' \n\u0000 ').success).toBe(false);
    expect(discussionBodySchema.safeParse('x'.repeat(DISCUSSION_MAX_LENGTH + 1)).success).toBe(false);
  });

  it('compte les caractères APRÈS normalisation (les espaces de bord ne comptent pas)', () => {
    expect(discussionBodySchema.safeParse(` ${'x'.repeat(DISCUSSION_MAX_LENGTH)} `).success).toBe(true);
  });

  it('refuse un type qui n’est pas du texte', () => {
    expect(discussionBodySchema.safeParse(42).success).toBe(false);
    expect(discussionBodySchema.safeParse(null).success).toBe(false);
  });
});

/** Caractères construits par point de code : le source ne contient aucun invisible. */
const ch = (...codes: number[]) => String.fromCodePoint(...codes);

describe('normalizeDiscussionText : invisibles, bidirectionnel, bien formé (spec 046)', () => {
  it('retire les contrôles bidirectionnels U+202A-202E et U+2066-2069', () => {
    const bidi = [0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067, 0x2068, 0x2069];
    for (const code of bidi) expect(normalizeDiscussionText(`a${ch(code)}b`)).toBe('ab');
  });

  it('retire les invisibles U+200B, U+2060, U+FEFF, U+00AD', () => {
    for (const code of [0x200b, 0x2060, 0xfeff, 0x00ad]) {
      expect(normalizeDiscussionText(`a${ch(code)}b`)).toBe('ab');
    }
  });

  it('retire les caractères « tag » U+E0000-E007F', () => {
    expect(normalizeDiscussionText(`a${ch(0xe0001, 0xe0020, 0xe007f)}b`)).toBe('ab');
  });

  it('garde ZWNJ et ZWJ (persan, ourdou, emojis composés)', () => {
    const persian = `می${ch(0x200c)}خواهم`;
    expect(normalizeDiscussionText(persian)).toBe(persian);
    const family = `${ch(0x1f469)}${ch(0x200d)}${ch(0x1f467)}`;
    expect(normalizeDiscussionText(`Bravo ${family}`)).toBe(`Bravo ${family}`);
  });

  it('garde LRM, RLM et ALM dans un texte arabe', () => {
    const arabic = `مرحبا${ch(0x200f)} بكم (2026)${ch(0x200e)}${ch(0x061c)}`;
    expect(normalizeDiscussionText(arabic)).toBe(arabic);
  });

  it('remplace les surrogates isolés par U+FFFD (chaîne bien formée)', () => {
    expect(normalizeDiscussionText(`a${ch(0xd800)}b`)).toBe(`a${ch(0xfffd)}b`);
    expect(normalizeDiscussionText(`a${ch(0xdc00)}b`)).toBe(`a${ch(0xfffd)}b`);
    expect(normalizeDiscussionText(`a${ch(0x1f600)}b`)).toBe(`a${ch(0x1f600)}b`);
  });

  it('réduit les lignes faites d’espaces avant la règle des deux sauts de ligne', () => {
    expect(normalizeDiscussionText('a\n \n \n \nb')).toBe('a\n\nb');
    expect(normalizeDiscussionText('a\n  \n\n   \nb')).toBe('a\n\nb');
    expect(normalizeDiscussionText('a   \nb')).toBe('a\nb');
  });

  it('un texte sans caractère visible devient vide', () => {
    expect(normalizeDiscussionText(`  ${ch(0x200b)} ${ch(0x202e)}`)).toBe('');
    expect(normalizeDiscussionText(`${ch(0x200d)}${ch(0x200e)}${ch(0x061c)}`)).toBe('');
    expect(normalizeDiscussionText(ch(0xe0041, 0xe0042))).toBe('');
  });
});

describe('discussionBodySchema : texte sans caractère visible', () => {
  it('refuse comme le texte vide (même détail zod)', () => {
    const empty = discussionBodySchema.safeParse('');
    expect(empty.success).toBe(false);
    for (const text of ['   \n ', ch(0x200b, 0x202e), ch(0x200d, 0x200e), ch(0xe0041)]) {
      const res = discussionBodySchema.safeParse(text);
      expect(res.success).toBe(false);
      if (!res.success && !empty.success) expect(res.error.issues).toEqual(empty.error.issues);
    }
  });
});
