/**
 * Pose une ancre de visite guidee : `<Button {...helpAnchor('nouveau-bail')}>`
 * rend `data-help-anchor="nouveau-bail"`, que `tour.steps[].target` d'une fiche
 * designe par la meme valeur. Une etape dont l'ancre est absente est ignoree.
 */
export function helpAnchor(name: string): { 'data-help-anchor': string } {
  return { 'data-help-anchor': name };
}
