# Contributing to Krevyx

Thank you for your interest in contributing to **Krevyx** — an open-source, local-first AI Agent Studio. Every contribution, from a typo fix in the documentation to a new orchestration feature, is welcome.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [What We Accept](#what-we-accept)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Coding Conventions](#coding-conventions)
- [Commit & Pull Request Guidelines](#commit--pull-request-guidelines)
- [Releases](#releases)
- [Questions?](#questions)

## Code of Conduct

Krevyx is an open-source project maintained in the spirit of respectful collaboration. Be constructive in reviews, inclusive in discussions, and patient with newcomers. Harassment, discrimination, or any behavior that makes contributors feel unwelcome will not be tolerated.

## What We Accept

We gladly accept contributions in the following areas:

| Area | Examples |
| --- | --- |
| Bug fixes | Crash reports, incorrect behavior, broken integrations |
| New features | Agent profiles, orchestration improvements, new AI providers |
| Documentation | Typos, clarifications, new guides, translations (TR/EN) |
| Security | Reporting vulnerabilities privately (see Security page on the website) |

For large architectural changes, please open an **issue** first so we can discuss the approach before you invest time.

## Development Setup

Krevyx is an [Electron](https://www.electronjs.org/) application.

**Requirements:** Node.js 20+ and pnpm 11+.

1. **Clone the repository**

   ```bash
   git clone https://github.com/yasinkaya701/OllamaX.git
   cd OllamaX
   ```

2. **Install dependencies** (native modules like `keytar` and `node-pty` are built automatically)

   ```bash
   pnpm install
   ```

3. **Start the development server**

   ```bash
   pnpm dev
   ```

   This launches the app in watch mode; changes to the renderer hot-reload instantly.

4. **Run checks before committing**

   ```bash
   pnpm lint        # ESLint
   pnpm check       # TypeScript
   pnpm test        # unit tests
   ```

### Building a package

```bash
pnpm build            # production build
pnpm package          # platform-specific package (Windows/macOS/Linux)
```

## Project Structure

```
OllamaX/
├── src/
│   ├── main/           # Electron main process
│   │   ├── agents/     # Agent definitions, orchestration, prompt forwarding
│   │   ├── cost/       # Budget engine and token cost tracking
│   │   ├── secrets/    # Secrets Vault (OS keychain via keytar)
│   │   └── composer/   # Composer mode logic
│   └── renderer/       # React UI
├── .github/workflows/  # CI/CD release pipelines (auto build on git tags)
└── package.json        # Scripts and dependencies
```

## Coding Conventions

- **Language:** JavaScript (main process), TypeScript (renderer where available).
- **Styling:** Tailwind CSS with CSS variables defined in design tokens; no hard-coded colors.
- **Formatting:** Follow the existing Prettier/ESLint configuration (`pnpm lint` must pass).
- **Localization:** UI strings live in the i18n dictionary; always add both TR and EN entries.
- **Security:** API keys and secrets must **never** be stored in plain config files — use the Secrets Vault APIs.
- **Air-Gapped mode:** network calls from the main process must respect the configured network mode.
- **Electron security:** never enable `nodeIntegration` in the renderer; new IPC channels must be whitelisted in `preload.js`.

## Commit & Pull Request Guidelines

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add head-agent selection to orchestration chains
fix: resolve token cost rounding in budget engine
docs: update installation steps for Ubuntu 24.04
refactor: extract cost engine into dedicated module
```

Pull requests:

1. Fork the repo and create a feature branch (`feat/my-improvement`).
2. Describe **what** changed and **why** in the PR body; link the related issue.
3. Keep PRs focused — one concern per PR.
4. Make sure `pnpm lint`, `pnpm check`, and tests pass.
5. A maintainer will review, possibly request changes, and squash-merge when approved.

## Releases

Releases are automated: pushing a git tag matching `v*` triggers the GitHub Actions pipeline, which builds Windows (`.exe`), macOS (`.dmg`) and Linux (`.AppImage`) packages and attaches them to the GitHub Release. Release notes should mention security fixes, new features, and breaking changes.

## Questions?

For questions, open a [GitHub issue](https://github.com/yasinkaya701/OllamaX/issues) or use the feedback form on the [Krevyx website](https://ollamaxai-ejl2x4gm.manus.space).

Thank you for helping make Krevyx better!
