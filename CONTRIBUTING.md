# Contributing to Krevyx

Thanks for contributing. Keep changes focused and make the validation path clear.

## Setup

Krevyx uses Node.js 22+, pnpm 11+, and Electron.

```bash
git clone https://github.com/yasinkaya701/OllamaX.git
cd OllamaX
corepack enable
corepack prepare pnpm@11 --activate
pnpm install --frozen-lockfile
pnpm start
```

## Before opening a pull request

```bash
pnpm run lint
pnpm test
pnpm run test:ci
pnpm run audit:verify
```

For packaging changes, run the platform build that applies: `pnpm run build:win`, `pnpm run build:mac`, or `pnpm run build:linux`.

## Project layout

```text
src/        Electron main process, preload bridge, renderer, shared modules
bin/        headless CLI
tests/      Jest and integration tests
scripts/    development and verification utilities
docs/       architecture, setup, deployment, and feature docs
```

## Guidelines

- Keep pull requests limited to one concern.
- Add or update tests for behavior changes.
- Update documentation for user-visible changes.
- Keep privileged Electron operations in the main process and expose deliberate preload APIs.
- Do not add secrets or private user data to the repository.
- Explain what changed, why, how it was validated, and any known limitations.

Conventional Commit-style messages are preferred, such as `feat: add provider health status`, `fix: prevent duplicate tasks`, or `docs: clarify setup`.

For vulnerability reports, follow [`SECURITY.md`](SECURITY.md).
