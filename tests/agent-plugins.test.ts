import { afterEach, describe, expect, it } from 'vitest';
import { cpSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { checkPlugin } from '../src/protocols/agent-plugins/index.js';
import { rules } from '../src/protocols/agent-plugins/rules.js';
import { MCP_SCHEMA, PLUGIN_SCHEMA, remoteErrors, skillErrors } from '../src/protocols/agent-plugins/validation.js';
import { expandPlaceholders } from '../src/protocols/agent-plugins/paths.js';

const fixture = (name: string) => path.resolve('fixtures/agent-plugins', name);
const temporary: string[] = [];
function copy(name = 'minimal'): string {
  const root = mkdtempSync(path.join(tmpdir(), 'agentcheck-'));
  temporary.push(root);
  cpSync(fixture(name), root, { recursive: true });
  return root;
}
function json(root: string, name: string, data: unknown): void { writeFileSync(path.join(root, name), JSON.stringify(data)); }
function mcp(root: string, servers: unknown): void { json(root, 'mcp.json', { $schema: MCP_SCHEMA, mcpServers: servers }); }
const fails = (root: string) => checkPlugin(root).findings.filter(f => f.severity === 'FAIL');
afterEach(() => { for (const root of temporary.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe('rule fixture coverage', () => {
  it.each(rules)('$id passes on the valid package', rule => {
    const report = checkPlugin(fixture('valid'));
    expect(report.status).toBe('PASS');
    expect(report.findings.some(f => f.ruleId === rule.id && f.severity === 'PASS')).toBe(true);
    expect(rule.references.every(reference => reference.url.startsWith('https://') && reference.section)).toBe(true);
  });
  it.each(rules)('$id fails on its deliberately invalid fixture', rule => {
    expect(fails(fixture(`invalid/${rule.id.toLowerCase()}`)).some(f => f.ruleId === rule.id)).toBe(true);
  });
  it('uses unique stable IDs', () => { expect(new Set(rules.map(r => r.id)).size).toBe(20); });
});

describe('manifest and discovery failure boundaries', () => {
  it('accepts absent components and has no quality warnings', () => {
    const report = checkPlugin(fixture('minimal'));
    expect(report.status).toBe('PASS');
    expect(report.advisories).toEqual([]);
    expect(report.findings.some(f => f.ruleId === 'AP013')).toBe(false);
  });
  it('does not discover components after a fatal manifest violation', () => {
    const root = copy('valid');
    json(root, 'plugin.json', { $schema: PLUGIN_SCHEMA, name: 'BAD' });
    expect(checkPlugin(root).findings.some(f => ['AP010', 'AP011', 'AP013'].includes(f.ruleId))).toBe(false);
  });
  it('reports each unknown field and ignores non-object extensions while checking components', () => {
    const root = copy('valid');
    json(root, 'plugin.json', { $schema: PLUGIN_SCHEMA, name: 'good', arbitrary: 1, skills: false, extensions: null });
    const report = checkPlugin(root);
    expect(report.findings.filter(f => f.ruleId === 'AP008' && f.severity === 'FAIL')).toHaveLength(2);
    expect(report.findings.some(f => f.ruleId === 'AP012' && f.severity === 'PASS')).toBe(true);
    expect(report.findings.some(f => f.ruleId === 'AP020' && f.severity === 'PASS')).toBe(true);
  });
  it('leaves unimplemented extension values opaque, overriding schema value validation', () => {
    const root = copy();
    json(root, 'plugin.json', { $schema: PLUGIN_SCHEMA, name: 'good', extensions: { 'com.example.client': false } });
    expect(fails(root)).toEqual([]);
  });
  it.each([null, [], 4, 'text'])('rejects non-object manifests: %j', value => {
    const root = copy(); json(root, 'plugin.json', value);
    expect(fails(root).map(f => f.ruleId)).toContain('AP003');
  });
  it('does not require or recursively discover SKILL.md in arbitrary child directories', () => {
    const root = copy();
    mkdirSync(path.join(root, 'skills/group/deep'), { recursive: true });
    writeFileSync(path.join(root, 'skills/group/deep/SKILL.md'), 'invalid but not discovered');
    mkdirSync(path.join(root, 'skills/not-a-skill/SKILL.md'), { recursive: true });
    writeFileSync(path.join(root, 'SKILL.md'), 'not a portable skill');
    expect(fails(root)).toEqual([]);
    expect(checkPlugin(root).findings.some(f => f.ruleId === 'AP011')).toBe(false);
  });
  it('keeps valid skills and servers when independent entries fail', () => {
    const root = copy('valid');
    mkdirSync(path.join(root, 'skills/broken'));
    writeFileSync(path.join(root, 'skills/broken/SKILL.md'), 'broken');
    mcp(root, { broken: { type: 'invalid' }, good: { type: 'stdio', command: 'node' } });
    const report = checkPlugin(root);
    expect(report.findings.some(f => f.ruleId === 'AP012' && f.severity === 'PASS')).toBe(true);
    expect(report.findings.some(f => f.ruleId === 'AP018' && f.severity === 'PASS')).toBe(true);
    expect(report.findings.filter(f => f.severity === 'FAIL').map(f => f.failureBoundary)).toEqual(['skill', 'server']);
  });
  it('keeps skills when mcp.json is a directory', () => {
    const root = copy('valid'); rmSync(path.join(root, 'mcp.json')); mkdirSync(path.join(root, 'mcp.json'));
    const report = checkPlugin(root);
    expect(report.findings.some(f => f.ruleId === 'AP010' && f.severity === 'FAIL')).toBe(true);
    expect(report.findings.some(f => f.ruleId === 'AP012' && f.severity === 'PASS')).toBe(true);
  });
});

describe('filesystem containment', () => {
  it.each(['skills', 'mcp.json', 'plugin.json'])('rejects an escaping %s symlink', file => {
    const root = copy('valid'); const outside = copy('valid');
    rmSync(path.join(root, file), { recursive: true });
    symlinkSync(path.join(outside, file), path.join(root, file), file === 'skills' ? 'dir' : 'file');
    expect(fails(root).some(f => f.ruleId === 'AP002' && f.path === file)).toBe(true);
  });
  it('rejects an escaping skill file without reading it', () => {
    const root = copy('valid'); const outside = copy('valid');
    rmSync(path.join(root, 'skills/example/SKILL.md'));
    symlinkSync(path.join(outside, 'skills/example/SKILL.md'), path.join(root, 'skills/example/SKILL.md'));
    expect(fails(root).some(f => f.ruleId === 'AP002')).toBe(true);
    expect(checkPlugin(root).findings.some(f => f.ruleId === 'AP011')).toBe(false);
  });
  it('accepts in-root symlinks and preserves symlink/.. semantics', () => {
    const root = copy('valid');
    mkdirSync(path.join(root, 'nested/target'), { recursive: true });
    symlinkSync(path.join(root, 'nested/target'), path.join(root, 'link'), 'dir');
    mcp(root, { good: { type: 'stdio', command: './link/../missing-tool', cwd: './link/../..' } });
    expect(fails(root)).toEqual([]);
  });
  it.each(['command', 'cwd'])('rejects an escaping %s symlink', field => {
    const root = copy(); const outside = copy();
    symlinkSync(outside, path.join(root, 'outside'), 'dir');
    mcp(root, { server: { type: 'stdio', command: 'node', [field]: './outside/missing' } });
    expect(fails(root).map(f => f.ruleId)).toContain(field === 'cwd' ? 'AP019' : 'AP018');
  });
  it('rejects broken links without crashing', () => {
    const root = copy(); rmSync(path.join(root, 'plugin.json'));
    symlinkSync('missing', path.join(root, 'plugin.json'));
    expect(fails(root).map(f => f.ruleId)).toContain('AP002');
  });
});

describe('skills', () => {
  it('does not coerce numeric YAML metadata keys into strings', () => {
    const root = copy('valid');
    writeFileSync(path.join(root, 'skills/example/SKILL.md'), '---\nname: example\ndescription: Example.\nmetadata:\n  123: text\n---\n');
    expect(fails(root).map(f => f.ruleId)).toContain('AP012');
  });
  it.each(['---\nname: [\n---\n', '---\n- list\n---\n', '---\nname: one\nname: two\n---\n'])('rejects malformed YAML %s', content => {
    const root = copy('valid'); writeFileSync(path.join(root, 'skills/example/SKILL.md'), content);
    expect(fails(root).map(f => f.ruleId)).toContain('AP011');
  });
  it.each([
    { name: 'bad--name' }, { name: 'A' }, { name: 'a'.repeat(65) }, { description: 1 },
    { description: 'x'.repeat(1025) }, { compatibility: '' }, { compatibility: 'x'.repeat(501) },
    { metadata: { version: 1 } }, { license: false }, { 'allowed-tools': [] },
  ])('rejects invalid skill fields %j', override => {
    expect(skillErrors({ name: 'example', description: 'Example.', ...override }, 'example').length).toBeGreaterThan(0);
  });
  it('accepts Unicode names, optional metadata, and unknown fields without invented constraints', () => {
    expect(skillErrors({ name: 'étude', description: 'Example.', custom: true, metadata: { version: 'v' } }, 'étude')).toEqual([]);
  });
});

describe('MCP configuration', () => {
  it.each([
    { type: 'stdio', command: 'node', url: 'https://example.com' },
    { type: 'stdio', command: 'node', env: { PLUGIN_DATA: 'override' } },
    { type: 'stdio', command: 'node', args: [1] },
    { type: 'stdio', command: 'node', cwd: 'relative' },
    { type: 'streamable-http', url: 'https://example.com', extra: 1 },
    { type: 'unknown' }, null,
  ])('rejects invalid server variants %j', server => {
    const root = copy(); mcp(root, { server });
    expect(fails(root).map(f => f.ruleId)).toContain('AP017');
  });
  it('accepts empty server maps and does not compare plugin release versions', () => {
    const root = copy(); json(root, 'plugin.json', { $schema: PLUGIN_SCHEMA, name: 'example', version: '99.9.9' });
    mcp(root, {}); expect(fails(root)).toEqual([]);
  });
  it('keeps unknown placeholders and path-like args/env opaque', () => {
    const root = copy(); mcp(root, { server: { type: 'stdio', command: 'node', args: ['../../elsewhere', '${HOME}'], env: { X: '${UNKNOWN}/../../outside' } } });
    expect(fails(root)).toEqual([]);
    expect(expandPlaceholders('${PLUGIN_ROOT}|${PLUGIN_DATA}|${PLUGIN_ROOT}|${HOME}', '/root/${PLUGIN_DATA}', '/data')).toBe('/root/${PLUGIN_DATA}|/data|/root/${PLUGIN_DATA}|${HOME}');
  });
  it.each(['./../outside', '${PLUGIN_ROOT}/../outside'])('rejects cwd escape %s', cwd => {
    const root = copy(); mcp(root, { server: { type: 'stdio', command: 'node', cwd } });
    expect(fails(root).map(f => f.ruleId)).toContain('AP019');
  });
  it('reports deferred data-root filesystem validation', () => {
    const report = checkPlugin(fixture('incomplete/data-cwd'));
    expect(report.status).toBe('INCOMPLETE');
    expect(report.skipped.some(item => item.ruleId === 'AP019' && item.reason === 'client-context-required')).toBe(true);
    expect(report.limitations.some(text => text.includes('PLUGIN_DATA'))).toBe(true);
  });
  it.each(['https://example.com/mcp', 'http://localhost/mcp', 'http://127.2.3.4/mcp', 'http://[::1]/mcp'])('accepts allowed URL %s', url => {
    expect(remoteErrors({ url })).toEqual([]);
  });
  it.each(['http://example.com', 'http://localhost.example.com', 'http://127.1', 'http://2130706433', 'ftp://example.com', 'https://user:pass@example.com', 'https://@example.com', 'https://example.com/#', '/relative', 'https:example.com'])('rejects invalid URL %s', url => {
    expect(remoteErrors({ url }).length).toBeGreaterThan(0);
  });
  it.each([{ 'X-Test': 'line\r\ninjected' }, { 'Bad Name': 'value' }, { A: 'x', a: 'y' }])('rejects invalid headers %j', headers => {
    expect(remoteErrors({ url: 'https://example.com', headers }).length).toBeGreaterThan(0);
  });
  it('leaves header values literal', () => {
    expect(remoteErrors({ url: 'https://example.com/${PLUGIN_ROOT}', headers: { 'X-Example': '${PLUGIN_DATA}' } })).toEqual([]);
  });
});
