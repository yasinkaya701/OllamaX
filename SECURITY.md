# Security Policy

Krevyx is a local-first desktop application, but its trust boundary can expand when cloud providers, MCP servers, plugins, browser tooling, or external commands are enabled.

## Reporting a vulnerability

Please do not publish exploit details, credentials, or sensitive logs in a public issue. Use GitHub's private vulnerability reporting feature for this repository when available. If private reporting is unavailable, contact the maintainer through the GitHub profile before sharing sensitive details.

Include the affected version, operating system, reproduction steps, impact, and any suggested mitigation you have already tested.

## Supported versions

Security fixes are applied to the latest release line. Older releases may not receive backports.

## Scope

Reports about credential handling, Electron isolation, IPC boundaries, network-mode bypasses, unsafe command execution, plugin or MCP privilege escalation, and unintended local-data exposure are especially useful.
