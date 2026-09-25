import * as fs from 'fs';
import * as path from 'path';
import { ServicePlan } from '../types';
import { BUILD_TOOLS, TOOLS } from './tools';

const READY_PATTERNS = ['Started .* in .* seconds', 'Tomcat started on port', 'Netty started on port'];

/**
 * Detects Maven (pom.xml) and Gradle (build.gradle[.kts]) projects. Prefers the
 * project's wrapper script, runs Spring Boot via its plugin, and otherwise
 * launches the class that declares `main`.
 */
export function detectJava(dir: string, label: string): ServicePlan[] {
  const has = (file: string) => fs.existsSync(path.join(dir, file));
  const win = process.platform === 'win32';

  if (has('pom.xml')) {
    const isSpringBoot = readFile(path.join(dir, 'pom.xml')).includes('spring-boot');
    const wrapper = has(win ? 'mvnw.cmd' : 'mvnw');
    const mvn = wrapper ? (win ? '.\\mvnw.cmd' : 'sh ./mvnw') : 'mvn';
    const mainClass = isSpringBoot ? undefined : findMainClass(path.join(dir, 'src', 'main', 'java'));
    return [
      {
        name: `Backend (${isSpringBoot ? 'Spring Boot' : 'Maven'}) — ${label}`,
        language: 'java',
        framework: isSpringBoot ? 'Spring Boot' : 'Maven',
        role: isSpringBoot ? 'backend' : 'app',
        cwd: dir,
        installCommands: [`${mvn} install -DskipTests`],
        launchCommand: isSpringBoot
          ? `${mvn} spring-boot:run`
          : `${mvn} exec:java${mainClass ? ` -Dexec.mainClass=${mainClass}` : ''}`,
        order: 2,
        readyPatterns: READY_PATTERNS,
        requiredTools: wrapper ? [TOOLS.java] : [TOOLS.java, BUILD_TOOLS.maven],
      },
    ];
  }

  const buildFile = ['build.gradle', 'build.gradle.kts'].find(has);
  if (buildFile) {
    const isSpringBoot = readFile(path.join(dir, buildFile)).includes('org.springframework.boot');
    const wrapper = has(win ? 'gradlew.bat' : 'gradlew');
    const gradle = wrapper ? (win ? '.\\gradlew.bat' : 'sh ./gradlew') : 'gradle';
    return [
      {
        name: `Backend (${isSpringBoot ? 'Spring Boot' : 'Gradle'}) — ${label}`,
        language: 'java',
        framework: isSpringBoot ? 'Spring Boot' : 'Gradle',
        role: isSpringBoot ? 'backend' : 'app',
        cwd: dir,
        installCommands: [`${gradle} build -x test`],
        launchCommand: `${gradle} ${isSpringBoot ? 'bootRun' : 'run'}`,
        order: 2,
        readyPatterns: READY_PATTERNS,
        requiredTools: wrapper ? [TOOLS.java] : [TOOLS.java, BUILD_TOOLS.gradle],
      },
    ];
  }

  return [];
}

/** Finds the fully-qualified name of a class declaring `static void main`, preferring Main/App/Application. */
function findMainClass(sourceRoot: string): string | undefined {
  const found: string[] = [];
  const stack = [sourceRoot];
  let visited = 0;
  while (stack.length > 0 && visited < 2000) {
    const dir = stack.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      visited++;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.name.endsWith('.java')) {
        const source = readFile(full);
        if (/static\s+void\s+main\s*\(/.test(source)) {
          const pkg = source.match(/^\s*package\s+([\w.]+)\s*;/m)?.[1];
          const cls = entry.name.replace(/\.java$/, '');
          found.push(pkg ? `${pkg}.${cls}` : cls);
        }
      }
    }
  }
  const preferred = found.find((c) => /(^|\.)(Main|App|Application)$/.test(c));
  return preferred ?? found[0];
}

function readFile(file: string): string {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return '';
  }
}
