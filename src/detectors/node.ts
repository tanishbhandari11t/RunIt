import * as fs from 'fs';
import * as path from 'path';
import { ServicePlan, ServiceRole } from '../types';
import { TOOLS } from './tools';

/**
 * Detects a Node.js / TypeScript project from package.json:
 * identifies the framework from dependencies and discovers the launch
 * command from scripts (dev > start > serve) or a conventional entry file.
 */
export function detectNode(dir: string, label: string): ServicePlan[] {
  const pkgPath = path.join(dir, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    return [];
  }

  let pkg: {
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
    for (const entry of ['server.js', 'index.js', 'main.js', 'app.js']) {
      if (fs.existsSync(path.join(dir, entry))) {
        launchCommand = `node ${entry}`;
        break;
      }
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
      requiredTool: TOOLS.javascript,
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
      requiredTool: TOOLS.javascript,
    });
  }

  return plans;
}
