import os, json, urllib.request, subprocess, base64

tok = os.environ["GITHUB_TOKEN"]
h = {"Authorization": f"Bearer {tok}", "Accept": "application/vnd.github+json",
     "X-GitHub-Api-Version": "2022-11-28"}

def get(url):
    req = urllib.request.Request(url, headers=h)
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())

run_id = "31922504638"
jobs = get(f"https://api.github.com/repos/yasinkaya701/OllamaX/actions/runs/{run_id}/jobs?per_page=20")["jobs"]
job = [j for j in jobs if "linux" in j["name"]][0]

# logs_url gives text/plain
req = urllib.request.Request(job["logs_url"], headers=h)
with urllib.request.urlopen(req) as r:
    data = r.read()
open("/tmp/job_linux.log", "wb").write(data)
print("downloaded", len(data), "bytes for", job["id"])
