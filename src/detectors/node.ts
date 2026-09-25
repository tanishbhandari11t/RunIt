import * as fs from 'fs';
import * as path from 'path';
import { ServicePlan, ServiceRole } from '../types';
import { TOOLS } from './tools';

const ENTRY_FILES = [
  'server.js', 'index.js', 'main.js', 'app.js',
  'server.ts', 'index.ts', 'main.ts', 'app.ts',
  'src/server.js', 'src/index.js', 'src/main.js', 'src/app.js',
  'src/server.ts', 'src/index.ts', 'src/main.ts', 'src/app.ts',
];

/**
 * Detects a Node.js / TypeScript project from package.json:
 * identifies the framework from dependencies and discovers the launch
 * command from scripts (dev > start > serve), the "main" field, or a
 * conventional entry file.
 */
export function detectNode(dir: string, label: string): ServicePlan[] {
  const pkgPath = path.join(dir, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    return [];
  }

  let pkg: {
    main?: string;
    scripts?: Record<string, string>;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  try {
    pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  } catch {
    return [];
  }

  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const scripts = pkg.scripts ?? {};

  let framework: string | undefined;
  if (deps['next']) framework = 'Next.js';
  else if (deps['react']) framework = 'React';
  else if (deps['vue']) framework = 'Vue';
  else if (deps['@angular/core']) framework = 'Angular';
  else if (deps['express']) framework = deps['jsonwebtoken'] ? 'Express (REST API + JWT)' : 'Express (REST API)';
  else if (deps['fastify']) framework = 'Fastify';
  else if (deps['vite']) framework = 'Vite';

  let launchCommand: string | undefined;
  for (const script of ['dev', 'start', 'serve']) {
    if (scripts[script]) {
      launchCommand = `npm run ${script}`;
      break;
    }
  }
  if (!launchCommand) {
    const candidates = [pkg.main, ...ENTRY_FILES].filter((f): f is string => !!f);
    const entry = candidates.find((f) => isFile(path.join(dir, f)));
    if (entry) {
      launchCommand = runEntry(entry);
    }
  }
  if (!launchCommand) {
    const sources = listFiles(dir).filter((f) => /\.(c|m)?(j|t)s$/.test(f) && !isConfigFile(f));
    if (sources.length === 1) {
      launchCommand = runEntry(sources[0]);
    }
  }

  const plans: ServicePlan[] = [];

  if (launchCommand) {
    const isFrontend = !!framework && ['Next.js', 'React', 'Vue', 'Angular', 'Vite'].includes(framework);
    const role: ServiceRole = isFrontend ? 'frontend' : deps['express'] || deps['fastify'] ? 'backend' : 'app';

    plans.push({
      name: `${isFrontend ? 'Frontend' : 'Node'}${framework ? ` (${framework})` : ''} — ${label}`,
      language: 'javascript',
      framework,
      role,
      cwd: dir,
      installCommands: ['npm install'],
      launchCommand,
      order: isFrontend ? 3 : 2,
      readyPatterns: ['localhost:\\d+', 'ready in', 'compiled successfully', 'Local:', 'listening'],
      requiredTools: [TOOLS.javascript],
    });
  }

  if (deps['jest'] || scripts['test']?.includes('jest')) {
    plans.push({
      name: `Tests (Jest) — ${label}`,
      language: 'javascript',
      framework: 'Jest',
      role: 'test',
      cwd: dir,
      installCommands: plans.length === 0 ? ['npm install'] : [],
      launchCommand: scripts['test'] ? 'npm run test -- --watchAll' : 'npx jest --watchAll',
      order: 4,
      readyPatterns: ['Ran all test suites', 'Watch Usage'],
      requiredTools: [TOOLS.javascript],
    });
  }

  return plans;
}

/** Plain JS runs on node; TypeScript runs through tsx so no build step is needed. */
export function runEntry(file: string): string {
  const posix = file.replace(/\\/g, '/');
  return /\.(c|m)?ts$/.test(posix) ? `npx --yes tsx ${posix}` : `node ${posix}`;
}

function isConfigFile(file: string): boolean {
  return /(\.config|rc)\.(c|m)?(j|t)s$/.test(file) || file.endsWith('.d.ts');
}

function isFile(file: string): boolean {
  try {
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
}

function listFiles(dir: string): string[] {
  try {
    return fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isFile()).map((e) => e.name);
  } catch {
    return [];
  }
}
