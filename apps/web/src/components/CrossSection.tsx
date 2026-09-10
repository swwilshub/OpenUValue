import type { ProfileSection, TemperatureProfile, UValueResult } from '@openuvalue/engine';
import type { LayerDrawCategory, UiLayer } from '../state/model.js';
import { layerDrawCategory } from '../state/model.js';

/**
 * A to-scale cross-section with the steady-state temperature line drawn over it.
 * Internal on the left, external on the right, matching the layer table.
 *
 * Layer widths are strictly proportional to thickness. The two surface-resistance
 * films have no thickness at all, so they are drawn as fixed-width hatched bands and
 * labelled as not to scale - the temperature drop across them is real and worth
 * seeing, but their width on screen is a drawing device.
 *
 * Vertical position means temperature and nothing else. Layer hatching is decorative
 * and identifies the material; it never encodes a quantity, and in particular the
 * bridged area fraction is written on the layer as a percentage rather than drawn as
 * a band, which would make the vertical axis mean two things at once.
 */
const FILM_WIDTH = 44;
const DRAW_WIDTH = 660;
const PLOT_HEIGHT = 260;
const TOP_PAD = 18;
const AXIS_WIDTH = 46;

/** Minimum drawn width before a layer can carry a rotated name label. */
const MIN_WIDTH_FOR_NAME = 20;
/** Minimum drawn width before a layer can carry its thickness caption. */
const MIN_WIDTH_FOR_CAPTION = 26;
/**
 * Approximate advance width of one character at the 10.5px label size, used to trim a
 * rotated layer name to the height of the plot. SVG has no text wrapping and no cheap
 * way to measure a string, so this is an estimate deliberately on the generous side:
 * over-estimating trims a name that would have just fitted, under-estimating lets one
 * run out of the drawing.
 */
const LABEL_CHAR_WIDTH = 6.9;

/** Trim a label to what will fit along the height of the plot, with an ellipsis. */
function fitLabel(text: string, availableLength: number): string {
  const maxCharacters = Math.floor(availableLength / LABEL_CHAR_WIDTH);
  if (maxCharacters <= 1 || text.length <= maxCharacters) {
    return text;
  }
  return `${text.slice(0, Math.max(1, maxCharacters - 1)).trimEnd()}…`;
}

/**
 * Fill and hatch per material category. The hatch ids are the SVG patterns defined in
 * <defs> below; a category with no hatch is drawn as a flat fill.
 */
const CATEGORY_STYLE: Record<LayerDrawCategory, { readonly fill: string; readonly hatch?: string }> = {
  masonry: { fill: 'var(--cat-masonry)', hatch: 'hatch-masonry' },
  concrete: { fill: 'var(--cat-concrete)', hatch: 'hatch-concrete' },
  'timber-and-board': { fill: 'var(--cat-timber)', hatch: 'hatch-timber' },
  insulation: { fill: 'var(--cat-insulation)', hatch: 'hatch-insulation' },
  'plaster-and-render': { fill: 'var(--cat-plaster)', hatch: 'hatch-fine' },
  screed: { fill: 'var(--cat-screed)', hatch: 'hatch-fine' },
  membrane: { fill: 'var(--cat-membrane)', hatch: 'hatch-membrane' },
  covering: { fill: 'var(--cat-covering)', hatch: 'hatch-covering' },
  air: { fill: 'var(--cat-air)' },
  custom: { fill: 'var(--cat-custom)' },
};

interface LayerBox {
  readonly layer: UiLayer;
  readonly category: LayerDrawCategory;
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
    boxes.push({
      layer,
      category: layerDrawCategory(layer.materialId, layer.kind),
      x: cursor,
      width,
      included: includedFlags[index] ?? true,
    });
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
  const hasBridgedLayer = boxes.some(
    (box) => box.layer.kind === 'solid' && box.layer.bridgedPercent > 0,
  );

  // The band from the dew point down to the bottom of the plot: everything drawn
  // inside it is at or below the internal dew point. Tinted rather than outlined so
  // it reads at a glance without hiding the layer hatching underneath.
  const dewPointY = toY(profile.internalDewPointTemperatureC);
  const riskBandY = Math.min(Math.max(dewPointY, TOP_PAD), TOP_PAD + PLOT_HEIGHT);
  const riskBandHeight = TOP_PAD + PLOT_HEIGHT - riskBandY;

  return (
    <figure className="cross-section">
      <svg
        viewBox={`-7 0 ${totalWidth + AXIS_WIDTH + 7} ${PLOT_HEIGHT + TOP_PAD + 66}`}
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

          {/* Masonry: courses with staggered perpends, as a brick leaf reads in section. */}
          <pattern id="hatch-masonry" width="26" height="14" patternUnits="userSpaceOnUse">
            <g stroke="var(--cat-masonry-ink)" strokeWidth="0.9" fill="none">
              <line x1="0" y1="0.5" x2="26" y2="0.5" />
              <line x1="0" y1="7" x2="26" y2="7" />
              <line x1="13" y1="0.5" x2="13" y2="7" />
              <line x1="0" y1="7" x2="0" y2="13.5" />
              <line x1="26" y1="7" x2="26" y2="13.5" />
            </g>
          </pattern>

          {/* Concrete: the conventional aggregate stipple. */}
          <pattern id="hatch-concrete" width="15" height="15" patternUnits="userSpaceOnUse">
            <g fill="var(--cat-concrete-ink)">
              <circle cx="3" cy="4" r="1.2" />
              <circle cx="10" cy="9.5" r="1.5" />
              <circle cx="13" cy="2.5" r="0.9" />
              <circle cx="6" cy="12.5" r="1" />
            </g>
          </pattern>

          {/* Timber: grain, drawn along the length of the piece. */}
          <pattern id="hatch-timber" width="20" height="11" patternUnits="userSpaceOnUse">
            <g stroke="var(--cat-timber-ink)" strokeWidth="0.9" fill="none">
              <path d="M0 3 q10 -2.2 20 0" />
              <path d="M0 8 q10 2.2 20 0" />
            </g>
          </pattern>

          {/* Insulation: the conventional soft-quilt wave. */}
          <pattern id="hatch-insulation" width="18" height="13" patternUnits="userSpaceOnUse">
            <path
              d="M0 6.5 q4.5 -6 9 0 t9 0"
              fill="none"
              stroke="var(--cat-insulation-ink)"
              strokeWidth="1.15"
            />
          </pattern>

          {/* Plaster, render and screed: a fine even stipple. */}
          <pattern id="hatch-fine" width="7" height="7" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
            <line x1="0" y1="0" x2="0" y2="7" stroke="var(--cat-plaster-ink)" strokeWidth="0.8" />
          </pattern>

          {/* Membrane: dense lines, since these layers are only a line or two wide. */}
          <pattern id="hatch-membrane" width="4" height="4" patternUnits="userSpaceOnUse">
            <line x1="0" y1="0" x2="0" y2="4" stroke="var(--cat-membrane-ink)" strokeWidth="1.4" />
          </pattern>

          {/* Covering: lapped tiles. */}
          <pattern id="hatch-covering" width="14" height="14" patternUnits="userSpaceOnUse">
            <path
              d="M0 14 a7 7 0 0 1 14 0"
              fill="none"
              stroke="var(--cat-covering-ink)"
              strokeWidth="0.9"
            />
          </pattern>

          {/*
           * The temperature line's colour is mapped to the temperature axis itself:
           * warm at the top of the plot, cold at the bottom. It is a second reading of
           * the same number the y position already gives, not extra information.
           */}
          <linearGradient
            id="temperature-gradient"
            gradientUnits="userSpaceOnUse"
            x1="0"
            y1={TOP_PAD}
            x2="0"
            y2={TOP_PAD + PLOT_HEIGHT}
          >
            <stop offset="0%" stopColor="var(--temp-warm)" />
            <stop offset="55%" stopColor="var(--temp-mid)" />
            <stop offset="100%" stopColor="var(--temp-cold)" />
          </linearGradient>
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
        {boxes.map((box) => {
          const style = CATEGORY_STYLE[box.category];
          const bridgedPercent = box.layer.kind === 'solid' ? box.layer.bridgedPercent : 0;
          return (
            <g key={box.layer.id}>
              {box.included ? (
                <>
                  <rect
                    x={box.x}
                    y={TOP_PAD}
                    width={box.width}
                    height={PLOT_HEIGHT}
                    fill={style.fill}
                  />
                  {style.hatch !== undefined && (
                    <rect
                      x={box.x}
                      y={TOP_PAD}
                      width={box.width}
                      height={PLOT_HEIGHT}
                      fill={`url(#${style.hatch})`}
                    />
                  )}
                </>
              ) : (
                <rect
                  x={box.x}
                  y={TOP_PAD}
                  width={box.width}
                  height={PLOT_HEIGHT}
                  fill="url(#excluded-hatch)"
                />
              )}
              <rect
                x={box.x}
                y={TOP_PAD}
                width={box.width}
                height={PLOT_HEIGHT}
                fill="none"
                stroke="var(--layer-edge)"
                strokeWidth={0.75}
                className={bridgedPercent > 0 ? 'layer-outline layer-outline-bridged' : 'layer-outline'}
              />
              {box.width >= MIN_WIDTH_FOR_NAME && (
                <text
                  className="layer-name"
                  transform={`translate(${(box.x + box.width / 2).toFixed(2)}, ${
                    TOP_PAD + PLOT_HEIGHT - 8
                  }) rotate(-90)`}
                >
                  {fitLabel(
                    bridgedPercent > 0
                      ? `${box.layer.label} · ${bridgedPercent}% ${box.layer.bridgeLabel}`
                      : box.layer.label,
                    PLOT_HEIGHT - 24,
                  )}
                </text>
              )}
              {box.width >= MIN_WIDTH_FOR_CAPTION && (
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
          );
        })}

        {/* Everything below the internal dew point, tinted. */}
        {riskBandHeight > 0 && (
          <rect
            x={0}
            y={riskBandY}
            width={totalWidth}
            height={riskBandHeight}
            className="dew-point-band"
          />
        )}

        {/* Dew point of the internal air: the threshold every node is judged against. */}
        <line
          x1={0}
          y1={dewPointY}
          x2={totalWidth}
          y2={dewPointY}
          className="dew-point-line"
        />
        <text x={4} y={dewPointY - 5} className="dew-point-label">
          dew point {profile.internalDewPointTemperatureC.toFixed(1)} °C
        </text>

        {/* The temperature line for the displayed section. */}
        <polyline points={linePoints} className="temperature-line-shadow" />
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
        are drawn at a fixed width. Height means temperature only — the hatching shows
        what each layer is made of and the tinted band is everything at or below the
        internal dew point.
        {hasBridgedLayer &&
          ' A bridged layer is outlined in the accent colour and labelled with its bridged percentage, which is an area fraction and so cannot be drawn in section.'}
        {lastIncludedIndex < layers.length - 1 &&
          ' The cross-hatched layers beyond the ventilated cavity are disregarded by the calculation.'}
        {hasThinLayer && ' Layers thinner than the line width are drawn as a single line.'}
      </figcaption>
    </figure>
  );
}
