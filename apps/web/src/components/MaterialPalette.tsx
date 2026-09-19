import { PALETTE_GROUPS, PALETTE_DRAG_TYPE } from '../state/palette.js';
import type { PaletteItem } from '../state/palette.js';
import { MaterialSwatch } from './hatches.js';
import { HelpButton } from './guide/Guide.js';

/**
 * The tray of materials, for building a wall by hand rather than by dropdown.
 *
 * Two ways in, because one of them does not work everywhere. Dragging a chip onto the
 * drawing puts the layer exactly where it is dropped, which is the point of a palette;
 * but a touch device has no drag-and-drop to speak of, so a chip is also a button that
 * adds its layer at the end, or after whichever layer is selected. Neither is a second
 * kind of layer: both produce what the list would have produced.
 */

export interface MaterialPaletteProps {
  readonly onAdd: (paletteId: string) => void;
  readonly onOpenGuide: (topicId: string) => void;
  /** Where a click will put the layer, so the button can say so. */
  readonly addPosition: string;
}

function Chip({
  item,
  onAdd,
}: {
  readonly item: PaletteItem;
  readonly onAdd: (paletteId: string) => void;
}): JSX.Element {
  const add = (): void => onAdd(item.id);
  return (
    /*
     * A div rather than a button, which is the one thing that stops this working: a
     * form control swallows the mousedown that would start a drag, so `draggable` on a
     * <button> is quietly ignored. The role and the key handling put back what a button
     * was giving us.
     */
    <div
      role="button"
      tabIndex={0}
      className="palette-chip"
      draggable
      onDragStart={(event) => {
        /*
         * Our own type is what the drawing checks for on dragover, where the data itself
         * cannot be read. text/plain goes along with it so a chip dragged somewhere else
         * entirely drops a readable name rather than nothing.
         */
        event.dataTransfer.setData(PALETTE_DRAG_TYPE, item.id);
        event.dataTransfer.setData('text/plain', item.label);
        event.dataTransfer.effectAllowed = 'copy';
      }}
      onClick={add}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          add();
        }
      }}
      title={`${item.label}, ${item.thicknessMm} mm to start with`}
    >
      <MaterialSwatch category={item.category} size={17} />
      <span>{item.label}</span>
    </div>
  );
}

export function MaterialPalette({
  onAdd,
  onOpenGuide,
  addPosition,
}: MaterialPaletteProps): JSX.Element {
  return (
    <div className="palette">
      <div className="palette-head">
        <span className="picker-label">
          Materials
          <HelpButton topicId="palette" label="the materials palette" onOpen={onOpenGuide} />
        </span>
        <span className="palette-hint">
          Drag one onto the drawing to put it where you want it, or click to add it{' '}
          {addPosition}. Every one lands at a common thickness you can then drag out.
        </span>
      </div>
      <div className="palette-groups">
        {PALETTE_GROUPS.map((group) => (
          <div key={group.title} className="palette-group">
            <span className="palette-group-title">{group.title}</span>
            <div className="palette-chips">
              {group.items.map((item) => (
                <Chip key={item.id} item={item} onAdd={onAdd} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
