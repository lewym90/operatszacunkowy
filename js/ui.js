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
  wycena: '<svg viewBox="0 0 24 24"><path d="M3.5 11.2 12 4l8.5 7.2"/><path d="M5.8 10v9h12.4v-9"/><path d="M4 22h16M7 22v-2m10 2v-2"/></svg>',
  dane: '<svg viewBox="0 0 24 24"><ellipse cx="12" cy="6" rx="7.5" ry="3"/><path d="M4.5 6v6c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3V6M4.5 12v6c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3v-6"/></svg>',
  oferty: '<svg viewBox="0 0 24 24"><path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r="1.2"/><circle cx="4" cy="12" r="1.2"/><circle cx="4" cy="18" r="1.2"/></svg>',
  mapa: '<svg viewBox="0 0 24 24"><path d="M12 21s-6.5-5.6-6.5-10.8A6.5 6.5 0 0 1 12 3.7a6.5 6.5 0 0 1 6.5 6.5C18.5 15.4 12 21 12 21z"/><circle cx="12" cy="10" r="2.4"/></svg>',
  historia: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
  ust: '<svg viewBox="0 0 24 24"><path d="M4 7h9m4 0h3M4 17h3m4 0h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/></svg>',
  back: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
};
