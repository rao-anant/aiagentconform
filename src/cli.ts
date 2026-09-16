#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { runCli } from './run-cli.js';

const metadata = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };
process.stdout.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EPIPE') process.exitCode = 0;
  else { process.stderr.write('AgentCheck: could not write output.\n'); process.exitCode = 2; }
});
process.exitCode = runCli(process.argv.slice(2), metadata.version, {
  out: text => { process.stdout.write(text); }, err: text => { process.stderr.write(text); },
});
