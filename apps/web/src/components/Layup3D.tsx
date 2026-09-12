import { useRef, useState } from 'react';
import { bridgeGeometry, layerDrawCategory } from '../state/model.js';
import type { UiLayer } from '../state/model.js';
import { CATEGORY_STYLE } from './hatches.js';

/**
 * A 3D cutaway of the build-up: the layers as solid boxes, face to face with no gaps
 * between them, each cut back a little further than the one in front so its edge shows.
 *
 * **The layers touch.** That is the point of it — it is meant to look like the thing that
 * gets built, so anything that separated the layers would be showing a construction that
 * does not exist. What makes each one visible is the stepped cutaway, which is how a
 * cutaway drawing has always worked: the material is removed, not moved.
 *
 * **A cavity is the exception, because a cavity really is a gap.** Its air is drawn as
 * nothing at all rather than as a grey slab standing in for air, so the opening shows as
 * a recess into the stack and what appears at the back of it is the next layer's own
 * face. Anything crossing the cavity — a batten, a stud, a dab — keeps its box and stands
 * in the opening, with the sides that the air leaves exposed drawn rather than buried.
 * This is not the separation the paragraph above rules out: the layers either side of a
 * cavity are exactly as far apart as the cavity is thick.
 *
 * Real geometry, rotated and projected here rather than drawn as a fixed picture. Each
 * layer is a box of eight vertices; the view rotates them about two axes, drops the back
 * faces, sorts what is left by depth and shades each face by how it lies to the light.
 * Dragging turns the model. It is orthographic rather than perspective, which is the
 * convention for a construction drawing and keeps parallel edges parallel.
 *
 * Written out rather than pulled from a 3D library: this is a few hundred lines of vector
 * arithmetic against something that would be the largest dependency in the repository by
 * a wide margin, in a project whose engine has none at all.
 *
 * It is still an indicator. There are no junctions, fixings or detailing in it, and
 * nothing here feeds the calculation.
 */

const VIEW_W = 640;
const VIEW_H = 430;

/** Starting angles, in radians. A three-quarter view from slightly above. */
const DEFAULT_YAW = -0.62;
const DEFAULT_PITCH = 0.42;
const MAX_PITCH = 1.35;

/** How much wall the panel shows, before the cutaway steps are added. */
const PANEL_WIDTH_MM = 700;
const PANEL_HEIGHT_MM = 470;
/**
 * How much further each layer reaches than the one in front of it, as a fraction of the
 * panel. This is the cutaway: the layers are flush, and successive ones are cut back less,
 * so every layer shows an edge without any of them being moved.
 */
const CUTAWAY_STEP = 0.085;

/**
 * Least thickness a layer may be drawn at, in millimetres. A 0.2 mm vapour barrier is a
 * real layer doing a real job and at true scale it would be thinner than the lines around
 * it — the same compromise the cross-section makes for layers thinner than a stroke.
 */
const MIN_THICKNESS_MM = 2.5;

interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Rotate about the Y axis, then the X axis. The camera looks down -Z from +Z. */
function rotate(v: Vec3, yaw: number, pitch: number): Vec3 {
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const x1 = v.x * cy + v.z * sy;
  const z1 = -v.x * sy + v.z * cy;
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  return { x: x1, y: v.y * cp - z1 * sp, z: v.y * sp + z1 * cp };
}

/** The six faces of a box, as indices into the eight corners below. */
const FACES: readonly {
  readonly corners: readonly [number, number, number, number];
  readonly normal: Vec3;
}[] = [
  { corners: [4, 5, 6, 7], normal: { x: 0, y: 0, z: 1 } }, // near (toward the room)
  { corners: [1, 0, 3, 2], normal: { x: 0, y: 0, z: -1 } }, // far
  { corners: [3, 7, 6, 2], normal: { x: 0, y: -1, z: 0 } }, // bottom
  { corners: [0, 1, 5, 4], normal: { x: 0, y: 1, z: 0 } }, // top
  { corners: [1, 2, 6, 5], normal: { x: 1, y: 0, z: 0 } }, // right
  { corners: [0, 4, 7, 3], normal: { x: -1, y: 0, z: 0 } }, // left
];

/** Corners of an axis-aligned box, ordered to match FACES. */
function corners(
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  z0: number,
  z1: number,
): readonly Vec3[] {
  return [
    { x: x0, y: y1, z: z0 },
    { x: x1, y: y1, z: z0 },
    { x: x1, y: y0, z: z0 },
    { x: x0, y: y0, z: z0 },
    { x: x0, y: y1, z: z1 },
    { x: x1, y: y1, z: z1 },
    { x: x1, y: y0, z: z1 },
    { x: x0, y: y0, z: z1 },
  ];
}

/** A face ready to draw: its outline, how far away it is, and how lit it is. */
interface DrawnFace {
  readonly points: string;
  readonly depth: number;
  readonly fill: string;
  readonly shade: number;
  readonly key: string;
}

/**
 * Light from over the viewer's left shoulder. Normalised so the brightest face is fully
 * lit; the fixed ambient floor keeps a face turned away from the light readable rather
 * than black.
 */
const LIGHT: Vec3 = { x: -0.42, y: 0.74, z: 0.52 };
const AMBIENT = 0.62;

export interface Layup3DProps {
  readonly layers: readonly UiLayer[];
  readonly included: readonly boolean[];
  readonly selectedLayerId?: string | undefined;
  readonly onSelectLayer?: ((layerId: string | undefined) => void) | undefined;
}

export function Layup3D({
  layers,
  included,
  selectedLayerId,
  onSelectLayer,
}: Layup3DProps): JSX.Element {
  const [yaw, setYaw] = useState(DEFAULT_YAW);
  const [pitch, setPitch] = useState(DEFAULT_PITCH);
  const dragRef = useRef<{ x: number; y: number; yaw: number; pitch: number } | null>(null);

  const totalThicknessMm = layers.reduce((total, layer) => total + layer.thicknessMm, 0);
  if (layers.length === 0 || totalThicknessMm <= 0) {
    return <p className="empty-note">Add a layer with a thickness to see the layup.</p>;
  }

  /*
   * Wide enough for two bays of the widest member spacing, so the rhythm of the studs
   * reads rather than a single lonely one.
   */
  const widestPitchMm = layers.reduce((widest, layer) => {
    const geometry = bridgeGeometry(layer);
    return geometry === undefined ? widest : Math.max(widest, geometry.pitchMm);
  }, 0);
  /*
   * Enough panel to read the stud rhythm, but no more: every extra millimetre of wall
   * makes the stack thinner in proportion, and the stack is the thing being looked at.
   */
  const baseWidthMm = Math.max(PANEL_WIDTH_MM, widestPitchMm * 1.6);
  const baseHeightMm = baseWidthMm * (PANEL_HEIGHT_MM / PANEL_WIDTH_MM);

  /*
   * The stack, front to back. Depth runs from the inside face at z = 0 outwards into
   * negative z, each layer starting exactly where the one before it ended — the whole
   * point being that there is nothing between them.
   */
  const stack = (() => {
    let z = 0;
    return layers.map((layer, index) => {
      const thickness = Math.max(MIN_THICKNESS_MM, layer.thicknessMm);
      const z1 = z;
      z -= thickness;
      return {
        layer,
        index,
        included: included[index] ?? true,
        z0: z,
        z1,
        // Each layer reaches further right and further up than the one in front.
        widthMm: baseWidthMm * (1 + index * CUTAWAY_STEP),
        heightMm: baseHeightMm * (1 + index * CUTAWAY_STEP),
      };
    });
  })();

  const widestMm = Math.max(...stack.map((slab) => slab.widthMm));
  const tallestMm = Math.max(...stack.map((slab) => slab.heightMm));

  // Centre the model on its own bounding box so it turns about the middle of itself.
  const cx = -widestMm / 2;
  const cy = -tallestMm / 2;
  const cz = totalThicknessMm / 2;

  const place = (v: Vec3): Vec3 =>
    rotate({ x: v.x + cx, y: v.y + cy, z: v.z + cz }, yaw, pitch);

  /*
   * Fit to what the model actually projects to at the angle it is at.
   *
   * A fixed worst-case bound was tried first and is not usable: turning about the upright
   * axis swings the width into the depth, so the depth that then feeds the vertical
   * extent is not the build-up's thickness but can be as wide as the wall — the only
   * honest fixed bound is the full 3D diagonal, which leaves a flat slab marooned in white
   * space at every angle anyone would actually look at it from. Measuring the corners
   * costs one pass over eight vertices per box and can never clip.
   */
  const outline = stack.flatMap((slab) =>
    corners(0, slab.widthMm, 0, slab.heightMm, slab.z0, slab.z1).map(place),
  );
  const minX = Math.min(...outline.map((v) => v.x));
  const maxX = Math.max(...outline.map((v) => v.x));
  const minY = Math.min(...outline.map((v) => v.y));
  const maxY = Math.max(...outline.map((v) => v.y));
  const scale = Math.min(
    (VIEW_W - 96) / Math.max(1, maxX - minX),
    (VIEW_H - 52) / Math.max(1, maxY - minY),
  );
  // Centre on the projected box rather than on the model's own middle: the cutaway steps
  // make it lopsided, and centring on the geometry leaves it visibly off to one side.
  const originX = (VIEW_W - 70) / 2 - ((minX + maxX) / 2) * scale;
  const originY = VIEW_H / 2 + ((minY + maxY) / 2) * scale;

  const toScreen = (v: Vec3): readonly [number, number] => [
    originX + v.x * scale,
    originY - v.y * scale,
  ];

  const faceBrightness = (normal: Vec3): number => {
    const n = rotate(normal, yaw, pitch);
    const lambert = Math.max(0, n.x * LIGHT.x + n.y * LIGHT.y + n.z * LIGHT.z);
    return AMBIENT + (1 - AMBIENT) * lambert;
  };

  /** Every visible face of one box, ready for the depth sort. */
  const boxFaces = (
    key: string,
    fill: string,
    box: readonly Vec3[],
    skip: readonly number[] = [],
  ): readonly DrawnFace[] => {
    const placed = box.map(place);
    const out: DrawnFace[] = [];
    FACES.forEach((face, faceIndex) => {
      /*
       * Faces buried against a neighbouring box are never emitted. Two boxes sitting
       * flush share a plane, so both would land at the same depth and the sort would have
       * no way to choose between them — they would flicker against each other as the
       * model turned.
       */
      if (skip.includes(faceIndex)) {
        return;
      }
      // Drop the faces turned away from the camera: they can never be seen, and drawing
      // them would put a wrongly shaded polygon over one that should be in front.
      const n = rotate(face.normal, yaw, pitch);
      if (n.z <= 0.0001) {
        return;
      }
      const vertices = face.corners.map((corner) => placed[corner]);
      if (vertices.some((vertex) => vertex === undefined)) {
        return;
      }
      const depth =
        vertices.reduce((total, vertex) => total + (vertex?.z ?? 0), 0) / vertices.length;
      out.push({
        key: `${key}-${faceIndex}`,
        points: vertices
          .map((vertex) => {
            const [sx, sy] = toScreen(vertex ?? { x: 0, y: 0, z: 0 });
            return `${sx.toFixed(1)},${sy.toFixed(1)}`;
          })
          .join(' '),
        depth,
        fill,
        shade: faceBrightness(face.normal),
      });
    });
    return out;
  };

  const timberFill = CATEGORY_STYLE['timber-and-board'].fill;
  const dabFill = CATEGORY_STYLE['plaster-and-render'].fill;

  const faces: DrawnFace[] = [];
  const badges: { index: number; x: number; y: number; id: string }[] = [];

  /**
   * A bridged layer is not one material: it is members with the layer's material packed
   * between them. Modelling it that way is what lets the members be seen at all — buried
   * inside a single solid box they would be sealed in by their own layer — and it is also
   * how the layer is actually built.
   */
  const segmentsOf = (slab: (typeof stack)[number]): readonly {
    readonly x0: number;
    readonly x1: number;
    readonly fill: string;
    readonly isMember: boolean;
    /** Nothing is there. An air layer's air, as opposed to the members crossing it. */
    readonly isVoid: boolean;
  }[] => {
    const style = CATEGORY_STYLE[layerDrawCategory(slab.layer.materialId, slab.layer.kind)];
    const fill = slab.included ? style.fill : 'var(--excluded-hatch)';
    // A cavity is empty, so its air carries no box at all - see the loop below.
    const isCavity = slab.layer.kind === 'air';
    const whole = [{ x0: 0, x1: slab.widthMm, fill, isMember: false, isVoid: isCavity }];

    /*
     * Same geometry decision as the section drawing, from the same helper, so the two
     * views cannot disagree about what is in a layer. A bridged cavity counts: battens
     * behind a dry lining are as much a part of the build-up to look at as a stud is.
     */
    const geometry = bridgeGeometry(slab.layer);
    if (geometry === undefined) {
      return whole;
    }
    const pitchMm = geometry.pitchMm;
    if (!(pitchMm > 0)) {
      return whole;
    }
    const memberFill = geometry.pattern === 'dabs' ? dabFill : timberFill;

    const out: {
      x0: number;
      x1: number;
      fill: string;
      isMember: boolean;
      isVoid: boolean;
    }[] = [];
    let cursor = 0;
    for (let centre = pitchMm / 2; centre < slab.widthMm; centre += pitchMm) {
      const m0 = Math.max(cursor, centre - geometry.widthMm / 2);
      const m1 = Math.min(slab.widthMm, centre + geometry.widthMm / 2);
      if (m1 <= m0) {
        continue;
      }
      if (m0 > cursor) {
        out.push({ x0: cursor, x1: m0, fill, isMember: false, isVoid: isCavity });
      }
      out.push({ x0: m0, x1: m1, fill: memberFill, isMember: true, isVoid: false });
      cursor = m1;
    }
    if (cursor < slab.widthMm) {
      out.push({ x0: cursor, x1: slab.widthMm, fill, isMember: false, isVoid: isCavity });
    }
    return out.length > 0 ? out : whole;
  };

  for (const slab of stack) {
    const segments = segmentsOf(slab);
    segments.forEach((segment, segmentIndex) => {
      /*
       * A cavity is a gap, so its air gets no box. What shows through the opening is the
       * near face of whatever is behind it, which is already being drawn — the void reads
       * as a recess into the stack rather than as a grey slab pretending to be air.
       */
      if (segment.isVoid) {
        return;
      }
      const skip: number[] = [];
      /*
       * A side face is buried only where something is actually there to bury it. A batten
       * standing in a cavity has air on both sides, so both of its sides are exposed and
       * must be drawn; skipping them on the old "is there a neighbouring segment" rule
       * would leave the member looking hollow.
       */
      if (segmentIndex > 0 && segments[segmentIndex - 1]?.isVoid === false) {
        skip.push(5); // left face, buried against the segment before it
      }
      if (segmentIndex < segments.length - 1 && segments[segmentIndex + 1]?.isVoid === false) {
        skip.push(4); // right face, buried against the next one
      }
      faces.push(
        ...boxFaces(
          `${slab.layer.id}-${segmentIndex}`,
          segment.fill,
          corners(segment.x0, segment.x1, 0, slab.heightMm, slab.z0, slab.z1),
          skip,
        ),
      );
    });

    // The badge sits on the layer's own exposed top-right corner and turns with it.
    const badgeAt = place({ x: slab.widthMm, y: slab.heightMm, z: slab.z1 });
    const [bx, by] = toScreen(badgeAt);
    badges.push({ index: slab.index, x: bx, y: by, id: slab.layer.id });
  }

  faces.sort((a, b) => a.depth - b.depth);

  /*
   * Badges are placed in 3D and turn with the model, so two thin layers put theirs on top
   * of one another. Nudging each clear of the one before it, along the line between them,
   * keeps them legible without pulling any of them far from the layer it names.
   */
  const BADGE_MIN_GAP = 19;
  for (let i = 1; i < badges.length; i += 1) {
    const previous = badges[i - 1];
    const current = badges[i];
    if (previous === undefined || current === undefined) {
      continue;
    }
    const dx = current.x - previous.x;
    const dy = current.y - previous.y;
    const distance = Math.hypot(dx, dy);
    if (distance >= BADGE_MIN_GAP) {
      continue;
    }
    // Coincident badges have no direction to push along, so follow the stack's own step.
    const ux = distance < 0.001 ? 0.85 : dx / distance;
    const uy = distance < 0.001 ? -0.53 : dy / distance;
    badges[i] = {
      ...current,
      x: previous.x + ux * BADGE_MIN_GAP,
      y: previous.y + uy * BADGE_MIN_GAP,
    };
  }

  const beginRotate = (event: React.PointerEvent<SVGSVGElement>): void => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { x: event.clientX, y: event.clientY, yaw, pitch };
  };

  const continueRotate = (event: React.PointerEvent<SVGSVGElement>): void => {
    const start = dragRef.current;
    if (start === null) {
      return;
    }
    setYaw(start.yaw + (event.clientX - start.x) * 0.008);
    // Clamped short of straight up or down: past vertical the model turns inside out and
    // the light comes from the wrong side.
    setPitch(
      Math.max(-MAX_PITCH, Math.min(MAX_PITCH, start.pitch - (event.clientY - start.y) * 0.008)),
    );
  };

  const endRotate = (): void => {
    dragRef.current = null;
  };

  return (
    <figure className="layup-3d">
      <div className="layup-stage">
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          role="img"
          aria-label={`Three-dimensional cutaway of ${layers.length} layers, numbered from the inside out`}
          onPointerDown={beginRotate}
          onPointerMove={continueRotate}
          onPointerUp={endRotate}
          onPointerCancel={endRotate}
        >
          {faces.map((face) => (
            <polygon
              key={face.key}
              points={face.points}
              fill={face.fill}
              className="layup-face"
              style={{ filter: `brightness(${face.shade.toFixed(3)})` }}
            />
          ))}

          {badges.map((badge) => (
            <g
              key={badge.id}
              className={`layup-badge-group${badge.id === selectedLayerId ? ' is-selected' : ''}`}
              onClick={() =>
                onSelectLayer?.(badge.id === selectedLayerId ? undefined : badge.id)
              }
            >
              <circle cx={badge.x} cy={badge.y} r={8.5} className="layup-badge" />
              <text x={badge.x} y={badge.y + 3.2} className="layup-badge-text" textAnchor="middle">
                {badge.index + 1}
              </text>
            </g>
          ))}
        </svg>

        <button
          type="button"
          className="layup-reset"
          onClick={() => {
            setYaw(DEFAULT_YAW);
            setPitch(DEFAULT_PITCH);
          }}
        >
          Reset view
        </button>
      </div>

      <ol className="layup-legend">
        {stack.map((slab) => (
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
        <strong>Drag to turn it.</strong> The layers are face to face with nothing between
        them, as built; what makes each one visible is that it is cut back a little further
        than the one in front. A bridged layer is built the way it is built — members with
        the layer's material packed between them — so the studs show in the cut rather than
        being buried. A <strong>cavity is drawn as the gap it is</strong>: the air is left
        empty and you see through to the face behind it, while battens, studs or dabs
        crossing it stand in the opening. It is an indicator rather than a construction drawing: no junctions,
        fixings or detailing, and nothing in it feeds the calculation. Layers thinner than
        the drawing can show are given a minimum thickness.{' '}
        <strong>Cross battens are not drawn yet</strong> — a second set of members running
        the other way is on the roadmap.
      </figcaption>
    </figure>
  );
}
