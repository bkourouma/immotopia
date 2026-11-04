import '../../i18n';
import i18next from 'i18next';
import { afterEach, describe, expect, it } from 'vitest';
import { formatterMontant, parserMontant } from '../../utils/montant-saisi';

const frappe = (input: string) => ({ userTyping: true, input });

afterEach(async () => {
  await i18next.changeLanguage('fr');
});

/** Ce qu'un champ fait réellement : parser le texte affiché, puis reformater. */
function allerRetour(texte: string): { valeur: number; affiche: string } {
  const valeur = Number(parserMontant(texte));
  return { valeur, affiche: formatterMontant(valeur) };
}

describe('parserMontant — français', () => {
  it.each([
    ['1000,5', '1000.5'],
    ['1000.5', '1000.5'],
    ['2500,75', '2500.75'],
    ['50 000 000', '50000000'],
    ['50 000 000', '50000000'],
    ['50 000 000', '50000000'],
    ['1 000,5', '1000.5'],
    ['1 000,5', '1000.5'],
    ['-5', '-5'],
    ['-1 250,25', '-1250.25']
  ])('« %s » devient %s', (saisie, attendu) => {
    expect(parserMontant(saisie)).toBe(attendu);
  });

  it('garde les états transitoires', () => {
    expect(parserMontant('')).toBe('');
    expect(parserMontant(undefined)).toBe('');
    expect(parserMontant('-')).toBe('-');
    expect(parserMontant('1000,')).toBe('1000.');
    expect(parserMontant(',5')).toBe('0.5');
  });

  it('ne garde que deux décimales et une seule virgule', () => {
    expect(parserMontant('1000,555')).toBe('1000.55');
    expect(parserMontant('1,2,3')).toBe('1.23');
  });

  it('ignore les lettres', () => {
    expect(parserMontant('12abc3')).toBe('123');
  });
});

describe('formatterMontant — français', () => {
  it('regroupe les entiers et garde les décimales', () => {
    expect(formatterMontant(50000000)).toBe((50000000).toLocaleString('fr-FR'));
    expect(formatterMontant(1000.5)).toBe(`${(1000).toLocaleString('fr-FR')},5`);
    expect(formatterMontant('2500.75')).toBe(`${(2500).toLocaleString('fr-FR')},75`);
  });

  it('ne perd rien pendant la frappe', () => {
    expect(formatterMontant(1000, frappe('1000,'))).toBe(`${(1000).toLocaleString('fr-FR')},`);
    expect(formatterMontant(1000.5, frappe('1000,50'))).toBe(`${(1000).toLocaleString('fr-FR')},50`);
    expect(formatterMontant(0, frappe('0,0'))).toBe('0,0');
  });

  it('rend le vide et le signe seul tels quels', () => {
    expect(formatterMontant(undefined)).toBe('');
    expect(formatterMontant('')).toBe('');
    expect(formatterMontant('-')).toBe('-');
    expect(formatterMontant(0)).toBe('0');
  });

  it('formate un négatif', () => {
    expect(formatterMontant(-1250.25)).toBe(`-${(1250).toLocaleString('fr-FR')},25`);
  });

  it('aller-retour : la valeur ne change jamais', () => {
    expect(allerRetour('1000,5').valeur).toBe(1000.5);
    expect(allerRetour('2500,75').valeur).toBe(2500.75);
    expect(allerRetour('50 000 000').valeur).toBe(50000000);
    expect(allerRetour('1 000,5').valeur).toBe(1000.5);
    // Le texte affiché se relit à l'identique.
    for (const valeur of [1000.5, 2500.75, 50000000, 0.5, -1250.25, 1234567.8]) {
      expect(Number(parserMontant(formatterMontant(valeur)))).toBe(valeur);
    }
  });
});

describe('anglais', () => {
  it('la virgule groupe, le point sépare les décimales', async () => {
    await i18next.changeLanguage('en');
    expect(parserMontant('1,000.5')).toBe('1000.5');
    expect(parserMontant('50,000,000')).toBe('50000000');
    expect(parserMontant('2500.75')).toBe('2500.75');
    expect(formatterMontant(1000.5)).toBe('1,000.5');
    expect(formatterMontant(50000000)).toBe('50,000,000');
    expect(formatterMontant(1000, frappe('1000.'))).toBe('1,000.');
    expect(Number(parserMontant(formatterMontant(2500.75)))).toBe(2500.75);
  });
});

describe('arabe', () => {
  it('lit les chiffres arabo-indiens et la décimale arabe', async () => {
    await i18next.changeLanguage('ar');
    expect(parserMontant('١٠٠٠٫٥')).toBe('1000.5');
    expect(parserMontant('٢٬٥٠٠٫٧٥')).toBe('2500.75');
    expect(parserMontant('٥٠٬٠٠٠٬٠٠٠')).toBe('50000000');
  });

  it('aller-retour avec ce que produit Intl', async () => {
    await i18next.changeLanguage('ar');
    for (const valeur of [1000.5, 2500.75, 50000000, -3.25]) {
      expect(Number(parserMontant(formatterMontant(valeur)))).toBe(valeur);
    }
  });
});
