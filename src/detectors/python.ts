import * as fs from 'fs';
import * as path from 'path';
import { ServicePlan } from '../types';
import { TOOLS } from './tools';

/**
 * Detects a Python project and picks a framework-aware launch command:
 * Django (manage.py), FastAPI (uvicorn), Flask, Streamlit, or a plain
 * main.py / app.py / single-script entry point.
 */
export function detectPython(dir: string, label: string): ServicePlan[] {
  const has = (file: string) => fs.existsSync(path.join(dir, file));
  const read = (file: string) => {
    try {
      return fs.readFileSync(path.join(dir, file), 'utf8');
    } catch {
      return '';
    }
  };

  const hasManifest = has('requirements.txt') || has('pyproject.toml') || has('manage.py');
  if (!hasManifest && !has('main.py') && !has('app.py')) {
    return [];
  }
  // A package folder (e.g. app/ holding app/main.py) belongs to the project above it.
  if (!hasManifest && has('__init__.py')) {
    return [];
  }

  const py = process.platform === 'win32' ? '.venv\\Scripts\\python' : '.venv/bin/python';
  const requirements = read('requirements.txt');
  const pyproject = read('pyproject.toml');
  const deps = `${requirements}\n${pyproject}`.toLowerCase();

  const installCommands: string[] = [`${TOOLS.python.command} -m venv .venv`];
  if (requirements) {
    installCommands.push(`${py} -m pip install -r requirements.txt`);
  } else if (pyproject) {
    if (/^\[build-system\]/m.test(pyproject)) {
      installCommands.push(`${py} -m pip install .`);
    } else {
      // Apps without a build backend can't be `pip install .`-ed; install their deps directly.
      const projectDeps = pyprojectDependencies(pyproject);
      if (projectDeps.length > 0) {
        installCommands.push(`${py} -m pip install ${projectDeps.map((d) => `"${d.replace(/"/g, "'")}"`).join(' ')}`);
      }
    }
  }

  const firstExisting = (files: string[]) => files.find(has);
  const moduleOf = (file: string) => file.replace(/\.py$/, '').replace(/[\\/]/g, '.');

  let framework: string | undefined;
  let launchCommand: string | undefined;

  if (has('manage.py')) {
    framework = 'Django';
    launchCommand = `${py} manage.py runserver`;
  } else if (deps.includes('fastapi') && firstExisting(['main.py', 'app.py', 'app/main.py', 'src/main.py'])) {
    framework = 'FastAPI';
    const entry = firstExisting(['main.py', 'app.py', 'app/main.py', 'src/main.py'])!;
    const source = read(entry);
    const appVar = source.match(/^(\w+)\s*=\s*FastAPI\(/m)?.[1] ?? 'app';
    launchCommand = source.includes('uvicorn.run(')
      ? `${py} ${entry}`
      : `${py} -m uvicorn ${moduleOf(entry)}:${appVar} --reload`;
  } else if (deps.includes('flask') && firstExisting(['app.py', 'main.py', 'wsgi.py'])) {
    framework = 'Flask';
    const entry = firstExisting(['app.py', 'main.py', 'wsgi.py'])!;
    launchCommand = /\.run\(/.test(read(entry))
      ? `${py} ${entry}`
      : `${py} -m flask --app ${moduleOf(entry)} run`;
  } else if (deps.includes('streamlit') && firstExisting(['app.py', 'main.py', 'streamlit_app.py'])) {
    framework = 'Streamlit';
    launchCommand = `${py} -m streamlit run ${firstExisting(['app.py', 'main.py', 'streamlit_app.py'])}`;
  } else if (has('main.py')) {
    launchCommand = `${py} main.py`;
  } else if (has('app.py')) {
    launchCommand = `${py} app.py`;
  } else {
    const scripts = listFiles(dir).filter((f) => f.endsWith('.py') && !['setup.py', 'conftest.py'].includes(f));
    if (scripts.length === 1) {
      launchCommand = `${py} ${scripts[0]}`;
    }
  }

  if (!launchCommand) {
    return [];
  }

  return [
    {
      name: `${framework ? 'Backend' : 'App'} (${framework ?? 'Python'}) — ${label}`,
      language: 'python',
      framework,
      role: framework ? 'backend' : 'app',
      cwd: dir,
      installCommands,
      launchCommand,
      order: 2,
      readyPatterns: [
        'Uvicorn running', 'Running on http', 'Starting development server',
        'You can now view', 'Application startup complete',
      ],
      requiredTools: [TOOLS.python],
    },
  ];
}

/** Extracts `[project] dependencies = [...]` from pyproject.toml without a TOML parser. */
function pyprojectDependencies(pyproject: string): string[] {
  const start = pyproject.search(/^\[project\]\s*$/m);
  if (start < 0) {
    return [];
  }
  const rest = pyproject.slice(start).replace(/^\[project\]\s*/, '');
  const end = rest.search(/^\[/m);
  const section = end < 0 ? rest : rest.slice(0, end);
  const list = section.match(/^dependencies\s*=\s*\[((?:[^\]"'#]|"[^"]*"|'[^']*'|#[^\n]*)*)\]/m);
  if (!list) {
    return [];
  }
  return [...list[1].matchAll(/"([^"]*)"|'([^']*)'/g)].map((m) => (m[1] ?? m[2]).trim()).filter(Boolean);
}

function listFiles(dir: string): string[] {
  try {
    return fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isFile()).map((e) => e.name);
  } catch {
    return [];
  }
}
