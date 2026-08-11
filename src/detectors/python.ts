import * as fs from 'fs';
import * as path from 'path';
import { ServicePlan } from '../types';
import { TOOLS } from './tools';

/**
 * Detects a Python project and picks a framework-aware launch command:
 * Django (manage.py), FastAPI (uvicorn), Flask, Streamlit, or a plain
 * main.py / app.py entry point.
 */
export function detectPython(dir: string, label: string): ServicePlan[] {
  const has = (file: string) => fs.existsSync(path.join(dir, file));
  if (!has('requirements.txt') && !has('pyproject.toml') && !has('manage.py') && !has('main.py') && !has('app.py')) {
    return [];
  }

  const basePy = TOOLS.python.command;
  const py = process.platform === 'win32' ? '.venv\\\\Scripts\\\\python' : '.venv/bin/python';

  const installCommands: string[] = [
    `${basePy} -m venv .venv`
  ];
  if (has('requirements.txt')) {
    installCommands.push(`${py} -m pip install -r requirements.txt`);
  } else if (has('pyproject.toml')) {
    installCommands.push(`${py} -m pip install .`);
  }

  const requirements = has('requirements.txt')
    ? fs.readFileSync(path.join(dir, 'requirements.txt'), 'utf8').toLowerCase()
    : '';

  let framework: string | undefined;
  let launchCommand: string | undefined;

  if (has('manage.py')) {
    framework = 'Django';
    launchCommand = `${py} manage.py runserver`;
  } else if (requirements.includes('fastapi') && has('main.py')) {
    framework = 'FastAPI';
    launchCommand = requirements.includes('uvicorn')
      ? `${py} -m uvicorn main:app --reload`
      : `${py} main.py`;
  } else if (requirements.includes('flask') && (has('app.py') || has('main.py'))) {
    framework = 'Flask';
    launchCommand = `${py} ${has('app.py') ? 'app.py' : 'main.py'}`;
  } else if (requirements.includes('streamlit') && (has('app.py') || has('main.py'))) {
    framework = 'Streamlit';
    launchCommand = `${py} -m streamlit run ${has('app.py') ? 'app.py' : 'main.py'}`;
  } else if (has('main.py')) {
    launchCommand = `${py} main.py`;
  } else if (has('app.py')) {
    launchCommand = `${py} app.py`;
  }

  if (!launchCommand) {
    return [];
  }

  return [
    {
      name: `Backend (${framework ?? 'Python'}) — ${label}`,
      language: 'python',
      framework,
      role: 'backend',
      cwd: dir,
      installCommands,
      launchCommand,
      order: 2,
      readyPatterns: [
        'Uvicorn running', 'Running on http', 'Starting development server',
        'You can now view', 'Application startup complete',
      ],
      requiredTool: TOOLS.python,
    },
  ];
}
