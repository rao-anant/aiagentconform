// Verifies a locally packed release. Never publishes or executes plugin code.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Ajv2020 } from 'ajv/dist/2020.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const artifacts = path.join(root, '.artifacts');
mkdirSync(artifacts, { recursive: true });
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npmOptions = { cwd: root, encoding: 'utf8', shell: process.platform === 'win32', timeout: 120_000 };
const packed = JSON.parse(execFileSync(npm, ['pack', '--json', '--pack-destination', artifacts], npmOptions))[0];
const files = new Set(packed.files.map(file => file.path));
for (const file of [
  'dist/cli.js',
  'schemas/report.schema.json',
  'schemas/report-v2.schema.json',
  'dist/protocols/agent-plugins/schemas/plugin.schema.json',
  'dist/protocols/agent-plugins/schemas/mcp.schema.json',
  // Attribution and license for the redistributed upstream schemas.
  'references/agent-plugins-1.0.0/NOTICE.md',
  'references/agent-plugins-1.0.0/Apache-2.0.txt',
  'CHANGELOG.md',
  'CONTRIBUTING.md',
]) assert(files.has(file), `Missing package file: ${file}`);
assert(![...files].some(file => /^(tests|fixtures|node_modules|scripts|\.github)\//.test(file)), 'Development-only files leaked into package');
const artifact = path.join(artifacts, packed.filename);
const install = mkdtempSync(path.join(tmpdir(), 'aiconform-package-'));
try {
  console.log(`Packed ${packed.filename}; installing into an isolated directory…`);
  execFileSync(npm, ['install', '--prefix', install, '--ignore-scripts', '--no-audit', '--no-fund', '--package-lock=false', artifact], { ...npmOptions, stdio: 'inherit' });
  const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.name, 'aiagentconform');
  assert.deepEqual(pkg.bin, { aiconform: 'dist/cli.js' });
  const installed = path.join(install, 'node_modules', pkg.name);
  const executable = path.join(install, 'node_modules', '.bin', 'aiconform');
  if (process.platform !== 'win32') assert(statSync(executable).mode & 0o111, 'CLI bin is not executable');
  const require = createRequire(path.join(install, 'package.json'));
  const schemaPath = require.resolve(`${pkg.name}/report.schema.json`);
  const validate = new Ajv2020({ strict: true, allErrors: true }).compile(JSON.parse(readFileSync(schemaPath, 'utf8')));
  const schemaV2Path = require.resolve(`${pkg.name}/report-v2.schema.json`);
  const validateV2 = new Ajv2020({ strict: true, allErrors: true }).compile(JSON.parse(readFileSync(schemaV2Path, 'utf8')));
  const run = (args, expected, json = false) => {
    // Exercise npm's bin link directly on POSIX, and the installed entry on Windows.
    const command = process.platform === 'win32' ? process.execPath : executable;
    const argv = process.platform === 'win32' ? [path.join(installed, 'dist/cli.js'), ...args] : args;
    const result = spawnSync(command, argv, { cwd: install, encoding: 'utf8', timeout: 15_000 });
    assert.equal(result.status, expected, `${args.join(' ')}\n${result.stderr}\n${result.stdout}`);
    if (json) {
      assert.equal(result.stderr, '');
      const report = JSON.parse(result.stdout);
      assert(validate(report), JSON.stringify(validate.errors));
      return report;
    }
    return result.stdout;
  };
  const fixture = name => path.join(root, 'fixtures/agent-plugins', name);
  assert.equal(run(['--version'], 0).trim(), pkg.version);
  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  // Resolve the local executable, never a registry package named aiconform.
  const viaNpx = args => execFileSync(npx, ['aiconform', ...args], {
    ...npmOptions, cwd: install,
    env: { ...process.env, npm_config_offline: 'true', npm_config_yes: 'false' },
  });
  assert.match(viaNpx(['--help']), /Usage: aiconform/);
  assert.equal(viaNpx(['--version']).trim(), pkg.version);
  assert.match(viaNpx([fixture('valid')]), /QUALIFIED PASS - 20 rules passed/);
  console.log('Verified local npx aiconform --help, --version, and valid fixture.');
  assert.match(run(['--help'], 0), /--list-rules/);
  assert.match(run([fixture('valid')], 0), /QUALIFIED PASS - 20 rules passed/);
  run([fixture('valid'), '--format', 'terminal'], 0);
  run([fixture('valid'), '--format', 'json'], 0, true);
  const reportV2 = JSON.parse(run([fixture('valid'), '--json', '--report-version', '2'], 0));
  assert(validateV2(reportV2), JSON.stringify(validateV2.errors));
  assert.equal(reportV2.rules.length, 20);
  assert.equal(run([fixture('valid'), '--rule', 'AP006'], 0).includes('LIMITED PASS - 1 selected rule passed; 19 rules excluded.'), true);
  run([fixture('minimal'), '--format', 'json'], 0, true);
  const extensionReport = run([fixture('invalid/ap009-member'), '--rule', 'AP009', '--format', 'json'], 1, true);
  assert(extensionReport.findings.some(f => f.ruleId === 'AP009' && f.severity === 'FAIL' && f.path === 'plugin.json#/extensions/com.example.client'));
  run(['--list-rules'], 0);
  assert.equal(run(['--list-rules', '--format=json'], 0, true).rules.length, 20);
  for (let index = 1; index <= 20; index++) {
    const id = `AP${String(index).padStart(3, '0')}`;
    const invalid = fixture(`invalid/${id.toLowerCase()}`);
    assert(run([invalid, '--format', 'json'], 1, true).findings.some(f => f.ruleId === id && f.severity === 'FAIL'));
    run([fixture('valid'), '--rule', id, '--format', 'json'], 0, true);
    run([invalid, '--rule', id, '--format', 'json'], 1, true);
  }
  assert.match(run([fixture('invalid/ap006')], 1), /https:\/\/agent-plugins\.org\/specification#55-plugin-name-constraints/);
  run([fixture('incomplete/data-cwd'), '--format', 'json'], 2, true);
  run([fixture('invalid/ap003'), '--rule', 'AP012', '--format', 'json'], 2, true);
  run([fixture('minimal'), '--rule', 'AP020', '--format', 'json'], 2, true);
  for (const args of [[], ['--unknown'], ['--rule', 'AP999'], ['--format', 'xml'], ['--list-rules', '--rule', 'AP001']]) run(args, 2);
  run([fixture('valid'), '--report-version', '2'], 2);
  for (const args of [[], ['--unknown'], ['--rule', 'AP999']]) run([...args, '--format=json'], 2, true);
  console.log('Installed package verified: help/version, formats, catalog, all 20 rules and invalid fixtures, incomplete checks, usage errors, and JSON schemas.');
  console.log(`Release artifact: ${artifact}`);
} finally {
  rmSync(install, { recursive: true, force: true });
}
