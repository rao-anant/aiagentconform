import { afterEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { chmodSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { runCli } from '../src/run-cli.js';
import { checkPlugin } from '../src/protocols/agent-plugins/index.js';
import { rules } from '../src/protocols/agent-plugins/rules.js';
import { commandForm, MCP_SCHEMA, PLUGIN_SCHEMA, remoteErrors } from '../src/protocols/agent-plugins/validation.js';
import outputSchema from '../schemas/report.schema.json' with { type: 'json' };

const validateOutput = new Ajv2020({ strict: true, allErrors: true }).compile(outputSchema);
const fixture = (name: string) => path.resolve('fixtures/agent-plugins', name);
const temp: string[] = [];
function copy(name = 'minimal'): string {
  const root = mkdtempSync(path.join(tmpdir(), 'agentcheck-review-')); temp.push(root);
  cpSync(fixture(name), root, { recursive: true }); return root;
}
function json(root: string, file: string, value: unknown): void { writeFileSync(path.join(root, file), JSON.stringify(value)); }
function run(args: string[]) {
  let out = ''; let err = '';
  const code = runCli(args, '0.1.0', { out: text => { out += text; }, err: text => { err += text; } });
  return { out, err, code };
}
afterEach(() => { for (const root of temp.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe('public CLI contract', () => {
  it('prints a concise success summary based on rules, not findings', () => {
    expect(run([fixture('valid')])).toEqual({ code: 0, err: '', out: 'AgentCheck - Agent Plugins 1.0\n✓ 20/20 conformance checks passed\n' });
    expect(run([fixture('valid'), '--format', 'terminal']).out).toBe(run([fixture('valid')]).out);
  });
  it('reports failures with rule, location, problem and official reference', () => {
    const { out, code } = run([fixture('invalid/ap006')]);
    expect(code).toBe(1); expect(out).toContain('FAIL AP006'); expect(out).toContain('plugin.json#/name');
    expect(out).toContain('lowercase'); expect(out).toContain('https://agent-plugins.org/specification#55-plugin-name-constraints');
  });
  it('shows skipped optional checks without claiming all 20 passed', () => {
    expect(run([fixture('minimal')]).out).toContain('10/20 conformance checks passed (10 skipped)');
  });
  it('provides help and version without a directory', () => {
    expect(run(['--version'])).toEqual({ code: 0, err: '', out: '0.1.0\n' });
    const help = run(['--help']); expect(help.code).toBe(0);
    for (const option of ['--rule', '--list-rules', '--format', '--version', '--help']) expect(help.out).toContain(option);
  });
  it('lists exactly the catalog in terminal and JSON', () => {
    const terminal = run(['--list-rules']); expect(terminal.code).toBe(0);
    for (const rule of rules) expect(terminal.out).toContain(rule.id);
    const json = run(['--list-rules', '--format=json']);
    expect(JSON.parse(json.out).rules).toEqual(rules); expect(validateOutput(JSON.parse(json.out))).toBe(true);
  });
  it.each(rules)('runs $id alone successfully', rule => {
    const { out, code } = run([fixture('valid'), '--rule', rule.id, '-fjson']);
    const report = JSON.parse(out);
    expect(code).toBe(0); expect(report.selectedRules).toEqual([rule.id]);
    expect(report.findings.every((f: { ruleId: string }) => f.ruleId === rule.id)).toBe(true);
    expect(report.rulesRun).toBe(1); expect(validateOutput(report)).toBe(true);
  });
  it('does not inspect unrelated components for a manifest rule', () => {
    const root = copy(); symlinkSync('/nonexistent', path.join(root, 'skills'));
    writeFileSync(path.join(root, 'mcp.json'), 'invalid');
    const report = checkPlugin(root, 'AP006');
    expect(report.status).toBe('PASS'); expect(report.prerequisiteFindings).toEqual([]);
    expect(report.findings).toHaveLength(1);
  });
  it('reports blocked selected rules separately from prerequisite failures', () => {
    const { out, code } = run([fixture('invalid/ap003'), '--rule', 'AP012', '--format=json']);
    const report = JSON.parse(out);
    expect(code).toBe(2); expect(report.status).toBe('INCOMPLETE'); expect(report.findings).toEqual([]);
    expect(report.prerequisiteFindings.some((f: { ruleId: string }) => f.ruleId === 'AP003')).toBe(true);
    expect(report.results).toEqual([{ ruleId: 'AP012', status: 'SKIP' }]);
    expect(validateOutput(report)).toBe(true);
  });
  it('returns 2 if a selected rule has no applicable inputs', () => {
    const result = run([fixture('minimal'), '--rule', 'AP020', '--format=json']);
    expect(result.code).toBe(2); expect(JSON.parse(result.out).status).toBe('INCOMPLETE');
  });
  it.each([
    [], ['--unknown'], ['--format', 'xml'], ['--rule', 'AP999'],
    ['--list-rules', 'directory'], ['--list-rules', '--rule', 'AP001'], ['one', 'two'],
  ])('uses exit 2 for invalid invocation %j', (...args) => {
    const result = run(args); expect(result.code).toBe(2); expect(result.out).toBe(''); expect(result.err).not.toBe('');
  });
  it.each([['--unknown', '--format=json'], ['--rule', 'AP999', '-f', 'json'], ['--format', 'json']])('returns a schema-valid JSON usage error for %j', (...args) => {
    const result = run(args); expect(result.code).toBe(2); expect(result.err).toBe('');
    const error = JSON.parse(result.out); expect(error.kind).toBe('error'); expect(error.code).toBe('CLI_USAGE'); expect(validateOutput(error)).toBe(true);
  });
  it('treats format-looking paths after -- as positionals', () => {
    const result = run(['--', '--format=json']); expect(result.code).toBe(1); expect(result.out).toContain('AgentCheck -');
  });
});

describe('JSON stability and invariants', () => {
  it.each(['valid', 'minimal', 'incomplete/data-cwd', ...rules.map(rule => `invalid/${rule.id.toLowerCase()}`)])('validates %s against the shipped schema', name => {
    const report = checkPlugin(fixture(name));
    expect(validateOutput(report), JSON.stringify(validateOutput.errors)).toBe(true);
    expect(report.ruleSummary.total).toBe(report.ruleSummary.passed + report.ruleSummary.failed + report.ruleSummary.skipped);
    expect(report.summary.passed + report.summary.failed).toBe(report.findings.length);
    expect(report.rulesRun).toBe(new Set(report.findings.map(f => f.ruleId)).size);
    expect(report.results.map(r => r.ruleId)).toEqual(report.selectedRules);
  });
  it('produces byte-identical JSON for an unchanged filesystem', () => {
    const args = [fixture('valid'), '--format=json']; expect(run(args).out).toBe(run(args).out);
  });
  it('rejects schema drift in status values, types, and required fields', () => {
    const report = checkPlugin(fixture('valid'));
    expect(validateOutput({ ...report, status: 'success' })).toBe(false);
    expect(validateOutput({ ...report, rulesRun: '20' })).toBe(false);
    const { findings: _, ...missing } = report; expect(validateOutput(missing)).toBe(false);
  });
  it('retains explicit immutable rule IDs and upstream schema checksums', () => {
    expect(rules.map(rule => rule.id)).toEqual(Array.from({ length: 20 }, (_, i) => `AP${String(i + 1).padStart(3, '0')}`));
    const lines = readFileSync('references/agent-plugins-1.0.0/SHA256SUMS', 'utf8').trim().split('\n');
    for (const line of lines) {
      const [expected, file] = line.split(/\s+/);
      expect(createHash('sha256').update(readFileSync(file!)).digest('hex')).toBe(expected);
    }
  });
});

describe('specification review regressions', () => {
  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)('does not mislabel unreadable JSON as a conformance failure', () => {
    const root = copy();
    chmodSync(path.join(root, 'plugin.json'), 0);
    try {
      const report = checkPlugin(root);
      expect(report.status).toBe('INCOMPLETE');
      expect(report.findings.filter(f => f.severity === 'FAIL')).toEqual([]);
      expect(report.skipped.some(item => item.reason === 'inspection-error')).toBe(true);
    } finally { chmodSync(path.join(root, 'plugin.json'), 0o644); }
  });
  it('rejects a final newline in a manifest name despite the upstream regex anchor', () => {
    const root = copy(); json(root, 'plugin.json', { $schema: PLUGIN_SCHEMA, name: 'example\n' });
    expect(checkPlugin(root).findings.some(f => f.ruleId === 'AP006' && f.severity === 'FAIL')).toBe(true);
  });
  it.each(['plugin.json', 'mcp.json'])('rejects malformed UTF-8 in %s instead of replacement decoding', file => {
    const root = copy();
    const content = file === 'plugin.json' ? { $schema: PLUGIN_SCHEMA, name: 'example', description: 'MARKER' } : { $schema: MCP_SCHEMA, mcpServers: { server: { type: 'stdio', command: 'node', args: ['MARKER'] } } };
    const [before, after] = JSON.stringify(content).split('MARKER');
    writeFileSync(path.join(root, file), Buffer.concat([Buffer.from(before!), Buffer.from([0xff]), Buffer.from(after!)]));
    expect(checkPlugin(root).findings.some(f => f.ruleId === (file === 'plugin.json' ? 'AP003' : 'AP013') && f.severity === 'FAIL')).toBe(true);
  });
  it('accepts YAML delimiter whitespace and rejects invalid UTF-8 skills', () => {
    const root = copy('valid');
    writeFileSync(path.join(root, 'skills/example/SKILL.md'), '---  \r\nname: example\r\ndescription: Example.\r\n--- \r\n');
    expect(checkPlugin(root).status).toBe('PASS');
    writeFileSync(path.join(root, 'skills/example/SKILL.md'), Buffer.from([0xff]));
    expect(checkPlugin(root).findings.some(f => f.ruleId === 'AP011' && f.severity === 'FAIL')).toBe(true);
  });
  it.each(['foo&bar', 'tool;name', './folder with spaces/tool'])('does not invent a filename character restriction for %s', command => {
    expect(commandForm(command)).toBe(true);
  });
  it.each(['node script.js', '/bin/node', '../node', 'C:node', 'C:\\bin\\node'])('rejects non-portable command form %s', command => {
    expect(commandForm(command)).toBe(false);
  });
  it('rejects URL control bytes before WHATWG normalization', () => {
    expect(remoteErrors({ url: 'https://example.com/a\u0000' }).length).toBeGreaterThan(0);
  });
  it.each(['${PLUGIN_DATA}/cache', '${PLUGIN_DATA}/link/../../cache', './${PLUGIN_DATA}/../cache'])('does not infer a cwd result without client context: %s', cwd => {
    const root = copy(); json(root, 'mcp.json', { $schema: MCP_SCHEMA, mcpServers: { server: { type: 'stdio', command: 'node', cwd } } });
    const report = checkPlugin(root, 'AP019'); expect(report.status).toBe('INCOMPLETE');
    expect(report.findings).toEqual([]); expect(report.skipped[0]?.reason).toBe('client-context-required');
  });
  it('isolates a selected stdio rule from invalid remote configurations', () => {
    const root = copy(); json(root, 'mcp.json', { $schema: MCP_SCHEMA, mcpServers: {
      remote: { type: 'sse', command: 'invalid' }, local: { type: 'stdio', command: 'node' },
    } });
    expect(checkPlugin(root, 'AP018').status).toBe('PASS');
  });
  it('escapes terminal controls in package field names', () => {
    const root = copy(); json(root, 'plugin.json', { $schema: PLUGIN_SCHEMA, name: 'good', '\u001b[31minjected': true });
    const { out } = run([root]); expect(out).not.toContain('\u001b'); expect(out).toContain('\\u001b');
  });
  it('never counts multiple findings from a rule as multiple passed rules', () => {
    const root = copy('valid'); mkdirSync(path.join(root, 'skills/second'));
    writeFileSync(path.join(root, 'skills/second/SKILL.md'), '---\nname: second\ndescription: Example.\n---\n');
    expect(checkPlugin(root).ruleSummary).toEqual({ total: 20, passed: 20, failed: 0, skipped: 0 });
  });
});
