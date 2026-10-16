// Invariant: the Claude Code skill names every tool the server registers, and
// states the served count. fleet-audit #1349 found two delete-comment tools
// missing from the skill while it claimed "42 tools".
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TOOLS_DIR = join(ROOT, 'src', 'tools');

function registeredNames(): string[] {
  const names = new Set<string>();
  for (const f of readdirSync(TOOLS_DIR)) {
    if (!f.endsWith('.ts')) continue;
    const src = readFileSync(join(TOOLS_DIR, f), 'utf8');
    for (const m of src.matchAll(/registerTool\(\s*'(vibo_[a-z_]+)'/g)) names.add(m[1]);
  }
  return [...names].sort();
}

describe('skills/vibo-mcp/SKILL.md', () => {
  const skill = readFileSync(join(ROOT, 'skills', 'vibo-mcp', 'SKILL.md'), 'utf8');
  const tools = registeredNames();
  const named = new Set([...skill.matchAll(/`(vibo_[a-z_]+)`/g)].map((m) => m[1]));

  it('finds the registered tools', () => {
    expect(tools.length).toBeGreaterThan(30);
  });

  it('names every registered tool', () => {
    expect(tools.filter((t) => !named.has(t))).toEqual([]);
  });

  it('names no tool the server does not register', () => {
    expect([...named].filter((t) => !tools.includes(t))).toEqual([]);
  });

  it('states the served tool count', () => {
    expect(skill).toContain(`${tools.length} tools`);
  });
});
