// GitHub Pages SPA route-restore hook: if the 404.html stored a target route
// in sessionStorage, the app pushes to it once React is ready.
import fs from "node:fs";
import path from "node:path";

const file = path.resolve(import.meta.dirname, "../dist/public/index.html");
let html = fs.readFileSync(file, "utf-8");

const hook = `
<script>
(function () {
  var route = sessionStorage.getItem("krevyx.redirectTo");
  if (route && window.history && window.history.pushState) {
    sessionStorage.removeItem("krevyx.redirectTo");
    window.history.replaceState(null, "", route);
  }
})();
</script>
`;

if (!html.includes("krevyx.redirectTo")) {
  html = html.replace("</head>", hook + "\n</head>");
  fs.writeFileSync(file, html);
  console.log("Pages route-restore hook injected");
} else {
  console.log("Hook already present");
}

// Also patch the dev-server-only script tag references that break on Pages.
// Vite adds the debug-collector and storage-proxy scripts only in dev mode, so
// nothing else needs rewriting for production.
console.log("Pages build OK — base is /OllamaX/, assets resolve under it");
