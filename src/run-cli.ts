import { CommanderError } from 'commander';
import { createCommand } from './command.js';
import { formatJson } from './reporters/json.js';
import type { CliError } from './core/report.js';

export interface CliIO { out: (text: string) => void; err: (text: string) => void }

export function runCli(args: string[], version: string, io: CliIO): number {
  let code = 0;
  const command = createCommand(version, io.out, value => { code = value; })
    .exitOverride().configureOutput({ writeOut: io.out, writeErr: () => {} });
  try {
    command.parse(args, { from: 'user' });
    return code;
  } catch (error) {
    if (error instanceof CommanderError && error.exitCode === 0) return 0;
    const usage = error instanceof CommanderError;
    const report: CliError = {
      reportVersion: '1', kind: 'error', code: usage ? 'CLI_USAGE' : 'INTERNAL_ERROR',
      message: usage ? error.message.replace(/^error: /, '') : 'AIAgentConform could not complete the check because of an internal error.',
    };
    // Recognize the requested output format even if argument parsing stopped early.
    let format = 'terminal';
    for (let index = 0; index < args.length && args[index] !== '--'; index++) {
      const arg = args[index]!;
      if (arg === '--format' || arg === '-f') format = args[++index] ?? '';
      else if (arg === '--json') format = 'json';
      else if (arg.startsWith('--format=')) format = arg.slice('--format='.length);
      else if (arg.startsWith('-f') && arg.length > 2) format = arg.slice(2);
    }
    if (format === 'json') io.out(formatJson(report) + '\n');
    else io.err(`AIAgentConform: ${report.message}\n`);
    return 2;
  }
}
