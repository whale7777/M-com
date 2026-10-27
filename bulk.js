// 관리자 선택 관리: 자료 여러 개를 체크해서 한 번에 공개/숨김/고정/가격/폴더 이동/삭제
import { $, $$, esc, num, toast } from './util.js?v=24';
import { S, flatUnits } from './state.js?v=24';
import { applyEdit, MAX_PRICE } from './editor.js?v=24';

export const B = { on: false, sel: new Set(), hash: '' };

export function barHTML() {
  const sj = S.tax.map((s) => `<option value="${esc(s.id)}">${esc(s.emoji)} ${esc(s.name)}</option>`).join('');
  return `<div class="bulkbar" id="bulkbar">
    <div class="bb-row"><b id="bbN">0개 선택</b>
      <button class="btn sm" data-bulk="all" type="button">전체 선택</button>
      <button class="btn sm" data-bulk="none" type="button">선택 해제</button>
      <button class="btn sm ghost" data-bulk="exit" type="button">✕ 선택 끝내기</button></div>
    <div class="bb-row acts">
      <button class="btn sm" data-bulk="show" type="button">👁 공개</button>
      <button class="btn sm" data-bulk="hide" type="button">🙈 숨기기</button>
      <button class="btn sm" data-bulk="pin" type="button">📌 고정</button>
      <button class="btn sm" data-bulk="unpin" type="button">📌 고정 해제</button>
      <button class="btn sm" data-bulk="panel-price" type="button">💰 가격</button>
      <button class="btn sm" data-bulk="panel-move" type="button">📂 폴더 이동</button>
      <button class="btn sm danger" data-bulk="del" type="button">🗑 삭제</button></div>
    <div class="bb-row bb-panel hidden" id="bbPrice"><label>가격 <input id="bbPriceV" type="number" min="0" max="${MAX_PRICE}" step="10" placeholder="예: 300"> P</label> <small>(0이면 무료)</small>
      <button class="btn sm primary" data-bulk="price-ok" type="button">적용</button></div>
    <div class="bb-row bb-panel hidden" id="bbMove"><select id="bbMoveS" aria-label="과목">${sj}</select><select id="bbMoveU" aria-label="단원"></select>
      <button class="btn sm primary" data-bulk="move-ok" type="button">이동</button></div>
  </div>`;
}

const boxes = () => $$('input[data-sel]');
export function syncSel() {
  const present = new Set(boxes().map((b) => b.dataset.sel));
  for (const id of [...B.sel]) if (!present.has(id)) B.sel.delete(id);
  boxes().forEach((b) => { b.checked = B.sel.has(b.dataset.sel); b.closest('.tl')?.classList.toggle('on', b.checked); });
  $$('input[data-gsel]').forEach((g) => {
    const ins = $$('input[data-sel]', g.closest('.leaf, .bigblk'));
    const n = ins.filter((i) => i.checked).length;
    g.checked = ins.length > 0 && n === ins.length; g.indeterminate = n > 0 && n < ins.length; g.disabled = !ins.length;
  });
  const n = $('#bbN'); if (n) n.textContent = `${B.sel.size}개 선택`;
  $$('#bulkbar .acts button, #bulkbar .bb-panel .primary').forEach((b) => { b.disabled = !B.sel.size; });
}

function fillMoveUnits() {
  const s = S.tax.find((x) => x.id === $('#bbMoveS')?.value);
  $('#bbMoveU').innerHTML = flatUnits(s?.units).map(({ u, trail }) => `<option value="${esc(u.id)}">${esc(trail.join(' › '))}</option>`).join('') || '<option value="">(단원 없음)</option>';
}

async function each(label, fn) {
  const ids = [...B.sel]; let ok = 0, fail = 0;
  for (const id of ids) {
    const f = S.files.find((x) => x.id === id); if (!f) continue;
    try { await fn(f); ok++; } catch (e) { console.error(e); fail++; }
  }
  await S.hooks.reload();
  toast(`${label}: ${ok}개 완료${fail ? ` · ${fail}개 실패` : ''}`);
}

export async function bulkClick(act) {
  if (act === 'enter') { B.on = true; B.sel.clear(); return S.hooks.route(); }
  if (act === 'exit') { B.on = false; B.sel.clear(); return S.hooks.route(); }
  if (act === 'all' || act === 'none') { boxes().forEach((b) => { act === 'all' ? B.sel.add(b.dataset.sel) : B.sel.delete(b.dataset.sel); }); return syncSel(); }
  if (act === 'panel-price' || act === 'panel-move') {
    const show = act === 'panel-price' ? '#bbPrice' : '#bbMove', hide = act === 'panel-price' ? '#bbMove' : '#bbPrice';
    $(hide).classList.add('hidden'); $(show).classList.toggle('hidden');
    if (act === 'panel-move') { const cur = S.files.find((x) => B.sel.has(x.id)); if (cur && $('#bbMoveS')) $('#bbMoveS').value = cur.subject; fillMoveUnits(); }
    return;
  }
  if (!B.sel.size) return toast('먼저 자료를 선택해줘');
  if (act === 'show') return each('공개', (f) => S.api.patchFile(f.id, { visible: true }));
  if (act === 'hide') return each('숨김', (f) => S.api.patchFile(f.id, { visible: false }));
  if (act === 'pin') return each('고정', (f) => S.api.patchFile(f.id, { pinned: true }));
  if (act === 'unpin') return each('고정 해제', (f) => S.api.patchFile(f.id, { pinned: false }));
  if (act === 'price-ok') {
    const raw = $('#bbPriceV').value.trim(); const p = Number(raw);
    if (raw === '' || !Number.isFinite(p) || p < 0 || p > MAX_PRICE) return toast(`가격은 0 ~ ${num(MAX_PRICE)} 사이로 넣어줘`);
    return each('가격 변경', (f) => applyEdit(f, { price: Math.floor(p) }));
  }
  if (act === 'move-ok') {
    const s = $('#bbMoveS').value, u = $('#bbMoveU').value;
    if (!s || !u) return toast('이동할 단원을 골라줘');
    return each('폴더 이동', (f) => applyEdit(f, { subject: s, unit: u }));
  }
  if (act === 'del') {
    if (!confirm(`선택한 ${B.sel.size}개 자료를 삭제할까?\n업로드한 파일과 구매 기록도 함께 사라지고 되돌릴 수 없어요.`)) return;
    return each('삭제', (f) => S.api.deleteFile(f.id)).then(() => { B.sel.clear(); syncSel(); });
  }
}

export function bindBulk() {
  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t.matches?.('input[data-sel]')) { t.checked ? B.sel.add(t.dataset.sel) : B.sel.delete(t.dataset.sel); return syncSel(); }
    if (t.matches?.('input[data-gsel]')) {
      $$('input[data-sel]', t.closest('.leaf, .bigblk')).forEach((i) => { t.checked ? B.sel.add(i.dataset.sel) : B.sel.delete(i.dataset.sel); });
      return syncSel();
    }
    if (t.id === 'bbMoveS') fillMoveUnits();
  });
}
