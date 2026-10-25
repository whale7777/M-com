import { DAY } from './util.js?v=5';

// 앱 전체가 같이 쓰는 상태. (여러 모듈이 같은 객체를 보기 때문에 한 곳에 모아뒀어요)
export const S = {
  DEMO: false,
  api: null,
  user: null,
  isAdmin: false,
  hasPass: false,
  points: 0,
  owned: new Set(),
  tax: [],
  site: {},
  files: [],
  hooks: {}, // { reload, route, header } — app.js 가 채워줘요
};

export const subj = (id) => S.tax.find((s) => s.id === id);
export const unitOf = (f) => (subj(f.subject)?.units || []).find((u) => u.id === f.unit);
export const created = (f) => Number(f.createdAt) || 0;
export const isNew = (f) => created(f) > 0 && Date.now() - created(f) < 7 * DAY;
export const visibleFiles = () => S.files.filter((f) => f.visible !== false);

// 이 자료의 "잠금"이 풀려 있나? (관리자 / M패스 / 구매)
export const unlocked = (f) => S.isAdmin || S.hasPass || S.owned.has(f.id);
export const canMain = (f) => f.tier === 'free' || unlocked(f);
export const canSol = (f) => !!f.hasSolution && unlocked(f);
// 포인트로 살 수 있는 상태인가? (프리미엄 자료, 또는 무료 자료의 해설)
export const buyable = (f) => !unlocked(f) && Number(f.price) > 0 && (f.tier === 'premium' || !!f.hasSolution);
