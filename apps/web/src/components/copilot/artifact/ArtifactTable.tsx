import React, { useMemo } from 'react';
import { Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { t } from '../../../i18n/t';
import type { ArtifactCell, CopilotArtifact } from '../../../types/copilot';
import { compareCells, formatArtifactCell } from '../../../utils/copilot-artifact';
import { knownEnumLabel } from '../copilot-labels';

type TableArtifact = Extract<CopilotArtifact, { kind: 'table' }>;
type Row = Record<string, ArtifactCell>;

const ROW_KEY = '\u0000row';

export const ArtifactTable: React.FC<{ artifact: TableArtifact }> = ({ artifact }) => {
  const columns = useMemo<ColumnsType<Row>>(
    () =>
      artifact.columns.map(col => ({
        key: col.key,
        title: col.label,
        dataIndex: col.key,
        // Alignement logique : `end` suit le sens d'écriture (arabe compris).
        align: col.type === 'number' || col.type === 'currency' ? 'end' : 'start',
        sorter: (a: Row, b: Row) => compareCells(a[col.key] ?? null, b[col.key] ?? null),
        sortDirections: ['ascend', 'descend'],
        // L'infobulle de tri recouvrait le bouton « Télécharger » juste après un clic de tri.
        showSorterTooltip: false,
        // `<bdi>` : en arabe, un texte latin ou un signe en début de cellule (« -5 Villa ») ne se retourne pas.
        render: (value: ArtifactCell) => {
          const isText = !col.type || col.type === 'text';
          const label = isText && typeof value === 'string' ? knownEnumLabel(value) : null;
          return <bdi>{label ?? formatArtifactCell(value ?? null, col.type)}</bdi>;
        }
      })),
    [artifact.columns]
  );

  const dataSource = useMemo(() => artifact.rows.map((r, i) => ({ ...r, [ROW_KEY]: i })), [artifact.rows]);

  return (
    <div>
      <Table<Row>
        size="small"
        rowKey={ROW_KEY}
        columns={columns}
        dataSource={dataSource}
        pagination={artifact.rows.length > 50 ? { pageSize: 50, showSizeChanger: false } : false}
        scroll={{ x: 'max-content', y: 'max(240px, calc(100dvh - 380px))' }}
        aria-label={artifact.title}
      />
      {artifact.truncated && (
        <Typography.Text type="secondary" style={{ display: 'block', marginBlockStart: 8 }}>
          {t('Résultat tronqué : seules les premières lignes sont affichées.')}
        </Typography.Text>
      )}
    </div>
  );
};

export default ArtifactTable;
