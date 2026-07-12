import * as fs from 'fs';
import * as path from 'path';
import { ServicePlan } from '../types';
import { TOOLS } from './tools';

/** Detects Maven (pom.xml) and Gradle (build.gradle) projects, Spring Boot aware. */
export function detectJava(dir: string, label: string): ServicePlan[] {
  const has = (file: string) => fs.existsSync(path.join(dir, file));

  if (has('pom.xml')) {
    const isSpringBoot = readFileContains(path.join(dir, 'pom.xml'), 'spring-boot');
    return [
      {
        name: `Backend (Maven) — ${label}`,
        language: 'java',
        framework: isSpringBoot ? 'Spring Boot' : 'Maven',
        role: 'backend',
        cwd: dir,
        installCommands: ['mvn install -DskipTests'],
        launchCommand: isSpringBoot ? 'mvn spring-boot:run' : 'mvn exec:java',
        order: 2,
        readyPatterns: ['Started .* in .* seconds', 'Tomcat started on port'],
        requiredTool: TOOLS.java,
      },
    ];
  }

  if (has('build.gradle') || has('build.gradle.kts')) {
    const wrapper = has(process.platform === 'win32' ? 'gradlew.bat' : 'gradlew');
    const gradle = wrapper ? (process.platform === 'win32' ? '.\\gradlew.bat' : './gradlew') : 'gradle';
    return [
      {
        name: `Backend (Gradle) — ${label}`,
        language: 'java',
        framework: 'Gradle',
        role: 'backend',
        cwd: dir,
        installCommands: [`${gradle} build -x test`],
        launchCommand: `${gradle} bootRun`,
        order: 2,
        readyPatterns: ['Started .* in .* seconds', 'Tomcat started on port'],
        requiredTool: TOOLS.java,
      },
    ];
  }

  return [];
}

function readFileContains(file: string, needle: string): boolean {
  try {
    return fs.readFileSync(file, 'utf8').includes(needle);
  } catch {
    return false;
  }
}
