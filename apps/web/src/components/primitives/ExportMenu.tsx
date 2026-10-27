import React, { useCallback, useMemo, useRef, useState } from 'react';
import { App, Button, Dropdown } from 'antd';
import type { MenuProps } from 'antd';
import type { ColumnsType } from 'antd/es/table/interface';
import { DownloadOutlined, FileExcelOutlined, FilePdfOutlined, FileTextOutlined } from '@ant-design/icons';
import { activeLocale } from '../../i18n/format';
import { t } from '../../i18n/t';
import { CellRenderHost, type RenderJob } from '../../utils/table-export/CellRenderHost';
import { resolveExportColumns } from '../../utils/table-export/columns';
import type { ExportFormat } from '../../utils/table-export/types';

/**
 * `<ExportMenu>` — le bouton « Exporter » des tableaux (Excel, CSV, PDF).
 *
 * Un seul composant pour les ~275 tableaux de l'application : `<DataView>` et
 * `primitives/Table` le posent seuls, un écran n'a qu'à nommer son fichier (et,
 * si la liste est paginée par le serveur, à dire comment tout récupérer via
 * `fetchAll`).
 *
 * **Ce qui est exporté** : les colonnes `columns` exportables (voir
 * `ColumnType.exportable|exportTitle|exportValue`) sur `rows`, ou sur tout ce
 * que rend `fetchAll`. Sans `fetchAll`, seule la page affichée l'est — le menu
 * en avertit quand `total` dépasse `rows`.
 *
 * **Le texte rendu** des cellules (`render`) s'obtient en les montant hors écran
 * dans un portail React de CE composant, donc avec les contextes de
 * l'application, par paquets de ~300 pour ne pas figer l'onglet.
 *
 * **Le PDF** n'est proposé que pour les tableaux étroits (12 colonnes exportables
 * au plus), sauf `pdf` explicite. exceljs et jsPDF sont chargés à la demande.
 */

/** Au-delà de ce nombre de colonnes exportables, le PDF n'est plus proposé par défaut. */
export const PDF_MAX_COLUMNS = 12;

export type ExportFetchAllResult<T> = T[] | { items: T[]; truncated?: boolean };

export interface ExportMenuProps<T> {
  columns: ColumnsType<T> | undefined;
  /** Les lignes affichées (page courante ou jeu de données complet). */
  rows: readonly T[];
  /** Récupère toutes les lignes quand `rows` n'est qu'une page. */
  fetchAll?: () => Promise<ExportFetchAllResult<T>>;
  /** Base du nom de fichier ; la date et l'extension sont ajoutées. */
  filename: string;
  /** Titre du document (PDF) et nom de la feuille (Excel). Défaut : `filename`. */
  title?: string;
  /** `true` impose le PDF, `false` le retire. Défaut : proposé jusqu'à 12 colonnes. */
  pdf?: boolean;
  /** Total côté serveur, pour avertir quand l'export ne couvre que la page affichée. */
  total?: number;
  /** Propriété des lignes enfants (tableaux arborescents). */
  childrenColumnName?: string;
}

function languageOf(locale: string): string {
  return locale.toLowerCase().split('-')[0];
}

export function ExportMenu<T>(props: ExportMenuProps<T>) {
  const { columns, rows, fetchAll, filename, title, pdf, total, childrenColumnName } = props;
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [job, setJob] = useState<RenderJob | null>(null);
  const jobId = useRef(0);

  const columnCount = useMemo(() => resolveExportColumns(columns).length, [columns]);
  const showPdf = pdf ?? columnCount <= PDF_MAX_COLUMNS;

  /** Monte un paquet de cellules dans le portail et rend leur texte. */
  const renderNodes = useCallback(async (nodes: React.ReactNode[]): Promise<(string | null)[]> => {
    const texts = await new Promise<(string | null)[]>(resolve => {
      jobId.current += 1;
      setJob({ id: jobId.current, nodes, resolve });
    });
    setJob(null);
    // Laisse respirer l'onglet entre deux paquets.
    await new Promise(resolve => setTimeout(resolve, 0));
    return texts;
  }, []);

  const run = useCallback(
    async (format: ExportFormat) => {
      setLoading(true);
      try {
        let data: readonly T[] = rows;
        let truncated = false;
        if (fetchAll) {
          const result = await fetchAll();
          data = Array.isArray(result) ? result : result.items;
          truncated = !Array.isArray(result) && Boolean(result.truncated);
        }
        if (data.length === 0) {
          message?.warning?.(t('Aucune donnée à exporter'));
          return;
        }

        const { buildExportTable } = await import('../../utils/table-export/build-table');
        const table = await buildExportTable(columns, data, { renderNodes, childrenColumnName });
        if (table.columns.length === 0) {
          message?.warning?.(t('Aucune colonne exportable.'));
          return;
        }

        const locale = activeLocale();
        const { writeExport } = await import('../../utils/table-export/write');
        const outcome = await writeExport(format, table, filename, {
          title: title ?? filename,
          language: languageOf(locale),
          locale
        });

        if (truncated) {
          const { EXPORT_MAX_ROWS } = await import('../../utils/table-export/collect');
          message?.warning?.(
            t("L'export est limité à {{count}} lignes : affinez les filtres pour obtenir le reste.", {
              count: EXPORT_MAX_ROWS
            })
          );
        } else if (!fetchAll && total !== undefined && total > data.length) {
          message?.warning?.(
            t('Seules les {{count}} lignes affichées ont été exportées, sur {{total}}.', {
              count: data.length,
              total
            })
          );
        } else if (outcome === 'print') {
          message?.info?.(t("Choisissez « Enregistrer en PDF » dans la fenêtre d'impression."));
        } else {
          message?.success?.(t('Export terminé ({{count}} lignes).', { count: data.length }));
        }
      } catch {
        message?.error?.(t("L'export a échoué."));
      } finally {
        setLoading(false);
      }
    },
    [rows, fetchAll, columns, renderNodes, childrenColumnName, filename, title, total, message]
  );

  const items: MenuProps['items'] = [
    { key: 'xlsx', icon: <FileExcelOutlined />, label: t('Excel (.xlsx)') },
    { key: 'csv', icon: <FileTextOutlined />, label: t('CSV') },
    ...(showPdf ? [{ key: 'pdf', icon: <FilePdfOutlined />, label: t('PDF') }] : [])
  ];

  const disabled = rows.length === 0;

  return (
    <>
      <Dropdown
        menu={{ items, onClick: ({ key }) => void run(key as ExportFormat) }}
        trigger={['click']}
        placement="bottomRight"
        disabled={disabled || loading}
      >
        <Button
          icon={<DownloadOutlined />}
          loading={loading}
          disabled={disabled}
          aria-label={t('Exporter le tableau')}
          aria-haspopup="menu"
        >
          {t('Exporter')}
        </Button>
      </Dropdown>
      <CellRenderHost job={job} />
    </>
  );
}
