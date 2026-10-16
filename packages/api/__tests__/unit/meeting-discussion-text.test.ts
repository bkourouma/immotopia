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
