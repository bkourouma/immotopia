import type React from 'react';
import { activeLocale } from '../../../i18n/format';

/** Séparateurs de groupe et de décimale de la langue active (espace insécable en français). */
function separators(): { group: string; decimal: string } {
  try {
    const parts = new Intl.NumberFormat(activeLocale()).formatToParts(12345.6);
    return {
      group: parts.find(part => part.type === 'group')?.value ?? ' ',
      decimal: parts.find(part => part.type === 'decimal')?.value ?? '.'
    };
  } catch {
    return { group: ' ', decimal: '.' };
  }
}

const GROUP_REGEX = /\B(?=(\d{3})+(?!\d))/g;

/**
 * Props d'un `InputNumber` de montant : séparateur de milliers de la langue
 * active à l'affichage, unité visible en suffixe. La valeur numérique du champ
 * reste exactement celle que l'utilisateur a saisie (le `parser` défait la mise
 * en forme), donc la charge utile envoyée au serveur ne change pas.
 */
export function moneyInputProps(unit?: string): {
  formatter: (value: string | number | undefined) => string;
  parser: (value: string | undefined) => string;
  suffix?: string;
} {
  return {
    formatter: value => {
      if (value === undefined || value === null || value === '') return '';
      const { group, decimal } = separators();
      const [integer, fraction] = String(value).split('.');
      const grouped = integer.replace(GROUP_REGEX, group);
      return fraction === undefined ? grouped : `${grouped}${decimal}${fraction}`;
    },
    parser: value => {
      if (!value) return '';
      const { group, decimal } = separators();
      // Retire espaces (insécables compris : le \s de JavaScript les couvre) et séparateur
      // de groupe, puis ramène la décimale locale au point attendu par le champ.
      let cleaned = value.replace(/[\s']/g, '');
      if (group.trim() !== '') cleaned = cleaned.split(group).join('');
      if (decimal !== '.') cleaned = cleaned.split(decimal).join('.');
      return cleaned.replace(/[^\d.-]/g, '');
    },
    ...(unit ? { suffix: unit } : {})
  };
}

/**
 * Entrée valide un formulaire depuis un champ simple (pas un champ de recherche
 * d'une liste déroulante, pas une zone de texte).
 */
export function submitOnEnter(submit: () => void, busy = false) {
  return (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Enter' || event.defaultPrevented || busy) return;
    const target = event.target as HTMLElement;
    if (target.tagName !== 'INPUT' || target.getAttribute('role') === 'combobox') return;
    event.preventDefault();
    submit();
  };
}
