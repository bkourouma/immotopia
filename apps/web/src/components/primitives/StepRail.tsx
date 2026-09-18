import React from 'react';
import { CheckOutlined } from '@ant-design/icons';
import { useBreakpoint } from '../../hooks/useBreakpoint';

/**
 * `<StepRail>` — progression d'un formulaire en plusieurs etapes.
 *
 * Remplace le `<Steps>` d'Ant Design des que le parcours depasse quatre
 * etapes. `Steps` en mode horizontal repartit la largeur entre le titre ET la
 * description de chaque etape : a six etapes sur 1 200 px, chaque colonne
 * tombe sous 120 px et le titre se casse au milieu d'un mot
 * (« Caracte / ristique / s »). La description, elle, est deja repetee dans
 * l'en-tete du panneau — elle ne paie pas sa place dans le rail.
 *
 * Trois differences avec `Steps` :
 *   - la description ne figure pas dans le rail ; seul le titre y est, sur une
 *     ligne centree sous la pastille, avec une cesure propre ;
 *   - les colonnes sont de largeur egale (`flex: 1`), donc le rail ne bouge
 *     plus quand on change d'etape ;
 *   - le rail a trois etats au lieu de deux, parce qu'une colonne trop etroite
 *     casse le titre au milieu d'un mot quoi qu'on fasse :
 *       . >= 1200 px — pastilles et titre de chaque etape ;
 *       . 992-1199 px — pastilles seules, titre de la seule etape courante,
 *         sur une ligne (les colonnes voisines sont vides, il peut deborder) ;
 *       . < 992 px — barre de progression, sans pastille (P3 : la chrome ne
 *         mange pas la donnee).
 *
 * Navigation. Une etape n'est cliquable que si elle a deja ete atteinte
 * (`furthest`) : le rail ne sert pas a sauter la validation. L'etape suivante
 * reste accessible par le bouton « Suivant », qui valide avant d'avancer.
 */

export interface StepRailItem {
  title: string;
  /** Titre abrege pour le repli mobile. A defaut, `title` est utilise. */
  shortTitle?: string;
}

export interface StepRailProps {
  items: StepRailItem[];
  /** Index de l'etape affichee. */
  current: number;
  /**
   * Index de l'etape la plus avancee atteinte. Les etapes au-dela sont
   * verrouillees. A defaut, `current` : rien en avant n'est cliquable.
   */
  furthest?: number;
  /** Absent : le rail est en lecture seule. */
  onChange?: (index: number) => void;
  /** Etapes signalees en erreur, par index. */
  invalid?: number[];
}

type StepState = 'done' | 'current' | 'upcoming' | 'error';

const CIRCLE = 32;

const circleStyle = (state: StepState, clickable: boolean): React.CSSProperties => {
  const base: React.CSSProperties = {
    position: 'relative',
    zIndex: 1,
    width: CIRCLE,
    height: CIRCLE,
    borderRadius: 'var(--radius-full)',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 'var(--font-size-small)',
    fontWeight: 'var(--font-weight-semibold)' as unknown as number,
    fontVariantNumeric: 'tabular-nums',
    border: '2px solid transparent',
    transition: 'background-color 120ms ease, border-color 120ms ease, color 120ms ease',
    cursor: clickable ? 'pointer' : 'default'
  };

  switch (state) {
    case 'done':
      return { ...base, background: 'var(--color-primary)', borderColor: 'var(--color-primary)', color: '#fff' };
    case 'current':
      return {
        ...base,
        background: 'var(--color-primary-bg)',
        borderColor: 'var(--color-primary)',
        color: 'var(--color-primary-active)',
        boxShadow: '0 0 0 4px var(--color-primary-bg)'
      };
    case 'error':
      return {
        ...base,
        background: 'var(--color-error-bg)',
        borderColor: 'var(--color-error)',
        color: 'var(--color-error-text)'
      };
    default:
      return {
        ...base,
        background: 'var(--surface-card)',
        borderColor: 'var(--border-control)',
        color: 'var(--text-tertiary)'
      };
  }
};

const labelStyle = (state: StepState, wrap: boolean): React.CSSProperties => ({
  display: 'block',
  marginTop: 'var(--space-2)',
  // Le rembourrage est porte par le libelle, pas par la colonne : les traits de
  // liaison doivent aller d'un bord a l'autre, sans rupture a la jonction.
  padding: '0 var(--space-2)',
  fontSize: 'var(--font-size-caption)',
  lineHeight: 'var(--line-height-caption)',
  fontWeight:
    state === 'current'
      ? ('var(--font-weight-semibold)' as unknown as number)
      : ('var(--font-weight-medium)' as unknown as number),
  color:
    state === 'error'
      ? 'var(--color-error-text)'
      : state === 'current'
        ? 'var(--text-primary)'
        : state === 'done'
          ? 'var(--text-secondary)'
          : 'var(--text-tertiary)',
  // Les titres sont des groupes nominaux longs. En colonnes larges ils se
  // coupent sur l'espace ; en colonne etroite, un seul titre est affiche et on
  // le laisse deborder sur les colonnes voisines, qui sont vides — mieux vaut
  // un debordement maitrise qu'un « Caracte / ristique / s ».
  whiteSpace: wrap ? 'normal' : 'nowrap',
  overflowWrap: 'normal',
  wordBreak: 'keep-all'
});

/** Trait de liaison. Sa moitie gauche est « faite » des que l'etape l'est. */
const track = (done: boolean, side: 'left' | 'right'): React.CSSProperties => ({
  position: 'absolute',
  top: CIRCLE / 2 - 1,
  height: 2,
  borderRadius: 1,
  background: done ? 'var(--color-primary)' : 'var(--border-subtle)',
  ...(side === 'left'
    ? { left: 0, right: `calc(50% + ${CIRCLE / 2 + 8}px)` }
    : { left: `calc(50% + ${CIRCLE / 2 + 8}px)`, right: 0 })
});

export const StepRail: React.FC<StepRailProps> = ({ items, current, furthest, onChange, invalid = [] }) => {
  const { isDesktop, screens } = useBreakpoint();
  // Sous 1200 px, la coquille prend 256 px de sidebar : six colonnes de titre
  // tombent a ~100 px, trop peu pour « Caracteristiques ».
  const showEveryLabel = Boolean(screens.xl);
  const reached = Math.max(furthest ?? current, current);

  const stateOf = (index: number): StepState => {
    if (invalid.includes(index)) return 'error';
    if (index < current) return 'done';
    if (index === current) return 'current';
    return 'upcoming';
  };

  const position = `Étape ${current + 1} sur ${items.length}`;

  if (!isDesktop) {
    // Repli : un compteur, une barre, et le nom de l'etape suivante. Aucune
    // pastille — a six etapes, des pastilles de 32 px sur 375 px ne laissent
    // plus de place au titre. Le titre de l'etape COURANTE n'est pas repete
    // ici : il est l'en-tete du panneau, juste en dessous.
    const pct = ((current + 1) / items.length) * 100;
    const next = items[current + 1];

    return (
      <nav aria-label="Progression du formulaire">
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            gap: 'var(--space-3)',
            marginBottom: 'var(--space-2)'
          }}
        >
          <span
            style={{
              fontSize: 'var(--font-size-small)',
              fontWeight: 'var(--font-weight-semibold)' as unknown as number,
              color: 'var(--text-primary)',
              whiteSpace: 'nowrap',
              fontVariantNumeric: 'tabular-nums'
            }}
          >
            {position}
          </span>
          {next && (
            <span
              style={{
                fontSize: 'var(--font-size-caption)',
                color: 'var(--text-tertiary)',
                minWidth: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}
            >
              {`Puis : ${next.shortTitle || next.title}`}
            </span>
          )}
        </div>
        <div
          role="progressbar"
          aria-valuenow={current + 1}
          aria-valuemin={1}
          aria-valuemax={items.length}
          aria-valuetext={position}
          style={{
            height: 6,
            borderRadius: 'var(--radius-full)',
            background: 'var(--border-subtle)',
            overflow: 'hidden'
          }}
        >
          <div
            style={{
              width: `${pct}%`,
              height: '100%',
              borderRadius: 'var(--radius-full)',
              background: 'var(--color-primary)',
              transition: 'width 200ms ease'
            }}
          />
        </div>
      </nav>
    );
  }

  return (
    <nav aria-label="Progression du formulaire">
      <ol
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          listStyle: 'none',
          margin: 0,
          padding: 0
        }}
      >
        {items.map((item, index) => {
          const state = stateOf(index);
          const clickable = Boolean(onChange) && index <= reached && index !== current;

          const pastille = (
            <span style={circleStyle(state, clickable)} aria-hidden="true">
              {state === 'done' ? <CheckOutlined /> : index + 1}
            </span>
          );

          const label =
            showEveryLabel || index === current ? (
              <span style={labelStyle(state, showEveryLabel)}>
                {showEveryLabel ? item.title : item.shortTitle || item.title}
              </span>
            ) : (
              <span className="sr-only">{item.title}</span>
            );

          const inner = (
            <>
              <span style={{ position: 'relative', display: 'block', height: CIRCLE }}>
                {index > 0 && <span style={track(index <= current, 'left')} />}
                {index < items.length - 1 && <span style={track(index < current, 'right')} />}
                {pastille}
              </span>
              {label}
            </>
          );

          return (
            <li
              key={item.title}
              style={{ flex: '1 1 0', minWidth: 0, textAlign: 'center' }}
              aria-current={index === current ? 'step' : undefined}
            >
              {clickable ? (
                <button
                  type="button"
                  onClick={() => onChange?.(index)}
                  style={{
                    display: 'block',
                    width: '100%',
                    padding: 'var(--space-1) 0',
                    background: 'none',
                    border: 'none',
                    borderRadius: 'var(--radius-md)',
                    cursor: 'pointer',
                    font: 'inherit',
                    color: 'inherit'
                  }}
                >
                  <span className="sr-only">{`Revenir à l'étape ${index + 1} : `}</span>
                  {inner}
                </button>
              ) : (
                <div style={{ padding: 'var(--space-1) 0' }}>
                  {index > reached && <span className="sr-only">{`Étape ${index + 1}, non atteinte : `}</span>}
                  {inner}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
};
