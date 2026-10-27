/* 2단 페이지 배치 엔진
 * 1) #pool 안의 $...$ 수식을 KaTeX 로 그린다 (높이가 정해져야 정확히 배치할 수 있으므로 먼저)
 * 2) 블록(.blk)을 순서대로 측정해서 왼쪽 단 → 오른쪽 단 → 다음 페이지로 채운다.
 *    블록은 절대 중간에서 쪼개지 않는다. 남은 공간에 안 들어가면 다음 단으로 넘긴다.
 * 3) data-newpage="1" 인 블록(정답 및 해설 머리글)은 항상 새 페이지에서 시작한다.
 */
(async () => {
  const warnings = [];

  // ---------- 1. 수식 렌더링 ----------
  function renderMath(root) {
    if (typeof katex === 'undefined') return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    const re = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g;
    for (const n of nodes) {
      const t = n.nodeValue;
      if (t.indexOf('$') < 0) continue;
      re.lastIndex = 0;
      let m, last = 0, any = false;
      const frag = document.createDocumentFragment();
      while ((m = re.exec(t))) {
        any = true;
        if (m.index > last) frag.appendChild(document.createTextNode(t.slice(last, m.index)));
        const display = m[1] !== undefined;
        const span = document.createElement('span');
        span.className = display ? 'mathd' : 'mathi';
        const src = (display ? m[1] : m[2]).trim();
        try {
          katex.render(src, span, { displayMode: display, throwOnError: true, strict: 'ignore', output: 'html' });
        } catch (e) {
          span.textContent = m[0];
          span.style.color = '#c00';
          warnings.push('수식 오류: ' + src.slice(0, 40) + ' → ' + String(e.message).slice(0, 60));
        }
        frag.appendChild(span);
        last = m.index + m[0].length;
      }
      if (any) {
        if (last < t.length) frag.appendChild(document.createTextNode(t.slice(last)));
        n.parentNode.replaceChild(frag, n);
      }
    }
  }

  const pool = document.getElementById('pool');
  renderMath(pool);
  void pool.offsetHeight;                       // 레이아웃을 한 번 돌려 폰트 요청을 일으킨다

  // 폰트/이미지 로딩 대기
  try {
    await Promise.all([...document.fonts].filter(f => f.status === 'unloaded').map(f => f.load().catch(() => {})));
    await document.fonts.ready;
  } catch (e) {}
  await Promise.all([...document.images].map(i => (i.decode ? i.decode().catch(() => {}) : null)));

  // ---------- 2. 단 배치 ----------
  const MM = 96 / 25.4;
  const CREDIT_RESERVE_MM = 8;      // 정답 페이지 하단 제작 표시 문구 공간
  const host = document.getElementById('pages');
  const tpl = id => document.getElementById(id).content.cloneNode(true);
  const blocks = [...pool.children];

  const pages = [];
  let cols = [], ci = 0, used = 0, cap = 0, reserve = (window.__PART === 'problem') ? CREDIT_RESERVE_MM : 0;

  function newPage() {
    const first = pages.length === 0;
    const el = document.createElement('div');
    el.className = 'page ' + (first ? 'first' : 'cont');
    el.appendChild(tpl(first ? 'tpl-hdr-first' : 'tpl-hdr-cont'));
    const body = document.createElement('div');
    body.className = 'body';
    body.innerHTML = '<div class="col c0"></div><div class="vline"></div><div class="col c1"></div>';
    el.appendChild(body);
    const f = tpl('tpl-ftr');
    f.querySelector('.pn').textContent = '- ' + (pages.length + 1) + ' -';
    el.appendChild(f);
    host.appendChild(el);
    pages.push(el);
    cols = [...body.querySelectorAll('.col')];
    ci = 0;
    used = 0;
    cap = cols[0].clientHeight - reserve * MM;
  }

  function nextColumn() {
    if (ci === 0) { ci = 1; used = 0; }
    else { newPage(); }
  }

  for (const el of blocks) {
    if (el.dataset.newpage === '1') {
      reserve = CREDIT_RESERVE_MM;
      newPage();
    } else if (pages.length === 0) {
      newPage();
    }

    const cs = getComputedStyle(el);
    const mb = parseFloat(cs.marginBottom) || 0;
    const h = el.getBoundingClientRect().height;      // 마진 제외 실제 높이
    if (used > 0 && used + h > cap) nextColumn();
    if (used === 0 && h > cap) {
      warnings.push('블록이 한 단보다 큽니다: ' + (el.dataset.n ? el.dataset.n + '번' : el.className));
    }
    cols[ci].appendChild(el);
    used += h + mb;
  }

  // 마지막 페이지 하단에 제작 표시
  if (pages.length) {
    const last = pages[pages.length - 1];
    const lastBody = last.querySelector('.body');
    lastBody.classList.add('has-credit');
    lastBody.appendChild(tpl('tpl-credit'));
  }

  // 넘침 검사
  pages.forEach((p, i) => {
    p.querySelectorAll('.col').forEach(c => {
      if (c.scrollHeight > c.clientHeight + 1) warnings.push((i + 1) + '페이지 단 넘침 의심');
    });
  });

  pool.remove();
  window.__report = {
    pages: pages.length,
    perPage: pages.map(p => p.querySelectorAll('.q').length),
    warnings,
  };
  window.__done = true;
})();
