# Troubleshooting

## Blank window or “Blocked send” errors

- Ensure you run `npm start` from the project root (uses `src/main.js`).
- If you changed preload channels, whitelist them in `src/preload.js`.

## Ollama “No models”

- Confirm Ollama is running: `ollama list`
- Check **Settings → Ollama Host** (default `localhost:11434`).

## Cloud models list empty (OpenAI / Gemini)

- Save API keys under **Tools → APIs**, then click **↻ API** next to the model dropdown.
- Verify outbound HTTPS is allowed (corporate proxy may block `api.openai.com` / Google APIs).

## Delegation not firing

- Lead agent output must use: `//CALL:ExactAgentName task text`
- Sub-agent **name** must match an agent card name (case-insensitive).

## macOS Gatekeeper / unsigned build

- For local builds from source, right-click the app → Open (first launch), or allow in **Privacy & Security**.

## CSP / CDN scripts offline

- Highlight.js and DOMPurify load from jsDelivr; without network, code blocks still render as escaped text after restart with connectivity.
