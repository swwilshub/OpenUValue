import { useRef, useState } from 'react';
import type { ProfileSection, TemperatureProfile, UValueResult } from '@openuvalue/engine';
import type { LayerDrawCategory, UiLayer } from '../state/model.js';
import { bridgePitchMm, layerDrawCategory } from '../state/model.js';
import { CATEGORY_STYLE } from './hatches.js';

/**
 * A to-scale cross-section with the steady-state temperature line drawn over it.
 * Internal on the left, external on the right, matching the layer table.
 *
 * Layer widths are strictly proportional to thickness. The two surface-resistance
 * films have no thickness at all, so they are drawn as fixed-width hatched bands and
 * labelled as not to scale - the temperature drop across them is real and worth
 * seeing, but their width on screen is a drawing device.
 *
 * Vertical position **in the plot** means temperature and nothing else. Layer hatching
 * is decorative and identifies the material; it never encodes a quantity.
 *
 * Studs and rafters are therefore drawn in a register of their own, directly beneath the
 * plot and on the same horizontal scale, where the vertical axis means length along the
 * wall. That keeps the members at their true width and pitch — which is what you want to
 * see, and what the percentage beside the layer cannot show — without the temperature
 * axis having to mean two things at once. The two registers share x, so a stud column
 * lines up with the layer it belongs to.
 */
const FILM_WIDTH = 44;
const DRAW_WIDTH = 660;
const PLOT_HEIGHT = 260;
const TOP_PAD = 18;
const AXIS_WIDTH = 46;
/**
 * The drawing starts slightly left of zero so the internal-air node, which sits at
 * x = 0, is not cut in half by the edge.
 */
const VIEWBOX_MIN_X = -7;

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
/** Gap between a layer's name and the bridging line drawn beside it. */
const BRIDGING_LINE_OFFSET = 14;

/** Height of the stud register, and the gap between it and the plot above. */
const STUD_BAND_HEIGHT = 150;
const STUD_BAND_GAP = 52;
/**
 * How much wall the register shows, as a multiple of the widest pitch.
 *
 * A member is only a few per cent of its pitch — 38 mm at 600 mm centres is 6 % — so on
 * any faithful scale it is a thin band, and every extra bay makes it thinner. Just under
 * two bays shows the rhythm while keeping the member thick enough to see; the register
 * is to scale, so this is the only lever there is.
 */
const STUD_BAND_BAYS = 1.8;
/** Minimum drawn width before a stud column can carry its own dimension caption. */
const MIN_WIDTH_FOR_STUD_CAPTION = 58;

/** Trim a label to what will fit along the height of the plot, with an ellipsis. */
function fitLabel(text: string, availableLength: number): string {
  const maxCharacters = Math.floor(availableLength / LABEL_CHAR_WIDTH);
  if (maxCharacters <= 1 || text.length <= maxCharacters) {
    return text;
  }
  return `${text.slice(0, Math.max(1, maxCharacters - 1)).trimEnd()}…`;
}

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
  /** Layer highlighted in the layer table, so the drawing and the table agree. */
  readonly selectedLayerId?: string | undefined;
  readonly onSelectLayer?: ((layerId: string | undefined) => void) | undefined;
  /** Reorder by dragging a layer along the drawing. Same contract as the table's. */
  readonly onReorder?: ((from: number, to: number) => void) | undefined;
}

export function CrossSection({
  layers,
  result,
  profile,
  selectedLayerId,
  onSelectLayer,
  onReorder,
}: CrossSectionProps): JSX.Element {
  const svgRef = useRef<SVGSVGElement | null>(null);
  /**
   * Dragging a layer along the drawing. `from` is the layer picked up, `to` the gap it
   * would drop into, and `moved` distinguishes a drag from a click: without it, every
   * attempt to select a layer would also count as a reorder to where it already is.
   */
  const [drag, setDrag] = useState<{
    readonly from: number;
    readonly to: number;
    readonly startClientX: number;
    readonly moved: boolean;
  } | null>(null);
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

  const viewBoxWidth = totalWidth + AXIS_WIDTH - VIEWBOX_MIN_X;

  /*
   * The stud register. Only layers sized by width-and-spacing can be drawn: a layer
   * given as a flat percentage (BR 443's whole-wall defaults, say) has no geometry to
   * draw, and inventing a spacing for it would be a drawing that says more than is known.
   */
  const studColumns = boxes
    .filter(
      (box) =>
        box.included &&
        box.layer.kind === 'solid' &&
        box.layer.bridgedPercent > 0 &&
        box.layer.bridgeSizing === 'dimensions' &&
        box.layer.bridgeWidthMm > 0,
    )
    .map((box) => ({
      box,
      widthMm: box.layer.bridgeWidthMm,
      pitchMm: bridgePitchMm(
        box.layer.bridgeWidthMm,
        box.layer.bridgeSpacingMm,
        box.layer.bridgeDistanceBasis,
      ),
    }))
    .filter((column) => column.pitchMm > 0);

  /*
   * A layer bridged by a flat percentage — BR 443's whole-wall defaults, say — has a
   * known area fraction but no geometry, so there is nothing to draw. It still gets a
   * column in the register, captioned to say why it is empty, because silently omitting
   * it would suggest the layer is not bridged at all.
   */
  const fractionColumns = boxes.filter(
    (box) =>
      box.included &&
      box.layer.kind === 'solid' &&
      box.layer.bridgedPercent > 0 &&
      (box.layer.bridgeSizing !== 'dimensions' || box.layer.bridgeWidthMm <= 0),
  );

  const showStudBand = studColumns.length > 0 || fractionColumns.length > 0;
  /*
   * One length scale for the whole register, taken from the widest pitch, so two layers
   * at different spacings are drawn against each other honestly — a 600 mm pitch really
   * does look sparser than a 400 mm one.
   */
  const studBandLengthMm =
    studColumns.length > 0
      ? Math.max(...studColumns.map((column) => column.pitchMm)) * STUD_BAND_BAYS
      : 0;
  const studBandY = PLOT_HEIGHT + TOP_PAD + STUD_BAND_GAP;
  const mmToBandY = studBandLengthMm > 0 ? STUD_BAND_HEIGHT / studBandLengthMm : 0;
  const viewBoxHeight =
    PLOT_HEIGHT + TOP_PAD + (showStudBand ? STUD_BAND_GAP + STUD_BAND_HEIGHT + 34 : 66);

  /** Members at their true width and pitch, from the top of the register downwards. */
  const studRects = (widthMm: number, pitchMm: number): readonly { y: number; h: number }[] => {
    const out: { y: number; h: number }[] = [];
    const height = Math.max(1, widthMm * mmToBandY);
    // Centre the first member half a pitch in, so the pattern does not start flush
    // against the edge and read as though a member sat exactly on the boundary.
    for (let centreMm = pitchMm / 2; centreMm < studBandLengthMm; centreMm += pitchMm) {
      const y = studBandY + (centreMm - widthMm / 2) * mmToBandY;
      out.push({ y, h: height });
    }
    return out;
  };

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

  /**
   * Client x to the SVG's own coordinates. The viewBox is uniformly scaled (the SVG is
   * width:100%, height:auto with the default preserveAspectRatio), so one ratio does
   * it; getScreenCTM would need a DOMPoint and buys nothing here.
   */
  const toUserX = (clientX: number): number => {
    const svg = svgRef.current;
    if (svg === null) {
      return 0;
    }
    const rect = svg.getBoundingClientRect();
    if (rect.width === 0) {
      return 0;
    }
    return VIEWBOX_MIN_X + ((clientX - rect.left) / rect.width) * viewBoxWidth;
  };

  /** The gap between layers that a pointer at this position would drop into. */
  const dropIndexAt = (clientX: number): number => {
    const userX = toUserX(clientX);
    for (const [index, box] of boxes.entries()) {
      if (userX < box.x + box.width / 2) {
        return index;
      }
    }
    return boxes.length;
  };

  /** How far the pointer must travel before a press counts as a drag, not a click. */
  const DRAG_THRESHOLD_PX = 4;

  return (
    <figure className="cross-section">
      <svg
        ref={svgRef}
        viewBox={`${VIEWBOX_MIN_X} 0 ${viewBoxWidth} ${viewBoxHeight}`}
        className={drag?.moved === true ? 'is-dragging' : undefined}
        onPointerMove={(event) => {
          if (drag === null) {
            return;
          }
          const moved =
            drag.moved || Math.abs(event.clientX - drag.startClientX) > DRAG_THRESHOLD_PX;
          setDrag({ ...drag, moved, to: dropIndexAt(event.clientX) });
        }}
        onPointerUp={(event) => {
          if (drag === null) {
            return;
          }
          if (drag.moved) {
            onReorder?.(drag.from, dropIndexAt(event.clientX));
          } else {
            // A press that never moved is a click: select, or clear the selection.
            const layer = layers[drag.from];
            onSelectLayer?.(
              layer !== undefined && layer.id === selectedLayerId ? undefined : layer?.id,
            );
          }
          setDrag(null);
        }}
        onPointerLeave={() => setDrag(null)}
        role="img"
        aria-label={`Cross-section of ${layers.length} layers with the temperature profile overlaid`}
      >
        <defs>
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
        {boxes.map((box, index) => {
          const style = CATEGORY_STYLE[box.category];
          const bridgedPercent = box.layer.kind === 'solid' ? box.layer.bridgedPercent : 0;
          const isSelected = box.layer.id === selectedLayerId;
          // Two rotated lines only fit on a layer drawn wide enough for both.
          const showBridgingLine =
            bridgedPercent > 0 && box.width >= MIN_WIDTH_FOR_NAME + BRIDGING_LINE_OFFSET;
          return (
            <g
              key={box.layer.id}
              className={[
                'layer-box',
                isSelected ? 'layer-box-selected' : '',
                drag?.moved === true && drag.from === index ? 'layer-box-dragging' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onPointerDown={(event) => {
                if (onReorder === undefined && onSelectLayer === undefined) {
                  return;
                }
                // A pointerdown on an SVG element still begins a text selection, which
                // then sweeps up every label the pointer crosses. Preventing the default
                // stops the selection before it starts; the drag itself is driven from
                // pointermove, so nothing is lost by it.
                event.preventDefault();
                // Capture on the SVG, so a fast drag that outruns the pointer keeps
                // sending moves instead of stranding the drag mid-gesture.
                event.currentTarget.ownerSVGElement?.setPointerCapture(event.pointerId);
                setDrag({ from: index, to: index, startClientX: event.clientX, moved: false });
              }}
            >
              <title>
                {`${box.layer.label} — ${box.layer.thicknessMm} mm`}
                {box.layer.kind === 'solid'
                  ? `, \u03bb ${box.layer.lambdaWPerMK} W/(m\u00b7K)`
                  : ''}
              </title>
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
              {isSelected && (
                <rect
                  x={box.x}
                  y={TOP_PAD}
                  width={box.width}
                  height={PLOT_HEIGHT}
                  className="layer-selection"
                />
              )}
              {box.width >= MIN_WIDTH_FOR_NAME && (
                <text
                  className="layer-name"
                  transform={`translate(${(
                    box.x +
                    box.width / 2 -
                    // Shift left to leave room for the bridging line beside it, so the
                    // pair still reads as centred on the layer.
                    (showBridgingLine ? BRIDGING_LINE_OFFSET / 2 : 0)
                  ).toFixed(2)}, ${TOP_PAD + PLOT_HEIGHT - 8}) rotate(-90)`}
                >
                  {fitLabel(box.layer.label, PLOT_HEIGHT - 24)}
                </text>
              )}
              {/*
                The bridging goes on its own line rather than being appended to the
                name: one long string gets trimmed mid-word, and the member is a
                different kind of fact from what the layer is made of.
              */}
              {showBridgingLine && (
                <text
                  className="layer-name layer-name-bridging"
                  transform={`translate(${(
                    box.x +
                    box.width / 2 +
                    BRIDGING_LINE_OFFSET / 2
                  ).toFixed(2)}, ${TOP_PAD + PLOT_HEIGHT - 8}) rotate(-90)`}
                >
                  {fitLabel(
                    `${bridgedPercent.toFixed(1)}% ${box.layer.bridgeLabel}`,
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

        {/* Where the dragged layer would land. */}
        {drag?.moved === true && (
          <line
            x1={boxes[drag.to]?.x ?? externalFilmX}
            y1={TOP_PAD - 6}
            x2={boxes[drag.to]?.x ?? externalFilmX}
            y2={TOP_PAD + PLOT_HEIGHT + 6}
            className="drop-indicator"
          />
        )}

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

        {/* ------------------------------------------- studs and rafters, to scale --- */}
        {showStudBand && (
          <g className="stud-band">
            {/*
              The whole wall faintly behind, so the register reads as the same build-up
              seen along its length rather than as a separate diagram.
            */}
            {boxes
              .filter((box) => box.included)
              .map((box) => (
                <rect
                  key={`stud-bg-${box.layer.id}`}
                  x={box.x}
                  y={studBandY}
                  width={box.width}
                  height={STUD_BAND_HEIGHT}
                  className="stud-band-layer"
                />
              ))}

            {studColumns.map((column) => (
              <g key={`studs-${column.box.layer.id}`}>
                {studRects(column.widthMm, column.pitchMm).map((rect, index) => (
                  <g key={index}>
                    <rect
                      x={column.box.x}
                      y={rect.y}
                      width={column.box.width}
                      height={rect.h}
                      fill={CATEGORY_STYLE['timber-and-board'].fill}
                    />
                    <rect
                      x={column.box.x}
                      y={rect.y}
                      width={column.box.width}
                      height={rect.h}
                      fill={`url(#${CATEGORY_STYLE['timber-and-board'].hatch ?? ''})`}
                    />
                    <rect
                      x={column.box.x}
                      y={rect.y}
                      width={column.box.width}
                      height={rect.h}
                      className="stud-member"
                    />
                  </g>
                ))}
                <title>
                  {`${column.box.layer.bridgeLabel}: ${column.widthMm} mm wide at ` +
                    `${column.pitchMm.toFixed(0)} mm centres ` +
                    `(${column.box.layer.bridgedPercent.toFixed(1)}% of the face)`}
                </title>
              </g>
            ))}

            {fractionColumns.map((box) => (
              <g key={`stud-fraction-${box.layer.id}`}>
                <rect
                  x={box.x}
                  y={studBandY}
                  width={box.width}
                  height={STUD_BAND_HEIGHT}
                  className="stud-band-unknown"
                />
                <title>
                  {`${box.layer.bridgeLabel}: ${box.layer.bridgedPercent.toFixed(1)}% of the ` +
                    'face, given as a percentage. Set a member width and spacing to draw them.'}
                </title>
              </g>
            ))}

            {/* The register's own outline, so its edges are not mistaken for layers. */}
            <rect
              x={0}
              y={studBandY}
              width={totalWidth}
              height={STUD_BAND_HEIGHT}
              className="stud-band-frame"
            />

            {/* The length scale this register is drawn to. */}
            {studColumns.length > 0 && (
              <>
                {/*
                  On the right, where the temperature axis leaves room. On the left it
                  would run past the edge of the viewBox and be clipped away.
                */}
                <line
                  x1={totalWidth + 6}
                  y1={studBandY}
                  x2={totalWidth + 6}
                  y2={studBandY + STUD_BAND_HEIGHT}
                  className="stud-scale-line"
                />
                {/*
                  Anchored to the right edge of the viewBox rather than to the scale
                  line: "1080 mm" set leftwards from the line runs off the drawing.
                */}
                <text
                  x={totalWidth + AXIS_WIDTH - 2}
                  y={studBandY + 8}
                  className="stud-scale-label"
                  textAnchor="end"
                >
                  0
                </text>
                <text
                  x={totalWidth + AXIS_WIDTH - 2}
                  y={studBandY + STUD_BAND_HEIGHT}
                  className="stud-scale-label"
                  textAnchor="end"
                >
                  {studBandLengthMm.toFixed(0)} mm
                </text>
              </>
            )}

            {fractionColumns.map((box) =>
              box.width >= MIN_WIDTH_FOR_STUD_CAPTION ? (
                <text
                  key={`stud-fraction-caption-${box.layer.id}`}
                  x={box.x + box.width / 2}
                  y={studBandY + STUD_BAND_HEIGHT + 13}
                  className="stud-caption stud-caption-unknown"
                  textAnchor="middle"
                >
                  {`${box.layer.bridgedPercent.toFixed(1)}%, no spacing given`}
                </text>
              ) : null,
            )}

            {studColumns.map((column) =>
              column.box.width >= MIN_WIDTH_FOR_STUD_CAPTION ? (
                <text
                  key={`stud-caption-${column.box.layer.id}`}
                  x={column.box.x + column.box.width / 2}
                  y={studBandY + STUD_BAND_HEIGHT + 13}
                  className="stud-caption"
                  textAnchor="middle"
                >
                  {`${column.widthMm} @ ${column.pitchMm.toFixed(0)} crs`}
                </text>
              ) : null,
            )}

            <text x={0} y={studBandY + STUD_BAND_HEIGHT + 27} className="stud-band-title">
              {studColumns.length > 0
                ? 'along the wall — members at true width and pitch'
                : 'along the wall — set a member width and spacing to draw the members'}
            </text>
          </g>
        )}
      </svg>
      <figcaption>
        Layer widths are to scale and captioned in millimetres; the two hatched bands
        are the internal and external surface resistances, which have no thickness and
        are drawn at a fixed width. Height means temperature only — the hatching shows
        what each layer is made of and the tinted band is everything at or below the
        internal dew point. Drag a layer sideways to reorder it, or click one to pick
        it out in the layer list.
        {hasBridgedLayer &&
          ' A bridged layer is outlined in the accent colour and labelled with its bridged percentage.' +
          (showStudBand
            ? ' The band underneath looks along the wall instead of through it, so studs and rafters appear at their true width and pitch; its vertical scale is a length, not a temperature.'
            : '')}
        {lastIncludedIndex < layers.length - 1 &&
          ' The cross-hatched layers beyond the ventilated cavity are disregarded by the calculation.'}
        {hasThinLayer && ' Layers thinner than the line width are drawn as a single line.'}
      </figcaption>
    </figure>
  );
}
