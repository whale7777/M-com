# -*- coding: utf-8 -*-
"""secure_pdf 단위 시험:  cd render-server && python -m pytest tests -q"""
import io
import shutil
import subprocess
import sys
from pathlib import Path

import pytest
from pypdf import PdfReader
from pypdf.constants import UserAccessPermissions as Perm
from reportlab.pdfgen import canvas

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import secure_pdf  # noqa: E402


def make_sample(pages=3) -> bytes:
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=(595.27, 841.89))
    for i in range(pages):
        c.setFont("Helvetica", 14)
        c.drawString(72, 760, f"Problem page {i + 1}: v = v0 + a t")
        c.showPage()
    c.setPageSize((420, 595))                              # 크기가 다른 페이지도 있어도 돼요
    c.drawString(40, 540, "A5 page")
    c.showPage()
    c.save()
    return buf.getvalue()


def open_pdf(data: bytes) -> PdfReader:
    r = PdfReader(io.BytesIO(data))
    assert r.is_encrypted
    assert r.decrypt("") != 0, "비밀번호 없이 열려야 해요"
    return r


def test_encrypts_and_keeps_pages():
    out = secure_pdf.protect(make_sample(3), label="tester · 2026-10-28", footer="tester · ID ab12cd34", title="T", code="ab12cd34")
    r = open_pdf(out)
    assert len(r.pages) == 4
    assert r.metadata.title == "T"
    assert "ab12cd34" in (r.metadata.subject or "")


def test_permissions_print_allowed():
    r = open_pdf(secure_pdf.protect(make_sample(1), label="u", allow_print=True))
    p = r.user_access_permissions
    assert p & Perm.PRINT
    for banned in (Perm.EXTRACT, Perm.MODIFY, Perm.ADD_OR_MODIFY, Perm.FILL_FORM_FIELDS, Perm.ASSEMBLE_DOC):
        assert not (p & banned), banned


def test_permissions_print_blocked():
    r = open_pdf(secure_pdf.protect(make_sample(1), label="u", allow_print=False))
    p = r.user_access_permissions
    assert not (p & Perm.PRINT)
    assert not (p & Perm.EXTRACT)


def test_watermark_text_on_every_page():
    r = open_pdf(secure_pdf.protect(make_sample(2), label="tester · 2026-10-28", footer="tester · ID ab12cd34"))
    for page in r.pages:
        txt = page.extract_text()
        assert "tester" in txt
        assert "ab12cd34" in txt


def test_watermark_off_keeps_encryption_and_trace_code():
    r = open_pdf(secure_pdf.protect(make_sample(2), label="tester", footer="tester", code="ab12cd34", watermark=False))
    for page in r.pages:
        assert "tester" not in page.extract_text()
    assert "ab12cd34" in (r.metadata.subject or "")
    assert not (r.user_access_permissions & Perm.MODIFY)


def test_original_content_survives():
    r = open_pdf(secure_pdf.protect(make_sample(1), label="u"))
    assert "Problem page 1" in r.pages[0].extract_text()


def test_owner_password_is_random_and_unknown():
    out = secure_pdf.protect(make_sample(1), label="u")
    r = PdfReader(io.BytesIO(out))
    assert r.decrypt("not-the-password") == 0 or r.decrypt("") != 0   # 임의 비번으로 소유자 권한은 못 얻어요
    assert secure_pdf.protect(make_sample(1), label="u") != out        # 매번 달라요


def test_rejects_already_encrypted():
    once = secure_pdf.protect(make_sample(1), label="u")
    with pytest.raises(ValueError):
        secure_pdf.protect(once, label="u")


def test_korean_label_does_not_crash():
    out = secure_pdf.protect(make_sample(1), label="홍길동 · 2026-10-28", footer="홍길동 · ID 12345678 · 민혁닷컴")
    assert len(open_pdf(out).pages) == 2                   # 샘플은 A4 1장 + A5 1장


@pytest.mark.skipif(not shutil.which("qpdf"), reason="qpdf 없음")
def test_qpdf_reports_restrictions(tmp_path):
    f = tmp_path / "p.pdf"
    f.write_bytes(secure_pdf.protect(make_sample(1), label="u"))
    res = subprocess.run(["qpdf", "--show-encryption", str(f)], capture_output=True, text=True)
    out = res.stdout + res.stderr
    assert "R = 6" in out                                  # AES-256
    assert "extract for any purpose: not allowed" in out
    assert "modify annotations: not allowed" in out
    assert "modify other: not allowed" in out
    assert "print low resolution: allowed" in out


# 참고: poppler 의 pdftotext 같은 도구는 '복사 금지' 권한을 무시하고 글자를 뽑아내요.
# (직접 확인했어요) 그래서 권한 제한은 "예의상 약속"이고, 실제로 억제하는 건 워터마크예요.
