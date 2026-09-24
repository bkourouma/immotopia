import React from 'react';
import { Card } from 'antd';

/**
 * `<StatCard>` — un indicateur chiffré (§5.1, §6.2).
 *
 * Une valeur, ce qu'elle mesure, et au besoin le moyen d'aller voir le détail.
 * Rien d'autre : le dépôt empilait des `<Statistic>` d'Ant Design aux tailles
 * et couleurs décidées écran par écran, sans qu'aucun ne soit cliquable — un
 * chiffre qui intrigue mais ne mène nulle part.
 *
 * La valeur est en `<strong>` et le libellé la précède dans l'ordre du DOM :
 * un lecteur d'écran annonce « Biens disponibles, 42 » et non « 42 » suivi
 * d'un contexte qu'il faut retenir.
 */

export interface StatCardProps {
  label: string;
  /** La valeur. Un montant passe par `<MoneyValue>` côté appelant. */
  value: React.ReactNode;
  /** Précision sous la valeur : période, part, comparaison. */
  hint?: React.ReactNode;
  /** Pictogramme discret. Toujours décoratif, jamais porteur de sens seul. */
  icon?: React.ReactNode;
  /** Rend la carte actionnable : elle mène à la liste filtrée correspondante. */
  onClick?: () => void;
  /** Accent de couleur, tiré des rôles de `tokens.css`. */
  tone?: 'neutral' | 'positive' | 'warning' | 'danger';
  /**
   * Marque LE chiffre clé de l'écran (règle « un chiffre par écran »,
   * tokens.css §ACCENT). N'ajoute qu'un repère non-textuel — un filet
   * `--color-accent` — jamais une couleur de statut : la valeur garde la
   * teinte donnée par `tone` (le vert d'une évolution positive reste vert,
   * pas orange, l'orange ne portant jamais un statut).
   */
  highlight?: boolean;
}

const TONE_COLOR: Record<NonNullable<StatCardProps['tone']>, string> = {
  neutral: 'var(--text-primary)',
  positive: 'var(--color-success)',
  warning: 'var(--color-warning)',
  danger: 'var(--color-danger)'
};

export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  hint,
  icon,
  onClick,
  tone = 'neutral',
  highlight = false
}) => {
  const interactive = Boolean(onClick);

  return (
    <Card
      onClick={onClick}
      role={interactive ? 'link' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={
        interactive
          ? event => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
      styles={{ body: { padding: 'var(--space-4)' } }}
      style={{
        height: '100%',
        cursor: interactive ? 'pointer' : undefined,
        borderColor: 'var(--border-default)',
        // Repère de position, pas un statut : un filet `--color-accent` sur
        // le bord de lecture (inline-start, RTL-safe), plutôt qu'une bordure
        // pleine qui se lirait comme un état "en alerte". `!important` non
        // nécessaire : posé après `borderColor` dans le même style inline, il
        // l'emporte pour ce seul bord (border-inline-start-color et
        // border-color ciblent la même propriété physique, le dernier
        // déclaré gagne).
        ...(highlight ? { borderInlineStartWidth: 3, borderInlineStartColor: 'var(--color-accent)' } : null)
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)' }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          {/* Le libellé précède la valeur dans le DOM : c'est l'ordre dans
              lequel un lecteur d'écran doit l'entendre. */}
          <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)' }}>{label}</div>
          <strong
            style={{
              display: 'block',
              marginTop: 'var(--space-1)',
              fontSize: 'var(--font-size-h3)',
              lineHeight: 'var(--line-height-h3)',
              color: TONE_COLOR[tone]
            }}
          >
            {value}
          </strong>
          {hint && (
            <div
              style={{
                marginTop: 'var(--space-1)',
                color: 'var(--text-tertiary)',
                fontSize: 'var(--font-size-sm)'
              }}
            >
              {hint}
            </div>
          )}
        </div>
        {icon && (
          <span aria-hidden="true" style={{ color: 'var(--text-tertiary)', fontSize: 20, flexShrink: 0 }}>
            {icon}
          </span>
        )}
      </div>
    </Card>
  );
};
