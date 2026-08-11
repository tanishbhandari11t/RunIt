# RunIt

**From Code to Running Application — One Command.**

RunIt is a VS Code extension that turns any cloned repository into a running application. It analyzes the codebase, detects languages and frameworks, checks your machine for required tools, installs dependencies, launches every service in the correct order, monitors output, and generates an intelligent failure report when something breaks.

Instead of remembering `npm run dev`, `python main.py`, `mvn spring-boot:run`, `go run .`, `cargo run`, or `docker compose up` — you run one command.

## Usage

1. Open any project folder in VS Code.
2. Press `Ctrl+Shift+P`, type **Launch Project**, and hit Enter — or just click the **🚀 Launch Project** button in the status bar.
3. Watch the services come up. A status bar item shows how many are running.

Commands:

| Command | What it does |
| --- | --- |
| `Launch Project` | Scan, install, and start everything (also the 🚀 status bar button) |
| `Show Launch Plan` | Preview what RunIt detected and the startup order, without running anything |
| `Stop All Services` | Kill all managed processes (also available by clicking the running-count status bar item) |
| `Install 'launch-project' Terminal Command` | One-time setup so typing `launch-project` (or `runit`) in a terminal triggers a launch |

### Launching from the terminal

Run **Install 'launch-project' Terminal Command** once from the command palette. It adds a `launch-project` command (with a shorter `runit` alias) to your shell profile (PowerShell `$PROFILE` on Windows, `.bashrc`/`.zshrc` elsewhere). Open a new terminal and type:

```bash
launch-project
```

The command sends a `vscode://tanishbhandari24.runit/launch` deep link to VS Code, which triggers RunIt in the active window. When a service prints its dev-server URL (e.g. `http://localhost:5173`), RunIt highlights it in the output and shows an **Open in Browser** notification.

## What happens when you launch

1. **Project analysis** — the workspace root and each top-level folder are scanned for `package.json`, `requirements.txt`, `pyproject.toml`, `manage.py`, `pom.xml`, `build.gradle`, `go.mod`, `Cargo.toml`, and Docker Compose files. Frameworks (React, Next.js, Express, FastAPI, Flask, Django, Streamlit, Spring Boot, …) are identified from dependencies and file layout.
2. **Environment detection** — RunIt probes the machine for the tools each service needs (Node, Python, Java, Go, Rust, Docker) and refuses to launch with a clear install hint if one is missing.
3. **Dependency installation** — `npm install`, `pip install -r requirements.txt`, `mvn install`, `go mod download`, `cargo build`, as appropriate.
4. **Launch planning** — services are ordered so dependencies start first: Docker/infra → backend → frontend.
5. **Execution and monitoring** — each service runs as a managed process with its own output channel. RunIt watches the logs for ready signals (e.g. `Uvicorn running`, `localhost:3000`) before starting the next service.
6. **Failure intelligence** — if an install or launch fails, RunIt writes `RunIt_Report.md` into the project with the failed component, exit code, a diagnosed reason, a concrete fix, and the captured error log — then opens it automatically.

## Supported technologies (Phase 1)

| Language | Detection | Install | Launch |
| --- | --- | --- | --- |
| JavaScript/TypeScript | `package.json` (Express, JWT, Next.js, etc.) | `npm install` | `npm run dev` / `npm start` / entry file |
| JavaScript (Tests) | `jest` in `package.json` | `npm install` | `npm run test -- --watchAll` or `npx jest` |
| Python | `requirements.txt`, `manage.py`, `main.py` | Auto creates `.venv` & installs deps | framework-aware (FastAPI, Flask, Django, Streamlit) inside `.venv` |
| Java | `pom.xml`, `build.gradle` | `mvn install` / `gradlew build` | `mvn spring-boot:run` / `gradlew bootRun` |
| Go | `go.mod` | `go mod download` | `go run .` |
| Rust | `Cargo.toml` | `cargo build` | `cargo run` |
| Docker | `docker-compose.yml`, `compose.yaml` | — | `docker compose up --build` or fallback to `docker-compose` |

## Architecture

```
                 VS Code
                    |
              RunIt Extension (extension.ts)
                    |
     ------------------------------------
     |                                  |
 Project Intelligence              Run Engine
     |                                  |
 scanner.ts   — file scan,         runner.ts  — process manager,
                language +                      output capture,
                framework                       ready detection,
                detection,                      stop/restart
                command discovery
 planner.ts   — launch ordering    environment.ts — tool checks
                    |
              report.ts — error rules + RunIt_Report.md
```

## Development

```bash
npm install
npm run compile     # or: npm run watch
```

Press `F5` in VS Code to launch an Extension Development Host with RunIt loaded, then open any project in that window and run **Launch Project** (or click the 🚀 status bar button).

## Roadmap

- **Phase 1 (this repo):** detection, dependency install, ordered launch, monitoring, rule-based failure reports.
- **Phase 2:** health checks against ports/URLs, per-service restart, `.runit.json` overrides.
- **Phase 3:** AI-powered error explanations and fix suggestions (Gemini / OpenAI / Claude) for failures the rule engine can't diagnose.
- **Phase 4:** Marketplace publishing, docs, demo videos.
