import React, { useContext, useEffect } from 'react';

import { activeLocale } from '../../i18n/format';
/**
 * `<MoneyValue>` — rendu unique des montants (REFONTE_UI_UX.md §3.6).
 *
 * Trois regles, aujourd'hui appliquees au cas par cas dans une cinquantaine
 * de fichiers :
 *   - separateur de milliers par espace insecable etroit, jamais de virgule ;
 *   - `font-variant-numeric: tabular-nums`, pour que les montants d'une colonne
 *     s'alignent chiffre par chiffre ;
 *   - une valeur absente s'ecrit `—`, jamais `0` : le §4.2 releve deja ce soin
 *     sur le tableau de bord, il devient la regle.
 *
 * Non cable dans les ecrans a ce stade.
 */

/** Devise par defaut : le produit est deploye en zone franc CFA. */
const DEFAULT_CURRENCY = 'FCFA';

/** La devise telle qu'elle s'ecrit, pour la mention de pied de tableau. */
export function deviseParDefaut(): string {
  return DEFAULT_CURRENCY;
}

/**
 * Le contexte des tableaux : « ici, la devise ne se repete pas sur chaque
 * ligne ».
 *
 * Une colonne de montants qui repete « FCFA » a chaque ligne dit vingt fois la
 * meme chose et noie le chiffre, seul element qui varie. `<DataView>` pose donc
 * ce contexte autour de son tableau et affiche la devise **une fois**, en pied.
 * Hors tableau — une tuile d'indicateur, une phrase — le montant garde sa
 * devise : il y est seul, et rien alentour ne la porte.
 *
 * Une devise passee explicitement par l'appelant l'emporte toujours : le
 * contexte ne decide que du defaut.
 */
export interface ContexteMontantsValeur {
  sansDevise: boolean;
  signaler: () => void;
}

export const ContexteMontants = React.createContext<ContexteMontantsValeur | null>(null);

export interface MoneyValueProps {
  value: number | string | null | undefined;
  /** Devise affichee apres le montant. `null` pour n'afficher que le nombre. */
  currency?: string | null;
  /** Nombre de decimales. 0 par defaut : le FCFA n'a pas de subdivision. */
  fractionDigits?: number;
  /** Rendu des valeurs absentes. */
  placeholder?: string;
  /** Colore le montant selon son signe (rouge si negatif). */
  signed?: boolean;
  className?: string;
}

/**
 * Le franc CFA s'écrit « FCFA » partout (hypothèse H31) : l'API renvoie le code
 * ISO « XOF » ou « CFA » selon l'enregistrement, et aucun des deux ne doit
 * s'afficher tel quel. Les autres devises passent inchangées.
 */
export function devisePourAffichage(currency: string | null | undefined): string | null | undefined {
  if (!currency) return currency;
  const code = currency.replace(/\s/g, '').toUpperCase();
  return code === 'XOF' || code === 'CFA' || code === 'FCFA' ? DEFAULT_CURRENCY : currency;
}

/**
 * `Intl.NumberFormat` est coûteux à construire (`toLocaleString` en recrée un
 * à chaque appel) : un tableau de mille lignes en refaisait des milliers. Un
 * formateur par (langue, décimales), conservé pour la durée du module. Le
 * texte produit est celui de `toLocaleString(locale, { min/maxFractionDigits })`.
 */
const formateurs = new Map<string, Intl.NumberFormat>();

function nombreFormat(locale: string, fractionDigits: number): Intl.NumberFormat {
  const cle = `${locale}|${fractionDigits}`;
  let formateur = formateurs.get(cle);
  if (!formateur) {
    formateur = new Intl.NumberFormat(locale, {
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits
    });
    formateurs.set(cle, formateur);
  }
  return formateur;
}

export function formatMoney(
  value: number | string | null | undefined,
  { currency: deviseBrute = DEFAULT_CURRENCY, fractionDigits = 0, placeholder = '—' }: Partial<MoneyValueProps> = {}
): string {
  const currency = devisePourAffichage(deviseBrute);
  if (value === null || value === undefined || value === '') return placeholder;

  const numeric = typeof value === 'number' ? value : Number(String(value).replace(/\s/g, ''));
  if (!Number.isFinite(numeric)) return placeholder;

  // fr-FR pose une espace insecable etroite (U+202F) comme separateur.
  const formatted = nombreFormat(activeLocale(), fractionDigits).format(numeric);

  return currency ? `${formatted} ${currency}` : formatted;
}

export const MoneyValue: React.FC<MoneyValueProps> = ({
  value,
  currency,
  fractionDigits = 0,
  placeholder = '—',
  signed = false,
  className
}) => {
  const contexte = useContext(ContexteMontants);

  // `undefined` signifie « l'appelant n'a rien dit » : le contexte tranche.
  // `null` signifie « pas de devise », et vient d'une decision explicite.
  const deviseEffective = currency !== undefined ? currency : contexte?.sansDevise ? null : DEFAULT_CURRENCY;

  // Prevenir le tableau qu'il porte un montant dont il a lui-meme retire la
  // devise : c'est ce qui lui fait afficher sa mention de pied.
  //
  // On ne le previent PAS quand l'appelant a impose une devise — une echeance
  // de loyer porte la sienne, ligne par ligne, et peut differer d'une ligne a
  // l'autre. Sans cette reserve, un tableau affichant « 135 000 XOF » se
  // serait vu coiffer d'un « Tous les montants sont en FCFA » qui le
  // contredisait.
  const deviseRetiree = currency === undefined && contexte?.sansDevise === true;
  useEffect(() => {
    if (deviseRetiree) contexte?.signaler();
  }, [contexte, deviseRetiree]);

  const text = formatMoney(value, { currency: deviseEffective, fractionDigits, placeholder });
  const numeric = typeof value === 'number' ? value : Number(String(value ?? '').replace(/\s/g, ''));
  const isNegative = signed && Number.isFinite(numeric) && numeric < 0;

  return (
    <span
      className={className}
      style={{
        fontVariantNumeric: 'tabular-nums',
        fontSize: 'var(--font-size-numeric)',
        lineHeight: 'var(--line-height-numeric)',
        fontWeight: 'var(--font-weight-numeric)' as unknown as number,
        color: isNegative ? 'var(--color-error-text)' : undefined,
        whiteSpace: 'nowrap'
      }}
    >
      {text}
    </span>
  );
};
