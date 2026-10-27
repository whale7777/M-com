import { $, $$, esc, clone, uid, safeColor, fmtDate, fmtDT, num, ID_RE, toast, extractDriveId, saveBlob, move, DAY, MAX_UPLOAD_MB, fmtSize, STORAGE_QUOTA_MB, RENDER_URL } from './util.js?v=18';
import { S, subj, unitOf, created, flatUnits, unitIds, can, ROLES } from './state.js?v=18';
import { DEFAULT_MENU } from './defaults.js?v=18';

let editId = null, taxDraft = null, taxDirty = false, bannerDraft = null, bannerDirty = false, menuDraft = null, menuDirty = false;
let passCache = [], pointsCache = [], chargesCache = [], ledgerCache = [];

function passStatus(p) {
  if (p.active === false) return { k: 'off', label: '비활성' };
  if (!p.expires) return { k: 'ok', label: '무기한' };
  const left = Math.ceil((new Date(p.expires + 'T23:59:59') - Date.now()) / DAY);
  if (left < 0) return { k: 'exp', label: '만료됨' };
  return { k: left <= 7 ? 'soon' : 'ok', label: `D-${left}` };
}
const passActive = (p) => ['ok', 'soon'].includes(passStatus(p).k);
const FAIL = '저장 실패 (schema.sql 실행 / 관리자 계정 확인)';

/* ---- 열기 / 탭 ---- */
// 탭마다 필요한 권한(data-perm). "@admin" 은 OWNER/ADMIN 만
const tabAllowed = (el) => { const p = el.dataset.perm; return !p || (p === '@admin' ? S.isAdmin : can(p)); };
function applyRolePerms() {
  $$('#dlgAdmin .tab[data-perm]').forEach((b) => b.classList.toggle('hidden', !tabAllowed(b)));
  $$('#dlgAdmin [data-perm]:not(.tab)').forEach((el) => el.classList.toggle('hidden', !tabAllowed(el)));
  const head = $('#dlgAdmin .dlg-head h3');
  if (head) head.textContent = `⚙️ 관리자 패널${S.role ? ' · ' + ROLES[S.role].label : ''}`;
}
export async function openAdmin(startTab = 'tabDash') {
  $('#dlgAdmin').showModal();
  applyRolePerms();
  const first = $$('#dlgAdmin .tab').find((b) => !b.classList.contains('hidden'));
  const startBtn = $(`#dlgAdmin .tab[data-tab="${startTab}"]`);
  if (!startBtn || startBtn.classList.contains('hidden')) startTab = first ? first.dataset.tab : startTab;
  fillSubjectSelects();
  taxDraft = clone(S.tax); taxDirty = false; renderTaxAdmin();
  bannerDraft = clone(S.site.banners || []); bannerDirty = false; renderBannerAdmin();
  menuDraft = clone(S.site.menu && S.site.menu.length ? S.site.menu : DEFAULT_MENU); menuDirty = false; renderMenuAdmin();
  fillSiteForm();
  fillPassPlans();
  await Promise.all([refreshPass(), refreshPoints()]);
  switchTab(startTab);
}
// 자료 만들기/고치기는 설정 창이 아니라 자료 페이지에서 해요
const goPage = (hash) => { $('#dlgAdmin').close?.(); location.hash = hash; };
export const openAdminNewFile = (sid, unitId) => goPage(`#/new?s=${encodeURIComponent(sid || '')}&u=${encodeURIComponent(unitId || '')}`);
export const openAdminEditFile = (id) => goPage(`#/f/${encodeURIComponent(id)}`);
function switchTab(id) {
  $$('#dlgAdmin .tab').forEach((x) => x.classList.toggle('active', x.dataset.tab === id));
  $$('#dlgAdmin .tabpane').forEach((p) => p.classList.toggle('hidden', p.id !== id));
  if (id === 'tabDash') renderDash();
  if (id === 'tabFiles') renderAdminFiles();
  if (id === 'tabPass') refreshPass().then(renderAdminPass);
  if (id === 'tabPoints') refreshPoints().then(renderAdminPoints);
  if (id === 'tabStaff') refreshStaff().then(renderStaff);
  if (id === 'tabStorage') renderStorage();
}

/* ---- 대시보드 ---- */
function renderDash() {
  const files = S.files;
  const shown = files.filter((f) => f.visible !== false).length;
  const dl = files.reduce((n, f) => n + (f.downloads || 0), 0);
  const active = passCache.filter(passActive).length;
  const soon = passCache.filter((p) => passStatus(p).k === 'soon').length;
  const pend = chargesCache.filter((c) => c.status === 'pending').length;
  const held = pointsCache.reduce((n, p) => n + (p.balance || 0), 0);
  const sold = ledgerCache.filter((l) => l.kind === 'purchase').length;
  const top = [...files].sort((a, b) => (b.downloads || 0) - (a.downloads || 0)).slice(0, 5);
  const max = Math.max(1, ...top.map((f) => f.downloads || 0));
  const maxS = Math.max(1, ...S.tax.map((s) => files.filter((f) => f.subject === s.id).length));
  $('#dash').innerHTML = `
    ${pend ? `<div class="alert-box">🪙 처리할 충전 신청이 <b>${pend}건</b> 있어요. <button class="btn sm primary" data-tab="tabPoints" type="button">확인하기</button></div>` : ''}
    <div class="kpis">
      <div class="kpi"><b>${files.length}</b><span>전체 자료 (공개 ${shown} · 숨김 ${files.length - shown})</span></div>
      <div class="kpi"><b>${num(dl)}</b><span>누적 다운로드</span></div>
      <div class="kpi"><b>${active}</b><span>활성 M패스${soon ? ` · 곧 만료 ${soon}` : ''}</span></div>
      <div class="kpi"><b>${num(held)}</b><span>회원 보유 포인트 합계</span></div>
      <div class="kpi"><b>${sold}</b><span>포인트 구매 건수 (최근 100건 내)</span></div>
      <div class="kpi"><b>${files.filter((f) => f.tier === 'premium').length}</b><span>프리미엄 자료</span></div>
    </div>
    <div class="dash-cols">
      <div><h4>🔥 인기 자료 TOP 5</h4>${top.length ? top.map((f) => `
        <div class="hbar"><span class="t">${esc(f.title)}</span><span class="track"><span class="fill" style="width:${Math.round((f.downloads || 0) / max * 100)}%"></span></span><em>${f.downloads || 0}</em></div>`).join('') : '<p class="note">아직 자료가 없어.</p>'}</div>
      <div><h4>📚 과목별 자료 수</h4>${S.tax.map((s) => {
        const n = files.filter((f) => f.subject === s.id).length;
        return `<div class="hbar" style="--c:${safeColor(s.color)}"><span class="t">${esc(s.emoji)} ${esc(s.name)}</span><span class="track"><span class="fill" style="width:${Math.round(n / maxS * 100)}%"></span></span><em>${n}</em></div>`;
      }).join('')}</div>
    </div>`;
}

/* ---- 자료 관리 ---- */
function fillSubjectSelects() {
  const opts = S.tax.map((s) => `<option value="${esc(s.id)}">${esc(s.emoji)} ${esc(s.name)}</option>`).join('');
  const cur = $('#aFilter').value;
  $('#aFilter').innerHTML = '<option value="">모든 과목</option><option value="__hidden">숨김(초안)만</option><option value="__pinned">고정한 자료만</option>' + opts;
  $('#aFilter').value = cur || '';
}
function renderAdminFiles() {
  const q = $('#aSearch').value.trim().toLowerCase();
  const flt = $('#aFilter').value;
  const list = S.files.filter((f) =>
    (!flt || (flt === '__hidden' ? f.visible === false : flt === '__pinned' ? f.pinned : f.subject === flt)) &&
    (!q || f.title.toLowerCase().includes(q))).sort((a, b) => created(b) - created(a));
  $('#adminFiles').innerHTML = list.length ? list.map((f) => {
    const sj = subj(f.subject), un = unitOf(f), id = esc(f.id);
    return `<div class="item ${f.visible === false ? 'dim' : ''}">
      <div>${f.pinned ? '📌 ' : ''}${esc(f.title)}
        <small>${esc(sj ? sj.name : '미분류')}${un ? ' › ' + esc(un.name) : ''} · ${f.tier === 'free' ? '무료' : '프리미엄'}${f.price ? ` · 🪙${num(f.price)}P` : ''}${f.hasSolution ? ' · 해설' : ''} · 난이도 ${f.level || 1} · ⬇ ${f.downloads || 0}${f.visible === false ? ' · 숨김' : ''}</small></div>
      <div class="item-btns">
        <button class="btn sm ${f.pinned ? 'on' : ''}" data-fpin="${id}" type="button">📌 고정</button>
        <button class="btn sm" data-fvis="${id}" type="button">${f.visible === false ? '공개하기' : '숨기기'}</button>
        <button class="btn sm" data-fedit="${id}" type="button">열어서 수정</button>
        <button class="btn sm danger" data-fdel="${id}" type="button">삭제</button>
      </div></div>`;
  }).join('') : '<p class="note">조건에 맞는 자료가 없어.</p>';
}
/* ---- 과목·단원 ---- */
function markTaxDirty() {
  taxDirty = true;
  $('#btnSaveTax').disabled = false;
  $('#taxDirtyMsg').classList.remove('hidden');
}
function unitRows(units, path) {
  return units.map((u, j) => {
    const p = [...path, j].join('.');
    return `<div class="unit-node" data-p="${p}">
      <div class="unit-row">
        <input data-f="uname" value="${esc(u.name)}" aria-label="폴더 이름">
        <button class="btn sm" data-umove="up" type="button">↑</button>
        <button class="btn sm" data-umove="down" type="button">↓</button>
        <button class="btn sm" data-uchild type="button" title="이 안에 하위 폴더 만들기">＋하위</button>
        <button class="btn sm danger" data-udel type="button">✕</button>
      </div>
      ${(u.children || []).length ? `<div class="units sub">${unitRows(u.children, [...path, j])}</div>` : ''}
    </div>`;
  }).join('');
}
// "0.2.1" 같은 위치 → 그 단원이 들어있는 배열과 번호
function unitAt(si, p) {
  const idx = p.split('.').map(Number);
  let arr = taxDraft[si].units;
  for (const i of idx.slice(0, -1)) arr = arr[i].children;
  return { arr, i: idx[idx.length - 1], node: arr[idx[idx.length - 1]] };
}
function renderTaxAdmin() {
  $('#taxList').innerHTML = taxDraft.map((s, i) => `
    <div class="tax-card" data-si="${i}">
      <div class="tax-head">
        <input class="emo" data-f="emoji" value="${esc(s.emoji)}" maxlength="4" aria-label="이모지">
        <input class="grow" data-f="name" value="${esc(s.name)}" aria-label="과목 이름">
        <input type="color" data-f="color" value="${safeColor(s.color)}" aria-label="색">
        <button class="btn sm" data-smove="up" type="button">↑</button>
        <button class="btn sm" data-smove="down" type="button">↓</button>
        <button class="btn sm danger" data-sdel type="button">삭제</button>
      </div>
      <div class="units">${unitRows(s.units || [], [])}</div>
      <div class="unit-add">
        <input data-f="newunit" placeholder="새 단원 이름 (예: 천문)">
        <button class="btn sm primary" data-uadd type="button">＋ 단원</button>
      </div>
    </div>`).join('') || '<p class="note">과목이 하나도 없어. 아래에서 추가해줘.</p>';
  $('#btnSaveTax').disabled = !taxDirty;
  $('#taxDirtyMsg').classList.toggle('hidden', !taxDirty);
}
function addUnit(card) {
  const input = $('[data-f=newunit]', card);
  const name = input.value.trim();
  if (!name) return toast('단원 이름을 적어줘');
  taxDraft[+card.dataset.si].units.push({ id: uid('u'), name });
  markTaxDirty(); renderTaxAdmin();
}
async function saveTax() {
  for (const s of taxDraft) {
    s.name = s.name.trim();
    s.emoji = (s.emoji || '').trim() || '📘';
    const clean = (arr) => (arr || []).map((u) => { const c = clean(u.children); const o = { ...u, name: u.name.trim() }; if (c.length) o.children = c; else delete o.children; return o; }).filter((u) => u.name);
    s.units = clean(s.units);
  }
  if (taxDraft.some((s) => !s.name)) return toast('이름이 빈 과목이 있어');
  try {
    await S.api.saveTax(taxDraft);
    S.tax = clone(taxDraft); taxDirty = false;
    fillSubjectSelects(); renderTaxAdmin(); await S.hooks.route();
    toast('과목·단원 저장 완료 ✨');
  } catch (err) { console.error(err); toast(FAIL); }
}

/* ---- M포인트 ---- */
async function refreshPoints() {
  try { [pointsCache, chargesCache, ledgerCache] = await Promise.all([S.api.listPoints(), S.api.listCharges(), S.api.listLedger()]); }
  catch (e) { console.error(e); pointsCache = []; chargesCache = []; ledgerCache = []; }
}
const CH_ST = { pending: ['대기중', 'soon'], done: ['완료', 'ok'], rejected: ['거절', 'exp'] };
function renderAdminPoints() {
  const pend = chargesCache.filter((c) => c.status === 'pending');
  const done = chargesCache.filter((c) => c.status !== 'pending').slice(0, 8);
  $('#chargeList').innerHTML = pend.length ? pend.map((c) => `<div class="item"><div><b>${esc(c.username)}</b> · ${c.plan ? `👑 M패스 ${esc((S.site.passPlans || []).find((x) => x.id === c.plan)?.name || c.plan)} · ${num(c.amount)}원` : `${num(c.amount)} P`}
      <small>입금자명 ${esc(c.depositor || '-')} · ${fmtDT(c.at)}</small></div>
      <div class="item-btns"><button class="btn sm primary" data-cok="${esc(c.id)}" type="button">입금 확인 · 승인</button>
      <button class="btn sm danger" data-cno="${esc(c.id)}" type="button">거절</button></div></div>`).join('')
    : '<p class="note">대기 중인 충전 신청이 없어요 👍</p>';
  $('#chargeDone').innerHTML = done.length ? done.map((c) => `<div class="item dim"><div>${esc(c.username)} · ${c.plan ? `M패스 ${esc((S.site.passPlans || []).find((x) => x.id === c.plan)?.name || c.plan)} · ${num(c.amount)}원` : `${num(c.amount)} P`} <small>${fmtDT(c.at)} · ${esc(c.depositor || '-')}</small></div>
    <i class="pill ${CH_ST[c.status]?.[1] || ''}">${CH_ST[c.status]?.[0] || c.status}</i></div>`).join('') : '';
  const q = $('#ptSearch').value.trim().toLowerCase();
  const list = pointsCache.filter((p) => !q || p.username.toLowerCase().includes(q)).sort((a, b) => b.balance - a.balance);
  $('#pointList').innerHTML = list.length ? list.map((p) => `<div class="item"><div>${esc(p.username)} <b class="pts-b">🪙 ${num(p.balance)} P</b></div>
    <div class="item-btns">${S.isAdmin ? `<button class="btn sm" data-padj="${esc(p.username)}" type="button">조정</button>` : ''}</div></div>`).join('') : '<p class="note">포인트를 가진 회원이 아직 없어요.</p>';
  $('#ledgerList').innerHTML = ledgerCache.length ? `<div class="tbl"><div class="tr th"><span>일시</span><span>회원</span><span>내용</span><span>변동</span><span>잔액</span></div>${ledgerCache.slice(0, 50).map((l) =>
    `<div class="tr"><span>${fmtDT(l.at)}</span><span>${esc(l.username)}</span><span>${{ grant: '지급', deduct: '차감', charge: '충전', purchase: '구매' }[l.kind] || ''} ${esc(l.memo || '')}</span><span class="${l.delta >= 0 ? 'plus' : 'minus'}">${l.delta >= 0 ? '+' : ''}${num(l.delta)}</span><span>${num(l.balance_after)}</span></div>`).join('')}</div>` : '<p class="note">내역이 없어요.</p>';
}
async function submitPoints(e) {
  e.preventDefault();
  const fd = Object.fromEntries(new FormData(e.target));
  const names = [...new Set(fd.names.split(/[\s,;]+/).map((x) => x.trim().toLowerCase()).filter(Boolean))];
  const delta = Math.trunc(Number(fd.delta));
  if (!names.length) return toast('PyNest ID를 입력해줘');
  const bad = names.filter((x) => !ID_RE.test(x));
  if (bad.length) return toast(`ID 형식이 이상해: ${bad[0]}`);
  if (!delta || Math.abs(delta) > 10000000) return toast('변동 포인트를 확인해줘 (0 불가, +지급 / −차감)');
  try {
    const miss = [], short = [];
    for (const n of names) {
      const r = await S.api.adjustPoints(n, delta, fd.memo.trim());
      if (r === 'not_found') miss.push(n); else if (r === 'insufficient') short.push(n);
    }
    e.target.reset();
    await refreshPoints(); renderAdminPoints(); renderDash();
    const ok = names.length - miss.length - short.length;
    toast([`${ok}명 처리 완료`, miss.length ? `가입 안 된 ID: ${miss.join(', ')}` : '', short.length ? `잔액 부족: ${short.join(', ')}` : ''].filter(Boolean).join(' · '));
  } catch (err) { console.error(err); toast('처리 실패 (schema.sql 실행 / 관리자 계정 확인)'); }
}
async function resolveCharge(id, approve) {
  if (approve ? false : !confirm('이 충전 신청을 거절할까?')) return;
  try {
    const r = await S.api.resolveCharge(id, approve);
    await refreshPoints(); await refreshPass(); renderAdminPoints(); renderDash();
    toast(r === 'ok' ? (approve ? '승인했어! 반영됐어 ✅' : '거절했어') : r === 'plan_missing' ? '이 M패스 플랜이 지금 없어요 (사이트 설정 확인)' : r === 'already_done' ? '이미 처리된 신청이야' : '신청을 찾을 수 없어');
  } catch (err) { console.error(err); toast('처리 실패'); }
}

/* ---- 권한 (OWNER / ADMIN / TEACHER / MOD) ---- */
let staffCache = [];
const ROLE_ORDER = { owner: 0, admin: 1, teacher: 2, mod: 3 };
async function refreshStaff() {
  try { staffCache = await S.api.staffList(); }
  catch (e) { console.error(e); staffCache = null; }
}
const STAFF_MSG = { not_found: '가입된 ID가 아니에요', self: '자기 자신의 역할은 바꿀 수 없어요', is_owner: 'OWNER 는 바꿀 수 없어요', forbidden: 'ADMIN 임명·해임은 OWNER 만 할 수 있어요', invalid: '역할이 올바르지 않아요' };
function renderStaff() {
  const sel = $('#staffRoleSel');
  if (sel) {
    const opts = [['teacher', 'TEACHER · 자료 올리기'], ['mod', 'MOD · 관리만']];
    if (can('roles_admin')) opts.unshift(['admin', 'ADMIN · 모든 관리']);
    sel.innerHTML = opts.map(([v, l]) => `<option value="${v}">${l}</option>`).join('');
  }
  if (!staffCache) { $('#staffList').innerHTML = '<p class="note">직원 목록을 불러오지 못했어요. <b>staff_roles.sql</b> 을 Supabase SQL Editor 에서 한 번 실행했는지 확인해줘.</p>'; return; }
  const rows = [...staffCache].sort((a, b) => (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9) || a.username.localeCompare(b.username));
  $('#staffList').innerHTML = rows.length ? rows.map((r) => {
    const fixed = r.role === 'owner' || r.username === S.user?.username;
    const canEdit = !fixed && (r.role !== 'admin' || can('roles_admin'));
    const btn = (role, label) => (r.role !== role && (role !== 'admin' || can('roles_admin')) ? `<button class="btn sm" data-srole="${esc(r.username)}|${role}" type="button">${label}</button>` : '');
    return `<div class="item"><div><i class="badge role ${esc(r.role)}">${esc(ROLES[r.role]?.label || r.role)}</i> <b>${esc(r.username)}</b>
      <small>${esc(ROLES[r.role]?.desc || '')}${r.at ? ' · ' + fmtDate(new Date(r.at)) : ''}${r.username === S.user?.username ? ' · 나' : ''}</small></div>
      <div class="item-btns">${canEdit ? `${btn('admin', 'ADMIN으로')}${btn('teacher', 'TEACHER로')}${btn('mod', 'MOD로')}<button class="btn sm danger" data-srole="${esc(r.username)}|none" type="button">해임</button>` : ''}</div></div>`;
  }).join('') : '<p class="note">직원이 아직 없어요.</p>';
}
async function setStaffRole(name, role) {
  if (role === 'none' && !confirm(`${name} 님의 직원 권한을 해임할까?`)) return;
  try {
    const r = await S.api.staffSet(name, role);
    if (r !== 'ok') return toast(STAFF_MSG[r] || '처리하지 못했어요');
    await refreshStaff(); renderStaff();
    toast(role === 'none' ? '해임했어' : `${ROLES[role].label} 로 지정했어 ✨`);
  } catch (err) { console.error(err); toast('처리 실패 (staff_roles.sql 실행 / OWNER·ADMIN 계정 확인)'); }
}
async function submitStaff(e) {
  e.preventDefault();
  const fd = Object.fromEntries(new FormData(e.target));
  const name = String(fd.name || '').trim().toLowerCase();
  if (!ID_RE.test(name)) return toast('ID 형식이 이상해');
  await setStaffRole(name, fd.role);
  e.target.reset(); renderStaff();
}

/* ---- M패스 ---- */
async function refreshPass() {
  try { passCache = await S.api.listPass(); } catch (e) { console.error(e); passCache = []; }
}
function renderAdminPass() {
  const q = $('#pSearch').value.trim().toLowerCase();
  const order = { soon: 0, ok: 1, exp: 2, off: 3 };
  const list = passCache.filter((p) => !q || `${p.name} ${p.memo || ''}`.toLowerCase().includes(q))
    .sort((a, b) => order[passStatus(a).k] - order[passStatus(b).k] || a.name.localeCompare(b.name));
  $('#adminPass').innerHTML = list.length ? list.map((p) => {
    const st = passStatus(p), id = esc(p.id);
    return `<div class="item"><div>${esc(p.name)} <i class="pill ${st.k}">${st.label}</i>
      <small>${p.plan ? esc(p.plan) + ' · ' : ''}남은 <b>${num(Math.max((p.quota || 0) - (p.used || 0), 0))}</b>건 / 총 ${num(p.quota || 0)}건 · ${esc(p.memo || '메모 없음')} · ${p.expires ? p.expires + '까지' : '기간 제한 없음'}</small></div>
      <div class="item-btns">
        <button class="btn sm" data-pq="${id}" data-n="10" type="button">+10건</button>
        ${p.expires ? `<button class="btn sm" data-pext="${id}" data-m="1" type="button">+1개월</button>` : ''}
        <button class="btn sm danger" data-prm="${id}" type="button">회수</button>
      </div></div>`;
  }).join('') : '<p class="note">M패스 보유자가 없어.</p>';
}
async function extendPass(id, months) {
  const p = passCache.find((x) => x.id === id);
  if (!p || !p.expires) return;
  const d = new Date(Math.max(new Date(p.expires + 'T23:59:59').getTime(), Date.now()));
  d.setMonth(d.getMonth() + months);
  try {
    await S.api.setPass(p.name, fmtDate(d), p.memo, Math.max((p.quota || 0) - (p.used || 0), 0), p.plan);
    await refreshPass(); renderAdminPass(); toast(`${fmtDate(d)}까지 연장했어 ✨`);
  } catch (err) { console.error(err); toast('연장 실패'); }
}
async function addQuota(id, n) {
  const p = passCache.find((x) => x.id === id);
  if (!p) return;
  try {
    await S.api.setPass(p.name, p.expires || null, p.memo, Math.max((p.quota || 0) - (p.used || 0), 0) + n, p.plan);
    await refreshPass(); renderAdminPass(); toast(`${n}건 추가했어 ✨`);
  } catch (err) { console.error(err); toast('추가 실패'); }
}
function fillPassPlans() {
  const sel = $('#passPlanSel');
  const plans = (S.site.passPlans || []);
  sel.innerHTML = '<option value="">(직접 입력)</option>' + plans.map((p) => `<option value="${esc(p.id)}">${esc(p.name)} · ${num(p.quota)}건 · ${num(p.days)}일</option>`).join('');
}
async function submitPass(e) {
  e.preventDefault();
  const fd = Object.fromEntries(new FormData(e.target));
  const names = [...new Set(fd.names.split(/[\s,;]+/).map((x) => x.trim().toLowerCase()).filter(Boolean))];
  if (!names.length) return toast('PyNest ID를 입력해줘');
  const bad = names.filter((x) => !ID_RE.test(x));
  if (bad.length) return toast(`ID 형식이 이상해: ${bad[0]}`);
  try {
    const missing = [];
    for (const n of names) {
      if ((await S.api.setPass(n, fd.expires || null, fd.memo.trim(), Number(fd.quota) || 0, (S.site.passPlans || []).find((p) => p.id === fd.plan)?.name || '')) === 'not_found') missing.push(n);
    }
    e.target.reset();
    await refreshPass(); renderAdminPass();
    const done = names.length - missing.length;
    toast(missing.length ? `${done}명 부여 · 가입 안 된 ID: ${missing.join(', ')}` : `${done}명에게 M패스 부여 완료 ✨`);
  } catch (err) { console.error(err); toast('부여 실패 (schema.sql 실행 / 관리자 계정 확인)'); }
}

/* ---- 배너 ---- */
function markBannerDirty() {
  bannerDirty = true;
  $('#btnSaveBanner').disabled = false;
  $('#bannerDirtyMsg').classList.remove('hidden');
}
function renderBannerAdmin() {
  $('#bannerList').innerHTML = bannerDraft.map((b, i) => `
    <div class="tax-card" data-bi="${i}">
      <div class="tax-head">
        <label class="check"><input type="checkbox" data-bf="on" ${b.on !== false ? 'checked' : ''}> 표시</label>
        <input class="emo" data-bf="emoji" value="${esc(b.emoji || '')}" maxlength="4" aria-label="이모지">
        <input type="color" data-bf="color" value="${safeColor(b.color)}" aria-label="배경색">
        <span class="grow"></span>
        <button class="btn sm" data-bmove="up" type="button">↑</button>
        <button class="btn sm" data-bmove="down" type="button">↓</button>
        <button class="btn sm danger" data-bdel type="button">삭제</button>
      </div>
      <div class="form">
        <label>제목 (줄바꿈 가능)<textarea data-bf="title" rows="2">${esc(b.title || '')}</textarea></label>
        <label>설명<input data-bf="sub" value="${esc(b.sub || '')}"></label>
        <div class="row"><label>버튼 글자<input data-bf="cta" value="${esc(b.cta || '')}"></label>
          <label class="grow">연결 주소 (#/pass, #/points, https://…, PyNest 는 @pynest)<input data-bf="link" value="${esc(b.link || '')}"></label></div>
      </div></div>`).join('') || '<p class="note">배너가 없어요. 아래에서 추가해줘.</p>';
  $('#btnSaveBanner').disabled = !bannerDirty;
  $('#bannerDirtyMsg').classList.toggle('hidden', !bannerDirty);
}
async function saveBanners() {
  const next = bannerDraft.map((b) => ({ ...b, title: (b.title || '').trim(), sub: (b.sub || '').trim(), cta: (b.cta || '').trim(), link: (b.link || '').trim() })).filter((b) => b.title);
  try {
    const site = { ...S.site, banners: next };
    await S.api.saveSite(site);
    S.site = site; bannerDraft = clone(next); bannerDirty = false;
    renderBannerAdmin(); await S.hooks.route();
    toast('배너 저장 완료 ✨');
  } catch (err) { console.error(err); toast(FAIL); }
}

/* ---- 메뉴 (왼쪽 ☰ 패널) ---- */
function markMenuDirty() {
  menuDirty = true;
  $('#btnSaveMenu').disabled = false;
  $('#menuDirtyMsg').classList.remove('hidden');
}
const MENU_KIND = { link: '링크', heading: '구분 제목', subjects: '과목·단원 자동 목록' };
function renderMenuAdmin() {
  $('#menuList').innerHTML = menuDraft.map((m, i) => `
    <div class="tax-card menu-card" data-mi="${i}">
      <div class="tax-head">
        <label class="check"><input type="checkbox" data-mf="on" ${m.on !== false ? 'checked' : ''}> 표시</label>
        <i class="pill">${MENU_KIND[m.type] || m.type}</i>
        ${m.type === 'link' ? `<input class="emo" data-mf="emoji" value="${esc(m.emoji || '')}" maxlength="4" aria-label="이모지">` : ''}
        ${m.type === 'subjects' ? '<span class="grow note" style="margin:0">과목·단원 탭에서 만든 과목이 자동으로 들어가요</span>'
          : `<input class="grow" data-mf="label" value="${esc(m.label || '')}" aria-label="이름" placeholder="${m.type === 'heading' ? '구분 제목' : '메뉴 이름'}">`}
        <button class="btn sm" data-mmove="up" type="button">↑</button>
        <button class="btn sm" data-mmove="down" type="button">↓</button>
        <button class="btn sm danger" data-mdel type="button">삭제</button>
      </div>
      ${m.type === 'link' ? `<div class="form"><label>연결 주소 (#/pass, #/list?tier=free, https://…, PyNest 는 @pynest)<input data-mf="link" value="${esc(m.link || '')}"></label></div>` : ''}
    </div>`).join('') || '<p class="note">메뉴가 비어 있어요. 아래에서 추가해줘. (비워두고 저장하면 기본 메뉴로 돌아가요)</p>';
  $('#btnSaveMenu').disabled = !menuDirty;
  $('#menuDirtyMsg').classList.toggle('hidden', !menuDirty);
}
async function saveMenu() {
  const next = menuDraft.map((m) => ({ ...m, label: (m.label || '').trim(), link: (m.link || '').trim(), emoji: (m.emoji || '').trim() }))
    .filter((m) => m.type === 'subjects' || m.label);
  if (next.some((m) => m.type === 'link' && !m.link)) return toast('연결 주소가 빈 메뉴가 있어');
  try {
    const site = { ...S.site, menu: next.length ? next : clone(DEFAULT_MENU) };
    await S.api.saveSite(site);
    S.site = site; menuDraft = clone(site.menu); menuDirty = false;
    renderMenuAdmin(); await S.hooks.route();
    toast('메뉴 저장 완료 ✨ (☰ 눌러서 확인해봐)');
  } catch (err) { console.error(err); toast(FAIL); }
}

/* ---- 사이트 설정 ---- */
const packsToText = (packs) => (packs || []).map((p) => `${p.p} | ${p.l}`).join('\n');
function parsePacks(text) {
  const out = [];
  for (const line of String(text || '').split('\n')) {
    const m = line.trim().match(/^(\d+)\s*[|:,]\s*(.*)$/) || line.trim().match(/^(\d+)$/);
    if (m && Number(m[1]) > 0 && Number(m[1]) <= 1000000) out.push({ p: Number(m[1]), l: (m[2] || '').trim() || `${num(m[1])}원` });
  }
  return out.slice(0, 8);
}
const plansToText = (arr) => (arr || []).map((p) => `${p.id} | ${p.name} | ${p.days} | ${p.quota} | ${p.price}`).join('\n');
function parsePlans(text) {
  const seen = new Set();
  return String(text || '').split('\n').map((l) => l.split('|').map((x) => x.trim())).filter((c) => c.length >= 5).map((c) => ({
    id: c[0].replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 20), name: c[1].slice(0, 20), days: Math.floor(Number(c[2])), quota: Math.floor(Number(c[3])), price: Math.floor(Number(c[4])),
  })).filter((p) => p.id && p.name && p.days > 0 && p.quota > 0 && p.price > 0 && !seen.has(p.id) && seen.add(p.id));
}
function fillSiteForm() {
  const f = $('#formSite').elements;
  f.noticeOn.checked = !!S.site.noticeOn;
  f.autoApprove.checked = S.site.autoApprove !== false;
  f.notice.value = S.site.notice || '';
  f.heroSub.value = S.site.heroSub || '';
  f.contact.value = S.site.contact || '';
  f.passInfo.value = S.site.passInfo || '';
  f.chargeInfo.value = S.site.chargeInfo || '';
  f.packs.value = packsToText(S.site.packs);
  f.passPlans.value = plansToText(S.site.passPlans);
  f.about.value = S.site.about || '';
}
async function submitSite(e) {
  e.preventDefault();
  const f = e.target.elements;
  const packs = parsePacks(f.packs.value);
  if (f.packs.value.trim() && !packs.length) return toast('충전 상품 형식을 확인해줘 (예: 1000 | 1,000원)');
  const plans = parsePlans(f.passPlans.value);
  if (f.passPlans.value.trim() && !plans.length) return toast('M패스 플랜 형식을 확인해줘 (예: p45 | 45일 | 45 | 15 | 3900)');
  const next = {
    ...S.site, passPlans: plans.length ? plans : S.site.passPlans, noticeOn: f.noticeOn.checked, autoApprove: f.autoApprove.checked, notice: f.notice.value.trim(), heroSub: f.heroSub.value.trim(),
    contact: f.contact.value.trim(), passInfo: f.passInfo.value.trim(), chargeInfo: f.chargeInfo.value.trim(), about: f.about.value.trim(), packs,
  };
  try { await S.api.saveSite(next); S.site = next; await S.hooks.route(); toast('설정 저장 완료 ✨'); }
  catch (err) { console.error(err); toast(FAIL); }
}
async function exportBackup() {
  try {
    const data = await S.api.exportAll();
    saveBlob(`minhyeok-com-backup-${fmtDate(new Date())}.json`, JSON.stringify({ exportedAt: new Date().toISOString(), taxonomy: S.tax, site: S.site, ...data }, null, 2));
    toast('백업 파일을 내려받았어 💾');
  } catch (err) { console.error(err); toast('백업 실패'); }
}

/* ---- 이벤트 ---- */
export function bindAdmin() {
  $('#btnNewFile').onclick = () => openAdminNewFile('', '');
  $('#aSearch').oninput = renderAdminFiles;
  $('#aFilter').onchange = renderAdminFiles;

  $('#formSubject').onsubmit = (e) => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.target));
    taxDraft.push({ id: uid('s'), name: fd.name.trim(), emoji: fd.emoji.trim() || '📘', color: fd.color, units: [] });
    e.target.reset(); markTaxDirty(); renderTaxAdmin();
  };
  $('#btnSaveTax').onclick = saveTax;
  const taxList = $('#taxList');
  taxList.addEventListener('input', (e) => {
    const el = e.target, f = el.dataset.f;
    if (!f || f === 'newunit') return;
    const s = taxDraft[+el.closest('.tax-card').dataset.si];
    if (f === 'uname') unitAt(+el.closest('.tax-card').dataset.si, el.closest('.unit-node').dataset.p).node.name = el.value;
    else s[f] = el.value;
    markTaxDirty();
  });
  taxList.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.dataset.f === 'newunit') { e.preventDefault(); addUnit(e.target.closest('.tax-card')); }
  });

  $('#bannerList').addEventListener('input', (e) => {
    const el = e.target, f = el.dataset.bf;
    if (!f) return;
    bannerDraft[+el.closest('.tax-card').dataset.bi][f] = el.type === 'checkbox' ? el.checked : el.value;
    markBannerDirty();
  });
  $('#btnAddBanner').onclick = () => {
    bannerDraft.push({ id: uid('b'), on: true, title: '새 배너 제목', sub: '', cta: '자세히 보기', link: '#/list', color: '#2f5bff', emoji: '✨' });
    markBannerDirty(); renderBannerAdmin();
  };
  $('#btnSaveBanner').onclick = saveBanners;

  $('#menuList').addEventListener('input', (e) => {
    const el = e.target, f = el.dataset.mf;
    if (!f) return;
    menuDraft[+el.closest('.menu-card').dataset.mi][f] = el.type === 'checkbox' ? el.checked : el.value;
    markMenuDirty();
  });
  const addMenu = (item) => { menuDraft.push({ id: uid('m'), on: true, ...item }); markMenuDirty(); renderMenuAdmin(); };
  $('#btnAddMenuLink').onclick = () => addMenu({ type: 'link', emoji: '🔗', label: '새 메뉴', link: '#/list' });
  $('#btnAddMenuHead').onclick = () => addMenu({ type: 'heading', label: '새 구분 제목' });
  $('#btnAddMenuSubj').onclick = () => addMenu({ type: 'subjects', label: '과목·단원 (자동)' });
  $('#btnSaveMenu').onclick = saveMenu;

  $('#ptSearch').oninput = renderAdminPoints;
  $('#formPoints').onsubmit = submitPoints;
  $('#pSearch').oninput = renderAdminPass;
  $('#formPass').onsubmit = submitPass;
  $('#passPlanSel').onchange = (e) => {
    const pl = (S.site.passPlans || []).find((p) => p.id === e.target.value);
    const f = $('#formPass').elements;
    if (!pl) return;
    f.expires.value = fmtDate(new Date(Date.now() + pl.days * DAY));
    f.quota.value = pl.quota;
  };
  $('#formSite').onsubmit = submitSite;
  $('#btnExport').onclick = exportBackup;
  $('#formStaff').onsubmit = submitStaff;
}

// 전역 클릭 위임에서 호출. 처리했으면 true
export async function adminClick(e, t) {
  const d = t.dataset;
  if (d.tab) { switchTab(d.tab); return true; }
  if (d.pq !== undefined) { await addQuota(d.pq, Number(d.n) || 10); return true; }
  if (d.fpin !== undefined) {
    const f = S.files.find((x) => x.id === d.fpin);
    await S.api.patchFile(f.id, { pinned: !f.pinned }); f.pinned = !f.pinned;
    renderAdminFiles(); S.hooks.route(); return true;
  }
  if (d.fvis !== undefined) {
    const f = S.files.find((x) => x.id === d.fvis);
    const next = f.visible === false;
    await S.api.patchFile(f.id, { visible: next }); f.visible = next;
    renderAdminFiles(); S.hooks.route(); toast(next ? '공개했어' : '숨겼어'); return true;
  }
  if (d.fedit !== undefined) { openAdminEditFile(d.fedit); return true; }
  if (d.fdel !== undefined) {
    if (!confirm('정말 삭제할까? (되돌릴 수 없어. 이 자료의 구매 기록도 같이 지워져)')) return true;
    await S.api.deleteFile(d.fdel); await S.hooks.reload(); renderAdminFiles(); renderDash(); toast('삭제했어'); return true;
  }

  const card = t.closest('#taxList .tax-card');
  if (card) {
    const si = +card.dataset.si, s = taxDraft[si];
    if (d.smove) { if (move(taxDraft, si, d.smove)) { markTaxDirty(); renderTaxAdmin(); } return true; }
    if (t.matches('[data-sdel]')) {
      const n = S.files.filter((f) => f.subject === s.id).length;
      if (!confirm(`"${s.name}" 과목을 삭제할까?${n ? `\n이 과목 자료 ${n}개는 "미분류"로 남아.` : ''}\n(저장 버튼을 눌러야 반영돼)`)) return true;
      taxDraft.splice(si, 1); markTaxDirty(); renderTaxAdmin(); return true;
    }
    if (t.matches('[data-uadd]')) { addUnit(card); return true; }
    const row = t.closest('.unit-node');
    if (row && (d.umove || t.matches('[data-udel],[data-uchild]'))) {
      const { arr, i, node } = unitAt(si, row.dataset.p);
      if (d.umove) { if (move(arr, i, d.umove)) { markTaxDirty(); renderTaxAdmin(); } return true; }
      if (t.matches('[data-uchild]')) {
        node.children = node.children || [];
        node.children.push({ id: uid('u'), name: '새 폴더' });
        markTaxDirty(); renderTaxAdmin();
        const el = $(`#taxList .tax-card[data-si="${si}"] .unit-node[data-p="${row.dataset.p}.${node.children.length - 1}"] [data-f=uname]`);
        if (el) { el.focus(); el.select(); }
        return true;
      }
      const ids = unitIds(node);
      const n = S.files.filter((f) => f.subject === s.id && ids.includes(f.unit)).length;
      if (!confirm(`"${node.name}"${ids.length > 1 ? ' 폴더와 그 안의 하위 폴더' : ''}를 삭제할까?${n ? `\n이 안의 자료 ${n}개는 "미분류"로 남아.` : ''}\n(저장 버튼을 눌러야 반영돼)`)) return true;
      arr.splice(i, 1); markTaxDirty(); renderTaxAdmin(); return true;
    }
  }

  const bcard = t.closest('#bannerList .tax-card');
  if (bcard) {
    const bi = +bcard.dataset.bi;
    if (d.bmove) { if (move(bannerDraft, bi, d.bmove)) { markBannerDirty(); renderBannerAdmin(); } return true; }
    if (t.matches('[data-bdel]')) { bannerDraft.splice(bi, 1); markBannerDirty(); renderBannerAdmin(); return true; }
  }

  const mcard = t.closest('#menuList .menu-card');
  if (mcard) {
    const mi = +mcard.dataset.mi;
    if (d.mmove) { if (move(menuDraft, mi, d.mmove)) { markMenuDirty(); renderMenuAdmin(); } return true; }
    if (t.matches('[data-mdel]')) { menuDraft.splice(mi, 1); markMenuDirty(); renderMenuAdmin(); return true; }
  }

  if (d.srole !== undefined) { const [n, r] = d.srole.split('|'); await setStaffRole(n, r); return true; }
  if (d.cok !== undefined) { await resolveCharge(d.cok, true); return true; }
  if (d.cno !== undefined) { await resolveCharge(d.cno, false); return true; }
  if (d.padj !== undefined) {
    const f = $('#formPoints').elements;
    f.names.value = d.padj; f.delta.focus();
    return true;
  }
  if (d.pext !== undefined) { await extendPass(d.pext, +d.m); return true; }
  if (d.prm !== undefined) {
    if (!confirm('M패스를 회수할까?')) return true;
    await S.api.removePass(d.prm); await refreshPass(); renderAdminPass(); toast('회수했어'); return true;
  }
  return false;
}


/* ---- 💾 저장공간 (남은 용량 + 앞으로 올릴 수 있는 자료 수 예측) ---- */
const fmtBytes = (b) => (b >= 1073741824 ? (b / 1073741824).toFixed(2) + ' GB' : b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(0, Math.round(b / 1024)) + ' KB');
async function renderStorage() {
  const box = $('#storageBox');
  box.innerHTML = '<p class="note">불러오는 중…</p>';
  let st;
  try { st = await S.api.storageStats(); }
  catch (e) {
    console.error(e);
    box.innerHTML = '<p class="file-err">저장공간 정보를 못 불러왔어요.\nschema_mhq.sql 을 SQL Editor 에서 실행했는지, 관리자 계정인지 확인해줘.</p>';
    return;
  }
  const quota = st.quotaBytes || STORAGE_QUOTA_MB * 1048576;
  const mine = Number(st.total_bytes) || 0;                  // 민혁닷컴 보관함(mh-files)
  const used = Number(st.all_bytes ?? st.total_bytes) || 0;   // 프로젝트 전체 보관함 (SQL 을 다시 실행하기 전이면 mh-files 만)
  const others = Math.max(0, used - mine);
  const left = Math.max(0, quota - used);
  const pct = Math.min(100, Math.round(used / quota * 100));
  const recent = (st.recent || []);
  const avgRecent = recent.length ? recent.reduce((n, r) => n + Number(r.bytes), 0) / recent.length : 0;
  const more = avgRecent > 0 ? Math.floor(left / avgRecent) : null;
  const aJ = Number(st.avg_json) || 0, aP = Number(st.avg_pdf) || 0;
  const moreJ = aJ > 0 ? Math.floor(left / aJ) : null, moreP = aP > 0 ? Math.floor(left / aP) : null;
  const k = st.by_kind || {};
  const level = pct >= 90 ? 'bad' : pct >= 70 ? 'warn' : 'ok';
  box.innerHTML = `
    <div class="sbar ${level}"><span class="fill" style="width:${pct}%"></span></div>
    <p class="sbar-t"><b>${fmtBytes(used)}</b> 사용 / ${fmtBytes(quota)} 중 (${pct}%) · 남은 용량 <b>${fmtBytes(left)}</b>
      <br><small class="note">${st.all_bytes === undefined ? '※ SQL(schema_mhq.sql)을 다시 실행하면 PyNest 등 다른 보관함까지 합친 전체 사용량이 나와요. 지금은 민혁닷컴 보관함만 센 값이에요.' : `민혁닷컴 보관함 ${fmtBytes(mine)} + 다른 보관함(PyNest 등) ${fmtBytes(others)}`}</small></p>
    <div class="kpis">
      <div class="kpi"><b>${more === null ? '—' : '약 ' + num(more) + '개'}</b><span>최근 ${recent.length}개 평균(${fmtBytes(avgRecent)}) 기준<br>더 올릴 수 있는 자료 수</span></div>
      <div class="kpi"><b>${num(st.set_count || 0)}</b><span>자료 폴더 · 파일 ${num(st.object_count || 0)}개</span></div>
      <div class="kpi"><b>${fmtBytes(Number(k.pdf) || 0)}</b><span>PDF 업로드 (${num(st.pdf_sets || 0)}개 자료)</span></div>
      <div class="kpi"><b>${fmtBytes((Number(k.json) || 0) + (Number(k.img) || 0))}</b><span>JSON + 이미지 (${num(st.json_sets || 0)}개 자료)</span></div>
    </div>
    ${aJ && aP ? `<div class="alert-box">📐 자료 1개당 평균: <b>JSON 방식 ${fmtBytes(aJ)}</b> vs <b>PDF 방식 ${fmtBytes(aP)}</b> → JSON 이 약 <b>${(aP / aJ).toFixed(0)}배</b> 가벼워요.
      남은 용량으로 JSON 방식이면 약 <b>${num(moreJ)}개</b>, PDF 방식이면 약 <b>${num(moreP)}개</b>.</div>`
      : `<p class="note">JSON 자료와 PDF 자료가 둘 다 생기면 방식별 평균 용량과 예상 개수를 비교해서 보여줘요.</p>`}
    <h4>🕒 최근 올린 자료 (용량 예측에 쓰는 표본)</h4>
    <table class="vt-admin"><thead><tr><th>자료</th><th>방식</th><th>용량</th><th>올린 날</th></tr></thead><tbody>${recent.map((r) => `
      <tr><td>${esc(r.title || '(삭제된 자료)')}</td><td>${r.json ? 'JSON' : 'PDF'}</td><td>${fmtBytes(Number(r.bytes))}</td><td>${fmtDT(r.at)}</td></tr>`).join('') || '<tr><td colspan="4">아직 업로드한 자료가 없어요.</td></tr>'}</tbody></table>
    <p class="note">※ 사용량은 Supabase 스토리지에서 실제로 읽어온 값이에요(모든 보관함 합계). 다만 <b>총 용량(한도)은 Supabase 가 알려주지 않아서</b> 직접 정한 값이에요 — 기준 용량은 <code>config.js</code> 의 <code>STORAGE_QUOTA_MB</code>(지금 ${STORAGE_QUOTA_MB}MB, 무료 플랜 1GB). 데이터베이스는 따로 ${fmtBytes(Number(st.db_bytes) || 0)} 쓰는 중(무료 500MB).
    ${RENDER_URL ? (st.render ? `<br>변환 서버 캐시: ${fmtBytes(st.render.bytes)} / ${fmtBytes(st.render.limit_bytes)} (${st.render.files}개 · 넘으면 오래된 것부터 자동 삭제, 서버 디스크이고 Supabase 용량과 무관)` : '<br>변환 서버 캐시 정보를 못 가져왔어요. (서버가 잠들어 있을 수 있어요)') : ''}</p>`;
}
