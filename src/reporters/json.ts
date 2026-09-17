import type { CliError, Report, RuleList } from '../core/report.js';
import type { ReportV2 } from '../core/report-v2.js';

export function formatJson(value: Report | ReportV2 | RuleList | CliError): string {
  return JSON.stringify(value, null, 2);
}
