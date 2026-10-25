import { DAY, clone, fmtDate, driveDownloadUrl, drivePreviewUrl } from './util.js?v=13';
import { DEFAULT_TAX, DEFAULT_SITE, buildPrem } from './defaults.js?v=13';

const must = ({ data, error }) => { if (error) throw error; return data; };

/* =====================================================================
   데모 백엔드 (설정 전 / 주소 뒤에 ?demo 를 붙였을 때 · 새로고침하면 초기화)
   ===================================================================== */
export function demoBackend(flags = {}) {
  let seq = 0;
  const now = Date.now();
  const mk = (subject, unit, tier, level, title, desc, count, extra = {}) => ({
    id: 'd' + seq++, subject, unit, tier, level, title, desc, count, visible: true, pinned: false, price: tier === 'premium' ? 300 : 0,
    downloads: Math.floor(Math.random() * 180), createdAt: now - seq * 2 * DAY, mainSrc: 'drive', solutionSrc: 'drive', previewSrc: 'drive',
    driveId: tier === 'free' ? 'DEMO' : undefined, previewId: 'DEMO', hasSolution: false, ...extra,
  });
  const files = [
    mk('physics', 'energy', 'free', 1, '역학적 에너지 보존 입문 10제', '일과 에너지 기본기를 다지는 세트. 그래프 해석 포함.', 10),
    mk('physics', 'mech', 'premium', 3, '등가속도 + 에너지 융합 킬러 12제', '계산량 있는 심화 세트. 풀이 PDF 수록.', 12, { hasSolution: true, pinned: true, price: 500 }),
    mk('physics', 'em', 'premium', 2, '전기장과 전위 표준 12제', '전기력선·등전위선 자료 해석.', 12, { price: 300 }),
    mk('chem', 'stoich', 'free', 1, '몰 농도·화학량론 기본 10제', '계산 실수를 줄이는 단위 정리 중심.', 10),
    mk('chem', 'acid', 'premium', 3, '산염기 적정 곡선 심화 13제', '그래프 추론형 문항 위주.', 13, { hasSolution: true, price: 500 }),
    mk('bio', 'metab', 'free', 2, '세포 호흡 · 광합성 핵심 10제', '자료 해석형 문제로 구성.', 10, { hasSolution: true }),
    mk('bio', 'genetic', 'premium', 3, '가계도 분석 · 유전 확률 심화 12제', '경우의 수 처리까지 한 번에.', 12, { price: 400 }),
    mk('earth', 'atmo', 'premium', 2, '대기와 해양 순환 심화 12제', '자료 분석 · 추론 유형.', 12, { price: 300 }),
    mk('earth', 'astro', 'free', 2, '별의 물리량과 H-R도 10제', '천문 단원 기본 자료해석.', 10),
    mk('earth', 'astro', 'premium', 3, '외계 행성·우주론 자료해석 12제', '아직 공개 전인 초안 (숨김 상태 예시)', 12, { visible: false, hasSolution: true, price: 500 }),
  ];
  const prem = {};
  files.forEach((f) => { prem[f.id] = buildPrem(f.tier, { main: 'DEMO', solution: f.hasSolution ? 'DEMO' : null }); });
  const meta = { tax: clone(DEFAULT_TAX), site: clone(DEFAULT_SITE) };
  let mpass = [
    { id: 'u1', name: 'student01', expires: fmtDate(new Date(Date.now() + 30 * DAY)), memo: '예시 학생', active: true, quota: 15, used: 4, plan: '45일' },
    { id: 'u2', name: 'soon01', expires: fmtDate(new Date(Date.now() + 4 * DAY)), memo: '곧 만료 예시', active: true, quota: 35, used: 30, plan: '90일' },
  ];
  const dpass = { id: 'dp', name: 'demo_user', expires: fmtDate(new Date(Date.now() + 30 * DAY)), memo: '데모', active: true, quota: 15, used: 2, plan: '45일' };
  const todayStr = () => fmtDate(new Date());
  const passOf = (name) => (flags.pass && name === 'demo_user' ? dpass : mpass.find((p) => p.name === name));
  const passInfo = (p) => {
    const act = !!p && p.active && (!p.expires || p.expires >= todayStr());
    return { active: act, left: act ? Math.max((p.quota || 0) - (p.used || 0), 0) : 0, quota: p ? p.quota || 0 : 0, used: p ? p.used || 0 : 0, expires: p ? p.expires : null, plan: p ? p.plan || '' : '' };
  };
  // 포인트 (데모 로그인 사용자 기준)
  const pts = { demo_user: 700, student01: 1500 };
  const owned = new Set();
  const paid = {}; // 자료별로 낸 포인트 (M패스로 받은 건 0)
  let ledger = [{ id: 1, username: 'demo_user', delta: 1000, balance_after: 1000, kind: 'charge', memo: '충전 승인 예시', at: now - 5 * DAY, fileId: null }];
  let charges = [
    { id: 'c1', username: 'student01', amount: 3000, depositor: '김학생', status: 'pending', at: now - 3600e3 },
    { id: 'c2', username: 'demo_user', amount: 1000, depositor: '데모', status: 'done', at: now - 5 * DAY },
  ];
  let lid = 2;
  let notices = [
    { id: 'n1', title: '민혁닷컴 오픈! M포인트 이용 안내', body: '프리미엄 자료는 M포인트로 구매하거나 M패스로 열 수 있어요.\n충전은 M포인트 메뉴에서 신청해주세요.', pinned: true, visible: true, author: 'teacher', createdAt: now - 2 * DAY, updatedAt: null },
    { id: 'n2', title: '11월 신규 자료 업로드 예정', body: '물리·화학 심화 세트가 곧 올라와요.', pinned: false, visible: true, author: 'teacher', createdAt: now - 6 * DAY, updatedAt: null },
    { id: 'n3', title: '(초안) 비공개 공지 예시', body: '관리자에게만 보여요.', pinned: false, visible: false, author: 'teacher', createdAt: now - 1 * DAY, updatedAt: null },
  ];
  const listeners = [];
  let cur = null;
  const find = (id) => files.find((f) => f.id === id);
  const user = (id) => ({ id: 'u_' + id, username: id, role: 'student', status: 'approved' });
  const emit = (u) => { cur = u; listeners.forEach((l) => l(u)); };
  const log = (username, delta, kind, memo, fileId) => {
    ledger.unshift({ id: lid++, username, delta, balance_after: pts[username] || 0, kind, memo, at: Date.now(), fileId: fileId || null });
  };
  return {
    onAuth: (cb) => { listeners.push(cb); cb(null); },
    login: async (id) => emit(user(id)),
    signup: async (id) => emit(user(id)),
    logout: async () => emit(null),
    loadMeta: async () => clone(meta),
    saveTax: async (t) => { meta.tax = clone(t); },
    saveSite: async (s) => { meta.site = clone(s); },
    listFiles: async (admin) => clone(files.filter((f) => admin || f.visible !== false)),
    hasPass: async () => !!flags.pass,
    myPass: async () => passInfo(cur ? passOf(cur.username) : null),
    myState: async () => ({ points: cur ? pts[cur.username] || 0 : 0, owned: [...owned] }),
    getDriveId: async () => 'DEMO',
    getPremium: async (id) => clone(prem[id] || {}),
    buyFile: async (id) => {
      const f = find(id);
      if (!cur) return 'login';
      if (!f || f.visible === false) return 'not_found';
      if (owned.has(id)) return 'already';
      if (!(f.price > 0)) return 'not_for_sale';
      const bal = pts[cur.username] || 0;
      if (bal < f.price) return 'insufficient';
      pts[cur.username] = bal - f.price;
      owned.add(id); paid[id] = f.price;
      log(cur.username, -f.price, 'purchase', f.title, id);
      return 'ok';
    },
    claimFile: async (id) => {
      const f = find(id);
      if (!cur) return 'login';
      if (!f || f.visible === false) return 'not_found';
      if (f.tier === 'free') return 'free';
      if (owned.has(id)) return 'already';
      const p = passOf(cur.username), pi = passInfo(p);
      if (!pi.active) return 'no_pass';
      if (pi.left <= 0) return 'no_quota';
      p.used = (p.used || 0) + 1;
      owned.add(id); paid[id] = 0;
      return 'ok';
    },
    buyPass: async (planId) => {
      if (!cur) return 'login';
      const pl = (meta.site.passPlans || []).find((x) => x.id === planId);
      if (!pl) return 'not_found';
      const bal = pts[cur.username] || 0;
      if (bal < pl.price) return 'insufficient';
      pts[cur.username] = bal - pl.price;
      log(cur.username, -pl.price, 'purchase', 'M패스 ' + pl.name, null);
      const ex = passOf(cur.username);
      const base = ex && passInfo(ex).active ? new Date(ex.expires || Date.now()) : new Date();
      const exp = fmtDate(new Date(base.getTime() + pl.days * DAY));
      const left = ex ? passInfo(ex).left : 0;
      const row = { id: 'u' + Date.now(), name: cur.username, expires: exp, memo: 'M포인트 구매', active: true, quota: left + pl.quota, used: 0, plan: pl.name };
      if (ex) Object.assign(ex, row, { id: ex.id }); else mpass.push(row);
      if (flags.pass && cur.username === 'demo_user') Object.assign(dpass, row, { id: 'dp' });
      return 'ok';
    },
    myLedger: async () => clone(ledger.filter((l) => cur && l.username === cur.username)),
    myCharges: async () => clone(charges.filter((c) => cur && c.username === cur.username)),
    myPurchases: async () => files.filter((f) => owned.has(f.id)).map((f) => ({ fileId: f.id, price: paid[f.id] ?? f.price, at: Date.now() })),
    requestCharge: async (amount, depositor) => {
      if (!cur) return 'login';
      if (!(amount >= 1 && amount <= 1000000)) return 'invalid';
      charges.unshift({ id: 'c' + Date.now(), username: cur.username, amount, depositor, status: 'pending', at: Date.now() });
      return 'ok';
    },
    getLink: async (f, kind) => 'DEMO:' + kind,
    addFile: async (f, ids) => {
      const id = 'd' + Date.now();
      files.unshift({ ...f, id, downloads: 0, pinned: false, createdAt: Date.now(), driveId: f.tier === 'free' && f.mainSrc !== 'upload' ? ids.main : undefined });
      prem[id] = buildPrem(f.tier, ids);
      return id;
    },
    updateFile: async (id, f, ids) => {
      Object.assign(find(id), f, { driveId: f.tier === 'free' && f.mainSrc !== 'upload' ? ids.main : undefined });
      prem[id] = buildPrem(f.tier, ids);
    },
    listNotices: async (admin) => clone(notices.filter((n) => admin || n.visible)),
    addNotice: async (n, author) => { notices.unshift({ ...n, id: 'n' + Date.now(), author, createdAt: Date.now(), updatedAt: null }); },
    updateNotice: async (id, n) => { Object.assign(notices.find((x) => x.id === id), n, { updatedAt: Date.now() }); },
    deleteNotice: async (id) => { notices = notices.filter((x) => x.id !== id); },
    patchFile: async (id, patch) => { Object.assign(find(id), patch); },
    deleteFile: async (id) => { files.splice(files.findIndex((f) => f.id === id), 1); delete prem[id]; owned.delete(id); },
    countDownload: async (id) => { const f = find(id); if (f) f.downloads = (f.downloads || 0) + 1; },

    listPass: async () => clone(mpass),
    setPass: async (name, expires, memo, quota = 0, plan = '') => {
      if (name === 'nobody') return 'not_found';
      const ex = mpass.find((p) => p.name === name);
      const row = { expires, memo: memo || '', active: true, quota: Math.max(0, Number(quota) || 0), used: 0, plan: plan || '' };
      if (ex) Object.assign(ex, row);
      else mpass.push({ id: 'u' + Date.now() + mpass.length, name, ...row });
      return 'ok';
    },
    removePass: async (id) => { mpass = mpass.filter((p) => p.id !== id); },

    listPoints: async () => Object.entries(pts).map(([username, balance]) => ({ id: username, username, balance })),
    adjustPoints: async (name, delta, memo) => {
      if (name === 'nobody') return 'not_found';
      if (!delta) return 'invalid';
      if ((pts[name] || 0) + delta < 0) return 'insufficient';
      pts[name] = (pts[name] || 0) + delta;
      log(name, delta, delta > 0 ? 'grant' : 'deduct', memo || '');
      return 'ok';
    },
    listCharges: async () => clone(charges),
    resolveCharge: async (id, approve) => {
      const c = charges.find((x) => x.id === id);
      if (!c) return 'not_found';
      if (c.status !== 'pending') return 'already_done';
      c.status = approve ? 'done' : 'rejected';
      if (approve) { pts[c.username] = (pts[c.username] || 0) + c.amount; log(c.username, c.amount, 'charge', '충전 승인 ' + c.depositor); }
      return 'ok';
    },
    listLedger: async () => clone(ledger).slice(0, 100),
    exportAll: async () => clone({ files, premium: prem, mpass, points: pts, ledger, charges, notices }),
  };
}

/* =====================================================================
   Supabase 백엔드 — PyNest 와 같은 프로젝트라서 계정(ID·비밀번호)이 그대로 연동돼요
   sb: createClient() 결과 (테스트에서는 가짜를 넣을 수 있어요)
   ===================================================================== */
export function supabaseBackend(sb) {
  const emailOf = (id) => `${id.toLowerCase()}@pyclass.site`; // PyNest 와 같은 규칙
  const premRow = (fileId, prem) => ({ file_id: fileId, drive_id: prem.driveId || null, solution_id: prem.solutionId || null });
  const fromRow = (r) => ({
    id: r.id, title: r.title, subject: r.subject, unit: r.unit, level: r.level, tier: r.tier, count: r.count,
    desc: r.desc, previewId: r.preview_id, hasSolution: r.has_solution, visible: r.visible, pinned: r.pinned,
    downloads: r.downloads, price: r.price || 0, driveId: r.drive_id || undefined, createdAt: Date.parse(r.created_at) || 0,
    mainSrc: r.main_src || 'drive', solutionSrc: r.solution_src || 'drive', previewSrc: r.preview_src || 'drive',
  });
  const toRow = (f) => ({
    title: f.title, subject: f.subject, unit: f.unit, level: f.level, tier: f.tier, count: f.count,
    desc: f.desc, preview_id: f.previewId, has_solution: f.hasSolution, visible: f.visible, price: f.price || 0,
    main_src: f.mainSrc || 'drive', solution_src: f.solutionSrc || 'drive', preview_src: f.previewSrc || 'drive',
  });
  const profileOf = async (session) => {
    const uid = session.user.id;
    try {
      const { data } = await sb.from('profiles').select('id,username,role,status').eq('id', uid).maybeSingle();
      if (data) return { id: uid, username: data.username, role: data.role, status: data.status };
    } catch { /* 아래 기본값 사용 */ }
    return { id: uid, username: session.user.user_metadata?.username || '회원', role: 'student', status: 'pending' };
  };
  const rpc = async (name, args) => must(await sb.rpc(name, args));
  const BUCKET = 'mh-files';
  const KINDS = ['main', 'solution', 'preview'];
  const objPath = (id, kind) => `${id}/${kind}.pdf`;
  const safeName = (t, kind) => `${String(t || 'file').replace(/[\\/:*?"<>|\r\n]+/g, ' ').trim().slice(0, 80) || 'file'}${kind === 'solution' ? ' 해설' : ''}.pdf`;
  const uploadAll = async (id, up = {}, upsert = true) => {
    for (const k of KINDS) {
      if (up[k]) must(await sb.storage.from(BUCKET).upload(objPath(id, k), up[k], { upsert, contentType: 'application/pdf', cacheControl: '3600' }));
    }
  };
  const removeObjects = async (id, kinds = KINDS) => { try { await sb.storage.from(BUCKET).remove(kinds.map((k) => objPath(id, k))); } catch { /* 없어도 괜찮아요 */ } };
  const nz = (x) => (x ? x : null);

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
      const { error } = await sb.auth.signUp({ email: emailOf(id), password: pw, options: { data: { username: id.toLowerCase(), src: 'mcom' } } });
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
    hasPass: async () => (await rpc('mh_has_pass')) === true,
    myPass: async (u) => {
      const r = must(await sb.from('mh_pass').select('*').eq('user_id', u.id).maybeSingle());
      const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10); // 한국 날짜
      const act = !!r && r.active && (!r.expires || r.expires >= today);
      return { active: act, left: act ? Math.max((r.quota || 0) - (r.used || 0), 0) : 0, quota: r ? r.quota || 0 : 0, used: r ? r.used || 0 : 0, expires: r ? r.expires : null, plan: r ? r.plan || '' : '' };
    },
    claimFile: (id) => rpc('mh_claim_file', { p_file: id }),
    buyPass: (planId) => rpc('mh_buy_pass', { p_plan: planId }),
    myState: async (u) => {
      const p = must(await sb.from('mh_points').select('balance').eq('user_id', u.id).maybeSingle());
      const o = must(await sb.from('mh_purchases').select('file_id').eq('user_id', u.id));
      return { points: p ? p.balance : 0, owned: o.map((r) => r.file_id) };
    },
    getPremium: async (id) => {
      const r = must(await sb.from('mh_premium').select('drive_id,solution_id').eq('file_id', id).maybeSingle());
      return r ? { driveId: r.drive_id || undefined, solutionId: r.solution_id || undefined } : {};
    },
    getDriveId: async (f, kind) => {
      if (kind === 'main' && f.tier === 'free') return f.driveId;
      const r = must(await sb.from('mh_premium').select('drive_id,solution_id').eq('file_id', f.id).maybeSingle()); // 권한 없으면 서버가 안 줌
      const id = r && (kind === 'solution' ? r.solution_id : r.drive_id);
      if (!id) throw new Error('파일 ID 없음');
      return id;
    },
    // 받기/미리보기용 주소. 업로드 파일은 권한이 있을 때만 서버가 임시 주소(2분)를 만들어줘요.
    getLink: async (f, kind) => {
      const src = kind === 'solution' ? f.solutionSrc : kind === 'preview' ? f.previewSrc : f.mainSrc;
      if (src === 'upload') {
        const opt = kind === 'preview' ? undefined : { download: safeName(f.title, kind) };
        const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(objPath(f.id, kind), 120, opt);
        if (error || !data?.signedUrl) throw error || new Error('권한 없음');
        return data.signedUrl;
      }
      if (kind === 'preview') return drivePreviewUrl(f.previewId);
      const id = await (async () => {
        if (kind === 'main' && f.tier === 'free') return f.driveId;
        const r = must(await sb.from('mh_premium').select('drive_id,solution_id').eq('file_id', f.id).maybeSingle());
        return r && (kind === 'solution' ? r.solution_id : r.drive_id);
      })();
      if (!id) throw new Error('파일 ID 없음');
      return driveDownloadUrl(id);
    },
    buyFile: (id) => rpc('mh_buy_file', { p_file: id }),
    myLedger: async (u) => must(await sb.from('mh_ledger').select('*').eq('user_id', u.id).order('created_at', { ascending: false }).limit(100)).map(ledgerFrom),
    myCharges: async (u) => must(await sb.from('mh_charges').select('*').eq('user_id', u.id).order('created_at', { ascending: false }).limit(30)).map(chargeFrom),
    myPurchases: async (u) => must(await sb.from('mh_purchases').select('*').eq('user_id', u.id).order('created_at', { ascending: false }))
      .map((r) => ({ fileId: r.file_id, price: r.price, at: Date.parse(r.created_at) || 0 })),
    requestCharge: (amount, depositor) => rpc('mh_request_charge', { p_amount: amount, p_depositor: depositor || '' }),
    addFile: async (f, ids, up = {}) => {
      const { id } = must(await sb.from('mh_files').insert({ ...toRow(f), drive_id: f.tier === 'free' && f.mainSrc !== 'upload' ? nz(ids.main) : null }).select('id').single());
      try {
        await uploadAll(id, up, false);
        const prem = buildPrem(f.tier, ids);
        if (Object.keys(prem).length) must(await sb.from('mh_premium').insert(premRow(id, prem)));
      } catch (err) { // 중간에 실패하면 반쯤 만들어진 자료를 지워요
        await removeObjects(id);
        await sb.from('mh_files').delete().eq('id', id);
        throw err;
      }
      return id;
    },
    updateFile: async (id, f, ids, up = {}) => {
      must(await sb.from('mh_files').update({ ...toRow(f), drive_id: f.tier === 'free' && f.mainSrc !== 'upload' ? nz(ids.main) : null, updated_at: new Date().toISOString() }).eq('id', id));
      await uploadAll(id, up);
      const prem = buildPrem(f.tier, ids);
      if (Object.keys(prem).length) must(await sb.from('mh_premium').upsert(premRow(id, prem)));
      else must(await sb.from('mh_premium').delete().eq('file_id', id));
      // 드라이브 방식으로 바꾼 항목의 예전 업로드 파일 정리
      const old = [];
      if (f.mainSrc !== 'upload') old.push('main');
      if (f.solutionSrc !== 'upload' || !f.hasSolution) old.push('solution');
      if (f.previewSrc !== 'upload') old.push('preview');
      if (old.length) await removeObjects(id, old);
    },
    patchFile: async (id, patch) => { must(await sb.from('mh_files').update(patch).eq('id', id)); },
    deleteFile: async (id) => { await removeObjects(id); must(await sb.from('mh_files').delete().eq('id', id)); },

    listNotices: async () => must(await sb.from('mh_notices').select('*').order('created_at', { ascending: false })).map(noticeFrom),
    addNotice: async (n, author) => { must(await sb.from('mh_notices').insert({ title: n.title, body: n.body, pinned: !!n.pinned, visible: n.visible !== false, author: author || '' })); },
    updateNotice: async (id, n) => { must(await sb.from('mh_notices').update({ title: n.title, body: n.body, pinned: !!n.pinned, visible: n.visible !== false, updated_at: new Date().toISOString() }).eq('id', id)); },
    deleteNotice: async (id) => { must(await sb.from('mh_notices').delete().eq('id', id)); },
    countDownload: async (id) => { try { await sb.rpc('mh_count_download', { p_id: id }); } catch { /* 통계라서 무시 */ } },

    listPass: async () => must(await sb.from('mh_pass').select('*').order('username'))
      .map((r) => ({ id: r.user_id, name: r.username, active: r.active, expires: r.expires, memo: r.memo, quota: r.quota || 0, used: r.used || 0, plan: r.plan || '' })),
    setPass: (name, expires, memo, quota = 0, plan = '') => rpc('mh_grant_pass', { p_username: name, p_expires: expires || null, p_memo: memo || '', p_quota: Math.max(0, Number(quota) || 0), p_plan: plan || '' }),
    removePass: async (id) => { must(await sb.from('mh_pass').delete().eq('user_id', id)); },

    listPoints: async () => must(await sb.from('mh_points').select('*').order('username')).map((r) => ({ id: r.user_id, username: r.username, balance: r.balance })),
    adjustPoints: (name, delta, memo) => rpc('mh_adjust_points', { p_username: name, p_delta: delta, p_memo: memo || '' }),
    listCharges: async () => must(await sb.from('mh_charges').select('*').order('created_at', { ascending: false }).limit(100)).map(chargeFrom),
    resolveCharge: (id, approve) => rpc('mh_resolve_charge', { p_id: id, p_approve: !!approve }),
    listLedger: async () => must(await sb.from('mh_ledger').select('*').order('created_at', { ascending: false }).limit(100)).map(ledgerFrom),

    exportAll: async () => {
      const t = ['mh_files', 'mh_premium', 'mh_pass', 'mh_points', 'mh_ledger', 'mh_purchases', 'mh_charges', 'mh_notices'];
      const res = await Promise.all(t.map((n) => sb.from(n).select('*')));
      return Object.fromEntries(t.map((n, i) => [n.replace('mh_', ''), must(res[i])]));
    },
  };
}
const ledgerFrom = (r) => ({ id: r.id, username: r.username, delta: r.delta, balance_after: r.balance_after, kind: r.kind, memo: r.memo, at: Date.parse(r.created_at) || 0, fileId: r.file_id });
const chargeFrom = (r) => ({ id: r.id, username: r.username, amount: r.amount, depositor: r.depositor, status: r.status, at: Date.parse(r.created_at) || 0 });

const noticeFrom = (r) => ({ id: r.id, title: r.title, body: r.body, pinned: r.pinned, visible: r.visible, author: r.author, createdAt: Date.parse(r.created_at) || 0, updatedAt: r.updated_at ? Date.parse(r.updated_at) : null });
