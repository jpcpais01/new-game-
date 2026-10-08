import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PATCH_NOTES } from './patchnotes';

const parse = (v: string) => v.split('.').map(Number);
const newer = (a: string, b: string) => {
  const [x, y] = [parse(a), parse(b)];
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
  return false;
};

describe('patch notes', () => {
  it('has an entry for the current package.json version, at the top', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };
    expect(PATCH_NOTES[0].version).toBe(pkg.version);
  });

  it('lists versions newest first, each once, with notes', () => {
    for (let i = 1; i < PATCH_NOTES.length; i++) expect(newer(PATCH_NOTES[i - 1].version, PATCH_NOTES[i].version)).toBe(true);
    for (const n of PATCH_NOTES) {
      expect(n.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(n.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(n.notes.length).toBeGreaterThan(0);
    }
  });
});
