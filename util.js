import { CONFIG } from './config.js?v=25';
export const DAY = 864e5;
// config.js 가 예전 버전이어도 동작하도록 기본 주소를 같이 둬요 (주소는 대소문자 구분!)
export const PYNEST_URL = CONFIG.PYNEST_URL || 'https://whale7777.github.io/PYNEST/';
export const MCOM_URL = CONFIG.MCOM_URL || 'https://whale7777.github.io/M-com/';
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const clone = (x) => JSON.parse(JSON.stringify(x));
export const uid = (p) => p + Math.random().toString(36).slice(2, 7);
export const safeColor = (c) => (/^#[0-9a-f]{6}$/i.test(c || '') ? c : '#8d8da8');
export const fmtDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const fmtDT = (t) => { const d = new Date(t); return isNaN(d) ? '' : `${fmtDate(d)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
export const num = (n) => Number(n || 0).toLocaleString('ko-KR');
export const ID_RE = /^[a-z0-9_]{3,20}$/; // PyNest 와 같은 ID 규칙

// 링크는 http(s) 또는 사이트 안 주소(#...)만 허용
export const safeLink = (u) => {
  const s = String(u || '').trim();
  if (s === '@pynest') return PYNEST_URL; // 설정 파일의 PyNest 주소로 바뀌는 약속된 글자
  if (/^#/.test(s)) return s;
  return /^https?:\/\//i.test(s) ? s : '#/';
};

export function toast(msg) {
  const t = $('#toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), 2800);
}
export function extractDriveId(input) {
  const s = (input || '').trim();
  const m = s.match(/\/d\/([\w-]{10,})/) || s.match(/[?&]id=([\w-]{10,})/);
  if (m) return m[1];
  return /^[\w-]{10,}$/.test(s) ? s : null;
}
// 드라이브 확인 페이지 없이 바로 내려받는 주소
export const driveDownloadUrl = (id) => `https://drive.usercontent.google.com/download?id=${encodeURIComponent(id)}&export=download&confirm=t`;
export const drivePreviewUrl = (id) => `https://drive.google.com/file/d/${encodeURIComponent(id)}/preview`;
// v10: JSON → PDF 변환 서버 / 저장공간 기준 용량
export const RENDER_URL = String(CONFIG.RENDER_URL || '').replace(/\/+$/, '');
export const STORAGE_QUOTA_MB = Number(CONFIG.STORAGE_QUOTA_MB) > 0 ? Number(CONFIG.STORAGE_QUOTA_MB) : 1024;
export const MAX_UPLOAD_MB = Number(CONFIG.MAX_UPLOAD_MB) > 0 ? Number(CONFIG.MAX_UPLOAD_MB) : 10;
export const fmtSize = (b) => (b >= 1048576 ? (b / 1048576).toFixed(1) + 'MB' : Math.max(1, Math.round(b / 1024)) + 'KB');
const linkify = (html) => html.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
export const richText = (s) => linkify(esc(s || '')).replace(/\n/g, '<br>'); // 줄바꿈 + 주소 자동 링크 (HTML 은 막혀 있어요)
export function triggerDownload(url, name = '') {
  const a = document.createElement('a');
  a.href = url;
  a.rel = 'noopener';
  if (name) a.download = name; // 변환 서버에서 받은 blob 주소는 파일 이름을 직접 정해줘야 해요
  document.body.appendChild(a);
  a.click();
  a.remove();
}
/* ---- ZIP 만들기 (여러 PDF 를 한 번에 받을 때) ----
   PDF 는 이미 압축된 형식이라 "저장만 하는(STORE)" zip 으로 묶어요. 한글 파일 이름은 UTF-8 로 넣어요. */
const CRC_T = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
export function crc32(u8) {
  let c = 0xffffffff;
  for (let i = 0; i < u8.length; i++) c = CRC_T[(c ^ u8[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
export function makeZip(entries, when = new Date()) {
  const enc = new TextEncoder();
  const dosT = (when.getHours() << 11) | (when.getMinutes() << 5) | (when.getSeconds() >> 1);
  const dosD = (Math.max(0, when.getFullYear() - 1980) << 9) | ((when.getMonth() + 1) << 5) | when.getDate();
  const parts = [], central = [];
  let offset = 0;
  for (const e of entries) {
    const name = enc.encode(e.name), data = e.data, crc = crc32(data);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
    lh.setUint16(10, dosT, true); lh.setUint16(12, dosD, true); lh.setUint32(14, crc, true);
    lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
    parts.push(new Uint8Array(lh.buffer), name, data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true);
    ch.setUint16(12, dosT, true); ch.setUint16(14, dosD, true); ch.setUint32(16, crc, true);
    ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, name.length, true);
    ch.setUint32(42, offset, true);
    central.push(new Uint8Array(ch.buffer), name);
    offset += 30 + name.length + data.length;
  }
  const cdSize = central.reduce((n, a) => n + a.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true);
  end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: 'application/zip' });
}
// 파일 이름으로 못 쓰는 글자를 바꾸고, 같은 이름이 있으면 (2), (3) 을 붙여요
export const cleanName = (s, fallback = 'file') => String(s || '').replace(/[\\/:*?"<>|\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100) || fallback;
export function uniqueNames(names) {
  const used = new Set();
  return names.map((n) => {
    const m = n.match(/^(.*?)(\.[^.]*)?$/), base = m[1], ext = m[2] || '';
    let out = n, i = 2;
    while (used.has(out.toLowerCase())) out = `${base} (${i++})${ext}`;
    used.add(out.toLowerCase());
    return out;
  });
}
export function saveBlob(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
export const move = (arr, i, dir) => {
  const j = i + (dir === 'up' ? -1 : 1);
  if (j < 0 || j >= arr.length) return false;
  [arr[i], arr[j]] = [arr[j], arr[i]];
  return true;
};

// 문제 그림(png/jpg)을 올리기 전에 줄여요: 가로 1400px 넘으면 줄이고, 결과가 더 작을 때만 바꿔요. (svg 는 그대로)
export async function shrinkImage(file, maxW = 1400) {
  if (/svg/i.test(file.type) || /\.svg$/i.test(file.name)) return file;
  try {
    const bmp = await createImageBitmap(file);
    if (bmp.width <= maxW && file.size < 200 * 1024) { bmp.close?.(); return file; }
    const k = Math.min(1, maxW / bmp.width);
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);   // 투명 배경은 흰색으로
    g.drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close?.();
    const isPng = /png/i.test(file.type);
    const out = await new Promise((res) => c.toBlob(res, isPng ? 'image/png' : 'image/jpeg', 0.85));
    return out && out.size < file.size ? out : file;
  } catch { return file; }
}

/* ---- ZIP 에서 그림만 꺼내기 (브라우저 안에서 풀고, zip 자체는 서버에 올리지 않아요) ----
   - png / jpg / jpeg / svg 만 꺼내고, 폴더 구조·__MACOSX·숨김 파일은 무시해요.
   - zip 폭탄 방지: 파일 100개 · 한 파일 20MB · 합계 60MB 까지 */
const IMG_EXT = /\.(png|jpe?g|svg)$/i;
export async function unzipImages(zipFile) {
  if (typeof DecompressionStream === 'undefined') throw new Error('이 브라우저는 zip 풀기를 지원하지 않아요. 크롬·엣지·사파리 최신 버전에서 해줘.');
  const buf = new Uint8Array(await zipFile.arrayBuffer());
  const dv = new DataView(buf.buffer);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) { if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; } }
  if (eocd < 0) throw new Error(`"${zipFile.name}" 은 올바른 zip 파일이 아니에요.`);
  const total = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  if (total === 0xffff || p === 0xffffffff) throw new Error('너무 큰 zip(zip64)은 지원하지 않아요. 그림만 다시 압축해줘.');
  if (total > 400) throw new Error('zip 안에 파일이 너무 많아요.');
  const dec = (bytes, utf8) => { try { return new TextDecoder(utf8 ? 'utf-8' : 'euc-kr').decode(bytes); } catch { return new TextDecoder().decode(bytes); } };
  const out = [];
  let sum = 0;
  for (let n = 0; n < total; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('zip 구조가 깨져 있어요.');
    const flags = dv.getUint16(p + 8, true), method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true), usize = dv.getUint32(p + 24, true);
    const nl = dv.getUint16(p + 28, true), el = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true);
    const lho = dv.getUint32(p + 42, true);
    const rawName = dec(buf.subarray(p + 46, p + 46 + nl), !!(flags & 0x800));
    p += 46 + nl + el + cl;
    const base = rawName.split('/').pop();
    if (!base || rawName.endsWith('/') || /(^|\/)__MACOSX\//.test(rawName) || base.startsWith('.') || !IMG_EXT.test(base)) continue;
    if (flags & 1) throw new Error('암호가 걸린 zip 은 쓸 수 없어요.');
    if (csize === 0xffffffff || usize === 0xffffffff) throw new Error('너무 큰 파일이 들어 있어요.');
    if (usize > 20 * 1048576) throw new Error(`zip 안의 "${base}" 가 너무 커요 (20MB 이하로).`);
    sum += usize;
    if (sum > 60 * 1048576) throw new Error('zip 안의 그림 합계가 너무 커요 (60MB 이하로).');
    if (out.length >= 100) throw new Error('zip 안의 그림이 100개를 넘어요.');
    if (dv.getUint32(lho, true) !== 0x04034b50) throw new Error('zip 구조가 깨져 있어요.');
    const start = lho + 30 + dv.getUint16(lho + 26, true) + dv.getUint16(lho + 28, true);
    const raw = buf.subarray(start, start + csize);
    let data;
    if (method === 0) data = raw;
    else if (method === 8) {
      const reader = new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
      const parts = []; let got = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        got += value.length;
        if (got > Math.min(20 * 1048576, usize + 1024)) { reader.cancel(); throw new Error(`"${base}" 압축이 비정상이에요.`); }
        parts.push(value);
      }
      data = new Uint8Array(got);
      let o = 0; for (const c of parts) { data.set(c, o); o += c.length; }
    } else throw new Error(`"${base}" 는 지원하지 않는 압축 방식이에요.`);
    const type = /svg$/i.test(base) ? 'image/svg+xml' : /png$/i.test(base) ? 'image/png' : 'image/jpeg';
    out.push(new File([data], base, { type }));
  }
  if (!out.length) throw new Error(`"${zipFile.name}" 안에 그림(png·jpg·jpeg·svg)이 없어요.`);
  return out;
}
