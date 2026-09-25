import { spawnSync } from 'child_process';
import { Language, ToolRequirement } from '../types';

let pythonCommand: string | undefined;

/**
 * The Python launcher differs per machine: Windows installs often expose only
 * `py` (python.exe can be a Microsoft Store stub), Unix usually has `python3`.
 */
export function resolvePythonCommand(): string {
  if (pythonCommand === undefined) {
    const candidates = process.platform === 'win32' ? ['python', 'py'] : ['python3', 'python'];
    pythonCommand =
      candidates.find((cmd) => {
        const result = spawnSync(`${cmd} --version`, { shell: true, timeout: 10000, encoding: 'utf8' });
        return result.status === 0 && /Python \d/.test(`${result.stdout}${result.stderr}`);
      }) ?? candidates[0];
  }
  return pythonCommand;
}

let composeCommand: string | undefined;

/** Compose v2 ships as `docker compose`; older installs only have the standalone `docker-compose`. */
export function resolveComposeCommand(): string {
  if (composeCommand === undefined) {
    const v2 = spawnSync('docker compose version', { shell: true, timeout: 10000 });
    const v1 = v2.status === 0 ? undefined : spawnSync('docker-compose version', { shell: true, timeout: 10000 });
    composeCommand = v2.status !== 0 && v1?.status === 0 ? 'docker-compose' : 'docker compose';
  }
  return composeCommand;
}

/** The machine-level tool each language needs before anything can run. */
export const TOOLS: Record<Language, ToolRequirement> = {
  javascript: {
    command: 'node',
    versionArgs: ['--version'],
    displayName: 'Node.js',
    installHint: 'Install Node.js 20+ from https://nodejs.org',
  },
  python: {
    get command() {
      return resolvePythonCommand();
    },
    versionArgs: ['--version'],
    displayName: 'Python',
    installHint: 'Install Python 3.10+ from https://python.org',
  },
  java: {
    command: 'java',
    // `--version` doesn't exist on Java 8; `-version` works on every JDK.
    versionArgs: ['-version'],
    displayName: 'Java JDK',
    installHint: 'Install JDK 21 from https://adoptium.net',
  },
  go: {
    command: 'go',
    versionArgs: ['version'],
    displayName: 'Go',
    installHint: 'Install Go from https://go.dev/dl',
  },
  rust: {
    command: 'cargo',
    versionArgs: ['--version'],
    displayName: 'Rust (cargo)',
    installHint: 'Install Rust via https://rustup.rs',
  },
  docker: {
    command: 'docker',
    versionArgs: ['--version'],
    displayName: 'Docker',
    installHint: 'Install Docker Desktop from https://docker.com',
  },
};

/** Build tools needed only when a project doesn't ship its own wrapper script. */
export const BUILD_TOOLS: Record<'maven' | 'gradle', ToolRequirement> = {
  maven: {
    command: 'mvn',
    versionArgs: ['-v'],
    displayName: 'Maven',
    installHint: 'Install Maven from https://maven.apache.org/download.cgi (or add the Maven wrapper, mvnw, to the project)',
  },
  gradle: {
    command: 'gradle',
    versionArgs: ['--version'],
    displayName: 'Gradle',
    installHint: 'Install Gradle from https://gradle.org/install (or add the Gradle wrapper, gradlew, to the project)',
  },
};
