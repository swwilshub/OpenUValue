import type { ProfileSection, TemperatureProfile, UValueResult } from '@openuvalue/engine';
import type { UiLayer } from '../state/model.js';

/**
 * A to-scale cross-section with the steady-state temperature line drawn over it.
 * Internal on the left, external on the right, matching the layer table.
 *
 * Layer widths are strictly proportional to thickness. The two surface-resistance
 * films have no thickness at all, so they are drawn as fixed-width hatched bands and
 * labelled as not to scale - the temperature drop across them is real and worth
 * seeing, but their width on screen is a drawing device.
 */
const FILM_WIDTH = 44;
const DRAW_WIDTH = 660;
const PLOT_HEIGHT = 260;
const TOP_PAD = 18;
const AXIS_WIDTH = 46;

const CATEGORY_FILL: Record<string, string> = {
  air: 'var(--layer-air)',
  solid: 'var(--layer-solid)',
};

interface LayerBox {
  readonly layer: UiLayer;
  readonly x: number;
  readonly width: number;
  readonly included: boolean;
}

export interface CrossSectionProps {
  readonly layers: readonly UiLayer[];
  readonly result: UValueResult;
  readonly profile: TemperatureProfile;
  readonly section: ProfileSection;
}

export function CrossSection({ layers, result, profile }: CrossSectionProps): JSX.Element {
  const totalThicknessMm = layers.reduce((total, layer) => total + layer.thicknessMm, 0);
  if (layers.length === 0 || totalThicknessMm <= 0) {
    return (
      <p className="empty-note">
        Add a layer with a thickness to see the cross-section.
      </p>
    );
  }

  const includedFlags = result.layers.map((layer) => layer.includedInCalculation);
  const lastIncludedIndex = includedFlags.lastIndexOf(true);
  const scale = DRAW_WIDTH / totalThicknessMm;

  const boxes: LayerBox[] = [];
  let cursor = FILM_WIDTH;
  layers.forEach((layer, index) => {
    const width = Math.max(1, layer.thicknessMm * scale);
    boxes.push({ layer, x: cursor, width, included: includedFlags[index] ?? true });
    cursor += width;
    if (index === lastIncludedIndex) {
      cursor += FILM_WIDTH;
    }
  });
  const totalWidth = cursor;

  const includedThicknessMm = layers
    .filter((_layer, index) => includedFlags[index] ?? true)
    .reduce((total, layer) => total + layer.thicknessMm, 0);
  const externalFilmX = FILM_WIDTH + includedThicknessMm * scale;

  // Temperature axis, padded so the dew-point line is never clipped.
  const temperatures = [
    ...profile.nodes.map((node) => node.temperatureC),
    ...profile.nodes.map((node) => node.worstCaseTemperatureC),
    profile.internalDewPointTemperatureC,
  ].filter((value) => Number.isFinite(value));
  const rawMin = Math.min(...temperatures);
  const rawMax = Math.max(...temperatures);
  const span = Math.max(1, rawMax - rawMin);
  const axisMin = rawMin - span * 0.12;
  const axisMax = rawMax + span * 0.12;
  const toY = (temperatureC: number): number =>
    TOP_PAD + ((axisMax - temperatureC) / (axisMax - axisMin)) * PLOT_HEIGHT;

  const nodeX = (index: number): number => {
    if (index === 0) {
      return 0;
    }
    if (index === profile.nodes.length - 1) {
      return externalFilmX + FILM_WIDTH;
    }
    const node = profile.nodes[index];
    if (node === undefined) {
      return 0;
    }
    return FILM_WIDTH + node.positionM * 1000 * scale;
  };

  const linePoints = profile.nodes
    .map((node, index) => `${nodeX(index).toFixed(2)},${toY(node.temperatureC).toFixed(2)}`)
    .join(' ');

  const gridTemperatures: number[] = [];
  const step = span > 25 ? 10 : span > 10 ? 5 : 2;
  for (
    let value = Math.ceil(axisMin / step) * step;
    value <= axisMax;
    value += step
  ) {
    gridTemperatures.push(Number(value.toFixed(6)));
  }

  const hasThinLayer = layers.some((layer) => layer.thicknessMm * scale < 2);

  return (
    <figure className="cross-section">
      <svg
        viewBox={`0 0 ${totalWidth + AXIS_WIDTH} ${PLOT_HEIGHT + TOP_PAD + 66}`}
        role="img"
        aria-label={`Cross-section of ${layers.length} layers with the temperature profile overlaid`}
      >
        <defs>
          <pattern id="film-hatch" width="6" height="6" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
            <line x1="0" y1="0" x2="0" y2="6" stroke="var(--film-hatch)" strokeWidth="2" />
          </pattern>
          <pattern id="excluded-hatch" width="8" height="8" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
            <line x1="0" y1="0" x2="0" y2="8" stroke="var(--excluded-hatch)" strokeWidth="3" />
          </pattern>
        </defs>

        {/* Temperature grid and axis. */}
        {gridTemperatures.map((value) => (
          <g key={`grid-${value}`}>
            <line
              x1={0}
              y1={toY(value)}
              x2={totalWidth}
              y2={toY(value)}
              className="grid-line"
            />
            <text x={totalWidth + 6} y={toY(value) + 4} className="axis-label">
              {value}
            </text>
          </g>
        ))}
        <text
          x={totalWidth + AXIS_WIDTH - 4}
          y={TOP_PAD - 6}
          className="axis-title"
          textAnchor="end"
        >
          °C
        </text>

        {/* Surface resistance films. */}
        <rect x={0} y={TOP_PAD} width={FILM_WIDTH} height={PLOT_HEIGHT} fill="url(#film-hatch)" />
        <rect
          x={externalFilmX}
          y={TOP_PAD}
          width={FILM_WIDTH}
          height={PLOT_HEIGHT}
          fill="url(#film-hatch)"
        />

        {/* Layers, strictly to scale. */}
        {boxes.map((box) => (
          <g key={box.layer.id}>
            <rect
              x={box.x}
              y={TOP_PAD}
              width={box.width}
              height={PLOT_HEIGHT}
              fill={box.included ? CATEGORY_FILL[box.layer.kind] : 'url(#excluded-hatch)'}
              stroke="var(--layer-edge)"
              strokeWidth={0.75}
            />
            {box.width > 26 && (
              <text
                x={box.x + box.width / 2}
                y={PLOT_HEIGHT + TOP_PAD + 16}
                className="layer-caption"
                textAnchor="middle"
              >
                {box.layer.thicknessMm}
              </text>
            )}
          </g>
        ))}

        {/* Dew point of the internal air: the threshold every node is judged against. */}
        <line
          x1={0}
          y1={toY(profile.internalDewPointTemperatureC)}
          x2={totalWidth}
          y2={toY(profile.internalDewPointTemperatureC)}
          className="dew-point-line"
        />
        <text
          x={4}
          y={toY(profile.internalDewPointTemperatureC) - 5}
          className="dew-point-label"
        >
          dew point {profile.internalDewPointTemperatureC.toFixed(1)} °C
        </text>

        {/* The temperature line for the displayed section. */}
        <polyline points={linePoints} className="temperature-line" />

        {profile.nodes.map((node, index) => (
          <g key={`${node.kind}-${index}`}>
            <circle
              cx={nodeX(index)}
              cy={toY(node.temperatureC)}
              r={node.isBelowInternalDewPoint ? 5 : 3.5}
              className={node.isBelowInternalDewPoint ? 'node node-risk' : 'node'}
            >
              <title>
                {`${node.label}: ${node.temperatureC.toFixed(2)} °C` +
                  (node.worstCasePathId === 'n/a'
                    ? ''
                    : `\nworst of all paths: ${node.worstCaseTemperatureC.toFixed(2)} °C ` +
                      `(${node.worstCasePathId})` +
                      `\nbelow internal dew point: ${node.isBelowInternalDewPoint ? 'yes' : 'no'}` +
                      `\ncumulative Sd: ${node.cumulativeSdM.toFixed(3)} m`)}
              </title>
            </circle>
          </g>
        ))}

        <text x={0} y={PLOT_HEIGHT + TOP_PAD + 38} className="side-label">
          inside
        </text>
        <text x={totalWidth} y={PLOT_HEIGHT + TOP_PAD + 38} className="side-label" textAnchor="end">
          outside
        </text>
      </svg>
      <figcaption>
        Layer widths are to scale and captioned in millimetres; the two hatched bands
        are the internal and external surface resistances, which have no thickness and
        are drawn at a fixed width.
        {lastIncludedIndex < layers.length - 1 &&
          ' The cross-hatched layers beyond the ventilated cavity are disregarded by the calculation.'}
        {hasThinLayer && ' Layers thinner than the line width are drawn as a single line.'}
      </figcaption>
    </figure>
  );
}
