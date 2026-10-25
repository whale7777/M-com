import { CONFIG } from './config.js?v=7';
import { $, $$, esc, clone, safeColor, safeLink, num, fmtDT, fmtDate, richText, ID_RE, toast, triggerDownload, DAY, PYNEST_URL } from './util.js?v=7';
import { DEFAULT_TAX, DEFAULT_SITE, DEFAULT_MENU } from './defaults.js?v=7';
import { demoBackend, supabaseBackend } from './backend.js?v=7';
import { S, subj, unitOf, created, isNew, visibleFiles, unlocked, canMain, canSol, buyable, hasPreview } from './state.js?v=7';
import { bindAdmin, openAdmin, adminClick, openAdminNewFile, openAdminEditFile } from './admin.js?v=7';

S.DEMO = !CONFIG.SUPABASE_URL || /여기에/.test(CONFIG.SUPABASE_URL) || new URLSearchParams(location.search).has('demo');
const demoFlags = {};
const calcAdmin = (u) => !!u && ((u.role === 'admin' && u.status === 'approved') || (S.DEMO && !!window.__demoAdmin));
const nl2br = (s) => esc(s || '').replace(/\n/g, '<br>');
const LV = ['', '기본', '표준', '심화'];
const lvDots = (l) => { const n = Math.min(3, Math.max(1, Number(l) || 1)); return '●'.repeat(n) + '○'.repeat(3 - n); };
const linkAttrs = (u) => { const l = safeLink(u); return /^https?:/.test(l) ? `href="${esc(l)}" target="_blank" rel="noopener"` : `href="${esc(l)}"`; };

/* =====================================================================
   공통 조각 (헤더 · 카테고리 · 푸터)
   ===================================================================== */
function renderHeader() {
  $('#btnLogin').classList.toggle('hidden', !!S.user);
  $('#btnLogout').classList.toggle('hidden', !S.user);
  $('#btnAdmin').classList.toggle('hidden', !S.isAdmin);
  const chip = $('#userChip');
  chip.classList.toggle('hidden', !S.user);
  if (S.user) {
    chip.innerHTML = `<span class="un">${esc(S.user.username)}</span>` +
      (S.isAdmin ? '<i class="badge admin">ADMIN</i>' : S.hasPass ? '<i class="badge m">M PASS</i>' : '') +
      `<b class="pts">🪙 ${num(S.points)} P</b>`;
  }
  renderDrawerUser();
}
function renderDrawerUser() {
  $('#drUser').innerHTML = S.user
    ? `<div class="dr-who"><b>${esc(S.user.username)}</b>${S.isAdmin ? '<i class="badge admin">ADMIN</i>' : S.hasPass ? '<i class="badge m">M PASS</i>' : ''}</div>
       <div class="dr-pts"><span>🪙 ${num(S.points)} P</span><a href="#/points">충전</a></div>
       <button class="btn ghost sm" data-act="logout" type="button">로그아웃</button>`
    : `<button class="btn primary block" data-act="login" type="button">로그인</button>${CONFIG.ALLOW_SIGNUP ? '<button class="btn ghost block" data-act="signup" type="button">회원가입</button>' : ''}`;
}

/* ---- 왼쪽 메뉴 패널 ---- */
function openDrawer() { $('#drawer').classList.add('open'); $('#drawerBg').classList.add('open'); $('#drawer').setAttribute('aria-hidden', 'false'); document.body.classList.add('no-scroll'); }
function closeDrawer() { $('#drawer').classList.remove('open'); $('#drawerBg').classList.remove('open'); $('#drawer').setAttribute('aria-hidden', 'true'); document.body.classList.remove('no-scroll'); }
const hashKey = (h) => { const x = String(h || '#/').split('?')[0].replace(/\/$/, ''); return x === '#' || x === '' ? '#/' : x; };
function menuItemHTML(m) {
  if (m.on === false) return '';
  if (m.type === 'heading') return `<div class="dr-h">${esc(m.label)}</div>`;
  if (m.type === 'subjects') {
    return S.tax.map((s) => {
      const open = route.cur === 'list' && view.s === s.id;
      const base = `#/${encodeURIComponent(s.id)}`;
      return `<details class="dr-sub" style="--c:${safeColor(s.color)}" ${open ? 'open' : ''}><summary>${esc(s.emoji)} ${esc(s.name)}</summary>
        <a class="dr-link ${open && view.u === 'all' ? 'on' : ''}" href="${base}">전체 보기</a>` +
        (s.units || []).map((u) => `<a class="dr-link ${open && view.u === u.id ? 'on' : ''}" href="${base}/${encodeURIComponent(u.id)}">${esc(u.name)}</a>`).join('') + '</details>';
    }).join('');
  }
  const link = safeLink(m.link);
  const on = !/^https?:/.test(link) && hashKey(link) === hashKey(location.hash);
  return `<a class="dr-item ${on ? 'on' : ''}" ${linkAttrs(m.link)}><span class="dr-e">${esc(m.emoji || '•')}</span>${esc(m.label)}${/^https?:/.test(link) ? '<em>↗</em>' : ''}</a>`;
}
function renderDrawerNav() {
  const items = Array.isArray(S.site.menu) && S.site.menu.length ? S.site.menu : DEFAULT_MENU;
  $('#drNav').innerHTML = items.map(menuItemHTML).join('') || menuItemHTML(DEFAULT_MENU[0]);
}

function renderChrome() {
  const on = S.site.noticeOn && S.site.notice;
  $('#notice').classList.toggle('hidden', !on);
  $('#notice').textContent = S.site.notice || '';
  $('#contact').textContent = S.site.contact || '';
  $('#year').textContent = new Date().getFullYear();
  $('#aboutShort').textContent = (S.site.about || '').split('\n')[0];
  $('#ftPynest').href = safeLink(PYNEST_URL);
  const py = safeLink(PYNEST_URL);
  $('#swPynest').href = py;
  $('#swPynest2').href = py;
  renderDrawerNav();
}

/* =====================================================================
   자료 카드
   ===================================================================== */
function coverHTML(f, big = false) {
  const sj = subj(f.subject), un = unitOf(f);
  return `<div class="cover ${big ? 'big' : ''}" style="--c:${safeColor(sj?.color)}"><div class="sheet">
    <i class="sh-bar"></i><b>${esc(sj ? sj.emoji : '📘')}</b><span class="sh-t">${esc(un ? un.name : sj ? sj.name : '미분류')}</span>
    <em>${Number(f.count) || '-'}문항</em><u></u><u></u><u></u></div></div>`;
}
function priceTag(f) {
  if (S.isAdmin) return `<span class="pt own">관리자</span>${f.price ? `<span class="pt price">🪙 ${num(f.price)}P</span>` : ''}`;
  if (f.tier === 'free') return `<span class="pt free">무료</span>${f.hasSolution && f.price && !unlocked(f) ? `<span class="pt sub">해설 ${num(f.price)}P</span>` : ''}`;
  if (unlocked(f)) return `<span class="pt own">${S.hasPass && !S.owned.has(f.id) ? 'M패스 이용중' : '구매함'}</span>`;
  return Number(f.price) > 0 ? `<span class="pt price">🪙 ${num(f.price)}P</span>` : '<span class="pt pass">M패스 전용</span>';
}
function cardHTML(f) {
  const sj = subj(f.subject), un = unitOf(f);
  return `<a class="card ${f.visible === false ? 'draft' : ''}" href="#/f/${encodeURIComponent(f.id)}">
    <div class="c-img">${coverHTML(f)}
      <span class="c-badges">${f.pinned ? '<i class="bd pin">📌</i>' : ''}${isNew(f) ? '<i class="bd new">NEW</i>' : ''}${f.visible === false ? '<i class="bd hid">숨김</i>' : ''}${f.hasSolution ? '<i class="bd sol">해설</i>' : ''}</span></div>
    <div class="c-body">
      <div class="c-tag" style="--c:${safeColor(sj?.color)}">${esc(sj ? sj.name : '미분류')}${un ? ' · ' + esc(un.name) : ''}</div>
      <h3>${esc(f.title)}</h3>
      <div class="c-meta"><span title="난이도">${lvDots(f.level)} ${LV[Math.min(3, Math.max(1, Number(f.level) || 1))]}</span><span>${Number(f.count) || '-'}문항</span><span>⬇ ${num(f.downloads)}</span></div>
      <div class="c-foot">${priceTag(f)}</div>
    </div></a>`;
}
const gridOf = (list) => `<div class="grid">${list.map(cardHTML).join('')}</div>`;
const section = (title, more, list, cls = '') => list.length
  ? `<section class="blk ${cls}"><div class="blk-h"><h2>${title}</h2>${more ? `<a class="more" href="${more}">더보기 ›</a>` : ''}</div>${gridOf(list)}</section>` : '';

/* =====================================================================
   라우터   #/ (홈) · #/list · #/<과목>[/<단원>] · #/f/<id> · #/me · #/points · #/pass · #/about
   ===================================================================== */
const view = { s: 'all', u: 'all', tier: 'all', sort: 'new', q: '' };
let tok = 0, carouselTimer = null;

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, qs] = raw.split('?');
  const parts = path.split('/').filter(Boolean).map((x) => { try { return decodeURIComponent(x); } catch { return x; } });
  return { parts, q: Object.fromEntries(new URLSearchParams(qs || '')) };
}
function navigate(h) { if (location.hash === h) route(); else location.hash = h; }

async function route() {
  const my = ++tok;
  clearInterval(carouselTimer);
  closeDrawer();
  const { parts, q } = parseHash();
  const head = parts[0] || '';
  let cur = 'home', html = '', post = null;
  Object.assign(view, { s: 'all', u: 'all', tier: 'all', sort: 'new', q: '' });

  if (head === 'f') {
    cur = 'detail'; html = detailHTML(parts[1]);
  } else if (head === 'notices') {
    cur = 'notices'; html = parts[1] ? noticeDetailHTML(parts[1]) : noticesHTML();
  } else if (head === 'me') {
    cur = 'me'; html = await meHTML();
  } else if (head === 'points') {
    cur = 'points'; html = await pointsHTML();
  } else if (head === 'pass') {
    cur = 'pass'; html = passHTML();
  } else if (head === 'about') {
    cur = 'about'; html = aboutHTML();
  } else if (head === 'list' || subj(head)) {
    cur = 'list';
    if (subj(head)) {
      view.s = head;
      if (parts[1] && (subj(head).units || []).some((u) => u.id === parts[1])) view.u = parts[1];
    }
    if (['all', 'free', 'premium'].includes(q.tier)) view.tier = q.tier;
    if (['new', 'pop', 'easy', 'hard', 'title'].includes(q.sort)) view.sort = q.sort;
    view.q = (q.q || '').slice(0, 60);
    html = listHTML();
    post = () => { $('#tierSel').value = view.tier; $('#sortSel').value = view.sort; renderListGrid(); };
  } else {
    html = homeHTML(); post = startCarousel;
  }
  if (my !== tok) return; // 더 최신 이동이 있으면 버림
  route.cur = cur;
  $('#view').innerHTML = html;
  $('#gq').value = cur === 'list' ? view.q : $('#gq').value;
  renderChrome();
  if (post) post();
  window.scrollTo?.(0, 0);
}
route.cur = 'home';

/* =====================================================================
   홈
   ===================================================================== */
function bannerHTML(b, i) {
  return `<a class="slide ${i === 0 ? 'on' : ''}" style="--c:${safeColor(b.color)}" ${linkAttrs(b.link)}>
    <div class="s-txt"><h2>${nl2br(b.title)}</h2><p>${esc(b.sub || '')}</p>${b.cta ? `<span class="s-cta">${esc(b.cta)} →</span>` : ''}</div>
    <div class="s-emoji" aria-hidden="true">${esc(b.emoji || '✨')}</div></a>`;
}
function acctHTML() {
  if (!S.user) {
    return `<h3>로그인하고 시작해요</h3><p>PyNest 계정 그대로 로그인할 수 있어요.<br>M포인트로 프리미엄 자료를 구매해요.</p>
      <div class="a-btns"><button class="btn primary block" data-act="login" type="button">로그인</button>
      ${CONFIG.ALLOW_SIGNUP ? '<button class="btn ghost block" data-act="signup" type="button">회원가입</button>' : ''}</div>`;
  }
  return `<div class="a-hi"><b>${esc(S.user.username)}</b>님 ${S.isAdmin ? '<i class="badge admin">ADMIN</i>' : S.hasPass ? '<i class="badge m">M PASS</i>' : ''}</div>
    <div class="a-pts"><span>내 M포인트</span><b>🪙 ${num(S.points)} P</b></div>
    <div class="a-btns"><a class="btn primary block" href="#/points">충전하기</a><a class="btn ghost block" href="#/me">내 자료 · 내역</a></div>`;
}
function homeHTML() {
  const pub = visibleFiles();
  const banners = (S.site.banners || []).filter((b) => b.on !== false);
  const sets = pub.length, qn = pub.reduce((n, f) => n + (Number(f.count) || 0), 0);
  const free = pub.filter((f) => f.tier === 'free').length, dl = pub.reduce((n, f) => n + (f.downloads || 0), 0);
  const by = (fn) => [...pub].sort(fn);
  return `
  <section class="hero-row">
    <div class="carousel" id="carousel">
      <div class="slides">${banners.length ? banners.map(bannerHTML).join('') : bannerHTML({ title: '민혁닷컴', sub: S.site.heroSub, color: '#2f5bff', emoji: '🔬' }, 0)}</div>
      ${banners.length > 1 ? `<div class="dots">${banners.map((_, i) => `<button type="button" class="dot ${i === 0 ? 'on' : ''}" data-dot="${i}" aria-label="배너 ${i + 1}"></button>`).join('')}</div>` : ''}
    </div>
    <aside class="acct" id="acct">${acctHTML()}</aside>
  </section>

  ${noticeBlockHTML()}

  <section class="stats-strip">
    <div><b>${num(sets)}</b><span>PDF 세트</span></div><div><b>${num(qn)}</b><span>엄선 문항</span></div>
    <div><b>${num(free)}</b><span>무료 공개</span></div><div><b>${num(dl)}</b><span>누적 다운로드</span></div>
  </section>

  <section class="blk"><div class="blk-h"><h2>과목별로 찾기</h2></div>
    <div class="subj-tiles">${S.tax.map((s) => {
      const n = pub.filter((f) => f.subject === s.id).length;
      return `<a class="tile" style="--c:${safeColor(s.color)}" href="#/${encodeURIComponent(s.id)}"><span class="t-emo">${esc(s.emoji)}</span><b>${esc(s.name)}</b><small>${n}개 · ${(s.units || []).length}개 단원</small></a>`;
    }).join('')}</div></section>

  ${section('🔥 지금 인기 있는 자료', '#/list?sort=pop', by((a, b) => (b.downloads || 0) - (a.downloads || 0)).slice(0, 8))}
  ${section('🆕 새로 올라왔어요', '#/list?sort=new', by((a, b) => created(b) - created(a)).slice(0, 8))}
  ${section('🎁 무료로 받아가세요', '#/list?tier=free', by((a, b) => (b.downloads || 0) - (a.downloads || 0)).filter((f) => f.tier === 'free').slice(0, 4))}

  <section class="blk"><div class="blk-h"><h2>이렇게 이용해요</h2></div>
    <ol class="steps">
      <li><i>1</i><b>자료 고르기</b><span>과목·단원으로 찾고, 상세 페이지에서 미리보기와 구성을 확인해요.</span></li>
      <li><i>2</i><b>받기 · 구매하기</b><span>무료는 바로 다운로드, 프리미엄은 M포인트로 구매하거나 M패스로 열어요.</span></li>
      <li><i>3</i><b>풀고 복습하기</b><span>구매한 자료는 내 정보에서 언제든 다시 받을 수 있어요. 해설 PDF도 함께요.</span></li>
    </ol></section>

  <section class="promo-row">
    <a class="promo p1" href="#/pass"><span>👑</span><div><b>M패스</b><p>프리미엄 전체 자료 + 해설을 기간 동안 무제한으로</p></div><em>자세히 ›</em></a>
    <a class="promo p2" href="#/points"><span>🪙</span><div><b>M포인트</b><p>필요한 세트만 골라서 구매. 한 번 사면 계속 받아요</p></div><em>충전하기 ›</em></a>
  </section>`;
}
function startCarousel() {
  const slides = $$('#carousel .slide');
  if (slides.length < 2) return;
  let i = 0;
  const show = (n) => {
    i = (n + slides.length) % slides.length;
    slides.forEach((s, k) => s.classList.toggle('on', k === i));
    $$('#carousel .dot').forEach((d, k) => d.classList.toggle('on', k === i));
  };
  show.go = show;
  startCarousel.show = show;
  carouselTimer = setInterval(() => show(i + 1), 5500);
}

/* =====================================================================
   목록
   ===================================================================== */
function currentList() {
  const q = view.q.trim().toLowerCase();
  const sorters = {
    new: (a, b) => created(b) - created(a),
    pop: (a, b) => (b.downloads || 0) - (a.downloads || 0),
    easy: (a, b) => (a.level || 0) - (b.level || 0),
    hard: (a, b) => (b.level || 0) - (a.level || 0),
    title: (a, b) => String(a.title).localeCompare(String(b.title), 'ko'),
  };
  return S.files
    .filter((f) => (view.s === 'all' || f.subject === view.s) && (view.u === 'all' || f.unit === view.u) &&
      (view.tier === 'all' || f.tier === view.tier) &&
      (!q || `${f.title} ${f.desc || ''} ${unitOf(f)?.name || ''} ${subj(f.subject)?.name || ''}`.toLowerCase().includes(q)))
    .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || sorters[view.sort](a, b));
}
function listHash() {
  const base = view.s === 'all' ? '#/list' : `#/${encodeURIComponent(view.s)}${view.u !== 'all' ? '/' + encodeURIComponent(view.u) : ''}`;
  const p = new URLSearchParams();
  if (view.tier !== 'all') p.set('tier', view.tier);
  if (view.sort !== 'new') p.set('sort', view.sort);
  if (view.q) p.set('q', view.q);
  return base + (p.toString() ? '?' + p : '');
}
function listHTML() {
  const sj = subj(view.s), un = sj && (sj.units || []).find((u) => u.id === view.u);
  const cnt = (pred) => S.files.filter(pred).length;
  const side = `<a class="sl ${view.s === 'all' ? 'on' : ''}" href="#/list">전체 <i>${S.files.length}</i></a>` + S.tax.map((s) => {
    const open = view.s === s.id;
    return `<div class="sg"><a class="sl ${open && view.u === 'all' ? 'on' : ''}" href="#/${encodeURIComponent(s.id)}">${esc(s.emoji)} ${esc(s.name)} <i>${cnt((f) => f.subject === s.id)}</i></a>` +
      (open ? (s.units || []).map((u) => `<a class="sl sub ${view.u === u.id ? 'on' : ''}" href="#/${encodeURIComponent(s.id)}/${encodeURIComponent(u.id)}">${esc(u.name)} <i>${cnt((f) => f.subject === s.id && f.unit === u.id)}</i></a>`).join('') : '') + '</div>';
  }).join('');
  document.title = `${sj ? sj.name + (un ? ' · ' + un.name : '') : view.q ? `'${view.q}' 검색` : '전체 자료'} — 민혁닷컴`;
  return `<div class="crumb"><a href="#/">홈</a> › ${sj ? `<a href="#/${encodeURIComponent(sj.id)}">${esc(sj.name)}</a>` : '<span>전체 자료</span>'}${un ? ` › <span>${esc(un.name)}</span>` : ''}</div>
  <div class="list-layout">
    <aside class="side"><details open><summary>과목 · 단원</summary>${side}</details></aside>
    <div class="list-main">
      <div class="list-head"><h1>${sj ? `${esc(sj.emoji)} ${esc(sj.name)}${un ? ` <small>› ${esc(un.name)}</small>` : ''}` : view.q ? `‘${esc(view.q)}’ 검색 결과` : '전체 자료'} <span id="listCount"></span></h1>
        ${S.isAdmin && sj ? `<button class="btn primary sm" data-act="admin-new" data-s="${esc(sj.id)}" data-u="${un ? esc(un.id) : ''}" type="button">＋ ${un ? '이 단원' : '이 과목'}에 자료 올리기</button>` : ''}
        <div class="controls">
          <select id="tierSel" aria-label="등급"><option value="all">모든 자료</option><option value="free">무료</option><option value="premium">프리미엄</option></select>
          <select id="sortSel" aria-label="정렬"><option value="new">최신순</option><option value="pop">인기순</option><option value="easy">쉬운 순</option><option value="hard">어려운 순</option><option value="title">제목순</option></select>
          <input id="lq" type="search" placeholder="이 목록에서 검색" value="${esc(view.q)}">
        </div></div>
      <div id="listGrid"></div>
    </div></div>`;
}
function renderListGrid() {
  const list = currentList();
  $('#listCount').textContent = `${list.length}개`;
  $('#listGrid').innerHTML = list.length ? gridOf(list) : '<p class="empty">조건에 맞는 자료가 아직 없어요 🥲<br><a href="#/list">전체 자료 보기</a></p>';
  try { history.replaceState(null, '', listHash()); } catch { /* 무시 */ }
}

/* =====================================================================
   상세
   ===================================================================== */
function detailHTML(id) {
  const f = S.files.find((x) => x.id === id);
  if (!f) { document.title = '자료를 찾을 수 없어요 — 민혁닷컴'; return '<div class="notfound"><h2>자료를 찾을 수 없어요</h2><p>삭제됐거나 비공개로 바뀐 자료일 수 있어요.</p><a class="btn primary" href="#/list">전체 자료 보기</a></div>'; }
  const sj = subj(f.subject), un = unitOf(f);
  document.title = `${f.title} — 민혁닷컴`;
  const rel = S.files.filter((x) => x.id !== f.id && x.visible !== false && x.subject === f.subject)
    .sort((a, b) => (b.unit === f.unit) - (a.unit === f.unit) || (b.downloads || 0) - (a.downloads || 0)).slice(0, 4);
  const date = created(f) ? new Date(created(f)).toISOString().slice(0, 10) : '-';
  return `<div class="crumb"><a href="#/">홈</a> › ${sj ? `<a href="#/${encodeURIComponent(sj.id)}">${esc(sj.name)}</a>` : '미분류'}${un ? ` › <a href="#/${encodeURIComponent(sj.id)}/${encodeURIComponent(un.id)}">${esc(un.name)}</a>` : ''}</div>
  <div class="detail">
    <div class="d-main">
      <div class="d-top">${coverHTML(f, true)}
        <div class="d-info">
          <div class="c-tag" style="--c:${safeColor(sj?.color)}">${esc(sj ? sj.emoji + ' ' + sj.name : '미분류')}${un ? ' · ' + esc(un.name) : ''}</div>
          <h1>${esc(f.title)} ${f.visible === false ? '<i class="bd hid">숨김</i>' : ''}${isNew(f) ? '<i class="bd new">NEW</i>' : ''}</h1>
          <p class="d-desc">${esc(f.desc || '')}</p>
          ${S.isAdmin ? `<button class="btn sm" data-act="admin-edit" data-id="${esc(f.id)}" type="button">✏️ 이 자료 수정</button>` : ''}
          <dl class="spec">
            <dt>난이도</dt><dd>${lvDots(f.level)} ${LV[Math.min(3, Math.max(1, Number(f.level) || 1))]}</dd>
            <dt>문항 수</dt><dd>${Number(f.count) || '-'}문항</dd>
            <dt>형식</dt><dd>PDF${f.hasSolution ? ' · 해설 PDF 포함' : ''}</dd>
            <dt>등록일</dt><dd>${date}</dd>
            <dt>다운로드</dt><dd>${num(f.downloads)}회</dd>
          </dl>
        </div></div>
      <section class="d-sec"><h2>이 자료에는</h2>
        <ul class="incl"><li>📄 <b>문제 PDF</b> — ${Number(f.count) || '-'}문항</li>
          <li>${f.hasSolution ? '📝 <b>해설 PDF</b> — 풀이 수록' : '<span class="dim">📝 해설 PDF 없음</span>'}</li>
          <li>♾️ <b>구매 후 재다운로드</b> 무제한 (내 정보에서 확인)</li></ul></section>
      <section class="d-sec"><h2>미리보기</h2>
        ${hasPreview(f) ? '<div id="prevBox" class="prev-box"><button class="btn ghost" data-act="preview" type="button">👁 샘플 문제 보기</button></div>' : '<p class="dim">등록된 미리보기가 없어요.</p>'}</section>
      ${rel.length ? `<section class="d-sec"><h2>같은 과목 다른 자료</h2>${gridOf(rel)}</section>` : ''}
    </div>
    <aside class="d-buy">${buyBoxHTML(f)}</aside>
  </div>`;
}
function buyBoxHTML(f) {
  const id = esc(f.id);
  const priceBig = f.tier === 'free' ? '<b class="pr free">무료</b>' : Number(f.price) > 0 ? `<b class="pr">🪙 ${num(f.price)} <small>P</small></b>` : '<b class="pr pass">M패스 전용</b>';
  const btns = [];
  if (canMain(f)) btns.push(`<button class="btn primary lg block" data-dl="${id}" type="button">⬇ 문제 PDF 바로 다운로드</button>`);
  if (canSol(f)) btns.push(`<button class="btn ghost lg block" data-dl="${id}" data-kind="solution" type="button">📝 해설 PDF 다운로드</button>`);
  if (buyable(f)) {
    const label = f.tier === 'free' ? `해설 포함 구매 · ${num(f.price)}P` : `${num(f.price)}P로 구매하기`;
    btns.push(`<button class="btn buy lg block" data-buy="${id}" type="button">🪙 ${label}</button>`);
  } else if (!canMain(f)) {
    btns.push('<a class="btn ghost lg block" href="#/pass">🔒 M패스가 필요한 자료예요</a>');
  } else if (f.tier === 'free' && f.hasSolution && !canSol(f)) {
    btns.push('<a class="btn ghost block" href="#/pass">📝 해설은 M패스 전용</a>');
  }
  const me = S.user
    ? `<div class="mypts"><span>내 포인트</span><b>🪙 ${num(S.points)} P</b><a href="#/points">충전</a></div>`
    : '<div class="mypts"><span>구매하려면 로그인이 필요해요</span><button class="btn sm primary" data-act="login" type="button">로그인</button></div>';
  const note = unlocked(f) ? (S.hasPass && !S.owned.has(f.id) && !S.isAdmin ? '<p class="b-note ok">👑 M패스로 이용 중이에요</p>' : S.owned.has(f.id) ? '<p class="b-note ok">✅ 구매한 자료예요. 언제든 다시 받을 수 있어요</p>' : '')
    : (f.tier === 'premium' ? '<p class="b-note">구매하면 문제·해설 PDF를 계속 받을 수 있어요.<br>M패스가 있으면 이 자료도 추가 결제 없이 열려요.</p>' : '');
  return `<div class="buy-box"><div class="b-price"><span>${f.tier === 'free' ? '무료 자료' : '프리미엄'}</span>${priceBig}</div>
    <div class="b-btns">${btns.join('')}</div>${note}${me}</div>`;
}

/* =====================================================================
   내 정보 · 포인트 충전 · M패스 · 이용안내
   ===================================================================== */
const loginPrompt = (why) => `<div class="need-login"><h2>로그인이 필요해요</h2><p>${why}</p>
  <button class="btn primary" data-act="login" type="button">로그인</button></div>`;
const STATUS = { pending: ['대기중', 'soon'], done: ['완료', 'ok'], rejected: ['거절', 'exp'] };
const KIND = { grant: '지급', deduct: '차감', charge: '충전', purchase: '구매' };

async function meHTML() {
  document.title = '내 정보 — 민혁닷컴';
  if (!S.user) return loginPrompt('내 포인트와 구매한 자료는 로그인 후 볼 수 있어요.');
  let led = [], ch = [], pu = [];
  try { [led, ch, pu] = await Promise.all([S.api.myLedger(S.user), S.api.myCharges(S.user), S.api.myPurchases(S.user)]); } catch (e) { console.warn(e); }
  const mine = pu.map((p) => ({ p, f: S.files.find((x) => x.id === p.fileId) })).filter((x) => x.f);
  return `<div class="page-h"><h1>내 정보</h1></div>
  <div class="me-top">
    <div class="me-card"><span>아이디</span><b>${esc(S.user.username)}</b>${S.isAdmin ? '<i class="badge admin">ADMIN</i>' : S.hasPass ? '<i class="badge m">M PASS</i>' : '<small>M패스 없음</small>'}</div>
    <div class="me-card pts"><span>내 M포인트</span><b>🪙 ${num(S.points)} P</b><a class="btn sm primary" href="#/points">충전하기</a></div>
  </div>
  <section class="blk"><div class="blk-h"><h2>구매한 자료 <small>${mine.length}개</small></h2></div>
    ${mine.length ? `<div class="rows">${mine.map(({ p, f }) => `<div class="row-item"><a class="ri-t" href="#/f/${encodeURIComponent(f.id)}">${esc(f.title)}</a>
      <small>${num(p.price)}P · ${fmtDT(p.at)}</small>
      <span class="ri-b"><button class="btn sm primary" data-dl="${esc(f.id)}" type="button">⬇ 문제</button>${f.hasSolution ? `<button class="btn sm ghost" data-dl="${esc(f.id)}" data-kind="solution" type="button">📝 해설</button>` : ''}</span></div>`).join('')}</div>`
      : `<p class="empty-s">${S.hasPass ? 'M패스로 이용 중이라 구매 기록이 없어요. 프리미엄 자료는 모두 받을 수 있어요.' : '아직 구매한 자료가 없어요. <a href="#/list?tier=premium">프리미엄 자료 보러가기</a>'}</p>`}</section>
  <section class="blk"><div class="blk-h"><h2>포인트 내역</h2></div>
    ${led.length ? `<div class="tbl"><div class="tr th"><span>일시</span><span>구분</span><span>내용</span><span>변동</span><span>잔액</span></div>${led.map((l) =>
      `<div class="tr"><span>${fmtDT(l.at)}</span><span><i class="pill k-${l.kind}">${KIND[l.kind] || l.kind}</i></span><span>${esc(l.memo || '')}</span><span class="${l.delta >= 0 ? 'plus' : 'minus'}">${l.delta >= 0 ? '+' : ''}${num(l.delta)}</span><span>${num(l.balance_after)}</span></div>`).join('')}</div>` : '<p class="empty-s">내역이 없어요.</p>'}</section>
  <section class="blk"><div class="blk-h"><h2>충전 신청 내역</h2></div>
    ${ch.length ? `<div class="tbl c3"><div class="tr th"><span>신청일</span><span>금액</span><span>입금자명</span><span>상태</span></div>${ch.map((c) =>
      `<div class="tr"><span>${fmtDT(c.at)}</span><span>${num(c.amount)} P</span><span>${esc(c.depositor || '-')}</span><span><i class="pill ${STATUS[c.status]?.[1] || ''}">${STATUS[c.status]?.[0] || c.status}</i></span></div>`).join('')}</div>` : '<p class="empty-s">충전 신청이 없어요.</p>'}</section>`;
}

let packSel = 0;
async function pointsHTML() {
  document.title = 'M포인트 충전 — 민혁닷컴';
  const packs = (S.site.packs || []).filter((p) => Number(p.p) > 0);
  if (packSel >= packs.length) packSel = 0;
  let ch = [];
  if (S.user) { try { ch = await S.api.myCharges(S.user); } catch (e) { console.warn(e); } }
  const pending = ch.filter((c) => c.status === 'pending').length;
  return `<div class="page-h"><h1>🪙 M포인트 충전</h1><p>충전한 포인트로 프리미엄 자료를 한 세트씩 구매해요. 1회 구매하면 계속 다운로드할 수 있어요.</p></div>
  <div class="two-col">
    <section class="panel"><h2>1. 충전할 금액 고르기</h2>
      <div class="packs">${packs.map((p, i) => `<label class="pack ${i === packSel ? 'on' : ''}"><input type="radio" name="pack" value="${i}" ${i === packSel ? 'checked' : ''}><b>${num(p.p)} P</b><span>${esc(p.l || '')}</span></label>`).join('') || '<p class="empty-s">충전 상품이 아직 없어요. 관리자에게 문의해주세요.</p>'}</div>
      <h2>2. 입금 안내</h2><div class="info-box">${nl2br(S.site.chargeInfo)}</div>
      <h2>3. 충전 신청 보내기</h2>
      ${S.user ? `<form class="form" data-form="charge"><label>입금자명<input name="depositor" maxlength="40" required placeholder="입금한 분의 이름"></label>
        <button class="btn primary lg" type="submit" ${packs.length ? '' : 'disabled'}>충전 신청하기</button>
        <p class="note">입금이 확인되면 관리자가 승인하고, 승인 즉시 포인트가 들어가요.${pending ? ` (현재 대기 중인 신청 ${pending}건)` : ''}</p></form>`
      : loginPrompt('충전 신청은 로그인 후 보낼 수 있어요.')}
    </section>
    <aside class="panel"><h2>내 현황</h2>
      ${S.user ? `<div class="me-card pts"><span>내 M포인트</span><b>🪙 ${num(S.points)} P</b></div>
        ${ch.length ? `<h3>최근 신청</h3><div class="rows">${ch.slice(0, 5).map((c) => `<div class="row-item"><span>${num(c.amount)} P</span><small>${fmtDT(c.at)}</small><i class="pill ${STATUS[c.status]?.[1] || ''}">${STATUS[c.status]?.[0] || c.status}</i></div>`).join('')}</div>` : ''}` : '<p class="empty-s">로그인하면 내 포인트가 보여요.</p>'}
      <h3>자주 묻는 질문</h3>
      <details><summary>포인트는 언제 들어오나요?</summary><p>입금 확인 후 관리자가 승인하면 바로 반영돼요. 관리자가 확인하는 시간에 따라 다를 수 있어요.</p></details>
      <details><summary>구매한 자료는 계속 받을 수 있나요?</summary><p>네. 한 번 구매한 자료는 내 정보에서 언제든 다시 받을 수 있어요.</p></details>
      <details><summary>M패스랑 뭐가 달라요?</summary><p>M패스는 기간 동안 프리미엄 전체를 열어주고, M포인트는 필요한 세트만 골라서 사는 방식이에요.</p></details>
    </aside>
  </div>`;
}

function passHTML() {
  document.title = 'M패스 — 민혁닷컴';
  return `<div class="page-h"><h1>👑 M패스</h1><p>프리미엄 자료와 해설을 한 번에 열어주는 이용권이에요.</p></div>
  ${S.hasPass ? '<div class="ok-box">✅ 지금 M패스를 이용 중이에요! 프리미엄 자료는 전부 받을 수 있어요.</div>' : ''}
  <div class="cmp">
    <div class="cmp-c"><h3>무료</h3><ul><li>무료 자료 다운로드</li><li>미리보기</li></ul><b>0원</b></div>
    <div class="cmp-c"><h3>🪙 M포인트</h3><ul><li>필요한 세트만 골라 구매</li><li>구매한 자료 영구 재다운로드</li><li>해설 PDF 포함</li></ul><b>세트마다 결제</b><a class="btn ghost block" href="#/points">충전하기</a></div>
    <div class="cmp-c best"><span class="ribbon">추천</span><h3>👑 M패스</h3><ul><li>프리미엄 전체 자료 무제한</li><li>해설 PDF 전부 포함</li><li>새로 올라오는 자료도 추가 결제 없이</li></ul><b>기간 동안 무제한</b></div>
  </div>
  <div class="info-box">${nl2br(S.site.passInfo)}</div>
  <p class="note">문의: ${esc(S.site.contact || '')}</p>`;
}

function aboutHTML() {
  document.title = '이용안내 — 민혁닷컴';
  return `<div class="page-h"><h1>민혁닷컴 이용안내</h1></div>
  <section class="panel"><h2>민혁닷컴은?</h2><p class="pre">${nl2br(S.site.about)}</p></section>
  <section class="panel"><h2>자료는 이렇게 받아요</h2>
    <ol class="plain"><li><b>무료 자료</b> — 상세 페이지의 다운로드 버튼을 누르면 바로 PDF가 내려받아져요.</li>
      <li><b>프리미엄 자료</b> — M포인트로 구매하거나 M패스가 있으면 열려요. 구매한 자료는 계속 받을 수 있어요.</li>
      <li><b>해설 PDF</b> — 해설이 있는 자료는 구매·M패스로 함께 열려요.</li></ol></section>
  <section class="panel"><h2>계정</h2><p>PyNest에서 쓰는 ID와 비밀번호 그대로 로그인할 수 있어요. 민혁닷컴에서 가입해도 같은 계정이 만들어져요.</p></section>
  <section class="panel"><h2>문의</h2><p>${esc(S.site.contact || '')}</p></section>`;
}

/* =====================================================================
   공지사항 (PyNest 처럼 선생님만 쓰고, 모두가 읽어요)
   ===================================================================== */
const sortedNotices = () => [...S.notices].filter((n) => n.visible !== false || S.isAdmin)
  .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.createdAt - a.createdAt);
const noticeRow = (n) => `<a class="row-item nt-row" href="#/notices/${encodeURIComponent(n.id)}">
  <span class="nt-t">${n.pinned ? '<i class="bd pin">📌</i> ' : ''}<b>${esc(n.title)}</b>${n.visible === false ? ' <i class="bd hid">숨김</i>' : ''}</span>
  <small>${fmtDate(new Date(n.createdAt))}</small></a>`;
function noticeBlockHTML() {
  const list = sortedNotices().slice(0, 4);
  if (!list.length) return '';
  return `<section class="blk"><div class="blk-h"><h2>📢 공지사항</h2><a class="more" href="#/notices">더 보기 ›</a></div>
    <div class="rows">${list.map(noticeRow).join('')}</div></section>`;
}
function noticesHTML() {
  document.title = '공지사항 — 민혁닷컴';
  const list = sortedNotices();
  return `<div class="page-h page-h-row"><h1>📢 공지사항</h1>${S.isAdmin ? '<button class="btn primary" data-act="notice-new" type="button">글쓰기</button>' : ''}</div>
    <div class="rows">${list.length ? list.map(noticeRow).join('') : '<p class="empty">아직 공지가 없어요.</p>'}</div>`;
}
function noticeDetailHTML(id) {
  const n = S.notices.find((x) => x.id === id);
  if (!n) return '<div class="notfound"><h2>공지를 찾을 수 없어요</h2><a class="btn primary" href="#/notices">공지사항 목록</a></div>';
  document.title = `${n.title} — 민혁닷컴`;
  return `<p><a class="back" href="#/notices">← 공지사항</a></p>
    <article class="panel notice-post"><h1 class="post-title">${n.pinned ? '📌 ' : ''}${esc(n.title)} ${n.visible === false ? '<i class="bd hid">숨김</i>' : ''}</h1>
      <p class="note">${esc(n.author || '선생님')} · ${fmtDT(n.createdAt)}${n.updatedAt ? ' (수정됨)' : ''}
        ${S.isAdmin ? ` <button class="linkbtn" data-act="notice-edit" data-id="${esc(n.id)}" type="button">수정</button> <button class="linkbtn danger" data-act="notice-del" data-id="${esc(n.id)}" type="button">삭제</button>` : ''}</p>
      <div class="post-body">${richText(n.body)}</div></article>`;
}
let noticeEditId = null;
function openNoticeForm(id) {
  noticeEditId = id;
  const n = id ? S.notices.find((x) => x.id === id) : null;
  const f = $('#formNotice').elements;
  $('#noticeDlgTitle').textContent = n ? '공지 수정' : '공지 쓰기';
  f.title.value = n ? n.title : '';
  f.body.value = n ? n.body : '';
  f.pinned.checked = !!(n && n.pinned);
  f.visible.value = n && n.visible === false ? '0' : '1';
  $('#dlgNotice').showModal();
}
async function submitNotice(e) {
  e.preventDefault();
  const f = e.target.elements;
  const data = { title: f.title.value.trim(), body: f.body.value.trim(), pinned: f.pinned.checked, visible: f.visible.value === '1' };
  if (!data.title) return toast('제목을 적어줘');
  try {
    if (noticeEditId) await S.api.updateNotice(noticeEditId, data);
    else await S.api.addNotice(data, S.user?.username || '');
    $('#dlgNotice').close();
    await loadNotices();
    toast(noticeEditId ? '공지를 수정했어' : '공지를 올렸어 📢');
    await route();
  } catch (err) { console.error(err); toast('저장 실패 (schema.sql 을 다시 실행했는지 / 관리자 계정인지 확인)'); }
}
async function deleteNotice(id) {
  if (!confirm('이 공지를 삭제할까?')) return;
  try { await S.api.deleteNotice(id); await loadNotices(); toast('삭제했어'); location.hash = '#/notices'; await route(); }
  catch (err) { console.error(err); toast('삭제 실패'); }
}
async function loadNotices() {
  try { S.notices = await S.api.listNotices(S.isAdmin); } catch (e) { console.warn('공지 로드 실패 (schema.sql v5 실행 전일 수 있어요)', e); S.notices = []; }
}

/* =====================================================================
   다운로드 / 구매
   ===================================================================== */
async function download(id, kind) {
  const f = S.files.find((x) => x.id === id);
  if (!f) return;
  if (kind === 'solution' ? !canSol(f) : !canMain(f)) return toast('이 자료는 구매하거나 M패스가 있어야 받을 수 있어요');
  try {
    const url = await S.api.getLink(f, kind);
    if (S.DEMO) toast('데모 모드라 실제 파일은 없어! 설정하면 바로 다운로드돼');
    else { triggerDownload(url); toast('다운로드 시작! 📥'); }
    if (kind === 'main') {
      f.downloads = (f.downloads || 0) + 1;
      S.api.countDownload(f.id);
    }
  } catch (err) { console.error(err); toast('권한이 없거나 오류가 났어'); }
}

let buyId = null;
function openBuy(id) {
  const f = S.files.find((x) => x.id === id);
  if (!f) return;
  if (!S.user) { toast('먼저 로그인해줘'); return openAuth('login'); }
  buyId = id;
  const after = S.points - Number(f.price);
  const short = -after;
  $('#buyBody').innerHTML = `<div class="buy-item"><b>${esc(f.title)}</b><small>${f.tier === 'free' ? '해설 PDF 포함 구매' : '문제 PDF' + (f.hasSolution ? ' + 해설 PDF' : '')}</small></div>
    <dl class="buy-calc"><dt>가격</dt><dd>${num(f.price)} P</dd><dt>내 포인트</dt><dd>${num(S.points)} P</dd><dt>구매 후</dt><dd class="${after < 0 ? 'minus' : ''}">${num(Math.max(after, 0))} P</dd></dl>
    ${after < 0 ? `<p class="warn">포인트가 <b>${num(short)} P</b> 부족해요.</p>` : '<p class="note">구매 후에는 취소·환불이 안 돼요. (문의는 관리자에게)</p>'}`;
  $('#buyOk').classList.toggle('hidden', after < 0);
  $('#buyCharge').classList.toggle('hidden', after >= 0);
  $('#buyOk').disabled = false;
  $('#dlgBuy').showModal();
}
async function confirmBuy() {
  if (!buyId) return;
  const btn = $('#buyOk');
  btn.disabled = true;
  try {
    const r = await S.api.buyFile(buyId);
    const msg = {
      ok: '구매 완료! 🎉 이제 다운로드할 수 있어요', already: '이미 이용할 수 있는 자료예요', insufficient: '포인트가 부족해요',
      not_for_sale: '포인트로 판매하지 않는 자료예요', not_found: '자료를 찾을 수 없어요', login: '로그인이 필요해요', blocked: '사용이 중지된 계정이에요',
    }[r] || '구매하지 못했어요';
    $('#dlgBuy').close();
    toast(msg);
    await refreshUserState();
    await route();
  } catch (err) { console.error(err); toast('구매 중 오류가 났어요. 잠시 뒤 다시 시도해줘'); }
  finally { btn.disabled = false; buyId = null; }
}

/* =====================================================================
   로그인 / 가입 (PyNest 계정)
   ===================================================================== */
let authTab = 'login';
function renderAuthTab() {
  const signup = authTab === 'signup';
  $$('#authTabs button').forEach((b) => {
    b.classList.toggle('active', b.dataset.at === authTab);
    b.classList.toggle('hidden', b.dataset.at === 'signup' && !CONFIG.ALLOW_SIGNUP);
  });
  $('#authPw2Wrap').classList.toggle('hidden', !signup);
  $('#authSignupNote').classList.toggle('hidden', !signup);
  $('#authSignupNote').textContent = S.site.autoApprove !== false
    ? 'PyNest와 같은 계정이에요. 가입하면 PyNest에서도 같은 ID·비밀번호로 바로 로그인할 수 있어요.'
    : 'PyNest와 같은 계정이 만들어져요. 가입해도 PyNest 강의 사이트는 선생님이 승인해야 쓸 수 있어요.';
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
    await (signup ? S.api.signup(id, pw) : S.api.login(id, pw));
    $('#dlgAuth').close();
    $('#formAuth').reset();
    toast(signup ? '가입 완료! 환영해 🎉' : '로그인 완료!');
  } catch (err) { toast(err.message || '실패했어요'); }
  finally { btn.disabled = false; }
}

/* =====================================================================
   이벤트
   ===================================================================== */
function bind() {
  $('#btnLogin').onclick = () => openAuth('login');
  $('#formAuth').onsubmit = submitAuth;
  $('#formNotice').onsubmit = submitNotice;
  $('#btnLogout').onclick = () => S.api.logout();
  $('#btnAdmin').onclick = () => openAdmin();
  $('#btnMenu').onclick = openDrawer;
  $('#btnMenuClose').onclick = closeDrawer;
  $('#drawerBg').onclick = closeDrawer;
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDrawer(); });
  $('#drawer').addEventListener('click', (e) => { if (e.target.closest('a[href]')) closeDrawer(); }); // 링크를 누르면 패널이 닫혀요
  $('#gform').onsubmit = (e) => {
    e.preventDefault();
    const q = $('#gq').value.trim();
    navigate(q ? `#/list?q=${encodeURIComponent(q)}` : '#/list');
  };
  window.addEventListener('hashchange', route);
  $('#buyOk').onclick = confirmBuy;
  $('#buyCharge').onclick = () => { $('#dlgBuy').close(); navigate('#/points'); };

  // 목록 필터 (페이지가 다시 그려져도 동작하도록 위임)
  document.addEventListener('input', (e) => {
    if (e.target.id === 'lq') { view.q = e.target.value; renderListGrid(); }
  });
  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t.id === 'tierSel') { view.tier = t.value; renderListGrid(); }
    if (t.id === 'sortSel') { view.sort = t.value; renderListGrid(); }
    if (t.name === 'pack') { packSel = Number(t.value) || 0; $$('.pack').forEach((p, i) => p.classList.toggle('on', i === packSel)); }
  });
  document.addEventListener('submit', async (e) => {
    const form = e.target.closest('form[data-form="charge"]');
    if (!form) return;
    e.preventDefault();
    const packs = (S.site.packs || []).filter((p) => Number(p.p) > 0);
    const pack = packs[packSel];
    const dep = form.elements.depositor.value.trim();
    if (!pack) return toast('충전 상품을 골라줘');
    if (!dep) return toast('입금자명을 적어줘');
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      const r = await S.api.requestCharge(Number(pack.p), dep);
      toast({ ok: '충전 신청 완료! 입금 확인 후 포인트를 넣어드려요 ✅', too_many: '대기 중인 신청이 너무 많아요 (최대 5건)', invalid: '금액이 올바르지 않아요', login: '로그인이 필요해요', blocked: '사용이 중지된 계정이에요' }[r] || '신청하지 못했어요');
      await route();
    } catch (err) { console.error(err); toast('신청 중 오류가 났어요'); btn.disabled = false; }
  });

  document.addEventListener('click', async (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    const d = t.dataset;
    if (t.matches('[data-close]')) return t.closest('dialog').close();
    if (d.act === 'admin-new') return openAdminNewFile(d.s, d.u);
    if (d.act === 'admin-edit') return openAdminEditFile(d.id);
    if (d.act === 'notice-new') return openNoticeForm(null);
    if (d.act === 'notice-edit') return openNoticeForm(d.id);
    if (d.act === 'notice-del') return deleteNotice(d.id);
    if (d.act === 'logout') { closeDrawer(); return S.api.logout(); }
    if (d.act === 'login') { closeDrawer(); return openAuth('login'); }
    if (d.act === 'signup') { closeDrawer(); return openAuth('signup'); }
    if (d.act === 'preview') {
      const id = (location.hash.match(/#\/f\/([^?]+)/) || [])[1];
      const f = S.files.find((x) => x.id === decodeURIComponent(id || ''));
      if (!f || !hasPreview(f)) return;
      if (S.DEMO) return toast('데모 모드라 미리보기 파일은 없어!');
      try {
        const url = await S.api.getLink(f, 'preview');
        $('#prevBox').innerHTML = `<iframe title="미리보기" loading="lazy" src="${esc(url)}"></iframe>`;
      } catch (err) { console.error(err); toast('미리보기를 불러오지 못했어요'); }
      return;
    }
    if (d.dot !== undefined) { startCarousel.show?.(Number(d.dot)); clearInterval(carouselTimer); return; }
    if (d.dl !== undefined) return download(d.dl, d.kind || 'main');
    if (d.buy !== undefined) return openBuy(d.buy);
    if (d.at) { authTab = d.at; return renderAuthTab(); }
    await adminClick(e, t);
  });
  bindAdmin();
}

/* =====================================================================
   시작
   ===================================================================== */
async function loadFiles() {
  try { S.files = await S.api.listFiles(S.isAdmin); } catch (e) { console.error(e); toast('자료를 불러오지 못했어'); S.files = []; }
  await loadNotices();
}
async function refreshUserState() {
  S.hasPass = false; S.points = 0; S.owned = new Set();
  if (S.user) {
    try { S.hasPass = await S.api.hasPass(S.user.id); } catch (e) { console.warn(e); }
    try { const st = await S.api.myState(S.user); S.points = st.points; S.owned = new Set(st.owned); } catch (e) { console.warn(e); }
  }
  renderHeader();
}
async function applyUser(u) {
  if (u && u.status === 'rejected') { // PyNest 에서 사용 중지된 계정
    toast('사용이 중지된 계정이에요. 선생님께 문의해주세요');
    await S.api.logout();
    return;
  }
  S.user = u;
  S.isAdmin = calcAdmin(u);
  await refreshUserState();
  await loadFiles();
  await route();
}
S.hooks.reload = async () => { await loadFiles(); await route(); };
S.hooks.route = route;
S.hooks.header = renderHeader;
S.hooks.refreshUser = refreshUserState;

(async function init() {
  bind();
  if (S.DEMO) {
    S.api = demoBackend(demoFlags);
    document.body.insertAdjacentHTML('afterbegin',
      '<div id="demoBar">데모 모드 (새로고침하면 초기화) — ' +
      '<a href="#" id="demoPass">M패스 토글</a> · <a href="#" id="demoAdmin">관리자 토글</a></div>');
    $('#demoPass').onclick = async (e) => {
      e.preventDefault();
      demoFlags.pass = !demoFlags.pass;
      if (!S.user) await S.api.login('demo_user'); else await applyUser(S.user);
      toast(demoFlags.pass ? 'M패스 ON' : 'M패스 OFF');
    };
    $('#demoAdmin').onclick = async (e) => {
      e.preventDefault();
      window.__demoAdmin = !window.__demoAdmin;
      if (!S.user) await S.api.login('demo_user'); else await applyUser(S.user);
      toast(window.__demoAdmin ? '관리자 ON — 우측 상단 ⚙️ 관리자' : '관리자 OFF');
    };
  } else {
    const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
    // PyNest 와 설정을 똑같이 쓰면, 같은 주소(github.io)에서는 로그인 세션도 같이 쓰게 돼요.
    S.api = supabaseBackend(createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY));
  }
  S.tax = clone(DEFAULT_TAX);
  S.site = clone(DEFAULT_SITE);
  try {
    const m = await S.api.loadMeta();
    if (Array.isArray(m.tax)) S.tax = m.tax;
    if (m.site) S.site = { ...clone(DEFAULT_SITE), ...m.site };
    // 예전에 저장된 메뉴에는 "공지사항"이 없으니 홈 아래에 한 번 끼워줘요 (메뉴를 저장하면 그 뒤로는 관리자 마음대로)
    if (Array.isArray(m.site.menu) && (m.site.menuVer || 0) < 1 && !S.site.menu.some((x) => x.link === '#/notices')) {
      const i = S.site.menu.findIndex((x) => x.link === '#/');
      S.site.menu.splice(i + 1, 0, clone(DEFAULT_MENU.find((x) => x.id === 'm_notice')));
    }
    // 예전에 저장된 PyNest 배너 주소(대소문자가 틀린 기본값)는 설정 파일 주소를 따라가게 바꿔줘요
    (S.site.banners || []).forEach((b) => { if (b.id === 'b_pynest' && /^https?:\/\/whale7777\.github\.io\/pynest\/?$/.test(b.link || '')) b.link = '@pynest'; });
  } catch (e) { console.warn('meta 로드 실패 (기본값 사용)', e); }
  await loadFiles();
  renderHeader();
  await route();
  S.api.onAuth((u) => applyUser(u));
})();
