import json
import subprocess
import os

tok = os.environ['GITHUB_TOKEN']
h = {'Authorization': f'Bearer {tok}', 'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28'}

def get(url):
    return json.loads(subprocess.run(['curl', '-s', '-H', h['Authorization'], '-H', h['Accept'], url], capture_output=True, text=True).stdout)

base = 'https://api.github.com/repos/yasinkaya701/OllamaX/releases/tags/v3.17.0'
d = get(base)
assets_base = base.replace('releases/tags/v3.17.0', 'releases/assets')
for a in d.get('assets', []):
    n = a['name']
    new = n.replace('3.16.4', '3.17.0')
    r = subprocess.run(['curl', '-s', '-X', 'PATCH',
                        '-H', h['Authorization'], '-H', h['Accept'],
                        f'{assets_base}/{a["id"]}',
                        '-d', json.dumps({'name': new})],
                       capture_output=True, text=True)
    ok = '"name"' in r.stdout
    print(n, '->', new, '|', 'OK' if ok else r.stdout[:200])
