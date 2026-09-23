import { useEffect, useRef, useState } from 'react';

export interface StartingPoint {
  readonly id: string;
  readonly label: string;
  readonly detail: string;
}

export interface StartFromMenuProps {
  readonly options: readonly StartingPoint[];
  readonly onPick: (id: string) => void;
}

/**
 * The examples, gathered into one menu so the header holds the few things used on every
 * visit. Loading one replaces the build-up on screen, which is safe now that it can be
 * undone; the note that appears afterwards says so.
 */
export function StartFromMenu({ options, onPick }: StartFromMenuProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Closed by a press anywhere else or by Escape, the way any menu is.
  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointer = (event: PointerEvent): void => {
      const root = rootRef.current;
      if (root !== null && event.target instanceof Node && !root.contains(event.target)) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('pointerdown', onPointer);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="menu" ref={rootRef}>
      <button
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        Start from
        <svg viewBox="0 0 10 10" className="menu-caret" aria-hidden="true">
          <path d="M2 3.5l3 3 3-3" />
        </svg>
      </button>
      {open && (
        <div className="menu-list">
          {options.map((option) => (
            <button
              key={option.id}
              type="button"
              className="menu-item"
              onClick={() => {
                setOpen(false);
                onPick(option.id);
              }}
            >
              <span className="menu-item-label">{option.label}</span>
              <span className="menu-item-detail">{option.detail}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
