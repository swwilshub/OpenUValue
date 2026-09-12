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
  screed: { fill: 'var(--cat-screed)', hatch: 'hatch-fine', label: 'Screed' },
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
        <pattern
          id="hatch-fine"
          width="7"
          height="7"
          patternTransform="rotate(45)"
          patternUnits="userSpaceOnUse"
        >
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
