/* =====================================================================
   관리자 편집: 자료 페이지에서 바로 고치기(연필) / 새 자료 페이지
   - 설정 창을 따로 열지 않고, 자료를 연 화면에서 제목·가격·설명을 바로 수정해요.
   - 가격이 0이면 무료, 1 이상이면 프리미엄으로 자동 정해져요.
   ===================================================================== */
import { $, $$, esc, num, toast, extractDriveId, MAX_UPLOAD_MB, fmtSize, safeColor, RENDER_URL, shrinkImage, unzipImages } from './util.js?v=23';
import { S, subj, flatUnits, findUnit, can } from './state.js?v=23';
import { DEFAULT_PRICE, LEVEL_PRICE } from './defaults.js?v=23';

export const MAX_PRICE = 1000000;
const LV = ['', '기본', '표준', '심화'];

export const pencil = (fld, label = '수정') => (can('content')
  ? `<button class="pencil" type="button" data-ed="${fld}" title="${label}" aria-label="${label}">✏️</button>` : '');

/* ---------- 공통: 한 자료를 통째로 저장 (등급은 가격으로 결정) ---------- */
export const tierOf = (price) => (Number(price) > 0 ? 'premium' : 'free');

export async function applyEdit(f, ch = {}, extra = {}) {
  let p = {};
  try { p = await S.api.getPremium(f.id); } catch { /* 없으면 빈 값 */ }
  const ids = {
    main: (f.mainSrc || 'drive') !== 'drive' ? null : ((f.tier === 'free' ? f.driveId : p.driveId) || null),
    solution: !f.hasSolution || (f.solutionSrc || 'drive') !== 'drive' ? null : (p.solutionId || null),
    ...(extra.ids || {}),
  };
  const m = { ...f, ...ch };
  const price = Math.max(0, Math.min(MAX_PRICE, Math.floor(Number(m.price) || 0)));
  const data = {
    title: m.title, subject: m.subject, unit: m.unit || '', level: Number(m.level) || 1, tier: tierOf(price),
    count: Number(m.count) || 0, desc: m.desc || '', price, visible: m.visible !== false,
    mainSrc: m.mainSrc || 'drive', hasSolution: !!m.hasSolution, solutionSrc: m.solutionSrc || 'drive',
    previewSrc: m.previewSrc || 'drive', previewId: m.previewId || '',
  };
  await S.api.updateFile(f.id, data, ids, extra.up || {});
  return data;
}

/* ---------- 에러 안내 ---------- */
export function showErr(form, err) {
  const raw = String(err?.message || err?.error || err || '').slice(0, 300);
  let hint = 'schema.sql 전체를 다시 실행했는지, 관리자로 로그인돼 있는지 확인해줘.';
  if (/row-level security|policy|unauthorized|403/i.test(raw)) hint = '권한 오류야. 관리자 계정인지 확인하고 로그아웃 후 다시 로그인해봐. schema.sql 전체 재실행도 필요해.';
  else if (/bucket.*not found|not found/i.test(raw)) hint = '저장소(mh-files)가 없어. schema.sql 전체를 SQL Editor에서 다시 실행해줘.';
  else if (/column|schema cache|main_src/i.test(raw)) hint = '테이블에 새 칸이 없어. schema.sql 전체를 다시 실행해줘.';
  else if (/size|exceed|too large|413/i.test(raw)) hint = '파일이 너무 커. 용량을 줄여서 다시 해봐.';
  let box = $('.file-err', form);
  if (!box) { box = document.createElement('p'); box.className = 'file-err'; form.appendChild(box); }
  box.textContent = `❌ 저장 실패: ${raw || '알 수 없는 오류'}\n👉 ${hint}`;
  box.classList.remove('hidden');
  toast('저장 실패 — 빨간 글씨를 확인해줘');
}

// 힌트 없이 안내 글을 그대로 보여줘요 (JSON 검사 결과처럼 여러 줄일 때)
function showMsg(form, text) {
  let box = $('.file-err', form);
  if (!box) { box = document.createElement('p'); box.className = 'file-err'; form.appendChild(box); }
  box.textContent = '⚠️ ' + text;
  box.classList.remove('hidden');
  toast(text.split('\n')[0].slice(0, 60));
}

/* ---------- 파일 소스 (문제 / 해설 / 미리보기: 없음 · 드라이브 링크 · 파일 업로드) ---------- */
export function srcFieldsHTML(mainDefault = 'upload') {
  const seg = (kind, modes) => `<div class="seg">${modes.map(([v, l]) => `<label><input type="radio" name="${kind}_mode" value="${v}"${(kind === 'main' ? mainDefault : 'none') === v ? ' checked' : ''}> ${l}</label>`).join('')}</div>`;
  const D = [['drive', '드라이브 링크'], ['upload', '파일 업로드']];
  const M = RENDER_URL ? [...D, ['json', '민혁 JSON (서버가 PDF로 변환)']] : D;
  const N = [['none', '없음'], ...M.map(([v, l]) => (v === 'json' ? ['json', '같은 JSON에서 자동 생성'] : [v, l]))];
  return `<fieldset class="src" data-kind="main"><legend>📄 문제 PDF</legend>${seg('main', M)}
      <input name="drive" data-for="drive" placeholder="https://drive.google.com/file/d/..../view">
      <input name="main_file" data-for="upload" type="file" accept="application/pdf,.pdf">
      <label class="jl" data-for="json">문제 JSON (.json)<input name="main_json" type="file" accept="application/json,.json"></label>
      <label class="jl" data-for="json">그림·도표 이미지 (.png .jpg .jpeg .svg 또는 <b>.zip</b> · 여러 개 선택 가능)<input name="main_imgs" type="file" accept="image/png,image/jpeg,.png,.jpg,.jpeg,.svg,.zip,image/svg+xml,application/zip" multiple></label>
      <small class="note" data-for="json">문제 PDF에는 문제만, <b>정답·해설은 아래 '해설 PDF'로 따로</b> 나가요(JSON에 들어 있는 정답·해설로 자동 생성). JSON 안에서 <code>"asset": "파일이름.png"</code> 로 이미지를 불러와요. zip 으로 올리면 브라우저에서 자동으로 풀어 그림만 올리고 zip 은 버려요(서버에 안 남아요). 이미지는 올리기 전에 자동으로 가볍게 줄여요. 용량은 PDF의 1/10 수준이에요.</small>
      <small class="note" data-cur></small></fieldset>
    <fieldset class="src" data-kind="solution"><legend>📝 해설 PDF <small>(선택 · 구매하거나 받은 사람만 볼 수 있음)</small></legend>${seg('solution', N)}
      <input name="solution" data-for="drive" placeholder="https://drive.google.com/file/d/..../view">
      <input name="solution_file" data-for="upload" type="file" accept="application/pdf,.pdf">
      <small class="note" data-cur></small></fieldset>
    <fieldset class="src" data-kind="preview"><legend>👁 미리보기 <small>(선택 · 샘플 1~2문제 · 누구나 볼 수 있으니 팔 내용은 넣지 마세요)</small></legend>${seg('preview', [['none', '없음'], ...D])}
      <input name="preview" data-for="drive" placeholder="https://drive.google.com/file/d/..../view">
      <input name="preview_file" data-for="upload" type="file" accept="application/pdf,.pdf">
      <small class="note" data-cur></small></fieldset>
    <p class="note">드라이브 링크는 공유를 <b>"링크가 있는 모든 사용자 – 뷰어"</b>로 해둬야 해요. 직접 업로드는 PDF만, 파일당 ${MAX_UPLOAD_MB}MB까지이고 Supabase 저장공간을 써요.</p>`;
}
export function syncSrc(form) {
  for (const fs of $$('fieldset.src', form)) {
    const mode = form.elements[fs.dataset.kind + '_mode'].value;
    $$('[data-for]', fs).forEach((el) => el.classList.toggle('hidden', el.dataset.for !== mode));
  }
}
const hadOf = (f) => ({ main: f.mainSrc === 'upload' || f.mainSrc === 'json', solution: !!f.hasSolution && (f.solutionSrc === 'upload' || f.solutionSrc === 'json'), preview: f.previewSrc === 'upload' });
// 이미 있는 자료의 현재 상태를 폼에 채워요
export function fillSrc(form, f, p = {}) {
  const el = form.elements;
  const had = hadOf(f);
  el.main_mode.value = had.main ? (f.mainSrc === 'json' && RENDER_URL ? 'json' : 'upload') : 'drive';
  el.drive.value = had.main ? '' : ((f.tier === 'free' ? f.driveId : p.driveId) || '');
  el.solution_mode.value = !f.hasSolution ? 'none' : had.solution ? (f.solutionSrc === 'json' && RENDER_URL ? 'json' : 'upload') : 'drive';
  el.solution.value = p.solutionId || '';
  el.preview_mode.value = had.preview ? 'upload' : f.previewId ? 'drive' : 'none';
  el.preview.value = f.previewId || '';
  const note = '✅ 이미 업로드된 파일이 있어요. 새 파일을 고르면 교체돼요.';
  for (const k of ['main', 'solution', 'preview']) $(`fieldset.src[data-kind=${k}] [data-cur]`, form).textContent = had[k] ? note : '';
  form.dataset.had = JSON.stringify(had);
  syncSrc(form);
}
const ASSET_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,59}\.(png|jpe?g|svg)$/i;
// 민혁 JSON 읽기: JSON 문법 → 이미지 이름 → (변환 서버가 있으면) 서버 검사까지
async function readJson(form, had) {
  const jf = form.elements.main_json.files[0];
  let imgFiles = [];
  for (const f of form.elements.main_imgs.files) {
    if (/\.zip$/i.test(f.name) || /zip/.test(f.type)) {
      try { imgFiles.push(...await unzipImages(f)); } catch (e) { return { error: String(e.message || e) }; }   // zip 은 여기서 풀고 버려요 (서버에는 그림만 올라가요)
    } else imgFiles.push(f);
  }
  let existing = [];
  try { existing = JSON.parse(form.dataset.imgs || '[]'); } catch { /* 새 자료 */ }
  const images = [];
  const seen = new Set();
  for (const f of imgFiles) {
    const name = f.name.replace(/\s+/g, '_');
    if (!ASSET_RE.test(name)) return { error: `이미지 이름을 바꿔줘: "${f.name}" (영문·숫자·_-. 만, .png .jpg .jpeg .svg)` };
    if (seen.has(name)) return { error: `같은 이름의 이미지가 두 개예요: ${name}` };
    seen.add(name);
    if (f.size > 20 * 1048576) return { error: `이미지가 너무 커요: ${name}` };
    const blob = await shrinkImage(f);
    if (blob.size > 3 * 1048576) return { error: `이미지는 3MB 이하로 줄여줘: ${name} (${fmtSize(blob.size)})` };
    images.push({ name, blob, type: /svg/i.test(name) ? 'image/svg+xml' : /png/i.test(name) ? 'image/png' : 'image/jpeg' });
  }
  if (!jf) return had.main ? { mode: 'json', images } : { error: '문제 JSON 파일을 골라줘' };
  if (jf.size > 1024 * 1024) return { error: 'JSON 파일은 1MB 이하여야 해요' };
  let data;
  try { data = JSON.parse((await jf.text()).replace(/^\uFEFF/, '')); } catch (e) { return { error: `JSON 문법 오류: ${e.message}` }; }
  if (data.format !== 'mhq/1') return { error: 'JSON 맨 위에 "format": "mhq/1" 이 있어야 해요' };
  const names = [...new Set([...existing, ...images.map((i) => i.name)])];
  try {
    const r = await S.api.validateMhq(data, names);
    if (!r.ok) return { error: 'JSON 에 고칠 곳이 있어요:\n' + r.errors.slice(0, 6).join('\n') };
    if (r.warnings?.length) toast('참고: ' + r.warnings[0]);
  } catch (e) {
    if (!confirm(`검사 서버에 연결하지 못했어요. (${String(e.message).slice(0, 80)})\n검사 없이 그냥 저장할까요?`)) return { error: '저장을 취소했어' };
    const missing = [...new Set((data.questions || []).map((q) => q.visual?.asset).filter(Boolean))].filter((n) => !names.includes(n));
    if (missing.length) return { error: `올리지 않은 이미지가 있어요: ${missing.join(', ')}` };
  }
  return { mode: 'json', json: new Blob([JSON.stringify(data)], { type: 'application/json' }), images };
}
async function readSrc(form, kind, label, had) {
  const mode = form.elements[kind + '_mode'].value;
  const linkName = { main: 'drive', solution: 'solution', preview: 'preview' }[kind];
  if (mode === 'none') return { mode };
  if (mode === 'json') return kind === 'main' ? readJson(form, had) : { mode };
  if (mode === 'drive') {
    const id = extractDriveId(form.elements[linkName].value);
    return id ? { mode, id } : { error: `${label} 드라이브 링크를 다시 확인해줘` };
  }
  const file = form.elements[kind + '_file'].files[0];
  if (!file) return had[kind] ? { mode } : { error: `${label} 파일을 골라줘` };
  if (!(file.type === 'application/pdf' || /\.pdf$/i.test(file.name))) return { error: `${label}는 PDF 파일만 올릴 수 있어요` };
  if (file.size > MAX_UPLOAD_MB * 1048576) return { error: `${label} 파일이 너무 커요 (${fmtSize(file.size)} / 최대 ${MAX_UPLOAD_MB}MB)` };
  return { mode, file };
}
export async function collectSources(form) {
  let had = { main: false, solution: false, preview: false };
  try { had = JSON.parse(form.dataset.had || '') || had; } catch { /* 새 자료 */ }
  const main = await readSrc(form, 'main', '문제 PDF', had);
  const sol = await readSrc(form, 'solution', '해설 PDF', had);
  const prev = await readSrc(form, 'preview', '미리보기', had);
  const bad = [main, sol, prev].find((x) => x.error);
  if (bad) return { error: bad.error };
  if (sol.mode === 'json' && main.mode !== 'json') return { error: '"같은 JSON에서 자동 생성"은 문제를 민혁 JSON으로 올렸을 때만 쓸 수 있어요' };
  const up = {};
  if (main.json) up.mainJson = main.json;
  if (main.images?.length) up.images = main.images;
  if (main.file) up.main = main.file;
  if (sol.file) up.solution = sol.file;
  if (prev.file) up.preview = prev.file;
  return {
    data: {
      mainSrc: main.mode === 'upload' ? 'upload' : main.mode === 'json' ? 'json' : 'drive',
      hasSolution: sol.mode !== 'none', solutionSrc: sol.mode === 'upload' ? 'upload' : sol.mode === 'json' ? 'json' : 'drive',
      previewSrc: prev.mode === 'upload' ? 'upload' : 'drive', previewId: prev.mode === 'drive' ? prev.id : '',
    },
    ids: { main: main.mode === 'drive' ? main.id : null, solution: sol.mode === 'drive' ? sol.id : null },
    up,
  };
}

/* ---------- 연필로 바로 수정 ---------- */
const unitOptions = (sid, sel) => '<option value="">(단원 없음)</option>' + flatUnits(subj(sid)?.units).map(({ u, depth }) =>
  `<option value="${esc(u.id)}"${u.id === sel ? ' selected' : ''}>${esc('　'.repeat(depth) + (depth ? '└ ' : '') + u.name)}</option>`).join('');

function editorHTML(f, fld) {
  if (fld === 'title') return `<input class="ed-in" name="v" maxlength="120" value="${esc(f.title)}" aria-label="제목">`;
  if (fld === 'price') return `<input class="ed-in num" name="v" type="number" min="0" max="${MAX_PRICE}" step="1" value="${Number(f.price) || 0}" aria-label="가격(P)"> <span>P</span><small class="ed-hint">0이면 무료 자료가 돼요</small>`;
  if (fld === 'desc') return `<textarea class="ed-in" name="v" rows="3" maxlength="500" aria-label="설명">${esc(f.desc || '')}</textarea>`;
  if (fld === 'level') return `<select class="ed-in" name="v" aria-label="난이도">${[1, 2, 3].map((n) => `<option value="${n}"${Number(f.level) === n ? ' selected' : ''}>${'●'.repeat(n)}${'○'.repeat(3 - n)} ${LV[n]}</option>`).join('')}</select>`;
  if (fld === 'count') return `<input class="ed-in num" name="v" type="number" min="1" max="99" step="1" value="${Number(f.count) || ''}" aria-label="문항 수"> <span>문항</span>`;
  if (fld === 'place') {
    return `<select class="ed-in" name="subject" aria-label="과목">${S.tax.map((s) => `<option value="${esc(s.id)}"${s.id === f.subject ? ' selected' : ''}>${esc(s.emoji)} ${esc(s.name)}</option>`).join('')}</select>
      <select class="ed-in" name="unit" aria-label="단원">${unitOptions(f.subject, f.unit)}</select>`;
  }
  return '';
}
export function startEdit(fid, fld, btn) {
  const f = S.files.find((x) => x.id === fid);
  const host = btn.closest('[data-edhost]');
  if (!f || !host || host.classList.contains('editing')) return;
  host.dataset.old = host.innerHTML;
  host.classList.add('editing');
  host.innerHTML = `<span class="ed-box">${editorHTML(f, fld)}<span class="ed-btns"><button class="btn sm primary" type="button" data-edok>저장</button><button class="btn sm ghost" type="button" data-edno>취소</button></span></span>`;
  const first = $('.ed-in', host);
  first?.focus();
  if (first && first.select && first.tagName !== 'SELECT') first.select();
}
export function cancelEdit(btn) {
  const host = btn.closest('[data-edhost]');
  if (!host) return;
  host.innerHTML = host.dataset.old || '';
  host.classList.remove('editing');
}
export async function commitEdit(btn) {
  const host = btn.closest('[data-edhost]');
  if (!host) return;
  const fld = host.dataset.edhost, f = S.files.find((x) => x.id === host.dataset.fid);
  if (!f) return;
  const v = (n = 'v') => host.querySelector(`[name=${n}]`)?.value ?? '';
  let ch = {}, msg = '저장했어 ✅';
  if (fld === 'title') { const t = v().trim(); if (!t) return toast('제목을 입력해줘'); ch = { title: t }; }
  else if (fld === 'desc') ch = { desc: v().trim() };
  else if (fld === 'level') ch = { level: Number(v()) || 1 };
  else if (fld === 'count') { const n = Math.floor(Number(v())); if (!(n >= 1 && n <= 99)) return toast('문항 수는 1~99로 적어줘'); ch = { count: n }; }
  else if (fld === 'place') ch = { subject: v('subject'), unit: v('unit') };
  else if (fld === 'price') {
    const n = Math.floor(Number(v()));
    if (!(n >= 0 && n <= MAX_PRICE)) return toast(`가격은 0~${num(MAX_PRICE)} 사이로 적어줘`);
    ch = { price: n };
    if (tierOf(n) !== f.tier) msg = n > 0 ? `${num(n)}P — 프리미엄 자료로 바뀌었어 ✅` : '가격이 0이라 무료 자료로 바뀌었어 ✅';
  }
  btn.disabled = true;
  try {
    await applyEdit(f, ch);
    await S.hooks.reload();
    toast(msg);
  } catch (err) {
    console.error(err);
    btn.disabled = false;
    toast('저장 실패 — schema.sql 전체 실행 / 관리자 로그인을 확인해줘');
  }
}

/* ---------- 파일 · 공개 설정(자료 페이지 안) ---------- */
export function filePanelHTML(f) {
  return `<form id="formSrc" class="form hidden" data-fid="${esc(f.id)}" novalidate>
    ${srcFieldsHTML()}
    <div class="row"><button class="btn primary" type="submit" id="btnSaveSrc">파일 변경 저장</button><button class="btn ghost" type="button" data-srcclose>닫기</button></div></form>`;
}
export async function openFilePanel(fid) {
  const f = S.files.find((x) => x.id === fid);
  const form = $('#formSrc');
  if (!f || !form) return;
  let p = {};
  try { p = await S.api.getPremium(f.id); } catch { /* 빈 값 */ }
  form.reset();
  form.dataset.imgs = '[]';
  if (f.mainSrc === 'json') { try { form.dataset.imgs = JSON.stringify(await S.api.listImgs(f.id)); } catch { /* 목록 실패 */ } }
  fillSrc(form, f, p);
  form.classList.remove('hidden');
  form.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
}
async function submitSrc(form) {
  const f = S.files.find((x) => x.id === form.dataset.fid);
  if (!f) return;
  $('.file-err', form)?.classList.add('hidden');
  const btn = $('#btnSaveSrc'), label = btn.textContent;
  btn.disabled = true; btn.textContent = '확인 중…';
  const src = await collectSources(form);
  if (src.error) { btn.disabled = false; btn.textContent = label; return showMsg(form, src.error); }
  if (Object.keys(src.up).length) btn.textContent = '업로드 중… (창을 닫지 마세요)';
  else btn.textContent = label;
  try {
    await applyEdit(f, src.data, { ids: src.ids, up: src.up });
    await S.hooks.reload();
    toast('파일을 저장했어 ✅');
  } catch (err) { console.error(err); btn.disabled = false; btn.textContent = label; showErr(form, err); }
}

/* ---------- 새 자료 페이지 (자료 상세 페이지와 같은 모양) ---------- */
export function newPageHTML(pre = {}) {
  document.title = '새 자료 만들기 — 민혁닷컴';
  const sid = subj(pre.s) ? pre.s : S.tax[0]?.id || '';
  const un = findUnit(subj(sid), pre.u) ? pre.u : '';
  if (!can('content')) return '<div class="notfound"><h2>자료 올리기 권한이 필요해요</h2><p>OWNER · ADMIN · TEACHER 계정으로 로그인해줘.</p><a class="btn primary" href="#/">홈으로</a></div>';
  if (!S.tax.length) return '<div class="notfound"><h2>과목이 아직 없어요</h2><p>관리자 › 과목·단원에서 과목을 먼저 만들어줘.</p></div>';
  const sj = subj(sid);
  return `<div class="crumb"><a href="#/">홈</a> › <a href="#/${encodeURIComponent(sid)}">${esc(sj.name)}</a> › <span>새 자료 만들기</span></div>
  <form id="formNew" class="detail new-page" novalidate>
    <div class="d-main">
      <div class="d-top"><div class="cover big" style="--c:${safeColor(sj.color)}"><div class="sheet"><i class="sh-bar"></i><b>${esc(sj.emoji)}</b><span class="sh-t">새 자료</span><em>문항</em><u></u><u></u><u></u></div></div>
        <div class="d-info">
          <div class="n-place"><select id="nSubject" name="subject" aria-label="과목">${S.tax.map((s) => `<option value="${esc(s.id)}"${s.id === sid ? ' selected' : ''}>${esc(s.emoji)} ${esc(s.name)}</option>`).join('')}</select>
            <select id="nUnit" name="unit" aria-label="단원">${unitOptions(sid, un)}</select></div>
          <input class="n-title" name="title" maxlength="120" required placeholder="제목 (예: 역학 심화 12제)" aria-label="제목">
          <textarea class="n-desc" name="desc" rows="3" maxlength="500" placeholder="내용 설명 (어떤 단원·난이도인지 한두 줄)" aria-label="설명"></textarea>
          <dl class="spec">
            <dt>난이도</dt><dd><select name="level" aria-label="난이도"><option value="1">● 기본</option><option value="2" selected>●● 표준</option><option value="3">●●● 심화</option></select></dd>
            <dt>문항 수</dt><dd><input name="count" type="number" min="1" max="99" step="1" value="12" aria-label="문항 수"> 문항</dd>
            <dt>공개</dt><dd><select name="visible" aria-label="공개 상태"><option value="1">바로 공개</option><option value="0">숨김 (초안)</option></select></dd>
          </dl>
        </div></div>
      <section class="d-sec"><h2>파일</h2>${srcFieldsHTML('upload')}</section>
    </div>
    <aside class="d-buy"><div class="buy-box">
      <div class="b-price"><span>가격</span><label class="n-price"><input name="price" type="number" min="0" max="${MAX_PRICE}" step="1" value="${DEFAULT_PRICE}" aria-label="가격(P)"><b>P</b></label></div>
      <p class="b-note" id="nTier">프리미엄 자료로 등록돼요 (구매 / M패스로 받기)</p>
      <div class="b-btns"><button class="btn primary lg block" type="submit" id="btnCreate">등록하기</button><a class="btn ghost block" href="#/${encodeURIComponent(sid)}">취소</a></div>
    </div></aside>
  </form>`;
}
export function afterNewPage() {
  const form = $('#formNew');
  if (!form) return;
  syncSrc(form);
  const lv = form.elements.level, pr = form.elements.price; let dirty = false; // 난이도를 바꾸면 기본 가격이 따라가요 (직접 고친 뒤엔 그대로)
  pr?.addEventListener('input', () => { dirty = true; });
  lv?.addEventListener('change', () => { if (!dirty && pr) pr.value = LEVEL_PRICE[Number(lv.value)] || DEFAULT_PRICE; });
  $('input[name=title]', form)?.focus();
}
async function submitNew(form) {
  $('.file-err', form)?.classList.add('hidden');
  const el = form.elements;
  const title = el.title.value.trim();
  if (!title) { el.title.focus(); return toast('제목부터 적어줘'); }
  const price = Math.floor(Number(el.price.value));
  if (!(price >= 0 && price <= MAX_PRICE)) return toast(`가격은 0~${num(MAX_PRICE)} 사이로 적어줘`);
  const count = Math.floor(Number(el.count.value));
  if (!(count >= 1 && count <= 99)) return toast('문항 수는 1~99로 적어줘');
  const btnC = $('#btnCreate'), labelC = btnC.textContent;
  btnC.disabled = true; btnC.textContent = '확인 중…';
  const src = await collectSources(form);
  btnC.disabled = false; btnC.textContent = labelC;
  if (src.error) return showMsg(form, src.error);
  const data = {
    title, subject: el.subject.value, unit: el.unit.value || '', level: Number(el.level.value) || 2, tier: tierOf(price),
    count, desc: el.desc.value.trim(), price, visible: el.visible.value === '1', ...src.data,
  };
  const btn = $('#btnCreate'), label = btn.textContent;
  btn.disabled = true;
  if (Object.keys(src.up).length) btn.textContent = '업로드 중… (창을 닫지 마세요)';
  try {
    const id = await S.api.addFile(data, src.ids, src.up);
    await S.hooks.loadFiles();
    toast('등록 완료! 🎉');
    location.hash = `#/f/${encodeURIComponent(id)}`;
  } catch (err) { console.error(err); btn.disabled = false; btn.textContent = label; showErr(form, err); }
}

/* ---------- 이벤트 연결 (한 번만) ---------- */
export function bindEditor() {
  document.addEventListener('keydown', (e) => {
    const host = e.target.closest?.('[data-edhost].editing');
    if (!host) return;
    if (e.key === 'Escape') { e.preventDefault(); cancelEdit(e.target); }
    else if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') { e.preventDefault(); commitEdit(e.target); }
  });
  document.addEventListener('change', (e) => {
    const t = e.target;
    const form = t.closest?.('#formNew, #formSrc');
    if (form && t.type === 'radio') {
      // 문제를 민혁 JSON 으로 고르면 해설도 같은 JSON 에서 자동으로 만들게 미리 골라줘요 (안 그러면 정답·해설 PDF 가 없어요)
      if (t.name === 'main_mode' && t.value === 'json' && form.elements.solution_mode?.value === 'none') form.elements.solution_mode.value = 'json';
      syncSrc(form);
    }
    if (t.id === 'nSubject') { $('#nUnit').innerHTML = unitOptions(t.value, ''); }
    if (t.matches?.('[data-edhost] select[name=subject]')) { $('select[name=unit]', t.closest('[data-edhost]')).innerHTML = unitOptions(t.value, ''); }
  });
  document.addEventListener('input', (e) => {
    if (e.target.closest?.('#formNew') && e.target.name === 'price') {
      const n = Math.floor(Number(e.target.value));
      $('#nTier').textContent = n > 0 ? '프리미엄 자료로 등록돼요 (구매 / M패스로 받기)' : '가격이 0이라 무료 자료로 등록돼요';
    }
  });
  document.addEventListener('submit', (e) => {
    const form = e.target;
    if (form.id === 'formNew') { e.preventDefault(); submitNew(form); }
    else if (form.id === 'formSrc') { e.preventDefault(); submitSrc(form); }
  });
}
