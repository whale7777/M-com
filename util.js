import { CONFIG } from './config.js?v=18';
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
