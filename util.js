import { CONFIG } from './config.js?v=5';
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
export function triggerDownload(id) {
  // 드라이브 확인 페이지 없이 바로 내려받는 주소
  const a = document.createElement('a');
  a.href = `https://drive.usercontent.google.com/download?id=${encodeURIComponent(id)}&export=download&confirm=t`;
  a.rel = 'noopener';
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
