import { useEffect, useMemo, useRef, useState } from 'react';
import type { MaterialCategory, MaterialRecord } from '@openuvalue/materials';
import type { SourceStatus } from '@openuvalue/materials';
import { MATERIALS, findMaterialById, sourceStatus } from '@openuvalue/materials';
import { type LayerDrawCategory, layerDrawCategory } from '../state/model.js';
import { CATEGORY_STYLE, MaterialSwatch } from './hatches.js';

/**
 * Choosing a material from a flat alphabetical <select> means reading twenty names to
 * find the one you want. This groups them by what they are, puts the section hatch
 * beside each one so the list looks like the drawing it feeds, and shows lambda so the
 * choice can be made on the number that matters rather than on the name alone.
 *
 * It is a listbox rather than a native <select> because a <select> cannot show a
 * swatch. That means the keyboard behaviour has to be built rather than inherited, so
 * it is: type to filter, arrows to move, Enter to choose, Escape to close.
 */

const CATEGORY_ORDER: readonly MaterialCategory[] = [
  'masonry',
  'concrete',
  'timber-and-board',
  'insulation',
  'plaster-and-render',
  'screed',
  'membrane',
  'covering',
];

export interface MaterialPickerProps {
  /** Catalogue id, or null when lambda has been typed in directly. */
  readonly materialId: string | null;
  /** Shown when materialId is null, so the control still reads as something. */
  readonly fallbackLabel: string;
  readonly onSelect: (materialId: string) => void;
  readonly label: string;
}

function matches(material: MaterialRecord, query: string): boolean {
  if (query === '') {
    return true;
  }
  const needle = query.toLowerCase();
  return (
    material.name.toLowerCase().includes(needle) ||
    material.category.toLowerCase().includes(needle)
  );
}

/**
 * What each provenance state means, in the words shown on hover. Wording lives here
 * rather than in the data package, which records provenance but does not present it.
 */
const SOURCE_STATUS_TEXT: Readonly<Record<SourceStatus, string>> = {
  cited: 'Read from the standard named below, at the clause named below.',
  evidenced:
    'Assumed. This is the conventional value and every public source consulted agrees ' +
    'on it, but nobody has read the governing clause — so treat it as an assumption ' +
    'that is expected to hold, not as a checked figure. Good enough to model with; ' +
    'not good enough to submit.',
  partial: 'Some values are attributed and some are not. The detail below says which.',
  open: 'Not attributed. A placeholder value, recorded as such.',
};

export function MaterialPicker({
  materialId,
  fallbackLabel,
  onSelect,
  label,
}: MaterialPickerProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  const selected = materialId === null ? undefined : findMaterialById(materialId);
  const selectedCategory: LayerDrawCategory = layerDrawCategory(materialId, 'solid');

  const filtered = useMemo(
    () => MATERIALS.filter((material) => matches(material, query)),
    [query],
  );

  const grouped = useMemo(
    () =>
      CATEGORY_ORDER.map((category) => ({
        category,
        materials: filtered.filter((material) => material.category === category),
      })).filter((group) => group.materials.length > 0),
    [filtered],
  );

  /** The list in the order it is drawn, so arrow keys and the drawn order agree. */
  const flat = useMemo(() => grouped.flatMap((group) => group.materials), [grouped]);

  useEffect(() => {
    if (!open) {
      return;
    }
    searchRef.current?.focus();
  }, [open]);

  // Close on a click anywhere else. Pointerdown rather than click, so the popover is
  // gone before the click lands on whatever is underneath it.
  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointerDown = (event: PointerEvent): void => {
      if (rootRef.current !== null && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const choose = (material: MaterialRecord): void => {
    onSelect(material.id);
    setOpen(false);
    setQuery('');
  };

  const onKeyDown = (event: React.KeyboardEvent): void => {
    if (event.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      setActiveIndex((current) => {
        if (flat.length === 0) {
          return 0;
        }
        return (current + delta + flat.length) % flat.length;
      });
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const material = flat[activeIndex];
      if (material !== undefined) {
        choose(material);
      }
    }
  };

  return (
    <div className="material-picker" ref={rootRef}>
      <span className="picker-label">{label}</span>
      <button
        type="button"
        className="picker-button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => {
          setOpen((current) => !current);
          setActiveIndex(0);
        }}
      >
        <MaterialSwatch category={selectedCategory} size={18} />
        <span className="picker-name">{selected?.name ?? fallbackLabel}</span>
        <span className="picker-caret" aria-hidden="true">
          ▾
        </span>
      </button>

      {open && (
        <div className="picker-popover" onKeyDown={onKeyDown}>
          <input
            ref={searchRef}
            type="search"
            className="picker-search"
            placeholder="Search materials"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
          />
          <ul className="picker-list" role="listbox" aria-label={label}>
            {grouped.map((group) => (
              <li key={group.category} className="picker-group">
                <div className="picker-group-head">
                  <MaterialSwatch category={group.category} size={14} />
                  {CATEGORY_STYLE[group.category].label}
                </div>
                <ul>
                  {group.materials.map((material) => {
                    const index = flat.indexOf(material);
                    return (
                      <li key={material.id}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={material.id === materialId}
                          className={[
                            'picker-option',
                            material.id === materialId ? 'is-selected' : '',
                            index === activeIndex ? 'is-active' : '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          onMouseEnter={() => setActiveIndex(index)}
                          onClick={() => choose(material)}
                        >
                          <MaterialSwatch category={material.category} size={18} />
                          <span className="picker-option-name">{material.name}</span>
                          <span className="picker-option-props">
                            <span title="Thermal conductivity">
                              λ {material.lambdaWPerMK}
                            </span>
                            <span title="Water vapour resistance factor: how many times harder than still air this is to get vapour through">
                              μ {material.vapourResistanceFactorMu}
                            </span>
                            {/*
                              Whether the values have been traced to a published clause.
                              The database records that honestly; showing it here is what
                              stops an unattributed figure passing for a checked one.
                              Evidenced carries an asterisk rather than a fourth colour,
                              so the one state that needs a caveat is the one state that
                              does not rely on telling two dots apart.
                            */}
                            <span
                              className={`source-dot source-${sourceStatus(material)}`}
                              title={`${SOURCE_STATUS_TEXT[sourceStatus(material)]}\n\n${material.source}`}
                              aria-label={`Source: ${SOURCE_STATUS_TEXT[sourceStatus(material)]}. ${material.source}`}
                            >
                              {sourceStatus(material) === 'evidenced' ? '∗' : ''}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
            {grouped.length === 0 && <li className="picker-empty">Nothing matches “{query}”.</li>}
          </ul>
          {/*
            Each marker and its wording are one span, so a wrap never leaves a dot on a
            different line from the label it belongs to.
          */}
          <p className="picker-provenance">
            <span>
              <span className="source-dot source-cited" /> read from the standard
            </span>
            <span>
              <span className="source-dot source-evidenced">∗</span> assumed, not yet read
            </span>
            <span>
              <span className="source-dot source-partial" /> partly attributed
            </span>
            <span>
              <span className="source-dot source-open" /> not attributed
            </span>
          </p>
        </div>
      )}
    </div>
  );
}
