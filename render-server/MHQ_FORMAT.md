# 민혁닷컴 문제 JSON 형식 `mhq/1`

한 파일 = 문제 1세트(보통 15문항). 맨 위에 `"format": "mhq/1"` 이 있어야 해요.
그림은 JSON 안에 넣지 않고 **이미지 파일로 따로 올린 뒤 이름으로 불러와요.**

```json
{
  "format": "mhq/1",
  "meta": {
    "series_label": "영재고 대비",
    "subject": "물리 ①",
    "major_unit": "1.측정",
    "minor_unit": "1-1.길이를 포함한 물리량의 측정(영재고 01)",
    "header_short": "1-1.길이를 포함한 물리량의 측정(영재고 01)",
    "doc_id": "MHC-PHY-1-1-G01",
    "top3_tag": "핵심유형",
    "top3": ["유형 1", "유형 2", "유형 3"]
  },
  "questions": [ { ... }, { ... } ]
}
```

## meta
| 키 | 설명 |
|---|---|
| `subject` `major_unit` `minor_unit` | 필수. 첫 페이지 머리글 (과목+회차 / 대단원 / 중단원) |
| `series_label` | 좌상단 라벨 · 2쪽부터의 머리글 `[라벨] …` (기본 "영재고 대비") |
| `header_short` | 2쪽부터의 머리글에 쓸 이름 (생략하면 `minor_unit`) |
| `doc_id` | 바닥글 관리코드 |
| `top3`, `top3_tag` | 첫 페이지 "핵심유형 TOP 3" 박스 (3줄 권장) |
| `show_type_tag` | 서술형 알약 표시 (기본 true) |
| `footer_credit` | 맨 마지막 쪽 제작 표시 문구 |

## questions[] (한 문항)
| 키 | 설명 |
|---|---|
| `type` | `"essay"`(서술형, 기본) 또는 `"choice"`(객관식) |
| `stem` | 발문. "옳지 않은 것" 등은 자동으로 굵게+밑줄 |
| `points` | 배점 (서술형) → 발문 끝에 `[5점]` |
| `visual` | 시각자료 (아래) |
| `passage` | 자료 박스 `{"title": "...", "text": "..."}` (문자열도 가능) |
| `concept` | "개념 쏙쏙" 박스 `{"title": "개념 쏙쏙", "text": "..."}` |
| `bogi` | `<보기>` 박스. `["ㄱ. ...", "ㄴ. ..."]` |
| `parts` | 소문항 `["(가) ...", "(나) ..."]` |
| `choices` | 객관식 선택지 2~5개 (짧으면 2열, 길면 세로로 자동) |
| `answer` | 정답. 객관식은 `"④"` / `4` / `"4번"` 모두 가능 |
| `explanation` | 해설 줄 목록. `①`, `ㄱ.`, `(가)` 로 시작하면 내어쓰기 |
| `tip` | 해설 아래 `[핵심]` 한 줄 |
| `rubric` | 해설 맨 아래 `[채점] ...` |

## visual (그림·도표)
| `kind` | 필드 | 설명 |
|---|---|---|
| `image` | `asset`, `width`(예 `"60mm"`), `caption` | **올린 이미지** (png / jpg / jpeg / svg) |
| `svg` | `asset` 또는 `svg`(코드) | 선화 그림. 용량이 가장 작아서 도형·그래프는 SVG 추천 |
| `table` | `header`, `rows` | 표 (칸 안에 `$수식$` 가능) |
| `dialog` | `lines: [{who, text}]` | 만화형 말풍선 대화 |
| `news` | `paper, date, headline, text` | 신문 기사 |

- `asset` 이름 규칙: 영문·숫자·`_`·`-`·`.` 만, 60자 이하, 확장자는 `.png .jpg .jpeg .svg`. (예: `q06_rods.png`)
- 서버 변환에서는 `html` 종류와 `src` 경로, 스크립트가 들어간 SVG는 **막혀 있어요** (보안).
- 그림은 zip 하나로 묶어서 올려도 돼요. 브라우저가 자동으로 풀어서 그림(png·jpg·jpeg·svg)만 올리고 zip 은 서버에 남기지 않아요.
- 이미지는 관리자 업로드 화면에서 JSON과 같이 고르면 돼요. 올리기 전에 자동으로 1400px 이하로 줄여요.

## 글씨 서식
`$수식$` · `$$수식$$` (LaTeX) · `**굵게**` · `__밑줄__` · `//기울임//` · `!!굵게+밑줄!!` · `^{위첨자}` · `_{아래첨자}` · 줄바꿈 `\n`
JSON 안에서는 역슬래시를 두 번 써요: `"$\\frac{1}{2}mv^2$"`

## 제한
JSON 1MB 이하 · 이미지 한 개 3MB 이하 · 한 문항이 한 단(약 24cm)보다 길면 안 돼요.

## 이 형식으로 AI에게 문제를 만들게 하는 프롬프트
```
아래 규칙으로 문제 JSON 하나를 코드블록으로 출력하고, 그 아래에 "필요한 그림 목록"을 따로 적어줘.
- 맨 위 "format":"mhq/1", meta(subject, major_unit, minor_unit, header_short, doc_id, top3 3줄)
- questions 15개. 대부분 서술형(type "essay", points 포함), 객관식은 거의 만들지 않음
- 각 문항: stem, (필요하면) concept·parts·bogi·passage·visual, answer, explanation(줄 목록), tip, rubric
- 수식은 $...$ (LaTeX), 역슬래시는 JSON이므로 두 번(\\\\) 쓸 것
- 그림이 필요한 문항은 visual 에 {"kind":"image","asset":"q03_xxx.png"} 로 이름만 적고,
  파일이름과 어떤 그림인지는 "필요한 그림 목록"에 적어줘 (도형·그래프는 SVG 추천)
- 풀이/답 칸은 넣지 않고 문제만. 정답과 해설은 정확하게 검산할 것
주제: (여기에 과목·단원·난이도)
```
