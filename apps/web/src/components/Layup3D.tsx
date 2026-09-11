import { bridgePitchMm, layerDrawCategory } from '../state/model.js';
import type { UiLayer } from '../state/model.js';
import { CATEGORY_STYLE } from './hatches.js';

/**
 * An axonometric indicator of the build-up: the layers as slabs, stepped back one behind
 * another so every one of them is visible, numbered from the inside out.
 *
 * **It is an indicator, not a model.** It shows the order of the layers, their relative
 * thicknesses and where the members sit; it is not a construction drawing and has no
 * junctions, fixings or detailing in it. The numbers in the section and the calculation
 * come from the layer table, and nothing here feeds them.
 *
 * Drawn as plain SVG in an oblique projection rather than with a 3D library: the engine
 * has no runtime dependencies and the app has almost none, and a rotating render would
 * imply far more precision than this is offering.
 */

/**
 * Screen movement per millimetre of depth into the wall. Back is up and to the right, so
 * each successive layer steps that way and shows its own top and side.
 */
const DEPTH_X = 0.62;
const DEPTH_Y = -0.42;

/** How much wall the panel shows. Enough to read a couple of stud bays. */
const PANEL_WIDTH_MM = 900;
const PANEL_HEIGHT_MM = 620;

/**
 * Extra separation between layers, in screen units.
 *
 * A 289 mm wall against a 900 mm panel is thin, and stacked at true depth the layers
 * collapse into a sliver where nothing can be told apart. Pulling them apart is what
 * makes the order readable — it is the whole point of drawing it this way — so the
 * thicknesses stay to scale relative to each other and the gaps between them do not
 * mean anything. The caption says so.
 */
const EXPLODE_GAP_PX = 11;

/**
 * Least depth a layer may be drawn at, in screen units. A 0.2 mm vapour barrier is a real
 * layer with a real job, and at true scale it would be invisible — the same compromise
 * the cross-section makes for layers thinner than a line, and said out loud in the
 * caption rather than left for someone to discover.
 */
const MIN_DEPTH_PX = 3.5;

const VIEW_W = 620;
const VIEW_H = 400;

export interface Layup3DProps {
  readonly layers: readonly UiLayer[];
  /** Per layer, whether the calculation included it. Excluded ones are drawn faded. */
  readonly included: readonly boolean[];
  readonly selectedLayerId?: string | undefined;
  readonly onSelectLayer?: ((layerId: string | undefined) => void) | undefined;
}

interface Slab {
  readonly layer: UiLayer;
  readonly index: number;
  /** Depth of the near face and the far face, in screen units. */
  readonly z0: number;
  readonly z1: number;
  readonly included: boolean;
}

export function Layup3D({
  layers,
  included,
  selectedLayerId,
  onSelectLayer,
}: Layup3DProps): JSX.Element {
  const totalThicknessMm = layers.reduce((total, layer) => total + layer.thicknessMm, 0);
  if (layers.length === 0 || totalThicknessMm <= 0) {
    return <p className="empty-note">Add a layer with a thickness to see the layup.</p>;
  }

  /*
   * Wide enough to show two bays of the widest member spacing, so the rhythm is visible
   * rather than a single lonely stud. Falls back to the plain panel width where nothing
   * is bridged by measured members.
   */
  const widestPitchMm = layers.reduce((widest, layer) => {
    if (
      layer.kind !== 'solid' ||
      layer.bridgedPercent <= 0 ||
      layer.bridgeSizing !== 'dimensions' ||
      layer.bridgeWidthMm <= 0
    ) {
      return widest;
    }
    return Math.max(
      widest,
      bridgePitchMm(layer.bridgeWidthMm, layer.bridgeSpacingMm, layer.bridgeDistanceBasis),
    );
  }, 0);
  const panelWidthMm = Math.max(PANEL_WIDTH_MM, widestPitchMm * 2.1);
  const panelHeightMm = panelWidthMm * (PANEL_HEIGHT_MM / PANEL_WIDTH_MM);

  /*
   * One scale for length and for depth, so a 100 mm layer really is a tenth of a 1000 mm
   * panel. Chosen to fit the projected bounding box — the panel plus the whole stack's
   * step — into the view.
   */
  const gapTotal = Math.max(0, layers.length - 1) * EXPLODE_GAP_PX;
  /*
   * The gaps are fixed screen units and the rest scales, so the scale is what is left
   * once they have been taken out of the space the stack has to fit into:
   *   available = scale * (panel + thickness * depthStep) + gaps * depthStep
   */
  const fit = (available: number, panelMm: number, depthStep: number): number =>
    (available - gapTotal * depthStep) / (panelMm + totalThicknessMm * depthStep);
  const scale = Math.max(
    0.02,
    Math.min(fit(VIEW_W - 150, panelWidthMm, DEPTH_X), fit(VIEW_H - 60, panelHeightMm, -DEPTH_Y)),
  );

  const panelW = panelWidthMm * scale;
  const panelH = panelHeightMm * scale;

  const slabs: Slab[] = [];
  let depth = 0;
  layers.forEach((layer, index) => {
    const t = Math.max(MIN_DEPTH_PX, layer.thicknessMm * scale);
    slabs.push({ layer, index, z0: depth, z1: depth + t, included: included[index] ?? true });
    depth += t + EXPLODE_GAP_PX;
  });
  const totalDepth = depth;

  // Origin: the near face's bottom-left, with room above and right for the stack to step.
  const originX = 24;
  const originY = VIEW_H - 34 - panelH;

  const px = (x: number, z: number): number => originX + x + z * DEPTH_X;
  const py = (y: number, z: number): number => originY + y + z * DEPTH_Y;
  const quad = (points: readonly (readonly [number, number, number])[]): string =>
    points.map(([x, y, z]) => `${px(x, z).toFixed(1)},${py(y, z).toFixed(1)}`).join(' ');

  /** Members crossing a layer, seen end-on in the cut along the top of the panel. */
  const membersOf = (layer: UiLayer): readonly { readonly x0: number; readonly x1: number }[] => {
    if (
      layer.kind !== 'solid' ||
      layer.bridgedPercent <= 0 ||
      layer.bridgeSizing !== 'dimensions' ||
      layer.bridgeWidthMm <= 0
    ) {
      return [];
    }
    const pitchMm = bridgePitchMm(
      layer.bridgeWidthMm,
      layer.bridgeSpacingMm,
      layer.bridgeDistanceBasis,
    );
    if (!(pitchMm > 0)) {
      return [];
    }
    const out: { x0: number; x1: number }[] = [];
    for (let centreMm = pitchMm / 2; centreMm < panelWidthMm; centreMm += pitchMm) {
      out.push({
        x0: (centreMm - layer.bridgeWidthMm / 2) * scale,
        x1: (centreMm + layer.bridgeWidthMm / 2) * scale,
      });
    }
    return out;
  };

  const timber = CATEGORY_STYLE['timber-and-board'];

  return (
    <figure className="layup-3d">
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        role="img"
        aria-label={`Axonometric indicator of ${layers.length} layers, numbered from the inside out`}
      >
        {/*
          Furthest first. The outermost layer is the one furthest from the viewer, so
          painting from the back forwards lets each nearer layer cover it, which is what
          leaves only its top and side edge showing.
        */}
        {[...slabs].reverse().map((slab) => {
          const style = CATEGORY_STYLE[layerDrawCategory(slab.layer.materialId, slab.layer.kind)];
          const isSelected = slab.layer.id === selectedLayerId;
          const faceFill = slab.included ? style.fill : 'var(--excluded-hatch)';
          return (
            <g
              key={slab.layer.id}
              className={`layup-slab${isSelected ? ' is-selected' : ''}`}
              onClick={() =>
                onSelectLayer?.(isSelected ? undefined : slab.layer.id)
              }
            >
              <title>
                {`${slab.index + 1}. ${slab.layer.label} — ${slab.layer.thicknessMm} mm`}
              </title>

              {/* The face toward the room, and the hatch that says what it is made of. */}
              <polygon
                points={quad([
                  [0, 0, slab.z0],
                  [panelW, 0, slab.z0],
                  [panelW, panelH, slab.z0],
                  [0, panelH, slab.z0],
                ])}
                fill={faceFill}
              />
              {slab.included && style.hatch !== undefined && (
                <polygon
                  points={quad([
                    [0, 0, slab.z0],
                    [panelW, 0, slab.z0],
                    [panelW, panelH, slab.z0],
                    [0, panelH, slab.z0],
                  ])}
                  fill={`url(#${style.hatch})`}
                />
              )}

              {/* The cut along the top, where the members show end-on. */}
              <polygon
                points={quad([
                  [0, 0, slab.z0],
                  [panelW, 0, slab.z0],
                  [panelW, 0, slab.z1],
                  [0, 0, slab.z1],
                ])}
                fill={faceFill}
                className="layup-top"
              />
              {membersOf(slab.layer).map((member, memberIndex) => (
                <polygon
                  key={memberIndex}
                  points={quad([
                    [member.x0, 0, slab.z0],
                    [member.x1, 0, slab.z0],
                    [member.x1, 0, slab.z1],
                    [member.x0, 0, slab.z1],
                  ])}
                  fill={timber.fill}
                  className="layup-member"
                />
              ))}

              {/* The cut down the side. */}
              <polygon
                points={quad([
                  [panelW, 0, slab.z0],
                  [panelW, panelH, slab.z0],
                  [panelW, panelH, slab.z1],
                  [panelW, 0, slab.z1],
                ])}
                fill={faceFill}
                className="layup-side"
              />

              <polygon
                points={quad([
                  [0, 0, slab.z0],
                  [panelW, 0, slab.z0],
                  [panelW, panelH, slab.z0],
                  [0, panelH, slab.z0],
                ])}
                fill="none"
                className="layup-edge"
              />
            </g>
          );
        })}

        {/*
          A number per layer, sitting on its own cut edge along the top. Numbered from
          the inside out, the same direction the layer table runs in.
        */}
        {/*
          Badges sit off the corner of each layer's cut. Two thin layers next to each
          other would otherwise land on top of one another, so each is pushed clear of
          the one before it — the leader line still points at the layer it belongs to.
        */}
        {(() => {
          let lastBadgeY = Number.POSITIVE_INFINITY;
          return slabs.map((slab) => {
          const midDepth = (slab.z0 + slab.z1) / 2;
          const badgeX = px(panelW, midDepth) + 16;
          const naturalY = py(0, midDepth) + 4;
          const badgeY = Math.min(naturalY, lastBadgeY - 18);
          lastBadgeY = badgeY;
          return (
            <g key={`badge-${slab.layer.id}`} className="layup-badge-group">
              <line
                x1={px(panelW, midDepth)}
                y1={py(0, midDepth)}
                x2={badgeX - 8}
                y2={badgeY}
                className="layup-leader"
              />
              <circle cx={badgeX} cy={badgeY} r={8} className="layup-badge" />
              <text x={badgeX} y={badgeY + 3.2} className="layup-badge-text" textAnchor="middle">
                {slab.index + 1}
              </text>
            </g>
          );
          });
        })()}

        <text x={originX} y={VIEW_H - 12} className="layup-side-label">
          inside face
        </text>
        {/* On the back-left corner: the badges own the right-hand side. */}
        <text x={px(0, totalDepth)} y={py(0, totalDepth) - 8} className="layup-side-label">
          outside face
        </text>
      </svg>

      <ol className="layup-legend">
        {slabs.map((slab) => (
          <li key={slab.layer.id}>
            <button
              type="button"
              className={slab.layer.id === selectedLayerId ? 'is-selected' : ''}
              onClick={() =>
                onSelectLayer?.(slab.layer.id === selectedLayerId ? undefined : slab.layer.id)
              }
            >
              <span className="layup-legend-number">{slab.index + 1}</span>
              <span className="layup-legend-name">{slab.layer.label}</span>
              <span className="layup-legend-thickness">{slab.layer.thicknessMm} mm</span>
            </button>
          </li>
        ))}
      </ol>

      <figcaption>
        An indicator of the order and relative thickness of the layers, not a construction
        drawing — there are no junctions, fixings or detailing in it, and nothing here
        feeds the calculation. The layers are pulled apart so the order can be read, so
        the gaps between them mean nothing; thicknesses are to scale against each other,
        except that the very thinnest are given a minimum depth to keep them visible. Studs and rafters appear end-on in
        the cut along the top. <strong>Cross battens are not drawn yet</strong> — a second
        layer of members running the other way is on the roadmap.
      </figcaption>
    </figure>
  );
}
