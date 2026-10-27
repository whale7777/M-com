# 민혁닷컴 PDF 변환 서버

문제를 **JSON + 이미지**로 올려 두고, 학생이 받기를 누르면 이 서버가 그 자리에서 A4 PDF로 만들어 줘요.
(형식은 `MHQ_FORMAT.md`) 사이트(GitHub Pages)는 그대로이고, 이 서버만 따로 하나 있으면 돼요.

```
민혁닷컴(GitHub Pages) ─ 로그인 토큰 ─▶ 변환 서버 ─▶ Supabase
   받기 버튼                              │            ① mh_can_read_object() 로 권한 확인 (구매·M패스·관리자 규칙 그대로)
   ◀──────────── PDF ────────────────────┘            ② 스토리지에서 main.json + img/* 읽기
                                           같은 내용은 캐시(기본 300MB, 넘으면 오래된 것부터 삭제)
```

## 용량 (실측)
영재고 물리 ① 샘플 15문항: **PDF 약 600KB** ↔ **JSON 27KB + SVG 그림 22KB ≈ 50KB** → 약 **12배** 가벼워요.
(그림을 PNG로 올리면 그림당 20~60KB 정도라 그래도 PDF보다 훨씬 작아요. 도형·그래프는 SVG가 가장 작아요.)
PDF 파일은 저장하지 않고 요청 때 만들어요. 캐시는 서버 디스크이고 Supabase 용량을 쓰지 않아요.

## 설치 순서
### 1. Supabase (한 번)
SQL Editor 에서 `schema.sql` 전체 → 이어서 **`schema_mhq.sql` 전체** 실행. (여러 번 실행해도 안전)

### 2. 변환 서버 배포 (Docker 가능한 곳 아무데나)
이 `render-server` 폴더가 서버 전체예요. 예) Render.com → New → Web Service → 이 저장소 선택 →
Root Directory `render-server`, Runtime **Docker** → Environment 에 `.env.example` 의 값 4개 입력.
- `SUPABASE_SERVICE_KEY` 는 **서버 환경변수에만** 넣어요. `config.js` · 깃허브에 올리면 안 돼요!
- `ALLOWED_ORIGINS` 는 `https://whale7777.github.io` (경로 `/M-com/` 는 빼요)
- 배포가 끝나면 `https://…/health` 를 열어서 `"configured": true` 가 나오는지 확인
- 무료 플랜은 한동안 안 쓰면 잠들어서 **첫 요청이 30~60초** 걸릴 수 있어요. 판매를 시작하면 항상 켜져 있는 작은 서버(월 5천~1만 원대 VPS / 유료 플랜)를 추천해요. 램은 1GB 이상.

### 3. 사이트 연결
`config.js` 의 `RENDER_URL: 'https://내-서버-주소'` 를 채우고 사이트 파일을 다시 올려요.
이제 새 자료 · 파일 변경 화면의 문제 PDF 칸에 **"민혁 JSON (서버가 PDF로 변환)"** 이 생겨요.
(해설은 "같은 JSON에서 자동 생성" 을 고르면 JSON 의 정답·해설 부분으로 별도 PDF가 나가요.)

### 4. 올리기
관리자 → 새 자료 → 문제 JSON + 그림 파일들을 한 번에 고르고 등록. 올리기 전에 서버가 JSON을 검사해서
오류가 있으면 몇 번 문항의 무엇인지 알려줘요. 그림 이름이 JSON 의 `asset` 과 같아야 해요.

## 관리자 › 💾 저장공간
사용량 / 남은 용량 / 최근 올린 자료 평균 용량으로 **앞으로 올릴 수 있는 자료 수 예측** /
JSON 방식 vs PDF 방식 평균 비교 / 변환 서버 캐시. 기준 용량은 `config.js` 의 `STORAGE_QUOTA_MB`(무료 1024).

## 로컬에서 시험
```
pip install -r requirements.txt && python -m playwright install chromium
python renderer/make_pdf.py renderer/sample.json --part all -o sample.pdf   # 서버 없이 변환만
python tests/fake_supabase.py <폴더>   # 가짜 Supabase (선택)
```
`--part problem|solution|all` 로 문제만 / 해설만 / 전체.

## 보안 메모
- 권한은 Supabase 규칙으로 판단 → 로그인 토큰이 없거나 구매하지 않았으면 403
- 서버 변환에서는 임의 HTML · 파일 경로 · 스크립트가 든 SVG 를 막고, 변환 브라우저는 인터넷에 못 나가요
- 요청이 몰리면 대기열(6개)이 차서 "잠시 뒤 다시" 안내가 나가요
- 받은 PDF 자체를 퍼뜨리는 건 막을 수 없어요 (워터마크 기능은 아직 없음)
