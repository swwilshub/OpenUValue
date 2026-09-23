import { describe, expect, it } from 'vitest';
import {
  COALESCE_WINDOW_MS,
  HISTORY_LIMIT,
  canRedo,
  canUndo,
  initialHistory,
  record,
  redo,
  undo,
} from '../history.js';

/*
 * Values are plain strings so each state is easy to read in an assertion. Times are in
 * milliseconds and chosen either side of the 600 ms window.
 */

describe('recording', () => {
  it('starts with nothing to undo or redo', () => {
    const h = initialHistory('a');
    expect(canUndo(h)).toBe(false);
    expect(canRedo(h)).toBe(false);
  });

  it('makes the first change an undoable step, however soon it comes', () => {
    // Nothing has happened yet, so there is no step for it to fold into.
    const h = record(initialHistory('a'), 'b', 0);
    expect(h.present).toBe('b');
    expect(h.past).toEqual(['a']);
  });

  it('folds a burst of changes into one step', () => {
    // Typing "100": three changes 100 ms apart, all inside the window.
    let h = record(initialHistory(''), '1', 1000);
    h = record(h, '10', 1100);
    h = record(h, '100', 1200);
    expect(h.present).toBe('100');
    expect(h.past).toEqual(['']);
    expect(undo(h).present).toBe('');
  });

  it('keeps a long gesture together while each move comes quickly', () => {
    // A drag lasting 3 s, one move every 50 ms: the gap never reaches 600 ms.
    let h = record(initialHistory(0), 1, 0);
    for (let t = 50, v = 2; t <= 3000; t += 50, v += 1) {
      h = record(h, v, t);
    }
    expect(h.past).toEqual([0]);
  });

  it('starts a new step after a pause as long as the window', () => {
    const h = record(record(initialHistory('a'), 'b', 0), 'c', COALESCE_WINDOW_MS);
    expect(h.past).toEqual(['a', 'b']);
  });

  it('ignores a change that changes nothing', () => {
    const h = record(initialHistory('a'), 'b', 0);
    expect(record(h, 'b', 5000)).toBe(h);
  });

  it('keeps a separate change on its own, and seals it', () => {
    // Loading an example 100 ms after an edit is still its own step...
    let h = record(initialHistory('edit-0'), 'edit-1', 0);
    h = record(h, 'example', 100, { separate: true });
    expect(h.past).toEqual(['edit-0', 'edit-1']);
    // ...and an edit 100 ms after that does not fold back into the example.
    h = record(h, 'edit-2', 200);
    expect(h.past).toEqual(['edit-0', 'edit-1', 'example']);
  });

  it('drops the oldest steps beyond the limit', () => {
    let h = initialHistory(0);
    for (let i = 1; i <= HISTORY_LIMIT + 20; i += 1) {
      h = record(h, i, i * 10_000);
    }
    expect(h.past).toHaveLength(HISTORY_LIMIT);
    // 120 changes kept the last 100 prior values: 20 to 119.
    expect(h.past[0]).toBe(20);
  });
});

describe('undo and redo', () => {
  const three = (): ReturnType<typeof initialHistory<string>> => {
    let h = record(initialHistory('a'), 'b', 0);
    h = record(h, 'c', 10_000);
    return h;
  };

  it('steps back and forward through the steps', () => {
    let h = three();
    h = undo(h);
    expect(h.present).toBe('b');
    h = undo(h);
    expect(h.present).toBe('a');
    expect(canUndo(h)).toBe(false);
    h = redo(h);
    expect(h.present).toBe('b');
    h = redo(h);
    expect(h.present).toBe('c');
    expect(canRedo(h)).toBe(false);
  });

  it('does nothing at either end', () => {
    const start = initialHistory('a');
    expect(undo(start)).toBe(start);
    expect(redo(start)).toBe(start);
  });

  it('throws away the redo branch when something new is done', () => {
    let h = undo(three());
    expect(canRedo(h)).toBe(true);
    h = record(h, 'd', 20_000);
    expect(canRedo(h)).toBe(false);
    expect(h.past).toEqual(['a', 'b']);
  });

  it('never folds an edit made straight after an undo into the undone step', () => {
    // Undo, then type within the window: the typing is a new step, so a second undo
    // returns to where the first one landed rather than further back.
    let h = undo(three());
    h = record(h, 'typed', 1);
    expect(h.past).toEqual(['a', 'b']);
    expect(undo(h).present).toBe('b');
  });
});
