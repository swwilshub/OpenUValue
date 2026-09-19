import { MATERIALS } from '@openuvalue/materials';
import type { LayerDrawCategory, UiLayer } from './model.js';
import { blankAirLayer, layerFromMaterial } from './model.js';

/**
 * The tray of materials you build a wall out of by hand.
 *
 * The layer list can already add a layer and set a material on it, which is two steps and
 * a dropdown. This is the other way round: pick the thing, put it where it goes. It is
 * the same catalogue either way — nothing here is a material the list does not have — so
 * the palette adds a way in rather than a second source of truth.
 *
 * **The starting thicknesses are commercial conventions, not standard values.** A brick
 * is 102.5 mm and a sheet of plasterboard 12.5 mm because that is what they are sold as,
 * and no standard fixes either. They are a first guess to drag out to the real figure,
 * which is why every one of them is editable the moment the layer lands.
 */

export interface PaletteItem {
  /** Palette id, which is the material id or 'cavity'. */
  readonly id: string;
  /** Short enough for a chip. The full name goes on the layer itself. */
  readonly label: string;
  readonly category: LayerDrawCategory;
  readonly thicknessMm: number;
}

export interface PaletteGroup {
  readonly title: string;
  readonly items: readonly PaletteItem[];
}

/** Common UK sizes, by material. See the note above: conventions, not standards. */
const STARTING_THICKNESS_MM: Readonly<Record<string, number>> = {
  'brick-outer-leaf': 102.5,
  'brick-inner-leaf': 102.5,
  'dense-concrete-block': 100,
  'aircrete-block': 100,
  'concrete-medium-density': 150,
  'concrete-reinforced': 150,
  'gypsum-plasterboard': 12.5,
  'gypsum-plasterboard-dense': 15,
  'gypsum-plaster': 13,
  // BR 443 (2006) 4.7.1 draws a dab 15 mm thick, which is the one figure here with a
  // clause behind it rather than a merchant's catalogue.
  'plaster-dabs': 15,
  'cement-sand-render': 20,
  'sand-cement-screed': 65,
  'softwood-structural': 47,
  'osb-board': 9,
  'plywood-board': 12,
  'chipboard-flooring': 22,
  'mineral-wool-quilt': 100,
  'eps-board': 100,
  'pir-board': 100,
  'wood-fibre-board': 60,
  'polyethylene-vcl': 0.2,
  'bitumen-sheet': 1,
  'concrete-roof-tile': 12,
  'clay-roof-tile': 12,
};

/** Chip labels: the catalogue names are written to be unambiguous, not to be short. */
const CHIP_LABEL: Readonly<Record<string, string>> = {
  'brick-outer-leaf': 'Brick, outer',
  'brick-inner-leaf': 'Brick, inner',
  'dense-concrete-block': 'Dense block',
  'aircrete-block': 'Aircrete block',
  'concrete-medium-density': 'Concrete',
  'concrete-reinforced': 'Reinforced concrete',
  'gypsum-plasterboard': 'Plasterboard',
  'gypsum-plasterboard-dense': 'Plasterboard, dense',
  'gypsum-plaster': 'Gypsum plaster',
  'plaster-dabs': 'Plaster dabs',
  'cement-sand-render': 'Render',
  'sand-cement-screed': 'Screed',
  'softwood-structural': 'Softwood',
  'osb-board': 'OSB',
  'plywood-board': 'Plywood',
  'chipboard-flooring': 'Chipboard',
  'mineral-wool-quilt': 'Mineral wool',
  'eps-board': 'EPS',
  'pir-board': 'PIR',
  'wood-fibre-board': 'Wood fibre',
  'polyethylene-vcl': 'Vapour control layer',
  'bitumen-sheet': 'Bitumen sheet',
  'concrete-roof-tile': 'Concrete tile',
  'clay-roof-tile': 'Clay tile',
};

/**
 * The drag type the palette writes and the drawing looks for. A drag's data cannot be
 * read while it is in flight, only its types, so the type itself has to be the signal
 * that this is a chip from here and not a file or a piece of text from somewhere else.
 */
export const PALETTE_DRAG_TYPE = 'application/x-openuvalue-palette';

/** The id a cavity chip carries, which is not a material and has no catalogue entry. */
export const CAVITY_PALETTE_ID = 'cavity';

/** A cavity wide enough to be worth having, which the guess then classifies. */
const CAVITY_STARTING_THICKNESS_MM = 50;

const GROUP_TITLES: readonly { readonly category: LayerDrawCategory; readonly title: string }[] = [
  { category: 'masonry', title: 'Masonry' },
  { category: 'concrete', title: 'Concrete' },
  { category: 'insulation', title: 'Insulation' },
  { category: 'timber-and-board', title: 'Timber and board' },
  { category: 'plaster-and-render', title: 'Plaster and render' },
  { category: 'screed', title: 'Screed' },
  { category: 'membrane', title: 'Membrane' },
  { category: 'covering', title: 'Covering' },
];

/**
 * The palette, grouped the way the legend under the drawing groups things, with the
 * cavity on the end because it is the one entry that is not a material.
 */
export const PALETTE_GROUPS: readonly PaletteGroup[] = [
  ...GROUP_TITLES.map((group) => ({
    title: group.title,
    items: MATERIALS.filter((material) => material.category === group.category).map(
      (material): PaletteItem => ({
        id: material.id,
        label: CHIP_LABEL[material.id] ?? material.name,
        category: group.category,
        thicknessMm: STARTING_THICKNESS_MM[material.id] ?? 100,
      }),
    ),
  })).filter((group) => group.items.length > 0),
  {
    title: 'Air',
    items: [
      {
        id: CAVITY_PALETTE_ID,
        label: 'Cavity',
        category: 'air',
        thicknessMm: CAVITY_STARTING_THICKNESS_MM,
      },
    ],
  },
];

const BY_ID = new Map(
  PALETTE_GROUPS.flatMap((group) => group.items).map((item) => [item.id, item] as const),
);

export function paletteItem(id: string): PaletteItem | undefined {
  return BY_ID.get(id);
}

/**
 * The layer a palette chip makes. A cavity comes out blank and is classified by
 * `withLayerInserted`, which can see the neighbours it lands between; a material comes
 * out complete.
 */
export function layerFromPalette(id: string): UiLayer | undefined {
  const item = BY_ID.get(id);
  if (item === undefined) {
    return undefined;
  }
  if (id === CAVITY_PALETTE_ID) {
    return { ...blankAirLayer(), thicknessMm: item.thicknessMm };
  }
  return layerFromMaterial(id, item.thicknessMm);
}
