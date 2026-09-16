import { Ajv2020 } from 'ajv/dist/2020.js';
import type { ErrorObject } from 'ajv';
import { validateHeaderName, validateHeaderValue } from 'node:http';
import { isIP } from 'node:net';
import { readFileSync } from 'node:fs';
import { parseDocument } from 'yaml';
import pluginSchema from './schemas/plugin.schema.json' with { type: 'json' };
import mcpSchema from './schemas/mcp.schema.json' with { type: 'json' };

export const PLUGIN_SCHEMA = pluginSchema.$id;
export const MCP_SCHEMA = mcpSchema.$id;
export const manifestFields = Object.keys(pluginSchema.properties);
export const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const ajv = new Ajv2020({ allErrors: true, strict: true });
const schemaName = ajv.compile(pluginSchema.properties.name);
// JavaScript's $ anchor also matches before a final newline. The normative
// character constraint is stronger than the published schema regex here.
export const validateName = (value: unknown): boolean => typeof value === 'string' && !/[^a-z0-9.-]/u.test(value) && schemaName(value);
const { $schema: _schema, name: _name, extensions: _extensions, ...metadata } = pluginSchema.properties;
export const validateMetadata = ajv.compile({ type: 'object', properties: metadata });
ajv.addSchema(mcpSchema);
const serverValidators = {
  stdio: ajv.getSchema(`${MCP_SCHEMA}#/$defs/stdioServer`)!,
  'streamable-http': ajv.getSchema(`${MCP_SCHEMA}#/$defs/streamableHttpServer`)!,
  sse: ajv.getSchema(`${MCP_SCHEMA}#/$defs/sseServer`)!,
};
const unionServer = ajv.compile({ $ref: `${MCP_SCHEMA}#/$defs/server` });
export function validateServer(value: unknown): boolean {
  const type = object(value) ? value.type : undefined;
  const validate = typeof type === 'string' && Object.hasOwn(serverValidators, type)
    ? serverValidators[type as keyof typeof serverValidators] : unionServer;
  const valid = validate(value) === true;
  validateServer.errors = validate.errors;
  return valid;
}
validateServer.errors = null as ErrorObject[] | null | undefined;

export function readText(file: string): string {
  return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(readFileSync(file));
}

export function schemaIssues(errors: ErrorObject[] | null | undefined): string {
  return (errors ?? []).map(error => {
    const field: unknown = error.params.additionalProperty ?? error.params.missingProperty ?? error.params.propertyName;
    return `${error.instancePath || '/'}${typeof field === 'string' ? ` (${JSON.stringify(field)})` : ''}: ${error.message ?? error.keyword}`;
  }).join('; ');
}

export function frontmatter(text: string): Record<string, unknown> {
  const match = /^(?:\uFEFF)?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(text);
  if (!match) throw new Error('SKILL.md must begin with delimited YAML frontmatter.');
  const document = parseDocument(match[1]!, { uniqueKeys: true });
  if (document.errors.length) throw new Error('SKILL.md contains invalid YAML frontmatter.');
  // Preserve YAML key types instead of silently coercing numeric metadata keys.
  const value: unknown = document.toJS({ mapAsMap: true, maxAliasCount: 50 });
  if (!(value instanceof Map) || [...value.keys()].some(key => typeof key !== 'string')) throw new Error('Skill frontmatter must be a mapping with string keys.');
  const fields: Record<string, unknown> = Object.fromEntries(value);
  if (fields.metadata instanceof Map && [...fields.metadata.keys()].every(key => typeof key === 'string')) {
    fields.metadata = Object.fromEntries(fields.metadata);
  }
  return fields;
}

export function skillErrors(fields: Record<string, unknown>, directory: string): string[] {
  const errors: string[] = [];
  const length = (v: string) => [...v].length;
  const name = fields.name;
  if (typeof name !== 'string' || length(name) < 1 || length(name) > 64 ||
    !/^[\p{Ll}\p{N}]+(?:-[\p{Ll}\p{N}]+)*$/u.test(name) || name !== directory) {
    errors.push('name must be 1–64 lowercase alphanumeric/hyphen characters, without edge or repeated hyphens, and match the directory');
  }
  if (typeof fields.description !== 'string' || !fields.description.trim() || length(fields.description) > 1024) {
    errors.push('description must be a non-empty string of at most 1024 characters');
  }
  for (const key of ['license', 'allowed-tools']) {
    if (key in fields && typeof fields[key] !== 'string') errors.push(`${key} must be a string`);
  }
  if ('compatibility' in fields && (typeof fields.compatibility !== 'string' || length(fields.compatibility) < 1 || length(fields.compatibility) > 500)) {
    errors.push('compatibility must be a string of 1–500 characters');
  }
  if ('metadata' in fields && (!object(fields.metadata) || Object.values(fields.metadata).some(value => typeof value !== 'string'))) {
    errors.push('metadata must map string keys to string values');
  }
  return errors;
}

export function commandForm(command: string): boolean {
  if (command.startsWith('./')) return command.length > 2 && !command.includes('\0');
  // Shell metacharacters in a single token can be literal filename characters.
  // Do not invent a cross-platform executable-name allowlist.
  return command !== '.' && command !== '..' && !/[\s/\\\0]/u.test(command) && !/^[a-z]:/i.test(command) && command.length > 0;
}

export function remoteErrors(server: Record<string, unknown>): string[] {
  const errors: string[] = [];
  try {
    const raw = server.url as string;
    if (!/^https?:\/\//i.test(raw) || /[\s\u0000-\u001f\u007f\\]/u.test(raw)) throw new Error();
    const url = new URL(raw);
    const authority = raw.slice(raw.indexOf('//') + 2).split(/[/?#]/)[0]!;
    if (authority.includes('@') || raw.includes('#')) throw new Error();
    const host = url.hostname.replace(/^\[|\]$/g, '');
    const rawHost = authority.startsWith('[') ? authority.slice(1, authority.indexOf(']')) : authority.split(':')[0]!;
    const loopback = host === 'localhost' && rawHost.toLowerCase() === 'localhost' ||
      isIP(rawHost) === 4 && host.startsWith('127.') || isIP(rawHost) === 6 && host === '::1';
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) throw new Error();
  } catch { errors.push('url must be absolute HTTP(S), without user information or fragment; non-loopback hosts require HTTPS'); }
  if (object(server.headers)) {
    const names = new Set<string>();
    for (const [name, value] of Object.entries(server.headers)) {
      try {
        validateHeaderName(name);
        validateHeaderValue(name, value as string);
        if (names.has(name.toLowerCase())) throw new Error();
        names.add(name.toLowerCase());
      } catch { errors.push('headers must have valid HTTP names/values and no case-insensitive duplicate names'); }
    }
  }
  return errors;
}
