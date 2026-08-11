import * as path from 'path';
import * as vscode from 'vscode';
import { installTerminalCommand } from './cli';
import { checkEnvironment } from './environment';
import { buildLaunchPlan, describePlan } from './planner';
import { writeFailureReport } from './reports/report';
import { RunEngine } from './runner/runner';
import { scanProject } from './scanner/scanner';
import { DetectedProject, Language, ServicePlan } from './types';

let engine: RunEngine;
let analysisChannel: vscode.OutputChannel;

export function activate(context: vscode.ExtensionContext): void {
  engine = new RunEngine();
  analysisChannel = vscode.window.createOutputChannel('RunIt');
  context.subscriptions.push(engine, analysisChannel);

  context.subscriptions.push(
    vscode.commands.registerCommand('runit.launch', launchProject),
    vscode.commands.registerCommand('runit.stop', stopAll),
    vscode.commands.registerCommand('runit.showPlan', showPlan),
    vscode.commands.registerCommand('runit.installCli', installTerminalCommand),
  );

  // Deep link handler: "code --open-url vscode://tanishbhandari24.runit/launch"
  // lets terminals (via the launch-project alias) trigger a launch.
  context.subscriptions.push(
    vscode.window.registerUriHandler({
      handleUri(uri: vscode.Uri): void {
        if (uri.path === '/launch') {
          void launchProject();
        }
      },
    }),
  );

  // One-click launch button, always visible in the status bar.
  const launchButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 101);
  launchButton.text = '$(rocket) Launch Project';
  launchButton.tooltip = 'RunIt: analyze this project, install dependencies, and launch everything';
  launchButton.command = 'runit.launch';
  launchButton.show();
  context.subscriptions.push(launchButton);
}

export function deactivate(): void {
  engine?.dispose();
}

function getWorkspaceRoot(): string | undefined {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    vscode.window.showErrorMessage('RunIt: open a project folder first.');
    return undefined;
  }
  return folder.uri.fsPath;
}

const LANGUAGE_LABELS: Record<Language, string> = {
  javascript: 'Node.js / JavaScript',
  python: 'Python',
  java: 'Java',
  go: 'Go',
  rust: 'Rust',
  docker: 'Docker',
};

/** Prints the "RunIt Analysis" summary into the RunIt output channel. */
function showAnalysis(project: DetectedProject, plan: ServicePlan[]): void {
  const lines: string[] = [
    '════════════════════════════════════',
    ' RunIt Analysis',
    '════════════════════════════════════',
    '',
    `Project: ${project.root}`,
    '',
    'Detected Files:',
    ...(project.keyFiles.length > 0
      ? project.keyFiles.map((f) => `  ✓ ${f}`)
      : ['  (no recognized files)']),
    '',
    'Project Type:',
    ...project.languages.map((l) => `  ✓ ${LANGUAGE_LABELS[l]}`),
    ...project.frameworks.map((f) => `  ✓ ${f}`),
    '',
    'Launch Plan:',
    ...plan.map((s, i) => `  ${i + 1}. ${s.name}  →  ${s.launchCommand}`),
    '',
  ];
  analysisChannel.appendLine(lines.join('\n'));
  analysisChannel.show(true);
}

async function launchProject(): Promise<void> {
  const root = getWorkspaceRoot();
  if (!root) {
    return;
  }

  if (engine.isRunning()) {
    const choice = await vscode.window.showWarningMessage(
      'RunIt services are already running. Restart everything?',
      'Restart',
      'Cancel',
    );
    if (choice !== 'Restart') {
      return;
    }
  }

  const result = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'RunIt',
      cancellable: false,
    },
    async (progress) => {
      // Step 1 — project analysis.
      progress.report({ message: 'Analyzing project...' });
      const project = scanProject(root);
      const plan = buildLaunchPlan(project);
      if (plan.length === 0) {
        vscode.window.showErrorMessage(
          'RunIt could not detect a runnable project. Supported: JavaScript/TypeScript, Python, Java, Go, Rust, Docker.',
        );
        return undefined;
      }
      showAnalysis(project, plan);

      // Step 2 — environment detection.
      progress.report({ message: 'Checking environment...' });
      const env = await checkEnvironment(plan);
      const missing = env.filter((e) => !e.installed);
      if (missing.length > 0) {
        const details = missing
          .map((m) => `${m.tool.displayName} is missing. ${m.tool.installHint}`)
          .join('\n');
        vscode.window.showErrorMessage(
          `RunIt: required tools are not installed.\n${details}`,
          { modal: true },
        );
        return undefined;
      }
      for (const check of env) {
        analysisChannel.appendLine(`Environment: ✓ ${check.tool.displayName} (${check.version ?? 'installed'})`);
      }

      // Steps 3-6 — install, ordered launch, monitoring.
      return engine.launch(plan, progress);
    },
  );

  if (!result) {
    return;
  }

  // Step 7 — failure intelligence.
  if (result.failures.length > 0) {
    const reportUri = await writeFailureReport(root, result.failures);
    const doc = await vscode.workspace.openTextDocument(reportUri);
    await vscode.window.showTextDocument(doc, { preview: false });
    vscode.window.showErrorMessage(
      `RunIt: ${result.failures[0].service.name} failed. A report was generated.`,
    );
  } else {
    vscode.window.showInformationMessage(
      `RunIt: all ${result.started.length} service(s) are running.`,
    );
  }
}

async function stopAll(): Promise<void> {
  await engine.stopAll();
  vscode.window.showInformationMessage('RunIt: all services stopped.');
}

async function showPlan(): Promise<void> {
  const root = getWorkspaceRoot();
  if (!root) {
    return;
  }
  const project = scanProject(root);
  const plan = buildLaunchPlan(project);
  if (plan.length === 0) {
    vscode.window.showWarningMessage(`RunIt: no runnable services detected in ${path.basename(root)}.`);
    return;
  }
  const doc = await vscode.workspace.openTextDocument({
    content: describePlan(plan),
    language: 'markdown',
  });
  await vscode.window.showTextDocument(doc, { preview: true });
}
