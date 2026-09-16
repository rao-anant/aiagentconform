export interface Rule {
  id: string;
  title: string;
  explanation: string;
  category: 'conformance';
  references: { section: string; url: string }[];
}

export interface Finding {
  ruleId: string;
  severity: 'PASS' | 'FAIL';
  path: string;
  explanation: string;
  failureBoundary: 'plugin' | 'component' | 'skill' | 'server' | 'field';
}

export interface SkippedCheck {
  ruleId: string;
  path: string;
  reason: 'not-applicable' | 'prerequisite-failed' | 'client-context-required' | 'inspection-error';
  explanation: string;
}

export interface RuleResult {
  ruleId: string;
  status: 'PASS' | 'FAIL' | 'SKIP';
}

export interface Report {
  reportVersion: '1';
  kind: 'report';
  protocol: 'agent-plugins';
  specificationVersion: '1.0.0';
  target: string;
  status: 'PASS' | 'FAIL' | 'INCOMPLETE';
  selectedRules: string[];
  rulesRun: number;
  summary: { passed: number; failed: number };
  ruleSummary: { total: number; passed: number; failed: number; skipped: number };
  results: RuleResult[];
  rules: Rule[];
  findings: Finding[];
  prerequisiteFindings: Finding[];
  skipped: SkippedCheck[];
  advisories: { ruleId: string; severity: 'WARN'; explanation: string }[];
  limitations: string[];
}

export interface RuleList {
  reportVersion: '1';
  kind: 'rules';
  protocol: 'agent-plugins';
  specificationVersion: '1.0.0';
  rules: Rule[];
}

export interface CliError {
  reportVersion: '1';
  kind: 'error';
  code: 'CLI_USAGE' | 'INTERNAL_ERROR';
  message: string;
}

export function exitCode(report: Report): number {
  return report.status === 'FAIL' ? 1 : report.status === 'INCOMPLETE' ? 2 : 0;
}
