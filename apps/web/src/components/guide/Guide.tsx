import { useEffect, useMemo, useRef, useState } from 'react';
import { ALL_TOPICS, CHAPTERS, findTopicIndex } from './topics.js';

/**
 * The feature guide: every box and control in the tool, each with a diagram of what it
 * does and a short explanation.
 *
 * It opens either from the header — at the beginning, as a tutorial to read through — or
 * from a help button beside a particular box, which jumps straight to that topic. The
 * same content serves both, because a tutorial nobody can re-enter at the point they are
 * stuck at is only half of one.
 *
 * Navigation is by chapter list on wide screens and a plain scrolling list of chapters
 * on narrow ones; arrow keys and Escape work throughout.
 */

export interface GuideProps {
  readonly open: boolean;
  /** Topic to open at. Undefined starts at the beginning. */
  readonly topicId?: string;
  readonly onClose: () => void;
}

export function Guide({ open, topicId, onClose }: GuideProps): JSX.Element | null {
  const [index, setIndex] = useState(0);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  // Jump to the requested topic each time the guide is opened, so a help button always
  // lands in the right place even if the guide was last left somewhere else.
  useEffect(() => {
    if (!open) {
      return;
    }
    const requested = topicId === undefined ? 0 : findTopicIndex(topicId);
    setIndex(requested < 0 ? 0 : requested);
  }, [open, topicId]);

  useEffect(() => {
    if (!open) {
      return;
    }
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        onClose();
      }
      if (event.key === 'ArrowRight') {
        setIndex((current) => Math.min(ALL_TOPICS.length - 1, current + 1));
      }
      if (event.key === 'ArrowLeft') {
        setIndex((current) => Math.max(0, current - 1));
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // A new topic starts at the top: the figure is the point, and it is above the fold.
  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 });
  }, [index]);

  const current = ALL_TOPICS[index];

  const chapterOf = useMemo(() => {
    const map = new Map<string, { readonly title: string; readonly position: number }>();
    let position = 0;
    for (const chapter of CHAPTERS) {
      for (const topic of chapter.topics) {
        map.set(topic.id, { title: chapter.title, position });
        position += 1;
      }
    }
    return map;
  }, []);

  if (!open || current === undefined) {
    return null;
  }

  const chapter = chapterOf.get(current.id);

  return (
    <div
      className="guide-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Guide to every feature"
    >
      <div className="guide-dialog">
        <div className="guide-head">
          <div>
            <p className="guide-eyebrow">
              {chapter?.title} · {index + 1} of {ALL_TOPICS.length}
            </p>
            <h2>{current.title}</h2>
          </div>
          <button type="button" className="ghost-button" ref={closeRef} onClick={onClose}>
            Close
          </button>
        </div>

        <div className="guide-columns">
          <nav className="guide-nav" aria-label="Guide contents">
            {CHAPTERS.map((entry) => (
              <section key={entry.id}>
                <h3>{entry.title}</h3>
                <ul>
                  {entry.topics.map((topic) => {
                    const position = chapterOf.get(topic.id)?.position ?? 0;
                    return (
                      <li key={topic.id}>
                        <button
                          type="button"
                          className={topic.id === current.id ? 'guide-link is-current' : 'guide-link'}
                          aria-current={topic.id === current.id ? 'true' : undefined}
                          onClick={() => setIndex(position)}
                        >
                          {topic.title}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </nav>

          <div className="guide-body" ref={bodyRef}>
            {/* Keyed so the animation restarts on every topic rather than playing once. */}
            <div className="guide-figure-frame" key={current.id}>
              {current.figure}
            </div>
            <div className="guide-prose">{current.body}</div>
          </div>
        </div>

        <div className="guide-foot">
          <span className="guide-progress" aria-hidden="true">
            <span
              className="guide-progress-bar"
              style={{ width: `${((index + 1) / ALL_TOPICS.length) * 100}%` }}
            />
          </span>
          <div className="guide-buttons">
            <button
              type="button"
              className="ghost-button"
              onClick={() => setIndex((c) => Math.max(0, c - 1))}
              disabled={index === 0}
            >
              Back
            </button>
            {index === ALL_TOPICS.length - 1 ? (
              <button type="button" className="primary-button" onClick={onClose}>
                Done
              </button>
            ) : (
              <button
                type="button"
                className="primary-button"
                onClick={() => setIndex((c) => Math.min(ALL_TOPICS.length - 1, c + 1))}
              >
                Next
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The small circled question mark that sits beside a box and opens the guide there.
 *
 * Every box on the page gets one. That is the half of "a tutorial for every feature"
 * that a linear walkthrough cannot do: it puts the explanation where the question is
 * actually asked.
 */
export function HelpButton({
  topicId,
  label,
  onOpen,
}: {
  readonly topicId: string;
  /** Names the box, for anyone not seeing the icon. */
  readonly label: string;
  readonly onOpen: (topicId: string) => void;
}): JSX.Element {
  return (
    <button
      type="button"
      className="help-button"
      onClick={() => onOpen(topicId)}
      title={`What is this? ${label}`}
      aria-label={`Explain: ${label}`}
    >
      ?
    </button>
  );
}
