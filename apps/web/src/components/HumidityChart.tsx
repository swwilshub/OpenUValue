import type { PathAssessment, TemperatureProfile } from '@openuvalue/engine';
import { MOULD_CRITICAL_SURFACE_HUMIDITY_PERCENT } from '@openuvalue/engine';
import type { UiLayer } from '../state/model.js';
import { layerDrawCategory } from '../state/model.js';
import { CATEGORY_STYLE } from './hatches.js';

/**
 * Relative humidity through the construction, drawn against real thickness so it lines
 * up with the cross-section above it.
 *
 * The Glaser diagram plots pressures against S_d, which is the right axis for the
 * construction but an unfamiliar one to read. This is the same result expressed as the
 * question people actually ask: how damp is the air at each point inside the wall?
 * Where it reaches 100 % the air cannot hold what it has and water appears.
 *
 * RH here is the actual vapour pressure over the saturation pressure at that point,
 * both of which the assessment has already computed; nothing new is calculated.
 */

const WIDTH = 620;
const HEIGHT = 240;
const PAD_TOP = 14;
const PAD_BOTTOM = 40;
const PAD_LEFT = 42;
const PAD_RIGHT = 12;

export interface HumidityChartProps {
  readonly layers: readonly UiLayer[];
  readonly profile: TemperatureProfile;
  readonly path: PathAssessment;
}

export function HumidityChart({ layers, profile, path }: HumidityChartProps): JSX.Element {
  const plotWidth = WIDTH - PAD_LEFT - PAD_RIGHT;
  const plotHeight = HEIGHT - PAD_TOP - PAD_BOTTOM;

  const totalMm = layers.reduce((total, layer) => total + layer.thicknessMm, 0);
  const scale = totalMm > 0 ? plotWidth / totalMm : 0;
  const toX = (positionMm: number): number => PAD_LEFT + positionMm * scale;
  const toY = (percent: number): number => PAD_TOP + plotHeight - (percent / 100) * plotHeight;

  /*
   * The assessment's nodes run internal surface to external surface; the temperature
   * profile also carries the two air nodes, which are not inside the construction.
   * Pair them by walking the profile's surface-and-interface nodes in the same order.
   */
  const positioned = profile.nodes.filter(
    (node) => node.kind !== 'internal-air' && node.kind !== 'external-air',
  );
  const points = path.assessment.nodes.map((node, index) => {
    const profileNode = positioned[index];
    const humidity =
      node.saturationVapourPressurePa > 0
        ? Math.min(100, (node.actualVapourPressurePa / node.saturationVapourPressurePa) * 100)
        : 100;
    return {
      positionMm: (profileNode?.positionM ?? 0) * 1000,
      humidity,
      condensing: node.condensationOccurs,
      label: node.label,
    };
  });

  const line = points
    .map((point) => `${toX(point.positionMm).toFixed(1)},${toY(point.humidity).toFixed(1)}`)
    .join(' ');

  let cursor = 0;
  const boxes = layers.map((layer) => {
    const box = { layer, x: cursor, width: Math.max(1.2, layer.thicknessMm * scale) };
    cursor += layer.thicknessMm * scale;
    return box;
  });

  return (
    <figure className="humidity-chart">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="Relative humidity through the construction">
        {/* The build-up behind the curve, so the two read as one drawing. */}
        {boxes.map((box) => {
          const style = CATEGORY_STYLE[layerDrawCategory(box.layer.materialId, box.layer.kind)];
          return (
            <g key={box.layer.id} opacity={0.5}>
              <rect
                x={PAD_LEFT + box.x}
                y={PAD_TOP}
                width={box.width}
                height={plotHeight}
                fill={style.fill}
              />
              {style.hatch !== undefined && (
                <rect
                  x={PAD_LEFT + box.x}
                  y={PAD_TOP}
                  width={box.width}
                  height={plotHeight}
                  fill={`url(#${style.hatch})`}
                />
              )}
              <rect
                x={PAD_LEFT + box.x}
                y={PAD_TOP}
                width={box.width}
                height={plotHeight}
                fill="none"
                stroke="var(--layer-edge)"
                strokeWidth={0.6}
              />
            </g>
          );
        })}

        {[0, 20, 40, 60, 80, 100].map((value) => (
          <g key={value}>
            <line
              x1={PAD_LEFT}
              y1={toY(value)}
              x2={WIDTH - PAD_RIGHT}
              y2={toY(value)}
              className={value === 100 ? 'humidity-saturation-line' : 'grid-line'}
            />
            <text x={PAD_LEFT - 6} y={toY(value) + 4} className="axis-label" textAnchor="end">
              {value}
            </text>
          </g>
        ))}

        {/* The mould threshold, which bites long before liquid water appears. */}
        <line
          x1={PAD_LEFT}
          y1={toY(MOULD_CRITICAL_SURFACE_HUMIDITY_PERCENT)}
          x2={WIDTH - PAD_RIGHT}
          y2={toY(MOULD_CRITICAL_SURFACE_HUMIDITY_PERCENT)}
          className="mould-line"
        />
        <text
          x={WIDTH - PAD_RIGHT}
          y={toY(MOULD_CRITICAL_SURFACE_HUMIDITY_PERCENT) - 4}
          className="mould-label"
          textAnchor="end"
        >
          {MOULD_CRITICAL_SURFACE_HUMIDITY_PERCENT}% — mould threshold
        </text>

        <polyline points={line} className="humidity-line-shadow" />
        <polyline points={line} className="humidity-line" />

        {points.map((point) =>
          point.condensing ? (
            <circle
              key={point.label}
              cx={toX(point.positionMm)}
              cy={toY(point.humidity)}
              r="4.5"
              className="node node-risk"
            />
          ) : null,
        )}

        <text x={PAD_LEFT} y={HEIGHT - 20} className="side-label">
          inside
        </text>
        <text x={WIDTH - PAD_RIGHT} y={HEIGHT - 20} className="side-label" textAnchor="end">
          outside
        </text>
        <text x={PAD_LEFT - 6} y={PAD_TOP - 3} className="axis-title" textAnchor="end">
          %
        </text>
        <text x={WIDTH / 2} y={HEIGHT - 4} className="axis-caption" textAnchor="middle">
          through the construction, to scale
        </text>
      </svg>
      <figcaption>
        Relative humidity of the air at each point inside the build-up. 100 % means the
        air there cannot hold what it carries, and the surplus becomes water.
      </figcaption>
    </figure>
  );
}
