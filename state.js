import { DAY } from './util.js?v=25';

// 앱 전체가 같이 쓰는 상태. (여러 모듈이 같은 객체를 보기 때문에 한 곳에 모아뒀어요)
export const S = {
  DEMO: false,
  api: null,
  user: null,
  isAdmin: false, // OWNER 또는 ADMIN (예전의 "관리자" — 모든 관리 기능)
  role: null,     // 'owner' | 'admin' | 'teacher' | 'mod' | null  (staff_roles.sql)
  hasPass: false,
  pass: { active: false, left: 0, quota: 0, used: 0, expires: null, plan: '' },
  points: 0,
  owned: new Set(),   // 지금 유효한(30일 안) 구매/M패스 자료
  exp: new Map(),     // 자료 id → 만료 시각(ms)
  expired: new Set(), // 30일이 지나 만료된 자료 id
  dl: new Set(),      // 받은 적 있는 파일 'id:main' / 'id:solution'
  myGroups: new Set(), // v14: 내가 속한 그룹 id
  groups: [],          // v14: 그룹 목록 [{id, name}] (자료 권한이 있는 직원만 불러와요)
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

/* ---- 직원 권한 (schema 의 staff_roles.sql → staff_can() 과 같은 표예요. 바꾸면 둘 다 바꿔요) ----
   content 자료·과목·단원·파일 올리기/고치기 · notice 공지 · pass M패스 · charge 충전 승인
   finance_read 포인트·내역 보기 · members 회원 관리 · moderate 글·댓글 삭제 · roles_basic TEACHER/MOD 임명 · roles_admin ADMIN 임명 */
export const ROLES = {
  owner: { label: 'OWNER', desc: '최상위 · 모든 권한 + ADMIN 임명' },
  admin: { label: 'ADMIN', desc: '모든 관리 권한 (ADMIN 임명은 불가)' },
  teacher: { label: 'TEACHER', desc: '자료·과목·단원·파일 올리기' },
  mod: { label: 'MOD', desc: '관리만: 공지 · M패스 · 충전 승인' },
};
const PERMS = {
  owner: () => true,
  admin: (p) => p !== 'roles_admin',
  teacher: (p) => p === 'content' || p === 'review',
  mod: (p) => ['notice', 'pass', 'charge', 'finance_read', 'members', 'moderate'].includes(p),
};
export const can = (perm) => !!(S.role && PERMS[S.role] && PERMS[S.role](perm));
export const roleBadge = () => (S.role ? `<i class="badge role ${S.role}">${ROLES[S.role].label}</i>` : '');

// 이 자료의 "잠금"이 풀려 있나? (직원(자료 권한) / M패스 / 구매)
// 무료 자료는 모두에게, 프리미엄은 자료 권한이 있는 직원 / 구매한 사람 / M패스로 받은 사람에게 열려요.
// v14: "특정 그룹만 허용"인 자료는 그 그룹 회원(또는 자료 권한 직원)만 받을 수 있어요. 제한이 없으면 항상 true.
export const groupOk = (f) => !(f.allowGroups && f.allowGroups.length) || can('content') || f.allowGroups.some((g) => S.myGroups.has(g));
export const groupLocked = (f) => !groupOk(f);
export const unlocked = (f) => groupOk(f) && (f.tier === 'free' || can('content') || S.owned.has(f.id));
export const canMain = (f) => unlocked(f);
export const canSol = (f) => !!f.hasSolution && unlocked(f);
// 포인트로 살 수 있는 상태인가?
export const buyable = (f) => groupOk(f) && !unlocked(f) && Number(f.price) > 0;
// M패스로 받을 수 있나? (패스가 있고 남은 건수가 있을 때)
export const claimable = (f) => groupOk(f) && !unlocked(f) && S.pass.active && S.pass.left > 0;
// v14: 문제/해설 PDF 가 몇 장인가? 목록이 비어 있으면 예전처럼 한 장(main.pdf / solution.pdf)
export const partsOf = (f, kind) => {
  const a = kind === 'solution' ? f.solutionFiles : f.mainFiles;
  return Array.isArray(a) && a.length ? a : [{ p: `${kind === 'solution' ? 'solution' : 'main'}.pdf`, n: '' }];
};
export const isMulti = (f, kind) => (kind === 'solution' ? f.solutionSrc : f.mainSrc) === 'upload' && partsOf(f, kind).length > 1;

/* ---- v11: 다운로드 기록(회색 버튼) · 30일 만료 ---- */
const DLKEY = 'mcom_dl';
export const dlKey = (id, kind) => `${id}:${kind === 'solution' ? 'solution' : 'main'}`;
export const hasDl = (id, kind) => S.dl.has(dlKey(id, kind));
export function loadLocalDl() {
  try { const a = JSON.parse(localStorage.getItem(DLKEY) || '[]'); if (Array.isArray(a)) a.forEach((k) => S.dl.add(String(k))); } catch { /* 저장소를 못 써도 괜찮아요 */ }
}
export function saveLocalDl() {
  try { localStorage.setItem(DLKEY, JSON.stringify([...S.dl].slice(-2000))); } catch { /* 무시 */ }
}
// 남은 일수 (올림). 만료 정보가 없으면 null
export const daysLeft = (id) => { const t = S.exp.get(id); return t ? Math.max(0, Math.ceil((t - Date.now()) / 86400000)) : null; };
export const isExpired = (f) => S.expired.has(f.id) && !S.owned.has(f.id);
