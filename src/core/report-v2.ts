import type { Finding, Report, Rule } from './report.js';

export type RuleId =
  | 'AP001' | 'AP002' | 'AP003' | 'AP004' | 'AP005' | 'AP006' | 'AP007' | 'AP008' | 'AP009' | 'AP010'
  | 'AP011' | 'AP012' | 'AP013' | 'AP014' | 'AP015' | 'AP016' | 'AP017' | 'AP018' | 'AP019' | 'AP020';
export type RuleOutcome = 'passed' | 'failed' | 'not_applicable' | 'excluded' | 'unable_to_complete';
export type InspectionOperation = 'resolve' | 'discover' | 'read' | 'parse' | 'inspect';
export type InspectionStatus = 'succeeded' | 'absent' | 'failed' | 'not_performed';

export interface InspectionEvidence {
  operation: InspectionOperation;
  subject: string;
  status: InspectionStatus;
  detail: string;
}

export interface ComponentInspection {
  path: string;
  presence: 'present' | 'absent' | 'unknown';
  inspection: 'complete' | 'partial' | 'unable_to_complete' | 'not_applicable';
}

export interface McpServerDeclaration {
  name: string;
  transport: 'stdio' | 'streamable-http' | 'sse' | 'unknown';
  endpoint: string | null;
}

export interface ReportContext {
  inputArgument: string;
  manifestName: string | null;
  evidence: InspectionEvidence[];
  components: {
    manifest: ComponentInspection;
    standardSkills: ComponentInspection;
    mcp: ComponentInspection;
  };
  extensionNamespaces: string[];
  mcpServers: McpServerDeclaration[];
}

export interface RuleOutcomeV2 {
  id: RuleId;
  title: string;
  classification: 'normative' | 'advisory';
  outcome: RuleOutcome;
  reason: string;
  references: Rule['references'];
}

export interface FindingV2 {
  ruleId: RuleId;
  result: 'passed' | 'failed';
  path: string;
  explanation: string;
  boundary: Finding['failureBoundary'];
}

export interface ExecutionProblem {
  kind: 'filesystem' | 'parser_resource' | 'client_context' | 'prerequisite';
  path: string;
  affectedRuleIds: RuleId[];
  reason: string;
}

export interface ReportV2 {
  reportVersion: '2';
  kind: 'report';
  tool: { name: 'AIAgentConform'; version: string };
  protocol: { id: 'agent-plugins'; specificationVersion: '1.0.0' };
  input: { argument: string; resolvedPath: string; packageIdentity: { manifestName: string | null } };
  selection: { mode: 'all' | 'single'; selectedRuleIds: RuleId[] };
  rules: RuleOutcomeV2[];
  findings: FindingV2[];
  inspection: {
    evidence: InspectionEvidence[];
    components: ReportContext['components'];
    extensionNamespaces: {
      names: string[];
      internalsValidated: false;
      referencedPathsValidated: false;
      statement: string;
    };
    mcpServers: {
      declarations: McpServerDeclaration[];
      serversExecuted: false;
      endpointsContacted: false;
      statement: string;
    };
  };
  executionProblems: ExecutionProblem[];
  scope: { limitations: string[]; untestedCapabilities: string[] };
  summary: {
    total: 20;
    selected: number;
    passed: number;
    failed: number;
    notApplicable: number;
    excluded: number;
    unableToComplete: number;
  };
  determination: 'pass' | 'limited_pass' | 'fail' | 'incomplete';
}

const contexts = new WeakMap<Report, ReportContext>();

export function createReportContext(inputArgument: string): ReportContext {
  return {
    inputArgument,
    manifestName: null,
    evidence: [],
    components: {
      manifest: { path: 'plugin.json', presence: 'unknown', inspection: 'not_applicable' },
      standardSkills: { path: 'skills', presence: 'unknown', inspection: 'not_applicable' },
      mcp: { path: 'mcp.json', presence: 'unknown', inspection: 'not_applicable' },
    },
    extensionNamespaces: [],
    mcpServers: [],
  };
}

export function attachReportContext(report: Report, context: ReportContext): Report {
  contexts.set(report, context);
  return report;
}

function contextFor(report: Report): ReportContext {
  return contexts.get(report) ?? createReportContext(report.target);
}

function selectedOutcome(report: Report, id: string): { outcome: RuleOutcome; reason: string } {
  const findings = report.findings.filter(finding => finding.ruleId === id);
  const skips = report.skipped.filter(skip => skip.ruleId === id);
  const hasInspectionFailure = report.skipped.some(skip => ['inspection-error', 'client-context-required'].includes(skip.reason));
  const incomplete = skips.some(skip => ['inspection-error', 'client-context-required'].includes(skip.reason) ||
    skip.reason === 'prerequisite-failed' && (hasInspectionFailure || report.selectedRules.length === 1));
  if (incomplete) {
    return { outcome: 'unable_to_complete', reason: skips.find(skip => skip.reason !== 'not-applicable')?.explanation ?? 'Required inspection could not be completed.' };
  }
  if (findings.some(finding => finding.severity === 'FAIL')) {
    return { outcome: 'failed', reason: 'The rule ran and found a conformance violation.' };
  }
  if (findings.length) return { outcome: 'passed', reason: 'The rule ran and its normative requirement was satisfied.' };
  const skip = skips[0];
  return { outcome: 'not_applicable', reason: skip?.explanation ?? 'No applicable input was discovered for this rule.' };
}

function problemKind(reason: string, explanation: string): ExecutionProblem['kind'] {
  if (reason === 'client-context-required') return 'client_context';
  if (reason === 'inspection-error') return explanation.toLowerCase().includes('parser') ? 'parser_resource' : 'filesystem';
  return 'prerequisite';
}

export function toReportV2(report: Report, version: string): ReportV2 {
  const context = contextFor(report);
  const selected = new Set(report.selectedRules);
  const outcomes: RuleOutcomeV2[] = report.rules.map(rule => {
    const actual = selected.has(rule.id)
      ? selectedOutcome(report, rule.id)
      : { outcome: 'excluded' as const, reason: `Excluded by --rule ${report.selectedRules[0]} selection.` };
    return {
      id: rule.id as RuleId,
      title: rule.title,
      classification: 'normative',
      ...actual,
      references: rule.references,
    };
  });
  const count = (outcome: RuleOutcome) => outcomes.filter(rule => rule.outcome === outcome).length;
  const unable = count('unable_to_complete');
  const failed = count('failed');
  const unableRuleIds = outcomes.filter(rule => rule.outcome === 'unable_to_complete').map(rule => rule.id);
  const executionProblems: ExecutionProblem[] = [];
  for (const skip of report.skipped.filter(item => ['inspection-error', 'client-context-required'].includes(item.reason))) {
    const kind = problemKind(skip.reason, skip.explanation);
    if (!executionProblems.some(problem => problem.kind === kind && problem.path === skip.path && problem.reason === skip.explanation)) {
      executionProblems.push({ kind, path: skip.path, affectedRuleIds: unableRuleIds, reason: skip.explanation });
    }
  }
  for (const finding of report.prerequisiteFindings) {
    executionProblems.push({
      kind: 'prerequisite', path: finding.path, affectedRuleIds: unableRuleIds,
      reason: `Prerequisite ${finding.ruleId} failed: ${finding.explanation}`,
    });
  }
  const prerequisiteEvidence: InspectionEvidence[] = report.prerequisiteFindings.map(finding => ({
      operation: 'inspect', subject: finding.path, status: 'failed',
      detail: `Prerequisite ${finding.ruleId}: ${finding.explanation}`,
  }));
  const determination = unable ? 'incomplete' : failed ? 'fail' : report.selectedRules.length === 1 ? 'limited_pass' : 'pass';
  return {
    reportVersion: '2',
    kind: 'report',
    tool: { name: 'AIAgentConform', version },
    protocol: { id: 'agent-plugins', specificationVersion: '1.0.0' },
    input: { argument: context.inputArgument, resolvedPath: report.target, packageIdentity: { manifestName: context.manifestName } },
    selection: { mode: report.selectedRules.length === 1 ? 'single' : 'all', selectedRuleIds: report.selectedRules as RuleId[] },
    rules: outcomes,
    findings: report.findings.map(finding => ({
      ruleId: finding.ruleId as RuleId,
      result: finding.severity === 'PASS' ? 'passed' : 'failed',
      path: finding.path,
      explanation: finding.explanation,
      boundary: finding.failureBoundary,
    })),
    inspection: {
      evidence: [...context.evidence, ...prerequisiteEvidence],
      components: context.components,
      extensionNamespaces: {
        names: context.extensionNamespaces,
        internalsValidated: false,
        referencedPathsValidated: false,
        statement: 'Extension internals and referenced paths were not validated.',
      },
      mcpServers: {
        declarations: context.mcpServers,
        serversExecuted: false,
        endpointsContacted: false,
        statement: 'MCP servers were not executed and declared endpoints were not contacted.',
      },
    },
    executionProblems,
    scope: {
      limitations: report.limitations.map(text => text.replace('PASS is not certification', 'PASS is qualified and is not certification')),
      untestedCapabilities: ['runtime execution', 'endpoint behavior', 'extension internals', 'extension referenced paths'],
    },
    summary: {
      total: 20,
      selected: report.selectedRules.length,
      passed: count('passed'),
      failed,
      notApplicable: count('not_applicable'),
      excluded: count('excluded'),
      unableToComplete: unable,
    },
    determination,
  };
}

export function exitCodeV2(report: ReportV2): number {
  return report.summary.unableToComplete ? 2 : report.summary.failed ? 1 : 0;
}
