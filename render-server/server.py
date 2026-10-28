#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
민혁닷컴 PDF 변환 서버

  브라우저(민혁닷컴)  ──(로그인 토큰)──▶  이 서버  ──▶  Supabase(권한 확인 · 스토리지에서 JSON/이미지 읽기)
                                          │
                                          └─ Chromium 으로 A4 PDF 를 만들어 돌려줌 (같은 내용은 캐시)

  GET  /health
  GET  /pdf/<자료id>?kind=main|solution|all     문제 / 해설 / 문제+해설 PDF
  POST /validate                                 (관리자) JSON 검사만
  GET  /stats                                    (관리자) 변환 캐시 용량

권한은 이 서버가 판단하지 않고, 사이트가 이미 쓰는 Supabase 함수 mh_can_read_object() 에
"사용자의 로그인 토큰 그대로" 물어봐서 결정해요. (= 포인트 구매 · M패스 · 관리자 규칙이 그대로 적용)
"""
from __future__ import annotations

import hashlib
import hmac
import json
import os
import queue
import re
import shutil
import sys
import tempfile
import threading
import time
import uuid
from collections import defaultdict, deque
from concurrent.futures import Future
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import quote

import requests
from flask import Flask, Response, jsonify, request

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE / "renderer"))
import make_pdf as R  # noqa: E402
import secure_pdf  # noqa: E402

# --------------------------------------------------------------------------
# 설정 (환경변수)
# --------------------------------------------------------------------------
SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
ANON_KEY = os.environ.get("SUPABASE_ANON_KEY", "")
SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")          # 서버에만! 사이트(config.js)에는 절대 넣지 마세요
BUCKET = os.environ.get("MHQ_BUCKET", "mh-files")
ORIGINS = [o.strip().rstrip("/") for o in os.environ.get("ALLOWED_ORIGINS", "").split(",") if o.strip()]
CACHE_DIR = Path(os.environ.get("CACHE_DIR", str(HERE / "cache")))
CACHE_MAX_MB = float(os.environ.get("CACHE_MAX_MB", "300"))
MAX_JSON_KB = int(os.environ.get("MAX_JSON_KB", "1024"))
MAX_ASSET_MB = float(os.environ.get("MAX_ASSET_MB", "3"))
MAX_QUEUE = int(os.environ.get("MAX_QUEUE", "6"))
RENDER_TIMEOUT_S = int(os.environ.get("RENDER_TIMEOUT_S", "90"))
RENDERER_VERSION = "mhq1-r1"                                   # 렌더러/디자인을 바꾸면 올려서 캐시를 무효화
PROTECT = os.environ.get("PDF_PROTECT", "1").strip() != "0"            # 받는 사람 워터마크 + 복사·수정 차단 (기본 켜짐)
ALLOW_PRINT = os.environ.get("PDF_ALLOW_PRINT", "1").strip() != "0"    # 인쇄 허용 (기본 허용, 0 이면 인쇄도 막아요)
WATERMARK = os.environ.get("PDF_WATERMARK", "0").strip() == "1"        # 눈에 보이는 워터마크 (기본 꺼짐, 1 이면 켬)
RATE_PER_10MIN = int(os.environ.get("PDF_RATE_PER_10MIN", "40"))       # 한 사람이 10분에 받을 수 있는 PDF 수 (0 이면 제한 없음)
KST = timezone(timedelta(hours=9))

UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 4 * 1024 * 1024
CACHE_DIR.mkdir(parents=True, exist_ok=True)


class HttpError(Exception):
    def __init__(self, status: int, msg: str, **extra):
        super().__init__(msg)
        self.status, self.msg, self.extra = status, msg, extra


# --------------------------------------------------------------------------
# CORS (민혁닷컴 주소에서 온 요청만)
# --------------------------------------------------------------------------
@app.after_request
def _cors(resp: Response):
    origin = request.headers.get("Origin", "").rstrip("/")
    if origin and (origin in ORIGINS or "*" in ORIGINS):
        resp.headers["Access-Control-Allow-Origin"] = origin
        resp.headers["Vary"] = "Origin"
        resp.headers["Access-Control-Allow-Headers"] = "Authorization, Content-Type"
        resp.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
        resp.headers["Access-Control-Expose-Headers"] = "Content-Disposition, X-MHQ-Pages, X-MHQ-Cache"
    return resp


@app.errorhandler(HttpError)
def _http_error(e: HttpError):
    return jsonify({"error": e.msg, **e.extra}), e.status


@app.route("/pdf/<fid>", methods=["OPTIONS"])
@app.route("/validate", methods=["OPTIONS"])
@app.route("/stats", methods=["OPTIONS"])
def _preflight(**_):
    return ("", 204)


# --------------------------------------------------------------------------
# Supabase 호출
# --------------------------------------------------------------------------
def _bearer() -> str:
    h = request.headers.get("Authorization", "")
    return h[7:].strip() if h.lower().startswith("bearer ") else ""


def _sb_rpc(name: str, args: dict, token: str):
    r = requests.post(
        f"{SUPABASE_URL}/rest/v1/rpc/{name}",
        headers={"apikey": ANON_KEY, "Authorization": f"Bearer {token or ANON_KEY}", "Content-Type": "application/json"},
        data=json.dumps(args), timeout=15,
    )
    if r.status_code == 401:
        raise HttpError(401, "로그인이 만료됐어요. 다시 로그인해 주세요.")
    if r.status_code >= 400:
        raise HttpError(502, f"권한 확인에 실패했어요 ({r.status_code}).")
    return r.json()


def _service_headers():
    # 새 방식 비밀 키(sb_secret_...)는 JWT 가 아니라서 apikey 헤더로만 보내요. 예전 service_role(eyJ...)은 둘 다.
    if SERVICE_KEY.startswith("sb_"):
        return {"apikey": SERVICE_KEY}
    return {"apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}"}


def _obj_info(path: str):
    r = requests.get(f"{SUPABASE_URL}/storage/v1/object/info/{BUCKET}/{quote(path)}", headers=_service_headers(), timeout=15)
    if r.status_code == 404:
        return None
    if r.status_code >= 400:
        raise HttpError(502, f"스토리지 조회에 실패했어요 ({r.status_code}).")
    return r.json()


def _obj_get(path: str, max_bytes: int) -> bytes:
    with requests.get(f"{SUPABASE_URL}/storage/v1/object/{BUCKET}/{quote(path)}", headers=_service_headers(), timeout=30, stream=True) as r:
        if r.status_code == 404:
            raise HttpError(404, f"파일이 없어요: {path.split('/', 1)[-1]}")
        if r.status_code >= 400:
            raise HttpError(502, f"스토리지에서 읽지 못했어요 ({r.status_code}).")
        buf = bytearray()
        for chunk in r.iter_content(65536):
            buf += chunk
            if len(buf) > max_bytes:
                raise HttpError(413, f"파일이 너무 커요: {path.split('/', 1)[-1]}")
        return bytes(buf)


# --------------------------------------------------------------------------
# 다운로드 권한 · 받는 사람 확인 · 요청 횟수 제한 · PDF 보호
# --------------------------------------------------------------------------
def _can_download(fid: str, kind: str, token: str) -> bool:
    """schema_v13 의 mh_can_download 가 있으면 그걸로, 아직 없으면 예전 함수(mh_can_read_object)로 물어봐요."""
    try:
        return _sb_rpc("mh_can_download", {"p_file": fid, "p_kind": kind}, token) is True
    except HttpError as e:
        if e.status != 502:
            raise
        return _sb_rpc("mh_can_read_object", {"p_name": f"{fid}/{kind}.json"}, token) is True


def _auth_user(token: str) -> dict | None:
    if not token:
        return None
    try:
        r = requests.get(f"{SUPABASE_URL}/auth/v1/user", headers={"apikey": ANON_KEY, "Authorization": f"Bearer {token}"}, timeout=10)
        return r.json() if r.status_code == 200 else None
    except (requests.RequestException, ValueError):
        return None


def _is_staff(token: str) -> bool:
    """관리자 · 콘텐츠 직원은 원본 그대로 받아요. 확인이 실패하면 '직원 아님'으로 봐서 보호를 걸어요."""
    if not token:
        return False
    for name, args in (("mh_is_admin", {}), ("staff_can", {"p_perm": "content"})):
        try:
            if _sb_rpc(name, args, token) is True:
                return True
        except HttpError:
            pass
    return False


_rate_lock = threading.Lock()
_rate_hits: "defaultdict[str, deque]" = defaultdict(deque)


def _rate_check(key: str):
    if RATE_PER_10MIN <= 0:
        return
    now = time.time()
    with _rate_lock:
        q = _rate_hits[key]
        while q and now - q[0] > 600:
            q.popleft()
        if len(q) >= RATE_PER_10MIN:
            wait_min = max(int((600 - (now - q[0])) // 60) + 1, 1)
            raise HttpError(429, f"PDF 를 너무 자주 받고 있어요. {wait_min}분 뒤에 다시 해 주세요.")
        q.append(now)
        if len(_rate_hits) > 5000:                      # 메모리 정리
            for k in [k for k, v in _rate_hits.items() if not v or now - v[-1] > 600]:
                _rate_hits.pop(k, None)


def _protect(body: bytes, fid: str, user: dict | None, meta_title: str) -> bytes:
    """받는 사람 이름 + 날짜 워터마크, 복사·수정 차단. 실패하면 보호 안 된 PDF 를 내보내지 않고 오류로 멈춰요."""
    uid = str((user or {}).get("id") or "anon")
    meta = (user or {}).get("user_metadata") or {}
    name = str(meta.get("username") or str((user or {}).get("email") or "").split("@")[0] or "민혁닷컴 무료자료")
    code = hmac.new(SERVICE_KEY.encode(), f"{uid}:{fid}".encode(), "sha256").hexdigest()[:8]   # 유출됐을 때 누구 건지 확인용
    day = datetime.now(KST).strftime("%Y-%m-%d")
    try:
        return secure_pdf.protect(
            body, label=f"{name} · {day}", footer=f"{name} · {day} · ID {code} · 민혁닷컴",
            title=meta_title or "민혁닷컴 문제지", allow_print=ALLOW_PRINT, code=code,
            watermark=WATERMARK,
        )
    except Exception:  # noqa: BLE001
        app.logger.exception("pdf protect failed")
        raise HttpError(500, "PDF 보호 처리 중 오류가 났어요. 관리자에게 알려 주세요.")


# --------------------------------------------------------------------------
# 렌더 작업자 (Playwright 는 만든 스레드에서만 쓸 수 있어서 전용 스레드 1개로 처리)
# --------------------------------------------------------------------------
class Worker(threading.Thread):
    def __init__(self):
        super().__init__(daemon=True)
        self.q: "queue.Queue[tuple]" = queue.Queue(maxsize=MAX_QUEUE)
        self.pw = self.browser = None
        self.start()

    def submit(self, html_path: Path, pdf_path: Path) -> Future:
        fut: Future = Future()
        try:
            self.q.put_nowait((html_path, pdf_path, fut))
        except queue.Full:
            raise HttpError(503, "지금 변환 요청이 많아요. 잠시 뒤에 다시 눌러 주세요.")
        return fut

    def _launch(self):
        from playwright.sync_api import sync_playwright
        if self.pw is None:
            self.pw = sync_playwright().start()
        args = ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"]
        last = None
        for ch in (None, "chrome", "msedge"):
            try:
                self.browser = self.pw.chromium.launch(args=args, **({"channel": ch} if ch else {}))
                return
            except Exception as e:  # noqa: BLE001
                last = e
        raise RuntimeError(f"브라우저를 실행하지 못했어요: {last}")

    def _render(self, html_path: Path, pdf_path: Path):
        if self.browser is None or not self.browser.is_connected():
            self._launch()
        ctx = self.browser.new_context(java_script_enabled=True, accept_downloads=False)
        try:
            page = ctx.new_page()
            # 외부 인터넷·임의 파일 접근 차단 (file:// 은 임시 폴더의 문서/이미지용)
            page.route("**/*", lambda r: r.continue_() if r.request.url.startswith(("file://", "data:", "about:")) else r.abort())
            page.emulate_media(media="print")
            page.goto(html_path.as_uri())
            page.wait_for_function("window.__done === true", timeout=RENDER_TIMEOUT_S * 1000)
            report = page.evaluate("window.__report")
            page.pdf(path=str(pdf_path), prefer_css_page_size=True, print_background=True)
            return report
        finally:
            ctx.close()

    def run(self):
        while True:
            html_path, pdf_path, fut = self.q.get()
            try:
                try:
                    fut.set_result(self._render(html_path, pdf_path))
                except Exception:
                    # 브라우저가 죽었을 수 있으니 한 번만 다시 시도
                    try:
                        if self.browser:
                            self.browser.close()
                    except Exception:  # noqa: BLE001
                        pass
                    self.browser = None
                    fut.set_result(self._render(html_path, pdf_path))
            except Exception as e:  # noqa: BLE001
                fut.set_exception(e)


_worker: Worker | None = None
_worker_lock = threading.Lock()


def worker() -> Worker:
    global _worker
    with _worker_lock:
        if _worker is None:
            _worker = Worker()
        return _worker


# --------------------------------------------------------------------------
# 캐시 (용량 한도를 넘으면 오래 안 쓴 것부터 삭제)
# --------------------------------------------------------------------------
_cache_lock = threading.Lock()


def cache_path(key: str) -> Path:
    return CACHE_DIR / f"{key}.pdf"


def cache_trim():
    with _cache_lock:
        files = sorted(CACHE_DIR.glob("*.pdf"), key=lambda p: p.stat().st_atime)
        total = sum(p.stat().st_size for p in files)
        limit = CACHE_MAX_MB * 1048576
        while files and total > limit:
            p = files.pop(0)
            total -= p.stat().st_size
            p.unlink(missing_ok=True)


def cache_stats():
    files = list(CACHE_DIR.glob("*.pdf"))
    return {"files": len(files), "bytes": sum(p.stat().st_size for p in files), "limit_bytes": int(CACHE_MAX_MB * 1048576)}


# --------------------------------------------------------------------------
# 문서 준비 / 변환
# --------------------------------------------------------------------------
def referenced_assets(data: dict) -> list[str]:
    names = []
    for q in data.get("questions") or []:
        v = q.get("visual") if isinstance(q, dict) else None
        if isinstance(v, dict) and v.get("asset") and v["asset"] not in names:
            names.append(str(v["asset"]))
    return names


def parse_json_bytes(raw: bytes) -> dict:
    try:
        data = json.loads(raw.decode("utf-8-sig"))
    except (UnicodeDecodeError, json.JSONDecodeError) as e:
        raise HttpError(422, f"JSON 을 읽지 못했어요: {e}")
    if not isinstance(data, dict):
        raise HttpError(422, "JSON 최상위는 { } 여야 해요.")
    return data


def make_pdf_file(data: dict, assets: dict[str, bytes], part: str, out: Path) -> dict:
    tmp = Path(tempfile.mkdtemp(prefix="mhq_"))
    try:
        (tmp / R.ASSET_DIR).mkdir()
        for name, b in assets.items():
            (tmp / R.ASSET_DIR / name).write_bytes(b)
        errors, warns, meta, questions = R.prepare(data, tmp, strict=True)
        if errors:
            raise HttpError(422, "JSON 에 고칠 곳이 있어요.", details=errors, warnings=warns)
        html = tmp / "doc.html"
        html.write_text(R.build_html(meta, questions, tmp, part), encoding="utf-8")
        tmp_pdf = tmp / "out.pdf"
        try:
            report = worker().submit(html, tmp_pdf).result(timeout=RENDER_TIMEOUT_S + 30)
        except HttpError:
            raise
        except Exception as e:  # noqa: BLE001
            raise HttpError(500, f"PDF 변환 중 오류: {str(e)[:200]}")
        out.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(tmp_pdf), str(out))
        return {"pages": report.get("pages"), "warnings": warns + list(report.get("warnings") or []), "meta": meta}
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def fname_for(meta_title: str, kind: str) -> str:
    base = re.sub(r'[\\/:*?"<>|\r\n]+', " ", meta_title or "민혁닷컴 문제지").strip()[:70] or "민혁닷컴 문제지"
    suffix = {"solution": " 해설", "all": " 문제+해설"}.get(kind, "")
    return f"{base}{suffix}.pdf"


# --------------------------------------------------------------------------
# 라우트
# --------------------------------------------------------------------------
@app.get("/health")
def health():
    return jsonify({"ok": True, "version": RENDERER_VERSION, "configured": bool(SUPABASE_URL and ANON_KEY and SERVICE_KEY), "protect": PROTECT, "watermark": WATERMARK})


@app.get("/pdf/<fid>")
def pdf(fid: str):
    if not (SUPABASE_URL and ANON_KEY and SERVICE_KEY):
        raise HttpError(500, "서버 설정(SUPABASE_*)이 비어 있어요.")
    fid = fid.lower()
    if not UUID_RE.match(fid):
        raise HttpError(400, "자료 번호가 올바르지 않아요.")
    kind = request.args.get("kind", "main")
    if kind not in ("main", "solution", "all"):
        raise HttpError(400, "kind 는 main / solution / all 중 하나예요.")
    token = _bearer()

    # 1) 권한: 사이트의 Supabase 규칙에 로그인 토큰 그대로 물어본다
    need = ["main", "solution"] if kind == "all" else [kind]
    for k in need:
        if not _can_download(fid, k, token):
            raise HttpError(403, "이 자료를 받을 권한이 없어요. (구매하거나 M패스로 받은 뒤 다시 눌러 주세요)")

    # 1-1) 직원이 아니면 보호(워터마크 + 복사·수정 차단)를 걸고, 한 사람이 너무 자주 받지 못하게 제한
    user, protect = None, False
    if PROTECT:
        protect = not _is_staff(token)
        if protect:
            user = _auth_user(token)
            ip = request.headers.get("X-Forwarded-For", "").split(",")[-1].strip() or request.remote_addr or "?"
            _rate_check(("u:" + str(user["id"])) if user and user.get("id") else ("ip:" + ip))

    # 2) JSON 과 이미지 정보 읽기
    jpath = f"{fid}/main.json"
    raw = _obj_get(jpath, MAX_JSON_KB * 1024)
    data = parse_json_bytes(raw)
    names = referenced_assets(data)
    infos = {}
    for n in names:
        if not R.ASSET_RE.match(n):
            raise HttpError(422, f"asset 이름이 올바르지 않아요: {n}")
        info = _obj_info(f"{fid}/img/{n}")
        if not info:
            raise HttpError(422, f"이미지가 아직 안 올라왔어요: {n}")
        if int(info.get("size") or 0) > MAX_ASSET_MB * 1048576:
            raise HttpError(413, f"이미지가 너무 커요: {n}")
        infos[n] = f"{info.get('etag') or ''}:{info.get('size')}:{info.get('lastModified') or info.get('last_modified') or ''}"

    # 3) 캐시 확인 (JSON 내용 + 이미지 버전 + 종류 + 렌더러 버전이 같으면 그대로 사용)
    part = {"main": "problem", "solution": "solution", "all": "all"}[kind]
    key = hashlib.sha256(json.dumps([RENDERER_VERSION, part, hashlib.sha256(raw).hexdigest(), infos], sort_keys=True).encode()).hexdigest()[:40]
    cp = cache_path(key)
    hit = cp.exists()
    meta_title = str((data.get("meta") or {}).get("minor_unit") or "")
    if hit:
        os.utime(cp, None)
    else:
        assets = {n: _obj_get(f"{fid}/img/{n}", int(MAX_ASSET_MB * 1048576)) for n in names}
        make_pdf_file(data, assets, part, cp)
        cache_trim()
    body = cp.read_bytes()
    if protect:
        body = _protect(body, fid, user, meta_title)      # 캐시에는 원본, 받는 사람마다 그 자리에서 찍어요
    disp = "inline" if request.args.get("inline") == "1" else "attachment"
    resp = Response(body, mimetype="application/pdf")
    resp.headers["Content-Disposition"] = f"{disp}; filename*=UTF-8''{quote(fname_for(meta_title, kind))}"
    resp.headers["Cache-Control"] = "private, no-store"
    resp.headers["X-Content-Type-Options"] = "nosniff"
    resp.headers["X-MHQ-Cache"] = "hit" if hit else "miss"
    return resp


def _require_admin():
    token = _bearer()
    if not token or _sb_rpc("mh_is_admin", {}, token) is not True:
        raise HttpError(403, "관리자만 쓸 수 있어요.")


@app.post("/validate")
def validate():
    """관리자가 올리기 전에 JSON 을 검사 (변환은 안 함). body: {"json": {...}, "assets": ["a.png", ...]}"""
    _require_admin()
    body = request.get_json(silent=True) or {}
    data = body.get("json")
    if not isinstance(data, dict):
        raise HttpError(400, "json 이 필요해요.")
    have = {str(a) for a in (body.get("assets") or [])}
    tmp = Path(tempfile.mkdtemp(prefix="mhq_v_"))
    try:
        (tmp / R.ASSET_DIR).mkdir()
        missing = []
        for n in referenced_assets(data):
            if not R.ASSET_RE.match(n):
                continue                                   # 이름 오류는 prepare 가 알려줌
            if n not in have:
                missing.append(n)
            (tmp / R.ASSET_DIR / n).write_bytes(b"<svg xmlns='http://www.w3.org/2000/svg'/>" if n.lower().endswith(".svg") else b"x")
        errors, warns, meta, qs = R.prepare(data, tmp, strict=True)
        errors = [e for e in errors if "이미지 파일이 없어요" not in e]
        errors += [f"올리지 않은 이미지가 있어요: {n}" for n in missing]
        return jsonify({"ok": not errors, "errors": errors, "warnings": warns, "questions": len(qs), "assets": referenced_assets(data)})
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


@app.get("/stats")
def stats():
    _require_admin()
    return jsonify({"cache": cache_stats()})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "8080")), threaded=True)
