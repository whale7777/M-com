import { CONFIG } from './config.js?v=19';

// 처음 한 번만 쓰이는 기본 과목·단원. 관리자 패널에서 마음대로 바꿀 수 있어.
export const DEFAULT_TAX = [
  { id: 'physics', name: '물리', emoji: '⚛️', color: '#3b82f6', units: [
    { id: 'mech', name: '역학' }, { id: 'energy', name: '일과 에너지' },
    { id: 'em', name: '전기와 자기' }, { id: 'wave', name: '파동과 빛' }, { id: 'modern', name: '현대 물리' } ] },
  { id: 'chem', name: '화학', emoji: '🧪', color: '#ec4899', units: [
    { id: 'stoich', name: '화학량론' }, { id: 'bond', name: '원자와 결합' },
    { id: 'acid', name: '산·염기' }, { id: 'redox', name: '산화·환원' }, { id: 'equil', name: '반응 속도·평형' } ] },
  { id: 'bio', name: '생물', emoji: '🧬', color: '#10b981', units: [
    { id: 'cell', name: '세포' }, { id: 'metab', name: '물질대사' },
    { id: 'genetic', name: '유전' }, { id: 'homeo', name: '항상성' }, { id: 'eco', name: '생태계' } ] },
  { id: 'earth', name: '지구과학', emoji: '🌏', color: '#f59e0b', units: [
    { id: 'solid', name: '고체 지구' }, { id: 'atmo', name: '대기와 해양' }, { id: 'astro', name: '천문' } ] },
];

export const DEFAULT_BANNERS = [
  { id: 'b_pass', on: true, title: 'M패스로 더 싸게\n자료를 모아보세요', sub: '45일 19,900원부터. 1건당 최대 43% 저렴하게 문제·해설을 받아요', cta: 'M패스 알아보기', link: '#/pass', color: '#4f46e5', emoji: '👑' },
  { id: 'b_point', on: true, title: '필요한 세트만 골라서\nM포인트로 구매', sub: '충전 신청 → 승인 → 바로 다운로드. 한 번 산 자료는 계속 받을 수 있어요', cta: 'M포인트 충전하기', link: '#/points', color: '#0ea5a4', emoji: '🪙' },
  { id: 'b_pynest', on: true, title: '파이썬은 PyNest에서\n수업과 과제를 한 곳에', sub: '민혁닷컴 계정(ID)으로 그대로 로그인할 수 있어요', cta: 'PyNest 바로가기', link: '@pynest', color: '#e8590c', emoji: '🐍' },
];

// 왼쪽 메뉴 패널 (관리자 > 메뉴 탭에서 수정). type: link(링크) / heading(구분 제목) / subjects(과목·단원 자동 목록)
export const DEFAULT_MENU = [
  { id: 'm_home', type: 'link', on: true, emoji: '🏠', label: '홈', link: '#/' },
  { id: 'm_notice', type: 'link', on: true, emoji: '📢', label: '공지사항', link: '#/notices' },
  { id: 'm_all', type: 'link', on: true, emoji: '📚', label: '전체 자료', link: '#/list' },
  { id: 'm_h1', type: 'heading', on: true, label: '과목별 자료' },
  { id: 'm_subj', type: 'subjects', on: true, label: '과목·단원 (자동)' },
  { id: 'm_h2', type: 'heading', on: true, label: '이용하기' },
  { id: 'm_pass', type: 'link', on: true, emoji: '👑', label: 'M패스', link: '#/pass' },
  { id: 'm_points', type: 'link', on: true, emoji: '🪙', label: 'M포인트 충전', link: '#/points' },
  { id: 'm_me', type: 'link', on: true, emoji: '👤', label: '내 정보', link: '#/me' },
  { id: 'm_about', type: 'link', on: true, emoji: '📖', label: '이용안내', link: '#/about' },
  { id: 'm_pynest', type: 'link', on: true, emoji: '🐍', label: 'PyNest로 이동', link: '@pynest' },
];

export const DEFAULT_PACKS = [
  { p: 2000, l: '2,000원' }, { p: 5000, l: '5,000원' },
  { p: 10500, l: '10,000원 (+500P 보너스)' }, { p: 21000, l: '20,000원 (+1,000P 보너스)' },
  { p: 53000, l: '50,000원 (+3,000P 보너스)' }, { p: 110000, l: '100,000원 (+10,000P 보너스)' },
];

// 자료 1개의 잠정 가치 1,500~2,200원 (1P = 1원). 낱개 기본가는 난이도별로 1,500 / 1,800 / 2,200.
// M패스는 기간이 있는 대신 1건당 1,000원 안팎까지 내려가요 (약 26~43% 저렴).
// quota = 기간 안에 "받을 수 있는 자료 개수" (문제+해설 묶음 1개 = 1건)
export const DEFAULT_PLANS = [
  { id: 'p45', name: '45일', days: 45, quota: 15, price: 19900 },
  { id: 'p90', name: '90일', days: 90, quota: 35, price: 39900 },
  { id: 'p180', name: '6개월', days: 180, quota: 65, price: 69000 },
  { id: 'p365', name: '12개월', days: 365, quota: 115, price: 119000 },
];
export const DEFAULT_PRICE = 1800;
export const LEVEL_PRICE = { 1: 1500, 2: 1800, 3: 2200 };

export const DEFAULT_SITE = {
  noticeOn: false,
    autoApprove: true, // 민혁닷컴에서 가입하면 PyNest 도 바로 쓸 수 있게 자동 승인
  notice: '',
  heroSub: '과목별로 엄선한 10~15문항 세트. 무료 자료는 누구나, 프리미엄은 1,500P부터 낱개로, 또는 M패스로 더 저렴하게.',
  contact: CONFIG.CONTACT || '',
  passInfo: 'M패스는 정해진 기간 동안 정해진 건수만큼 자료를 받을 수 있는 이용권이에요.\n한 번 받은 자료는 기간이 끝나도 계속 다시 받을 수 있어요.',
  chargeInfo: '입금 계좌: (은행) 000-0000-0000 (예금주)\n입금 후 아래 신청을 보내주면 확인 뒤 포인트(또는 M패스)를 넣어드려요.',
  about: '민혁닷컴은 물리·화학·생물·지구과학 각 단원의 좋은 문제만 10~15문항씩 묶어 PDF로 제공하는 문제 은행이에요.\n직접 풀어보고 고른 문제로, 개념을 확인하고 실전 감각을 키우는 데 맞췄어요.',
  packs: DEFAULT_PACKS,
  passPlans: DEFAULT_PLANS,
  banners: DEFAULT_BANNERS,
  menu: DEFAULT_MENU,
  menuVer: 1,
};

export const buildPrem = (tier, ids) => {
  const p = {};
  if (tier === 'premium' && ids.main) p.driveId = ids.main;
  if (ids.solution) p.solutionId = ids.solution;
  return p;
};
