import type { LayerDrawCategory } from '../../state/model.js';
import { CATEGORY_STYLE } from '../hatches.js';

/**
 * Small animated diagrams for the guide.
 *
 * Every one is plain SVG plus CSS keyframes — no animation library, and nothing that
 * runs a timer in JavaScript. They loop, so a reader who arrives mid-cycle still sees
 * the whole thing, and they all stop dead under prefers-reduced-motion (see styles.css):
 * an explanation that only works if you can watch it move is not an explanation.
 *
 * They are deliberately schematic rather than screenshots of the app. A screenshot goes
 * stale the moment a control moves; a diagram of what the control *does* does not.
 */

const W = 320;
const H = 150;

interface Band {
  readonly category: LayerDrawCategory;
  /** Share of the drawing's width, 0..1. They should add up to 1. */
  readonly width: number;
  readonly label?: string;
}

/** The default wall used by most figures: board, block, insulation, brick. */
const WALL: readonly Band[] = [
  { category: 'plaster-and-render', width: 0.06, label: 'board' },
  { category: 'masonry', width: 0.3, label: 'block' },
  { category: 'insulation', width: 0.3, label: 'insulation' },
  { category: 'masonry', width: 0.34, label: 'brick' },
];

const PLOT = { x: 22, y: 16, w: W - 44, h: 96 };

function bandGeometry(bands: readonly Band[]): readonly { band: Band; x: number; w: number }[] {
  let cursor = PLOT.x;
  return bands.map((band) => {
    const w = band.width * PLOT.w;
    const geometry = { band, x: cursor, w };
    cursor += w;
    return geometry;
  });
}

/** The layer stack every other figure is drawn on top of. */
function Stack({
  bands = WALL,
  stagger = false,
  highlightIndex,
  dim = false,
}: {
  readonly bands?: readonly Band[];
  /** Reveal the layers one after another, inside to outside. */
  readonly stagger?: boolean;
  readonly highlightIndex?: number;
  readonly dim?: boolean;
}): JSX.Element {
  return (
    <g opacity={dim ? 0.45 : 1}>
      {bandGeometry(bands).map((geometry, index) => {
        const style = CATEGORY_STYLE[geometry.band.category];
        const faded = highlightIndex !== undefined && highlightIndex !== index;
        return (
          <g
            key={index}
            className={stagger ? 'g-reveal' : undefined}
            style={stagger ? ({ '--g-delay': `${index * 0.45}s` } as React.CSSProperties) : undefined}
            opacity={faded ? 0.35 : 1}
          >
            <rect x={geometry.x} y={PLOT.y} width={geometry.w} height={PLOT.h} fill={style.fill} />
            {style.hatch !== undefined && (
              <rect
                x={geometry.x}
                y={PLOT.y}
                width={geometry.w}
                height={PLOT.h}
                fill={`url(#${style.hatch})`}
              />
            )}
            <rect
              x={geometry.x}
              y={PLOT.y}
              width={geometry.w}
              height={PLOT.h}
              fill="none"
              stroke="var(--layer-edge)"
              strokeWidth={0.8}
            />
          </g>
        );
      })}
    </g>
  );
}

/** The two surface films, drawn at a fixed width because they have no thickness. */
function Films(): JSX.Element {
  return (
    <g className="g-film">
      <rect x={PLOT.x - 10} y={PLOT.y} width={10} height={PLOT.h} fill="url(#hatch-film)" />
      <rect x={PLOT.x + PLOT.w} y={PLOT.y} width={10} height={PLOT.h} fill="url(#hatch-film)" />
    </g>
  );
}

function Sides({ inside = 'inside', outside = 'outside' }: {
  readonly inside?: string;
  readonly outside?: string;
}): JSX.Element {
  return (
    <>
      {/* On the baseline, below the per-layer ticks, so the two never collide. */}
      <text x={PLOT.x - 10} y={H - 3} className="g-side">
        {inside}
      </text>
      <text x={PLOT.x + PLOT.w + 10} y={H - 3} className="g-side" textAnchor="end">
        {outside}
      </text>
    </>
  );
}

function Frame({ children, label }: { readonly children: React.ReactNode; readonly label: string }): JSX.Element {
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="guide-figure" role="img" aria-label={label}>
      {children}
    </svg>
  );
}

/* ------------------------------------------------------------------ figures --- */

/** Layers appearing one by one, to scale, inside on the left. */
export function LayersFigure({ highlightIndex }: { readonly highlightIndex?: number }): JSX.Element {
  return (
    <Frame label="Layers of a wall drawn to scale, appearing from the inside outwards">
      <Stack stagger highlightIndex={highlightIndex} />
      {bandGeometry(WALL).map((geometry, index) => (
        <text
          key={index}
          x={geometry.x + geometry.w / 2}
          y={PLOT.y + PLOT.h + 14}
          className="g-tick g-reveal"
          style={{ '--g-delay': `${index * 0.45 + 0.2}s` } as React.CSSProperties}
          textAnchor="middle"
        >
          {geometry.band.label}
        </text>
      ))}
      <Sides />
    </Frame>
  );
}

/** The still-air films clinging to each face. */
export function FilmsFigure(): JSX.Element {
  return (
    <Frame label="Thin films of still air on each face of the wall">
      <Stack dim />
      <g className="g-fade" style={{ '--g-delay': '0.3s' } as React.CSSProperties}>
        <rect x={PLOT.x - 10} y={PLOT.y} width={10} height={PLOT.h} fill="url(#hatch-film)" />
        <text x={PLOT.x - 5} y={PLOT.y - 4} className="g-tick" textAnchor="middle">
          Rsi
        </text>
      </g>
      <g className="g-fade" style={{ '--g-delay': '0.9s' } as React.CSSProperties}>
        <rect x={PLOT.x + PLOT.w} y={PLOT.y} width={10} height={PLOT.h} fill="url(#hatch-film)" />
        <text x={PLOT.x + PLOT.w + 5} y={PLOT.y - 4} className="g-tick" textAnchor="middle">
          Rse
        </text>
      </g>
      {/* Still air, drifting slowly: the reason the film insulates at all. */}
      {[0, 1, 2].map((index) => (
        <circle
          key={index}
          cx={PLOT.x - 5}
          cy={0}
          r={1.8}
          className="g-bubble"
          style={{ '--g-delay': `${1.2 + index * 0.8}s` } as React.CSSProperties}
        />
      ))}
      <Sides />
    </Frame>
  );
}

/** A layer lifted out and dropped into a new position, on a loop. */
export function DragFigure(): JSX.Element {
  const geometry = bandGeometry(WALL);
  const moving = geometry[2];
  const target = geometry[1];
  if (moving === undefined || target === undefined) {
    return <Frame label="Dragging a layer">{null}</Frame>;
  }
  const style = CATEGORY_STYLE.insulation;
  return (
    <Frame label="A layer being dragged to a new position in the build-up">
      <Stack dim />
      {/* The gap the layer leaves behind, and the slot it drops into. */}
      <rect
        x={target.x}
        y={PLOT.y}
        width={moving.w}
        height={PLOT.h}
        className="g-drop-slot"
        rx={2}
      />
      <g
        className="g-drag"
        style={
          { '--g-from': `${moving.x}px`, '--g-to': `${target.x}px` } as React.CSSProperties
        }
      >
        <rect x={0} y={PLOT.y} width={moving.w} height={PLOT.h} fill={style.fill} />
        <rect x={0} y={PLOT.y} width={moving.w} height={PLOT.h} fill={`url(#${style.hatch ?? ''})`} />
        <rect
          x={0}
          y={PLOT.y}
          width={moving.w}
          height={PLOT.h}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={1.6}
        />
      </g>
      <text x={W / 2} y={H - 18} className="g-caption" textAnchor="middle">
        drag a layer to move it
      </text>
    </Frame>
  );
}

/**
 * The temperature line drawing itself. The x positions are the layer boundaries and the
 * y positions are chosen so the drop through each layer is its share of the resistance —
 * the insulation takes most of it, the brick almost none.
 */
const TEMPERATURE_POINTS = [
  { x: PLOT.x - 10, y: 24 },
  { x: PLOT.x, y: 30 },
  { x: PLOT.x + 0.06 * PLOT.w, y: 34 },
  { x: PLOT.x + 0.36 * PLOT.w, y: 48 },
  { x: PLOT.x + 0.66 * PLOT.w, y: 100 },
  { x: PLOT.x + PLOT.w, y: 106 },
  { x: PLOT.x + PLOT.w + 10, y: 110 },
];

function temperaturePath(): string {
  return TEMPERATURE_POINTS.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ');
}

export function TemperatureFigure(): JSX.Element {
  return (
    <Frame label="The temperature line falling steeply through the insulation">
      <Stack dim />
      <Films />
      <polyline points={temperaturePath()} className="g-temp g-draw" />
      <text x={PLOT.x - 14} y={20} className="g-tick">
        20 °C
      </text>
      <text x={PLOT.x + PLOT.w + 14} y={H - 30} className="g-tick" textAnchor="end">
        0 °C
      </text>
      <Sides />
    </Frame>
  );
}

/** The dew-point band, with the line safely above it. */
export function DewPointFigure({ failing = false }: { readonly failing?: boolean }): JSX.Element {
  const points = failing
    ? TEMPERATURE_POINTS.map((point, index) => ({
        x: point.x,
        // Insulation on the inside: the drop happens early, so the line is already cold
        // by the time it reaches the block and dives into the band.
        y: index <= 1 ? point.y : Math.min(112, point.y + 42),
      }))
    : TEMPERATURE_POINTS;
  return (
    <Frame label={failing ? 'The temperature line dipping into the dew-point band' : 'The dew-point band below the temperature line'}>
      <Stack dim />
      <rect
        x={PLOT.x - 10}
        y={78}
        width={PLOT.w + 20}
        height={PLOT.y + PLOT.h - 78}
        className="g-dew-band g-fade"
      />
      <line x1={PLOT.x - 10} y1={78} x2={PLOT.x + PLOT.w + 10} y2={78} className="g-dew-line" />
      <polyline
        points={points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ')}
        className="g-temp g-draw"
      />
      {failing && <circle cx={PLOT.x + 0.36 * PLOT.w} cy={90} r={5} className="g-risk-dot" />}
      <text x={PLOT.x + PLOT.w + 8} y={74} className="g-tick" textAnchor="end">
        dew point
      </text>
      <Sides />
    </Frame>
  );
}

/** A bar filling towards a limit line: the U-value against Part L. */
export function GaugeFigure({
  value = 0.26,
  limit = 0.26,
  scaleMax = 0.6,
}: {
  readonly value?: number;
  readonly limit?: number;
  readonly scaleMax?: number;
}): JSX.Element {
  const barY = 54;
  const barH = 26;
  const limitX = PLOT.x + (limit / scaleMax) * PLOT.w;
  const valueW = (value / scaleMax) * PLOT.w;
  const passes = value <= limit;
  return (
    <Frame label="A U-value measured against the Approved Document L limiting value">
      <rect x={PLOT.x} y={barY} width={PLOT.w} height={barH} className="g-gauge-track" rx={4} />
      <rect
        x={PLOT.x}
        y={barY}
        width={valueW}
        height={barH}
        className={passes ? 'g-gauge-fill g-grow is-ok' : 'g-gauge-fill g-grow is-risk'}
        rx={4}
        style={{ '--g-width': `${valueW}px` } as React.CSSProperties}
      />
      <line x1={limitX} y1={barY - 10} x2={limitX} y2={barY + barH + 10} className="g-limit-line" />
      <text x={limitX} y={barY - 14} className="g-tick" textAnchor="middle">
        limit {limit.toFixed(2)}
      </text>
      <text x={PLOT.x} y={barY + barH + 22} className="g-caption">
        better ←
      </text>
      <text x={PLOT.x + PLOT.w} y={barY + barH + 22} className="g-caption" textAnchor="end">
        → worse
      </text>
      <text x={PLOT.x + 6} y={barY + 18} className="g-gauge-value">
        {value.toFixed(2)} W/(m²·K)
      </text>
    </Frame>
  );
}

/** Two layers of equal thickness taking unequal bites out of the temperature line. */
export function ResistanceFigure(): JSX.Element {
  const half = PLOT.w / 2;
  return (
    <Frame label="Two layers of the same thickness with very different resistances">
      <rect x={PLOT.x} y={PLOT.y} width={half} height={PLOT.h} fill={CATEGORY_STYLE.insulation.fill} />
      <rect
        x={PLOT.x}
        y={PLOT.y}
        width={half}
        height={PLOT.h}
        fill={`url(#${CATEGORY_STYLE.insulation.hatch ?? ''})`}
      />
      <rect x={PLOT.x + half} y={PLOT.y} width={half} height={PLOT.h} fill={CATEGORY_STYLE.masonry.fill} />
      <rect
        x={PLOT.x + half}
        y={PLOT.y}
        width={half}
        height={PLOT.h}
        fill={`url(#${CATEGORY_STYLE.masonry.hatch ?? ''})`}
      />
      <polyline
        points={`${PLOT.x},26 ${PLOT.x + half},96 ${PLOT.x + PLOT.w},106`}
        className="g-temp g-draw"
      />
      <text x={PLOT.x + half / 2} y={PLOT.y + PLOT.h + 14} className="g-tick" textAnchor="middle">
        λ 0.035
      </text>
      <text x={PLOT.x + half + half / 2} y={PLOT.y + PLOT.h + 14} className="g-tick" textAnchor="middle">
        λ 0.77
      </text>
      <text x={W / 2} y={H - 4} className="g-caption" textAnchor="middle">
        same thickness, twenty times the resistance
      </text>
    </Frame>
  );
}

/** A stud appearing through the insulation, with heat taking the short cut. */
export function StudFigure(): JSX.Element {
  const geometry = bandGeometry(WALL);
  const insulation = geometry[2];
  if (insulation === undefined) {
    return <Frame label="A stud bridging the insulation">{null}</Frame>;
  }
  return (
    <Frame label="A timber stud bridging the insulation, letting heat take a short cut">
      <Stack dim />
      <g className="g-fade" style={{ '--g-delay': '0.6s' } as React.CSSProperties}>
        <rect
          x={insulation.x}
          y={PLOT.y + 18}
          width={insulation.w}
          height={34}
          fill={CATEGORY_STYLE['timber-and-board'].fill}
        />
        <rect
          x={insulation.x}
          y={PLOT.y + 18}
          width={insulation.w}
          height={34}
          fill={`url(#${CATEGORY_STYLE['timber-and-board'].hatch ?? ''})`}
        />
        <rect
          x={insulation.x}
          y={PLOT.y + 18}
          width={insulation.w}
          height={34}
          fill="none"
          stroke="var(--layer-edge)"
        />
      </g>
      {/* Heat flowing: fast through the stud, slow through the quilt. */}
      <g className="g-flow-fast">
        <line x1={PLOT.x} y1={PLOT.y + 35} x2={PLOT.x + PLOT.w} y2={PLOT.y + 35} className="g-flow-line" />
      </g>
      <g className="g-flow-slow">
        <line x1={PLOT.x} y1={PLOT.y + 76} x2={PLOT.x + PLOT.w} y2={PLOT.y + 76} className="g-flow-line" />
      </g>
      <text x={insulation.x + insulation.w / 2} y={PLOT.y + 12} className="g-tick" textAnchor="middle">
        stud
      </text>
      <text x={W / 2} y={H - 4} className="g-caption" textAnchor="middle">
        heat crosses the timber faster than the quilt
      </text>
    </Frame>
  );
}

/** Air circulating in a cavity, then the openings closing. */
export function CavityFigure(): JSX.Element {
  const x = PLOT.x + 0.42 * PLOT.w;
  const w = 0.16 * PLOT.w;
  return (
    <Frame label="Air circulating in a ventilated cavity">
      <Stack bands={[
        { category: 'masonry', width: 0.42 },
        { category: 'air', width: 0.16 },
        { category: 'masonry', width: 0.42 },
      ]} />
      {[0, 1, 2].map((index) => (
        <circle
          key={index}
          cx={x + w / 2}
          cy={0}
          r={3}
          className="g-bubble"
          style={{ '--g-delay': `${index * 0.6}s` } as React.CSSProperties}
        />
      ))}
      <text x={x + w / 2} y={PLOT.y + PLOT.h + 14} className="g-tick" textAnchor="middle">
        cavity
      </text>
      <text x={W / 2} y={H - 4} className="g-caption" textAnchor="middle">
        openings decide how much the cavity still insulates
      </text>
    </Frame>
  );
}

/** A list filtering down as a query is typed. */
export function PickerFigure(): JSX.Element {
  const rows = ['Mineral wool quilt', 'Mineral wool board', 'Aircrete block', 'Brick, outer leaf'];
  return (
    <Frame label="A material list filtering as a search is typed">
      <rect x={PLOT.x} y={14} width={PLOT.w} height={20} className="g-input" rx={4} />
      <text x={PLOT.x + 8} y={28} className="g-input-text">
        mineral<tspan className="g-caret">|</tspan>
      </text>
      {rows.map((row, index) => (
        <g
          key={row}
          className={index < 2 ? 'g-row-keep' : 'g-row-drop'}
          style={{ '--g-delay': `${index * 0.1}s` } as React.CSSProperties}
        >
          <rect x={PLOT.x} y={40 + index * 22} width={PLOT.w} height={19} className="g-row" rx={3} />
          <rect x={PLOT.x + 5} y={44 + index * 22} width={11} height={11} fill={
            index < 2 ? CATEGORY_STYLE.insulation.fill : CATEGORY_STYLE.masonry.fill
          } />
          <text x={PLOT.x + 22} y={53 + index * 22} className="g-row-text">
            {row}
          </text>
        </g>
      ))}
    </Frame>
  );
}

/** Three dots saying how well sourced a material is. */
export function ProvenanceFigure(): JSX.Element {
  const entries = [
    { className: 'source-cited', label: 'every value cited' },
    { className: 'source-partial', label: 'partly cited' },
    { className: 'source-open', label: 'not yet checked' },
  ];
  return (
    <Frame label="The three provenance states a material value can be in">
      {entries.map((entry, index) => (
        <g
          key={entry.className}
          className="g-reveal"
          style={{ '--g-delay': `${index * 0.5}s` } as React.CSSProperties}
        >
          <circle cx={PLOT.x + 12} cy={30 + index * 34} r={6} className={`g-dot ${entry.className}`} />
          <text x={PLOT.x + 30} y={34 + index * 34} className="g-row-text">
            {entry.label}
          </text>
        </g>
      ))}
    </Frame>
  );
}

/** Vapour crossing a build-up, held up by a thin barrier. */
export function VapourFigure({ barrier = false }: { readonly barrier?: boolean }): JSX.Element {
  return (
    <Frame label={barrier ? 'A vapour barrier stopping moisture entering the build-up' : 'Water vapour diffusing through a build-up'}>
      <Stack dim />
      {barrier && (
        <rect
          x={PLOT.x + 0.07 * PLOT.w}
          y={PLOT.y}
          width={3}
          height={PLOT.h}
          fill={CATEGORY_STYLE.membrane.fill}
          stroke="var(--accent)"
          strokeWidth={1}
        />
      )}
      {[0, 1, 2, 3].map((index) => (
        <circle
          key={index}
          cx={0}
          cy={PLOT.y + 18 + index * 20}
          r={3.5}
          className={barrier ? 'g-vapour is-blocked' : 'g-vapour'}
          style={{ '--g-delay': `${index * 0.4}s` } as React.CSSProperties}
        />
      ))}
      <text x={W / 2} y={H - 4} className="g-caption" textAnchor="middle">
        {barrier ? 'a 0.2 mm sheet can out-resist a metre of brick' : 'vapour pushes from the warm side to the cold'}
      </text>
    </Frame>
  );
}

/** The Glaser construction: saturation points with the straight-line hull drawn over. */
export function GlaserFigure(): JSX.Element {
  const points = [
    { x: PLOT.x, y: 30 },
    { x: PLOT.x + 0.2 * PLOT.w, y: 44 },
    { x: PLOT.x + 0.45 * PLOT.w, y: 52 },
    { x: PLOT.x + 0.7 * PLOT.w, y: 96 },
    { x: PLOT.x + PLOT.w, y: 104 },
  ];
  return (
    <Frame label="The Glaser construction: a straight line pulled taut under the saturation curve">
      <polyline
        points={points.map((p) => `${p.x},${p.y}`).join(' ')}
        className="g-sat-line"
      />
      {points.map((point, index) => (
        <circle key={index} cx={point.x} cy={point.y} r={3} className="g-sat-dot" />
      ))}
      <polyline
        points={`${PLOT.x},${52} ${PLOT.x + 0.45 * PLOT.w},${52} ${PLOT.x + PLOT.w},${104}`}
        className="g-hull g-draw"
      />
      <text x={PLOT.x} y={20} className="g-tick">
        saturation
      </text>
      <text x={W / 2} y={H - 4} className="g-caption" textAnchor="middle">
        where the taut line touches, water forms
      </text>
    </Frame>
  );
}

/** Water collecting over a wetting season and draining over a drying one. */
export function SeasonFigure(): JSX.Element {
  return (
    <Frame label="Moisture collecting over a wetting season and leaving over a drying season">
      <rect x={PLOT.x} y={PLOT.y} width={PLOT.w / 2} height={PLOT.h} className="g-season-wet" />
      <rect x={PLOT.x + PLOT.w / 2} y={PLOT.y} width={PLOT.w / 2} height={PLOT.h} className="g-season-dry" />
      <polyline
        points={`${PLOT.x},${PLOT.y + PLOT.h} ${PLOT.x + PLOT.w / 2},${PLOT.y + 20} ${PLOT.x + PLOT.w},${PLOT.y + PLOT.h}`}
        className="g-water g-draw"
      />
      <text x={PLOT.x + PLOT.w / 4} y={PLOT.y + PLOT.h + 14} className="g-tick" textAnchor="middle">
        winter: collects
      </text>
      <text x={PLOT.x + (3 * PLOT.w) / 4} y={PLOT.y + PLOT.h + 14} className="g-tick" textAnchor="middle">
        summer: dries
      </text>
      <text x={W / 2} y={H - 4} className="g-caption" textAnchor="middle">
        back to zero each year, or it builds up
      </text>
    </Frame>
  );
}

/** Two sine waves: the outside swing, and the damped and delayed inside one. */
export function WaveFigure(): JSX.Element {
  const mid = 62;
  const amplitude = 30;
  const wave = (amp: number, phase: number): string => {
    const points: string[] = [];
    for (let i = 0; i <= 60; i += 1) {
      const t = i / 60;
      const x = PLOT.x + t * PLOT.w;
      const y = mid - amp * Math.sin(2 * Math.PI * t * 1.5 - phase);
      points.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    }
    return points.join(' ');
  };
  return (
    <Frame label="An outside temperature swing arriving inside smaller and later">
      <line x1={PLOT.x} y1={mid} x2={PLOT.x + PLOT.w} y2={mid} className="g-axis" />
      <polyline points={wave(amplitude, 0)} className="g-wave-out g-draw" />
      <polyline points={wave(amplitude * 0.42, 1.15)} className="g-wave-in g-draw" style={{ '--g-delay': '0.5s' } as React.CSSProperties} />
      <text x={PLOT.x} y={22} className="g-tick">
        outside swing
      </text>
      <text x={PLOT.x} y={PLOT.y + PLOT.h + 14} className="g-tick g-wave-in-label">
        inside: smaller, and later
      </text>
      <text x={W / 2} y={H - 4} className="g-caption" textAnchor="middle">
        decrement factor and time shift
      </text>
    </Frame>
  );
}

/** Heat pulsing into a wall and dying away within the penetration depth. */
export function KappaFigure(): JSX.Element {
  return (
    <Frame label="A daily temperature cycle reaching only a short way into the wall">
      <Stack bands={[{ category: 'masonry', width: 1 }]} />
      {[0, 1, 2, 3, 4, 5].map((index) => (
        <rect
          key={index}
          x={PLOT.x + index * (PLOT.w / 6)}
          y={PLOT.y}
          width={PLOT.w / 6}
          height={PLOT.h}
          className="g-pulse"
          style={{ '--g-delay': `${index * 0.18}s`, '--g-peak': `${0.55 - index * 0.1}` } as React.CSSProperties}
        />
      ))}
      <line
        x1={PLOT.x + PLOT.w / 3}
        y1={PLOT.y}
        x2={PLOT.x + PLOT.w / 3}
        y2={PLOT.y + PLOT.h}
        className="g-depth-line"
      />
      <text x={PLOT.x + PLOT.w / 3 + 6} y={PLOT.y + 14} className="g-tick">
        penetration depth
      </text>
      <text x={W / 2} y={H - 4} className="g-caption" textAnchor="middle">
        mass deeper than this does nothing for a daily cycle
      </text>
      <Sides inside="inside" outside="" />
    </Frame>
  );
}

/** Furniture against a wall, slowing the air and dropping the surface temperature. */
export function SurfaceConditionFigure(): JSX.Element {
  return (
    <Frame label="Furniture against a wall slowing the air and cooling the surface">
      <Stack dim />
      <Films />
      <g className="g-fade" style={{ '--g-delay': '0.7s' } as React.CSSProperties}>
        <rect x={PLOT.x - 34} y={PLOT.y + 40} width={26} height={56} className="g-furniture" rx={2} />
        <text x={PLOT.x - 21} y={PLOT.y + 34} className="g-tick" textAnchor="middle">
          wardrobe
        </text>
      </g>
      <circle cx={PLOT.x - 4} cy={PLOT.y + 68} r={5} className="g-risk-dot g-fade" style={{ '--g-delay': '1.2s' } as React.CSSProperties} />
      <text x={W / 2} y={H - 4} className="g-caption" textAnchor="middle">
        still air behind it means a colder, damper surface
      </text>
    </Frame>
  );
}

/** The outer face cycling through what it might face. */
export function EnvironmentFigure(): JSX.Element {
  const labels = ['outside air', 'unheated roof space', 'ground'];
  return (
    <Frame label="The outer face of an element facing different environments in turn">
      <Stack dim />
      {labels.map((label, index) => (
        <g
          key={label}
          className="g-cycle"
          style={{ '--g-delay': `${index * 2}s` } as React.CSSProperties}
        >
          <rect x={PLOT.x + PLOT.w + 4} y={PLOT.y + 24} width={40} height={48} className="g-env-card" rx={4} />
          <text x={PLOT.x + PLOT.w + 24} y={PLOT.y + 84} className="g-tick" textAnchor="middle">
            {label}
          </text>
        </g>
      ))}
      <text x={W / 2} y={H - 4} className="g-caption" textAnchor="middle">
        what is on the other side sets Rse and the temperature
      </text>
    </Frame>
  );
}

/** The build-up being written into the address bar. */
export function ShareFigure(): JSX.Element {
  return (
    <Frame label="The build-up encoded into the page address so it can be shared">
      <Stack dim />
      <rect x={PLOT.x} y={PLOT.y + PLOT.h + 4} width={PLOT.w} height={22} className="g-input" rx={4} />
      <text x={PLOT.x + 7} y={PLOT.y + PLOT.h + 19} className="g-url g-type">
        openuvalue/#n=Wall&amp;l=pb,12.5…
      </text>
      <text x={W / 2} y={H - 4} className="g-caption" textAnchor="middle">
        no account, no server — the link is the file
      </text>
    </Frame>
  );
}

/** The upper and lower limits closing in on the reported U-value. */
export function CombinedFigure(): JSX.Element {
  const upperX = PLOT.x + 0.22 * PLOT.w;
  const lowerX = PLOT.x + 0.74 * PLOT.w;
  const midX = (upperX + lowerX) / 2;
  return (
    <Frame label="The upper and lower resistance limits averaged into the reported value">
      <line x1={PLOT.x} y1={70} x2={PLOT.x + PLOT.w} y2={70} className="g-axis" />
      <g className="g-converge" style={{ '--g-from': `${upperX}px`, '--g-to': `${midX}px` } as React.CSSProperties}>
        <line x1={0} y1={52} x2={0} y2={88} className="g-limit-line" />
      </g>
      <g className="g-converge" style={{ '--g-from': `${lowerX}px`, '--g-to': `${midX}px` } as React.CSSProperties}>
        <line x1={0} y1={52} x2={0} y2={88} className="g-limit-line" />
      </g>
      <text x={upperX} y={44} className="g-tick" textAnchor="middle">
        R′T
      </text>
      <text x={lowerX} y={44} className="g-tick" textAnchor="middle">
        R″T
      </text>
      <text x={midX} y={106} className="g-tick" textAnchor="middle">
        the average is used
      </text>
      <text x={W / 2} y={H - 4} className="g-caption" textAnchor="middle">
        too far apart, and no U-value is reported at all
      </text>
    </Frame>
  );
}

/** Heat leaving through a roof, a wall and a floor, at very different rates. */
export function DirectionFigure(): JSX.Element {
  const cases = [
    { label: 'roof — upward', y: 30, speed: '1.1s' },
    { label: 'wall — horizontal', y: 66, speed: '1.7s' },
    { label: 'floor — downward', y: 102, speed: '3.2s' },
  ];
  return (
    <Frame label="Heat escaping upward, sideways and downward at different rates">
      {cases.map((entry) => (
        <g key={entry.label}>
          <rect x={PLOT.x + 96} y={entry.y - 10} width={14} height={20} className="g-element" />
          <line
            x1={PLOT.x + 10}
            y1={entry.y}
            x2={PLOT.x + PLOT.w - 10}
            y2={entry.y}
            className="g-flow-line g-march"
            style={{ '--g-speed': entry.speed } as React.CSSProperties}
          />
          <text x={PLOT.x + 10} y={entry.y - 14} className="g-tick">
            {entry.label}
          </text>
        </g>
      ))}
      <text x={W / 2} y={H - 4} className="g-caption" textAnchor="middle">
        heat rises, so the direction changes the surface resistances
      </text>
    </Frame>
  );
}
