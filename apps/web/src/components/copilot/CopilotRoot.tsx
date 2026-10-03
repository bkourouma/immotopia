import React, { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { RobotOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import { t } from '../../i18n/t';
import { useCopilotStatus } from '../../hooks/useCopilotStatus';
import type { CopilotStatus } from '../../types/copilot';

// Le tiroir (chat, Markdown, cartes) ne se charge qu'à la première ouverture :
// il reste hors du bundle d'entrée.
const CopilotDrawer = lazy(() => import('./CopilotDrawer'));

/** Valeur ARIA, pas un texte affiché : ne se traduit pas. */
const COPILOT_KEYSHORTCUTS = 'Control+J Meta+J';

export interface CopilotRootProps {
  tenantId: string;
  /**
   * État déjà lu par l'appelant (la coquille, qui en tire aussi le menu) :
   * `null` tant qu'il est inconnu. Absent : le composant le lit lui-même.
   */
  status?: CopilotStatus | null;
  /** Vrai quand la barre d'onglets basse est affichée (mobile et tablette). */
  hasTabs?: boolean;
  /** Vrai quand l'action flottante de l'écran est affichée : le bouton se place au-dessus. */
  hasAction?: boolean;
  /** Vrai sur ordinateur : pas de barre d'onglets, pas d'action flottante. */
  isDesktop?: boolean;
}

/**
 * Point d'entrée d'ImmoCopilot dans la coquille : lit l'état de l'assistant,
 * affiche le bouton flottant (masqué si désactivé ou en erreur) et le
 * raccourci Ctrl/Cmd+J. Rien n'est stocké dans le navigateur.
 */
const CopilotRoot: React.FC<CopilotRootProps> = ({
  tenantId,
  status: statusProp,
  hasTabs = false,
  hasAction = false,
  isDesktop = true
}) => {
  const [open, setOpen] = useState(false);
  const [everOpened, setEverOpened] = useState(false);

  const ownStatus = useCopilotStatus(tenantId, statusProp === undefined);
  const status = statusProp === undefined ? ownStatus : statusProp;

  const enabled = Boolean(status?.enabled);

  const openDrawer = useCallback(() => {
    setEverOpened(true);
    setOpen(true);
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'j') {
        event.preventDefault();
        openDrawer();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled, openDrawer]);

  if (!status?.enabled) return null;

  // Mobile : au-dessus de la barre d'onglets et de l'action flottante (56 px).
  const tabsOffset = hasTabs ? 'var(--control-h-lg) + ' : '';
  const actionOffset = hasAction && !isDesktop ? ' + 56px + var(--space-3)' : '';
  const bottom = isDesktop
    ? 'var(--space-6)'
    : `calc(${tabsOffset}var(--space-4)${actionOffset} + env(safe-area-inset-bottom, 0px))`;

  return (
    <>
      {!open && (
        <Button
          type="primary"
          shape="circle"
          size="large"
          icon={<RobotOutlined />}
          aria-label={t("Ouvrir l'assistant")}
          aria-keyshortcuts={COPILOT_KEYSHORTCUTS}
          title={t('Assistant (Ctrl+J)')}
          onClick={openDrawer}
          style={{
            position: 'fixed',
            insetInlineEnd: isDesktop ? 'var(--space-6)' : 'var(--space-4)',
            bottom,
            zIndex: 'var(--z-bottom-bar)' as unknown as number,
            width: 56,
            height: 56,
            boxShadow: 'var(--shadow-lg)'
          }}
        />
      )}
      {everOpened && (
        <Suspense fallback={null}>
          <CopilotDrawer tenantId={tenantId} status={status} open={open} onClose={() => setOpen(false)} />
        </Suspense>
      )}
    </>
  );
};

export default CopilotRoot;
