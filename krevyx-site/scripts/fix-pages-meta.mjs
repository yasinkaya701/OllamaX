// Post-process for GitHub Pages builds: point canonical/og/twitter URLs at the Pages host
import fs from "node:fs";
import path from "node:path";

const file = path.resolve(import.meta.dirname, "../dist/public/index.html");
const PAGES_URL = process.env.PAGES_URL || "https://yasinkaya701.github.io/OllamaX";

let html = fs.readFileSync(file, "utf-8");
html = html.replaceAll("https://krevyx.manus.space", PAGES_URL);
fs.writeFileSync(file, html);
console.log(`Meta URLs rewritten to ${PAGES_URL}`);
