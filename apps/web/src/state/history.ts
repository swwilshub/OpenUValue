/**
 * Undo and redo for the build-up.
 *
 * The whole build-up is one serialisable value, so history is a list of those values
 * rather than a log of operations that each need an inverse: undo steps back to the
 * previous value, redo steps forward, and nothing has to know how a change was made.
 *
 * **What counts as one step.** A drag on a layer's edge sets the state on every pointer
 * move, and typing "100" sets it three times; neither should take a hundred undos to
 * reverse. Changes that arrive within a short window of the one before are folded into
 * it, so a gesture or a burst of typing is one step. A few actions are steps in their own
 * right whatever the timing — loading an example, reversing the layers, arriving on a
 * link — and they also seal the step behind them, so an edit made straight afterwards
 * does not fold back into the thing it came after.
 *
 * Pure functions throughout. The caller supplies the time, which keeps this testable
 * and keeps React's double-invoked updaters in development returning the same result.
 */

export interface History<T> {
  readonly past: readonly T[];
  readonly present: T;
  readonly future: readonly T[];
  /** When the present was last changed, in the caller's clock. */
  readonly lastChangeAt: number;
  /** True when the next change must start a new step, whatever the timing. */
  readonly sealed: boolean;
}

/** Changes closer together than this are one step. Long enough for typing, short enough
 * that two deliberate clicks stay separate. */
export const COALESCE_WINDOW_MS = 600;

/** How far back undo reaches. Each entry is a whole build-up, so this bounds memory. */
export const HISTORY_LIMIT = 100;

export function initialHistory<T>(present: T): History<T> {
  return {
    past: [],
    present,
    future: [],
    lastChangeAt: Number.NEGATIVE_INFINITY,
    sealed: true,
  };
}

export interface RecordOptions {
  /** Make this change a step of its own, and seal it so the next one starts afresh. */
  readonly separate?: boolean;
}

export function record<T>(
  history: History<T>,
  next: T,
  now: number,
  options: RecordOptions = {},
): History<T> {
  if (Object.is(next, history.present)) {
    return history;
  }
  const separate = options.separate === true;
  const joins =
    !separate && !history.sealed && now - history.lastChangeAt < COALESCE_WINDOW_MS;

  if (joins) {
    // Part of the step already under way: the value moves on, the undo point stays.
    return { ...history, present: next, future: [], lastChangeAt: now };
  }
  return {
    past: [...history.past, history.present].slice(-HISTORY_LIMIT),
    present: next,
    future: [],
    lastChangeAt: now,
    sealed: separate,
  };
}

export function canUndo<T>(history: History<T>): boolean {
  return history.past.length > 0;
}

export function canRedo<T>(history: History<T>): boolean {
  return history.future.length > 0;
}

export function undo<T>(history: History<T>): History<T> {
  const previous = history.past[history.past.length - 1];
  if (previous === undefined) {
    return history;
  }
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
    lastChangeAt: Number.NEGATIVE_INFINITY,
    // An edit after an undo is a new branch, never a continuation of the undone step.
    sealed: true,
  };
}

export function redo<T>(history: History<T>): History<T> {
  const [next, ...rest] = history.future;
  if (next === undefined) {
    return history;
  }
  return {
    past: [...history.past, history.present].slice(-HISTORY_LIMIT),
    present: next,
    future: rest,
    lastChangeAt: Number.NEGATIVE_INFINITY,
    sealed: true,
  };
}
