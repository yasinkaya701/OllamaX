import os, json, urllib.request

tok = os.environ["GITHUB_TOKEN"]
h = {"Authorization": f"Bearer {tok}", "Accept": "application/vnd.github+json"}

def get(url):
    req = urllib.request.Request(url, headers=h)
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())

run_id = "31922767346"
jobs = get(f"https://api.github.com/repos/yasinkaya701/OllamaX/actions/runs/{run_id}/jobs?per_page=20")["jobs"]
for j in jobs:
    print(j["id"], j["name"], j["status"], j.get("conclusion"))
    if j.get("conclusion") == "failure":
        req = urllib.request.Request(j["logs_url"], headers=h)
        with urllib.request.urlopen(req) as r:
            open(f"/tmp/job_{j['id']}.log", "wb").write(r.read())
        print("saved", j["id"])
