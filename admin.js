import { $, $$, esc, clone, uid, safeColor, fmtDate, fmtDT, num, ID_RE, toast, extractDriveId, saveBlob, move, DAY } from './util.js';
import { S, subj, unitOf, created } from './state.js';
import { DEFAULT_MENU } from './defaults.js';

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
export async function openAdmin() {
  $('#dlgAdmin').showModal();
  fillSubjectSelects();
  taxDraft = clone(S.tax); taxDirty = false; renderTaxAdmin();
  bannerDraft = clone(S.site.banners || []); bannerDirty = false; renderBannerAdmin();
  menuDraft = clone(S.site.menu && S.site.menu.length ? S.site.menu : DEFAULT_MENU); menuDirty = false; renderMenuAdmin();
  fillSiteForm();
  await Promise.all([refreshPass(), refreshPoints()]);
  switchTab('tabDash');
}
function switchTab(id) {
  $$('#dlgAdmin .tab').forEach((x) => x.classList.toggle('active', x.dataset.tab === id));
  $$('#dlgAdmin .tabpane').forEach((p) => p.classList.toggle('hidden', p.id !== id));
  if (id === 'tabDash') renderDash();
  if (id === 'tabFiles') renderAdminFiles();
  if (id === 'tabPass') refreshPass().then(renderAdminPass);
  if (id === 'tabPoints') refreshPoints().then(renderAdminPoints);
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
function fillSubjectSelects(keep) {
  const opts = S.tax.map((s) => `<option value="${esc(s.id)}">${esc(s.emoji)} ${esc(s.name)}</option>`).join('');
  $('#fSubject').innerHTML = opts || '<option value="">(과목 없음)</option>';
  if (keep) $('#fSubject').value = keep;
  fillUnitSelect();
  const cur = $('#aFilter').value;
  $('#aFilter').innerHTML = '<option value="">모든 과목</option><option value="__hidden">숨김(초안)만</option><option value="__pinned">고정한 자료만</option>' + opts;
  $('#aFilter').value = cur || '';
}
function fillUnitSelect(selected) {
  const sj = subj($('#fSubject').value);
  $('#fUnit').innerHTML = '<option value="">(단원 없음)</option>' + (sj?.units || []).map((u) => `<option value="${esc(u.id)}">${esc(u.name)}</option>`).join('');
  if (selected) $('#fUnit').value = selected;
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
        <button class="btn sm" data-fedit="${id}" type="button">수정</button>
        <button class="btn sm danger" data-fdel="${id}" type="button">삭제</button>
      </div></div>`;
  }).join('') : '<p class="note">조건에 맞는 자료가 없어.</p>';
}
function resetFileForm() {
  editId = null;
  const f = $('#formFile');
  f.reset();
  $('#formTitle').textContent = '새 자료 등록';
  $('#btnSaveFile').textContent = '저장';
  fillSubjectSelects();
  f.classList.add('hidden');
}
function openNewFile() {
  resetFileForm();
  $('#formFile').classList.remove('hidden');
  $('#formFile').elements.title.focus();
}
async function openEditFile(id) {
  const f = S.files.find((x) => x.id === id);
  if (!f) return;
  let p = {};
  try { p = await S.api.getPremium(id); } catch { /* 없으면 빈 값 */ }
  const form = $('#formFile');
  resetFileForm();
  editId = id;
  fillSubjectSelects(f.subject);
  fillUnitSelect(f.unit);
  form.elements.title.value = f.title;
  form.elements.level.value = String(f.level || 1);
  form.elements.tier.value = f.tier;
  form.elements.count.value = f.count || '';
  form.elements.price.value = f.price || 0;
  form.elements.visible.value = f.visible === false ? '0' : '1';
  form.elements.desc.value = f.desc || '';
  form.elements.drive.value = (f.tier === 'free' ? f.driveId : p.driveId) || '';
  form.elements.solution.value = p.solutionId || '';
  form.elements.preview.value = f.previewId || '';
  $('#formTitle').textContent = '자료 수정';
  $('#btnSaveFile').textContent = '수정 저장';
  form.classList.remove('hidden');
  form.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
}
async function submitFile(e) {
  e.preventDefault();
  const fd = Object.fromEntries(new FormData(e.target));
  const main = extractDriveId(fd.drive);
  if (!main) return toast('문제 PDF 드라이브 링크를 다시 확인해줘');
  const solution = fd.solution.trim() ? extractDriveId(fd.solution) : null;
  if (fd.solution.trim() && !solution) return toast('해설 링크를 다시 확인해줘');
  const preview = fd.preview.trim() ? extractDriveId(fd.preview) : null;
  if (fd.preview.trim() && !preview) return toast('미리보기 링크를 다시 확인해줘');
  if (!fd.subject) return toast('과목을 먼저 만들어줘 (과목·단원 탭)');
  const price = Math.max(0, Math.min(1000000, Math.floor(Number(fd.price) || 0)));
  const data = {
    title: fd.title.trim(), subject: fd.subject, unit: fd.unit || '', level: Number(fd.level) || 1,
    tier: fd.tier, count: Number(fd.count) || 0, desc: fd.desc.trim(), price,
    previewId: preview || '', hasSolution: !!solution, visible: fd.visible === '1',
  };
  try {
    if (editId) await S.api.updateFile(editId, data, { main, solution });
    else await S.api.addFile(data, { main, solution });
    const wasEdit = !!editId;
    resetFileForm();
    await S.hooks.reload();
    renderAdminFiles(); renderDash();
    toast(wasEdit ? '수정 완료 ✅' : '등록 완료! 🎉');
  } catch (err) { console.error(err); toast(FAIL); }
}

/* ---- 과목·단원 ---- */
function markTaxDirty() {
  taxDirty = true;
  $('#btnSaveTax').disabled = false;
  $('#taxDirtyMsg').classList.remove('hidden');
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
      <div class="units">${(s.units || []).map((u, j) => `
        <div class="unit-row" data-uj="${j}">
          <input data-f="uname" value="${esc(u.name)}" aria-label="단원 이름">
          <button class="btn sm" data-umove="up" type="button">↑</button>
          <button class="btn sm" data-umove="down" type="button">↓</button>
          <button class="btn sm danger" data-udel type="button">✕</button>
        </div>`).join('')}</div>
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
    s.units = (s.units || []).map((u) => ({ ...u, name: u.name.trim() })).filter((u) => u.name);
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
  $('#chargeList').innerHTML = pend.length ? pend.map((c) => `<div class="item"><div><b>${esc(c.username)}</b> · ${num(c.amount)} P
      <small>입금자명 ${esc(c.depositor || '-')} · ${fmtDT(c.at)}</small></div>
      <div class="item-btns"><button class="btn sm primary" data-cok="${esc(c.id)}" type="button">입금 확인 · 승인</button>
      <button class="btn sm danger" data-cno="${esc(c.id)}" type="button">거절</button></div></div>`).join('')
    : '<p class="note">대기 중인 충전 신청이 없어요 👍</p>';
  $('#chargeDone').innerHTML = done.length ? done.map((c) => `<div class="item dim"><div>${esc(c.username)} · ${num(c.amount)} P <small>${fmtDT(c.at)} · ${esc(c.depositor || '-')}</small></div>
    <i class="pill ${CH_ST[c.status]?.[1] || ''}">${CH_ST[c.status]?.[0] || c.status}</i></div>`).join('') : '';
  const q = $('#ptSearch').value.trim().toLowerCase();
  const list = pointsCache.filter((p) => !q || p.username.toLowerCase().includes(q)).sort((a, b) => b.balance - a.balance);
  $('#pointList').innerHTML = list.length ? list.map((p) => `<div class="item"><div>${esc(p.username)} <b class="pts-b">🪙 ${num(p.balance)} P</b></div>
    <div class="item-btns"><button class="btn sm" data-padj="${esc(p.username)}" type="button">조정</button></div></div>`).join('') : '<p class="note">포인트를 가진 회원이 아직 없어요.</p>';
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
    await refreshPoints(); renderAdminPoints(); renderDash();
    toast(r === 'ok' ? (approve ? '승인했어! 포인트가 들어갔어 ✅' : '거절했어') : r === 'already_done' ? '이미 처리된 신청이야' : '신청을 찾을 수 없어');
  } catch (err) { console.error(err); toast('처리 실패'); }
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
      <small>${esc(p.memo || '메모 없음')} · ${p.expires ? p.expires + '까지' : '기간 제한 없음'}</small></div>
      <div class="item-btns">
        ${p.expires ? `<button class="btn sm" data-pext="${id}" data-m="1" type="button">+1개월</button><button class="btn sm" data-pext="${id}" data-m="12" type="button">+1년</button>` : ''}
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
    await S.api.setPass(p.name, fmtDate(d), p.memo);
    await refreshPass(); renderAdminPass(); toast(`${fmtDate(d)}까지 연장했어 ✨`);
  } catch (err) { console.error(err); toast('연장 실패'); }
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
      if ((await S.api.setPass(n, fd.expires || null, fd.memo.trim())) === 'not_found') missing.push(n);
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
function fillSiteForm() {
  const f = $('#formSite').elements;
  f.noticeOn.checked = !!S.site.noticeOn;
  f.autoPass.checked = !!S.site.autoPass;
  f.notice.value = S.site.notice || '';
  f.heroSub.value = S.site.heroSub || '';
  f.contact.value = S.site.contact || '';
  f.passInfo.value = S.site.passInfo || '';
  f.chargeInfo.value = S.site.chargeInfo || '';
  f.packs.value = packsToText(S.site.packs);
  f.about.value = S.site.about || '';
}
async function submitSite(e) {
  e.preventDefault();
  const f = e.target.elements;
  const packs = parsePacks(f.packs.value);
  if (f.packs.value.trim() && !packs.length) return toast('충전 상품 형식을 확인해줘 (예: 1000 | 1,000원)');
  const next = {
    ...S.site, noticeOn: f.noticeOn.checked, autoPass: f.autoPass.checked, notice: f.notice.value.trim(), heroSub: f.heroSub.value.trim(),
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
  $('#btnNewFile').onclick = openNewFile;
  $('#btnCancelFile').onclick = resetFileForm;
  $('#fSubject').onchange = () => fillUnitSelect();
  $('#formFile').onsubmit = submitFile;
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
    if (f === 'uname') s.units[+el.closest('.unit-row').dataset.uj].name = el.value;
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
  $('#formSite').onsubmit = submitSite;
  $('#btnExport').onclick = exportBackup;
}

// 전역 클릭 위임에서 호출. 처리했으면 true
export async function adminClick(e, t) {
  const d = t.dataset;
  if (d.tab) { switchTab(d.tab); return true; }
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
  if (d.fedit !== undefined) { await openEditFile(d.fedit); return true; }
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
    const row = t.closest('.unit-row');
    if (row) {
      const uj = +row.dataset.uj;
      if (d.umove) { if (move(s.units, uj, d.umove)) { markTaxDirty(); renderTaxAdmin(); } return true; }
      if (t.matches('[data-udel]')) { s.units.splice(uj, 1); markTaxDirty(); renderTaxAdmin(); return true; }
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
