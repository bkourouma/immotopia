import React from 'react';
import { Tooltip } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { InfoCircleOutlined } from '@ant-design/icons';
import { HelpButton } from './components/HelpButton';
import { useHelp } from './help-context';
import { useHelpEntry } from './registry';
import type { HelpEntry } from './types';

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
