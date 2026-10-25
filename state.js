import { DAY } from './util.js?v=12';

// 앱 전체가 같이 쓰는 상태. (여러 모듈이 같은 객체를 보기 때문에 한 곳에 모아뒀어요)
export const S = {
  DEMO: false,
  api: null,
  user: null,
  isAdmin: false,
  hasPass: false,
  pass: { active: false, left: 0, quota: 0, used: 0, expires: null, plan: '' },
  points: 0,
  owned: new Set(),
  tax: [],
  site: {},
  files: [],
  notices: [],
  hooks: {}, // { reload, route, header } — app.js 가 채워줘요
};

export const subj = (id) => S.tax.find((s) => s.id === id);
// 단원은 폴더처럼 안에 하위 단원(children)을 계속 넣을 수 있어요
export function findUnit(sj, id) {
  const rec = (arr) => { for (const u of arr || []) { if (u.id === id) return u; const r = rec(u.children); if (r) return r; } return null; };
  return id ? rec(sj?.units) : null;
}
export function unitPath(sj, id) { // 맨 위 폴더부터 해당 단원까지
  const rec = (arr, acc) => { for (const u of arr || []) { const p = [...acc, u]; if (u.id === id) return p; const r = rec(u.children, p); if (r) return r; } return null; };
  return rec(sj?.units, []) || [];
}
export const unitIds = (u) => [u.id, ...(u.children || []).flatMap(unitIds)]; // 자신 + 모든 하위 단원 id
export function flatUnits(units, depth = 0, trail = []) {
  return (units || []).flatMap((u) => [{ u, depth, trail: [...trail, u.name] }, ...flatUnits(u.children, depth + 1, [...trail, u.name])]);
}
export const unitOf = (f) => findUnit(subj(f.subject), f.unit);
export const created = (f) => Number(f.createdAt) || 0;
export const isNew = (f) => created(f) > 0 && Date.now() - created(f) < 7 * DAY;
export const hasPreview = (f) => !!f.previewId || f.previewSrc === 'upload';
export const visibleFiles = () => S.files.filter((f) => f.visible !== false);

// 이 자료의 "잠금"이 풀려 있나? (관리자 / M패스 / 구매)
// 무료 자료는 모두에게, 프리미엄은 관리자 / 구매한 사람 / M패스로 받은 사람에게 열려요.
export const unlocked = (f) => f.tier === 'free' || S.isAdmin || S.owned.has(f.id);
export const canMain = (f) => unlocked(f);
export const canSol = (f) => !!f.hasSolution && unlocked(f);
// 포인트로 살 수 있는 상태인가?
export const buyable = (f) => !unlocked(f) && Number(f.price) > 0;
// M패스로 받을 수 있나? (패스가 있고 남은 건수가 있을 때)
export const claimable = (f) => !unlocked(f) && S.pass.active && S.pass.left > 0;
