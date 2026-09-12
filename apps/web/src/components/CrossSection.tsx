import { useRef, useState } from 'react';
import type {
  CondensationMarkers,
  PeriodAssessment,
  InterfaceCondition,
  InterfaceMarker,
  ProfileSection,
  TemperatureProfile,
  UValueResult,
} from '@openuvalue/engine';
import type { LayerDrawCategory, UiLayer } from '../state/model.js';
import { bridgePitchMm, layerDrawCategory } from '../state/model.js';
import { CATEGORY_STYLE } from './hatches.js';
import { temperatureIntervalC } from '../format.js';

/**
 * A to-scale cross-section with the steady-state temperature line drawn over it.
 * Internal on the left, external on the right, matching the layer table.
 *
 * Layer widths are strictly proportional to thickness. The two surface-resistance
 * films have no thickness at all, so they are drawn as fixed-width hatched bands and
 * labelled as not to scale - the temperature drop across them is real and worth
 * seeing, but their width on screen is a drawing device.
 *
 * **The drawing is a section; the temperature is an overlay.** Height is a length of
 * wall, which is what lets studs and rafters be drawn inside the layers they bridge, at
 * their true width and pitch. The temperature line is plotted over that section against
 * its own axis, the degrees scale on the right — so a member drawn level with 9 °C means
 * nothing thermal, any more than a brick does. The caption says as much, and the
 * degrees axis is on the right where a reader looks for it.
 *
 * Layer hatching is decorative and identifies the material; it never encodes a quantity.
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

/**
 * Condensation drops: one per plane the vapour calculation wets, sized by how much
 * water arrives there.
 *
 * **Area is proportional to the rate**, so two drops compare by the ink in them rather
 * than by their width — radius therefore goes as the square root. The reference below
 * fixes the scale in absolute terms: the same rate always draws the same size, whatever
 * else is on screen, because a drop that resized itself against the worst plane in the
 * current build-up would make a trivial amount look alarming the moment it was the only
 * one.
 *
 * **In-house convention.** The reference rate is a drawing constant chosen so that
 * typical results land in a legible range; it is **not** a threshold from any standard,
 * and nothing about the drop implies a pass or a fail. BS EN ISO 13788 judges a
 * build-up on whether it dries out over a year, which a single set of conditions cannot
 * answer. The figure printed beside each drop is the result; the size is a reading aid,
 * and it is clamped at both ends, so the number is the thing to trust.
 */
const DROP_REFERENCE_RATE_G_PER_M2_DAY = 30;
const DROP_REFERENCE_RADIUS = 13;
const DROP_MIN_RADIUS = 7;
const DROP_MAX_RADIUS = 20;

/**
 * A unit teardrop: body circle of radius 1 about the origin, drawn up to a point at
 * y = -1.8. Scaling this by the drop radius keeps the shape identical at every size.
 */
const DROP_PATH = 'M 0,-1.8 C 0.55,-1 1,-0.45 1,0 A 1,1 0 0 1 -1,0 C -1,-0.45 -0.55,-1 0,-1.8 Z';

/** Kept between a badge and the temperature line it hangs off. */
const DROP_CLEARANCE = 14;

/**
 * Character widths for the badge's two lines, measured in the browser rather than
 * guessed: 7.08 px/char for the 11px bold headline and 6.18 for the 10.5px rate. SVG
 * cannot measure text before it is laid out, so the panel behind it has to be sized
 * from an estimate - and an estimate taken from the real thing, rounded up, is what
 * keeps the words inside the panel.
 */
const BADGE_HEADLINE_CHAR_WIDTH = 7.2;
const BADGE_RATE_CHAR_WIDTH = 6.3;
const BADGE_PAD = 9;

function dropRadius(ratePerDayGPerM2: number): number {
  const scaled =
    DROP_REFERENCE_RADIUS *
    Math.sqrt(Math.abs(ratePerDayGPerM2) / DROP_REFERENCE_RATE_G_PER_M2_DAY);
  return Math.min(DROP_MAX_RADIUS, Math.max(DROP_MIN_RADIUS, scaled));
}

/** Rates span orders of magnitude, so the label switches unit rather than showing 0.0. */
function formatRate(ratePerDayGPerM2: number): string {
  const magnitude = Math.abs(ratePerDayGPerM2);
  if (magnitude >= 100) {
    return `${Math.round(magnitude)} g/m²·day`;
  }
  if (magnitude >= 1) {
    return `${magnitude.toFixed(1)} g/m²·day`;
  }
  return `${magnitude.toFixed(2)} g/m²·day`;
}

/** Accumulated water, in the unit that keeps it comparable with the daily rate. */
function formatMass(kgPerM2: number): string {
  const grams = kgPerM2 * 1000;
  return grams >= 1000 ? `${kgPerM2.toFixed(2)} kg/m²` : `${Math.round(grams)} g/m²`;
}

/**
 * What each marker means, in the words used beside it. Kept here rather than in the
 * engine because it is wording, not classification.
 */
/**
 * Marker size by condition. Size is one of three cues that separate them - size, colour
 * and, for the two loud cases, a second ring - because colour alone is not a signal
 * everyone can read, and because the old drawing distinguished a flagged node from a
 * plain one by 1.5 px of radius and a fill.
 */
const NODE_RADIUS: Readonly<Record<InterfaceCondition, number>> = {
  'surface-condensation': 6,
  condensing: 5.5,
  evaporating: 4.5,
  'below-dew-point': 4,
  dry: 3.5,
};

/** The short name that goes in the badge on the drawing. */
const CONDITION_HEADLINE: Readonly<Record<InterfaceCondition, string>> = {
  'surface-condensation': 'Surface condensation',
  condensing: 'Condensation',
  evaporating: 'Drying out',
  'below-dew-point': 'Cold, staying dry',
  dry: '',
};

/**
 * What is actually happening at a flagged interface, in plain words. This is the part
 * that turns a marker into information: a reader can see that an interface is marked
 * without being able to say why it is marked, and hovering for a tooltip is not
 * discovery - you have to already suspect there is something to find.
 */
function explain(marker: InterfaceMarker, isOutermost: boolean): string {
  switch (marker.condition) {
    case 'surface-condensation':
      return (
        `Room air meets a surface ${temperatureIntervalC(marker.belowDewPointK)} below its dew ` +
        'point and gives up water onto it. This is the damp-patch and mould case: it ' +
        'happens on the face you can see and touch, and unlike a plane inside the ' +
        'build-up there is no vapour resistance in the way to prevent it. Warming the ' +
        'surface or lowering the indoor humidity are the two ways out.'
      );
    case 'condensing':
      return (
        'Vapour diffusing out from inside reaches saturation here and turns to liquid ' +
        'water inside the build-up, at ' +
        `${formatRate(marker.ratePerDayGPerM2)} in these conditions. More vapour ` +
        'resistance on the warm side, or less on the cold side, moves the balance.'
      );
    case 'evaporating':
      return (
        'This plane is giving water back rather than collecting it, at ' +
        `${formatRate(marker.ratePerDayGPerM2)} in these conditions.`
      );
    case 'below-dew-point':
      // The outermost face is a different story from an interface buried in the
      // build-up: nothing is holding vapour back from it, and nothing needs to, because
      // what arrives there leaves into the outside air instead of collecting.
      return isOutermost
        ? `Colder than the room air's dew point, by ${temperatureIntervalC(marker.belowDewPointK)}, ` +
          'which is simply what the outside face of a wall is in winter. Vapour ' +
          'reaching it escapes to the outside air rather than building up, so the ' +
          'cold here is not the problem — water collecting further in would be.'
        : `Colder than the room air's dew point, by ${temperatureIntervalC(marker.belowDewPointK)}, ` +
          'but the layers inboard hold back enough vapour that it stays dry. Normal ' +
          'rather than a fault: most of the thickness of a well-insulated element is ' +
          'below the dew point by design, and being cold only matters if vapour ' +
          'reaches it.';
    case 'dry':
      return 'Above the dew point of the room air.';
  }
}

const CONDITION_TEXT: Readonly<Record<InterfaceCondition, string>> = {
  'surface-condensation': 'Condensation on the room-side surface',
  condensing: 'Condensation forming here',
  evaporating: 'Drying out here',
  'below-dew-point': 'Colder than the internal dew point, but staying dry',
  dry: 'Above the internal dew point',
};

/**
 * Callout labels above the drawing: row pitch, the gap kept between two labels sharing a
 * row, and the widest a single label may grow before it is trimmed.
 */
const CALLOUT_ROW_HEIGHT = 14;
const CALLOUT_GAP = 12;
const CALLOUT_MAX_WIDTH = 210;
/** Approximate advance width of one character at the callout's 10.5px size. */
const CALLOUT_CHAR_WIDTH = 5.6;
/** Half-width of a resize handle's grab area, and the least thickness a drag may set. */
const RESIZE_GRAB_HALF_WIDTH = 6;
const MIN_THICKNESS_MM = 1;
const MAX_THICKNESS_MM = 2000;
/** Thicknesses land on this step, so a drag gives a buildable number rather than 97.3184. */
const RESIZE_STEP_MM = 0.5;

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
/**
 * How much wall the drawing's height represents, as a multiple of the widest member
 * pitch in the build-up.
 *
 * A member is only a few per cent of its pitch — 38 mm at 600 mm centres is 6 % — so on
 * a faithful scale it is a thin band, and every extra bay makes it thinner. Just under
 * two bays shows the rhythm while keeping the member thick enough to see.
 */
const STUD_BAYS_SHOWN = 1.8;


/**
 * The order the layers would be in if the drag were dropped now.
 *
 * Lifting the layer out shifts everything after it down by one, so a drop index taken
 * from the original list has to be corrected once it has been removed — the same
 * correction the reorder itself makes, which is why the preview and the result agree.
 */
function reorderPreview(
  items: readonly UiLayer[],
  from: number,
  to: number,
): readonly UiLayer[] {
  const next = [...items];
  const [moved] = next.splice(from, 1);
  if (moved === undefined) {
    return items;
  }
  next.splice(from < to ? to - 1 : to, 0, moved);
  return next;
}

/** Trim a label to what will fit along the height of the plot, with an ellipsis. */
function fitLabel(
  text: string,
  availableLength: number,
  charWidth: number = LABEL_CHAR_WIDTH,
): string {
  const maxCharacters = Math.floor(availableLength / charWidth);
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
  /** Change a layer's thickness by dragging the handle on its outer edge. */
  readonly onResizeLayer?: ((index: number, thicknessMm: number) => void) | undefined;
  /**
   * Per-interface conditions from the vapour calculation. Optional: the drawing is
   * still a drawing without it, and the moisture calculation can fail on a build-up
   * whose thermal side is fine.
   *
   * These do **not** follow the displayed section. The screen behind them is worst-case
   * across paths and the wet planes come from the assessment's worst path, so the
   * section selector cannot change what is marked - only which temperature line is
   * drawn through it.
   */
  readonly condensation?: CondensationMarkers | undefined;
  /**
   * The two-season dry-out check. Shown beside the rate because the rate on its own
   * invites the wrong reading: BS EN ISO 13788 asks whether an element clears what it
   * gains, not whether it condenses in January, and a build-up that wets and dries is
   * doing what a build-up does.
   */
  readonly dryOut?: PeriodAssessment | undefined;
}

export function CrossSection({
  layers,
  result,
  profile,
  selectedLayerId,
  onSelectLayer,
  onReorder,
  onResizeLayer,
  condensation,
  dryOut,
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
    /** Pointer position in the drawing's own coordinates, for placing the layer. */
    readonly pointerUserX: number;
    /** How far into the layer it was picked up, so it does not jump under the cursor. */
    readonly grabOffsetX: number;
  } | null>(null);
  /**
   * Resizing a layer by its edge handle.
   *
   * The drawing is scaled so the build-up fills the width, so growing a layer would
   * normally shrink the scale and slide the edge out from under the pointer — the handle
   * would run away as you chased it. Both the scale and the width of the viewBox are
   * therefore frozen at the moment the handle is grabbed, which makes the drag exactly
   * one-to-one; the drawing refits when the handle is let go.
   */
  const [resize, setResize] = useState<{
    readonly index: number;
    readonly startClientX: number;
    readonly startThicknessMm: number;
    readonly frozenScale: number;
    readonly frozenViewBoxWidth: number;
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
  const scale = resize === null ? DRAW_WIDTH / totalThicknessMm : resize.frozenScale;

  /**
   * Whether a drag has passed the threshold that tells it apart from a click. Until it
   * has, nothing moves.
   */
  const dragging = drag?.moved === true;

  const includedById = new Map(
    layers.map((layer, index) => [layer.id, includedFlags[index] ?? true] as const),
  );

  /**
   * The order to draw in. While dragging this is the order the build-up *would* be in,
   * so the other layers slide aside and leave a hole exactly the width of the layer in
   * hand — the layer itself is then drawn at the pointer rather than in that hole.
   */
  const orderedLayers = dragging
    ? reorderPreview(layers, drag.from, drag.to)
    : layers;

  const layOut = (source: readonly UiLayer[]): { boxes: LayerBox[]; totalWidth: number } => {
    const out: LayerBox[] = [];
    const lastIncluded = source.reduce(
      (last, layer, index) => (includedById.get(layer.id) === false ? last : index),
      -1,
    );
    let x = FILM_WIDTH;
    source.forEach((layer, index) => {
      const width = Math.max(1, layer.thicknessMm * scale);
      out.push({
        layer,
        category: layerDrawCategory(layer.materialId, layer.kind),
        x,
        width,
        included: includedById.get(layer.id) ?? true,
      });
      x += width;
      if (index === lastIncluded) {
        x += FILM_WIDTH;
      }
    });
    return { boxes: out, totalWidth: x };
  };

  /*
   * Hit-testing uses the *undragged* layout on purpose. Testing against the preview
   * would feed the hole's own movement back into the calculation that positions it, and
   * the drop target would flicker between two answers at every boundary.
   */
  const base = layOut(layers);
  const preview = dragging ? layOut(orderedLayers) : base;
  const boxes = preview.boxes;
  const totalWidth = Math.max(base.totalWidth, preview.totalWidth);

  const includedThicknessMm = layers
    .filter((_layer, index) => includedFlags[index] ?? true)
    .reduce((total, layer) => total + layer.thicknessMm, 0);
  const externalFilmX = FILM_WIDTH + includedThicknessMm * scale;

  /** The layer in hand, drawn at the pointer instead of in the flow. */
  const draggedLayerId = dragging ? layers[drag.from]?.id : undefined;
  const draggedBox = boxes.find((box) => box.layer.id === draggedLayerId);
  const floatingX =
    drag === null || draggedBox === undefined
      ? 0
      : Math.min(
          Math.max(0, drag.pointerUserX - drag.grabOffsetX),
          totalWidth - draggedBox.width,
        );

  const drawXOf = (box: LayerBox): number => (box === draggedBox ? floatingX : box.x);

  /*
   * Callout labels, stacked above the drawing with a leader line down to the layer each
   * names.
   *
   * Laid out greedily, left to right: a label wants to sit centred over its layer, and
   * takes the lowest row where it does not run into the label already there. That keeps
   * the common case — a few wide layers — on a single row just above the drawing, and
   * only pushes upward where names genuinely collide.
   */
  const callouts = (() => {
    const rowRightEdge: number[] = [];
    return boxes.map((box) => {
      const bridged = box.layer.kind === 'solid' ? box.layer.bridgedPercent : 0;
      const text = fitLabel(box.layer.label, CALLOUT_MAX_WIDTH, CALLOUT_CHAR_WIDTH);
      const detail =
        bridged > 0
          ? box.layer.kind === 'solid' &&
            box.layer.bridgeSizing === 'dimensions' &&
            box.layer.bridgeWidthMm > 0
            ? `${box.layer.bridgeWidthMm} @ ${bridgePitchMm(
                box.layer.bridgeWidthMm,
                box.layer.bridgeSpacingMm,
                box.layer.bridgeDistanceBasis,
              ).toFixed(0)} crs · ${bridged.toFixed(1)}% ${box.layer.bridgeLabel}`
            : `${bridged.toFixed(1)}% ${box.layer.bridgeLabel}`
          : undefined;
      const width =
        Math.max(text.length, detail === undefined ? 0 : detail.length * 0.88) *
        CALLOUT_CHAR_WIDTH;
      const anchorX = drawXOf(box) + box.width / 2;
      const left = Math.min(
        Math.max(0, anchorX - width / 2),
        totalWidth + AXIS_WIDTH - width,
      );
      let row = 0;
      while ((rowRightEdge[row] ?? -Infinity) + CALLOUT_GAP > left) {
        row += 1;
      }
      rowRightEdge[row] = left + width;
      // A bridged layer's callout carries a second line, so it needs the room of two.
      return { box, text, detail, left, width, row, anchorX };
    });
  })();

  const calloutRows = callouts.reduce((most, callout) => Math.max(most, callout.row), 0) + 1;
  /** Top of the callout block. Rows stack upward from just above the drawing. */
  const calloutTop = TOP_PAD - 14 - (calloutRows - 1) * CALLOUT_ROW_HEIGHT;
  const calloutY = (row: number): number =>
    TOP_PAD - 14 - (calloutRows - 1 - row) * CALLOUT_ROW_HEIGHT;
  /*
   * The labels live above y = 0, so the viewBox is extended upward rather than every
   * coordinate in the drawing being pushed down by a block whose height is not known
   * until the labels have been laid out.
   */
  const viewBoxMinY = Math.min(0, calloutTop - 12);

  /*
   * SVG has no z-index, so the layer in hand is simply drawn last. Everything else keeps
   * its order, which is what stops the drawing reshuffling for a reason the reader
   * cannot see.
   */
  const drawOrder =
    draggedBox === undefined ? boxes : [...boxes.filter((box) => box !== draggedBox), draggedBox];

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

  const viewBoxWidth =
    resize === null ? totalWidth + AXIS_WIDTH - VIEWBOX_MIN_X : resize.frozenViewBoxWidth;

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

  const hasDrawableStuds = studColumns.length > 0;
  /*
   * One length scale for the whole drawing, taken from the widest pitch, so two layers
   * at different spacings are drawn against each other honestly — a 600 mm pitch really
   * does look sparser than a 400 mm one.
   */
  const wallLengthShownMm = hasDrawableStuds
    ? Math.max(...studColumns.map((column) => column.pitchMm)) * STUD_BAYS_SHOWN
    : 0;
  const mmToY = wallLengthShownMm > 0 ? PLOT_HEIGHT / wallLengthShownMm : 0;
  const viewBoxHeight = PLOT_HEIGHT + TOP_PAD + 66;

  const studsByLayerId = new Map(
    studColumns.map((column) => [column.box.layer.id, column] as const),
  );

  /** Members at their true width and pitch, down the height of the drawing. */
  const studRects = (widthMm: number, pitchMm: number): readonly { y: number; h: number }[] => {
    const out: { y: number; h: number }[] = [];
    const height = Math.max(1.5, widthMm * mmToY);
    // Centre the first member half a pitch in, so the pattern does not start flush
    // against the edge and read as though a member sat exactly on the boundary.
    for (let centreMm = pitchMm / 2; centreMm < wallLengthShownMm; centreMm += pitchMm) {
      out.push({ y: TOP_PAD + (centreMm - widthMm / 2) * mmToY, h: height });
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
  /**
   * Markers by the node they belong to, so the drawing does not have to re-derive which
   * profile node a boundary index refers to - the engine already reports it.
   */
  const markerByNodeIndex = new Map<number, InterfaceMarker>(
    (condensation?.markers ?? []).map((marker) => [marker.nodeIndex, marker]),
  );
  /** The planes that carry water: the ones that get a drop. */
  const wetPlanes = (condensation?.markers ?? []).filter(
    (marker) => marker.rateKgPerM2S !== 0,
  );
  /**
   * Every interface worth a word, inside to outside. Ordinary dry interfaces are left
   * out: a note against each of them would bury the two or three that matter.
   */
  const notes = (condensation?.markers ?? []).filter((marker) => marker.condition !== 'dry');
  /** The external face, which is cold for reasons of its own. */
  const outermostBoundaryIndex = condensation?.markers.at(-1)?.boundaryIndex ?? -1;
  /*
   * How long the build-up takes to clear is set by its slowest plane, not its first:
   * reporting anything less would say a wall was dry while one plane in it still held
   * water. Undefined where a wet plane never clears at all.
   */
  const planeDryingDays = (dryOut?.planes ?? [])
    .filter((plane) => plane.accumulatedKgPerM2 > 0)
    .map((plane) => plane.daysToDry);
  const slowestPlaneDays = planeDryingDays.some((days) => days === undefined)
    ? undefined
    : planeDryingDays.reduce<number>((worst, days) => Math.max(worst, days ?? 0), 0);

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

  const beginResize = (
    event: React.PointerEvent<SVGRectElement>,
    index: number,
    thicknessMm: number,
  ): void => {
    event.preventDefault();
    // Stop the press reaching the layer underneath, which would start a reorder drag.
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setResize({
      index,
      startClientX: event.clientX,
      startThicknessMm: thicknessMm,
      frozenScale: scale,
      frozenViewBoxWidth: viewBoxWidth,
    });
  };

  const continueResize = (event: React.PointerEvent<SVGRectElement>): void => {
    if (resize === null || onResizeLayer === undefined) {
      return;
    }
    event.stopPropagation();
    const deltaUserX = toUserX(event.clientX) - toUserX(resize.startClientX);
    const deltaMm = deltaUserX / resize.frozenScale;
    const next = Math.min(
      MAX_THICKNESS_MM,
      Math.max(
        MIN_THICKNESS_MM,
        Math.round((resize.startThicknessMm + deltaMm) / RESIZE_STEP_MM) * RESIZE_STEP_MM,
      ),
    );
    onResizeLayer(resize.index, Number(next.toFixed(2)));
  };

  const endResize = (event: React.PointerEvent<SVGRectElement>): void => {
    event.stopPropagation();
    setResize(null);
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
        viewBox={`${VIEWBOX_MIN_X} ${viewBoxMinY} ${viewBoxWidth} ${
          viewBoxHeight - viewBoxMinY
        }`}
        className={drag?.moved === true ? 'is-dragging' : undefined}
        onPointerMove={(event) => {
          if (drag === null) {
            return;
          }
          const moved =
            drag.moved || Math.abs(event.clientX - drag.startClientX) > DRAG_THRESHOLD_PX;
          setDrag({
            ...drag,
            moved,
            to: dropIndexAt(event.clientX),
            pointerUserX: toUserX(event.clientX),
          });
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
        {drawOrder.map((box) => {
          const style = CATEGORY_STYLE[box.category];
          const bridgedPercent = box.layer.kind === 'solid' ? box.layer.bridgedPercent : 0;
          const isSelected = box.layer.id === selectedLayerId;
          /*
           * The layer's position in the build-up, not in the draw order: the two differ
           * while dragging, and every handler below means the former.
           */
          const index = layers.findIndex((layer) => layer.id === box.layer.id);
          const isDragged = box === draggedBox;
          const drawX = isDragged ? floatingX : box.x;
          return (
            <g
              key={box.layer.id}
              className={[
                'layer-box',
                isSelected ? 'layer-box-selected' : '',
                isDragged ? 'layer-box-dragging' : '',
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
                const pointerUserX = toUserX(event.clientX);
                setDrag({
                  from: index,
                  to: index,
                  startClientX: event.clientX,
                  moved: false,
                  pointerUserX,
                  // Grab offset comes from the undragged layout, which is where the
                  // layer actually was at the moment it was picked up.
                  grabOffsetX: pointerUserX - (base.boxes[index]?.x ?? 0),
                });
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
                    x={drawX}
                    y={TOP_PAD}
                    width={box.width}
                    height={PLOT_HEIGHT}
                    fill={style.fill}
                  />
                  {style.hatch !== undefined && (
                    <rect
                      x={drawX}
                      y={TOP_PAD}
                      width={box.width}
                      height={PLOT_HEIGHT}
                      fill={`url(#${style.hatch})`}
                    />
                  )}
                  {/*
                    Studs and rafters, at true width and pitch, drawn as part of the layer
                    they bridge. Inside the layer's own group on purpose: it puts them
                    above the layer's fill and hatch but below its name, which would
                    otherwise be chopped into pieces by every member that crossed it.
                  */}
                  {(() => {
                    const column = studsByLayerId.get(box.layer.id);
                    if (column === undefined) {
                      return null;
                    }
                    return studRects(column.widthMm, column.pitchMm).map((rect, memberIndex) => (
                      <g key={`member-${memberIndex}`} className="stud-group">
                        <rect
                          x={drawX}
                          y={rect.y}
                          width={box.width}
                          height={rect.h}
                          fill={CATEGORY_STYLE['timber-and-board'].fill}
                        />
                        <rect
                          x={drawX}
                          y={rect.y}
                          width={box.width}
                          height={rect.h}
                          fill={`url(#${CATEGORY_STYLE['timber-and-board'].hatch ?? ''})`}
                        />
                        <rect
                          x={drawX}
                          y={rect.y}
                          width={box.width}
                          height={rect.h}
                          className="stud-member"
                        />
                      </g>
                    ));
                  })()}
                </>
              ) : (
                <rect
                  x={drawX}
                  y={TOP_PAD}
                  width={box.width}
                  height={PLOT_HEIGHT}
                  fill="url(#excluded-hatch)"
                />
              )}
              <rect
                x={drawX}
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
                  x={drawX}
                  y={TOP_PAD}
                  width={box.width}
                  height={PLOT_HEIGHT}
                  className="layer-selection"
                />
              )}
              {box.width >= MIN_WIDTH_FOR_CAPTION && (
                <text
                  x={drawX + box.width / 2}
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

        {/*
          A grip on the outer edge of every layer. Each one resizes the layer to its left,
          so every layer has exactly one — the inside face is not a boundary between two
          layers and carries none. Drawn after the boxes so the grab area sits on top of
          them, and after the studs so nothing buries it.
        */}
        {onResizeLayer !== undefined &&
          boxes.map((box) => {
            const index = layers.findIndex((layer) => layer.id === box.layer.id);
            const edgeX = drawXOf(box) + box.width;
            const isActive = resize?.index === index;
            return (
              <g
                key={`resize-${box.layer.id}`}
                className={`resize-handle${isActive ? ' is-active' : ''}`}
              >
                <line
                  x1={edgeX}
                  y1={TOP_PAD}
                  x2={edgeX}
                  y2={TOP_PAD + PLOT_HEIGHT}
                  className="resize-handle-line"
                />
                {[0.36, 0.5, 0.64].map((at) => (
                  <circle
                    key={at}
                    cx={edgeX}
                    cy={TOP_PAD + PLOT_HEIGHT * at}
                    r={1.9}
                    className="resize-handle-grip"
                  />
                ))}
                <rect
                  x={edgeX - RESIZE_GRAB_HALF_WIDTH}
                  y={TOP_PAD}
                  width={RESIZE_GRAB_HALF_WIDTH * 2}
                  height={PLOT_HEIGHT}
                  className="resize-handle-target"
                  onPointerDown={(event) => beginResize(event, index, box.layer.thicknessMm)}
                  onPointerMove={continueResize}
                  onPointerUp={endResize}
                  onPointerCancel={endResize}
                >
                  <title>{`Drag to change the thickness of ${box.layer.label}`}</title>
                </rect>
              </g>
            );
          })}

        {/*
          Layer names, outside the drawing with a leader line to the layer each names.
          Outside because a name set inside a layer has to be rotated, is cut short by
          anything narrow, and competes with the temperature line for the same space.
        */}
        <g className="callouts">
          {callouts.map((callout) => {
            const y = calloutY(callout.row);
            const labelCentreX = callout.left + callout.width / 2;
            return (
              <g key={callout.box.layer.id}>
                <line
                  x1={labelCentreX}
                  y1={y + 3}
                  x2={callout.anchorX}
                  y2={TOP_PAD - 1}
                  className="callout-leader"
                />
                <circle cx={callout.anchorX} cy={TOP_PAD - 1} r={1.7} className="callout-dot" />
                <text x={callout.left} y={y} className="callout-name">
                  {callout.text}
                </text>
                {callout.detail !== undefined && (
                  <text x={callout.left} y={y + 9} className="callout-detail">
                    {callout.detail}
                  </text>
                )}
              </g>
            );
          })}
        </g>

        {/*
          Where it will land. The gap the other layers have opened already shows this, so
          the outline confirms the target rather than being the only cue for it.
        */}
        {dragging && draggedBox !== undefined && (
          <rect
            x={draggedBox.x}
            y={TOP_PAD}
            width={draggedBox.width}
            height={PLOT_HEIGHT}
            className="drop-slot"
          />
        )}


        {/* Everything below the internal dew point, tinted. */}
        {riskBandHeight > 0 && (
          <rect
            x={0}
            y={riskBandY}
            width={totalWidth}
            height={riskBandHeight}
            className={`dew-point-band${dragging ? ' is-restating' : ''}`}
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
        <polyline points={linePoints} className={`temperature-line-shadow${dragging ? ' is-restating' : ''}`} />
        <polyline points={linePoints} className={`temperature-line${dragging ? ' is-restating' : ''}`} />

        {/*
          * Condensation drops, one per wet plane, drawn between the temperature line and
          * the node markers so the line stays readable underneath them.
          *
          * These follow the vapour calculation's worst path, not the displayed section:
          * the drawing says which, below, when the two differ.
          */}
        {!dragging &&
          wetPlanes.map((marker, order) => {
            const x = nodeX(marker.nodeIndex);
            const radius = dropRadius(marker.ratePerDayGPerM2);
            const isDrying = marker.condition === 'evaporating';
            const lineY = toY(marker.displayedTemperatureC);

            const headline = CONDITION_HEADLINE[marker.condition];
            const rateText = formatRate(marker.ratePerDayGPerM2);
            const textWidth = Math.max(
              headline.length * BADGE_HEADLINE_CHAR_WIDTH,
              rateText.length * BADGE_RATE_CHAR_WIDTH,
            );
            const dropBoxWidth = radius * 2;
            const badgeWidth = dropBoxWidth + BADGE_PAD * 2 + textWidth + 6;
            const badgeHeight = Math.max(radius * 2.9, 36);

            /*
             * A badge goes on whichever side of the temperature line has more room. A
             * fixed band cannot work: the line runs from warm to cold across the
             * drawing, so any height that is clear at one interface is straight through
             * the line at another - and a condensation plane is usually out on the cold
             * side, where the line is already low.
             */
            const placeBelow = TOP_PAD + PLOT_HEIGHT - lineY >= lineY - TOP_PAD;
            // Stagger where two wet planes sit close enough to overlap.
            const stagger = order * (badgeHeight + 6);
            const badgeY = placeBelow
              ? lineY + DROP_CLEARANCE + stagger
              : lineY - DROP_CLEARANCE - badgeHeight - stagger;
            // Keep the panel inside the drawing rather than half off the edge.
            const badgeX = Math.min(
              Math.max(x - badgeWidth / 2, 2),
              totalWidth - badgeWidth - 2,
            );
            const centreY = badgeY + badgeHeight / 2;
            const dropCx = badgeX + BADGE_PAD + radius;
            const textX = dropCx + radius + BADGE_PAD;

            const title =
              `${marker.label}\n${CONDITION_TEXT[marker.condition]}\n` +
              `${rateText}` +
              `\n${marker.worstCaseTemperatureC.toFixed(2)} °C at this plane` +
              `\non the ${condensation?.pathLabel ?? 'assessed'} path`;

            return (
              <g
                key={`wet-${marker.boundaryIndex}`}
                className={isDrying ? 'wet-plane is-drying' : 'wet-plane'}
              >
                <title>{title}</title>
                {/*
                  * The plane itself, marked the full height of the section. This is the
                  * part that answers "where?" at a glance: a badge alone reads as a
                  * note about the drawing, a marked plane reads as a place in the wall.
                  */}
                <rect
                  x={x - 2.5}
                  y={TOP_PAD}
                  width={5}
                  height={PLOT_HEIGHT}
                  className="wet-plane-band"
                />
                <line
                  x1={x}
                  y1={TOP_PAD}
                  x2={x}
                  y2={TOP_PAD + PLOT_HEIGHT}
                  className="wet-plane-rule"
                />
                {/* Leader from the plane to the badge, when the badge had to shift. */}
                <line x1={x} y1={lineY} x2={dropCx} y2={centreY} className="wet-plane-leader" />
                <rect
                  x={badgeX}
                  y={badgeY}
                  width={badgeWidth}
                  height={badgeHeight}
                  rx={7}
                  className="wet-plane-badge"
                />
                <path
                  d={DROP_PATH}
                  transform={`translate(${dropCx} ${centreY + radius * 0.4}) scale(${radius})`}
                  className="wet-plane-drop"
                />
                <text x={textX} y={centreY - 2} className="wet-plane-headline">
                  {headline}
                </text>
                <text x={textX} y={centreY + 11} className="wet-plane-rate">
                  {rateText}
                </text>
              </g>
            );
          })}

        {/* One marker per node, drawn by what is actually happening at that interface. */}
        {profile.nodes.map((node, index) => {
          const marker = markerByNodeIndex.get(index);
          /*
           * The air either side is not a surface, so nothing can form on it: it gets a
           * plain marker however cold it is. Grading it would put a moisture label on
           * the outdoor air every winter's day. Where the vapour calculation could not
           * run, an interface falls back to the temperature screen alone, which is the
           * most that is known about it then.
           */
          const isAirNode = node.kind === 'internal-air' || node.kind === 'external-air';
          const condition: InterfaceCondition = isAirNode
            ? 'dry'
            : (marker?.condition ?? (node.isBelowInternalDewPoint ? 'below-dew-point' : 'dry'));
          const x = nodeX(index);
          const y = toY(node.temperatureC);
          const shortfallK = marker?.belowDewPointK ?? 0;
          const title =
            `${node.label}: ${node.temperatureC.toFixed(2)} °C` +
            `\n${CONDITION_TEXT[condition]}` +
            (node.worstCasePathId === 'n/a'
              ? ''
              : `\nworst of all paths: ${node.worstCaseTemperatureC.toFixed(2)} °C ` +
                `(${node.worstCasePathId})`) +
            (shortfallK > 0
              ? `\n${temperatureIntervalC(shortfallK)} below the internal dew point`
              : '') +
            (marker !== undefined && marker.rateKgPerM2S !== 0
              ? `\n${formatRate(marker.ratePerDayGPerM2)}`
              : '') +
            `\ncumulative Sd: ${node.cumulativeSdM.toFixed(3)} m`;

          return (
            <g key={`${node.kind}-${index}`} className={`node-group node-${condition}`}>
              {/*
                * Surface condensation is the one case where the shortfall itself is the
                * finding, so it is drawn as a length: a stem from the node up to the dew
                * point line it has fallen below, with the gap beside it. The gap is a
                * temperature *difference*, so it is shown in °C — see format.ts.
                */}
              {condition === 'surface-condensation' && !dragging && (
                <>
                  <line x1={x} y1={y} x2={x} y2={dewPointY} className="shortfall-stem" />
                  {shortfallK > 0 && (
                    /*
                     * Below the node, not beside the middle of the stem: a small
                     * shortfall makes a short stem, whose middle is level with the dew
                     * point line - and that row already carries the dew point's own
                     * label over on the left.
                     */
                    <text x={x + 9} y={y + 15} className="shortfall-label">
                      {temperatureIntervalC(shortfallK)} below dew point
                    </text>
                  )}
                </>
              )}
              {/*
                * The two findings get a glyph rather than a disc: a warning triangle
                * where water forms on the room-side face, a drop where it forms inside
                * the build-up. A reader should not have to compare the diameter of one
                * circle against another to see which interface is the problem.
                */}
              {condition === 'surface-condensation' ? (
                <path
                  d={`M ${x} ${y - 8.5} L ${x + 8} ${y + 5.5} L ${x - 8} ${y + 5.5} Z`}
                  className="node-glyph node-glyph-warning"
                >
                  <title>{title}</title>
                </path>
              ) : condition === 'condensing' ? (
                <path
                  d={DROP_PATH}
                  transform={`translate(${x} ${y + 2}) scale(5.2)`}
                  className="node-glyph node-glyph-drop"
                >
                  <title>{title}</title>
                </path>
              ) : (
                <circle cx={x} cy={y} r={NODE_RADIUS[condition]} className="node">
                  <title>{title}</title>
                </circle>
              )}
              {/* The exclamation inside the warning triangle. */}
              {condition === 'surface-condensation' && (
                <text x={x} y={y + 4} textAnchor="middle" className="node-glyph-bang">
                  !
                </text>
              )}
            </g>
          );
        })}

        <text x={0} y={PLOT_HEIGHT + TOP_PAD + 38} className="side-label">
          inside
        </text>
        <text x={totalWidth} y={PLOT_HEIGHT + TOP_PAD + 38} className="side-label" textAnchor="end">
          outside
        </text>

      </svg>
      {/*
        * What is happening at each marked interface, under the drawing. The markers say
        * where and how much; this says why, which a tooltip cannot - a reader has to
        * already suspect there is something to find before they hover over it.
        */}
      {notes.length > 0 && (
        // Stale while a layer is being dragged: the build-up under the pointer is not
        // the one these were calculated for, and they come back on drop.
        <ul className={`interface-notes${dragging ? ' is-restating' : ''}`}>
          {notes.map((marker) => (
            <li key={marker.boundaryIndex} className={`interface-note note-${marker.condition}`}>
              <svg viewBox="0 0 16 16" className="note-glyph" aria-hidden="true">
                {marker.condition === 'surface-condensation' ? (
                  <path d="M 8 2 L 15 14 L 1 14 Z" className="node-glyph-warning" />
                ) : marker.condition === 'below-dew-point' ? (
                  <circle cx={8} cy={8} r={5.4} className="note-ring" />
                ) : (
                  <path
                    d={DROP_PATH}
                    transform="translate(8 10) scale(5)"
                    className={
                      marker.condition === 'evaporating' ? 'note-drop-open' : 'node-glyph-drop'
                    }
                  />
                )}
              </svg>
              <div>
                <p className="note-where">
                  {marker.label}
                  <span className="note-headline">
                    {' — '}
                    {CONDITION_HEADLINE[marker.condition]}
                  </span>
                </p>
                <p className="note-what">
                  {explain(marker, marker.boundaryIndex === outermostBoundaryIndex)}
                </p>
              </div>
            </li>
          ))}
          {condensation !== undefined && condensation.anyCondensation && dryOut !== undefined && (
            /*
             * The rate on its own invites the wrong reading. The standard's question is
             * whether an element clears what it gains, so the answer to that belongs
             * next to the number that prompts it, not one tab away.
             */
            <li
              className={`interface-note ${dryOut.driesOut ? 'note-dries' : 'note-does-not-dry'}`}
            >
              <svg viewBox="0 0 16 16" className="note-glyph" aria-hidden="true">
                {dryOut.driesOut ? (
                  <path d="M 3 8.5 L 6.5 12 L 13 4" className="note-tick" />
                ) : (
                  <path d="M 8 2 L 15 14 L 1 14 Z" className="node-glyph-warning" />
                )}
              </svg>
              <div>
                <p className="note-where">
                  {dryOut.driesOut ? 'Clears over the year' : 'Does not clear'}
                  <span className="note-headline">
                    {' — '}
                    {formatMass(dryOut.totalAccumulatedKgPerM2)} over {dryOut.wettingPeriod.days}{' '}
                    days of wetting
                    {dryOut.driesOut
                      ? slowestPlaneDays === undefined
                        ? ''
                        : `, gone in ${slowestPlaneDays.toFixed(0)}`
                      : `, ${formatMass(dryOut.totalRemainingKgPerM2)} still there after`}{' '}
                    {dryOut.driesOut ? '' : `${dryOut.dryingPeriod.days} `}days of drying
                  </span>
                </p>
                <p className="note-what">
                  {dryOut.driesOut
                    ? 'What a build-up gains in winter it can give back in summer, and ' +
                      'this one does, with room to spare. Condensation that clears is ' +
                      'not by itself a defect — the question BS EN ISO 13788 asks is ' +
                      'whether an element dries out again, not whether it condenses in ' +
                      'January.'
                    : 'Water left at the end of the drying season accumulates year on ' +
                      'year, which is the case the assessment exists to catch.'}{' '}
                  These two seasons are our own default, not the standard&rsquo;s method:
                  BS EN ISO 13788 runs twelve months of a design year against monthly
                  climate data we do not ship. Change the seasons in the Moisture tab and
                  this figure follows them.
                </p>
              </div>
            </li>
          )}
          {condensation !== undefined && condensation.anyCondensation && (
            <li className="interface-note note-caveat">
              <div>
                <p className="note-what">
                  <strong>What this calculation leaves out.</strong> The Glaser method
                  moves vapour by diffusion alone. It does not model rain driven into the
                  outer leaf, liquid water moving through a material by capillarity, air
                  carrying moisture through gaps, or the moisture a hygroscopic material
                  holds and releases. In a masonry outer leaf those dominate — a wall
                  takes far more water from a day of driving rain than from a season of
                  this — so a wet plane at the back of a leaf that is built to get wet and
                  drain is a different proposition from one against insulation or
                  sheathing, which are not. {/* TODO(verify): the clause in BS EN ISO
                  13788 that lists what the method does not account for. See VERIFY.md
                  row V28. */}
                </p>
              </div>
            </li>
          )}
        </ul>
      )}
      <figcaption>
        Layer widths are to scale and captioned in millimetres; the two hatched bands
        are the internal and external surface resistances, which have no thickness and
        are drawn at a fixed width. Names sit above the drawing with a line to the layer
        each one belongs to, the hatching shows what a layer is made of, and the tinted
        band is everything at or below the internal dew point. Drag a layer sideways to
        reorder it — it comes with you at its real width while the rest open a gap — drag
        the grip on its outer edge to change its thickness, or click one to pick it out in
        the layer list.
        {hasBridgedLayer &&
          ' A bridged layer is outlined in the accent colour, and its callout carries the bridged percentage.' +
          (hasDrawableStuds
            ? ` Its height is ${wallLengthShownMm.toFixed(0)} mm of wall, so studs and rafters appear inside the layers they bridge at their true width and pitch. The temperature line is an overlay on that section, read against the degrees axis on the right — a member drawn level with a temperature does not mean anything by it.`
            : ' Height carries no quantity where nothing is bridged by measured members.')}
        {lastIncludedIndex < layers.length - 1 &&
          ' The cross-hatched layers beyond the ventilated cavity are disregarded by the calculation.'}
        {hasThinLayer && ' Layers thinner than the line width are drawn as a single line.'}
        {condensation !== undefined && (
          <>
            {' '}
            A marked plane is one where water forms, and the drop beside it has an{' '}
            <em>area</em> proportional to the rate — the printed figure is the result, the
            size only a reading aid. Moisture is assessed on every path and the worst
            reported
            {condensation.pathLabel !== '' ? ` (here, ${condensation.pathLabel})` : ''}, so
            changing what is on display cannot change it. The notes above say what is
            happening at each marked interface.
          </>
        )}
      </figcaption>
    </figure>
  );
}
