# -*- coding: utf-8 -*-
"""
PDF 보호 — 받는 사람마다 워터마크를 찍고, 복사·수정·주석을 막는 암호화(AES-256)를 걸어요.

    protect(pdf_bytes, label="아이디 · 2026-10-28", footer="…", title="…", allow_print=True) -> bytes

- 워터마크: 페이지마다 대각선 반투명 글씨 3줄 + 아래쪽 작은 글씨. "누가 받은 파일인지"가 남아서
  퍼뜨리는 걸 막는 효과가 가장 커요. (글씨는 연해서 문제를 읽는 데는 지장이 없어요)
- 암호화: 열 때 비밀번호는 없어요(바로 열려요). 소유자 비밀번호는 요청마다 무작위로 만들고 버려요.
  권한: 인쇄 허용(옵션) / 복사 · 수정 · 주석 · 양식 · 페이지 조작 금지.
- 한계(꼭 알아두세요): 권한 제한은 PDF 뷰어가 '지켜주는' 약속이라 일부 프로그램은 무시하고,
  화면 캡처 · 사진 · 인쇄 후 스캔은 기술로 막을 수 없어요. 그래서 워터마크가 핵심이에요.
"""
from __future__ import annotations

import io
import logging
import os
import secrets
from pathlib import Path

from pypdf import PdfReader, PdfWriter
from pypdf.constants import UserAccessPermissions as Perm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

# (경로, .ttc 안의 글꼴 번호). Dockerfile 이 fonts-nanum 을 설치해요.
# 주의: reportlab 은 TrueType(glyf) 글꼴만 쓸 수 있어요. Noto CJK 같은 OTF(CFF) 글꼴은 안 돼서 후보에서 뺐어요.
_FONT_CANDIDATES = [
    ("/usr/share/fonts/truetype/nanum/NanumGothic.ttf", None),
    ("/usr/share/fonts/truetype/nanum/NanumBarunGothic.ttf", None),
    ("/usr/share/fonts/truetype/unfonts-core/UnDotum.ttf", None),
]
_font_name: str | None = None
log = logging.getLogger("secure_pdf")


def pick_font() -> str:
    """한글이 나오는 글꼴을 한 번만 등록해요. 하나도 없으면 영문 글꼴(Helvetica)로 대신해요."""
    global _font_name
    if _font_name:
        return _font_name
    cands = list(_FONT_CANDIDATES)
    env = os.environ.get("PDF_FONT", "").strip()      # 직접 지정하고 싶을 때 (경로)
    if env:
        cands.insert(0, (env, 0 if env.lower().endswith(".ttc") else None))
    for path, idx in cands:
        if not Path(path).exists():
            continue
        try:
            kw = {"subfontIndex": idx} if idx is not None and path.lower().endswith(".ttc") else {}
            pdfmetrics.registerFont(TTFont("MHQWatermark", path, **kw))
            _font_name = "MHQWatermark"
            return _font_name
        except Exception:  # noqa: BLE001  — 다음 후보로
            continue
    _font_name = "Helvetica"
    return _font_name


def _clean(text: str, font: str, limit: int = 90) -> str:
    text = " ".join(str(text or "").split())[:limit]
    if font == "Helvetica":                              # 한글 글꼴이 없으면 영문만 (깨진 네모 방지)
        text = text.encode("ascii", "replace").decode("ascii")
    return text


def _overlay(sizes: list[tuple[float, float]], label: str, footer: str, font: str) -> PdfReader:
    buf = io.BytesIO()
    c = canvas.Canvas(buf)
    for w, h in sizes:
        c.setPageSize((w, h))
        diag = (w * w + h * h) ** 0.5
        unit = pdfmetrics.stringWidth(label, font, 1) or 1.0
        size = max(10.0, min(min(w, h) / 14, 0.8 * diag / unit))   # 대각선 안에 들어오게 자동 조절
        c.saveState()
        c.setFillColorRGB(0.35, 0.35, 0.35)
        c.setFillAlpha(0.10)
        c.setFont(font, size)
        for frac in (0.22, 0.50, 0.78):                  # 3줄: 한 귀퉁이만 잘라내도 남아요
            c.saveState()
            c.translate(w / 2, h * frac)
            c.rotate(35)
            c.drawCentredString(0, 0, label)
            c.restoreState()
        c.restoreState()
        c.saveState()
        c.setFillColorRGB(0.3, 0.3, 0.3)
        c.setFillAlpha(0.55)
        c.setFont(font, 6.5)
        c.drawCentredString(w / 2, 10, footer)
        c.restoreState()
        c.showPage()
    c.save()
    buf.seek(0)
    return PdfReader(buf)


def protect(
    pdf_bytes: bytes,
    *,
    label: str,
    footer: str = "",
    title: str = "",
    allow_print: bool = True,
    code: str = "",
) -> bytes:
    font = pick_font()
    if font == "Helvetica" and any(ord(ch) > 127 for ch in label + footer):
        log.warning("한글 글꼴을 못 찾아서 워터마크의 한글이 '?' 로 나가요. fonts-nanum 을 설치하거나 PDF_FONT 를 지정하세요.")
    label = _clean(label, font)
    footer = _clean(footer or label, font, 140)

    reader = PdfReader(io.BytesIO(pdf_bytes))
    if reader.is_encrypted:
        raise ValueError("이미 암호가 걸린 PDF 예요.")
    sizes = [(float(p.mediabox.width), float(p.mediabox.height)) for p in reader.pages]
    overlay = _overlay(sizes, label, footer, font)

    writer = PdfWriter(clone_from=reader)                  # 페이지를 writer 에 붙인 뒤에 겹쳐야 안전해요
    for page, ov in zip(writer.pages, overlay.pages):
        page.merge_page(ov)

    writer.add_metadata({
        "/Title": title or "민혁닷컴 문제지",
        "/Creator": "민혁닷컴",
        "/Producer": "민혁닷컴",
        "/Subject": f"license:{code}" if code else "민혁닷컴",
    })

    perms = Perm.EXTRACT_TEXT_AND_GRAPHICS                 # 화면낭독기(접근성)만 허용, 복사는 금지
    if allow_print:
        perms |= Perm.PRINT | Perm.PRINT_TO_REPRESENTATION
    writer.encrypt(
        user_password="",                                  # 열 때 비밀번호 없음
        owner_password=secrets.token_urlsafe(24),          # 아무도 모름 (매번 새로)
        permissions_flag=perms,
        algorithm="AES-256",
    )
    out = io.BytesIO()
    writer.write(out)
    return out.getvalue()
