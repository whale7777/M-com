# -*- coding: utf-8 -*-
"""변환 서버의 /pdf 보호 흐름 시험 (Supabase · Chromium 없이 가짜로 대체)."""
import importlib
import io
import sys
from pathlib import Path

import pytest
from pypdf import PdfReader
from reportlab.pdfgen import canvas

HERE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(HERE))

FID = "11111111-2222-3333-4444-555555555555"
RAW_JSON = '{"meta": {"minor_unit": "vector"}, "questions": []}'.encode("utf-8")


def sample_pdf() -> bytes:
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=(595.27, 841.89))
    c.drawString(72, 760, "Original problem text")
    c.showPage()
    c.save()
    return buf.getvalue()


@pytest.fixture()
def srv(monkeypatch, tmp_path):
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_ANON_KEY", "anon-key")
    monkeypatch.setenv("SUPABASE_SERVICE_KEY", "service-secret")
    monkeypatch.setenv("ALLOWED_ORIGINS", "https://site.test")
    monkeypatch.setenv("CACHE_DIR", str(tmp_path / "cache"))
    monkeypatch.setenv("PDF_RATE_PER_10MIN", "3")
    sys.modules.pop("server", None)
    s = importlib.import_module("server")

    users = {  # 토큰 → (다운로드 가능?, 관리자?, 콘텐츠 직원?)
        "buyer": (True, False, False),
        "admin": (True, True, False),
        "staff": (True, False, True),
        "nobody": (False, False, False),
    }

    def fake_rpc(name, args, token):
        ok, adm, stf = users.get(token or "", (False, False, False))
        if name in ("mh_can_download", "mh_can_read_object"):
            return ok
        if name == "mh_is_admin":
            return adm
        if name == "staff_can":
            return stf
        raise AssertionError(name)

    def fake_make(data, assets, part, out):
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_bytes(sample_pdf())
        return {"pages": 1, "warnings": [], "meta": {}}

    monkeypatch.setattr(s, "_sb_rpc", fake_rpc)
    monkeypatch.setattr(s, "_obj_get", lambda path, max_bytes: RAW_JSON)
    monkeypatch.setattr(s, "make_pdf_file", fake_make)
    monkeypatch.setattr(s, "_auth_user", lambda token: {"id": "uid-" + token, "user_metadata": {"username": "tester"}} if token in ("buyer", "staff") else None)
    s.app.config["TESTING"] = True
    return s


def get(s, token, kind="main"):
    h = {"Authorization": f"Bearer {token}"} if token else {}
    return s.app.test_client().get(f"/pdf/{FID}?kind={kind}", headers=h)


def test_buyer_gets_watermarked_encrypted_pdf(srv):
    r = get(srv, "buyer")
    assert r.status_code == 200
    reader = PdfReader(io.BytesIO(r.data))
    assert reader.is_encrypted and reader.decrypt("") != 0
    txt = reader.pages[0].extract_text()
    assert "Original problem text" in txt
    assert "tester" in txt                                  # 받은 사람 아이디가 찍혀요
    assert "ID " in txt
    assert r.headers["Cache-Control"] == "private, no-store"


def test_admin_gets_clean_original(srv):
    r = get(srv, "admin")
    assert r.status_code == 200
    reader = PdfReader(io.BytesIO(r.data))
    assert not reader.is_encrypted
    assert "tester" not in reader.pages[0].extract_text()


def test_content_staff_gets_clean_original(srv):
    r = get(srv, "staff")
    assert r.status_code == 200 and not PdfReader(io.BytesIO(r.data)).is_encrypted


def test_no_permission_is_403(srv):
    assert get(srv, "nobody").status_code == 403


def test_rate_limit_per_user(srv):
    assert [get(srv, "buyer").status_code for _ in range(3)] == [200, 200, 200]
    r = get(srv, "buyer")
    assert r.status_code == 429
    assert "너무 자주" in r.get_json()["error"]
    assert get(srv, "admin").status_code == 200              # 직원은 제한 없음


def test_protection_failure_never_serves_unprotected(srv, monkeypatch):
    def boom(*a, **k):
        raise RuntimeError("boom")
    monkeypatch.setattr(srv.secure_pdf, "protect", boom)
    r = get(srv, "buyer")
    assert r.status_code == 500
    assert b"Original problem text" not in r.data and not r.data.startswith(b"%PDF")


def test_protection_can_be_turned_off(srv, monkeypatch):
    monkeypatch.setattr(srv, "PROTECT", False)
    r = get(srv, "buyer")
    assert r.status_code == 200 and not PdfReader(io.BytesIO(r.data)).is_encrypted


def test_falls_back_to_old_permission_function(srv, monkeypatch):
    real = srv._sb_rpc

    def flaky(name, args, token):
        if name == "mh_can_download":                        # v13 SQL 을 아직 안 돌렸을 때
            raise srv.HttpError(502, "권한 확인에 실패했어요 (404).")
        return real(name, args, token)
    monkeypatch.setattr(srv, "_sb_rpc", flaky)
    assert get(srv, "buyer").status_code == 200
    assert get(srv, "nobody").status_code == 403


def test_cache_holds_original_not_protected(srv):
    get(srv, "buyer")
    files = list(Path(srv.CACHE_DIR).glob("*.pdf"))
    assert len(files) == 1
    assert not PdfReader(io.BytesIO(files[0].read_bytes())).is_encrypted   # 캐시는 원본(공용)


def test_health_reports_protect(srv):
    assert srv.app.test_client().get("/health").get_json()["protect"] is True
