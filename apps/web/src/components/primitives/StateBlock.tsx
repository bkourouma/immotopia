import React from 'react';
import { Button, Empty, Result, Space, Typography } from 'antd';
import { ExclamationCircleOutlined, FilterOutlined, LockOutlined, DisconnectOutlined } from '@ant-design/icons';
import { SkeletonList } from './Skeleton';
import { t } from '../../i18n/t';

const { Paragraph, Text } = Typography;

/**
 * `<StateBlock>` — les sept etats d'un ecran, en un seul composant
 * (REFONTE_UI_UX.md §5.6, §10.1).
 *
 * Le depot traite deja tres bien l'etat vide — `<Empty>` est present dans 58
 * fichiers — mais il confond « aucune donnee » et « aucun resultat pour ces
 * filtres », affiche ses erreurs en `Alert` en haut de page plutot qu'a
 * l'endroit de la donnee manquante, et n'a ni etat hors-ligne ni ecran de
 * permission refusee autre qu'un cul-de-sac sans issue.
 *
 * Une erreur partielle ne doit pas blanchir l'ecran : ce bloc se pose a
 * l'emplacement du contenu absent, pas au-dessus de la page.
 *
 * Non cable dans les ecrans a ce stade.
 */

export type StateVariant = 'loading' | 'empty' | 'no-results' | 'error' | 'offline' | 'forbidden';

export interface StateBlockAction {
  label: string;
  onClick: () => void;
  primary?: boolean;
}

export interface StateBlockProps {
  variant: StateVariant;
  /** Titre court. Un defaut par variante est fourni. */
  title?: string;
  /** Phrase de contexte, en langage metier. */
  description?: React.ReactNode;
  /** Une seule action de sortie, deux au maximum. */
  actions?: StateBlockAction[];
  /**
   * Code technique replie, destine au support (« Ref. AUTH-403 »). Jamais
   * affiche comme message principal.
   */
  detail?: string;
}

/**
 * Les textes par défaut, **résolus à chaque rendu et non au chargement du
 * module**.
 *
 * C'était une table constante jusqu'au 20 septembre 2026, et `t()` s'y
 * exécutait une seule fois, à l'import : la langue active à cet instant était
 * gravée pour toute la session. Une interface passée en anglais gardait donc
 * « Aucune donnée » sur tous ses états vides, alors que la traduction existe
 * bien (« No data », `i18n/locales/en/common.json`). Le remontage par
 * `key={language}` ne pouvait rien y faire : il réexécute les composants, pas
 * les constantes de module déjà évaluées.
 *
 * Une fonction coûte un appel par rendu et rend la langue au moment où on
 * l'affiche. C'est le prix juste.
 */
function defauts(): Record<StateVariant, { title: string; description: string }> {
  return {
    loading: { title: t('Chargement…'), description: '' },
    empty: { title: t('Aucune donnée'), description: t('Rien à afficher pour le moment.') },
    'no-results': {
      title: t('Aucun résultat'),
      description: t('Aucun élément ne correspond aux filtres appliqués.')
    },
    error: {
      title: t('Impossible de charger ces données'),
      description: t('Une erreur est survenue. Vous pouvez réessayer.')
    },
    offline: {
      title: t('Hors connexion'),
      description: t('Les données affichées peuvent être datées.')
    },
    forbidden: {
      title: t('Accès non autorisé'),
      description: t('Votre rôle ne donne pas accès à cette section.')
    }
  };
}

const ICON: Partial<Record<StateVariant, React.ReactNode>> = {
  'no-results': <FilterOutlined style={{ fontSize: 40, color: 'var(--text-tertiary)' }} />,
  error: <ExclamationCircleOutlined style={{ fontSize: 40, color: 'var(--color-error)' }} />,
  offline: <DisconnectOutlined style={{ fontSize: 40, color: 'var(--color-warning)' }} />,
  forbidden: <LockOutlined style={{ fontSize: 40, color: 'var(--text-tertiary)' }} />
};

export const StateBlock: React.FC<StateBlockProps> = ({ variant, title, description, actions = [], detail }) => {
  if (variant === 'loading') return <SkeletonList />;

  const parDefaut = defauts()[variant];
  const heading = title ?? parDefaut.title;
  const body = description ?? parDefaut.description;

  const buttons = actions.map(a => (
    <Button key={a.label} type={a.primary ? 'primary' : 'default'} onClick={a.onClick}>
      {a.label}
    </Button>
  ));

  const footer = (
    <Space orientation="vertical" align="center" size="small">
      {buttons.length > 0 && <Space wrap>{buttons}</Space>}
      {detail && (
        <Text type="secondary" style={{ fontSize: 'var(--font-size-caption)' }}>
          {detail}
        </Text>
      )}
    </Space>
  );

  // Un etat vide reste un `<Empty>` : c'est le point fort constant de
  // l'application, on le formalise plutot que de le remplacer.
  if (variant === 'empty' || variant === 'no-results') {
    return (
      <div style={{ padding: 'var(--space-8) var(--space-4)' }}>
        <Empty
          image={ICON[variant] ?? Empty.PRESENTED_IMAGE_SIMPLE}
          description={
            <Space orientation="vertical" size={4}>
              <Text strong>{heading}</Text>
              <Text type="secondary">{body}</Text>
            </Space>
          }
        >
          {footer}
        </Empty>
      </div>
    );
  }

  return (
    <Result
      // `error` porte l'information d'echec : le lecteur d'ecran doit l'annoncer.
      role={variant === 'error' || variant === 'forbidden' ? 'alert' : 'status'}
      icon={ICON[variant]}
      title={heading}
      subTitle={<Paragraph type="secondary">{body}</Paragraph>}
      extra={footer}
      style={{ padding: 'var(--space-8) var(--space-4)' }}
    />
  );
};
