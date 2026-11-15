import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageContext, LanguageProvider } from '../../i18n/LanguageProvider';
import { useLanguage } from '../../i18n/useLanguage';
import type { CopilotArtifact } from '../../types/copilot';

vi.mock('recharts', () => {
  const box = (name: string) => {
    const Stub = (props: { children?: React.ReactNode; reversed?: boolean; orientation?: string }) => (
      <div data-testid={`rc-${name}`} data-reversed={props.reversed} data-orientation={props.orientation}>
        {props.children}
      </div>
    );
    Stub.displayName = `Stub(${name})`;
    return Stub;
  };
  return {
    ResponsiveContainer: box('container'),
    BarChart: box('bar-chart'),
    LineChart: box('line-chart'),
    PieChart: box('pie-chart'),
    Pie: box('pie'),
    Bar: box('bar'),
    Line: box('line'),
    Cell: box('cell'),
    XAxis: box('x'),
    YAxis: box('y'),
    CartesianGrid: box('grid'),
    Tooltip: box('tooltip'),
    Legend: box('legend')
  };
});

const rows: unknown[][] = [];
vi.mock('exceljs', () => {
  class Workbook {
    addWorksheet() {
      return {
        addRow: (r: unknown[]) => rows.push(r),
        getRow: () => ({ font: {} }),
        getColumn: () => ({ width: 0 })
      };
    }
    xlsx = { writeBuffer: async () => new ArrayBuffer(8) };
  }
  return { default: { Workbook }, Workbook };
});

vi.mock('../../utils/save-blob', () => ({ saveBlob: vi.fn(), filenameFromDisposition: vi.fn() }));
vi.mock('../../lib/feedback', () => ({ feedback: { error: vi.fn(), warning: vi.fn() } }));

import { saveBlob } from '../../utils/save-blob';
import { ArtifactPanel } from '../../components/copilot/artifact/ArtifactPanel';

const save = vi.mocked(saveBlob);

const table: CopilotArtifact = {
  kind: 'table',
  id: 't1',
  title: 'Loyers mars',
  columns: [
    { key: 'name', label: 'Locataire' },
    { key: 'amount', label: 'Montant', type: 'currency' },
    { key: 'due', label: 'Échéance', type: 'date' }
  ],
  rows: [
    { name: 'Zoé', amount: 1500.5, due: '2026-03-05' },
    { name: '=HYPERLINK("x")', amount: 200, due: '2026-03-01' },
    { name: 'Adam', amount: null, due: null }
  ],
  truncated: true
};
const markdown: CopilotArtifact = {
  kind: 'markdown',
  id: 'm1',
  title: 'Synthèse',
  content: '**Gras** <script>alert(1)</script>'
};
const chart: CopilotArtifact = {
  kind: 'chart',
  id: 'c1',
  title: 'Revenus',
  chartType: 'bar',
  xKey: 'mois',
  series: [{ key: 'v', label: 'Valeur' }],
  data: [
    { mois: 'Jan', v: 10 },
    { mois: 'Fév', v: 20 }
  ]
};

it('rend le total du tableau croisé dans le pied du tableau', () => {
  renderPanel([{ ...table, truncated: false, totals: { name: 'Total', amount: 1700.5 } }], table.id);
  const footer = screen.getByText('Total').closest('tfoot');
  expect(footer).toBeInTheDocument();
  expect(footer).toHaveTextContent(/1.?700,50/);
});

function renderPanel(
  artifacts: CopilotArtifact[],
  selectedId?: string,
  extra: Partial<React.ComponentProps<typeof ArtifactPanel>> = {}
) {
  const onSelect = vi.fn();
  const onClose = vi.fn();
  render(
    <LanguageProvider>
      <ArtifactPanel artifacts={artifacts} selectedId={selectedId} onSelect={onSelect} onClose={onClose} {...extra} />
    </LanguageProvider>
  );
  return { onSelect, onClose };
}

async function blobText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsText(blob);
  });
}

async function blobBytes(blob: Blob, n: number): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer).slice(0, n));
    reader.onerror = reject;
    reader.readAsArrayBuffer(blob);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  rows.length = 0;
});

describe('ArtifactPanel — rendus', () => {
  it('rend un tableau formaté, trié, avec la mention tronqué', () => {
    renderPanel([table]);
    expect(screen.getByRole('heading', { name: 'Loyers mars' })).toBeInTheDocument();
    expect(screen.getByText('05/03/2026')).toBeInTheDocument();
    expect(screen.getByText(/1\D?500[,.]5/)).toBeInTheDocument();
    expect(screen.getByText(/Résultat tronqué/)).toBeInTheDocument();
    // La cellule hostile est du texte, jamais une formule ni du HTML.
    expect(screen.getByText('=HYPERLINK("x")')).toBeInTheDocument();

    const firstBodyRow = () => document.querySelector('tbody tr:not([aria-hidden])')?.textContent ?? '';
    const header = screen.getAllByRole('columnheader', { name: /Locataire/ })[0];
    fireEvent.click(header); // croissant : « = » avant « Adam » avant « Zoé »
    expect(firstBodyRow()).toContain('=HYPERLINK');
    fireEvent.click(header); // décroissant
    expect(firstBodyRow()).toContain('Zoé');
  });

  it('rend le texte sans HTML brut', () => {
    const { container } = render(
      <LanguageProvider>
        <ArtifactPanel artifacts={[markdown]} onSelect={vi.fn()} onClose={vi.fn()} />
      </LanguageProvider>
    );
    expect(screen.getByText('Gras').tagName).toBe('STRONG');
    expect(container.querySelector('script')).toBeNull();
    expect(container.textContent).toContain('<script>');
  });

  it('rend un graphique accessible avec tableau de données de repli', async () => {
    renderPanel([chart]);
    const img = await screen.findByRole('img', { name: /Graphique : Revenus/ });
    expect(img).toBeInTheDocument();
    expect(screen.getByTestId('rc-bar-chart')).toBeInTheDocument();
    expect(screen.getByText('Afficher les données du graphique')).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Revenus' })).toBeInTheDocument();
    expect(screen.getByText('Fév')).toBeInTheDocument();
  });

  it('inverse les catégories et place l’axe des valeurs à droite en arabe', async () => {
    function ArabicPanel() {
      const locale = useLanguage();
      return (
        <LanguageContext.Provider value={{ ...locale, language: 'ar', direction: 'rtl', rtl: true }}>
          <ArtifactPanel artifacts={[chart]} onSelect={vi.fn()} onClose={vi.fn()} />
        </LanguageContext.Provider>
      );
    }
    render(
      <LanguageProvider>
        <ArabicPanel />
      </LanguageProvider>
    );
    expect(await screen.findByTestId('artifact-chart')).toHaveAttribute('dir', 'rtl');
    expect(screen.getByTestId('rc-x')).toHaveAttribute('data-reversed', 'true');
    expect(screen.getByTestId('rc-y')).toHaveAttribute('data-orientation', 'right');
  });

  it('propose un sélecteur quand il y a plusieurs artefacts et ferme le panneau', () => {
    const { onClose } = renderPanel([table, markdown], 'm1');
    expect(screen.getByLabelText('Résultat affiché')).toBeInTheDocument();
    expect(screen.getByText('Gras')).toBeInTheDocument(); // l'artefact sélectionné, pas le dernier ni le premier
    fireEvent.click(screen.getByRole('button', { name: 'Fermer le panneau' }));
    expect(onClose).toHaveBeenCalled();
  });
});

describe('ArtifactPanel — rapports et indicateurs', () => {
  it('affiche la valeur de référence et une variation de même devise', () => {
    renderPanel([
      {
        kind: 'indicators',
        id: 'i1',
        title: 'Encaissements',
        cards: [
          { label: 'Montant', currency: 'XOF', value: 150, comparison: { label: 'Septembre', value: 100, change: 50 } }
        ]
      }
    ]);
    expect(screen.getByText('150 XOF')).toBeInTheDocument();
    expect(screen.getByText('100 XOF')).toBeInTheDocument();
    expect(screen.getByText(/^\+50/)).toBeInTheDocument();
  });

  it('affiche un tableau source dans un rapport et le conserve dans le Markdown téléchargé', async () => {
    renderPanel([
      {
        kind: 'document',
        id: 'd1',
        title: 'Bilan de mars',
        blocks: [
          { kind: 'text', content: '## Recettes' },
          { kind: 'table', table }
        ]
      }
    ]);
    expect(screen.getByRole('article', { name: 'Bilan de mars' })).toBeInTheDocument();
    expect(screen.getByText('Zoé')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Télécharger' }));
    expect(save).toHaveBeenCalledWith(expect.any(Blob), 'Bilan-de-mars.md');
    await expect(blobText(save.mock.calls[0][0])).resolves.toContain('Zoé');
  });
});

describe('ArtifactPanel — recalcul', () => {
  it('édite uniquement les sections de texte et garde le tableau lié', async () => {
    const artifact = {
      kind: 'document' as const,
      id: 'd1',
      title: 'Bilan',
      blocks: [
        { kind: 'text' as const, content: 'Introduction.' },
        { kind: 'table' as const, table },
        { kind: 'text' as const, content: 'Conclusion.' }
      ]
    };
    const onReadVersion = vi.fn().mockResolvedValue({
      artifact,
      version: 2,
      latest: 2,
      versions: [{ version: 2, createdAt: null }]
    });
    const onEditVersion = vi.fn().mockResolvedValue(undefined);
    const onRewriteSection = vi.fn().mockResolvedValue('Proposition concise.');
    renderPanel([artifact], undefined, { onReadVersion, onEditVersion, onRewriteSection });
    fireEvent.click(await screen.findByRole('button', { name: 'Modifier le texte' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Consigne de réécriture' }), {
      target: { value: 'Raccourcis.' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Réécrire la section 1' }));
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Section de texte 1' })).toHaveValue('Proposition concise.')
    );
    expect(onRewriteSection).toHaveBeenCalledWith('d1', {
      expectedVersion: 2,
      section: 0,
      text: 'Introduction.',
      instruction: 'Raccourcis.'
    });
    expect(onEditVersion).not.toHaveBeenCalled();

    const first = await screen.findByRole('textbox', { name: 'Section de texte 1' });
    fireEvent.change(first, { target: { value: 'Introduction corrigée.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() =>
      expect(onEditVersion).toHaveBeenCalledWith('d1', {
        expectedVersion: 2,
        textSections: ['Introduction corrigée.', 'Conclusion.']
      })
    );
    expect(screen.getByText('Zoé')).toBeInTheDocument();
  });

  it('crée une version nommée avec la révision affichée', async () => {
    const onReadVersion = vi.fn().mockResolvedValue({
      artifact: table,
      version: 2,
      latest: 2,
      versions: [
        { version: 2, createdAt: null },
        { version: 1, createdAt: null }
      ]
    });
    const onEditVersion = vi.fn().mockResolvedValue(undefined);
    renderPanel([table], undefined, { onReadVersion, onEditVersion });
    fireEvent.click(await screen.findByRole('button', { name: 'Renommer le résultat' }));
    fireEvent.change(await screen.findByRole('textbox', { name: 'Titre du résultat' }), {
      target: { value: 'Bilan locatif' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() =>
      expect(onEditVersion).toHaveBeenCalledWith('t1', { expectedVersion: 2, title: 'Bilan locatif' })
    );
  });
  it('télécharge la version affichée et transmet la version attendue au recalcul', async () => {
    const current = { ...table, canRefresh: true };
    const onReadVersion = vi.fn().mockResolvedValue({
      artifact: current,
      version: 2,
      latest: 2,
      versions: [
        { version: 2, createdAt: '2026-11-14T00:00:00.000Z' },
        { version: 1, createdAt: null }
      ]
    });
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    const onDownloadFile = vi.fn().mockResolvedValue(undefined);
    renderPanel([current], undefined, { onReadVersion, onRefresh, onDownloadFile });
    await screen.findByRole('combobox', { name: 'Version du résultat' });
    fireEvent.click(screen.getByRole('button', { name: 'Télécharger' }));
    fireEvent.click(await screen.findByText('CSV'));
    await waitFor(() => expect(onDownloadFile).toHaveBeenCalledWith('t1', 'csv', 2));
    fireEvent.click(screen.getByRole('button', { name: 'Recalculer' }));
    await waitFor(() => expect(onRefresh).toHaveBeenCalledWith('t1', 2));
  });
  it('recalcule un résultat enregistré et demande son export au serveur', async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    const onDownloadFile = vi.fn().mockResolvedValue(undefined);
    renderPanel([{ ...table, canRefresh: true }], undefined, { onRefresh, onDownloadFile });
    fireEvent.click(screen.getByRole('button', { name: 'Recalculer' }));
    await waitFor(() => expect(onRefresh).toHaveBeenCalledWith('t1'));
    fireEvent.click(screen.getByRole('button', { name: 'Télécharger' }));
    fireEvent.click(await screen.findByText('CSV'));
    await waitFor(() => expect(onDownloadFile).toHaveBeenCalledWith('t1', 'csv'));
    expect(save).not.toHaveBeenCalled();
  });
});

describe('ArtifactPanel — téléchargements', () => {
  it('télécharge un CSV UTF-8 avec BOM, « ; » en français et neutralise les formules', async () => {
    renderPanel([table]);
    fireEvent.click(screen.getByRole('button', { name: /Télécharger/ }));
    fireEvent.click(await screen.findByText('CSV'));
    await waitFor(() => expect(save).toHaveBeenCalled());
    const [blob, name] = save.mock.calls[0];
    expect(name).toBe('Loyers-mars.csv');
    const text = await blobText(blob);
    expect(Array.from(await blobBytes(blob, 3))).toEqual([0xef, 0xbb, 0xbf]);
    expect(text).toContain('Locataire;Montant;Échéance');
    expect(text).toContain('"\'=HYPERLINK(""x"")"');
    expect(text).toContain('Zoé;1500,5;2026-03-05');
  });

  it('télécharge un XLSX en neutralisant les formules', async () => {
    renderPanel([table]);
    fireEvent.click(screen.getByRole('button', { name: /Télécharger/ }));
    fireEvent.click(await screen.findByText('Excel (.xlsx)'));
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(save.mock.calls[0][1]).toBe('Loyers-mars.xlsx');
    expect(rows[0]).toEqual(['Locataire', 'Montant', 'Échéance']);
    expect(rows[2][0]).toBe(`'=HYPERLINK("x")`);
    expect(rows[3]).toEqual(['Adam', null, null]);
  });

  it('télécharge un texte en .md', async () => {
    renderPanel([markdown]);
    fireEvent.click(screen.getByRole('button', { name: /Télécharger/ }));
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(save.mock.calls[0][1]).toBe('Synthèse.md');
    expect(await blobText(save.mock.calls[0][0])).toBe(markdown.kind === 'markdown' ? markdown.content : '');
  });

  it('télécharge les données d’un graphique en CSV', async () => {
    renderPanel([chart]);
    fireEvent.click(await screen.findByRole('button', { name: /Télécharger/ }));
    fireEvent.click(await screen.findByText('Données (.csv)'));
    await waitFor(() => expect(save).toHaveBeenCalled());
    const text = await blobText(save.mock.calls[0][0]);
    expect(text).toContain('Mois;Valeur');
    expect(text).toContain('Jan;10');
  });
});

describe('ArtifactPanel — cellules du tableau', () => {
  const statuses: CopilotArtifact = {
    kind: 'table',
    id: 't2',
    title: 'Biens',
    columns: [
      { key: 'ref', label: 'Référence' },
      { key: 'status', label: 'Statut' },
      { key: 'rent', label: 'Loyer', type: 'currency' }
    ],
    rows: [
      { ref: '-5 Villa', status: 'AVAILABLE', rent: 90000.5 },
      { ref: 'AVAILABLE soon', status: 'RENTED', rent: 120000 }
    ]
  };

  it('traduit un statut exact, laisse les autres textes, isole chaque valeur avec <bdi>', () => {
    renderPanel([statuses]);
    expect(screen.getByText('Disponible')).toBeInTheDocument();
    expect(screen.getByText('Loué')).toBeInTheDocument();
    expect(screen.queryByText('AVAILABLE')).not.toBeInTheDocument();
    // Une phrase qui contient un code n'est pas traduite.
    expect(screen.getByText('AVAILABLE soon')).toBeInTheDocument();
    expect(screen.getByText('-5 Villa').tagName).toBe('BDI');
  });

  it('montants avec 0 ou 2 décimales', () => {
    renderPanel([statuses]);
    expect(screen.getByText(/^90\D?000,50$/)).toBeInTheDocument();
    expect(screen.getByText(/^120\D?000$/)).toBeInTheDocument();
  });

  it("l'infobulle de tri ne s'ouvre pas au survol d'un en-tête triable", async () => {
    renderPanel([statuses]);
    const header = screen.getAllByText('Loyer')[0].closest('th')!;
    for (const target of [header, header.firstElementChild!, header.querySelector('.ant-table-column-sorters')!]) {
      fireEvent.mouseEnter(target);
      fireEvent.mouseOver(target);
    }
    await new Promise(r => setTimeout(r, 400));
    expect(document.querySelector('.ant-tooltip')).toBeNull();
  });

  it("le repli du graphique porte un libellé lisible pour l'abscisse", () => {
    renderPanel([{ ...chart, id: 'c9', xKey: 'monthName' } as CopilotArtifact]);
    return waitFor(() => expect(screen.getByText('Month name')).toBeInTheDocument());
  });
});
