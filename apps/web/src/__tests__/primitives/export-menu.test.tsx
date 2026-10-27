import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from 'antd';
import type { ColumnsType } from 'antd/es/table/interface';
import { ExportMenu } from '../../components/primitives/ExportMenu';
import { DataView } from '../../components/primitives/DataView';
import { Table } from '../../components/primitives/Table';

const written = vi.hoisted(() => ({ calls: [] as unknown[][] }));

vi.mock('../../utils/table-export/write', () => ({
  writeExport: vi.fn(async (...args: unknown[]) => {
    written.calls.push(args);
    return 'file';
  })
}));

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));

type Row = { id: string; nom: string; prix: number };
const ROWS: Row[] = [
  { id: '1', nom: 'Villa', prix: 450000 },
  { id: '2', nom: 'Studio', prix: 120000 }
];
const COLUMNS: ColumnsType<Row> = [
  { title: 'Nom', dataIndex: 'nom' },
  { title: 'Prix', dataIndex: 'prix', render: (v: number) => `${v.toLocaleString('fr-FR')} FCFA` },
  { title: 'Actions', key: 'actions', render: () => <button>Voir</button> }
];

function wide(count: number): ColumnsType<Row> {
  return Array.from({ length: count }, (_, i) => ({ title: `C${i}`, dataIndex: 'nom', key: `c${i}` }));
}

const wrap = (ui: React.ReactElement) => render(<App>{ui}</App>);

beforeEach(() => {
  written.calls = [];
});

describe('<ExportMenu>', () => {
  it('propose Excel, CSV et PDF', async () => {
    wrap(<ExportMenu<Row> columns={COLUMNS} rows={ROWS} filename="Biens" />);
    await userEvent.click(screen.getByRole('button', { name: 'Exporter le tableau' }));
    expect(await screen.findByText('Excel (.xlsx)')).toBeInTheDocument();
    expect(screen.getByText('CSV')).toBeInTheDocument();
    expect(screen.getByText('PDF')).toBeInTheDocument();
  });

  it('est désactivé sans aucune ligne', () => {
    wrap(<ExportMenu<Row> columns={COLUMNS} rows={[]} filename="Biens" />);
    expect(screen.getByRole('button', { name: 'Exporter le tableau' })).toBeDisabled();
  });

  it('masque le PDF au-delà de 12 colonnes, sauf pdf explicite', async () => {
    const { unmount } = wrap(<ExportMenu<Row> columns={wide(13)} rows={ROWS} filename="Large" />);
    await userEvent.click(screen.getByRole('button', { name: 'Exporter le tableau' }));
    expect(await screen.findByText('CSV')).toBeInTheDocument();
    expect(screen.queryByText('PDF')).not.toBeInTheDocument();
    unmount();

    wrap(<ExportMenu<Row> columns={wide(13)} rows={ROWS} filename="Large" pdf />);
    await userEvent.click(screen.getByRole('button', { name: 'Exporter le tableau' }));
    expect(await screen.findByText('PDF')).toBeInTheDocument();
  });

  it('retire le PDF quand pdf={false}', async () => {
    wrap(<ExportMenu<Row> columns={COLUMNS} rows={ROWS} filename="Biens" pdf={false} />);
    await userEvent.click(screen.getByRole('button', { name: 'Exporter le tableau' }));
    expect(await screen.findByText('CSV')).toBeInTheDocument();
    expect(screen.queryByText('PDF')).not.toBeInTheDocument();
  });

  it('exporte les colonnes utiles (sans actions) avec le texte rendu', async () => {
    wrap(<ExportMenu<Row> columns={COLUMNS} rows={ROWS} filename="Biens" />);
    await userEvent.click(screen.getByRole('button', { name: 'Exporter le tableau' }));
    await userEvent.click(await screen.findByText('CSV'));
    await waitFor(() => expect(written.calls).toHaveLength(1));
    const [format, table, filename] = written.calls[0] as [string, any, string];
    expect(format).toBe('csv');
    expect(filename).toBe('Biens');
    expect(table.columns.map((c: any) => c.header)).toEqual(['Nom', 'Prix']);
    expect(table.rows[0][1]).toMatchObject({ kind: 'number', value: 450000 });
  });

  it('monte les cellules élément dans le portail et lit leur texte', async () => {
    const columns: ColumnsType<Row> = [
      { title: 'Nom', dataIndex: 'nom', render: (v: string) => <strong>{v.toUpperCase()}</strong> }
    ];
    wrap(<ExportMenu<Row> columns={columns} rows={ROWS} filename="Biens" />);
    await userEvent.click(screen.getByRole('button', { name: 'Exporter le tableau' }));
    await userEvent.click(await screen.findByText('CSV'));
    await waitFor(() => expect(written.calls).toHaveLength(1));
    const table = written.calls[0][1] as any;
    expect(table.rows.map((r: any) => r[0].text)).toEqual(['VILLA', 'STUDIO']);
  });

  it('utilise fetchAll pour exporter toutes les lignes', async () => {
    const fetchAll = vi.fn(async () => [...ROWS, { id: '3', nom: 'Loft', prix: 1 }]);
    wrap(<ExportMenu<Row> columns={COLUMNS} rows={ROWS} fetchAll={fetchAll} filename="Biens" />);
    await userEvent.click(screen.getByRole('button', { name: 'Exporter le tableau' }));
    await userEvent.click(await screen.findByText('Excel (.xlsx)'));
    await waitFor(() => expect(written.calls).toHaveLength(1));
    expect(fetchAll).toHaveBeenCalledTimes(1);
    expect((written.calls[0][1] as any).rows).toHaveLength(3);
  });
});

describe('<DataView> export', () => {
  const base = {
    items: ROWS,
    total: 2,
    page: 1,
    pageSize: 20,
    onPageChange: () => undefined,
    columns: COLUMNS,
    rowKey: (r: Row) => r.id,
    renderCard: (r: Row) => <div>{r.nom}</div>,
    'aria-label': 'Biens de l’agence'
  };

  it('affiche le bouton Exporter par défaut', () => {
    wrap(<DataView<Row> {...base} />);
    expect(screen.getByRole('button', { name: 'Exporter le tableau' })).toBeInTheDocument();
  });

  it('retire le bouton avec export={false}', () => {
    wrap(<DataView<Row> {...base} export={false} />);
    expect(screen.queryByRole('button', { name: 'Exporter le tableau' })).not.toBeInTheDocument();
  });

  it('n’affiche rien sur une liste vide', () => {
    wrap(<DataView<Row> {...base} items={[]} total={0} />);
    expect(screen.queryByRole('button', { name: 'Exporter le tableau' })).not.toBeInTheDocument();
  });

  it('en grille, exige export.columns', () => {
    const grid = { ...base, layout: 'grid' as const, columns: undefined };
    const { unmount } = wrap(<DataView<Row> {...grid} />);
    expect(screen.queryByRole('button', { name: 'Exporter le tableau' })).not.toBeInTheDocument();
    unmount();
    wrap(<DataView<Row> {...grid} export={{ columns: COLUMNS }} />);
    expect(screen.getByRole('button', { name: 'Exporter le tableau' })).toBeInTheDocument();
  });
});

describe('primitives/Table', () => {
  it('pose le bouton au-dessus du tableau et le retire avec exportable={false}', () => {
    const { unmount } = wrap(<Table<Row> rowKey="id" columns={COLUMNS} dataSource={ROWS} exportFilename="Biens" />);
    expect(screen.getByRole('button', { name: 'Exporter le tableau' })).toBeInTheDocument();
    expect(screen.getByText('Villa')).toBeInTheDocument();
    unmount();
    wrap(<Table<Row> rowKey="id" columns={COLUMNS} dataSource={ROWS} exportable={false} />);
    expect(screen.queryByRole('button', { name: 'Exporter le tableau' })).not.toBeInTheDocument();
  });

  it('n’affiche pas le bouton sans ligne et expose Table.Summary', () => {
    wrap(<Table<Row> rowKey="id" columns={COLUMNS} dataSource={[]} />);
    expect(screen.queryByRole('button', { name: 'Exporter le tableau' })).not.toBeInTheDocument();
    expect(Table.Summary).toBeDefined();
    expect(Table.EXPAND_COLUMN).toBeDefined();
    expect(Table.SELECTION_COLUMN).toBeDefined();
  });
});
