import json
import subprocess
import os

tok = os.environ['GITHUB_TOKEN']
h = {'Authorization': f'Bearer {tok}', 'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28'}

base = 'https://api.github.com/repos/yasinkaya701/OllamaX/releases/tags/v3.17.0'
d = json.loads(subprocess.run(['curl', '-s', '-H', h['Authorization'], '-H', h['Accept'], base], capture_output=True, text=True).stdout)
for a in d.get('assets', []):
    if '3.16.4' in a['name']:
        r = subprocess.run(['curl', '-s', '-o', '/dev/null', '-w', '%{http_code}', '-X', 'DELETE',
                            '-H', h['Authorization'], '-H', h['Accept'],
                            f"https://api.github.com/repos/yasinkaya701/OllamaX/releases/assets/{a['id']}"],
                           capture_output=True, text=True)
        print('delete', a['name'], '->', r.stdout)
    else:
        print('keep', a['name'])
