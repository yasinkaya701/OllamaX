import http.server
import json
import subprocess

class StatsHandler(http.server.BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'X-Requested-With, Content-Type')
        self.end_headers()

    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        
        try:
            vm = subprocess.check_output(['vm_stat']).decode('utf-8')
            lines = vm.split('\n')
            stats = {}
            for line in lines[1:-1]:
                if ':' not in line: continue
                parts = line.split(':')
                stats[parts[0].strip()] = int(parts[1].strip().replace('.', ''))
            
            page_size = 16384
            free = stats.get('Pages free', 0) * page_size
            active = stats.get('Pages active', 0) * page_size
            wired = stats.get('Pages wired down', 0) * page_size
            
            used_gb = (active + wired) / (1024**3)
            total_gb = (52 * 1024**3) / (1024**3) # Hardcoded total based on earlier finding
            
            response = {
                "used": f"{used_gb:.1f}",
                "total": f"{total_gb:.0f}",
                "percent": f"{(used_gb/total_gb)*100:.0f}"
            }
        except Exception as e:
            response = {"error": str(e)}
            
        self.wfile.write(json.dumps(response).encode())

if __name__ == '__main__':
    print("Stats server running on port 8081...")
    http.server.HTTPServer(('localhost', 8081), StatsHandler).serve_forever()
