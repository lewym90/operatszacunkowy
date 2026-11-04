export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const fmt = n => Math.round(n).toLocaleString('pl-PL');
export const roundTo = (n, step) => Math.round(n / step) * step;
const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

let tt;
export function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(tt); tt = setTimeout(() => t.classList.remove('show'), 2400); }

export function openSheet(html, mount) {
  const sh = $('#sheet'), pane = $('.pane', sh);
  pane.innerHTML = '<div class="grab"></div>' + html; sh.setAttribute('aria-hidden', 'false');
  document.documentElement.classList.add('lock'); requestAnimationFrame(() => sh.classList.add('open'));
  $('.scrim', sh).onclick = closeSheet; pane.scrollTop = 0; mount && mount(pane);
}
export function closeSheet() { const sh = $('#sheet'); sh.classList.remove('open'); sh.setAttribute('aria-hidden', 'true'); document.documentElement.classList.remove('lock'); }

// animowane liczenie kwoty
export function countUp(el, to, ms = 1100, f = fmt) {
  if (reduce()) { el.textContent = f(to); return; }
  const t0 = performance.now(); const ease = x => x >= 1 ? 1 : 1 - Math.pow(2, -10 * x);
  const step = t => { const k = Math.min(1, (t - t0) / ms); el.textContent = f(to * ease(k)); if (k < 1) requestAnimationFrame(step); }; requestAnimationFrame(step);
}

export async function saveFile(blob, name) {
  try { const f = new File([blob], name, { type: blob.type }); if (navigator.canShare && navigator.canShare({ files: [f] })) { await navigator.share({ files: [f], title: name }); return 'share'; } } catch (e) { if (e && e.name === 'AbortError') return 'cancel'; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000); return 'download';
}

export const ICON = {
  wycena: '<svg viewBox="0 0 24 24"><path d="M8 4.5H6v16h12v-16h-2"/><path d="M8.5 3h7v3h-7zM9 11h6M9 14.5h6M9 18h4"/></svg>',
  dane: '<svg viewBox="0 0 24 24"><ellipse cx="12" cy="6" rx="7.5" ry="3"/><path d="M4.5 6v6c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3V6M4.5 12v6c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3v-6"/></svg>',
  oferty: '<svg viewBox="0 0 24 24"><path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r="1.2"/><circle cx="4" cy="12" r="1.2"/><circle cx="4" cy="18" r="1.2"/></svg>',
  mapa: '<svg viewBox="0 0 24 24"><path d="M12 21s-6.5-5.6-6.5-10.8A6.5 6.5 0 0 1 12 3.7a6.5 6.5 0 0 1 6.5 6.5C18.5 15.4 12 21 12 21z"/><circle cx="12" cy="10" r="2.4"/></svg>',
  rynek: '<svg viewBox="0 0 24 24"><path d="M3.5 19.5h17"/><path d="M5 16l4.2-5 3.3 3 5.5-7"/><path d="M14.5 7H18v3.5"/></svg>',
  historia: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
  ust: '<svg viewBox="0 0 24 24"><path d="M4 7h9m4 0h3M4 17h3m4 0h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/></svg>',
  start: '<svg viewBox="0 0 24 24"><path d="M3.5 11.5 12 4l8.5 7.5"/><path d="M6 10v10h4v-6h4v6h4V10"/></svg>',
  wiecej: '<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/></svg>',
  menu: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
  dzwonek: '<svg viewBox="0 0 24 24"><path d="M6 16.5V11a6 6 0 1 1 12 0v5.5l1.5 2h-15z"/><path d="M10 21h4"/></svg>',
  klucz: '<svg viewBox="0 0 24 24"><circle cx="8" cy="15.5" r="4.5"/><path d="m11.3 12.2 8.2-8.2M16 7.5l2.5 2.5M13.5 10l2 2"/></svg>',
  slupki: '<svg viewBox="0 0 24 24"><path d="M3.5 20.5h17"/><path d="M6 20v-6h3v6M10.5 20V9h3v11M15 20V4.500h3V20"/></svg>',
  kalk: '<svg viewBox="0 0 24 24"><ellipse cx="9.5" cy="6" rx="6" ry="2.5"/><path d="M3.5 6v4c0 1.400 2.700 2.5 6 2.500M3.5 10v4c0 1.400 2.700 2.5 6 2.5"/><ellipse cx="15.5" cy="14" rx="5.5" ry="2.300"/><path d="M10 14v4.500c0 1.300 2.5 2.300 5.5 2.300s5.5-1 5.5-2.300V14M15.5 8.500h0"/></svg>',
  lornetka: '<svg viewBox="0 0 24 24"><circle cx="6.5" cy="16" r="4"/><circle cx="17.5" cy="16" r="4"/><path d="M10.5 16h3M4 12.5 7 5h3v5M20 12.5 17 5h-3v5M10 10h4"/></svg>',
  teczki: '<svg viewBox="0 0 24 24"><path d="M3.5 19V6.500h6l2 2.500h9V19z"/></svg>',
  raport: '<svg viewBox="0 0 24 24"><path d="M6 3.500h8.500L19 8v12.500H6z"/><path d="M14 3.500V8.500h5M9 12.500h7M9 16h7"/></svg>',
  warstwy: '<svg viewBox="0 0 24 24"><path d="m12 4 9 5-9 5-9-5z"/><path d="m3 13.5 9 5 9-5"/></svg>',
  skyline: '<svg viewBox="0 0 353 86" preserveAspectRatio="none"><defs><linearGradient id="skyg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#C8A44D" stop-opacity=".30"/><stop offset="1" stop-color="#C8A44D" stop-opacity=".02"/></linearGradient></defs><path fill="url(#skyg)" stroke="#C8A44D" stroke-opacity=".45" stroke-width=".8" d="M-2 96V62h20l8-7 8 7h12V52l10-8 10 8v10h14V48l5-14 5 14v14h10l3-4h14l3 4h12V40h4l3-20 3 20h4v22h14l9-8 9 8h10V44l12-9 12 9v18h16V30l3-3v-8l2-9 2 9v8l3 3v32h12l8-6 8 6h16V50l9-8 9 8v12h12l5-22 5 22h12v-8h18v8h14v34z"/></svg>',
  back: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
};

// Własne podpowiedzi pod polem tekstowym (iOS w aplikacji z ekranu głównego często ignoruje <datalist>). list: tablica napisów.
const plain = s => String(s || '').toLowerCase().replace(/ł/g, 'l').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
export function suggest(input, list, max = 8) {
  const box = document.createElement('div'); box.className = 'suggest'; box.hidden = true; input.parentElement.style.position = 'relative'; input.parentElement.appendChild(box);
  const idx = list.map(x => [x, plain(x)]);
  const show = () => {
    const q = plain(input.value.trim()); if (!q) { box.hidden = true; return; }
    const m = idx.filter(([, p]) => p.startsWith(q)).concat(idx.filter(([, p]) => !p.startsWith(q) && p.includes(q))).slice(0, max);
    if (!m.length || (m.length === 1 && plain(m[0][0]) === q)) { box.hidden = true; return; }
    box.innerHTML = m.map(([x]) => `<button type="button" class="sg">${esc(x)}</button>`).join(''); box.hidden = false;
  };
  const pick = e => { const b = e.target.closest('.sg'); if (!b) return; e.preventDefault(); input.value = b.textContent; box.hidden = true; input.dispatchEvent(new Event('change', { bubbles: true })); input.blur(); };
  box.addEventListener('pointerdown', pick);
  input.addEventListener('input', show); input.addEventListener('focus', show); input.addEventListener('blur', () => setTimeout(() => { box.hidden = true; }, 200));
}
