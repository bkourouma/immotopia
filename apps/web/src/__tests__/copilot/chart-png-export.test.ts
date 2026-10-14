import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../utils/save-blob', () => ({ saveBlob: vi.fn(), filenameFromDisposition: vi.fn() }));

import { downloadChartPng, findChartSvg } from '../../utils/copilot-artifact-export';
import { saveBlob } from '../../utils/save-blob';

const NS = 'http://www.w3.org/2000/svg';

/** Conteneur imitant recharts : le graphe, puis la légende dont les icônes sont aussi des `recharts-surface`. */
function buildChart(): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = `
    <div class="recharts-wrapper">
      <svg class="recharts-surface" id="graph" width="600" height="320"><text class="axis">Janvier</text></svg>
      <div class="recharts-legend-wrapper">
        <ul>
          <li class="recharts-legend-item"><svg class="recharts-surface" id="icon" width="14" height="14"><path fill="#fff" d="M0"/><path stroke="#1d4ed8" fill="none" d="M1"/></svg><span>Encaissé</span></li>
        </ul>
      </div>
    </div>`;
  document.body.appendChild(root);
  const rects: Record<string, [number, number]> = { graph: [600, 320], icon: [14, 14] };
  root.querySelectorAll('svg').forEach(svg => {
    const [w, h] = rects[svg.id];
    svg.getBoundingClientRect = () => ({
      width: w,
      height: h,
      left: 0,
      top: 0,
      right: w,
      bottom: h,
      x: 0,
      y: 0,
      toJSON: () => ({})
    });
  });
  return root;
}

describe('findChartSvg', () => {
  afterEach(() => (document.body.innerHTML = ''));

  it('cible le graphe, pas la première icône de légende', () => {
    const root = buildChart();
    // Icône placée AVANT le graphe : l'ancien `querySelector` la prenait.
    root.prepend(root.querySelector('.recharts-legend-item')!.cloneNode(true));
    expect(findChartSvg(root)?.id).toBe('graph');
  });

  it('à défaut de wrapper, prend le plus grand svg', () => {
    const root = document.createElement('div');
    root.innerHTML =
      '<svg class="recharts-surface" id="s" width="10" height="10"></svg><svg class="recharts-surface" id="l" width="500" height="300"></svg>';
    expect(findChartSvg(root)?.id).toBe('l');
  });

  it('renvoie null sans graphe', () => {
    expect(findChartSvg(null)).toBeNull();
    expect(findChartSvg(document.createElement('div'))).toBeNull();
  });
});

describe('downloadChartPng', () => {
  let serialized: SVGSVGElement[];
  let canvasSize: { width: number; height: number };
  let fills: string[];
  const ctx = {
    fillStyle: '',
    font: '',
    textBaseline: '',
    fillRect: vi.fn(function (this: { fillStyle: string }) {
      fills.push(this.fillStyle);
    }),
    drawImage: vi.fn(),
    fillText: vi.fn(),
    measureText: () => ({ width: 40 })
  };

  beforeEach(() => {
    serialized = [];
    fills = [];
    vi.mocked(saveBlob).mockClear();
    vi.spyOn(XMLSerializer.prototype, 'serializeToString').mockImplementation(node => {
      serialized.push(node as SVGSVGElement);
      return '<svg/>';
    });
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    class FakeImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_v: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
    vi.stubGlobal('Image', FakeImage);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (this: HTMLCanvasElement, cb) {
      canvasSize = { width: this.width, height: this.height };
      cb(new Blob(['png'], { type: 'image/png' }));
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('exporte le SVG du graphe, à 2× sa taille affichée, sur fond opaque', async () => {
    const root = buildChart();
    await downloadChartPng(root, 'Loyers par mois');

    expect(serialized).toHaveLength(1);
    expect(serialized[0].getAttribute('width')).toBe('600');
    expect(serialized[0].getAttribute('height')).toBe('320');
    expect(serialized[0].querySelector('text')).not.toBeNull();
    // Largeur 2×, hauteur 2× (graphe + bande de légende).
    expect(canvasSize.width).toBe(1200);
    expect(canvasSize.height).toBeGreaterThanOrEqual(640);
    // Premier aplat = fond ; jamais transparent.
    expect(fills[0]).not.toBe('');
    expect(fills[0]).not.toMatch(/transparent|rgba\(0,\s*0,\s*0,\s*0\)/);
    expect(saveBlob).toHaveBeenCalledTimes(1);
    expect(vi.mocked(saveBlob).mock.calls[0][1]).toBe('Loyers-par-mois.png');
  });

  it('redessine la légende avec la couleur de la série, pas le blanc du dessin', async () => {
    const root = buildChart();
    await downloadChartPng(root, 'Graph');
    expect(fills).toContain('#1d4ed8');
    expect(ctx.fillText).toHaveBeenCalledWith('Encaissé', expect.any(Number), expect.any(Number));
  });

  it('lève une erreur typée sans graphe', async () => {
    await expect(downloadChartPng(document.createElement('div'), 'x')).rejects.toThrow('chart-svg-missing');
    await expect(downloadChartPng(null, 'x')).rejects.toThrow('chart-svg-missing');
  });
});
