/**
 * Shared types for RunIt.
 */

export type Language =
  | 'javascript'
  | 'python'
  | 'java'
  | 'go'
  | 'rust'
  | 'docker';

export type ServiceRole = 'database' | 'backend' | 'worker' | 'frontend' | 'app';

export interface DetectedProject {
  /** Absolute path to the directory that was scanned. */
  root: string;
  languages: Language[];
  frameworks: string[];
  services: ServicePlan[];
  /** Recognized marker files found during the scan, e.g. "backend/requirements.txt". */
  keyFiles: string[];
}

export interface ServicePlan {
  /** Human readable name, e.g. "Frontend (React)". */
  name: string;
  language: Language;
  framework?: string;
  role: ServiceRole;
  /** Directory the commands run in (absolute). */
  cwd: string;
  /** Commands run once before launch, e.g. "npm install". */
  installCommands: string[];
  /** The long-running command that starts the service. */
  launchCommand: string;
  /** Startup order. Lower numbers start first. */
  order: number;
  /** Regex sources that indicate the service is ready. */
  readyPatterns: string[];
  /** Tool that must exist on the machine, e.g. "node". */
  requiredTool: ToolRequirement;
}

export interface ToolRequirement {
  /** Binary name checked on PATH, e.g. "node". */
  command: string;
  /** Args used to probe it, e.g. ["--version"]. */
  versionArgs: string[];
  /** Friendly name shown to the user. */
  displayName: string;
  /** Where to get it. */
  installHint: string;
}

export type ServiceStatus =
  | 'pending'
  | 'installing'
  | 'starting'
  | 'running'
  | 'stopped'
  | 'failed';

export interface ServiceFailure {
  service: ServicePlan;
  phase: 'install' | 'launch';
  exitCode: number | null;
  /** Last chunk of captured output. */
  logTail: string;
  errorLines: string[];
}
