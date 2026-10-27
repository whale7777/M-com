"""테스트용 가짜 Supabase (권한 RPC + 스토리지). 실제 Supabase 없이 server.py 를 시험해요."""
import hashlib, json, sys
from pathlib import Path
from flask import Flask, request, jsonify, Response

ROOT = Path(sys.argv[1])            # <ROOT>/<fid>/main.json, <ROOT>/<fid>/img/...
app = Flask(__name__)

@app.post("/rest/v1/rpc/<name>")
def rpc(name):
    tok = request.headers.get("Authorization", "").replace("Bearer ", "")
    if name == "mh_is_admin":
        return jsonify(tok == "admin-token")
    if name == "mh_can_read_object":
        return jsonify(tok in ("buyer-token", "admin-token"))
    return jsonify(None), 404

@app.get("/storage/v1/object/info/mh-files/<path:p>")
def info(p):
    f = ROOT / p
    if not f.exists():
        return jsonify({"error": "nf"}), 404
    b = f.read_bytes()
    return jsonify({"name": p, "size": len(b), "etag": hashlib.md5(b).hexdigest(), "lastModified": "x"})

@app.get("/storage/v1/object/mh-files/<path:p>")
def get(p):
    f = ROOT / p
    if not f.exists():
        return jsonify({"error": "nf"}), 404
    return Response(f.read_bytes())

app.run(port=9001)
