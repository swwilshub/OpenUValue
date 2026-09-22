import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ALL_TOPICS, CHAPTERS, findTopicIndex } from '../topics.js';

/**
 * The guide is reached by id from help buttons all over the page, and a topic that
 * appears twice is found at its first copy only, so a later edit to the second copy is
 * never seen. Both mistakes are silent in the browser, which is why they are tested.
 */

const SOURCE_ROOT = join(__dirname, '..', '..', '..');

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      return entry === '__tests__' ? [] : sourceFiles(path);
    }
    return path.endsWith('.tsx') ? [path] : [];
  });
}

describe('guide topics', () => {
  it('gives every topic a distinct id', () => {
    const ids = ALL_TOPICS.map((topic) => topic.id);
    const repeated = ids.filter((id, index) => ids.indexOf(id) !== index);
    expect(repeated).toEqual([]);
  });

  it('gives every chapter a distinct id and at least one topic', () => {
    const ids = CHAPTERS.map((chapter) => chapter.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const chapter of CHAPTERS) {
      expect(chapter.topics.length).toBeGreaterThan(0);
    }
  });

  it('has a topic for every help button and guide link on the page', () => {
    const referenced = new Set<string>();
    for (const file of sourceFiles(SOURCE_ROOT)) {
      const text = readFileSync(file, 'utf8');
      for (const match of text.matchAll(/topicId="([a-z0-9-]+)"/g)) {
        referenced.add(match[1] ?? '');
      }
      for (const match of text.matchAll(/openGuide\('([a-z0-9-]+)'\)/g)) {
        referenced.add(match[1] ?? '');
      }
    }
    // Guards the scan itself: an empty set would pass the check below vacuously.
    expect(referenced.size).toBeGreaterThan(20);
    const missing = [...referenced].filter((id) => findTopicIndex(id) < 0);
    expect(missing).toEqual([]);
  });
});
