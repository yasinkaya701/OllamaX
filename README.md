# ⬡ OllamaX Ultra Pro — AI Agent Studio

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
![Version](https://img.shields.io/badge/version-2.5.0-purple.svg)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS-brightgreen.svg)

> **The ultimate bridge between local LLM power and high-end cloud intelligence.**

OllamaX Ultra Pro is a high-fidelity, professional AI orchestration studio designed to run on your desktop. It seamlessly integrates local models via **Ollama** with industry-leading cloud APIs like **OpenAI**, **Anthropic**, and **Google Gemini**, allowing you to build, manage, and delegate tasks to a sophisticated network of AI agents.

---

## 🌟 Key Features

### 🤖 Multi-Model Orchestration
*   **Local Power:** Full integration with Ollama for private, offline inference.
*   **Cloud Giants:** Native support for GPT-4o, Claude 3.5 Sonnet, and Gemini 1.5 Pro.
*   **Hot-Swappable:** Switch between providers and models in real-time via the top bar.

### ⭐ Agentic Workflow (The "Lead Agent" System)
*   **Orchestration Logic:** Assign agents as "Lead" (Orchestrator) or "Sub" agents.
*   **Smart Delegation:** Lead agents can automatically delegate tasks to sub-agents using the `//CALL:AgentName` syntax.
*   **Context Awareness:** Lead agents are automatically aware of all other active agents in the workspace.

### 📁 Integrated Workspace & GitHub
*   **One-Click Clone:** Search and clone GitHub repositories directly from the app.
*   **Project Workspace:** Manage all your cloned projects in a dedicated sidebar section.
*   **File Explorer:** Full access to your local file system to read, write, and analyze code.

### 💎 Premium Interface
*   **Glassmorphism Design:** A modern, dark-themed professional UI.
*   **Hardware Telemetry:** Real-time monitoring of RAM and CPU usage.
*   **System Console:** Live logs of all internal operations and terminal outputs.

---

## 🚀 Installation

### Prerequisites
*   [Node.js](https://nodejs.org/) (v18 or higher recommended)
*   [Ollama](https://ollama.com/) (Optional, but recommended for local models)
*   [Git](https://git-scm.com/)

### Step 1: Clone the Repository
```bash
git clone https://github.com/yasinkaya701/OllamaX-Ultra-Pro.git
cd OllamaX-Ultra-Pro
```

### Step 2: Install Dependencies
```bash
npm install
```

### Step 3: Launch the Studio
```bash
npm start
```

---

## 🪟 Windows Setup Guide
This application is fully cross-platform. To run it on Windows:
1.  Ensure you have **Node.js** installed.
2.  Open **Command Prompt** or **PowerShell** in the project folder.
3.  Run `npm install` and then `npm start`.
4.  The app uses `wmic` for hardware stats and `cmd` for shell operations automatically.

---

## 🔑 Configuration

### API Keys
Navigate to **Tools > APIs** (Right Sidebar) to enter your keys:
*   **OpenAI:** `sk-...`
*   **Anthropic:** `sk-ant-...`
*   **Gemini:** `AIza...`
*   *Note: Keys are stored locally in your browser state and are never sent to our servers.*

### Local Models
*   Ensure the Ollama desktop app is running.
*   The default host is `localhost:11434`.
*   Go to **Tools > Models** to pull new models (e.g., `llama3.2:1b`).

---

## 🛠 Advanced Usage: Delegation
To make agents work together:
1.  Create a **Lead Agent** (use the "Orchestrator" prompt template).
2.  Create one or more **Sub Agents** (e.g., "Code Expert", "Researcher").
3.  Ask the Lead Agent: *"Write a script and have the Code Expert review it."*
4.  The Lead Agent will produce: `//CALL:Code Expert review this script...`
5.  OllamaX will automatically trigger the Sub Agent and display the results.

---

## 📜 License
Distributed under the MIT License. See `LICENSE` for more information.

---

**Developed with ❤️ by Yasin Kaya**
*Industrial AI Solutions for the Modern Developer.*
