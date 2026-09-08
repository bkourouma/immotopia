import React from 'react';
import { Card, Skeleton as AntSkeleton, Space } from 'antd';

/**
 * Squelettes par famille d'ecran (REFONTE_UI_UX.md §5.6).
 *
 * Le depot compte aujourd'hui cinq conventions de chargement : `Spin` plein
 * ecran, `Card loading`, `Table loading`, un spinner Tailwind ecrit deux fois,
 * et `Spin tip` — ce dernier deprecie en AntD 6 au profit de `description`.
 * La cible est une seule convention : un squelette dimensionne comme le
 * contenu qu'il remplace, pour que le decalage cumulatif reste proche de zero.
 *
 * Non cables dans les ecrans a ce stade : le remplacement des spinners
 * existants appartient aux lots suivants.
 */

const BLOCK = { borderRadius: 'var(--radius-lg)' } as const;

export interface SkeletonProps {
  /** Nombre d'elements simules. */
  rows?: number;
  'aria-label'?: string;
}

function Region({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="status" aria-live="polite" aria-label={label} aria-busy="true">
      {children}
    </div>
  );
}

/** Liste de cartes — hauteur d'element calee sur les 72 px du §5.6. */
export const SkeletonList: React.FC<SkeletonProps> = ({ rows = 5, ...rest }) => (
  <Region label={rest['aria-label'] ?? 'Chargement de la liste'}>
    <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
      {Array.from({ length: rows }, (_, i) => (
        <Card key={i} styles={{ body: { padding: 'var(--space-4)' } }} style={BLOCK}>
          <AntSkeleton active avatar paragraph={{ rows: 1 }} title={{ width: '40%' }} />
        </Card>
      ))}
    </Space>
  </Region>
);

/** Tableau — en-tete plus n lignes, largeur pleine. */
export const SkeletonTable: React.FC<SkeletonProps & { columns?: number }> = ({ rows = 8, columns = 5, ...rest }) => (
  <Region label={rest['aria-label'] ?? 'Chargement du tableau'}>
    <Card styles={{ body: { padding: 0 } }} style={BLOCK}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${columns}, 1fr)`,
          gap: 'var(--space-4)',
          padding: 'var(--space-4)',
          background: 'var(--surface-sunken)'
        }}
      >
        {Array.from({ length: columns }, (_, i) => (
          <AntSkeleton.Input key={i} active size="small" block />
        ))}
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <div
          key={r}
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${columns}, 1fr)`,
            gap: 'var(--space-4)',
            padding: 'var(--space-4)',
            borderTop: '1px solid var(--border-subtle)'
          }}
        >
          {Array.from({ length: columns }, (_, c) => (
            <AntSkeleton.Input key={c} active size="small" block />
          ))}
        </div>
      ))}
    </Card>
  </Region>
);

/** Ecran de detail — bloc de titre puis deux colonnes. */
export const SkeletonDetail: React.FC<SkeletonProps> = ({ rows = 6, ...rest }) => (
  <Region label={rest['aria-label'] ?? 'Chargement de la fiche'}>
    <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
      <Card style={BLOCK}>
        <AntSkeleton active title={{ width: '30%' }} paragraph={{ rows: 1, width: ['50%'] }} />
      </Card>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 'var(--grid-gutter)'
        }}
      >
        <Card style={BLOCK}>
          <AntSkeleton active paragraph={{ rows }} />
        </Card>
        <Card style={BLOCK}>
          <AntSkeleton active paragraph={{ rows }} />
        </Card>
      </div>
    </Space>
  </Region>
);

/** Bandeau de KPI — n tuiles de meme hauteur. */
export const SkeletonStats: React.FC<SkeletonProps> = ({ rows = 4, ...rest }) => (
  <Region label={rest['aria-label'] ?? 'Chargement des indicateurs'}>
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: 'var(--grid-gutter)'
      }}
    >
      {Array.from({ length: rows }, (_, i) => (
        <Card key={i} style={BLOCK}>
          <AntSkeleton active title={{ width: '60%' }} paragraph={{ rows: 1, width: ['40%'] }} />
        </Card>
      ))}
    </div>
  </Region>
);
