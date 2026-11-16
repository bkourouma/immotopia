import React from 'react';
import { Button, Tooltip } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { InfoCircleOutlined, QuestionCircleOutlined } from '@ant-design/icons';
import { t } from '../../i18n/t';
import { useHelp } from '../help-context';
import { useHelpEntry } from '../registry';
import type { HelpEntry } from '../types';

export interface HelpButtonProps {
  helpId: string;
  size?: 'small' | 'middle' | 'large';
  /** Texte visible a cote de l'icone. */
  label?: string;
  className?: string;
  style?: React.CSSProperties;
}

/** Petit « ? » qui ouvre la fiche d'aide `helpId` dans le panneau. */
export function HelpButton({ helpId, size = 'middle', label, className, style }: HelpButtonProps) {
  const { available, openHelp } = useHelp();
  const { entry, status } = useHelpEntry(available ? helpId : null);

  if (!available) return null;

  if (status === 'missing') {
    if (!import.meta.env.DEV) return null;
    return (
      <span
        data-testid="help-missing"
        title={`${t('aide manquante')} : ${helpId}`}
        style={{
          fontSize: 'var(--font-size-xs, 11px)',
          color: 'var(--color-text-tertiary, #8c8c8c)',
          border: '1px dashed currentColor',
          borderRadius: 4,
          padding: '0 4px'
        }}
      >
        {t('aide manquante')}
      </span>
    );
  }

  if (status !== 'ready' || !entry) return null;

  const tooltip = t('Aide : {{titre}}', { titre: entry.title });
  const small = size === 'small';
  return (
    <Button
      type="text"
      size={size}
      className={className}
      icon={<QuestionCircleOutlined />}
      aria-label={tooltip}
      aria-haspopup="dialog"
      title={tooltip}
      data-help-id={helpId}
      onClick={event => {
        event.stopPropagation();
        openHelp(helpId);
      }}
      onKeyDown={event => {
        // Entrée/Espace ne doivent pas déclencher un parent (Collapse, onglet) ;
        // pas de preventDefault : l'activation native du bouton reste.
        if (event.key === 'Enter' || event.key === ' ') event.stopPropagation();
      }}
      style={{
        minWidth: small ? 24 : 32,
        minHeight: small ? 24 : 32,
        ...(small ? { padding: 0 } : null),
        ...style
      }}
    >
      {label}
    </Button>
  );
}

export interface HelpSectionTitleProps {
  title: React.ReactNode;
  helpId: string;
}

/** Titre de section suivi du « ? » de sa fiche d'aide. */
export function HelpSectionTitle({ title, helpId }: HelpSectionTitleProps) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)' }}>
      {title}
      <HelpButton size="small" helpId={helpId} />
    </span>
  );
}

/**
 * Pose une ancre de visite guidee : `<Button {...helpAnchor('nouveau-bail')}>`
 * rend `data-help-anchor="nouveau-bail"`, que `tour.steps[].target` d'une fiche
 * designe par la meme valeur. Une etape dont l'ancre est absente est ignoree.
 */
export function helpAnchor(name: string): { 'data-help-anchor': string } {
  return { 'data-help-anchor': name };
}

// --- Aide des tableaux (code deplace de column-help.tsx : un seul chunk partage) ---

/**
 * Aide des tableaux : infobulles de colonnes et « ? » de bloc, partages par
 * `<Table>` et `<DataView>`. Ne jamais importer `components/primitives` ici.
 */

export interface ColumnHelpItem {
  key: string;
  label: string;
  description: string;
}

function ColumnHelpIcon({ description }: { description: string }) {
  return (
    <Tooltip title={description}>
      <InfoCircleOutlined
        tabIndex={0}
        role="img"
        aria-label={description}
        // L'icone vit dans un en-tete triable : un clic ne doit pas changer le tri.
        onClick={event => event.stopPropagation()}
        style={{ marginInlineStart: 4, color: 'var(--text-tertiary)', cursor: 'help' }}
      />
    </Tooltip>
  );
}

function columnIds(column: { key?: React.Key; dataIndex?: unknown }): string[] {
  const ids: string[] = [];
  if (column.key !== undefined && column.key !== null) ids.push(String(column.key));
  const di = column.dataIndex;
  if (typeof di === 'string') ids.push(di);
  else if (Array.isArray(di)) ids.push(di.join('.'));
  return ids;
}

/** Ajoute une infobulle « i » dans l'en-tete des colonnes decrites par la fiche. */
export function withColumnHelp<T>(
  columns: ColumnsType<T> | undefined,
  help: ColumnHelpItem[] | undefined
): ColumnsType<T> | undefined {
  if (!columns || !help || help.length === 0) return columns;
  const byKey = new Map(help.map(item => [item.key, item]));

  const decorate = (list: ColumnsType<T>): ColumnsType<T> =>
    list.map(column => {
      const children = (column as { children?: ColumnsType<T> }).children;
      let next = children ? ({ ...column, children: decorate(children) } as typeof column) : column;
      const item = columnIds(column as { key?: React.Key; dataIndex?: unknown })
        .map(id => byKey.get(id))
        .find(Boolean);
      const title = (column as { title?: unknown }).title;
      if (!item || title === undefined || title === null || title === false) return next;
      const icon = <ColumnHelpIcon description={item.description} />;
      if (typeof title === 'function') {
        const original = title as (props: unknown) => React.ReactNode;
        next = {
          ...next,
          title: (props: unknown) => (
            <span>
              {original(props)}
              {icon}
            </span>
          )
        } as typeof column;
      } else {
        next = {
          ...next,
          title: (
            <span>
              {title as React.ReactNode}
              {icon}
            </span>
          )
        } as typeof column;
      }
      return next;
    });

  return decorate(columns);
}

/**
 * « ? » de bloc d'un tableau et fiche associee. `node` est `null` hors
 * `<HelpProvider>`, sans `helpId`, ou tant que la fiche n'est pas prete (pas de
 * ligne d'en-tete vide pendant le chargement).
 */
export function useTableHelp(helpId: string | undefined): {
  node: React.ReactNode;
  entry: HelpEntry | null;
} {
  const { available } = useHelp();
  const { entry, status } = useHelpEntry(available && helpId ? helpId : null);
  const visible = Boolean(helpId) && available && (status === 'ready' || (status === 'missing' && import.meta.env.DEV));
  return {
    node: visible && helpId ? <HelpButton helpId={helpId} /> : null,
    entry
  };
}

export default HelpButton;
