import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { parseBoard } from '../src/parser/parse';
import { serializeBoard } from '../src/parser/serialize';

const fixturesDir = fileURLToPath(new URL('./fixtures', import.meta.url));
const fixtures = readdirSync(fixturesDir).filter((f) => f.endsWith('.md'));

// Acceptance condition (spec 9.1): the parse -> serialize round-trip must reproduce the file
// byte-for-byte for every fixture (custom checkboxes, multi-line cards, frontmatter+settings,
// archive, unknown blocks, and an upstream-style file with @{}, tags and ^blockId).
describe('round-trip: serialize(parse(md)) === md', () => {
  it('has fixtures to test', () => {
    expect(fixtures.length).toBeGreaterThan(0);
  });

  for (const file of fixtures) {
    it(file, () => {
      const md = readFileSync(join(fixturesDir, file), 'utf8');
      expect(serializeBoard(parseBoard(md))).toBe(md);
    });
  }
});
