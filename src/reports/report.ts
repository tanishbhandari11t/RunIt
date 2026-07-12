import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { ServiceFailure } from '../types';

interface KnownError {
  pattern: RegExp;
  reason: (match: RegExpMatchArray) => string;
  solution: (match: RegExpMatchArray) => string;
  improvement?: (match: RegExpMatchArray) => string;
}

/**
 * Rule-based error intelligence. An AI provider (Gemini/OpenAI/Claude)
 * can be plugged in later to explain errors these rules don't cover.
 */
const KNOWN_ERRORS: KnownError[] = [
  {
    pattern: /ModuleNotFoundError: No module named ['"]?([\w.]+)/,
    reason: (m) => `The Python package \`${m[1]}\` is imported by the code but is not installed in the environment.`,
    solution: (m) => `pip install ${m[1]}`,
    improvement: (m) => `Add \`${m[1]}\` to \`requirements.txt\` so future installs include it.`,
  },
  {
    pattern: /Cannot find module ['"]([^'"]+)['"]/,
    reason: (m) => `The Node.js module \`${m[1]}\` is required but missing from node_modules.`,
    solution: (m) => (m[1].startsWith('.') ? 'Check that the file path in the require/import statement exists.' : `npm install ${m[1]}`),
    improvement: (m) => (m[1].startsWith('.') ? 'Verify relative import paths.' : `Add \`${m[1]}\` to package.json dependencies.`),
  },
  {
    pattern: /EADDRINUSE.*?:(\d+)/,
    reason: (m) => `Port ${m[1]} is already being used by another process.`,
    solution: (m) => `Stop the process using port ${m[1]}, or configure this service to use a different port.`,
  },
  {
    pattern: /address already in use/i,
    reason: () => 'The port this service wants is already taken by another process.',
    solution: () => 'Stop the conflicting process or change the port in the service configuration.',
  },
  {
    pattern: /connection refused|ECONNREFUSED/i,
    reason: () => 'The service tried to connect to another service (often a database) that is not running yet.',
    solution: () => 'Make sure the dependency (database, cache, API) is started first and its host/port configuration is correct.',
  },
  {
    pattern: /docker.*daemon.*(not running|cannot connect)/i,
    reason: () => 'Docker Desktop is installed but the Docker daemon is not running.',
    solution: () => 'Start Docker Desktop and run the launch again.',
  },
  {
    pattern: /npm ERR! code ENOENT/,
    reason: () => 'npm could not find a file it needed — usually package.json is missing in the directory the command ran in.',
    solution: () => 'Verify the command runs in the directory that contains package.json.',
  },
  {
    pattern: /Missing script: ["']?([\w:-]+)/,
    reason: (m) => `package.json has no \`${m[1]}\` script.`,
    solution: (m) => `Add a \`${m[1]}\` script to package.json, or run the correct script name.`,
  },
  {
    pattern: /SyntaxError: (.+)/,
    reason: (m) => `The code contains a syntax error: ${m[1].trim()}`,
    solution: () => 'Open the file and line referenced in the stack trace and fix the syntax.',
  },
];

export async function writeFailureReport(
  workspaceRoot: string,
  failures: ServiceFailure[],
): Promise<vscode.Uri> {
  const lines: string[] = [
    '# RunIt Failure Report',
    '',
    `**Project:** ${path.basename(workspaceRoot)}`,
    `**Generated:** ${new Date().toLocaleString()}`,
    '',
  ];

  for (const failure of failures) {
    lines.push(`## Failed Component: ${failure.service.name}`);
    lines.push('');
    lines.push(`- **Phase:** ${failure.phase === 'install' ? 'dependency installation' : 'service launch'}`);
    lines.push(`- **Command:** \`${failure.phase === 'install' ? failure.service.installCommands.join(' && ') : failure.service.launchCommand}\``);
    lines.push(`- **Directory:** \`${failure.service.cwd}\``);
    lines.push(`- **Exit code:** ${failure.exitCode ?? 'unknown'}`);
    lines.push('');

    const diagnosis = diagnose(failure.logTail);
    if (diagnosis) {
      lines.push('### Reason');
      lines.push('');
      lines.push(diagnosis.reason);
      lines.push('');
      lines.push('### Solution');
      lines.push('');
      lines.push('```');
      lines.push(diagnosis.solution);
      lines.push('```');
      if (diagnosis.improvement) {
        lines.push('');
        lines.push('### Suggested Improvement');
        lines.push('');
        lines.push(diagnosis.improvement);
      }
    } else {
      lines.push('### Reason');
      lines.push('');
      lines.push('RunIt could not match this failure against its known error rules. Review the captured error lines below.');
    }
    lines.push('');

    if (failure.errorLines.length > 0) {
      lines.push('### Captured Error Lines');
      lines.push('');
      lines.push('```');
      lines.push(...failure.errorLines);
      lines.push('```');
      lines.push('');
    }

    lines.push('<details><summary>Full log tail</summary>');
    lines.push('');
    lines.push('```');
    lines.push(failure.logTail.trim());
    lines.push('```');
    lines.push('');
    lines.push('</details>');
    lines.push('');
  }

  const reportPath = path.join(workspaceRoot, 'RunIt_Report.md');
  fs.writeFileSync(reportPath, lines.join('\n'), 'utf8');
  return vscode.Uri.file(reportPath);
}

function diagnose(log: string): { reason: string; solution: string; improvement?: string } | undefined {
  for (const rule of KNOWN_ERRORS) {
    const match = log.match(rule.pattern);
    if (match) {
      return {
        reason: rule.reason(match),
        solution: rule.solution(match),
        improvement: rule.improvement?.(match),
      };
    }
  }
  return undefined;
}
