import React from 'react';
import type { ColumnsType } from 'antd/es/table';
import { DataView, type DataViewProps } from '../../primitives';
import { useBreakpoint } from '../../../hooks/useBreakpoint';

/**
 * Briques de mise en page partagées par les formulaires et listes des écrans
 * « appels de charges », « budgets » et « programmation » (lot UX 21).
 *
 * - `FormSection` : un intertitre court (+ une phrase d'aide) qui découpe une
 *   longue modale en étapes lisibles (Général / Répartition / Échéance…).
 * - `useModalLayout` : largeur et corps défilant d'une modale. Sous 768 px elle
 *   passe en plein écran (plus aucune marge perdue, pas de défilement de page
 *   derrière) ; au-delà elle garde la largeur demandée.
 * - `ResponsiveList` : bascule tableau (≥ 992 px, rendu existant conservé tel
 *   quel) / cartes (en dessous) pour les listes qui n'étaient que des tableaux
 *   à défilement horizontal.
 */

export const FormSection: React.FC<{
  title: string;
  hint?: React.ReactNode;
  /** Première section d'un formulaire : pas de filet au-dessus. */
  first?: boolean;
  children: React.ReactNode;
}> = ({ title, hint, first = false, children }) => (
  <section
    aria-label={title}
    style={{
      paddingBlockStart: first ? 0 : 'var(--space-4, 16px)',
      marginBlockStart: first ? 0 : 'var(--space-4, 16px)',
      borderBlockStart: first ? 'none' : '1px solid var(--border-subtle, rgba(0,0,0,0.08))'
    }}
  >
    <div style={{ marginBlockEnd: 'var(--space-3, 12px)' }}>
      <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{title}</div>
      {hint ? (
        <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm, 13px)', marginBlockStart: 2 }}>
          {hint}
        </div>
      ) : null}
    </div>
    {children}
  </section>
);

/** Largeur et style d'une modale de formulaire : plein écran sous 768 px, corps défilant partout. */
export function useModalLayout(desktopWidth: number = 640): {
  width: string | number;
  centered: boolean;
  style?: React.CSSProperties;
  styles: { body: React.CSSProperties };
} {
  const { isMobile } = useBreakpoint();
  if (isMobile) {
    return {
      width: '100%',
      centered: false,
      style: { top: 0, maxWidth: '100vw', margin: 0, paddingBlockEnd: 0 },
      styles: { body: { maxHeight: 'calc(100dvh - 170px)', overflowY: 'auto', paddingInlineEnd: 4 } }
    };
  }
  return {
    width: desktopWidth,
    centered: true,
    styles: { body: { maxHeight: 'calc(100vh - 220px)', overflowY: 'auto', paddingInlineEnd: 4 } }
  };
}

type DataViewListProps<T> = Omit<DataViewProps<T>, 'columns' | 'layout'>;

/**
 * Tableau sur ordinateur (le nœud `table` fourni, inchangé), cartes en dessous de 992 px.
 * `cards` reçoit les props de `<DataView>` (items, pagination, recherche…) ; `columns` ne sert qu'au typage.
 */
export function ResponsiveList<T>({
  table,
  columns,
  cards
}: {
  table: React.ReactNode;
  columns: ColumnsType<T>;
  cards: DataViewListProps<T>;
}): React.ReactElement {
  const { isDesktop } = useBreakpoint();
  if (isDesktop) return <>{table}</>;
  return <DataView<T> {...cards} columns={columns} />;
}
