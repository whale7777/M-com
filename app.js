import { CONFIG } from './config.js';

/* =====================================================================
   기본값
   ===================================================================== */
const DEMO = !CONFIG.SUPABASE_URL || /여기에/.test(CONFIG.SUPABASE_URL) || new URLSearchParams(location.search).has('demo');
const DAY = 864e5;

// 처음 한 번만 쓰이는 기본 과목·단원. 관리자 패널에서 마음대로 바꿀 수 있어.
const DEFAULT_TAX = [
  { id: 'physics', name: '물리', emoji: '⚛️', color: '#4da3ff', units: [
    { id: 'mech', name: '역학' }, { id: 'energy', name: '일과 에너지' },
    { id: 'em', name: '전기와 자기' }, { id: 'wave', name: '파동과 빛' }, { id: 'modern', name: '현대 물리' } ] },
  { id: 'chem', name: '화학', emoji: '🧪', color: '#ff5cae', units: [
    { id: 'stoich', name: '화학량론' }, { id: 'bond', name: '원자와 결합' },
    { id: 'acid', name: '산·염기' }, { id: 'redox', name: '산화·환원' }, { id: 'equil', name: '반응 속도·평형' } ] },
  { id: 'bio', name: '생물', emoji: '🧬', color: '#3dffa0', units: [
    { id: 'cell', name: '세포' }, { id: 'metab', name: '물질대사' },
    { id: 'genetic', name: '유전' }, { id: 'homeo', name: '항상성' }, { id: 'eco', name: '생태계' } ] },
  { id: 'earth', name: '지구과학', emoji: '🌏', color: '#ffb84d', units: [
    { id: 'solid', name: '고체 지구' }, { id: 'atmo', name: '대기와 해양' }, { id: 'astro', name: '천문' } ] },
];
const DEFAULT_SITE = {
  noticeOn: false,
  autoPass: false,
  notice: '',
  heroSub: '과목별로 엄선한 10~15문항 세트. 무료 자료는 누구나, 프리미엄은 M패스로.',
  contact: CONFIG.CONTACT || '',
  passInfo: 'M패스는 관리자가 계정(PyNest ID)을 직접 등록해줘요.\n구매·문의는 아래 연락처로 보내주세요.',
};

/* =====================================================================
   유틸
   ===================================================================== */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clone = (x) => JSON.parse(JSON.stringify(x));
const uid = (p) => p + Math.random().toString(36).slice(2, 7);
const safeColor = (c) => (/^#[0-9a-f]{6}$/i.test(c || '') ? c : '#8d8da8');
const fmtDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const ID_RE = /^[a-z0-9_]{3,20}$/; // PyNest 와 같은 ID 규칙
const buildPrem = (tier, ids) => {
  const p = {};
  if (tier === 'premium' && ids.main) p.driveId = ids.main;
  if (ids.solution) p.solutionId = ids.solution;
  return p;
};

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), 2600);
}
function extractDriveId(input) {
  const s = (input || '').trim();
  const m = s.match(/\/d\/([\w-]{10,})/) || s.match(/[?&]id=([\w-]{10,})/);
  if (m) return m[1];
  return /^[\w-]{10,}$/.test(s) ? s : null;
}
function triggerDownload(id) {
  // 드라이브 확인 페이지 없이 바로 내려받는 주소
  const a = document.createElement('a');
  a.href = `https://drive.usercontent.google.com/download?id=${encodeURIComponent(id)}&export=download&confirm=t`;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}
function saveBlob(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/* =====================================================================
   데모 백엔드 (설정 전 / 주소 뒤에 ?demo 를 붙였을 때 미리보기용 · 새로고침하면 초기화)
   ===================================================================== */
function demoBackend() {
  let seq = 0;
  const now = Date.now();
  const mk = (subject, unit, tier, level, title, desc, count, extra = {}) => ({
    id: 'd' + seq++, subject, unit, tier, level, title, desc, count, visible: true, pinned: false,
    downloads: Math.floor(Math.random() * 180), createdAt: now - seq * 3 * DAY,
    driveId: tier === 'free' ? 'DEMO' : undefined, previewId: 'DEMO', hasSolution: false, ...extra,
  });
  const demoFiles = [
    mk('physics', 'energy', 'free', 1, '역학적 에너지 보존 입문 10제', '일과 에너지 기본기를 다지는 세트. 그래프 해석 포함.', 10),
    mk('physics', 'mech', 'premium', 3, '등가속도 + 에너지 융합 킬러 12제', '계산량 있는 심화 세트. 풀이 PDF 수록.', 12, { hasSolution: true, pinned: true }),
    mk('chem', 'stoich', 'free', 1, '몰 농도·화학량론 기본 10제', '계산 실수를 줄이는 단위 정리 중심.', 10),
    mk('chem', 'acid', 'premium', 3, '산염기 적정 곡선 심화 13제', '그래프 추론형 문항 위주.', 13, { hasSolution: true }),
    mk('bio', 'metab', 'free', 2, '세포 호흡 · 광합성 핵심 10제', '자료 해석형 문제로 구성.', 10),
    mk('earth', 'atmo', 'premium', 2, '대기와 해양 순환 심화 12제', '자료 분석 · 추론 유형.', 12),
    mk('earth', 'astro', 'free', 2, '별의 물리량과 H-R도 10제', '천문 단원 기본 자료해석.', 10),
    mk('earth', 'astro', 'premium', 3, '외계 행성·우주론 자료해석 12제', '아직 공개 전인 초안 (숨김 상태 예시)', 12, { visible: false, hasSolution: true }),
  ];
  const prem = {};
  demoFiles.forEach((f) => { prem[f.id] = buildPrem(f.tier, { main: 'DEMO', solution: f.hasSolution ? 'DEMO' : null }); });
  const meta = { tax: clone(DEFAULT_TAX), site: clone(DEFAULT_SITE) };
  let mpass = [
    { id: 'u1', name: 'student01', expires: null, memo: '예시 학생 (무기한)', active: true },
    { id: 'u2', name: 'soon01', expires: fmtDate(new Date(Date.now() + 4 * DAY)), memo: '곧 만료 예시', active: true },
    { id: 'u3', name: 'old01', expires: '2026-01-31', memo: '만료 예시', active: true },
  ];
  const listeners = [];
  const demoUser = (id) => ({ id: 'u_' + id, username: id, role: 'student', status: 'approved' });
  const find = (id) => demoFiles.find((f) => f.id === id);
  return {
    onAuth: (cb) => { listeners.push(cb); cb(null); },
    login: async (id) => listeners.forEach((l) => l(demoUser(id))),
    signup: async (id) => listeners.forEach((l) => l(demoUser(id))),
    logout: async () => listeners.forEach((l) => l(null)),
    loadMeta: async () => clone(meta),
    saveTax: async (t) => { meta.tax = clone(t); },
    saveSite: async (s) => { meta.site = clone(s); },
    listFiles: async (admin) => clone(demoFiles.filter((f) => admin || f.visible !== false)),
    hasPass: async () => !!window.__demoPass,
    getDriveId: async () => 'DEMO',
    getPremium: async (id) => clone(prem[id] || {}),
    addFile: async (f, ids) => {
      const id = 'd' + Date.now();
      demoFiles.unshift({ ...f, id, downloads: 0, pinned: false, createdAt: Date.now(), driveId: f.tier === 'free' ? ids.main : undefined });
      prem[id] = buildPrem(f.tier, ids);
      return id;
    },
    updateFile: async (id, f, ids) => {
      Object.assign(find(id), f, { driveId: f.tier === 'free' ? ids.main : undefined });
      prem[id] = buildPrem(f.tier, ids);
    },
    patchFile: async (id, patch) => { Object.assign(find(id), patch); },
    deleteFile: async (id) => { demoFiles.splice(demoFiles.findIndex((f) => f.id === id), 1); delete prem[id]; },
    countDownload: async (id) => { const f = find(id); if (f) f.downloads = (f.downloads || 0) + 1; },
    listPass: async () => clone(mpass),
    setPass: async (name, expires, memo) => {
      if (name === 'nobody') return 'not_found';
      const ex = mpass.find((p) => p.name === name);
      if (ex) Object.assign(ex, { expires, memo: memo || '', active: true });
      else mpass.push({ id: 'u' + Date.now() + mpass.length, name, expires, memo: memo || '', active: true });
      return 'ok';
    },
    removePass: async (id) => { mpass = mpass.filter((p) => p.id !== id); },
    exportAll: async () => clone({ files: demoFiles, premium: prem, mpass }),
  };
}

/* =====================================================================
   Supabase 백엔드 — PyNest 와 같은 프로젝트라서 계정(ID·비밀번호)이 그대로 연동돼요
   ===================================================================== */
async function supabaseBackend() {
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
  // PyNest 와 설정을 똑같이 쓰면, 같은 주소(github.io)에서는 로그인 세션도 같이 쓰게 돼요.
  const sb = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
  const emailOf = (id) => `${id.toLowerCase()}@pyclass.site`; // PyNest 와 같은 규칙
  const must = ({ data, error }) => { if (error) throw error; return data; };
  const premRow = (fileId, prem) => ({ file_id: fileId, drive_id: prem.driveId || null, solution_id: prem.solutionId || null });
  const fromRow = (r) => ({
    id: r.id, title: r.title, subject: r.subject, unit: r.unit, level: r.level, tier: r.tier, count: r.count,
    desc: r.desc, previewId: r.preview_id, hasSolution: r.has_solution, visible: r.visible, pinned: r.pinned,
    downloads: r.downloads, driveId: r.drive_id || undefined, createdAt: Date.parse(r.created_at) || 0,
  });
  const toRow = (f) => ({
    title: f.title, subject: f.subject, unit: f.unit, level: f.level, tier: f.tier, count: f.count,
    desc: f.desc, preview_id: f.previewId, has_solution: f.hasSolution, visible: f.visible,
  });
  const profileOf = async (session) => {
    const uid = session.user.id;
    try {
      const { data } = await sb.from('profiles').select('id,username,role,status').eq('id', uid).maybeSingle();
      if (data) return { id: uid, username: data.username, role: data.role, status: data.status };
    } catch { /* 아래 기본값 사용 */ }
    return { id: uid, username: session.user.user_metadata?.username || '회원', role: 'student', status: 'pending' };
  };

  return {
    onAuth: (cb) => {
      let last;
      sb.auth.onAuthStateChange((event, session) => {
        const uid = session?.user?.id || null;
        if (uid === last) return; // 토큰 갱신 등으로 같은 사람이 다시 알려질 때는 무시
        last = uid;
        // 이 콜백 안에서 바로 다른 supabase 호출을 하면 멈출 수 있어서 한 박자 뒤에 실행
        setTimeout(async () => cb(uid ? await profileOf(session) : null), 0);
      });
    },
    login: async (id, pw) => {
      const { error } = await sb.auth.signInWithPassword({ email: emailOf(id), password: pw });
      if (error) throw new Error('ID 또는 비밀번호가 맞지 않아요');
    },
    signup: async (id, pw) => {
      const { error } = await sb.auth.signUp({ email: emailOf(id), password: pw, options: { data: { username: id.toLowerCase() } } });
      if (error) throw new Error(/registered|already|exists/i.test(error.message) ? '이미 있는 ID예요' : '가입에 실패했어요: ' + error.message);
    },
    logout: () => sb.auth.signOut(),

    loadMeta: async () => {
      const by = Object.fromEntries(must(await sb.from('mh_meta').select('key,value')).map((r) => [r.key, r.value]));
      return { tax: by.taxonomy?.subjects ?? null, site: by.site ?? null };
    },
    saveTax: async (t) => { must(await sb.from('mh_meta').upsert({ key: 'taxonomy', value: { subjects: t }, updated_at: new Date().toISOString() })); },
    saveSite: async (s) => { must(await sb.from('mh_meta').upsert({ key: 'site', value: s, updated_at: new Date().toISOString() })); },

    listFiles: async () => must(await sb.from('mh_files').select('*')).map(fromRow), // 숨김 자료는 서버가 관리자에게만 줌
    hasPass: async () => must(await sb.rpc('mh_has_pass')) === true,
    getPremium: async (id) => {
      const r = must(await sb.from('mh_premium').select('drive_id,solution_id').eq('file_id', id).maybeSingle());
      return r ? { driveId: r.drive_id || undefined, solutionId: r.solution_id || undefined } : {};
    },
    getDriveId: async (f, kind) => {
      if (kind === 'main' && f.tier === 'free') return f.driveId;
      const r = must(await sb.from('mh_premium').select('drive_id,solution_id').eq('file_id', f.id).maybeSingle()); // M패스 없으면 서버가 안 줌
      const id = r && (kind === 'solution' ? r.solution_id : r.drive_id);
      if (!id) throw new Error('파일 ID 없음');
      return id;
    },
    addFile: async (f, ids) => {
      const { id } = must(await sb.from('mh_files').insert({ ...toRow(f), drive_id: f.tier === 'free' ? ids.main : null }).select('id').single());
      const prem = buildPrem(f.tier, ids);
      if (Object.keys(prem).length) {
        const { error } = await sb.from('mh_premium').insert(premRow(id, prem));
        if (error) { await sb.from('mh_files').delete().eq('id', id); throw error; }
      }
      return id;
    },
    updateFile: async (id, f, ids) => {
      must(await sb.from('mh_files').update({ ...toRow(f), drive_id: f.tier === 'free' ? ids.main : null, updated_at: new Date().toISOString() }).eq('id', id));
      const prem = buildPrem(f.tier, ids);
      if (Object.keys(prem).length) must(await sb.from('mh_premium').upsert(premRow(id, prem)));
      else must(await sb.from('mh_premium').delete().eq('file_id', id));
    },
    patchFile: async (id, patch) => { must(await sb.from('mh_files').update(patch).eq('id', id)); },
    deleteFile: async (id) => { must(await sb.from('mh_files').delete().eq('id', id)); }, // 프리미엄 링크는 같이 삭제됨
    countDownload: async (id) => { try { await sb.rpc('mh_count_download', { p_id: id }); } catch { /* 통계라서 무시 */ } },

    listPass: async () => must(await sb.from('mh_pass').select('*').order('username'))
      .map((r) => ({ id: r.user_id, name: r.username, active: r.active, expires: r.expires, memo: r.memo })),
    setPass: async (name, expires, memo) => must(await sb.rpc('mh_grant_pass', { p_username: name, p_expires: expires || null, p_memo: memo || '' })),
    removePass: async (id) => { must(await sb.from('mh_pass').delete().eq('user_id', id)); },

    exportAll: async () => {
      const [f, p, m] = await Promise.all([sb.from('mh_files').select('*'), sb.from('mh_premium').select('*'), sb.from('mh_pass').select('*')]);
      return { files: must(f), premium: must(p), mpass: must(m) };
    },
  };
}

/* =====================================================================
   상태
   ===================================================================== */
let api, user = null, isAdmin = false, hasPass = false;
let tax = clone(DEFAULT_TAX), site = { ...DEFAULT_SITE }, files = [], passCache = [];
let editId = null, taxDraft = null, taxDirty = false;
const view = { s: 'all', u: 'all', tier: 'all', sort: 'new' };

const subj = (id) => tax.find((s) => s.id === id);
const unitOf = (f) => (subj(f.subject)?.units || []).find((u) => u.id === f.unit);
const created = (f) => Number(f.createdAt) || 0;
const isNew = (f) => created(f) > 0 && Date.now() - created(f) < 7 * DAY;
const calcAdmin = (u) => !!u && ((u.role === 'admin' && u.status === 'approved') || (DEMO && !!window.__demoAdmin));

function passStatus(p) {
  if (p.active === false) return { k: 'off', label: '비활성' };
  if (!p.expires) return { k: 'ok', label: '무기한' };
  const left = Math.ceil((new Date(p.expires + 'T23:59:59') - Date.now()) / DAY);
  if (left < 0) return { k: 'exp', label: '만료됨' };
  return { k: left <= 7 ? 'soon' : 'ok', label: `D-${left}` };
}
const passActive = (p) => ['ok', 'soon'].includes(passStatus(p).k);

/* =====================================================================
   공개 화면 렌더링
   ===================================================================== */
function renderHeader() {
  $('#btnLogin').classList.toggle('hidden', !!user);
  $('#btnLogout').classList.toggle('hidden', !user);
  $('#btnAdmin').classList.toggle('hidden', !isAdmin);
  const chip = $('#userChip');
  chip.classList.toggle('hidden', !user);
  if (user) {
    chip.innerHTML = `<span>${esc(user.username)}</span>` +
      (isAdmin ? '<i class="badge admin">ADMIN</i>' : '') + (hasPass && !isAdmin ? '<i class="badge m">M PASS</i>' : '');
  }
}

function renderSiteText() {
  const on = site.noticeOn && site.notice;
  $('#notice').classList.toggle('hidden', !on);
  $('#notice').textContent = site.notice || '';
  $('#heroSub').innerHTML = esc(site.heroSub || '').replace(/M패스/g, '<b>M패스</b>');
  $('#contact').textContent = site.contact || '';
  $('#passContact').textContent = site.contact || '';
  $('#passInfo').textContent = site.passInfo || '';
  $('#year').textContent = new Date().getFullYear();
}

function renderStats() {
  const pub = files.filter((f) => f.visible !== false);
  const free = pub.filter((f) => f.tier === 'free').length;
  const total = pub.reduce((n, f) => n + (Number(f.count) || 0), 0);
  $('#stats').innerHTML =
    `<div class="stat"><b>${pub.length}</b><span>PDF 세트</span></div>` +
    `<div class="stat"><b>${total}</b><span>총 문항</span></div>` +
    `<div class="stat"><b>${free}</b><span>무료 공개</span></div>`;
}

function renderNav() {
  const cnt = (pred) => files.filter(pred).length;
  const chip = (href, label, n, on, cls = '') =>
    `<a class="chip ${cls} ${on ? 'on' : ''}" href="${href}">${label} <i>${n}</i></a>`;
  $('#chips').innerHTML = chip('#/', '전체', files.length, view.s === 'all') +
    tax.map((s) => chip(`#/${encodeURIComponent(s.id)}`, `${esc(s.emoji)} ${esc(s.name)}`, cnt((f) => f.subject === s.id), view.s === s.id)).join('');

  const sj = subj(view.s);
  const ub = $('#unitChips');
  if (sj && sj.units && sj.units.length) {
    ub.classList.remove('hidden');
    const base = `#/${encodeURIComponent(sj.id)}`;
    ub.innerHTML = chip(base, '전체 단원', cnt((f) => f.subject === sj.id), view.u === 'all', 'sm') +
      sj.units.map((u) => chip(`${base}/${encodeURIComponent(u.id)}`, esc(u.name), cnt((f) => f.subject === sj.id && f.unit === u.id), view.u === u.id, 'sm')).join('');
  } else {
    ub.classList.add('hidden');
    ub.innerHTML = '';
  }

  const un = sj && (sj.units || []).find((u) => u.id === view.u);
  $('#secTitle').innerHTML = sj ? `${esc(sj.emoji)} ${esc(sj.name)}${un ? ` <span>› ${esc(un.name)}</span>` : ''}` : '전체 자료';
  document.title = sj ? `${sj.name}${un ? ' · ' + un.name : ''} — 민혁닷컴` : '민혁닷컴 — 과학 문제 PDF';
}

function currentList() {
  const q = $('#search').value.trim().toLowerCase();
  const sorters = {
    new: (a, b) => created(b) - created(a),
    pop: (a, b) => (b.downloads || 0) - (a.downloads || 0),
    easy: (a, b) => (a.level || 0) - (b.level || 0),
    hard: (a, b) => (b.level || 0) - (a.level || 0),
    title: (a, b) => String(a.title).localeCompare(String(b.title), 'ko'),
  };
  return files
    .filter((f) => (view.s === 'all' || f.subject === view.s) && (view.u === 'all' || f.unit === view.u) &&
      (view.tier === 'all' || f.tier === view.tier) &&
      (!q || `${f.title} ${f.desc || ''} ${unitOf(f)?.name || ''}`.toLowerCase().includes(q)))
    .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || sorters[view.sort](a, b));
}

function cardHTML(f) {
  const sj = subj(f.subject);
  const un = unitOf(f);
  const id = esc(f.id);
  const canMain = f.tier === 'free' || hasPass || isAdmin;
  const canSol = hasPass || isAdmin;
  const lvl = Math.min(3, Math.max(1, Number(f.level) || 1));
  const main = canMain
    ? `<button class="btn dl" data-dl="${id}">⬇ ${f.tier === 'free' ? '무료 다운로드' : 'M패스 다운로드'}</button>`
    : '<button class="btn locked" data-lock>🔒 M패스 필요</button>';
  const sub = [];
  if (f.previewId) sub.push(`<button class="btn mini" data-prev="${id}">👁 미리보기</button>`);
  if (f.hasSolution) sub.push(canSol
    ? `<button class="btn mini" data-dl="${id}" data-kind="solution">📝 해설 받기</button>`
    : '<button class="btn mini muted" data-lock>🔒 해설 (M패스)</button>');
  return `<article class="card ${f.visible === false ? 'draft' : ''}" style="--c:${safeColor(sj?.color)}">
    <div class="card-top">
      <span class="tag">${esc(sj ? sj.emoji + ' ' + sj.name : '미분류')}${un ? ' · ' + esc(un.name) : ''}</span>
      <span class="badges">${f.pinned ? '📌' : ''}${isNew(f) ? '<i class="new">NEW</i>' : ''}${f.visible === false ? '<i class="draft-b">숨김</i>' : ''}
        <span class="tier ${f.tier}">${f.tier === 'free' ? 'FREE' : 'M PASS'}</span></span>
    </div>
    <h3>${esc(f.title)}</h3>
    <p>${esc(f.desc || '')}</p>
    <div class="meta"><span class="lv" title="난이도">${'●'.repeat(lvl)}${'○'.repeat(3 - lvl)}</span> · ${Number(f.count) || '-'}문항 · PDF · ⬇ ${f.downloads || 0}</div>
    ${main}
    ${sub.length ? `<div class="btns">${sub.join('')}</div>` : ''}
  </article>`;
}

function renderGrid() {
  const list = currentList();
  $('#empty').classList.toggle('hidden', list.length > 0);
  $('#secCount').textContent = `${list.length}개`;
  $('#grid').innerHTML = list.map(cardHTML).join('');
}

function renderAll() {
  renderHeader(); renderSiteText(); renderStats(); renderNav(); renderGrid();
}

/* 주소(#/과목/단원) ↔ 화면 상태 */
function applyHash() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  let s = parts[0] || 'all', u = parts[1] || 'all';
  if (s !== 'all' && !subj(s)) { s = 'all'; u = 'all'; }
  if (u !== 'all' && !(subj(s)?.units || []).some((x) => x.id === u)) u = 'all';
  view.s = s; view.u = u;
}

async function loadFiles() {
  try { files = await api.listFiles(isAdmin); } catch (e) { console.error(e); toast('자료를 불러오지 못했어'); files = []; }
  renderAll();
}

/* =====================================================================
   다운로드 / 미리보기
   ===================================================================== */
async function download(id, kind) {
  const f = files.find((x) => x.id === id);
  if (!f) return;
  try {
    const driveId = await api.getDriveId(f, kind);
    if (DEMO) toast('데모 모드라 실제 파일은 없어! 설정하면 바로 다운로드돼');
    else { triggerDownload(driveId); toast('다운로드 시작! 📥'); }
    if (kind === 'main') {
      f.downloads = (f.downloads || 0) + 1;
      api.countDownload(f.id);
      renderGrid();
    }
  } catch (err) { console.error(err); toast('권한이 없거나 오류가 났어'); }
}
function preview(id) {
  const f = files.find((x) => x.id === id);
  if (!f || !f.previewId) return;
  if (DEMO) return toast('데모 모드라 미리보기 파일은 없어!');
  $('#prevTitle').textContent = f.title;
  $('#prevFrame').src = `https://drive.google.com/file/d/${encodeURIComponent(f.previewId)}/preview`;
  $('#dlgPreview').showModal();
}

/* =====================================================================
   관리자 패널
   ===================================================================== */
async function openAdmin() {
  $('#dlgAdmin').showModal();
  fillSubjectSelects();
  taxDraft = clone(tax); taxDirty = false; renderTaxAdmin();
  fillSiteForm();
  await refreshPass();
  switchTab('tabDash');
}
function switchTab(id) {
  $$('.tab').forEach((x) => x.classList.toggle('active', x.dataset.tab === id));
  $$('.tabpane').forEach((p) => p.classList.toggle('hidden', p.id !== id));
  if (id === 'tabDash') renderDash();
  if (id === 'tabFiles') renderAdminFiles();
  if (id === 'tabPass') refreshPass().then(renderAdminPass);
}

/* ---- 대시보드 ---- */
function renderDash() {
  const shown = files.filter((f) => f.visible !== false).length;
  const dl = files.reduce((n, f) => n + (f.downloads || 0), 0);
  const active = passCache.filter(passActive).length;
  const soon = passCache.filter((p) => passStatus(p).k === 'soon').length;
  const top = [...files].sort((a, b) => (b.downloads || 0) - (a.downloads || 0)).slice(0, 5);
  const max = Math.max(1, ...top.map((f) => f.downloads || 0));
  const maxS = Math.max(1, ...tax.map((s) => files.filter((f) => f.subject === s.id).length));
  $('#dash').innerHTML = `
    <div class="kpis">
      <div class="kpi"><b>${files.length}</b><span>전체 자료 (공개 ${shown} · 숨김 ${files.length - shown})</span></div>
      <div class="kpi"><b>${dl}</b><span>누적 다운로드</span></div>
      <div class="kpi"><b>${active}</b><span>활성 M패스${soon ? ` · 곧 만료 ${soon}` : ''}</span></div>
      <div class="kpi"><b>${files.filter((f) => f.tier === 'premium').length}</b><span>프리미엄 자료</span></div>
    </div>
    <div class="dash-cols">
      <div><h4>🔥 인기 자료 TOP 5</h4>${top.length ? top.map((f) => `
        <div class="hbar"><span class="t">${esc(f.title)}</span><span class="track"><span class="fill" style="width:${Math.round((f.downloads || 0) / max * 100)}%"></span></span><em>${f.downloads || 0}</em></div>`).join('') : '<p class="note">아직 자료가 없어.</p>'}</div>
      <div><h4>📚 과목별 자료 수</h4>${tax.map((s) => {
        const n = files.filter((f) => f.subject === s.id).length;
        return `<div class="hbar" style="--c:${safeColor(s.color)}"><span class="t">${esc(s.emoji)} ${esc(s.name)}</span><span class="track"><span class="fill" style="width:${Math.round(n / maxS * 100)}%"></span></span><em>${n}</em></div>`;
      }).join('')}</div>
    </div>`;
}

/* ---- 자료 관리 ---- */
function fillSubjectSelects(keep) {
  const opts = tax.map((s) => `<option value="${esc(s.id)}">${esc(s.emoji)} ${esc(s.name)}</option>`).join('');
  $('#fSubject').innerHTML = opts || '<option value="">(과목 없음)</option>';
  if (keep) $('#fSubject').value = keep;
  fillUnitSelect();
  const cur = $('#aFilter').value;
  $('#aFilter').innerHTML = '<option value="">모든 과목</option><option value="__hidden">숨김(초안)만</option><option value="__pinned">고정한 자료만</option>' + opts;
  $('#aFilter').value = cur || '';
}
function fillUnitSelect(selected) {
  const sj = subj($('#fSubject').value);
  $('#fUnit').innerHTML = '<option value="">(단원 없음)</option>' +
    (sj?.units || []).map((u) => `<option value="${esc(u.id)}">${esc(u.name)}</option>`).join('');
  if (selected) $('#fUnit').value = selected;
}

function renderAdminFiles() {
  const q = $('#aSearch').value.trim().toLowerCase();
  const flt = $('#aFilter').value;
  const list = files.filter((f) =>
    (!flt || (flt === '__hidden' ? f.visible === false : flt === '__pinned' ? f.pinned : f.subject === flt)) &&
    (!q || f.title.toLowerCase().includes(q)))
    .sort((a, b) => created(b) - created(a));
  $('#adminFiles').innerHTML = list.length ? list.map((f) => {
    const sj = subj(f.subject), un = unitOf(f), id = esc(f.id);
    return `<div class="item ${f.visible === false ? 'dim' : ''}">
      <div>${f.pinned ? '📌 ' : ''}${esc(f.title)}
        <small>${esc(sj ? sj.name : '미분류')}${un ? ' › ' + esc(un.name) : ''} · ${f.tier === 'free' ? '무료' : '프리미엄'}${f.hasSolution ? ' · 해설' : ''} · 난이도 ${f.level || 1} · ⬇ ${f.downloads || 0}${f.visible === false ? ' · 숨김' : ''}</small></div>
      <div class="item-btns">
        <button class="btn sm ${f.pinned ? 'on' : ''}" data-fpin="${id}">📌 고정</button>
        <button class="btn sm" data-fvis="${id}">${f.visible === false ? '공개하기' : '숨기기'}</button>
        <button class="btn sm" data-fedit="${id}">수정</button>
        <button class="btn sm danger" data-fdel="${id}">삭제</button>
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
  const f = files.find((x) => x.id === id);
  if (!f) return;
  let p = {};
  try { p = await api.getPremium(id); } catch { /* 없으면 빈 값 */ }
  const form = $('#formFile');
  resetFileForm();
  editId = id;
  fillSubjectSelects(f.subject);
  fillUnitSelect(f.unit);
  form.elements.title.value = f.title;
  form.elements.level.value = String(f.level || 1);
  form.elements.tier.value = f.tier;
  form.elements.count.value = f.count || '';
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
  const data = {
    title: fd.title.trim(), subject: fd.subject, unit: fd.unit || '', level: Number(fd.level) || 1,
    tier: fd.tier, count: Number(fd.count) || 0, desc: fd.desc.trim(),
    previewId: preview || '', hasSolution: !!solution, visible: fd.visible === '1',
  };
  try {
    if (editId) await api.updateFile(editId, data, { main, solution });
    else await api.addFile(data, { main, solution });
    const wasEdit = !!editId;
    resetFileForm();
    await loadFiles();
    renderAdminFiles(); renderDash();
    toast(wasEdit ? '수정 완료 ✅' : '등록 완료! 🎉');
  } catch (err) { console.error(err); toast('저장 실패 (schema.sql 실행 / 관리자 계정 확인)'); }
}

/* ---- 과목·단원 관리 ---- */
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
const move = (arr, i, dir) => {
  const j = i + (dir === 'up' ? -1 : 1);
  if (j < 0 || j >= arr.length) return false;
  [arr[i], arr[j]] = [arr[j], arr[i]];
  return true;
};
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
    await api.saveTax(taxDraft);
    tax = clone(taxDraft); taxDirty = false;
    applyHash(); fillSubjectSelects(); renderTaxAdmin(); renderAll();
    toast('과목·단원 저장 완료 ✨');
  } catch (err) { console.error(err); toast('저장 실패 (schema.sql 실행 / 관리자 계정 확인)'); }
}

/* ---- M패스 ---- */
async function refreshPass() {
  try { passCache = await api.listPass(); } catch (e) { console.error(e); passCache = []; }
}
function renderAdminPass() {
  const q = $('#pSearch').value.trim().toLowerCase();
  const order = { soon: 0, ok: 1, exp: 2, off: 3 };
  const list = passCache
    .filter((p) => !q || `${p.name} ${p.memo || ''}`.toLowerCase().includes(q))
    .sort((a, b) => order[passStatus(a).k] - order[passStatus(b).k] || a.name.localeCompare(b.name));
  $('#adminPass').innerHTML = list.length ? list.map((p) => {
    const st = passStatus(p), id = esc(p.id);
    return `<div class="item"><div>${esc(p.name)} <i class="pill ${st.k}">${st.label}</i>
      <small>${esc(p.memo || '메모 없음')} · ${p.expires ? p.expires + '까지' : '기간 제한 없음'}</small></div>
      <div class="item-btns">
        ${p.expires ? `<button class="btn sm" data-pext="${id}" data-m="1">+1개월</button><button class="btn sm" data-pext="${id}" data-m="12">+1년</button>` : ''}
        <button class="btn sm danger" data-prm="${id}">회수</button>
      </div></div>`;
  }).join('') : '<p class="note">M패스 보유자가 없어.</p>';
}
async function extendPass(id, months) {
  const p = passCache.find((x) => x.id === id);
  if (!p || !p.expires) return;
  const d = new Date(Math.max(new Date(p.expires + 'T23:59:59').getTime(), Date.now()));
  d.setMonth(d.getMonth() + months);
  try {
    await api.setPass(p.name, fmtDate(d), p.memo);
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
      if ((await api.setPass(n, fd.expires || null, fd.memo.trim())) === 'not_found') missing.push(n);
    }
    e.target.reset();
    await refreshPass(); renderAdminPass();
    const done = names.length - missing.length;
    toast(missing.length ? `${done}명 부여 · 가입 안 된 ID: ${missing.join(', ')}` : `${done}명에게 M패스 부여 완료 ✨`);
  } catch (err) { console.error(err); toast('부여 실패 (schema.sql 실행 / 관리자 계정 확인)'); }
}

/* ---- 사이트 설정 ---- */
function fillSiteForm() {
  const f = $('#formSite').elements;
  f.noticeOn.checked = !!site.noticeOn;
  f.autoPass.checked = !!site.autoPass;
  f.notice.value = site.notice || '';
  f.heroSub.value = site.heroSub || '';
  f.contact.value = site.contact || '';
  f.passInfo.value = site.passInfo || '';
}
async function submitSite(e) {
  e.preventDefault();
  const f = e.target.elements;
  const next = { noticeOn: f.noticeOn.checked, autoPass: f.autoPass.checked, notice: f.notice.value.trim(), heroSub: f.heroSub.value.trim(), contact: f.contact.value.trim(), passInfo: f.passInfo.value.trim() };
  try { await api.saveSite(next); site = { ...site, ...next }; renderSiteText(); toast('설정 저장 완료 ✨'); }
  catch (err) { console.error(err); toast('저장 실패 (schema.sql 실행 / 관리자 계정 확인)'); }
}
async function exportBackup() {
  try {
    const data = await api.exportAll();
    saveBlob(`minhyeok-com-backup-${fmtDate(new Date())}.json`, JSON.stringify({ exportedAt: new Date().toISOString(), taxonomy: tax, site, ...data }, null, 2));
    toast('백업 파일을 내려받았어 💾');
  } catch (err) { console.error(err); toast('백업 실패'); }
}

/* =====================================================================
   이벤트
   ===================================================================== */
/* ---- 로그인 / 가입 (PyNest 계정) ---- */
let authTab = 'login';
function renderAuthTab() {
  const signup = authTab === 'signup';
  $$('#authTabs button').forEach((b) => {
    b.classList.toggle('active', b.dataset.at === authTab);
    b.classList.toggle('hidden', b.dataset.at === 'signup' && !CONFIG.ALLOW_SIGNUP);
  });
  $('#authPw2Wrap').classList.toggle('hidden', !signup);
  $('#authSignupNote').classList.toggle('hidden', !signup);
  $('#authSubmit').textContent = signup ? '가입하기' : '로그인';
  $('#authPw').setAttribute('autocomplete', signup ? 'new-password' : 'current-password');
}
function openAuth(tab = 'login') {
  authTab = tab;
  renderAuthTab();
  $('#dlgAuth').showModal();
}
async function submitAuth(e) {
  e.preventDefault();
  const id = $('#authId').value.trim().toLowerCase();
  const pw = $('#authPw').value;
  const signup = authTab === 'signup';
  if (signup) {
    if (!ID_RE.test(id)) return toast('ID는 영문 소문자, 숫자, _ 로 3~20자예요');
    if (pw.length < 6) return toast('비밀번호는 6자 이상이어야 해요');
    if (pw !== $('#authPw2').value) return toast('비밀번호 확인이 달라요');
  }
  const btn = $('#authSubmit');
  btn.disabled = true;
  try {
    await (signup ? api.signup(id, pw) : api.login(id, pw));
    $('#dlgAuth').close();
    $('#formAuth').reset();
    toast(signup ? '가입 완료! 환영해 🎉' : '로그인 완료!');
  } catch (err) { toast(err.message || '실패했어요'); }
  finally { btn.disabled = false; }
}

function bind() {
  $('#btnLogin').onclick = () => openAuth('login');
  $('#formAuth').onsubmit = submitAuth;
  $('#btnLogout').onclick = () => api.logout();
  $('#btnAdmin').onclick = openAdmin;
  $('#search').oninput = renderGrid;
  $('#tierSel').onchange = (e) => { view.tier = e.target.value; renderGrid(); };
  $('#sortSel').onchange = (e) => { view.sort = e.target.value; renderGrid(); };
  window.addEventListener('hashchange', () => { applyHash(); renderNav(); renderGrid(); });
  $('#dlgPreview').addEventListener('close', () => { $('#prevFrame').src = 'about:blank'; });

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

  $('#pSearch').oninput = renderAdminPass;
  $('#formPass').onsubmit = submitPass;
  $('#formSite').onsubmit = submitSite;
  $('#btnExport').onclick = exportBackup;

  document.addEventListener('click', async (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    const d = t.dataset;
    if (t.matches('[data-close]')) return t.closest('dialog').close();
    if (t.matches('[data-lock]')) {
      $('#passNeedLogin').textContent = user ? '' : '먼저 로그인해줘야 M패스를 확인할 수 있어. (PyNest ID 그대로 쓰면 돼)';
      return $('#dlgPass').showModal();
    }
    if (d.dl !== undefined) return download(d.dl, d.kind || 'main');
    if (d.prev !== undefined) return preview(d.prev);
    if (d.tab) return switchTab(d.tab);
    if (d.at) { authTab = d.at; return renderAuthTab(); }

    // 자료 관리
    if (d.fpin !== undefined) {
      const f = files.find((x) => x.id === d.fpin);
      await api.patchFile(f.id, { pinned: !f.pinned }); f.pinned = !f.pinned;
      renderAdminFiles(); renderGrid(); return;
    }
    if (d.fvis !== undefined) {
      const f = files.find((x) => x.id === d.fvis);
      const next = f.visible === false;
      await api.patchFile(f.id, { visible: next }); f.visible = next;
      renderAdminFiles(); renderAll(); toast(next ? '공개했어' : '숨겼어'); return;
    }
    if (d.fedit !== undefined) return openEditFile(d.fedit);
    if (d.fdel !== undefined) {
      if (!confirm('정말 삭제할까? (되돌릴 수 없어)')) return;
      await api.deleteFile(d.fdel); await loadFiles(); renderAdminFiles(); renderDash(); return toast('삭제했어');
    }

    // 과목·단원 관리
    const card = t.closest('.tax-card');
    if (card) {
      const si = +card.dataset.si, s = taxDraft[si];
      if (d.smove) { if (move(taxDraft, si, d.smove)) { markTaxDirty(); renderTaxAdmin(); } return; }
      if (t.matches('[data-sdel]')) {
        const n = files.filter((f) => f.subject === s.id).length;
        if (!confirm(`"${s.name}" 과목을 삭제할까?${n ? `\n이 과목 자료 ${n}개는 "미분류"로 남아.` : ''}\n(저장 버튼을 눌러야 반영돼)`)) return;
        taxDraft.splice(si, 1); markTaxDirty(); renderTaxAdmin(); return;
      }
      if (t.matches('[data-uadd]')) return addUnit(card);
      const row = t.closest('.unit-row');
      if (row) {
        const uj = +row.dataset.uj;
        if (d.umove) { if (move(s.units, uj, d.umove)) { markTaxDirty(); renderTaxAdmin(); } return; }
        if (t.matches('[data-udel]')) { s.units.splice(uj, 1); markTaxDirty(); renderTaxAdmin(); return; }
      }
    }

    // M패스
    if (d.pext !== undefined) return extendPass(d.pext, +d.m);
    if (d.prm !== undefined) {
      if (!confirm('M패스를 회수할까?')) return;
      await api.removePass(d.prm); await refreshPass(); renderAdminPass(); toast('회수했어');
    }
  });
}

/* =====================================================================
   시작
   ===================================================================== */
async function applyUser(u) {
  if (u && u.status === 'rejected') { // PyNest 에서 사용 중지된 계정
    toast('사용이 중지된 계정이에요. 선생님께 문의해주세요');
    await api.logout();
    return;
  }
  user = u;
  isAdmin = calcAdmin(u);
  hasPass = false;
  if (u) { try { hasPass = await api.hasPass(u.id); } catch (e) { console.warn(e); } }
  await loadFiles();
}

(async function init() {
  bind();
  api = DEMO ? demoBackend() : await supabaseBackend();
  if (DEMO) {
    document.body.insertAdjacentHTML('afterbegin',
      '<div id="demoBar" style="background:#ffb84d;color:#111;text-align:center;padding:6px;font-size:.82rem;font-weight:700">데모 모드 (새로고침하면 초기화) — ' +
      '<a href="#" id="demoPass" style="color:#111">M패스 토글</a> · <a href="#" id="demoAdmin" style="color:#111">관리자 토글</a></div>');
    $('#demoPass').onclick = async (e) => {
      e.preventDefault();
      window.__demoPass = !window.__demoPass;
      if (!user) await api.login('demo_user'); else await applyUser(user);
      toast(window.__demoPass ? 'M패스 ON' : 'M패스 OFF');
    };
    $('#demoAdmin').onclick = async (e) => {
      e.preventDefault();
      window.__demoAdmin = !window.__demoAdmin;
      if (!user) await api.login('demo_user'); else await applyUser(user);
      toast(window.__demoAdmin ? '관리자 ON — 우측 상단 ⚙️ 관리자' : '관리자 OFF');
    };
  }
  try {
    const m = await api.loadMeta();
    if (Array.isArray(m.tax)) tax = m.tax;
    if (m.site) site = { ...DEFAULT_SITE, ...m.site };
  } catch (e) { console.warn('meta 로드 실패 (기본값 사용)', e); }
  applyHash();
  renderAll();
  api.onAuth((u) => applyUser(u));
})();
