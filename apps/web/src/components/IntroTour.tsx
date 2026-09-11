import { useEffect, useMemo, useState } from 'react';
import type { BuildingElement, EnvironmentConditions, Layer } from '@openuvalue/engine';
import { calculateTemperatureProfile, calculateUValue } from '@openuvalue/engine';
import { MaterialSwatch } from './hatches.js';
import { CATEGORY_STYLE } from './hatches.js';
import type { LayerDrawCategory } from '../state/model.js';

/**
 * A short walkthrough of how to read the cross-section: what the layers are, what the
 * falling line is, what the dew point line means, and what interstitial condensation
 * looks like when it happens.
 *
 * Every number and every line in here is calculated by the engine from the build-ups
 * below, at the conditions below. Nothing is drawn by hand or typed in as an
 * illustration: if the engine changes, the walkthrough changes with it, and it cannot
 * quietly teach something the tool does not actually do.
 */

const TOUR_CONDITIONS: EnvironmentConditions = {
  internalAirTemperatureC: 20,
  internalRelativeHumidityPercent: 50,
  externalAirTemperatureC: 0,
  externalRelativeHumidityPercent: 90,
};

interface TourLayer {
  readonly id: string;
  readonly label: string;
  readonly thicknessMm: number;
  readonly lambdaWPerMK: number;
  readonly vapourResistanceFactorMu: number;
  readonly category: LayerDrawCategory;
}

function toElement(name: string, layers: readonly TourLayer[]): BuildingElement {
  const engineLayers: Layer[] = layers.map((layer) => ({
    kind: 'solid',
    id: layer.id,
    label: layer.label,
    thicknessM: layer.thicknessMm / 1000,
    material: {
      lambdaWPerMK: layer.lambdaWPerMK,
      vapourResistanceFactorMu: layer.vapourResistanceFactorMu,
    },
  }));
  return {
    id: name,
    name,
    heatFlowDirection: 'horizontal',
    layers: engineLayers,
  };
}

/** The wall the walkthrough opens on: a modern filled-cavity wall. */
const CAVITY_WALL: readonly TourLayer[] = [
  { id: 'pb', label: 'Plasterboard', thicknessMm: 12.5, lambdaWPerMK: 0.25, vapourResistanceFactorMu: 10, category: 'plaster-and-render' },
  { id: 'blk', label: 'Aircrete block', thicknessMm: 100, lambdaWPerMK: 0.15, vapourResistanceFactorMu: 6, category: 'masonry' },
  { id: 'ins', label: 'Mineral wool', thicknessMm: 100, lambdaWPerMK: 0.035, vapourResistanceFactorMu: 1, category: 'insulation' },
  { id: 'brk', label: 'Brick', thicknessMm: 102.5, lambdaWPerMK: 0.77, vapourResistanceFactorMu: 10, category: 'masonry' },
];

/**
 * A solid brick wall insulated on the inside with quilt and plasterboard, and no
 * vapour control layer. The classic retrofit that goes wrong.
 */
const INTERNAL_INSULATION: readonly TourLayer[] = [
  { id: 'pb', label: 'Plasterboard', thicknessMm: 12.5, lambdaWPerMK: 0.25, vapourResistanceFactorMu: 10, category: 'plaster-and-render' },
  { id: 'ins', label: 'Mineral wool', thicknessMm: 100, lambdaWPerMK: 0.035, vapourResistanceFactorMu: 1, category: 'insulation' },
  { id: 'brk', label: 'Solid brick', thicknessMm: 215, lambdaWPerMK: 0.77, vapourResistanceFactorMu: 10, category: 'masonry' },
];

/**
 * The same internally-insulated wall with a polythene vapour control layer on the warm
 * side of the insulation. 0.2 mm thick, so thermally it does nothing at all; at
 * mu = 100 000 it is worth 20 m of still air to vapour.
 */
const INTERNAL_INSULATION_WITH_VCL: readonly TourLayer[] = [
  { id: 'pb', label: 'Plasterboard', thicknessMm: 12.5, lambdaWPerMK: 0.25, vapourResistanceFactorMu: 10, category: 'plaster-and-render' },
  { id: 'vcl', label: 'Polythene sheet', thicknessMm: 0.2, lambdaWPerMK: 0.33, vapourResistanceFactorMu: 100000, category: 'membrane' },
  { id: 'ins', label: 'Mineral wool', thicknessMm: 100, lambdaWPerMK: 0.035, vapourResistanceFactorMu: 1, category: 'insulation' },
  { id: 'brk', label: 'Solid brick', thicknessMm: 215, lambdaWPerMK: 0.77, vapourResistanceFactorMu: 10, category: 'masonry' },
];

/** The same wall insulated on the outside instead. */
const EXTERNAL_INSULATION: readonly TourLayer[] = [
  { id: 'brk', label: 'Solid brick', thicknessMm: 215, lambdaWPerMK: 0.77, vapourResistanceFactorMu: 10, category: 'masonry' },
  { id: 'ins', label: 'Mineral wool', thicknessMm: 100, lambdaWPerMK: 0.035, vapourResistanceFactorMu: 1, category: 'insulation' },
  { id: 'rnd', label: 'Render', thicknessMm: 20, lambdaWPerMK: 1.0, vapourResistanceFactorMu: 25, category: 'plaster-and-render' },
];

/* ------------------------------------------------------------- the drawing ---- */

const WIDTH = 560;
/** Tall enough to keep the plot the same height once the callout has its headroom. */
const HEIGHT = 222;
/** Leaves room above the plot for a callout on a layer too thin to label in place. */
const PAD_TOP = 26;
const FILM = 26;

interface TourFigureProps {
  readonly layers: readonly TourLayer[];
  readonly showTemperature: boolean;
  readonly showDewPoint: boolean;
  readonly showRisk: boolean;
  readonly showLayerNames: boolean;
  /** Point at one layer by id, for a layer too thin to notice on its own. */
  readonly calloutLayerId?: string;
}

function TourFigure({
  layers,
  showTemperature,
  showDewPoint,
  showRisk,
  showLayerNames,
  calloutLayerId,
}: TourFigureProps): JSX.Element {
  const element = useMemo(() => toElement('tour', layers), [layers]);
  const result = useMemo(() => calculateUValue(element), [element]);
  const profile = useMemo(
    () => calculateTemperatureProfile(element, TOUR_CONDITIONS, 'combined'),
    [element],
  );

  const totalMm = layers.reduce((total, layer) => total + layer.thicknessMm, 0);
  const drawWidth = WIDTH - FILM * 2;
  const scale = drawWidth / totalMm;

  const boxes: { layer: TourLayer; x: number; width: number }[] = [];
  let cursor = FILM;
  for (const layer of layers) {
    // A 0.2 mm sheet in a 330 mm wall is a third of a pixel. Draw it at a minimum
    // width so it exists on screen; the caption says which layers this applies to.
    const trueWidth = layer.thicknessMm * scale;
    const width = Math.max(1.6, trueWidth);
    boxes.push({ layer, x: cursor, width });
    cursor += width;
  }

  const temperatures = profile.nodes.map((node) => node.temperatureC);
  const axisMax = Math.max(...temperatures, profile.internalDewPointTemperatureC) + 2;
  const axisMin = Math.min(...temperatures, profile.internalDewPointTemperatureC) - 2;
  const toY = (t: number): number =>
    PAD_TOP + ((axisMax - t) / (axisMax - axisMin)) * (HEIGHT - PAD_TOP - 34);

  const nodeX = (index: number): number => {
    if (index === 0) {
      return 0;
    }
    if (index === profile.nodes.length - 1) {
      return WIDTH;
    }
    const node = profile.nodes[index];
    return node === undefined ? 0 : FILM + node.positionM * 1000 * scale;
  };

  const points = profile.nodes
    .map((node, index) => `${nodeX(index).toFixed(1)},${toY(node.temperatureC).toFixed(1)}`)
    .join(' ');

  const calloutBox =
    calloutLayerId === undefined
      ? undefined
      : boxes.find((box) => box.layer.id === calloutLayerId);

  // The coldest interface that is below the internal dew point, which is the one worth
  // pointing at. Surfaces are excluded: the internal one is a different phenomenon
  // (surface condensation) and the external one is outside the construction.
  const riskNode = profile.nodes
    .map((node, index) => ({ node, index }))
    .filter(({ node }) => node.kind === 'interface' && node.isBelowInternalDewPoint)
    .sort((a, b) => a.node.temperatureC - b.node.temperatureC)[0];

  return (
    <figure className="tour-figure">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="Cross-section with temperature">
        <rect x="0" y={PAD_TOP} width={FILM} height={HEIGHT - PAD_TOP - 34} fill="url(#film-hatch)" />
        <rect
          x={WIDTH - FILM}
          y={PAD_TOP}
          width={FILM}
          height={HEIGHT - PAD_TOP - 34}
          fill="url(#film-hatch)"
        />

        {boxes.map((box, index) => {
          const style = CATEGORY_STYLE[box.layer.category];
          return (
            <g key={box.layer.id} className="tour-layer" style={{ animationDelay: `${index * 130}ms` }}>
              <rect x={box.x} y={PAD_TOP} width={box.width} height={HEIGHT - PAD_TOP - 34} fill={style.fill} />
              {style.hatch !== undefined && (
                <rect
                  x={box.x}
                  y={PAD_TOP}
                  width={box.width}
                  height={HEIGHT - PAD_TOP - 34}
                  fill={`url(#${style.hatch})`}
                />
              )}
              <rect
                x={box.x}
                y={PAD_TOP}
                width={box.width}
                height={HEIGHT - PAD_TOP - 34}
                fill="none"
                stroke="var(--layer-edge)"
                strokeWidth="0.75"
              />
              {showLayerNames && box.width > 30 && (
                <text
                  className="tour-layer-name"
                  transform={`translate(${(box.x + box.width / 2).toFixed(1)}, ${
                    HEIGHT - 42
                  }) rotate(-90)`}
                >
                  {box.layer.label}
                </text>
              )}
            </g>
          );
        })}

        {showDewPoint && (
          <g className="tour-dew">
            <rect
              x="0"
              y={toY(profile.internalDewPointTemperatureC)}
              width={WIDTH}
              height={Math.max(
                0,
                PAD_TOP + (HEIGHT - PAD_TOP - 34) - toY(profile.internalDewPointTemperatureC),
              )}
              className="dew-point-band"
            />
            <line
              x1="0"
              y1={toY(profile.internalDewPointTemperatureC)}
              x2={WIDTH}
              y2={toY(profile.internalDewPointTemperatureC)}
              className="dew-point-line"
            />
            <text x="4" y={toY(profile.internalDewPointTemperatureC) - 5} className="dew-point-label">
              dew point {profile.internalDewPointTemperatureC.toFixed(1)} °C
            </text>
          </g>
        )}

        {showTemperature && (
          <>
            <polyline points={points} className="temperature-line-shadow tour-line" pathLength={1} />
            <polyline points={points} className="temperature-line tour-line" pathLength={1} />
          </>
        )}

        {showRisk && riskNode !== undefined && (
          <g className="tour-risk">
            <circle
              cx={nodeX(riskNode.index)}
              cy={toY(riskNode.node.temperatureC)}
              r="9"
              className="risk-halo"
            />
            <circle
              cx={nodeX(riskNode.index)}
              cy={toY(riskNode.node.temperatureC)}
              r="4.5"
              className="node node-risk"
            />
            {/*
              A leader out to the right, where the drawing is empty at this height, so
              the callout does not sit on top of the very junction it points at.
            */}
            <line
              x1={nodeX(riskNode.index) + 8}
              y1={toY(riskNode.node.temperatureC)}
              x2={nodeX(riskNode.index) + 26}
              y2={toY(riskNode.node.temperatureC) - 18}
              className="risk-leader"
            />
            <text
              x={nodeX(riskNode.index) + 29}
              y={toY(riskNode.node.temperatureC) - 22}
              className="tour-risk-label"
            >
              {riskNode.node.temperatureC.toFixed(1)} °C
            </text>
            <text
              x={nodeX(riskNode.index) + 29}
              y={toY(riskNode.node.temperatureC) - 11}
              className="tour-risk-sub"
            >
              below the {profile.internalDewPointTemperatureC.toFixed(1)} °C dew point
            </text>
          </g>
        )}

        {calloutBox !== undefined && (
          <g className="tour-callout">
            <line
              x1={calloutBox.x + calloutBox.width / 2}
              y1={PAD_TOP}
              x2={calloutBox.x + calloutBox.width / 2}
              y2={PAD_TOP - 7}
              className="callout-leader"
            />
            <text
              x={calloutBox.x + calloutBox.width / 2}
              y={PAD_TOP - 10}
              className="callout-label"
              textAnchor="middle"
            >
              {calloutBox.layer.thicknessMm} mm · S
              <tspan baselineShift="sub" fontSize="7">
                d
              </tspan>{' '}
              {(
                (calloutBox.layer.vapourResistanceFactorMu * calloutBox.layer.thicknessMm) /
                1000
              ).toFixed(0)}{' '}
              m
            </text>
          </g>
        )}

        <text x="2" y={HEIGHT - 8} className="side-label">
          inside
        </text>
        <text x={WIDTH - 2} y={HEIGHT - 8} className="side-label" textAnchor="end">
          outside
        </text>
      </svg>
      <figcaption>
        U = {result.uValueWPerM2K === null ? '—' : result.uValueWPerM2K.toFixed(2)} W/(m²·K) at
        20 °C / 50 % inside and 0 °C / 90 % outside.
      </figcaption>
    </figure>
  );
}

/* ----------------------------------------------------------------- the tour --- */

interface Step {
  readonly title: string;
  readonly body: JSX.Element;
  readonly layers: readonly TourLayer[];
  readonly showTemperature: boolean;
  readonly showDewPoint: boolean;
  readonly showRisk: boolean;
  readonly showLayerNames: boolean;
  readonly calloutLayerId?: string;
}

const STEPS: readonly Step[] = [
  {
    title: 'The wall, drawn to scale',
    layers: CAVITY_WALL,
    showTemperature: false,
    showDewPoint: false,
    showLayerNames: true,
    showRisk: false,
    body: (
      <>
        <p>
          Layers run <strong>inside on the left, outside on the right</strong>, each drawn at its
          real thickness. The hatching says what a layer is made of — coursing for masonry, a
          soft wave for quilt insulation — and the same hatch appears beside the material in the
          list, so the drawing and the list read as one thing.
        </p>
        <p>
          The two diagonally-hatched strips at the edges are the <em>surface resistances</em>:
          the thin films of still air clinging to each face. They have no thickness, so they are
          drawn at a fixed width.
        </p>
      </>
    ),
  },
  {
    title: 'The line is the temperature',
    layers: CAVITY_WALL,
    showTemperature: true,
    showDewPoint: false,
    showLayerNames: true,
    showRisk: false,
    body: (
      <>
        <p>
          The line falls from the inside temperature to the outside one. Its{' '}
          <strong>steepness is the whole story</strong>: it plunges through the insulation, which
          resists heat, and barely tilts through the brick, which does not.
        </p>
        <p>
          A layer's width on screen is its thickness; its share of the <em>drop</em> is its share
          of the resistance. Two layers of the same thickness can take wildly different bites out
          of the line.
        </p>
      </>
    ),
  },
  {
    title: 'The dashed line is the dew point',
    layers: CAVITY_WALL,
    showTemperature: true,
    showDewPoint: true,
    showLayerNames: true,
    showRisk: false,
    body: (
      <>
        <p>
          Warm air holds more moisture than cold air. Cool a parcel of air far enough and it can
          no longer hold what it has, and the surplus becomes liquid. That temperature is the{' '}
          <strong>dew point</strong> — here 9.3 °C, for air at 20 °C and 50 % humidity.
        </p>
        <p>
          Anywhere the temperature line dips into the tinted band, the construction is colder
          than the dew point. In this wall it only does so out in the brick, beyond the
          insulation, which is exactly where you want it.
        </p>
      </>
    ),
  },
  {
    title: 'When it goes wrong: insulating inside',
    layers: INTERNAL_INSULATION,
    showTemperature: true,
    showDewPoint: true,
    showLayerNames: true,
    showRisk: true,
    body: (
      <>
        <p>
          The same idea applied to a solid brick wall, insulated on the <strong>inside</strong>{' '}
          with quilt and plasterboard and no vapour control layer. The insulation now keeps the
          heat off the brick, so the brick is cold — and the junction between insulation and
          brick sits far below the dew point.
        </p>
        <p>
          That junction is <strong>inside the construction</strong>, where you cannot see it and
          it cannot dry easily. Worse, almost nothing stops moisture getting there: quilt and
          plasterboard together hold back about as much water vapour as a fifth of a metre of
          still air, so room air reaches the cold brick more or less unimpeded and gives up its
          moisture on it. Damp brick, rotting embedded joist ends, mould behind the lining. This
          is <em>interstitial condensation</em>, and it is the failure this drawing exists to
          make visible.
        </p>
      </>
    ),
  },
  {
    title: 'One fix: a vapour barrier',
    layers: INTERNAL_INSULATION_WITH_VCL,
    showTemperature: true,
    showDewPoint: true,
    showLayerNames: true,
    showRisk: true,
    calloutLayerId: 'vcl',
    body: (
      <>
        <p>
          The same wall again, with one thing added: a sheet of polythene on the warm side
          of the insulation, <strong>0.2 mm thick</strong>. It is the hairline marked at the
          top of the drawing — at this scale it is barely a line.
        </p>
        <p>
          Look at what did <em>not</em> change. The temperature line is in exactly the same
          place, and the U-value is identical to two decimal places: a fifth of a millimetre
          of plastic is worth nothing thermally. The junction out at the brick is still at
          1.9 °C and is <strong>still flagged</strong>.
        </p>
        <p>
          What changed is invisible on this drawing. Before the sheet, everything between the
          room and that cold junction added up to 0.23 m of equivalent still air. With it,
          <strong> 20.2 m</strong> — about ninety times harder for vapour to cross. The
          moisture largely never arrives, so it cannot condense.
        </p>
        <p className="tour-caveat">
          This is exactly why OpenUValue calls its dew-point check a{' '}
          <strong>screening indicator</strong> rather than a verdict. Being colder than the
          dew point is necessary for condensation but not sufficient — whether vapour gets
          there is the other half, and judging that properly is a BS EN ISO 13788 calculation
          this tool does not yet do. The S<sub>d</sub> figures beside each layer are what you
          would weigh up by hand in the meantime.
        </p>
      </>
    ),
  },
  {
    title: 'The better fix: insulate outside',
    layers: EXTERNAL_INSULATION,
    showTemperature: true,
    showDewPoint: true,
    showLayerNames: true,
    showRisk: false,
    body: (
      <>
        <p>
          Move the insulation to the outside face and the brick sits on the warm side of it. The
          whole masonry wall now stays well above the dew point, and the cold part of the
          build-up is the insulation and render, which tolerate it. Nothing has to be kept dry
          by a sheet of plastic that has to be installed perfectly and stay intact for decades:
          the geometry does the work.
        </p>
        <p>
          Same wall, same insulation, same weather — the order of the layers is what changed.
          And here is the part worth remembering: <strong>both versions land at almost exactly
          the same U-value</strong>, near 0.30 W/(m²·K). One of them quietly wets its brickwork
          and the other does not. A U-value on its own cannot tell you which is which, and that
          is why this drawing sits above the number rather than beside it.
        </p>
        <p>
          Drag a layer and watch the line move.
        </p>
      </>
    ),
  },
];

export interface IntroTourProps {
  readonly open: boolean;
  readonly onClose: () => void;
}

export function IntroTour({ open, onClose }: IntroTourProps): JSX.Element | null {
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        onClose();
      }
      if (event.key === 'ArrowRight') {
        setStep((current) => Math.min(STEPS.length - 1, current + 1));
      }
      if (event.key === 'ArrowLeft') {
        setStep((current) => Math.max(0, current - 1));
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  const current = STEPS[step];
  if (current === undefined) {
    return null;
  }
  const isLast = step === STEPS.length - 1;

  return (
    <div className="tour-backdrop" role="dialog" aria-modal="true" aria-label="How to read the cross-section">
      <div className="tour-dialog">
        <div className="tour-head">
          <h2>{current.title}</h2>
          <button type="button" className="ghost-button" onClick={onClose}>
            Close
          </button>
        </div>

        {/*
          Keyed on the step so the reveal animations restart each time rather than
          only playing once on mount.
        */}
        <TourFigure
          key={step}
          layers={current.layers}
          showTemperature={current.showTemperature}
          showDewPoint={current.showDewPoint}
          showRisk={current.showRisk}
          showLayerNames={current.showLayerNames}
          calloutLayerId={current.calloutLayerId}
        />

        <div className="tour-body">{current.body}</div>

        <div className="tour-foot">
          <div className="tour-dots" aria-hidden="true">
            {STEPS.map((entry, index) => (
              <span
                key={entry.title}
                className={index === step ? 'tour-dot is-current' : 'tour-dot'}
              />
            ))}
          </div>
          <div className="tour-buttons">
            <button
              type="button"
              className="ghost-button"
              onClick={() => setStep((c) => Math.max(0, c - 1))}
              disabled={step === 0}
            >
              Back
            </button>
            {isLast ? (
              <button type="button" className="primary-button" onClick={onClose}>
                Start building
              </button>
            ) : (
              <button
                type="button"
                className="primary-button"
                onClick={() => setStep((c) => Math.min(STEPS.length - 1, c + 1))}
              >
                Next
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** A legend of the material hatches, for the page itself rather than the tour. */
export function HatchLegend(): JSX.Element {
  const categories: readonly LayerDrawCategory[] = [
    'masonry',
    'concrete',
    'timber-and-board',
    'insulation',
    'plaster-and-render',
    'membrane',
    'covering',
    'air',
  ];
  return (
    <ul className="hatch-legend">
      {categories.map((category) => (
        <li key={category}>
          <MaterialSwatch category={category} size={16} />
          {CATEGORY_STYLE[category].label}
        </li>
      ))}
    </ul>
  );
}
