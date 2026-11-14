import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ColumnsType } from 'antd/es/table';
import { HelpContext, INERT_HELP, type HelpContextValue } from '../../help/help-context';
import { withColumnHelp } from '../../help/column-help';
import { PageHeader } from '../../components/primitives/PageHeader';
import { Table } from '../../components/primitives/Table';
import { DataView } from '../../components/primitives/DataView';
import { DataCard } from '../../components/primitives/DataCard';
import { StatCard } from '../../components/primitives/StatCard';
import type { ListSearchBinding } from '../../utils/list-search/types';

const exportColumns = vi.hoisted(() => ({ last: undefined as unknown }));

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));

vi.mock('../../help/registry', () => ({
  useHelpEntry: (helpId: string | null | undefined) =>
    helpId
      ? {
          status: 'ready',
          fallback: false,
          entry: {
            id: helpId,
            kind: 'table',
            title: 'Liste des baux',
            summary: 'Résumé',
            howToRead: {
              columns: [{ key: 'loyer', label: 'Loyer', description: 'Loyer mensuel hors charges' }]
            }
          }
        }
      : { status: 'idle', fallback: false, entry: null }
}));

vi.mock('../../components/primitives/ExportMenu', () => ({
  ExportMenu: (props: { columns?: unknown }) => {
    exportColumns.last = props.columns;
    return <button type="button">Exporter</button>;
  }
}));

interface Bail {
  id: string;
  ref: string;
  loyer: number;
}
const ROWS: Bail[] = [{ id: '1', ref: 'B-1', loyer: 100 }];
const COLUMNS: ColumnsType<Bail> = [
  { title: 'Référence', dataIndex: 'ref', key: 'ref' },
  { title: 'Loyer', dataIndex: 'loyer', key: 'loyer' }
];

const claimRelease = vi.fn();
const claimPageHelp = vi.fn(() => claimRelease);
const openHelp = vi.fn();

function provider(overrides: Partial<HelpContextValue> = {}): HelpContextValue {
  return {
    ...INERT_HELP,
    available: true,
    pageHelpId: 'locatif.baux.liste',
    claimPageHelp,
    openHelp,
    ...overrides
  };
}

function withHelp(ui: React.ReactElement, value: HelpContextValue = provider()) {
  return render(<HelpContext.Provider value={value}>{ui}</HelpContext.Provider>);
}

function binding(): ListSearchBinding {
  return {
    criteria: [{ key: 'q', type: 'text', label: 'Recherche', placeholder: 'Chercher' }],
    values: {},
    onChange: vi.fn(),
    onClear: vi.fn(),
    activeCount: 0
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  exportColumns.last = undefined;
});

describe('PageHeader et aide', () => {
  it("utilise l'aide de la page courante et la revendique", () => {
    withHelp(<PageHeader title="Baux" />);
    expect(screen.getByRole('button', { name: /Aide/ })).toHaveAttribute('data-help-id', 'locatif.baux.liste');
    expect(claimPageHelp).toHaveBeenCalledTimes(1);
  });

  it('libère la revendication au démontage', () => {
    const { unmount } = withHelp(<PageHeader title="Baux" />);
    unmount();
    expect(claimRelease).toHaveBeenCalledTimes(1);
  });

  it('préfère son propre helpId', () => {
    withHelp(<PageHeader title="Baux" helpId="locatif.baux.detail" />);
    expect(screen.getByRole('button', { name: /Aide/ })).toHaveAttribute('data-help-id', 'locatif.baux.detail');
  });

  it("ne revendique pas la fiche de page quand son helpId n'est pas celui de la route", () => {
    withHelp(<PageHeader title="Baux" helpId="locatif.baux.detail" />);
    expect(claimPageHelp).not.toHaveBeenCalled();
  });

  it('revendique la fiche de page quand son helpId est celui de la route', () => {
    withHelp(<PageHeader title="Baux" helpId="locatif.baux.liste" />);
    expect(claimPageHelp).toHaveBeenCalledTimes(1);
  });

  it("n'affiche rien et ne revendique rien hors provider", () => {
    render(<PageHeader title="Baux" helpId="locatif.baux.detail" />);
    expect(screen.queryByRole('button', { name: /Aide/ })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Baux' })).toBeInTheDocument();
    expect(claimPageHelp).not.toHaveBeenCalled();
  });

  it('ne revendique rien sans fiche de page', () => {
    withHelp(<PageHeader title="Baux" />, provider({ pageHelpId: null }));
    expect(screen.queryByRole('button', { name: /Aide/ })).toBeNull();
    expect(claimPageHelp).not.toHaveBeenCalled();
  });
});

describe('Table et aide', () => {
  it("affiche le « ? », l'infobulle de colonne, et laisse l'export aux titres d'origine", async () => {
    withHelp(<Table<Bail> helpId="locatif.baux.liste.tableau" columns={COLUMNS} dataSource={ROWS} rowKey="id" />);
    expect(screen.getByRole('button', { name: /Aide/ })).toBeInTheDocument();
    const icons = screen.getAllByRole('img', { name: 'Loyer mensuel hors charges' });
    expect(icons).toHaveLength(1);
    expect(icons[0]).toHaveAttribute('tabindex', '0');
    expect(screen.queryAllByRole('img', { name: /Référence/ })).toHaveLength(0);

    await userEvent.hover(icons[0]);
    expect(await screen.findByText('Loyer mensuel hors charges')).toBeInTheDocument();

    const exported = exportColumns.last as ColumnsType<Bail>;
    expect(exported.map(c => c.title)).toEqual(['Référence', 'Loyer']);
  });

  it('range le « ? » dans le slot de la recherche', () => {
    withHelp(
      <Table<Bail>
        helpId="locatif.baux.liste.tableau"
        columns={COLUMNS}
        dataSource={ROWS}
        rowKey="id"
        search={binding()}
      />
    );
    expect(screen.getByRole('button', { name: /Aide/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Exporter' })).toBeInTheDocument();
  });

  it('affiche le « ? » même sans export', () => {
    withHelp(<Table<Bail> helpId="x.y" columns={COLUMNS} dataSource={ROWS} rowKey="id" exportable={false} />);
    expect(screen.getByRole('button', { name: /Aide/ })).toBeInTheDocument();
  });

  it('sans helpId ou hors provider : aucun « ? », colonnes intactes', () => {
    const { unmount } = withHelp(<Table<Bail> columns={COLUMNS} dataSource={ROWS} rowKey="id" />);
    expect(screen.queryByRole('button', { name: /Aide/ })).toBeNull();
    expect(screen.queryAllByRole('img', { name: 'Loyer mensuel hors charges' })).toHaveLength(0);
    unmount();
    render(<Table<Bail> helpId="x.y" columns={COLUMNS} dataSource={ROWS} rowKey="id" />);
    expect(screen.queryByRole('button', { name: /Aide/ })).toBeNull();
    expect(screen.queryAllByRole('img', { name: 'Loyer mensuel hors charges' })).toHaveLength(0);
  });
});

describe('DataView et aide', () => {
  const view = (extra: { search?: ListSearchBinding; helpId?: string } = {}) => (
    <DataView<Bail>
      items={ROWS}
      total={1}
      page={1}
      pageSize={20}
      onPageChange={vi.fn()}
      columns={COLUMNS}
      renderCard={b => <div>{b.ref}</div>}
      rowKey={b => b.id}
      aria-label="Baux"
      {...extra}
    />
  );

  it('sans search : « ? », infobulle de colonne, export aux titres d’origine', () => {
    withHelp(view({ helpId: 'locatif.baux.liste.tableau' }));
    expect(screen.getByRole('button', { name: /Aide/ })).toBeInTheDocument();
    expect(screen.getAllByRole('img', { name: 'Loyer mensuel hors charges' })).toHaveLength(1);
    expect((exportColumns.last as ColumnsType<Bail>).map(c => c.title)).toEqual(['Référence', 'Loyer']);
  });

  it('avec search : « ? » dans la barre, aussi à vide', () => {
    const { rerender } = withHelp(view({ helpId: 'locatif.baux.liste.tableau', search: binding() }));
    expect(screen.getByRole('button', { name: /Aide/ })).toBeInTheDocument();
    rerender(
      <HelpContext.Provider value={provider()}>
        <DataView<Bail>
          items={[]}
          total={0}
          page={1}
          pageSize={20}
          onPageChange={vi.fn()}
          columns={COLUMNS}
          renderCard={b => <div>{b.ref}</div>}
          rowKey={b => b.id}
          aria-label="Baux"
          helpId="locatif.baux.liste.tableau"
          search={binding()}
        />
      </HelpContext.Provider>
    );
    expect(screen.getByRole('button', { name: /Aide/ })).toBeInTheDocument();
  });

  it('sans helpId ou hors provider : rien', () => {
    withHelp(view());
    expect(screen.queryByRole('button', { name: /Aide/ })).toBeNull();
  });
});

describe('DataCard et StatCard', () => {
  it('le « ? » de DataCard n’ouvre pas la carte (clic et clavier)', () => {
    const onOpen = vi.fn();
    withHelp(<DataCard title="Bail B-1" onOpen={onOpen} helpId="locatif.baux.liste" />);
    const help = screen.getByRole('button', { name: /Aide/ });
    fireEvent.click(help);
    fireEvent.keyDown(help, { key: 'Enter' });
    fireEvent.keyDown(help, { key: ' ' });
    expect(openHelp).toHaveBeenCalledWith('locatif.baux.liste');
    expect(onOpen).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Bail B-1'));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('le « ? » de StatCard ne déclenche pas onClick', () => {
    const onClick = vi.fn();
    withHelp(<StatCard label="Impayés" value="3" onClick={onClick} helpId="locatif.baux.liste" />);
    const help = screen.getByRole('button', { name: /Aide/ });
    fireEvent.click(help);
    fireEvent.keyDown(help, { key: 'Enter' });
    expect(onClick).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Impayés'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('sans helpId ou hors provider : aucun « ? »', () => {
    render(<DataCard title="Bail" helpId="x.y" />);
    render(<StatCard label="Impayés" value="3" helpId="x.y" />);
    expect(screen.queryByRole('button', { name: /Aide/ })).toBeNull();
  });
});

describe('withColumnHelp', () => {
  const help = [
    { key: 'loyer', label: 'Loyer', description: 'D-loyer' },
    { key: 'adresse.ville', label: 'Ville', description: 'D-ville' },
    { key: 'total', label: 'Total', description: 'D-total' },
    { key: 'sous', label: 'Sous', description: 'D-sous' }
  ];

  it('renvoie les colonnes telles quelles sans aide', () => {
    expect(withColumnHelp(COLUMNS, undefined)).toBe(COLUMNS);
    expect(withColumnHelp(COLUMNS, [])).toBe(COLUMNS);
    expect(withColumnHelp(undefined, help)).toBeUndefined();
  });

  it('gère key, dataIndex tableau, imbrication, titre fonction et titre absent', () => {
    const columns: ColumnsType<Record<string, unknown>> = [
      { title: 'Loyer', key: 'loyer' },
      { title: 'Ville', dataIndex: ['adresse', 'ville'] },
      { title: () => <b>Fn</b>, dataIndex: 'total' },
      { key: 'sous' },
      { title: 'Groupe', children: [{ title: 'Interne', dataIndex: 'loyer', sorter: true }] },
      { title: 'Autre', dataIndex: 'autre' }
    ];
    const result = withColumnHelp(columns, help) as ColumnsType<Record<string, unknown>>;
    render(
      <div>
        {result.map((c, i) => (
          <div key={i} data-testid={`c${i}`}>
            {typeof c.title === 'function' ? c.title({} as never) : (c.title as React.ReactNode)}
            {'children' in c &&
              c.children.map((ch, j) => (
                <div key={j} data-testid={`c${i}-${j}`}>
                  {ch.title as React.ReactNode}
                </div>
              ))}
          </div>
        ))}
      </div>
    );
    expect(screen.getByTestId('c0').querySelector('[aria-label="D-loyer"]')).not.toBeNull();
    expect(screen.getByTestId('c1').querySelector('[aria-label="D-ville"]')).not.toBeNull();
    expect(screen.getByTestId('c2').querySelector('[aria-label="D-total"]')).not.toBeNull();
    expect(screen.getByTestId('c2').textContent).toContain('Fn');
    expect(result[3].title).toBeUndefined();
    expect(screen.getByTestId('c4-0').querySelector('[aria-label="D-loyer"]')).not.toBeNull();
    expect(screen.getByTestId('c5').querySelector('[role="img"]')).toBeNull();
    // le tri et les autres propriétés survivent
    expect((result[4] as { children: Array<{ sorter?: unknown }> }).children[0].sorter).toBe(true);
  });
});
