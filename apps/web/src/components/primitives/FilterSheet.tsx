import React, { useState } from 'react';
import { Button, Drawer, Badge, Space } from 'antd';
import { FilterOutlined } from '@ant-design/icons';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { t } from '../../i18n/t';

/**
 * `<FilterSheet>` — les filtres d'une liste (§5.1, §6.4).
 *
 * Sous 992 px, les filtres occupent une feuille qui monte du bas de l'écran :
 * pleine largeur, cibles de 44 px, actions à portée du pouce. Au-dessus, ils
 * restent en ligne au-dessus de la liste.
 *
 * Le dépôt utilisait un `<Collapse>` replié dans le flux. Deux conséquences
 * mesurables : sur mobile, ouvrir les filtres poussait la liste hors de
 * l'écran, si bien qu'on ne voyait pas le résultat de ce qu'on filtrait ; et
 * rien n'indiquait, une fois replié, qu'un filtre restait posé — d'où des
 * listes « vides » qui ne l'étaient pas.
 *
 * Le compteur sur le déclencheur répond à ce second point. Il n'est pas
 * décoratif : c'est la seule chose qui distingue une liste vide d'une liste
 * filtrée quand le panneau est fermé.
 */

export interface FilterSheetProps {
  /** Les contrôles de filtre. Rendus à l'identique dans les deux paliers. */
  children: React.ReactNode;
  /** Nombre de filtres actifs. Affiché en pastille sur le déclencheur. */
  activeCount: number;
  /** Efface tout. Absent si l'écran ne le permet pas. */
  onClear?: () => void;
  /** Titre de la feuille, sur mobile. */
  title?: string;
}

export const FilterSheet: React.FC<FilterSheetProps> = ({ children, activeCount, onClear, title = 'Filtrer' }) => {
  const { isDesktop } = useBreakpoint();
  const [open, setOpen] = useState(false);

  if (isDesktop) {
    return (
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'flex-end',
          gap: 'var(--space-3)',
          padding: 'var(--space-4)',
          background: 'var(--surface-card)',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-md)',
          marginBottom: 'var(--space-4)'
        }}
        role="search"
        aria-label={title}
      >
        {children}
        {onClear && activeCount > 0 && (
          <Button type="text" onClick={onClear}>
            {t('Effacer les filtres')}
          </Button>
        )}
      </div>
    );
  }

  return (
    <>
      <Badge count={activeCount} offset={[-4, 4]}>
        <Button icon={<FilterOutlined />} onClick={() => setOpen(true)} block>
          {/* Le libellé dit l'état, pas seulement l'action : « Filtrer » seul
              ne laisse pas deviner qu'un filtre est déjà posé. */}
          {activeCount > 0 ? t('Filtres ({{activeCount}})', { activeCount: activeCount }) : t('Filtrer')}
        </Button>
      </Badge>

      <Drawer
        title={title}
        placement="bottom"
        open={open}
        onClose={() => setOpen(false)}
        height="auto"
        styles={{ body: { paddingBottom: 'var(--space-6)' } }}
        // Les actions restent visibles sous les contrôles, dans les 96 px
        // inférieurs exigés par le §10.1.
        footer={
          <Space style={{ width: '100%', justifyContent: 'space-between' }}>
            {onClear ? (
              <Button type="text" onClick={onClear} disabled={activeCount === 0}>
                {t('Effacer')}
              </Button>
            ) : (
              <span />
            )}
            <Button type="primary" onClick={() => setOpen(false)}>
              {t('Voir les résultats')}
            </Button>
          </Space>
        }
      >
        {/* Les filtres s'appliquent à la saisie, pas à la validation : la
            feuille reste ouverte et le compteur se met à jour. « Voir les
            résultats » ferme, il ne valide pas — il n'y a rien à valider. */}
        <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
          {children}
        </Space>
      </Drawer>
    </>
  );
};
