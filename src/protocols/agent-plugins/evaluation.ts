import type { Finding, Report, RuleResult, SkippedCheck } from '../../core/report.js';
import { rules } from './rules.js';

const manifest = [1, 2, 3, 4, 5, 6, 7];
const mcp = [...manifest, 10, 13, 14, 15, 16, 17];
const dependencies: Record<number, number[]> = {
  1: [2], 2: manifest, 3: [1, 2], 4: [1, 2, 3], 5: [1, 2, 3], 6: [1, 2, 3],
  7: [1, 2, 3], 8: [1, 2, 3], 9: [1, 2, 3], 10: manifest,
  11: [...manifest, 10], 12: [...manifest, 10, 11], 13: [...manifest, 10],
  14: [...manifest, 10, 13], 15: [...manifest, 10, 13], 16: [...manifest, 10, 13],
  17: mcp, 18: mcp, 19: mcp, 20: mcp,
};
export const ruleId = (id: number): string => `AP${String(id).padStart(3, '0')}`;

export class Evaluation {
  readonly selected: number | undefined;
  readonly findings: Finding[] = [];
  readonly skipped: SkippedCheck[] = [];
  readonly prerequisites: Finding[] = [];
  readonly limitations = new Set([
    'Static checks only; PASS is not certification of full package or client conformance.',
    'Only Agent Plugins 1.0.0 is supported. No runtime, secret detection, extension namespace validation, or traversal of unused package files.',
  ]);

  constructor(selectedRule?: string) {
    if (selectedRule && !rules.some(rule => rule.id === selectedRule)) throw new Error('Unknown rule ID.');
    this.selected = selectedRule ? Number(selectedRule.slice(2)) : undefined;
  }
  wanted(id: number): boolean { return this.selected === undefined || this.selected === id; }
  needed(id: number): boolean { return this.wanted(id) || dependencies[this.selected!]?.includes(id) === true; }

  add(id: number, ok: boolean, path: string, explanation: string, failureBoundary: Finding['failureBoundary']): boolean {
    const finding: Finding = { ruleId: ruleId(id), severity: ok ? 'PASS' : 'FAIL', path, explanation, failureBoundary };
    if (this.wanted(id)) this.findings.push(finding);
    else if (this.needed(id) && !ok) this.prerequisites.push(finding);
    return ok;
  }
  skip(ids: number[], path: string, reason: SkippedCheck['reason'], explanation: string): void {
    for (const id of ids) if (this.needed(id)) this.skipped.push({ ruleId: ruleId(id), path, reason, explanation });
  }

  finish(target: string, blocked = false): Report {
    const selectedRules = rules.filter(rule => this.wanted(Number(rule.id.slice(2)))).map(rule => rule.id);
    const results: RuleResult[] = selectedRules.map(id => {
      const findings = this.findings.filter(finding => finding.ruleId === id);
      if (!findings.length && !this.skipped.some(skip => skip.ruleId === id)) {
        this.skipped.push({ ruleId: id, path: '.', reason: blocked ? 'prerequisite-failed' : 'not-applicable',
          explanation: blocked ? 'An invalid prerequisite prevented evaluation.' : 'No applicable input was discovered for this rule.' });
      }
      const incomplete = this.skipped.some(skip => skip.ruleId === id && skip.reason !== 'not-applicable');
      return { ruleId: id, status: findings.some(f => f.severity === 'FAIL') ? 'FAIL' : incomplete || !findings.length ? 'SKIP' : 'PASS' };
    });
    const failed = this.findings.filter(f => f.severity === 'FAIL').length;
    const incomplete = this.prerequisites.length > 0 || this.skipped.some(skip => skip.reason !== 'not-applicable') ||
      this.selected !== undefined && results.every(result => result.status === 'SKIP');
    return {
      reportVersion: '1', kind: 'report', protocol: 'agent-plugins', specificationVersion: '1.0.0', target,
      status: failed ? 'FAIL' : incomplete ? 'INCOMPLETE' : 'PASS', selectedRules,
      rulesRun: new Set(this.findings.map(finding => finding.ruleId)).size,
      summary: { passed: this.findings.length - failed, failed },
      ruleSummary: { total: results.length, passed: results.filter(r => r.status === 'PASS').length,
        failed: results.filter(r => r.status === 'FAIL').length, skipped: results.filter(r => r.status === 'SKIP').length },
      results, rules, findings: this.findings, prerequisiteFindings: this.prerequisites, skipped: this.skipped,
      advisories: [], limitations: [...this.limitations],
    };
  }
}
