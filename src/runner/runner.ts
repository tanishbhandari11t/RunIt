import { ChildProcess, spawn } from 'child_process';
import * as vscode from 'vscode';
import { ServiceFailure, ServicePlan, ServiceStatus } from '../types';

const LOG_TAIL_CHARS = 4000;

const IS_WINDOWS = process.platform === 'win32';

/** Python block-buffers piped stdout, which would hide logs and ready signals. */
const CHILD_ENV = { ...process.env, PYTHONUNBUFFERED: '1' };

const ERROR_LINE_PATTERN =
  /error|exception|traceback|failed|fatal|cannot find|not found|refused|EADDRINUSE|ModuleNotFoundError/i;

/** ANSI escape sequences (colors, cursor moves) — output channels can't render them. */
const ANSI_PATTERN =
  // eslint-disable-next-line no-control-regex
  /[\u001b\u009b][[\]()#;?]*(?:(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><])/g;

/** A local dev-server URL printed by the service, e.g. http://localhost:5173/ */
const LOCAL_URL_PATTERN = /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0)(?::\d+)?[^\s'")\]]*/i;

interface ManagedService {
  plan: ServicePlan;
  status: ServiceStatus;
  process?: ChildProcess;
  output: vscode.OutputChannel;
  log: string;
  errorLines: string[];
  announcedUrl?: string;
}

export interface LaunchResult {
  failures: ServiceFailure[];
  started: ServicePlan[];
}

/**
 * Runs install commands, then starts each service as a managed child
 * process. Output streams into a per-service OutputChannel so RunIt can
 * watch for ready/error patterns (VS Code terminals don't expose output).
 */
export class RunEngine implements vscode.Disposable {
  private services: ManagedService[] = [];
  private readonly statusBar: vscode.StatusBarItem;

  constructor() {
    this.statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this.statusBar.command = 'runit.stop';
  }

  isRunning(): boolean {
    return this.services.some((s) => s.status === 'running' || s.status === 'starting');
  }

  async launch(
    plan: ServicePlan[],
    progress: vscode.Progress<{ message?: string }>,
  ): Promise<LaunchResult> {
    await this.stopAll();
    this.services.forEach((s) => s.output.dispose());
    this.services = plan.map((p) => ({
      plan: p,
      status: 'pending' as ServiceStatus,
      output: vscode.window.createOutputChannel(`RunIt: ${p.name}`),
      log: '',
      errorLines: [],
    }));

    const failures: ServiceFailure[] = [];
    const started: ServicePlan[] = [];

    for (const service of this.services) {
      // Phase 1: install dependencies (blocking, must succeed).
      for (const command of service.plan.installCommands) {
        service.status = 'installing';
        progress.report({ message: `${service.plan.name}: ${command}` });
        this.updateStatusBar();
        const result = await this.runToCompletion(service, command);
        if (result.exitCode !== 0) {
          service.status = 'failed';
          failures.push({
            service: service.plan,
            phase: 'install',
            exitCode: result.exitCode,
            logTail: service.log.slice(-LOG_TAIL_CHARS),
            errorLines: service.errorLines.slice(-20),
          });
          this.updateStatusBar();
          return { failures, started }; // Later services likely depend on this one.
        }
      }

      // Phase 2: start the long-running service and wait until ready.
      service.status = 'starting';
      progress.report({ message: `Starting ${service.plan.name}...` });
      this.updateStatusBar();
      const ok = await this.startService(service);
      if (!ok) {
        failures.push({
          service: service.plan,
          phase: 'launch',
          exitCode: service.process?.exitCode ?? null,
          logTail: service.log.slice(-LOG_TAIL_CHARS),
          errorLines: service.errorLines.slice(-20),
        });
        this.updateStatusBar();
        return { failures, started };
      }
      started.push(service.plan);
      this.updateStatusBar();
    }

    return { failures, started };
  }

  /** Runs a one-shot command (installs) and resolves with its exit code. */
  private runToCompletion(
    service: ManagedService,
    command: string,
  ): Promise<{ exitCode: number | null }> {
    return new Promise((resolve) => {
      service.output.appendLine(`\n$ ${command}\n`);
      const child = spawn(command, {
        cwd: service.plan.cwd,
        shell: true,
        env: CHILD_ENV,
      });
      child.stdout?.on('data', (d: Buffer) => this.capture(service, d));
      child.stderr?.on('data', (d: Buffer) => this.capture(service, d));
      child.on('error', (err) => {
        this.capture(service, Buffer.from(`\n${err.message}\n`));
        resolve({ exitCode: -1 });
      });
      child.on('close', (code) => resolve({ exitCode: code }));
    });
  }

  /**
   * Starts the service and resolves true once a ready pattern appears,
   * after a grace period with the process still alive, or when it exits
   * cleanly (a script that simply finished). Resolves false if the process
   * exits with an error before becoming ready.
   */
  private startService(service: ManagedService): Promise<boolean> {
    return new Promise((resolve) => {
      service.output.appendLine(`\n$ ${service.plan.launchCommand}\n`);
      service.output.show(true);

      const child = spawn(service.plan.launchCommand, {
        cwd: service.plan.cwd,
        shell: true,
        env: CHILD_ENV,
        // Own process group on Unix so stopAll can kill the shell and its children together.
        detached: !IS_WINDOWS,
      });
      service.process = child;

      const readyRegexes = service.plan.readyPatterns.map((p) => new RegExp(p, 'i'));
      // Only launch output counts; install logs could otherwise match a ready pattern.
      let launchLog = '';
      let settled = false;

      const markReady = () => {
        if (!settled) {
          settled = true;
          service.status = 'running';
          resolve(true);
        }
      };

      // If nothing matched but the process survived 20s, assume it's fine.
      const graceTimer = setTimeout(() => {
        if (child.exitCode === null) {
          markReady();
        }
      }, 20000);

      const onData = (d: Buffer) => {
        this.capture(service, d);
        if (settled) {
          return;
        }
        launchLog = (launchLog + d.toString().replace(ANSI_PATTERN, '')).slice(-LOG_TAIL_CHARS);
        if (readyRegexes.some((r) => r.test(launchLog))) {
          clearTimeout(graceTimer);
          markReady();
        }
      };
      child.stdout?.on('data', onData);
      child.stderr?.on('data', onData);

      child.on('error', (err) => {
        this.capture(service, Buffer.from(`\n${err.message}\n`));
      });

      child.on('close', (code) => {
        clearTimeout(graceTimer);
        if (service.status === 'stopped') {
          // Killed by stopAll; the non-zero exit code is expected.
          if (!settled) {
            settled = true;
            resolve(false);
          }
          return;
        }
        service.status = code === 0 ? 'stopped' : 'failed';
        this.updateStatusBar();
        if (!settled) {
          settled = true;
          if (code === 0) {
            service.output.appendLine(`\n${service.plan.name} finished successfully (exit code 0).`);
          }
          resolve(code === 0);
        } else if (code !== 0 && code !== null) {
          // Crashed after startup: tell the user, don't fail the launch flow.
          vscode.window.showWarningMessage(
            `RunIt: ${service.plan.name} exited with code ${code}. Check its output channel.`,
          );
        }
      });
    });
  }

  private capture(service: ManagedService, data: Buffer): void {
    const text = data.toString().replace(ANSI_PATTERN, '');
    service.log = (service.log + text).slice(-LOG_TAIL_CHARS * 4);
    service.output.append(text);
    for (const line of text.split('\n')) {
      if (ERROR_LINE_PATTERN.test(line) && line.trim().length > 0) {
        service.errorLines.push(line.trim());
      }
    }
    this.announceUrl(service);
  }

  /**
   * When a service prints its dev-server URL, surface it prominently:
   * a banner in the output channel plus a clickable notification.
   */
  private announceUrl(service: ManagedService): void {
    if (service.announcedUrl) {
      return;
    }
    const match = service.log.match(LOCAL_URL_PATTERN);
    if (!match) {
      return;
    }
    const url = match[0].replace('0.0.0.0', 'localhost').replace(/[.,;]+$/, '');
    service.announcedUrl = url;

    service.output.appendLine('');
    service.output.appendLine('════════════════════════════════════');
    service.output.appendLine(` ${service.plan.name} is live at:`);
    service.output.appendLine(` ${url}`);
    service.output.appendLine('════════════════════════════════════');

    void vscode.window
      .showInformationMessage(`RunIt: ${service.plan.name} is running at ${url}`, 'Open in Browser')
      .then((choice) => {
        if (choice === 'Open in Browser') {
          void vscode.env.openExternal(vscode.Uri.parse(url));
        }
      });
  }

  async stopAll(): Promise<void> {
    const teardowns: Promise<unknown>[] = [];
    for (const service of this.services) {
      const wasStarted = !!service.process;
      if (service.process && service.process.exitCode === null) {
        try {
          if (IS_WINDOWS && service.process.pid) {
            // Kill the whole tree; shell:true spawns cmd.exe wrappers.
            spawn('taskkill', ['/pid', String(service.process.pid), '/t', '/f']);
          } else if (service.process.pid) {
            // Negative pid signals the whole process group created by detached spawn.
            process.kill(-service.process.pid, 'SIGTERM');
          }
        } catch {
          // Process already gone.
        }
      }
      service.status = 'stopped';
      if (wasStarted && service.plan.stopCommand) {
        teardowns.push(this.runToCompletion(service, service.plan.stopCommand));
      }
    }
    this.updateStatusBar();
    await Promise.all(teardowns);
  }

  private updateStatusBar(): void {
    const running = this.services.filter((s) => s.status === 'running').length;
    const failed = this.services.filter((s) => s.status === 'failed').length;
    if (this.services.length === 0) {
      this.statusBar.hide();
      return;
    }
    const icon = failed > 0 ? '$(error)' : '$(rocket)';
    this.statusBar.text = `${icon} RunIt: ${running}/${this.services.length} running`;
    this.statusBar.tooltip = 'Click to stop all RunIt services';
    this.statusBar.show();
  }

  dispose(): void {
    const services = this.services;
    void this.stopAll().finally(() => services.forEach((s) => s.output.dispose()));
    this.statusBar.dispose();
  }
}
