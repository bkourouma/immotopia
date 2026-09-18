import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import { formatMoney } from '../primitives';
import type { DashboardBucket, DashboardSeriesPoint } from '../../services/dashboard-service';
import { SERIES, bucketLabel, compactAmount, monthLabel, monthLabelLong } from './dashboard-viz';

/**
 * Les trois formes de graphique du tableau de bord.
 *
 * Une par question, pas une par envie :
 *
 * - **La courbe** répond à « comment ça évolue » — encaissé contre attendu, sur
 *   douze mois, sur UN seul axe. Deux échelles superposées inventeraient une
 *   corrélation que la donnée ne porte pas ; ici les deux séries sont des FCFA.
 * - **Le camembert** répond à « comment ça se répartit », et seulement quand il
 *   y a un tout à partager. Six parts au maximum, le reste en « Autres ».
 * - **La barre horizontale** répond à « lequel pèse le plus ». Elle porte le
 *   nom de la catégorie en toutes lettres à gauche : la couleur ne distingue
 *   jamais seule, ce qui rend l'entonnoir et les statuts lisibles en vision
 *   déficiente comme à l'impression en noir et blanc.
 *
 * Aucune de ces formes n'est décorative : cliquer une tranche ou une barre
 * ouvre la liste filtrée correspondante, et la légende de `<ChartCard>` offre
 * le même chemin au clavier.
 */

const AXIS = { fill: 'var(--text-tertiary)', fontSize: 12 } as const;
const GRID_COLOR = 'var(--border-subtle)';

/** Infobulle commune : un titre, des lignes `pastille · libellé · valeur`. */
const InfoBulle: React.FC<{
  titre: React.ReactNode;
  lignes: Array<{ label: string; value: string; color: string }>;
}> = ({ titre, lignes }) => (
  <div
    style={{
      background: 'var(--surface-card)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius-md, 8px)',
      boxShadow: '0 4px 12px rgb(15 23 42 / 12%)',
      padding: 'var(--space-3)',
      fontSize: 'var(--font-size-sm)'
    }}
  >
    <div style={{ fontWeight: 600, marginBottom: 4, color: 'var(--text-primary)' }}>{titre}</div>
    {lignes.map(ligne => (
      <div key={ligne.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span
          aria-hidden="true"
          style={{ width: 8, height: 8, borderRadius: 2, background: ligne.color, flexShrink: 0 }}
        />
        <span style={{ color: 'var(--text-secondary)' }}>{ligne.label}</span>
        <span style={{ marginLeft: 'auto', color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
          {ligne.value}
        </span>
      </div>
    ))}
  </div>
);

export interface TrendChartProps {
  data: DashboardSeriesPoint[];
  currency: string;
  /** Écran qui détient le détail d'un mois. Le clic sur le tracé y mène. */
  href?: string;
}

/** Trésorerie sur douze mois : encaissé (aire) contre attendu (ligne). */
export const TrendChart: React.FC<TrendChartProps> = ({ data, currency, href }) => {
  const navigate = useNavigate();

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart
        data={data}
        margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
        onClick={href ? () => navigate(href) : undefined}
        style={href ? { cursor: 'pointer' } : undefined}
      >
        <defs>
          {/* L'aire est un lavis à 10 %, jamais un aplat : c'est la ligne qui
              porte la valeur, le remplissage ne fait que la situer. */}
          <linearGradient id="gradient-encaisse" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={SERIES.encaisse} stopOpacity={0.22} />
            <stop offset="100%" stopColor={SERIES.encaisse} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        {/* Grille horizontale seule, en trait plein : des pointillés se
            liraient comme une projection. */}
        <CartesianGrid vertical={false} stroke={GRID_COLOR} />
        <XAxis
          dataKey="month"
          tickFormatter={monthLabel}
          tick={AXIS}
          tickLine={false}
          axisLine={{ stroke: GRID_COLOR }}
          minTickGap={12}
        />
        <YAxis tickFormatter={compactAmount} tick={AXIS} tickLine={false} axisLine={false} width={56} />
        <Tooltip
          cursor={{ stroke: GRID_COLOR }}
          content={({ active, payload, label }: any) =>
            active && payload?.length ? (
              <InfoBulle
                titre={monthLabelLong(String(label))}
                lignes={[
                  {
                    label: 'Encaissé',
                    value: formatMoney(payload[0]?.payload?.encaisse, { currency }),
                    color: SERIES.encaisse
                  },
                  {
                    label: 'Attendu',
                    value: formatMoney(payload[0]?.payload?.attendu, { currency }),
                    color: SERIES.attendu
                  }
                ]}
              />
            ) : null
          }
        />
        <Area
          type="monotone"
          dataKey="encaisse"
          name="Encaissé"
          stroke={SERIES.encaisse}
          strokeWidth={2}
          fill="url(#gradient-encaisse)"
          activeDot={{ r: 5, strokeWidth: 2, stroke: 'var(--surface-card)' }}
        />
        <Line
          type="monotone"
          dataKey="attendu"
          name="Attendu"
          stroke={SERIES.attendu}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 5, strokeWidth: 2, stroke: 'var(--surface-card)' }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
};

export interface DonutChartProps {
  slices: Array<{ key: string; count: number; amount?: number; href?: string }>;
  colorOf: (key: string, index: number) => string;
  /** Chiffre au centre : le tout dont les tranches sont les parts. */
  total: React.ReactNode;
  totalLabel: string;
  /** Rend l'infobulle en montant plutôt qu'en nombre. */
  currency?: string;
}

/** Répartition part-à-tout. Six tranches au maximum, total au centre. */
export const DonutChart: React.FC<DonutChartProps> = ({ slices, colorOf, total, totalLabel, currency }) => {
  const navigate = useNavigate();

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Tooltip
            content={({ active, payload }: any) => {
              if (!active || !payload?.length) return null;
              const tranche = payload[0].payload;
              return (
                <InfoBulle
                  titre={bucketLabel(tranche.key)}
                  lignes={[
                    {
                      label: currency ? 'Montant' : 'Nombre',
                      value: currency ? formatMoney(tranche.amount ?? 0, { currency }) : String(tranche.count),
                      color: payload[0].color ?? 'var(--color-primary)'
                    }
                  ]}
                />
              );
            }}
          />
          <Pie
            data={slices}
            dataKey="count"
            nameKey="key"
            innerRadius="58%"
            outerRadius="82%"
            // Deux pixels de surface entre les tranches : c'est le vide qui
            // sépare, pas un contour ajouté autour de chaque part.
            paddingAngle={2}
            stroke="var(--surface-card)"
            strokeWidth={2}
            isAnimationActive={false}
            onClick={(tranche: any) => {
              const href = tranche?.payload?.href ?? tranche?.href;
              if (href) navigate(href);
            }}
          >
            {slices.map((tranche, index) => (
              <Cell
                key={tranche.key}
                fill={colorOf(tranche.key, index)}
                cursor={tranche.href ? 'pointer' : undefined}
              />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>

      {/* Le total au centre du trou : la question posée par un camembert est
          toujours « sur combien ? ». Posé en HTML plutôt qu'en SVG — il hérite
          des tokens de texte, et ne capte pas le survol des tranches. */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none',
          textAlign: 'center'
        }}
      >
        <strong style={{ fontSize: 'var(--font-size-h3)', color: 'var(--text-primary)' }}>{total}</strong>
        <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-tertiary)' }}>{totalLabel}</span>
      </div>
    </div>
  );
};

export interface BarBreakdownProps {
  items: DashboardBucket[];
  colorOf: (key: string, index: number) => string;
  /** Ce que la longueur de barre représente. */
  metric?: 'count' | 'amount';
  currency?: string;
  /** Texte posé au bout de la barre. Par défaut, la valeur mesurée. */
  tipOf?: (bucket: DashboardBucket) => string;
  /** Largeur réservée aux noms de catégorie, à gauche. */
  labelWidth?: number;
}

/**
 * Barres horizontales — le classement, l'entonnoir, la pyramide.
 *
 * Horizontales et non verticales : les libellés métier sont longs
 * (« Duplex / Triplex », « Mobile Money »), et en colonnes ils basculeraient à
 * 45° ou seraient tronqués. À l'horizontale ils se lisent normalement, et la
 * barre la plus longue reste immédiatement identifiable.
 */
export const BarBreakdown: React.FC<BarBreakdownProps> = ({
  items,
  colorOf,
  metric = 'count',
  currency,
  tipOf,
  labelWidth = 118
}) => {
  const navigate = useNavigate();

  const data = items.map(bucket => ({
    ...bucket,
    label: bucketLabel(bucket.key),
    value: metric === 'amount' ? (bucket.amount ?? 0) : bucket.count,
    tip: tipOf ? tipOf(bucket) : metric === 'amount' ? compactAmount(bucket.amount ?? 0) : String(bucket.count)
  }));

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        data={data}
        layout="vertical"
        // La marge droite réserve la place du libellé de bout de barre : sans
        // elle, le chiffre serait rogné par le bord du tracé.
        margin={{ top: 4, right: 52, left: 0, bottom: 4 }}
        barCategoryGap="22%"
      >
        <CartesianGrid horizontal={false} stroke={GRID_COLOR} />
        <XAxis type="number" hide />
        <YAxis type="category" dataKey="label" tick={AXIS} tickLine={false} axisLine={false} width={labelWidth} />
        <Tooltip
          cursor={{ fill: 'var(--surface-sunken)' }}
          content={({ active, payload }: any) => {
            if (!active || !payload?.length) return null;
            const bucket = payload[0].payload;
            return (
              <InfoBulle
                titre={bucket.label}
                lignes={[
                  { label: 'Nombre', value: String(bucket.count), color: payload[0].color },
                  ...(bucket.amount !== undefined
                    ? [
                        {
                          label: 'Montant',
                          value: formatMoney(bucket.amount, { currency: currency ?? 'FCFA' }),
                          color: payload[0].color
                        }
                      ]
                    : [])
                ]}
              />
            );
          }}
        />
        <Bar
          dataKey="value"
          // Barres fines : la donnée est ce qui doit être lu, pas l'aplat.
          barSize={16}
          radius={[0, 4, 4, 0]}
          isAnimationActive={false}
          onClick={(barre: any) => {
            const href = barre?.payload?.href ?? barre?.href;
            if (href) navigate(href);
          }}
        >
          {data.map((bucket, index) => (
            <Cell key={bucket.key} fill={colorOf(bucket.key, index)} cursor={bucket.href ? 'pointer' : undefined} />
          ))}
          {/* Le chiffre au bout de la barre, en couleur de texte : une teinte
              de série claire serait illisible sur le fond de la carte. */}
          <LabelList
            dataKey="tip"
            position="right"
            style={{ fill: 'var(--text-secondary)', fontSize: 12, fontVariantNumeric: 'tabular-nums' }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
};
