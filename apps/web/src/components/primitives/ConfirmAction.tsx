import React, { useState } from 'react';
import { App, Button, Drawer, Popconfirm, Space, Typography } from 'antd';
import { useBreakpoint } from '../../hooks/useBreakpoint';

const { Text, Title } = Typography;

/**
 * `<ConfirmAction>` — une seule facon de confirmer (REFONTE_UI_UX.md §5.7).
 *
 * Le depot en comptait trois : `Popconfirm` (14 fichiers), la modale de
 * confirmation statique d'AntD (8 fichiers) et le dialogue natif du
 * navigateur (13 fichiers). Supprimer un ticket etait un `Popconfirm` dans
 * `components/maintenance/TicketCard.tsx` et une modale statique dans
 * `pages/tenant/maintenance/TicketList.tsx` — meme action, deux dialogues.
 *
 * Cible : `Popconfirm` ancre a partir de 992 px, bottom-sheet en dessous.
 * Deux regles du §5.7 sont appliquees ici plutot que laissees a l'appelant :
 *   - la confirmation NOMME l'objet (« Supprimer le bail BAIL-2026-0184 ? ») ;
 *   - sur mobile, le bouton destructeur n'est jamais en position primaire a
 *     droite : l'ordre est [Annuler] [Supprimer], le pouce droit tombant sur
 *     « Annuler ».
 */

export interface ConfirmActionProps {
  /** Question posee. Doit nommer l'objet concerne. */
  title: string;
  /** Precision facultative : consequence, irreversibilite. */
  description?: React.ReactNode;
  okText?: string;
  cancelText?: string;
  /** Action destructive : bouton `danger` et ordre inverse sur mobile. */
  danger?: boolean;
  /** Le bouton reste en `loading` tant que la promesse n'a pas repondu (§5.7). */
  onConfirm: () => void | Promise<unknown>;
  onCancel?: () => void;
  disabled?: boolean;
  /** L'element declencheur — un bouton, une icone d'action de tableau. */
  children: React.ReactElement;
}

export const ConfirmAction: React.FC<ConfirmActionProps> = ({
  title,
  description,
  okText = 'Confirmer',
  cancelText = 'Annuler',
  danger = false,
  onConfirm,
  onCancel,
  disabled = false,
  children
}) => {
  const { isDesktop } = useBreakpoint();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setLoading(true);
    try {
      await onConfirm();
      setOpen(false);
    } finally {
      setLoading(false);
    }
  };

  if (isDesktop) {
    return (
      <Popconfirm
        title={title}
        description={description}
        okText={okText}
        cancelText={cancelText}
        okButtonProps={{ danger, loading }}
        disabled={disabled}
        onConfirm={run}
        onCancel={onCancel}
      >
        {children}
      </Popconfirm>
    );
  }

  const trigger = React.cloneElement(children, {
    onClick: (event: React.MouseEvent) => {
      event.stopPropagation();
      if (disabled) return;
      children.props.onClick?.(event);
      setOpen(true);
    }
  });

  const dismiss = () => {
    setOpen(false);
    onCancel?.();
  };

  return (
    <>
      {trigger}
      <Drawer
        placement="bottom"
        open={open}
        onClose={dismiss}
        closable={false}
        size="auto"
        styles={{
          section: { borderRadius: 'var(--radius-xl) var(--radius-xl) 0 0' },
          body: { padding: 'var(--space-6) var(--space-4) var(--space-8)' }
        }}
      >
        <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
          <Title level={4} style={{ margin: 0 }}>
            {title}
          </Title>
          {description && <Text type="secondary">{description}</Text>}
          {/* Ordre volontaire : « Annuler » sous le pouce, l'action
              destructive a gauche (§5.7). */}
          <Space style={{ width: '100%' }} orientation="vertical" size="small">
            <Button block danger={danger} loading={loading} onClick={run}>
              {okText}
            </Button>
            <Button block type="primary" onClick={dismiss}>
              {cancelText}
            </Button>
          </Space>
        </Space>
      </Drawer>
    </>
  );
};

/**
 * Pendant imperatif de `<ConfirmAction>`, pour les appelants qui declenchent la
 * confirmation depuis un gestionnaire d'evenement et non depuis un element
 * declencheur : les dix modales de confirmation statiques du depot etaient
 * dans ce cas.
 *
 * Passer par ici plutot que par l'API `modal` d'`App.useApp()` en direct
 * garde une politique de confirmation unique — memes libelles par defaut, meme
 * traitement du destructif, meme mise en page sous 992 px.
 *
 * Limite connue : la variante mobile reste une modale centree et non un
 * bottom-sheet. La voie declarative `<ConfirmAction>` porte le bottom-sheet ;
 * l'aligner ici suppose de restructurer le JSX des dix appelants, ce que le
 * Lot 0 s'interdit.
 */
export interface ConfirmOptions {
  title: string;
  description?: React.ReactNode;
  okText?: string;
  cancelText?: string;
  danger?: boolean;
  onConfirm: () => void | Promise<unknown>;
}

export function useConfirmAction(): (options: ConfirmOptions) => void {
  const { modal } = App.useApp();
  const { isDesktop } = useBreakpoint();

  return ({ title, description, okText = 'Confirmer', cancelText = 'Annuler', danger, onConfirm }) => {
    modal.confirm({
      title,
      content: description,
      okText,
      cancelText,
      centered: !isDesktop,
      // Sous 992 px, les boutons occupent toute la largeur (§5.7).
      okButtonProps: { danger, block: !isDesktop },
      cancelButtonProps: { block: !isDesktop },
      onOk: onConfirm
    });
  };
}
