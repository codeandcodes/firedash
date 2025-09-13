# Repository Guidelines

## Project Structure & Module Organization
- Keep code in `src/`; tests in `tests/`; scripts in `scripts/`; docs in `docs/`.
- Example layout:
```
/ src/            # application code
/ tests/          # mirrors src/ paths
/ scripts/        # dev/build utilities
/ .github/workflows/  # CI
/ docs/           # architecture, ADRs, runbooks
```

## Build, Test, and Development Commands
- Use Makefile shims for consistency. Add targets if missing:
  - `make setup` — install toolchains and dependencies.
  - `make run` — start the app locally (watch mode if supported).
  - `make test` — run the test suite (unit + smoke).
  - `make lint` — static checks (format, lint, typecheck if configured).
  - `make fmt` — auto-format sources.
  - `make ci` — deterministic CI pipeline (lint, test, build).
- Under the hood, call language-appropriate tools (e.g., `pytest`, `npm test`, `go test`). Keep targets fast and reproducible.

## Coding Style & Naming Conventions
- Prefer automated formatters; do not fight them. Examples: `black`/`ruff` (Python), `prettier`/`eslint` (JS/TS), `gofmt` (Go).
- Indentation and line width follow the formatter defaults.
- Naming:
  - Files and dirs: lowercase with hyphens or underscores (e.g., `data-loader/`, `utils_io.py`).
  - Public APIs: clear, explicit names; avoid abbreviations.
  - Secrets/config live in `.env` (ignored); provide `.env.example`.

## Testing Guidelines
- Place tests in `tests/` mirroring `src/` (e.g., `src/service/user.py` → `tests/service/test_user.py`).
- Aim for fast, deterministic tests; prefer pure unit tests with mocks over hitting networks.
- Target ≥80% branch coverage for changed code. Add regression tests with bug fixes.
- Example: `make test` and optional `make test REPORT=html` for local coverage reports.

## Commit & Pull Request Guidelines
- Use Conventional Commits: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`. Scope optional (e.g., `feat(api): ...`).
- Keep commits small and logically isolated; include rationale in the body when needed.
- PRs must include: clear description, linked issues, screenshots/logs for UX or CLI changes, and test coverage for new behavior.

## Agent-Specific Instructions
- Obey this AGENTS.md across the tree. Minimize changes; avoid unrelated edits.
- Do not add licenses. Do not use one-letter variable names. Update docs when behavior changes.
- Prefer small, focused patches and maintainers can iterate quickly.
