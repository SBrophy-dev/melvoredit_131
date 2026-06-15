# Tiny static file server for local preview that disables caching, so edits to
# main.js / main.css / melvor-save.js are always picked up on reload.
# Usage: python tools/serve.py [port]
import http.server
import socketserver
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8123


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()


with socketserver.TCPServer(("", PORT), NoCacheHandler) as httpd:
    print("Serving melvoredit on http://localhost:%d (no-cache)" % PORT)
    httpd.serve_forever()
