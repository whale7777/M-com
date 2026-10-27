#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
민혁닷컴 문제지 PDF 생성기
    questions.json  ->  HTML(2단 배치 + 수식)  ->  PDF(A4)

사용법:
    python make_pdf.py questions.json
    python make_pdf.py questions.json -o 결과.pdf
    python make_pdf.py questions.json --check        (JSON 검사만)

필요한 것: Python 3.9+, jinja2, playwright, (Windows는 설치된 Microsoft Edge 사용)
수식($...$)은 vendor/ 폴더의 KaTeX 를 쓰므로 인터넷이 없어도 돼요.
"""
from __future__ import annotations

import argparse
import base64
import json
import mimetypes
import re
import sys
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape
from markupsafe import Markup, escape

BASE = Path(__file__).resolve().parent
CIRCLED = "①②③④⑤"

FONT_STACK = (
    '"Nanum Gothic","NanumGothic","나눔고딕","Malgun Gothic","맑은 고딕",'
    '"Apple SD Gothic Neo","Noto Sans CJK KR","Noto Sans KR","Segoe UI Symbol",sans-serif'
)

NEG_WORDS = re.compile(
    r"(?<![!\w])(옳지 않은 것|옳지 않은|적절하지 않은 것|적절하지 않은|틀린 것|맞지 않는 것|아닌 것)(?![!\w])"
)
MARKER_RE = re.compile(
    r"^\s*([①②③④⑤⑥⑦⑧⑨⑩]|[ㄱ-ㅎ]\.|\([가-힣]\))\s*(.*)$", re.S
)
MATH_RE = re.compile(r"\$\$.+?\$\$|\$[^$\n]+?\$", re.S)


# --------------------------------------------------------------------------
# 텍스트 서식
#   **굵게**  __밑줄__  //기울임//  !!부정 발문!!(굵게+밑줄)  ^{위첨자}  _{아래첨자}
#   $수식$ (KaTeX, 인라인)   줄바꿈(\n)
# --------------------------------------------------------------------------
def fmt(s) -> Markup:
    if s is None:
        return Markup("")
    raw = str(s)
    maths: list[str] = []

    def stash(m):
        maths.append(m.group(0))
        return f"{len(maths) - 1}"

    raw = MATH_RE.sub(stash, raw)          # 수식은 서식 처리에서 보호
    t = str(escape(raw))
    t = re.sub(r"!!(.+?)!!", r'<span class="neg">\1</span>', t, flags=re.S)
    t = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", t, flags=re.S)
    t = re.sub(r"__(.+?)__", r"<u>\1</u>", t, flags=re.S)
    t = re.sub(r"//(.+?)//", r"<i>\1</i>", t, flags=re.S)
    t = re.sub(r"\^\{(.+?)\}", r"<sup>\1</sup>", t)
    t = re.sub(r"_\{(.+?)\}", r"<sub>\1</sub>", t)
    # <보기>, <가> 처럼 꺾쇠로 묶인 짧은 표현은 줄바꿈에서 쪼개지지 않게 묶는다
    t = re.sub(r"(&lt;[^&<>]{1,10}&gt;)", r'<span class="nb">\1</span>', t)
    t = t.replace("\n", "<br>")
    t = re.sub(r"(\d+)", lambda m: str(escape(maths[int(m.group(1))])), t)
    return Markup(t)


def stem_fmt(s) -> Markup:
    """발문: 부정 표현이 있으면 자동으로 굵게+밑줄 처리."""
    raw = str(s)
    if "!!" not in raw:
        raw = NEG_WORDS.sub(r"!!\1!!", raw)
    return fmt(raw)


def split_marker(s):
    m = MARKER_RE.match(str(s))
    if m and m.group(2):
        return (m.group(1), m.group(2))
    return ("", str(s))


# --------------------------------------------------------------------------
# 데이터 검사 / 정리
# --------------------------------------------------------------------------
class DataError(Exception):
    pass


def load_json(path: Path) -> dict:
    try:
        return json.loads(path.read_text(encoding="utf-8-sig"))
    except FileNotFoundError:
        raise DataError(f"파일을 찾을 수 없어요: {path}")
    except json.JSONDecodeError as e:
        raise DataError(f"JSON 문법 오류: {e.msg} (줄 {e.lineno}, 칸 {e.colno})")


def norm_answer(a, n_choices: int):
    """4, '4', '④', '4번' -> '④'"""
    s = str(a).strip()
    if s in CIRCLED:
        return s
    m = re.match(r"^(\d)\s*번?$", s)
    if m and 1 <= int(m.group(1)) <= max(n_choices, 1):
        return CIRCLED[int(m.group(1)) - 1]
    return None


def resolve(ref: str, base_dir: Path) -> Path:
    p = Path(ref)
    return p if p.is_absolute() else base_dir / p


def embed_file(ref: str, base_dir: Path) -> str:
    p = resolve(ref, base_dir)
    if not p.exists():
        raise DataError(f"이미지 파일이 없어요: {p}")
    mime = mimetypes.guess_type(p.name)[0] or "image/png"
    return f"data:{mime};base64," + base64.b64encode(p.read_bytes()).decode("ascii")


def read_svg(ref: str, base_dir: Path) -> str:
    p = resolve(ref, base_dir)
    if not p.exists():
        raise DataError(f"SVG 파일이 없어요: {p}")
    txt = p.read_text(encoding="utf-8")
    txt = re.sub(r"^\s*<\?xml[^>]*\?>", "", txt)
    return txt.strip()


ASSET_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.\-]{0,59}\.(png|jpe?g|svg)$", re.I)
ASSET_DIR = "assets"


def asset_path(name: str, base_dir: Path) -> Path:
    """visual.asset 이름 -> <base_dir>/assets/<이름>. 이름 규칙에 안 맞으면 DataError."""
    name = str(name or "")
    if not ASSET_RE.match(name):
        raise DataError(f"asset 이름이 올바르지 않아요: '{name}' (영문·숫자·_-. 만, .png/.jpg/.jpeg/.svg)")
    return base_dir / ASSET_DIR / name


_SVG_BAD = re.compile(r"<\s*(script|foreignObject|iframe|object|embed)|\son\w+\s*=|javascript:|(?:xlink:)?href\s*=\s*[\"']\s*(?!#)", re.I)


def clean_svg(txt: str) -> str:
    """서버 모드: 스크립트·외부 참조가 들어 있는 SVG 는 거부."""
    if _SVG_BAD.search(txt):
        raise DataError("SVG 에 스크립트/외부 링크가 들어 있어서 쓸 수 없어요.")
    return txt


def _read_svg_text(p: Path, strict: bool) -> str:
    if not p.exists():
        raise DataError(f"SVG 파일이 없어요: {p.name}")
    txt = re.sub(r"^\s*<\?xml[^>]*\?>", "", p.read_text(encoding="utf-8")).strip()
    return clean_svg(txt) if strict else txt


def as_list(x):
    if x is None:
        return []
    return [x] if isinstance(x, str) else list(x)


def prepare(data: dict, base_dir: Path, strict: bool = False):
    """검사하면서 템플릿에 넣기 좋은 형태로 바꾼다. (errors, warnings, meta, questions) 반환."""
    errors, warns = [], []
    meta = dict(data.get("meta") or {})
    fmt_id = data.get("format")
    if fmt_id not in (None, "mhq/1"):
        errors.append(f"format 은 'mhq/1' 이어야 해요 (지금 '{fmt_id}').")
    if strict:
        meta["logo"] = None   # 서버에서는 임의 경로 로고 금지
    defaults = {
        "series_label": "영재고 대비",
        "subject": "",
        "major_unit": "",
        "minor_unit": "",
        "site_name": "민혁닷컴",
        "doc_id": "MHC-0000",
        "footer_credit": "ⓒ 민혁닷컴(minhyeok.com) 자체 제작 문항 · 무단 복제 및 배포를 금합니다.",
        "top3": [],
        "top3_tag": "핵심유형",
        "show_type_tag": True,
        "logo": None,
    }
    for k, v in defaults.items():
        meta.setdefault(k, v)
    if not meta.get("header_short"):
        meta["header_short"] = meta["minor_unit"]
    name = str(meta["site_name"])
    if name.endswith("닷컴") and len(name) > 2:
        meta["site_main"], meta["site_sub"] = name[:-2], "닷컴"
    else:
        meta["site_main"], meta["site_sub"] = name, ""
    for k in ("subject", "major_unit", "minor_unit"):
        if not meta[k]:
            errors.append(f"meta.{k} 가 비어 있어요.")
    if len(meta["top3"]) != 3:
        warns.append(f"meta.top3 는 3줄이 가장 보기 좋아요 (지금 {len(meta['top3'])}줄).")

    qs = data.get("questions")
    if not isinstance(qs, list) or not qs:
        errors.append("questions 가 비어 있어요.")
        return errors, warns, meta, []
    if len(qs) != 15:
        warns.append(f"한 세트는 15문항인데 지금은 {len(qs)}문항이에요.")

    out = []
    for i, raw in enumerate(qs, 1):
        q = dict(raw)
        q["n"] = i
        where = f"{i}번 문항"
        qtype = q.get("type", "essay")
        if qtype not in ("choice", "essay"):
            errors.append(f"{where}: type 은 'choice' 또는 'essay' 여야 해요.")
            qtype = "essay"
        q["type"] = qtype
        if not q.get("stem"):
            errors.append(f"{where}: stem(발문)이 없어요.")
        if "answer" not in q or str(q["answer"]).strip() == "":
            errors.append(f"{where}: answer(정답)가 없어요.")

        if q.get("points") not in (None, ""):
            try:
                q["points"] = int(q["points"])
            except (TypeError, ValueError):
                errors.append(f"{where}: points 는 숫자여야 해요.")
                q["points"] = None
        elif qtype == "essay":
            warns.append(f"{where}: 서술형인데 points(배점)가 없어요.")

        if qtype == "choice":
            ch = q.get("choices") or []
            if not (2 <= len(ch) <= 5):
                errors.append(f"{where}: choices 는 2~5개여야 해요 (지금 {len(ch)}개).")
            elif len(ch) != 5:
                warns.append(f"{where}: 선택지가 {len(ch)}개예요 (보통 5개).")
            a = norm_answer(q.get("answer", ""), len(ch))
            if a is None:
                errors.append(f"{where}: answer 는 ①~⑤ 중 하나여야 해요 (지금 '{q.get('answer')}').")
            else:
                q["answer"] = a
            q["strong_answer"] = True
            layout = q.get("choice_layout")
            if layout not in ("grid", "list"):
                plain = [re.sub(r"\$[^$]*\$", "xxxx", str(c)) for c in ch]
                layout = "grid" if ch and all(len(c) <= 12 for c in plain) else "list"
            q["layout"] = layout
        else:
            ans = str(q.get("answer", "")).strip()
            q["strong_answer"] = not ans.endswith(".")
            q["answer_lines"] = int(q.get("answer_lines", 0))

        # 자료(지문)
        p = q.get("passage")
        if p:
            if isinstance(p, str):
                p = {"text": p}
            paras = [x for x in str(p.get("text", "")).split("\n") if x.strip()]
            q["passage"] = {"paras": paras, "source": p.get("source", ""), "title": p.get("title", "")}

        # 개념 박스
        c = q.get("concept")
        if c:
            if isinstance(c, str):
                c = {"text": c}
            q["concept"] = {
                "title": c.get("title", "개념 쏙쏙"),
                "paras": [x for x in str(c.get("text", "")).split("\n") if x.strip()],
            }

        # 보기 / 소문항
        if q.get("bogi") is not None and not isinstance(q["bogi"], list):
            errors.append(f"{where}: bogi 는 문자열 목록이어야 해요.")
            q["bogi"] = None
        q["parts"] = as_list(q.get("parts"))

        # 시각자료
        v = q.get("visual")
        if v:
            v = dict(v)
            kind = v.get("kind")
            if kind == "dialog":
                lines, order = [], []
                for ln in v.get("lines", []):
                    who = ln.get("who", "")
                    if who not in order:
                        order.append(who)
                    k = order.index(who)
                    lines.append({"who": who, "text": ln.get("text", ""),
                                  "side": "l" if k % 2 == 0 else "r", "av": k % 2})
                v["lines"] = lines
            elif kind == "table":
                if not v.get("rows"):
                    errors.append(f"{where}: table 시각자료에 rows 가 없어요.")
            elif kind == "news":
                for f in ("paper", "headline", "text"):
                    if not v.get(f):
                        errors.append(f"{where}: news 시각자료에 {f} 가 없어요.")
            elif kind == "image":
                try:
                    if v.get("asset"):
                        ap = asset_path(v["asset"], base_dir)
                        if ap.suffix.lower() == ".svg":
                            v["kind"] = "svg"
                            v["svg"] = _read_svg_text(ap, strict)
                        else:
                            v["uri"] = embed_file(str(ap), base_dir)
                    elif strict:
                        errors.append(f"{where}: image 시각자료는 'asset'(올린 이미지 이름)이 필요해요.")
                    else:
                        v["uri"] = embed_file(v.get("src", ""), base_dir)
                except DataError as e:
                    errors.append(f"{where}: {e}")
            elif kind == "svg":
                try:
                    if v.get("asset"):
                        v["svg"] = _read_svg_text(asset_path(v["asset"], base_dir), strict)
                    elif strict and v.get("src"):
                        errors.append(f"{where}: svg 시각자료는 'asset'(올린 SVG 이름)을 써야 해요.")
                    elif v.get("src"):
                        v["svg"] = read_svg(v["src"], base_dir)
                    elif v.get("svg"):
                        v["svg"] = clean_svg(v["svg"]) if strict else v["svg"]
                    else:
                        errors.append(f"{where}: svg 시각자료에 'asset' 또는 'svg'(내용)가 필요해요.")
                except DataError as e:
                    errors.append(f"{where}: {e}")
            elif kind == "html":
                if strict:
                    errors.append(f"{where}: html 시각자료는 서버 변환에서는 쓸 수 없어요 (table/image/svg 를 쓰세요).")
                elif not v.get("html"):
                    errors.append(f"{where}: html 시각자료에 'html' 내용이 없어요.")
            else:
                errors.append(f"{where}: 알 수 없는 visual.kind '{kind}' (dialog/table/news/image/svg/html)")
            q["visual"] = v

        # 해설은 항상 줄 목록으로
        q["explanation"] = as_list(q.get("explanation"))
        if not q["explanation"]:
            warns.append(f"{where}: 해설이 없어요.")
        out.append(q)
    return errors, warns, meta, out


# --------------------------------------------------------------------------
# HTML 만들기
# --------------------------------------------------------------------------
def font_faces() -> str:
    """fonts/ 폴더에 나눔고딕 파일을 넣어 두면 그걸 우선 사용."""
    d = BASE / "fonts"
    css = []
    if d.is_dir():
        for fname, weight in (("NanumGothic.ttf", 400), ("NanumGothicBold.ttf", 700)):
            f = d / fname
            if f.exists():
                css.append(
                    f'@font-face{{font-family:"Nanum Gothic";font-weight:{weight};'
                    f'src:url("{f.as_uri()}") format("truetype");}}'
                )
    return "\n".join(css)


def read_vendor(name: str) -> str:
    f = BASE / "vendor" / name
    if not f.exists():
        raise DataError(f"수식용 파일이 없어요: {f}  (vendor 폴더를 지우지 마세요)")
    return f.read_text(encoding="utf-8")


def build_html(meta: dict, questions: list, base_dir: Path, part: str = "all") -> str:
    env = Environment(
        loader=FileSystemLoader(str(BASE)),
        autoescape=select_autoescape(["html"]),
    )
    env.filters["fmt"] = fmt
    env.filters["stem"] = stem_fmt
    env.globals["split_marker"] = split_marker
    env.globals["circled"] = CIRCLED

    logo_uri = ""
    if meta.get("logo"):
        logo_uri = embed_file(meta["logo"], base_dir)

    css = (BASE / "style.css").read_text(encoding="utf-8").replace("__FONT_STACK__", FONT_STACK)
    js = (BASE / "engine.js").read_text(encoding="utf-8")
    return env.get_template("template.html").render(
        meta=meta, questions=questions, css=css, js=js, part=part,
        font_faces=font_faces(), logo_uri=logo_uri,
        katex_css=read_vendor("katex.inline.css"),
        katex_js=read_vendor("katex.min.js"),
    )


# --------------------------------------------------------------------------
# PDF 변환 (Playwright + Edge/Chrome)
# --------------------------------------------------------------------------
def launch_browser(p, prefer: str):
    order = [prefer] if prefer != "auto" else ["msedge", "chrome", "chromium"]
    last = None
    for name in order:
        try:
            if name == "chromium":
                return p.chromium.launch(), name
            return p.chromium.launch(channel=name), name
        except Exception as e:  # noqa: BLE001
            last = e
    raise RuntimeError(
        "브라우저를 실행하지 못했어요.\n"
        "  - Windows라면 Microsoft Edge가 설치돼 있어야 해요 (기본으로 깔려 있어요).\n"
        "  - 또는  python -m playwright install chromium  을 한 번 실행해 주세요.\n"
        f"  (마지막 오류: {last})"
    )


def html_to_pdf(html_path: Path, pdf_path: Path, browser_pref: str = "auto"):
    from playwright.sync_api import sync_playwright

    with sync_playwright() as p:
        browser, used = launch_browser(p, browser_pref)
        try:
            page = browser.new_page()
            page.emulate_media(media="print")
            page.goto(html_path.as_uri())
            page.wait_for_function("window.__done === true", timeout=90_000)
            report = page.evaluate("window.__report")
            page.pdf(path=str(pdf_path), prefer_css_page_size=True, print_background=True)
        finally:
            browser.close()
    return report, used


# --------------------------------------------------------------------------
def main(argv=None) -> int:
    for s in (sys.stdout, sys.stderr):
        try:
            s.reconfigure(encoding="utf-8")
        except Exception:  # noqa: BLE001
            pass

    ap = argparse.ArgumentParser(description="questions.json 을 문제지 PDF 로 변환합니다.")
    ap.add_argument("json", help="문제 JSON 파일")
    ap.add_argument("-o", "--output", help="저장할 PDF 경로 (기본: JSON 이름.pdf)")
    ap.add_argument("--html", action="store_true", help="HTML 파일도 함께 남기기 (디버그용)")
    ap.add_argument("--part", default="all", choices=["all", "problem", "solution"],
                    help="all=문제+해설(기본) / problem=문제만 / solution=정답·해설만")
    ap.add_argument("--check", action="store_true", help="JSON 검사만 하고 끝내기")
    ap.add_argument("--browser", default="auto", choices=["auto", "msedge", "chrome", "chromium"],
                    help="사용할 브라우저 (기본: Edge → Chrome → Chromium 순서로 자동)")
    a = ap.parse_args(argv)

    src = Path(a.json).resolve()
    try:
        data = load_json(src)
        errors, warns, meta, questions = prepare(data, src.parent)
    except DataError as e:
        print(f"[오류] {e}")
        return 1

    for w in warns:
        print(f"[주의] {w}")
    if errors:
        for e in errors:
            print(f"[오류] {e}")
        print(f"\n오류 {len(errors)}개를 고친 뒤 다시 실행해 주세요.")
        return 1
    if a.check:
        print(f"검사 통과: {len(questions)}문항")
        return 0

    pdf_path = Path(a.output).resolve() if a.output else src.with_suffix(".pdf")
    html_path = pdf_path.with_suffix(".html")
    pdf_path.parent.mkdir(parents=True, exist_ok=True)
    try:
        html_path.write_text(build_html(meta, questions, src.parent, a.part), encoding="utf-8")
    except DataError as e:
        print(f"[오류] {e}")
        return 1

    try:
        report, used = html_to_pdf(html_path, pdf_path, a.browser)
    except RuntimeError as e:
        print(f"[오류] {e}")
        return 1
    finally:
        if not a.html and html_path.exists():
            try:
                html_path.unlink()
            except OSError:
                pass

    print(f"완료: {pdf_path}")
    print(f"  브라우저: {used} / 총 {report['pages']}쪽 / 쪽별 문항 수: {report['perPage']}")
    for w in report["warnings"]:
        print(f"[주의] {w}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
