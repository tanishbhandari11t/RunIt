import { execFile } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

const MARKER = '# RunIt terminal command';

const POWERSHELL_SNIPPET = [
  '',
  MARKER,
  'function launch-project { code --open-url "vscode://runit-dev.runit/launch" }',
  'Set-Alias runit launch-project',
  '',
].join('\r\n');

const BASH_SNIPPET = [
  '',
  MARKER,
  'alias launch-project=\'code --open-url "vscode://runit-dev.runit/launch"\'',
  'alias runit=launch-project',
  '',
].join('\n');

/**
 * Adds a `launch-project` command (alias `runit`) to the user's shell
 * profile. Typing it in any terminal fires the vscode:// deep link,
 * which VS Code routes to RunIt's URI handler and triggers a launch.
 */
export async function installTerminalCommand(): Promise<void> {
  try {
    const profiles = process.platform === 'win32'
      ? [await getPowerShellProfile()]
      : [path.join(os.homedir(), '.bashrc'), path.join(os.homedir(), '.zshrc')];

    const updated: string[] = [];
    for (const profile of profiles) {
      if (!profile) {
        continue;
      }
      const existing = fs.existsSync(profile) ? fs.readFileSync(profile, 'utf8') : '';
      if (existing.includes(MARKER)) {
        continue; // Already installed.
      }
      fs.mkdirSync(path.dirname(profile), { recursive: true });
      fs.appendFileSync(profile, process.platform === 'win32' ? POWERSHELL_SNIPPET : BASH_SNIPPET);
      updated.push(profile);
    }

    if (updated.length > 0) {
      vscode.window.showInformationMessage(
        `RunIt: terminal command installed in ${updated.map((p) => path.basename(p)).join(', ')}. ` +
        'Open a NEW terminal and type "launch-project" (or just "runit").',
      );
    } else {
      vscode.window.showInformationMessage(
        'RunIt: the terminal command is already installed. Type "launch-project" or "runit" in a new terminal.',
      );
    }
  } catch (error) {
    vscode.window.showErrorMessage(
      `RunIt: could not install the terminal command: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/** Asks PowerShell where its profile script lives ($PROFILE). */
function getPowerShellProfile(): Promise<string | undefined> {
  return new Promise((resolve) => {
    execFile(
      'powershell',
      ['-NoProfile', '-Command', 'Write-Output $PROFILE'],
      { timeout: 15000 },
      (error, stdout) => {
        resolve(error ? undefined : stdout.trim());
      },
    );
  });
}
