'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const PACKAGE_SPEC = 'aiagentconform@0.3.0';
const PACKAGE_VERSION = '0.3.0';
const RULE_IDS = Array.from({ length: 20 }, (_, index) => `AP${String(index + 1).padStart(3, '0')}`);
const OUTCOMES = ['passed', 'failed', 'not_applicable', 'excluded', 'unable_to_complete'];
const DETERMINATIONS = ['pass', 'limited_pass', 'fail', 'incomplete'];

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value, keys, subject) {
  if (!isObject(value) || Object.keys(value).sort().join('\0') !== [...keys].sort().join('\0')) {
    throw new Error(`${subject} does not match the JSON v2 contract.`);
  }
}

function contained(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function resolveThroughMissing(candidate) {
  let probe = candidate;
  const suffix = [];
  const visitedLinks = new Set();
  for (let attempts = 0; attempts < 256; attempts += 1) {
    try {
      return path.resolve(fs.realpathSync.native(probe), ...suffix);
    } catch (error) {
      if (!error || error.code !== 'ENOENT') throw error;
    }
    try {
      const stat = fs.lstatSync(probe);
      if (!stat.isSymbolicLink()) throw new Error(`Cannot resolve package path ${JSON.stringify(candidate)}.`);
      const key = path.resolve(probe);
      if (visitedLinks.has(key)) throw new Error('Package path contains a symbolic-link loop.');
      visitedLinks.add(key);
      const target = fs.readlinkSync(probe);
      probe = path.resolve(path.dirname(probe), target);
    } catch (error) {
      if (error && error.code === 'ENOENT') {
        const parent = path.dirname(probe);
        if (parent === probe) throw new Error(`Cannot resolve package path ${JSON.stringify(candidate)}.`);
        suffix.unshift(path.basename(probe));
        probe = parent;
      } else {
        throw error;
      }
    }
  }
  throw new Error('Package path exceeded the symbolic-link resolution limit.');
}

function resolveInputPath(workspace, inputPath) {
  if (typeof workspace !== 'string' || workspace.length === 0) throw new Error('github.workspace is unavailable.');
  if (typeof inputPath !== 'string' || inputPath.length === 0) throw new Error('Input "path" must not be empty.');
  if (path.isAbsolute(inputPath) || path.posix.isAbsolute(inputPath) || path.win32.isAbsolute(inputPath)) {
    throw new Error('Input "path" must be relative to github.workspace.');
  }
  const segments = inputPath.split(/[\\/]+/u);
  if (segments.includes('..')) throw new Error('Input "path" must not contain an explicit ".." segment.');
  const root = fs.realpathSync.native(workspace);
  const lexical = path.resolve(root, ...segments);
  if (!contained(root, lexical)) throw new Error('Input "path" escapes github.workspace.');
  const resolved = resolveThroughMissing(lexical);
  if (!contained(root, resolved)) throw new Error('Input "path" resolves outside github.workspace through a symbolic link.');
  return resolved;
}

function parseBoolean(value, name) {
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error(`Input ${JSON.stringify(name)} must be "true" or "false".`);
}

function validateInputs(inputs, workspace) {
  const rule = inputs.rule ?? '';
  if (rule !== '' && !RULE_IDS.includes(rule)) throw new Error('Input "rule" must be empty or one of AP001-AP020.');
  const artifactName = inputs.artifactName ?? '';
  if (artifactName.length === 0 || /[\r\n\0]/u.test(artifactName)) throw new Error('Input "artifact-name" must be a non-empty single-line value.');
  return {
    target: resolveInputPath(workspace, inputs.path),
    rule,
    uploadReport: parseBoolean(inputs.uploadReport, 'upload-report'),
    artifactName,
  };
}

function installPackage(installRoot, packageSpec = PACKAGE_SPEC) {
  fs.mkdirSync(installRoot, { recursive: true });
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const result = spawnSync(npm, [
    'install', '--prefix', installRoot, '--ignore-scripts', '--no-audit', '--no-fund',
    '--package-lock=false', '--no-save', packageSpec,
  ], {
    encoding: 'utf8', timeout: 120_000, windowsHide: true,
    env: { ...process.env, npm_config_ignore_scripts: 'true' },
  });
  if (result.error) throw new Error(`npm installation could not start: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`npm installation failed with exit ${String(result.status)}.`);
  const packageRoot = path.join(installRoot, 'node_modules', 'aiagentconform');
  let metadata;
  try { metadata = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8')); }
  catch (error) { throw new Error(`Installed package metadata is unavailable: ${error.message}`); }
  if (metadata.name !== 'aiagentconform' || metadata.version !== PACKAGE_VERSION) {
    throw new Error(`Expected aiagentconform@${PACKAGE_VERSION}, received ${String(metadata.name)}@${String(metadata.version)}.`);
  }
  return path.join(packageRoot, 'dist', 'cli.js');
}

function validateReference(reference) {
  exactKeys(reference, ['section', 'url'], 'Rule reference');
  if (typeof reference.section !== 'string' || typeof reference.url !== 'string' || !reference.url.startsWith('https://')) {
    throw new Error('Rule reference does not match the JSON v2 contract.');
  }
}

function validateReport(report) {
  exactKeys(report, ['reportVersion', 'kind', 'tool', 'protocol', 'input', 'selection', 'rules', 'findings', 'inspection', 'executionProblems', 'scope', 'summary', 'determination'], 'Report');
  if (report.reportVersion !== '2' || report.kind !== 'report') throw new Error('CLI did not emit a JSON v2 report.');
  exactKeys(report.tool, ['name', 'version'], 'Tool identity');
  if (report.tool.name !== 'AIAgentConform' || report.tool.version !== PACKAGE_VERSION) throw new Error('Report tool identity is not aiagentconform@0.3.0.');
  exactKeys(report.protocol, ['id', 'specificationVersion'], 'Protocol identity');
  if (report.protocol.id !== 'agent-plugins' || report.protocol.specificationVersion !== '1.0.0') throw new Error('Report protocol identity is invalid.');
  exactKeys(report.input, ['argument', 'resolvedPath', 'packageIdentity'], 'Report input');
  exactKeys(report.input.packageIdentity, ['manifestName'], 'Package identity');
  if (typeof report.input.argument !== 'string' || typeof report.input.resolvedPath !== 'string' ||
    !(report.input.packageIdentity.manifestName === null || typeof report.input.packageIdentity.manifestName === 'string')) throw new Error('Report input is invalid.');
  exactKeys(report.selection, ['mode', 'selectedRuleIds'], 'Rule selection');
  if (!['all', 'single'].includes(report.selection.mode) || !Array.isArray(report.selection.selectedRuleIds) ||
    report.selection.selectedRuleIds.length < 1 || new Set(report.selection.selectedRuleIds).size !== report.selection.selectedRuleIds.length ||
    report.selection.selectedRuleIds.some(id => !RULE_IDS.includes(id))) throw new Error('Report rule selection is invalid.');
  if (!Array.isArray(report.rules) || report.rules.length !== 20) throw new Error('Report must contain all 20 rule outcomes.');
  report.rules.forEach((rule, index) => {
    exactKeys(rule, ['id', 'title', 'classification', 'outcome', 'reason', 'references'], `Rule ${index + 1}`);
    if (rule.id !== RULE_IDS[index] || typeof rule.title !== 'string' || !['normative', 'advisory'].includes(rule.classification) ||
      !OUTCOMES.includes(rule.outcome) || typeof rule.reason !== 'string' || rule.reason.length === 0 ||
      !Array.isArray(rule.references) || rule.references.length === 0) throw new Error(`Rule ${index + 1} is invalid.`);
    rule.references.forEach(validateReference);
  });
  if (!Array.isArray(report.findings)) throw new Error('Report findings are invalid.');
  for (const finding of report.findings) {
    exactKeys(finding, ['ruleId', 'result', 'path', 'explanation', 'boundary'], 'Finding');
    if (!RULE_IDS.includes(finding.ruleId) || !['passed', 'failed'].includes(finding.result) ||
      typeof finding.path !== 'string' || typeof finding.explanation !== 'string' ||
      !['plugin', 'component', 'skill', 'server', 'field'].includes(finding.boundary)) throw new Error('Report finding is invalid.');
  }
  exactKeys(report.inspection, ['evidence', 'components', 'extensionNamespaces', 'mcpServers'], 'Inspection');
  if (!Array.isArray(report.inspection.evidence)) throw new Error('Report inspection evidence is invalid.');
  for (const evidence of report.inspection.evidence) {
    exactKeys(evidence, ['operation', 'subject', 'status', 'detail'], 'Inspection evidence');
    if (!['resolve', 'discover', 'read', 'parse', 'inspect'].includes(evidence.operation) || typeof evidence.subject !== 'string' ||
      !['succeeded', 'absent', 'failed', 'not_performed'].includes(evidence.status) || typeof evidence.detail !== 'string') {
      throw new Error('Report inspection evidence is invalid.');
    }
  }
  exactKeys(report.inspection.components, ['manifest', 'standardSkills', 'mcp'], 'Components');
  for (const component of Object.values(report.inspection.components)) {
    exactKeys(component, ['path', 'presence', 'inspection'], 'Component inspection');
    if (typeof component.path !== 'string' || !['present', 'absent', 'unknown'].includes(component.presence) ||
      !['complete', 'partial', 'unable_to_complete', 'not_applicable'].includes(component.inspection)) {
      throw new Error('Report component inspection is invalid.');
    }
  }
  const extensions = report.inspection.extensionNamespaces;
  exactKeys(extensions, ['names', 'internalsValidated', 'referencedPathsValidated', 'statement'], 'Extension inspection');
  if (!Array.isArray(extensions.names) || extensions.names.some(name => typeof name !== 'string') ||
    new Set(extensions.names).size !== extensions.names.length || extensions.internalsValidated !== false ||
    extensions.referencedPathsValidated !== false || extensions.statement !== 'Extension internals and referenced paths were not validated.') {
    throw new Error('Report extension inspection is invalid.');
  }
  const servers = report.inspection.mcpServers;
  exactKeys(servers, ['declarations', 'serversExecuted', 'endpointsContacted', 'statement'], 'MCP inspection');
  if (!Array.isArray(servers.declarations) || servers.serversExecuted !== false || servers.endpointsContacted !== false ||
    servers.statement !== 'MCP servers were not executed and declared endpoints were not contacted.') throw new Error('Report MCP inspection is invalid.');
  for (const server of servers.declarations) {
    exactKeys(server, ['name', 'transport', 'endpoint'], 'MCP server declaration');
    if (typeof server.name !== 'string' || !['stdio', 'streamable-http', 'sse', 'unknown'].includes(server.transport) ||
      !(server.endpoint === null || typeof server.endpoint === 'string')) throw new Error('Report MCP server declaration is invalid.');
  }
  if (!Array.isArray(report.executionProblems)) throw new Error('Report execution problems are invalid.');
  for (const problem of report.executionProblems) {
    exactKeys(problem, ['kind', 'path', 'affectedRuleIds', 'reason'], 'Execution problem');
    if (!['filesystem', 'parser_resource', 'client_context', 'prerequisite'].includes(problem.kind) || typeof problem.path !== 'string' ||
      !Array.isArray(problem.affectedRuleIds) || problem.affectedRuleIds.length < 1 ||
      new Set(problem.affectedRuleIds).size !== problem.affectedRuleIds.length || problem.affectedRuleIds.some(id => !RULE_IDS.includes(id)) ||
      typeof problem.reason !== 'string') throw new Error('Report execution problem is invalid.');
  }
  exactKeys(report.scope, ['limitations', 'untestedCapabilities'], 'Scope');
  if (!Array.isArray(report.scope.limitations) || report.scope.limitations.some(value => typeof value !== 'string') ||
    !Array.isArray(report.scope.untestedCapabilities) || report.scope.untestedCapabilities.some(value => typeof value !== 'string') ||
    new Set(report.scope.untestedCapabilities).size !== report.scope.untestedCapabilities.length) throw new Error('Report scope is invalid.');
  exactKeys(report.summary, ['total', 'selected', 'passed', 'failed', 'notApplicable', 'excluded', 'unableToComplete'], 'Outcome summary');
  const counts = OUTCOMES.map(outcome => report.rules.filter(rule => rule.outcome === outcome).length);
  const summaryCounts = [report.summary.passed, report.summary.failed, report.summary.notApplicable, report.summary.excluded, report.summary.unableToComplete];
  const expectedDetermination = counts[4] > 0 ? 'incomplete' : counts[1] > 0 ? 'fail' : report.selection.selectedRuleIds.length === 1 ? 'limited_pass' : 'pass';
  if (report.summary.total !== 20 || report.summary.selected !== report.selection.selectedRuleIds.length ||
    summaryCounts.some((value, index) => !Number.isInteger(value) || value !== counts[index]) ||
    !DETERMINATIONS.includes(report.determination) || report.determination !== expectedDetermination) throw new Error('Report outcome summary is inconsistent.');
  return report;
}

function executeCli(cliPath, target, rule) {
  const args = [cliPath, target, '--json', '--report-version', '2'];
  if (rule) args.push('--rule', rule);
  const result = spawnSync(process.execPath, args, { encoding: 'utf8', timeout: 60_000, windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
  if (result.error) throw new Error(`AIAgentConform could not start: ${result.error.message}`);
  if (![0, 1, 2].includes(result.status)) throw new Error(`AIAgentConform returned unsupported exit ${String(result.status)}.`);
  if (result.stderr) throw new Error(`AIAgentConform wrote unexpected stderr: ${result.stderr.trim()}`);
  let report;
  try { report = JSON.parse(result.stdout); }
  catch (error) { throw new Error(`AIAgentConform JSON parsing failed: ${error.message}`); }
  validateReport(report);
  const expectedExit = report.summary.unableToComplete > 0 ? 2 : report.summary.failed > 0 ? 1 : 0;
  if (result.status !== expectedExit) throw new Error(`Validated report requires exit ${expectedExit}, but CLI returned ${result.status}.`);
  return { report, exitCode: result.status, json: result.stdout.endsWith('\n') ? result.stdout : `${result.stdout}\n` };
}

function executeAction(options) {
  const validated = validateInputs(options.inputs, options.workspace);
  const workRoot = fs.mkdtempSync(path.join(options.tempRoot ?? os.tmpdir(), 'aiconform-action-'));
  const installRoot = path.join(workRoot, 'tool');
  const reportPath = path.join(workRoot, 'aiagentconform-report-v2.json');
  const cliPath = installPackage(installRoot, options.packageSpec ?? PACKAGE_SPEC);
  const result = executeCli(cliPath, validated.target, validated.rule);
  fs.writeFileSync(reportPath, result.json, { encoding: 'utf8', mode: 0o600 });
  return {
    kind: 'report', report: result.report, cliExit: result.exitCode, reportPath,
    uploadReport: validated.uploadReport, artifactName: validated.artifactName,
  };
}

function appendOutput(file, name, value) {
  if (!file) throw new Error('GITHUB_OUTPUT is unavailable.');
  fs.appendFileSync(file, `${name}=${String(value)}\n`, 'utf8');
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function main() {
  let stateRoot;
  let statePath;
  try {
    stateRoot = fs.mkdtempSync(path.join(process.env.RUNNER_TEMP || os.tmpdir(), 'aiconform-state-'));
    statePath = path.join(stateRoot, 'state.json');
    appendOutput(process.env.GITHUB_OUTPUT, 'state_path', statePath);
    let state;
    try {
      state = executeAction({
        workspace: process.env.GITHUB_WORKSPACE,
        inputs: {
          path: process.env.AICONFORM_INPUT_PATH,
          rule: process.env.AICONFORM_INPUT_RULE,
          uploadReport: process.env.AICONFORM_INPUT_UPLOAD_REPORT,
          artifactName: process.env.AICONFORM_INPUT_ARTIFACT_NAME,
        },
        tempRoot: process.env.RUNNER_TEMP || os.tmpdir(),
      });
    } catch (error) {
      state = { kind: 'tooling_error', message: errorMessage(error) };
      console.error(`AIAgentConform Action tooling error: ${state.message}`);
    }
    fs.writeFileSync(statePath, `${JSON.stringify(state)}\n`, { encoding: 'utf8', mode: 0o600 });
    const available = state.kind === 'report';
    appendOutput(process.env.GITHUB_OUTPUT, 'report_available', available);
    appendOutput(process.env.GITHUB_OUTPUT, 'report_path', available ? state.reportPath : '');
    appendOutput(process.env.GITHUB_OUTPUT, 'upload_report', available ? state.uploadReport : false);
    appendOutput(process.env.GITHUB_OUTPUT, 'artifact_name', available ? state.artifactName : '');
  } catch (error) {
    console.error(`AIAgentConform Action orchestration error: ${errorMessage(error)}`);
    process.exitCode = 1;
  }
}

module.exports = {
  PACKAGE_SPEC, PACKAGE_VERSION, RULE_IDS, executeAction, executeCli, installPackage,
  resolveInputPath, validateInputs, validateReport,
};

if (require.main === module) main();
