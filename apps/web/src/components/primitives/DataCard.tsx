import React from 'react';
import { Card, Dropdown, Button } from 'antd';
import { MoreOutlined } from '@ant-design/icons';
import type { MenuProps } from 'antd';

/**
 * `<DataCard>` — une ligne de liste, sur mobile (REFONTE_UI_UX.md §5.1, §6).
 *
 * C'est la représentation d'un enregistrement sous 992 px, là où un `<Table>`
 * impose un défilement horizontal et des cibles trop petites. Le dépôt
 * pratiquait `scroll={{ x: 1200 }}` : la moitié des colonnes n'était atteignable
 * qu'en faisant glisser le tableau, geste que personne ne découvre.
 *
 * Trois règles de structure, toutes vérifiables :
 *
 * 1. **Une seule action visible**, la plus fréquente. Les autres vont derrière
 *    « ⋮ ». Le dépôt alignait jusqu'à quatre icônes `type="link"` avec un
 *    `title` HTML natif : invisibles au clavier, inatteignables au lecteur
 *    d'écran, et trop serrées pour le doigt.
 * 2. **La carte entière est cliquable** vers le détail quand `onOpen` est
 *    fourni — pas une icône « œil » de 16 px.
 * 3. **Les champs sont des paires libellé/valeur**, jamais une grille : sur
 *    320 px, deux colonnes de texte se cassent.
 */

export interface DataCardField {
  label: string;
  value: React.ReactNode;
}

export interface DataCardProps {
  /** Ligne de tête : l'identifiant métier de l'enregistrement. */
  title: React.ReactNode;
  /** Contexte immédiat : référence, adresse, date. */
  subtitle?: React.ReactNode;
  /** Statut, rendu par `<StatusTag>` côté appelant. */
  status?: React.ReactNode;
  /** Montant ou grandeur mise en avant, alignée à droite du titre. */
  highlight?: React.ReactNode;
  fields?: DataCardField[];
  /**
   * Visuel de tête, à ratio réservé par l'appelant.
   *
   * Réservé aux listes où l'image *est* de l'information — un portefeuille de
   * biens. Ailleurs elle vole la place du texte. Le ratio doit être fixé par
   * l'appelant, faute de quoi l'arrivée de l'image décale tout ce qui suit.
   */
  cover?: React.ReactNode;
  /** Ouvre le détail. Rend la carte entière actionnable. */
  onOpen?: () => void;
  /** L'unique action explicite de la carte. */
  primaryAction?: { label: string; onClick: () => void; icon?: React.ReactNode; loading?: boolean };
  /** Tout le reste, derrière « ⋮ ». */
  secondaryActions?: MenuProps['items'];
  /** Nom accessible de la carte quand `title` n'est pas du texte simple. */
  'aria-label'?: string;
}

export const DataCard: React.FC<DataCardProps> = ({
  title,
  subtitle,
  status,
  highlight,
  fields,
  cover,
  onOpen,
  primaryAction,
  secondaryActions,
  'aria-label': ariaLabel
}) => {
  const interactive = Boolean(onOpen);

  return (
    <Card
      // Le clic sur la carte ouvre le détail ; les actions à l'intérieur
      // arrêtent la propagation pour ne pas déclencher les deux à la fois.
      onClick={onOpen}
      // `article` et non `button` : la carte contient elle-même des contrôles,
      // et un bouton ne peut pas en imbriquer d'autres.
      role={interactive ? 'link' : 'article'}
      tabIndex={interactive ? 0 : undefined}
      aria-label={ariaLabel}
      onKeyDown={
        interactive
          ? event => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onOpen?.();
              }
            }
          : undefined
      }
      cover={cover}
      styles={{ body: { padding: 'var(--space-4)' } }}
      style={{
        cursor: interactive ? 'pointer' : undefined,
        borderColor: 'var(--border-default)',
        marginBottom: 'var(--space-3)'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)' }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          {/* Deux lignes, pas une.
              À 375 px, une seule ligne partagée avec le montant ne laissait
              voir qu'une vingtaine de caractères : « Villa 4 chambres avec
              … » — soit un titre qui ne distingue plus un bien d'un autre.
              Mesuré dans l'atelier, à cette largeur exacte. La hauteur reste
              bornée : la grille ne peut pas se désaligner. */}
          <div
            style={{
              fontWeight: 600,
              color: 'var(--text-primary)',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden'
            }}
          >
            {title}
          </div>
          {subtitle && (
            <div
              style={{
                color: 'var(--text-secondary)',
                fontSize: 'var(--font-size-sm)',
                marginTop: 'var(--space-1)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}
            >
              {subtitle}
            </div>
          )}
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          {highlight && <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{highlight}</div>}
          {status && <div style={{ marginTop: 'var(--space-1)' }}>{status}</div>}
        </div>
      </div>

      {fields && fields.length > 0 && (
        <dl
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-1)',
            margin: 'var(--space-3) 0 0'
          }}
        >
          {fields.map(field => (
            <div key={field.label} style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-3)' }}>
              <dt style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)' }}>{field.label}</dt>
              <dd
                style={{
                  margin: 0,
                  color: 'var(--text-primary)',
                  fontSize: 'var(--font-size-sm)',
                  textAlign: 'right',
                  minWidth: 0
                }}
              >
                {field.value}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {(primaryAction || secondaryActions) && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            gap: 'var(--space-2)',
            marginTop: 'var(--space-4)'
          }}
          onClick={event => event.stopPropagation()}
        >
          {primaryAction && (
            <Button
              type="primary"
              icon={primaryAction.icon}
              loading={primaryAction.loading}
              onClick={primaryAction.onClick}
            >
              {primaryAction.label}
            </Button>
          )}
          {secondaryActions && secondaryActions.length > 0 && (
            <Dropdown menu={{ items: secondaryActions }} trigger={['click']} placement="bottomRight">
              {/* `aria-label` explicite : une icône seule n'a pas de nom
                  accessible, et « ⋮ » ne se prononce pas. */}
              <Button icon={<MoreOutlined />} aria-label="Autres actions" />
            </Dropdown>
          )}
        </div>
      )}
    </Card>
  );
};
