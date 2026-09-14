import type { InterstitialAssessment, PathAssessment } from '@openuvalue/engine';
import { ratePerDayGPerM2 } from '@openuvalue/engine';

/**
 * The Glaser diagram: vapour pressure against cumulative equivalent air layer
 * thickness, with the saturation ceiling over it.
 *
 * The x axis is deliberately S_d and not physical thickness. On that axis a steady
 * vapour flow is a straight line, so the construction is readable by eye: a straight
 * run means vapour is passing through, a kink means it is condensing. It also means a
 * 0.2 mm vapour barrier occupies most of the width while a 215 mm brick occupies
 * little — which looks wrong until you realise that is exactly the point being made.
 */

const WIDTH = 620;
const HEIGHT = 260;
const PAD_TOP = 16;
const PAD_BOTTOM = 46;
const PAD_LEFT = 52;
const PAD_RIGHT = 16;

export interface GlaserChartProps {
  readonly assessment: InterstitialAssessment;
  readonly path: PathAssessment;
}

export function GlaserChart({ assessment, path }: GlaserChartProps): JSX.Element {
  const nodes = path.assessment.nodes;
  const maxSd = nodes[nodes.length - 1]?.cumulativeSdM ?? 1;
  const maxPressure = Math.max(
    ...nodes.map((node) => node.saturationVapourPressurePa),
    path.assessment.internalVapourPressurePa,
  );

  const plotWidth = WIDTH - PAD_LEFT - PAD_RIGHT;
  const plotHeight = HEIGHT - PAD_TOP - PAD_BOTTOM;
  // An element with no vapour resistance at all would divide by zero; give it a
  // nominal width so the chart still draws rather than collapsing.
  const sdScale = maxSd > 0 ? plotWidth / maxSd : 0;
  const toX = (sdM: number): number => PAD_LEFT + sdM * sdScale;
  const toY = (pressurePa: number): number =>
    PAD_TOP + plotHeight - (pressurePa / (maxPressure * 1.08)) * plotHeight;

  const saturationPoints = nodes
    .map((node) => `${toX(node.cumulativeSdM).toFixed(1)},${toY(node.saturationVapourPressurePa).toFixed(1)}`)
    .join(' ');
  const actualPoints = nodes
    .map((node) => `${toX(node.cumulativeSdM).toFixed(1)},${toY(node.actualVapourPressurePa).toFixed(1)}`)
    .join(' ');

  // The band between the saturation line and the top of the plot: vapour pressure
  // cannot exist up there, which is why the construction is pushed down out of it.
  const saturationCeiling = [
    `${toX(0).toFixed(1)},${PAD_TOP}`,
    ...nodes.map(
      (node) =>
        `${toX(node.cumulativeSdM).toFixed(1)},${toY(node.saturationVapourPressurePa).toFixed(1)}`,
    ),
    `${toX(maxSd).toFixed(1)},${PAD_TOP}`,
  ].join(' ');

  /*
   * Sd spans anything from a fraction of a metre to tens of metres once a vapour
   * barrier is in the build-up, so the tick step is chosen from the range rather than
   * fixed.
   */
  const sdStep = maxSd > 40 ? 10 : maxSd > 10 ? 5 : maxSd > 4 ? 1 : maxSd > 1 ? 0.5 : 0.1;
  const sdTicks: number[] = [];
  for (let value = 0; value <= maxSd + 1e-9; value += sdStep) {
    sdTicks.push(Number(value.toFixed(4)));
  }

  const pressureTicks: number[] = [];
  const tickStep = maxPressure > 2000 ? 500 : maxPressure > 800 ? 250 : 100;
  for (let value = 0; value <= maxPressure * 1.08; value += tickStep) {
    pressureTicks.push(value);
  }

  return (
    <figure className="glaser-chart">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="Glaser vapour pressure diagram">
        {pressureTicks.map((value) => (
          <g key={value}>
            <line
              x1={PAD_LEFT}
              y1={toY(value)}
              x2={WIDTH - PAD_RIGHT}
              y2={toY(value)}
              className="grid-line"
            />
            <text x={PAD_LEFT - 6} y={toY(value) + 4} className="axis-label" textAnchor="end">
              {value}
            </text>
          </g>
        ))}
        <text
          x={PAD_LEFT - 6}
          y={PAD_TOP - 4}
          className="axis-title"
          textAnchor="end"
        >
          Pa
        </text>

        {/* Above saturation: physically unreachable. */}
        <polygon points={saturationCeiling} className="saturation-ceiling" />

        {/* Layer boundaries, so the curve can be related back to the build-up. */}
        {nodes.map((node) => (
          <line
            key={`tick-${node.boundaryIndex}`}
            x1={toX(node.cumulativeSdM)}
            y1={PAD_TOP}
            x2={toX(node.cumulativeSdM)}
            y2={PAD_TOP + plotHeight}
            className="boundary-tick"
          />
        ))}

        <polyline points={saturationPoints} className="saturation-line" />
        <polyline points={actualPoints} className="vapour-line" />

        {nodes.map((node) =>
          node.condensationOccurs ? (
            <g key={`plane-${node.boundaryIndex}`}>
              <circle
                cx={toX(node.cumulativeSdM)}
                cy={toY(node.actualVapourPressurePa)}
                r="9"
                className="risk-halo"
              />
              <circle
                cx={toX(node.cumulativeSdM)}
                cy={toY(node.actualVapourPressurePa)}
                r="4.5"
                className="node node-risk"
              />
            </g>
          ) : null,
        )}

        {sdTicks.map((value) => (
          <text
            key={`sd-${value}`}
            x={toX(value)}
            y={PAD_TOP + plotHeight + 13}
            className="axis-label"
            textAnchor="middle"
          >
            {value >= 10 ? value.toFixed(0) : value.toFixed(1)}
          </text>
        ))}

        <text x={PAD_LEFT} y={HEIGHT - 24} className="side-label">
          inside
        </text>
        <text x={WIDTH - PAD_RIGHT} y={HEIGHT - 24} className="side-label" textAnchor="end">
          outside
        </text>
        <text x={WIDTH / 2} y={HEIGHT - 6} className="axis-caption" textAnchor="middle">
          cumulative S
          <tspan baselineShift="sub" fontSize="7">
            d
          </tspan>
          {' '}equivalent air layer thickness, m
        </text>
      </svg>

      <figcaption>
        <span className="key">
          <span className="key-swatch key-saturation" /> saturation, from the temperature
        </span>
        <span className="key">
          <span className="key-swatch key-vapour" /> actual vapour pressure
        </span>
        {assessment.condenses && (
          <span className="key">
            <span className="key-swatch key-plane" /> condensing
          </span>
        )}
      </figcaption>

      {path.assessment.condensationPlaneIndices.length > 0 && (
        <ul className="plane-list">
          {nodes
            .filter((node) => node.condensationOccurs && node.rateKgPerM2S > 0)
            .map((node) => (
              <li key={node.boundaryIndex}>
                <strong>{node.label}</strong>, {ratePerDayGPerM2(node.rateKgPerM2S).toFixed(1)}{' '}
                g/m² per day, at S<sub>d</sub> {node.cumulativeSdM.toFixed(2)} m
              </li>
            ))}
        </ul>
      )}
    </figure>
  );
}
