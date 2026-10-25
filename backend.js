import { DAY, clone, fmtDate } from './util.js';
import { DEFAULT_TAX, DEFAULT_SITE, buildPrem } from './defaults.js';

const must = ({ data, error }) => { if (error) throw error; return data; };

/* =====================================================================
   데모 백엔드 (설정 전 / 주소 뒤에 ?demo 를 붙였을 때 · 새로고침하면 초기화)
   ===================================================================== */
export function demoBackend(flags = {}) {
  let seq = 0;
  const now = Date.now();
  const mk = (subject, unit, tier, level, title, desc, count, extra = {}) => ({
    id: 'd' + seq++, subject, unit, tier, level, title, desc, count, visible: true, pinned: false, price: tier === 'premium' ? 300 : 0,
    downloads: Math.floor(Math.random() * 180), createdAt: now - seq * 2 * DAY,
    driveId: tier === 'free' ? 'DEMO' : undefined, previewId: 'DEMO', hasSolution: false, ...extra,
  });
  const files = [
    mk('physics', 'energy', 'free', 1, '역학적 에너지 보존 입문 10제', '일과 에너지 기본기를 다지는 세트. 그래프 해석 포함.', 10),
    mk('physics', 'mech', 'premium', 3, '등가속도 + 에너지 융합 킬러 12제', '계산량 있는 심화 세트. 풀이 PDF 수록.', 12, { hasSolution: true, pinned: true, price: 500 }),
    mk('physics', 'em', 'premium', 2, '전기장과 전위 표준 12제', '전기력선·등전위선 자료 해석.', 12, { price: 300 }),
    mk('chem', 'stoich', 'free', 1, '몰 농도·화학량론 기본 10제', '계산 실수를 줄이는 단위 정리 중심.', 10),
    mk('chem', 'acid', 'premium', 3, '산염기 적정 곡선 심화 13제', '그래프 추론형 문항 위주.', 13, { hasSolution: true, price: 500 }),
    mk('bio', 'metab', 'free', 2, '세포 호흡 · 광합성 핵심 10제', '자료 해석형 문제로 구성.', 10, { hasSolution: true, price: 200 }),
    mk('bio', 'genetic', 'premium', 3, '가계도 분석 · 유전 확률 심화 12제', '경우의 수 처리까지 한 번에.', 12, { price: 400 }),
    mk('earth', 'atmo', 'premium', 2, '대기와 해양 순환 심화 12제', '자료 분석 · 추론 유형.', 12, { price: 300 }),
    mk('earth', 'astro', 'free', 2, '별의 물리량과 H-R도 10제', '천문 단원 기본 자료해석.', 10),
    mk('earth', 'astro', 'premium', 3, '외계 행성·우주론 자료해석 12제', '아직 공개 전인 초안 (숨김 상태 예시)', 12, { visible: false, hasSolution: true, price: 500 }),
  ];
  const prem = {};
  files.forEach((f) => { prem[f.id] = buildPrem(f.tier, { main: 'DEMO', solution: f.hasSolution ? 'DEMO' : null }); });
  const meta = { tax: clone(DEFAULT_TAX), site: clone(DEFAULT_SITE) };
  let mpass = [
    { id: 'u1', name: 'student01', expires: null, memo: '예시 학생 (무기한)', active: true },
    { id: 'u2', name: 'soon01', expires: fmtDate(new Date(Date.now() + 4 * DAY)), memo: '곧 만료 예시', active: true },
  ];
  // 포인트 (데모 로그인 사용자 기준)
  const pts = { demo_user: 700, student01: 1500 };
  const owned = new Set();
  let ledger = [{ id: 1, username: 'demo_user', delta: 1000, balance_after: 1000, kind: 'charge', memo: '충전 승인 예시', at: now - 5 * DAY, fileId: null }];
  let charges = [
    { id: 'c1', username: 'student01', amount: 3000, depositor: '김학생', status: 'pending', at: now - 3600e3 },
    { id: 'c2', username: 'demo_user', amount: 1000, depositor: '데모', status: 'done', at: now - 5 * DAY },
  ];
  let lid = 2;
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
    myState: async () => ({ points: cur ? pts[cur.username] || 0 : 0, owned: [...owned] }),
    getDriveId: async () => 'DEMO',
    getPremium: async (id) => clone(prem[id] || {}),
    buyFile: async (id) => {
      const f = find(id);
      if (!cur) return 'login';
      if (!f || f.visible === false) return 'not_found';
      if (flags.pass || owned.has(id)) return 'already';
      if (!(f.price > 0)) return 'not_for_sale';
      const bal = pts[cur.username] || 0;
      if (bal < f.price) return 'insufficient';
      pts[cur.username] = bal - f.price;
      owned.add(id);
      log(cur.username, -f.price, 'purchase', f.title, id);
      return 'ok';
    },
    myLedger: async () => clone(ledger.filter((l) => cur && l.username === cur.username)),
    myCharges: async () => clone(charges.filter((c) => cur && c.username === cur.username)),
    myPurchases: async () => files.filter((f) => owned.has(f.id)).map((f) => ({ fileId: f.id, price: f.price, at: Date.now() })),
    requestCharge: async (amount, depositor) => {
      if (!cur) return 'login';
      if (!(amount >= 1 && amount <= 1000000)) return 'invalid';
      charges.unshift({ id: 'c' + Date.now(), username: cur.username, amount, depositor, status: 'pending', at: Date.now() });
      return 'ok';
    },
    addFile: async (f, ids) => {
      const id = 'd' + Date.now();
      files.unshift({ ...f, id, downloads: 0, pinned: false, createdAt: Date.now(), driveId: f.tier === 'free' ? ids.main : undefined });
      prem[id] = buildPrem(f.tier, ids);
      return id;
    },
    updateFile: async (id, f, ids) => {
      Object.assign(find(id), f, { driveId: f.tier === 'free' ? ids.main : undefined });
      prem[id] = buildPrem(f.tier, ids);
    },
    patchFile: async (id, patch) => { Object.assign(find(id), patch); },
    deleteFile: async (id) => { files.splice(files.findIndex((f) => f.id === id), 1); delete prem[id]; owned.delete(id); },
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
    exportAll: async () => clone({ files, premium: prem, mpass, points: pts, ledger, charges }),
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
  });
  const toRow = (f) => ({
    title: f.title, subject: f.subject, unit: f.unit, level: f.level, tier: f.tier, count: f.count,
    desc: f.desc, preview_id: f.previewId, has_solution: f.hasSolution, visible: f.visible, price: f.price || 0,
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
    hasPass: async () => (await rpc('mh_has_pass')) === true,
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
    buyFile: (id) => rpc('mh_buy_file', { p_file: id }),
    myLedger: async (u) => must(await sb.from('mh_ledger').select('*').eq('user_id', u.id).order('created_at', { ascending: false }).limit(100)).map(ledgerFrom),
    myCharges: async (u) => must(await sb.from('mh_charges').select('*').eq('user_id', u.id).order('created_at', { ascending: false }).limit(30)).map(chargeFrom),
    myPurchases: async (u) => must(await sb.from('mh_purchases').select('*').eq('user_id', u.id).order('created_at', { ascending: false }))
      .map((r) => ({ fileId: r.file_id, price: r.price, at: Date.parse(r.created_at) || 0 })),
    requestCharge: (amount, depositor) => rpc('mh_request_charge', { p_amount: amount, p_depositor: depositor || '' }),
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
    deleteFile: async (id) => { must(await sb.from('mh_files').delete().eq('id', id)); },
    countDownload: async (id) => { try { await sb.rpc('mh_count_download', { p_id: id }); } catch { /* 통계라서 무시 */ } },

    listPass: async () => must(await sb.from('mh_pass').select('*').order('username'))
      .map((r) => ({ id: r.user_id, name: r.username, active: r.active, expires: r.expires, memo: r.memo })),
    setPass: (name, expires, memo) => rpc('mh_grant_pass', { p_username: name, p_expires: expires || null, p_memo: memo || '' }),
    removePass: async (id) => { must(await sb.from('mh_pass').delete().eq('user_id', id)); },

    listPoints: async () => must(await sb.from('mh_points').select('*').order('username')).map((r) => ({ id: r.user_id, username: r.username, balance: r.balance })),
    adjustPoints: (name, delta, memo) => rpc('mh_adjust_points', { p_username: name, p_delta: delta, p_memo: memo || '' }),
    listCharges: async () => must(await sb.from('mh_charges').select('*').order('created_at', { ascending: false }).limit(100)).map(chargeFrom),
    resolveCharge: (id, approve) => rpc('mh_resolve_charge', { p_id: id, p_approve: !!approve }),
    listLedger: async () => must(await sb.from('mh_ledger').select('*').order('created_at', { ascending: false }).limit(100)).map(ledgerFrom),

    exportAll: async () => {
      const t = ['mh_files', 'mh_premium', 'mh_pass', 'mh_points', 'mh_ledger', 'mh_purchases', 'mh_charges'];
      const res = await Promise.all(t.map((n) => sb.from(n).select('*')));
      return Object.fromEntries(t.map((n, i) => [n.replace('mh_', ''), must(res[i])]));
    },
  };
}
const ledgerFrom = (r) => ({ id: r.id, username: r.username, delta: r.delta, balance_after: r.balance_after, kind: r.kind, memo: r.memo, at: Date.parse(r.created_at) || 0, fileId: r.file_id });
const chargeFrom = (r) => ({ id: r.id, username: r.username, amount: r.amount, depositor: r.depositor, status: r.status, at: Date.parse(r.created_at) || 0 });
