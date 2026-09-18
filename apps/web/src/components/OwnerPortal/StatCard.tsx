import React from 'react';
import { Card, Statistic } from 'antd';
import { ReactNode } from 'react';

interface StatCardProps {
  title: string;
  value: number | string;
  prefix?: ReactNode;
  suffix?: string;
  valueStyle?: React.CSSProperties;
  icon?: ReactNode;
  /**
   * Variante pour une rangee d'indicateurs. Meme encombrement que la carte
   * d'origine — meme hauteur, meme respiration — mais le pictogramme passe a
   * cote du libelle au lieu de preceder la valeur : il ne mange plus la largeur
   * dont le montant a besoin, et le chiffre part du meme bord que son libelle.
   */
  compact?: boolean;
}

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  prefix,
  suffix,
  valueStyle,
  icon,
  compact = false
}) => {
  if (compact) {
    return (
      <Card
        style={{ height: '100%' }}
        styles={{
          body: {
            // Le `minHeight` tient la hauteur de la carte d'origine, que le
            // libelle tienne sur une ligne ou deux : une rangee d'indicateurs
            // dont les cartes n'ont pas toutes la meme taille se lit mal.
            minHeight: 104,
            padding: 'clamp(16px, 1.5vw, 24px)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center'
          }
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            color: 'var(--text-secondary)',
            fontSize: 'var(--font-size-body)',
            lineHeight: 1.3
          }}
        >
          {(prefix || icon) && (
            <span aria-hidden="true" style={{ flexShrink: 0, display: 'inline-flex', fontSize: 16 }}>
              {prefix || icon}
            </span>
          )}
          <span style={{ minWidth: 0 }}>{title}</span>
        </div>
        <div
          style={{
            marginTop: 'var(--space-2)',
            fontWeight: 600,
            fontVariantNumeric: 'tabular-nums',
            whiteSpace: 'nowrap',
            // Taille par defaut calee sur celle des montants d'origine (20 px).
            // Le plancher laisse passer « 2 450 000 F CFA » dans la carte la
            // plus etroite de la grille ; un appelant dont la valeur est courte
            // repasse au-dessus via `valueStyle`.
            fontSize: 'clamp(18px, 1.6vw, 22px)',
            lineHeight: 1.3,
            ...valueStyle
          }}
        >
          {value}
          {suffix && <span style={{ fontSize: '0.8em', marginInlineStart: 2 }}>{suffix}</span>}
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <Statistic title={title} value={value} prefix={prefix || icon} suffix={suffix} valueStyle={valueStyle} />
    </Card>
  );
};
