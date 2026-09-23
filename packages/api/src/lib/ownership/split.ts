import { roundMoney, roundMoneyXof } from '../finance/money';

/**
 * Répartition d'un montant entre les indivisaires d'un bien — lot 4.
 *
 * Chaque part est arrondie au franc, et le reste d'arrondi va au dernier
 * indivisaire dans l'ordre de leurs identifiants : la somme des parts vaut
 * TOUJOURS le montant d'origine, au centime près, et le même montant se
 * répartit toujours de la même façon, quel que soit le compte qui la calcule.
 */

export interface Share {
  ownerClientId: string;
  sharePercent: number;
}

export function splitAmount(total: number, shares: Share[]): Map<string, number> {
  const ordered = [...shares].sort((a, b) => a.ownerClientId.localeCompare(b.ownerClientId));
  const result = new Map<string, number>();
  let allotted = 0;
  ordered.forEach((share, index) => {
    const part =
      index === ordered.length - 1 ? roundMoney(total - allotted) : roundMoneyXof((total * share.sharePercent) / 100);
    allotted = roundMoney(allotted + part);
    result.set(share.ownerClientId, part);
  });
  return result;
}

/** Libellé d'une part : « 50 % », « 33,3333 % ». */
export function shareLabel(sharePercent: number): string {
  return `${String(Number(sharePercent.toFixed(4))).replace('.', ',')} %`;
}

/**
 * Suffixe d'une pièce répartie : `<pièce>:<propriétaire>:<part>`. La part
 * entre dans l'identifiant, pour qu'un changement de quotes-parts contre-passe
 * l'ancienne inscription et réinscrive la nouvelle, au lieu de la croire déjà
 * faite.
 */
export function sharedSourceId(baseId: string, ownerClientId: string, sharePercent: number): string {
  return `${baseId}:${ownerClientId}:${sharePercent.toFixed(4)}`;
}

/** Identifiant de la pièce d'origine, que la source soit répartie ou non. */
export function baseSourceId(sourceId: string): string {
  return sourceId.split(':')[0];
}
