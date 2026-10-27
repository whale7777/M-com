// ============================================================
//  민혁닷컴 설정 파일
//  PyNest 와 "같은" Supabase 프로젝트를 쓰기 때문에 PyNest 계정이 그대로 연동돼요.
//  (PyNest 의 config.js 와 같은 값이에요. anon 키는 공개돼도 괜찮게 설계된 키예요.)
//  service_role 키는 절대 넣지 마세요!
// ============================================================
export const CONFIG = {
  SUPABASE_URL: 'https://zzvmssovcmaovraebssk.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_OD5J8kRqcpV_ehz_xXaSmA_abKZSzFt',

  // 푸터 / M패스 안내에 나오는 기본 문의처 (관리자 패널 > 사이트 설정에서도 바꿀 수 있어요)
  CONTACT: '문의: 관리자에게 연락해주세요 (여기에 카톡/인스타/메일 적기)',

  // true: 민혁닷컴에서도 가입 가능 (PyNest 와 같은 계정이 만들어져요)
  // false: 가입은 PyNest 에서만, 민혁닷컴에서는 로그인만
  ALLOW_SIGNUP: true,

  // 홈 배너·푸터에서 연결할 PyNest 주소 (PyNest 저장소 주소에 맞게 바꿔요)
  PYNEST_URL: 'https://whale7777.github.io/PYNEST/',
  // 직접 업로드할 수 있는 PDF 한 개의 최대 용량(MB). schema.sql 의 버킷 제한(기본 10MB)과 맞춰요.
  MAX_UPLOAD_MB: 10,

  // 민혁닷컴(이 사이트) 주소 — 드로어 메뉴의 "사이트 이동" 버튼에 쓰여요
  MCOM_URL: 'https://whale7777.github.io/M-com/',

  // ---- v10: 민혁닷컴 JSON(mhq/1) → 서버에서 PDF 변환 ----
  // PDF 변환 서버 주소 (render-server/README.md 로 배포한 주소, 끝에 / 없이). 비워두면 JSON 업로드 기능이 꺼져요.
  RENDER_URL: 'https://minhyeok-render.onrender.com',
  // 관리자 › 💾 저장공간 에서 "남은 용량"을 계산할 때 기준이 되는 총 용량(MB). Supabase 무료 플랜 = 1024
  STORAGE_QUOTA_MB: 1024,
};
