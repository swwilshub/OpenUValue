import type { LayerDrawCategory } from '../state/model.js';

/**
 * The drawing conventions for building materials in section, and the one place they
 * are defined.
 *
 * These follow ordinary architectural drafting practice — coursing for masonry, an
 * aggregate stipple for concrete, grain for timber, a soft wave for quilt insulation,
 * a fine stipple for plaster and render, lapped arcs for tile coverings. Those
 * conventions are the common language of construction drawings rather than anyone's
 * property; the shapes here are drawn from scratch and colour-coded, which the
 * traditional black-on-white symbols are not.
 *
 * The patterns live in a single hidden <svg> mounted once at the root of the app, so
 * the swatch beside a material in the picker is literally the same fill as the layer
 * it will become in the cross-section. An icon that merely resembled the drawing
 * would drift from it.
 */
/**
 * Solid fills for the 3D view, one per category.
 *
 * Separate from CATEGORY_STYLE on purpose. That palette is built for a line drawing,
 * where a fill sits behind hatching and should stay out of the way; the same colours
 * shaded across three faces of a box lose what little separated them, and masonry,
 * covering, screed, plaster and custom all arrived at the same beige. These keep each
 * category's hue so a material is recognisably itself in both views, and spread the
 * saturation and lightness so the layers of a stack can be told apart.
 */
export const CATEGORY_3D_FILL: Record<LayerDrawCategory, string> = {
  masonry: 'var(--cat3d-masonry)',
  concrete: 'var(--cat3d-concrete)',
  'timber-and-board': 'var(--cat3d-timber)',
  insulation: 'var(--cat3d-insulation)',
  'plaster-and-render': 'var(--cat3d-plaster)',
  screed: 'var(--cat3d-screed)',
  membrane: 'var(--cat3d-membrane)',
  covering: 'var(--cat3d-covering)',
  air: 'var(--cat3d-air)',
  custom: 'var(--cat3d-custom)',
};

export const CATEGORY_STYLE: Record<
  LayerDrawCategory,
  { readonly fill: string; readonly hatch?: string; readonly label: string }
> = {
  masonry: { fill: 'var(--cat-masonry)', hatch: 'hatch-masonry', label: 'Masonry' },
  concrete: { fill: 'var(--cat-concrete)', hatch: 'hatch-concrete', label: 'Concrete' },
  'timber-and-board': {
    fill: 'var(--cat-timber)',
    hatch: 'hatch-timber',
    label: 'Timber and board',
  },
  insulation: { fill: 'var(--cat-insulation)', hatch: 'hatch-insulation', label: 'Insulation' },
  'plaster-and-render': {
    fill: 'var(--cat-plaster)',
    hatch: 'hatch-fine',
    label: 'Plaster and render',
  },
  screed: { fill: 'var(--cat-screed)', hatch: 'hatch-screed', label: 'Screed' },
  membrane: { fill: 'var(--cat-membrane)', hatch: 'hatch-membrane', label: 'Membrane' },
  covering: { fill: 'var(--cat-covering)', hatch: 'hatch-covering', label: 'Covering' },
  air: { fill: 'var(--cat-air)', label: 'Cavity' },
  custom: { fill: 'var(--cat-custom)', label: 'Other' },
};

/**
 * Mounted once, near the root. Everything that draws a material — the cross-section
 * and every swatch — references these ids, so there is exactly one definition of what
 * brickwork looks like.
 */
export function HatchDefs(): JSX.Element {
  return (
    <svg aria-hidden="true" focusable="false" className="hatch-defs">
      <defs>
        {/* Surface resistance films: air, with no thickness of their own. */}
        <pattern
          id="film-hatch"
          width="6"
          height="6"
          patternTransform="rotate(45)"
          patternUnits="userSpaceOnUse"
        >
          <line x1="0" y1="0" x2="0" y2="6" stroke="var(--film-hatch)" strokeWidth="2" />
        </pattern>

        {/* A layer the calculation disregards. */}
        <pattern
          id="excluded-hatch"
          width="8"
          height="8"
          patternTransform="rotate(45)"
          patternUnits="userSpaceOnUse"
        >
          <line x1="0" y1="0" x2="0" y2="8" stroke="var(--excluded-hatch)" strokeWidth="3" />
        </pattern>

        {/*
          Masonry: running bond, half-lapped course to course. The bed joints carry a
          heavier line than the perpends, which is how a drawn leaf reads: the courses
          are what the eye should pick up first.
        */}
        <pattern id="hatch-masonry" width="26" height="15" patternUnits="userSpaceOnUse">
          <g stroke="var(--cat-masonry-ink)" fill="none">
            <g strokeWidth="1">
              <line x1="0" y1="0.5" x2="26" y2="0.5" />
              <line x1="0" y1="7.5" x2="26" y2="7.5" />
            </g>
            <g strokeWidth="0.7">
              <line x1="13" y1="0.5" x2="13" y2="7.5" />
              <line x1="0" y1="7.5" x2="0" y2="14.5" />
              <line x1="26" y1="7.5" x2="26" y2="14.5" />
            </g>
          </g>
        </pattern>

        {/* Concrete: the conventional aggregate, angular pieces among a stipple. */}
        <pattern id="hatch-concrete" width="22" height="22" patternUnits="userSpaceOnUse">
          <g fill="var(--cat-concrete-ink)">
            <circle cx="4" cy="5.5" r="1.1" />
            <circle cx="15.5" cy="12" r="0.85" />
            <circle cx="9" cy="19" r="1.15" />
            <circle cx="19.5" cy="3.5" r="0.75" />
            <circle cx="12" cy="7" r="0.6" />
          </g>
          <g fill="none" stroke="var(--cat-concrete-ink)" strokeWidth="0.8">
            <path d="M8.5 2.5 l4.2 2.2 -3.2 3 z" />
            <path d="M2.5 13 l3.6 1.1 -1.5 3.2 z" />
            <path d="M15.5 16.5 l3.8 1.7 -2.7 2.6 z" />
          </g>
        </pattern>

        {/* Timber: grain along the length of the piece, with the odd knot in it. */}
        <pattern id="hatch-timber" width="26" height="14" patternUnits="userSpaceOnUse">
          <g stroke="var(--cat-timber-ink)" strokeWidth="0.85" fill="none">
            <path d="M0 2.6 q13 -2.4 26 0" />
            <path d="M0 6.8 q13 2.6 26 0" />
            <path d="M0 11.4 q13 -1.8 26 0" />
            <ellipse cx="18.5" cy="9.1" rx="2.3" ry="1.1" />
          </g>
        </pattern>

        {/*
          Insulation: the conventional soft-quilt wave, with a lighter one between the
          rows so a thick layer reads as a quilt rather than as a stack of lines.
        */}
        <pattern id="hatch-insulation" width="18" height="12" patternUnits="userSpaceOnUse">
          <g fill="none" stroke="var(--cat-insulation-ink)">
            <path d="M0 6 q4.5 -5.5 9 0 t9 0" strokeWidth="1.15" />
            <path d="M0 12 q4.5 -5.5 9 0 t9 0" strokeWidth="0.6" opacity="0.55" />
          </g>
        </pattern>

        {/* Plaster and render: the fine stipple these take on a drawing. */}
        <pattern id="hatch-fine" width="9" height="9" patternUnits="userSpaceOnUse">
          <g fill="var(--cat-plaster-ink)">
            <circle cx="1.7" cy="2.3" r="0.55" />
            <circle cx="5.5" cy="6.2" r="0.5" />
            <circle cx="7.7" cy="1.5" r="0.45" />
            <circle cx="3.2" cy="8" r="0.42" />
            <circle cx="6.6" cy="3.6" r="0.35" />
          </g>
        </pattern>

        {/* Screed: the same idea a size coarser, with sand showing in it. */}
        <pattern id="hatch-screed" width="12" height="12" patternUnits="userSpaceOnUse">
          <g fill="var(--cat-screed-ink)">
            <circle cx="2.2" cy="3" r="0.75" />
            <circle cx="7.4" cy="8.2" r="0.65" />
            <circle cx="10.2" cy="2" r="0.55" />
            <circle cx="4.4" cy="10.6" r="0.5" />
          </g>
          <path
            d="M8.6 4.4 l2.2 1 -1.6 1.6 z"
            fill="none"
            stroke="var(--cat-screed-ink)"
            strokeWidth="0.7"
          />
        </pattern>

        {/* Membrane: dense lines, since these layers are only a line or two wide. */}
        <pattern id="hatch-membrane" width="4" height="4" patternUnits="userSpaceOnUse">
          <line x1="0" y1="0" x2="0" y2="4" stroke="var(--cat-membrane-ink)" strokeWidth="1.4" />
        </pattern>

        {/* Covering: lapped tiles, the second row half a tile across. */}
        <pattern id="hatch-covering" width="14" height="10" patternUnits="userSpaceOnUse">
          <g fill="none" stroke="var(--cat-covering-ink)" strokeWidth="0.9">
            <path d="M0 10 a7 5 0 0 1 14 0" />
            <path d="M-7 5 a7 5 0 0 1 14 0" opacity="0.6" />
            <path d="M7 5 a7 5 0 0 1 14 0" opacity="0.6" />
          </g>
        </pattern>

        {/*
          Shading across each layer's own thickness, dark at both faces.
          Object-bounding-box units, so it follows whatever rectangle it is put on and
          turns with the drawing when a roof lays the build-up down the page. It is a
          drawing device rather than information: it separates one slab from the next
          without adding a line that could be mistaken for a material boundary.
        */}
        <linearGradient id="layer-shade" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#1d2321" stopOpacity="0.13" />
          <stop offset="14%" stopColor="#1d2321" stopOpacity="0.02" />
          <stop offset="86%" stopColor="#1d2321" stopOpacity="0.02" />
          <stop offset="100%" stopColor="#1d2321" stopOpacity="0.13" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export interface MaterialSwatchProps {
  readonly category: LayerDrawCategory;
  /** Drawn size in px. The patterns are fixed-scale, so a small swatch shows less. */
  readonly size?: number;
  readonly title?: string;
}

/** The category's fill and hatch as a small square, for use beside a material name. */
export function MaterialSwatch({
  category,
  size = 22,
  title,
}: MaterialSwatchProps): JSX.Element {
  const style = CATEGORY_STYLE[category];
  return (
    <svg
      className="material-swatch"
      width={size}
      height={size}
      viewBox="0 0 22 22"
      aria-hidden={title === undefined}
      role={title === undefined ? undefined : 'img'}
    >
      {title !== undefined && <title>{title}</title>}
      <rect x="0.6" y="0.6" width="20.8" height="20.8" rx="3" fill={style.fill} />
      {style.hatch !== undefined && (
        <rect x="0.6" y="0.6" width="20.8" height="20.8" rx="3" fill={`url(#${style.hatch})`} />
      )}
      <rect
        x="0.6"
        y="0.6"
        width="20.8"
        height="20.8"
        rx="3"
        fill="none"
        stroke="var(--layer-edge)"
        strokeWidth="0.9"
      />
    </svg>
  );
}
