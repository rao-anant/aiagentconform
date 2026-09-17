import { lstatSync, readdirSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import type { Finding, Report } from '../../core/report.js';
import { attachReportContext, createReportContext } from '../../core/report-v2.js';
import { Evaluation } from './evaluation.js';
import { expandPlaceholders, inside, resolvePackagePath } from './paths.js';
import {
  commandForm, frontmatter, manifestFields, MCP_SCHEMA, object, PLUGIN_SCHEMA,
  readText, remoteErrors, schemaIssues, skillErrors, validateMetadata, validateName, validateServer,
} from './validation.js';

export function checkPlugin(directory: string, selectedRule?: string): Report {
  let root = path.resolve(directory);
  const evaluation = new Evaluation(selectedRule);
  const reportContext = createReportContext(directory);
  const { selected, limitations } = evaluation;
  const add = evaluation.add.bind(evaluation);
  const skip = evaluation.skip.bind(evaluation);
  const finish = (blocked = false) => attachReportContext(evaluation.finish(root, blocked), reportContext);
  let containmentInspectionFailed = false;
  function contained(relative: string, boundary: Finding['failureBoundary']): string | undefined {
    containmentInspectionFailed = false;
    try {
      const resolved = resolvePackagePath(root, relative);
      if (add(2, inside(root, resolved), relative, inside(root, resolved) ? 'Resolved package path is contained.' : 'Resolved package path escapes the plugin root.', boundary)) return resolved;
    } catch (error) {
      if (unavailable(error)) {
        containmentInspectionFailed = true;
        skip([2], relative, 'inspection-error', 'Filesystem access prevented path inspection.');
      }
      else add(2, false, relative, 'Package path cannot be safely resolved (broken link, loop, or invalid ancestor).', boundary);
    }
    return undefined;
  }
  function present(relative: string): boolean {
    try { lstatSync(path.join(root, relative)); return true; }
    catch (error) { return (error as NodeJS.ErrnoException).code !== 'ENOENT'; }
  }
  function json(file: string, id: number, boundary: Finding['failureBoundary']): Record<string, unknown> | undefined {
    try {
      const text = readText(path.join(root, file));
      reportContext.evidence.push({ operation: 'read', subject: file, status: 'succeeded', detail: 'Read the document as UTF-8.' });
      const value: unknown = JSON.parse(text);
      if (!object(value)) throw new Error();
      reportContext.evidence.push({ operation: 'parse', subject: file, status: 'succeeded', detail: 'Parsed the document as a JSON object.' });
      add(id, true, file, 'Readable JSON object.', boundary);
      return value;
    } catch (error) {
      if (filesystemError(error)) {
        reportContext.evidence.push({ operation: 'read', subject: file, status: 'failed', detail: 'Filesystem access prevented reading this document.' });
        if (file === 'plugin.json') reportContext.components.manifest.inspection = 'unable_to_complete';
        if (file === 'mcp.json') reportContext.components.mcp.inspection = 'unable_to_complete';
        skip([id], file, 'inspection-error', 'Filesystem access prevented reading this document.');
      } else {
        reportContext.evidence.push({ operation: 'parse', subject: file, status: 'failed', detail: 'The document was not valid UTF-8 containing a JSON object.' });
        if (file === 'plugin.json') reportContext.components.manifest.inspection = 'partial';
        if (file === 'mcp.json') reportContext.components.mcp.inspection = 'partial';
        add(id, false, file, 'Expected valid UTF-8 containing a JSON object.', boundary);
      }
      return undefined;
    }
  }
  try {
    root = realpathSync(root);
    if (!statSync(root).isDirectory()) throw new Error();
    reportContext.evidence.push({ operation: 'resolve', subject: directory, status: 'succeeded', detail: 'Resolved the package root for static inspection.' });
  } catch (error) {
    if (unavailable(error)) {
      reportContext.evidence.push({ operation: 'resolve', subject: directory, status: 'failed', detail: 'Filesystem access prevented inspecting the target.' });
      reportContext.components.manifest.inspection = 'unable_to_complete';
      skip([1], directory, 'inspection-error', 'Filesystem access prevented inspecting the target.');
    } else {
      reportContext.evidence.push({ operation: 'resolve', subject: directory, status: 'failed', detail: 'The target is not an accessible directory.' });
      add(1, false, directory, 'Plugin target must be an accessible directory.', 'plugin');
    }
    return finish(true);
  }
  if (!present('plugin.json')) {
    reportContext.evidence.push({ operation: 'discover', subject: 'plugin.json', status: 'absent', detail: 'The required root manifest is absent.' });
    reportContext.components.manifest = { path: 'plugin.json', presence: 'absent', inspection: 'complete' };
    add(1, false, 'plugin.json', 'Required root plugin.json is missing; alternate manifests do not replace it.', 'plugin');
    return finish(true);
  }
  const manifestPath = contained('plugin.json', 'plugin');
  if (!manifestPath) return finish(true);
  try {
    if (!statSync(manifestPath).isFile()) throw new Error();
    reportContext.evidence.push({ operation: 'discover', subject: 'plugin.json', status: 'succeeded', detail: 'Found the required root manifest.' });
    reportContext.components.manifest = { path: 'plugin.json', presence: 'present', inspection: 'complete' };
    add(1, true, 'plugin.json', 'Found a regular manifest at the plugin root.', 'plugin');
  } catch (error) {
    if (filesystemError(error)) {
      reportContext.evidence.push({ operation: 'discover', subject: 'plugin.json', status: 'failed', detail: 'Filesystem access prevented inspecting the root manifest.' });
      reportContext.components.manifest.inspection = 'unable_to_complete';
      skip([1], 'plugin.json', 'inspection-error', 'Filesystem access prevented inspecting the root manifest.');
    } else add(1, false, 'plugin.json', 'Root plugin.json must resolve to a readable regular file.', 'plugin');
    return finish(true);
  }
  if (selected === 1) return finish();
  const manifest = json('plugin.json', 3, 'plugin');
  if (!manifest) return finish(true);
  reportContext.manifestName = typeof manifest.name === 'string' ? manifest.name : null;
  reportContext.extensionNamespaces = object(manifest.extensions) ? Object.keys(manifest.extensions).sort() : [];
  if (selected === 3) return finish();
  const required = add(4, ['$schema', 'name'].every(key => typeof manifest[key] === 'string' && manifest[key].length > 0), 'plugin.json', 'Required $schema and name must be non-empty strings.', 'plugin');
  const schema = add(5, manifest.$schema === PLUGIN_SCHEMA, 'plugin.json', `Supported manifest schema: ${PLUGIN_SCHEMA}.`, 'plugin');
  const name = add(6, validateName(manifest.name), 'plugin.json#/name', 'Name must satisfy the official 1–64 character lowercase name constraints.', 'plugin');
  const metadataValid = validateMetadata(manifest);
  const metadata = add(7, metadataValid, 'plugin.json', metadataValid ? 'Optional metadata satisfies the official JSON types.' : `Invalid optional metadata: ${schemaIssues(validateMetadata.errors)}.`, 'plugin');
  const unknown = Object.keys(manifest).filter(key => !manifestFields.includes(key)).sort();
  if (!unknown.length) add(8, true, 'plugin.json', 'No unknown top-level fields.', 'field');
  for (const key of unknown) add(8, false, `plugin.json#/${pointer(key)}`, 'Unknown top-level manifest field; ignored for component discovery.', 'field');
  add(9, !('extensions' in manifest) || object(manifest.extensions), 'plugin.json#/extensions', 'Package conformance requires extensions to be an object when present. Clients report and ignore a non-object container.', 'field');
  if (object(manifest.extensions)) {
    // Package shape is distinct from client loading behavior (§8.1). All
    // namespaces are unimplemented here; never validate their object contents
    // or make these package findings block independent component discovery.
    for (const namespace of Object.keys(manifest.extensions).sort()) {
      if (!object(manifest.extensions[namespace])) {
        add(9, false, `plugin.json#/extensions/${pointer(namespace)}`, 'Package conformance requires each extensions member value to be an object. Clients must ignore unimplemented namespaces without validating their contents; component checks continue.', 'field');
      }
    }
  }
  if (selected !== undefined && selected >= 4 && selected <= 9) return finish();
  if (!required || !schema || !name || !metadata) return finish(true);

  // Components have independent failure boundaries.
  for (const component of ['skills', 'mcp.json']) {
    if (selected !== undefined && selected !== 2 && selected !== 10 &&
      (component === 'skills' ? selected > 12 : selected < 13)) continue;
    const componentRules = component === 'skills' ? [11, 12] : [13, 14, 15, 16, 17, 18, 19, 20];
    if (!present(component)) {
      reportContext.evidence.push({ operation: 'discover', subject: component, status: 'absent', detail: 'Optional component location is absent.' });
      const componentReport = component === 'skills' ? reportContext.components.standardSkills : reportContext.components.mcp;
      componentReport.presence = 'absent'; componentReport.inspection = 'not_applicable';
      add(10, true, component, 'Optional component location is absent.', 'component');
      skip(componentRules, component, 'not-applicable', 'Optional component location is absent.');
      continue;
    }
    const resolved = contained(component, 'component');
    if (!resolved) {
      skip(containmentInspectionFailed ? [10, ...componentRules] : componentRules, component,
        containmentInspectionFailed ? 'inspection-error' : 'prerequisite-failed',
        containmentInspectionFailed ? 'Filesystem access prevented inspecting the component location.' : 'Component location cannot be safely resolved.');
      continue;
    }
    try {
      const stat = statSync(resolved);
      if (!(component === 'skills' ? stat.isDirectory() : stat.isFile())) throw new Error();
      reportContext.evidence.push({ operation: 'discover', subject: component, status: 'succeeded', detail: 'Found the optional component at its fixed location.' });
      const componentReport = component === 'skills' ? reportContext.components.standardSkills : reportContext.components.mcp;
      componentReport.presence = 'present'; componentReport.inspection = 'complete';
      add(10, true, component, 'Fixed component location has the expected filesystem kind.', 'component');
    } catch (error) {
      const componentReport = component === 'skills' ? reportContext.components.standardSkills : reportContext.components.mcp;
      if (filesystemError(error)) {
        componentReport.presence = 'unknown'; componentReport.inspection = 'unable_to_complete';
        reportContext.evidence.push({ operation: 'inspect', subject: component, status: 'failed', detail: 'Filesystem access prevented inspecting the component.' });
        skip([10, ...componentRules], component, 'inspection-error', 'Filesystem access prevented inspecting the component.');
      } else {
        componentReport.presence = 'present'; componentReport.inspection = 'partial';
        add(10, false, component, 'Fixed component location has an invalid filesystem kind or is unreadable.', 'component');
        skip(componentRules, component, 'prerequisite-failed', 'Component location is invalid.');
      }
      continue;
    }
    if (selected === 10) continue;
    if (component === 'skills') checkSkills();
    else if (selected !== 2) checkMcp();
  }
  return finish();

  function checkSkills(): void {
    let entries: string[];
    try { entries = readdirSync(path.join(root, 'skills')).sort(); }
    catch {
      reportContext.components.standardSkills.inspection = 'unable_to_complete';
      reportContext.evidence.push({ operation: 'inspect', subject: 'skills', status: 'failed', detail: 'Cannot enumerate the skills directory.' });
      skip([2, 11, 12], 'skills', 'inspection-error', 'Cannot enumerate the skills directory.'); return;
    }
    reportContext.evidence.push({ operation: 'inspect', subject: 'skills', status: 'succeeded', detail: 'Enumerated immediate child entries in deterministic order.' });
    for (const entry of entries) {
      const relative = `skills/${entry}`;
      const child = contained(relative, 'skill');
      if (!child) { skip([11, 12], relative, 'prerequisite-failed', 'Skill directory cannot be safely resolved.'); continue; }
      try { if (!statSync(child).isDirectory()) continue; }
      catch (error) {
        if (filesystemError(error)) {
          reportContext.components.standardSkills.inspection = 'unable_to_complete';
          reportContext.evidence.push({ operation: 'inspect', subject: relative, status: 'failed', detail: 'Filesystem access prevented inspecting a skills entry.' });
          skip([11, 12], relative, 'inspection-error', 'Filesystem access prevented inspecting a skills entry.');
        }
        continue;
      }
      const file = `${relative}/SKILL.md`;
      if (!present(file)) continue; // Not a skill; do not recursively search or require SKILL.md here.
      const resolved = contained(file, 'skill');
      if (!resolved) { skip([11, 12], file, 'prerequisite-failed', 'Skill file cannot be safely resolved.'); continue; }
      try { if (!statSync(resolved).isFile()) continue; }
      catch (error) {
        if (filesystemError(error)) {
          reportContext.components.standardSkills.inspection = 'unable_to_complete';
          reportContext.evidence.push({ operation: 'inspect', subject: file, status: 'failed', detail: 'Filesystem access prevented inspecting the skill file.' });
          skip([11, 12], file, 'inspection-error', 'Filesystem access prevented inspecting the skill file.');
        }
        continue;
      }
      if (selected === 2) continue;
      try {
        const fields = frontmatter(readText(resolved));
        add(11, true, file, 'Discovered an immediate child skill with valid YAML frontmatter.', 'skill');
        if (selected === 11) continue;
        const errors = skillErrors(fields, entry);
        add(12, !errors.length, file, errors.length ? errors.join('; ') + '.' : 'Required and optional skill fields satisfy the supported format constraints.', 'skill');
      } catch (error) {
        if (filesystemError(error) || error instanceof Error && error.message.includes('Excessive alias count')) {
          reportContext.components.standardSkills.inspection = 'unable_to_complete';
          skip([11], file, 'inspection-error', 'Filesystem access or the YAML parser resource limit prevented inspection.');
        } else add(11, false, file, 'SKILL.md must be valid UTF-8 and begin with valid YAML mapping frontmatter delimited by --- lines.', 'skill');
        skip([12], file, 'prerequisite-failed', 'Skill frontmatter could not be parsed.');
      }
    }
  }

  function checkMcp(): void {
    const mcp = json('mcp.json', 13, 'component');
    if (!mcp) { skip([14, 15, 16, 17, 18, 19, 20], 'mcp.json', 'prerequisite-failed', 'MCP document could not be parsed.'); return; }
    reportContext.mcpServers = object(mcp.mcpServers) ? Object.entries(mcp.mcpServers)
      .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([name, value]) => {
        const transport = object(value) && ['stdio', 'streamable-http', 'sse'].includes(String(value.type))
          ? value.type as 'stdio' | 'streamable-http' | 'sse' : 'unknown';
        return { name, transport, endpoint: object(value) && typeof value.url === 'string' ? value.url : null };
      }) : [];
    if (selected === 13) return;
    const shape = add(14, typeof mcp.$schema === 'string' && object(mcp.mcpServers) && Object.keys(mcp).every(key => ['$schema', 'mcpServers'].includes(key)), 'mcp.json', 'MCP document requires $schema and an object mcpServers, with no other top-level fields.', 'component');
    const supported = add(15, mcp.$schema === MCP_SCHEMA, 'mcp.json#/$schema', `Supported MCP schema: ${MCP_SCHEMA}.`, 'component');
    const version = typeof mcp.$schema === 'string' ? /^https:\/\/agent-plugins\.org\/schemas\/([^/]+)\/mcp\.schema\.json$/.exec(mcp.$schema)?.[1] : undefined;
    const consistent = add(16, version === '1.0.0', 'mcp.json#/$schema', 'MCP schema version must match the manifest specification version 1.0.0 (not the plugin release version).', 'component');
    if (selected !== undefined && selected >= 14 && selected <= 16) return;
    if (!shape || !supported || !consistent || !object(mcp.mcpServers)) { skip([17, 18, 19, 20], 'mcp.json', 'prerequisite-failed', 'MCP document shape or version is invalid.'); return; }
    for (const [key, value] of Object.entries(mcp.mcpServers).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) {
      const location = `mcp.json#/mcpServers/${pointer(key)}`;
      if (object(value) && ((selected === 18 || selected === 19) && ['streamable-http', 'sse'].includes(String(value.type)) || selected === 20 && value.type === 'stdio')) continue;
      const serverValid = validateServer(value);
      const valid = add(17, serverValid, location, serverValid ? 'Server matches an official transport variant; reserved env names are absent.' : `Server must match one official closed transport variant; env cannot define PLUGIN_ROOT or PLUGIN_DATA. Schema errors: ${schemaIssues(validateServer.errors)}.`, 'server');
      if (!valid || !object(value)) { skip([18, 19, 20], location, 'prerequisite-failed', 'Server transport configuration is invalid.'); continue; }
      if (selected === 17) continue;
      if (value.type === 'stdio') {
        if (selected === 20) continue;
        if (selected !== 19) {
          const command = value.command as string;
          let ok = commandForm(command);
          if (ok && command.startsWith('./')) {
            try { ok = inside(root, resolvePackagePath(root, command)); }
            catch { ok = false; }
          }
          add(18, ok, `${location}/command`, 'command must be a single bare executable token or a filesystem-contained ./ path. It is never expanded or executed.', 'server');
        }
        if (selected !== 18) checkCwd(value.cwd as string | undefined, location);
      } else {
        if (selected === 18 || selected === 19) continue;
        const errors = remoteErrors(value);
        add(20, !errors.length, location, errors.length ? errors.join('; ') + '.' : 'Remote URL and literal headers satisfy the static endpoint requirements.', 'server');
      }
    }
  }

  function checkCwd(cwd: string | undefined, location: string): void {
    if (cwd === undefined) {
      add(19, true, `${location}/cwd`, 'Omitted cwd defaults to the plugin root.', 'server');
      return;
    }
    if (cwd.includes('${PLUGIN_DATA}')) {
      // No synthetic data root: lexical '..' can disagree with real symlink resolution.
      skip([19], `${location}/cwd`, 'client-context-required', 'Filesystem containment requires the client-managed PLUGIN_DATA directory; no PASS or FAIL is inferred.');
      limitations.add('PLUGIN_DATA cwd containment is deferred because the client-managed filesystem is unavailable.');
      return;
    }
    const validForm = cwd.startsWith('./') || cwd === '${PLUGIN_ROOT}' || cwd.startsWith('${PLUGIN_ROOT}/');
    let ok = false;
    if (validForm) {
      const expanded = expandPlaceholders(cwd, root, '${PLUGIN_DATA}');
      const relative = cwd.startsWith('./') ? expanded : expanded.slice(root.length).replace(/^[/\\]/, '');
      try { ok = inside(root, resolvePackagePath(root, relative)); }
      catch { ok = false; }
    }
    add(19, ok, `${location}/cwd`, 'cwd must use an allowed root and remain contained after supported single-pass expansion.', 'server');
  }
}

function pointer(value: string): string { return value.replace(/~/g, '~0').replace(/\//g, '~1'); }

function filesystemError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && typeof error.code === 'string' && /^E[A-Z]+$/.test(error.code);
}

function unavailable(error: unknown): boolean {
  return filesystemError(error) && ['EACCES', 'EPERM', 'EIO', 'EMFILE', 'ENFILE', 'EBUSY'].includes((error as NodeJS.ErrnoException).code!);
}
