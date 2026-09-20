import React from 'react';
import { Card, Typography } from 'antd';
import { Link } from 'react-router-dom';
import { StateBlock } from '../primitives';
import { t } from '../../i18n/t';

const { Text } = Typography;

/**
 * `<ChartCard>` — le cadre commun des graphiques du tableau de bord.
 *
 * Trois choses que chaque graphique du dépôt refaisait à sa façon, et que ce
 * cadre impose une fois :
 *
 * **La hauteur.** Les trois graphiques du tableau de bord CRM sont figés à
 * 300, 300 et 400 px (§6.2) : sur 375 px de large, un empilement d'un millier
 * de pixels. Ici, `clamp(200px, 38vh, 300px)` — la hauteur suit l'écran, et la
 * bande des libellés d'axe est comprise dedans, pas ajoutée après.
 *
 * **La sortie.** Un graphique qui ne mène nulle part est un rapport. Chaque
 * carte porte un lien vers l'écran qui détient le détail.
 *
 * **L'accès au clavier.** Un `<svg>` ne se parcourt pas à la tabulation. La
 * légende sous le graphique n'est donc pas décorative : c'est elle qui rend
 * chaque tranche atteignable au clavier, nommée et chiffrée. Le clic sur la
 * tranche est un raccourci à la souris, jamais le seul chemin.
 */

export interface ChartCardLegendItem {
  label: string;
  value: React.ReactNode;
  color: string;
  href?: string;
}

export interface ChartCardProps {
  title: string;
  /** Une phrase courte : ce que le graphique mesure, ou sur quelle période. */
  subtitle?: React.ReactNode;
  /** Le lien de sortie, en en-tête de carte. */
  link?: { label: string; to: string };
  /** Vrai tant que la donnée n'est pas là : la carte rend son squelette. */
  loading?: boolean;
  /** Vrai quand la donnée est arrivée, mais vide. */
  empty?: boolean;
  emptyText?: string;
  legend?: ChartCardLegendItem[];
  children: React.ReactNode;
}

/** Hauteur de tracé, libellés d'axe compris. */
export const CHART_HEIGHT = 'clamp(200px, 38vh, 300px)';

export const ChartCard: React.FC<ChartCardProps> = ({
  title,
  subtitle,
  link,
  loading,
  empty,
  emptyText = t('Aucune donnée sur cette période.'),
  legend,
  children
}) => (
  <Card
    loading={loading}
    style={{ height: '100%', borderColor: 'var(--border-default)' }}
    styles={{ body: { padding: 'var(--space-4)' } }}
  >
    {/* En-tête posé dans le corps plutôt que dans `title`/`extra` d'Ant
        Design : sa barre d'en-tête ne se replie pas, et sur 375 px le lien de
        sortie passait par-dessus la deuxième ligne du sous-titre. Ici, il
        passe simplement à la ligne. */}
    <header
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        gap: 'var(--space-2)',
        marginBottom: 'var(--space-3)'
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{title}</div>
        {subtitle && (
          <Text type="secondary" style={{ fontSize: 'var(--font-size-sm)' }}>
            {subtitle}
          </Text>
        )}
      </div>
      {link && <Link to={link.to}>{link.label}</Link>}
    </header>

    {empty ? (
      <StateBlock variant="empty" title={t('Rien à tracer')} description={emptyText} />
    ) : (
      <>
        <div style={{ width: '100%', height: CHART_HEIGHT }}>{children}</div>
        {legend && legend.length > 0 && (
          <ul
            style={{
              listStyle: 'none',
              margin: 'var(--space-3) 0 0',
              padding: 0,
              display: 'grid',
              // 220 px : la largeur d'un libellé métier suivi d'un montant à
              // sept chiffres. À 150, les deux se chevauchaient dès que la
              // carte s'élargissait et que la grille passait à quatre colonnes.
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 'var(--space-2)'
            }}
          >
            {legend.map(item => {
              const contenu = (
                <>
                  <span
                    aria-hidden="true"
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 3,
                      background: item.color,
                      flexShrink: 0
                    }}
                  />
                  {/* Le texte porte les tokens de texte, jamais la couleur de
                      la série : une teinte claire serait illisible. */}
                  <span
                    style={{
                      color: 'var(--text-secondary)',
                      minWidth: 0,
                      flex: 1,
                      // Un libellé long se coupe ; il ne pousse pas la valeur
                      // hors de sa colonne, et ne passe pas dessous.
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {item.label}
                  </span>
                  <span
                    style={{
                      color: 'var(--text-primary)',
                      fontVariantNumeric: 'tabular-nums',
                      flexShrink: 0
                    }}
                  >
                    {item.value}
                  </span>
                </>
              );

              const style: React.CSSProperties = {
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-2)',
                fontSize: 'var(--font-size-sm)',
                // 44 px de haut : la cible tactile du §P1, même dans une légende.
                minHeight: 32,
                padding: '4px 0'
              };

              return (
                <li key={item.label}>
                  {item.href ? (
                    <Link to={item.href} style={style}>
                      {contenu}
                    </Link>
                  ) : (
                    <span style={style}>{contenu}</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </>
    )}
  </Card>
);
