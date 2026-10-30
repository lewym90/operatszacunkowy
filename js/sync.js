// Synchronizacja między urządzeniami przez własny serwer (server/sync_server.py).
// Każdy rekord (oferta, umowa, wycena, wpis o budynku, ustawienia) ma znacznik czasu; przy konflikcie wygrywa nowszy.
// Usunięcia przenoszą się jako znaczniki usunięcia. Dane RCN (duży plik) nie są synchronizowane: każde urządzenie pobiera je z serwera osobno.

export const DEFAULT_URL = 'https://188-68-247-201.sslip.io/operat-sync';
const BATCH = 400;

// szybki skrót treści rekordu (cyrb53): wykrywa, co zmieniło się od ostatniej synchronizacji
export function hash(v) {
  const s = JSON.stringify(v) ?? ''; let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

export const encodeCode = (url, key) => 'AMSYNC1:' + btoa(unescape(encodeURIComponent(JSON.stringify({ u: url, k: key }))));
export function decodeCode(s) {
  try { const t = String(s).trim(); if (!t.startsWith('AMSYNC1:')) return null; const o = JSON.parse(decodeURIComponent(escape(atob(t.slice(8))))); return o && o.u && o.k ? { url: o.u, key: o.k } : null; } catch { return null; }
}

/**
 * kv: { get(key, def), set(key, val) }  (lokalny magazyn, nie synchronizowany)
 * adapters: { [kolekcja]: { read(): [[id, dane], ...], apply(upserts: [[id, dane]], deletes: [id]), pristine?(id, dane): boolean } }
 * hooks: { onStatus(st), onRemote(zmienione: boolean) }
 */
export function createSync({ kv, adapters, hooks = {}, fetchFn = (...a) => fetch(...a), now = () => Date.now() }) {
  const status = { state: 'off', last: 0, error: '', pushed: 0, pulled: 0 };
  let busy = false, again = false, timer = null, poll = null, massOK = false, frozen = false;
  const emit = patch => { Object.assign(status, patch); hooks.onStatus && hooks.onStatus({ ...status }); };

  async function call(cfg, path, body) {
    let r;
    try { r = await fetchFn(cfg.url.replace(/\/+$/, '') + path, { method: body ? 'POST' : 'GET', headers: { Authorization: 'Bearer ' + cfg.key, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' }); }
    catch { const e = new Error('Brak połączenia z serwerem'); e.offline = true; throw e; }
    if (r.status === 401) throw new Error('Serwer odrzucił klucz (zły klucz)');
    if (!r.ok) throw new Error('Serwer: HTTP ' + r.status);
    return r.json();
  }

  async function meta() { const m = await kv.get('syncmeta', null); return m && m.base ? m : { cursor: 0, base: {}, dirtyAt: null }; }

  // zastosuj rekordy z serwera lokalnie; zwraca czy cokolwiek się zmieniło
  function applyRemote(m, records, ctx) {
    let changed = false;
    const by = {};
    for (const r of records) (by[r.c] ||= []).push(r);
    for (const c of Object.keys(by)) {
      const ad = adapters[c]; if (!ad) continue;
      const cur = new Map(ad.read()), base = (m.base[c] ||= {}), ups = [], dels = [];
      for (const r of by[c]) {
        const has = cur.has(r.id), lh = has ? hash(cur.get(r.id)) : null, b = base[r.id];
        const dirtyAt = ctx.dirtyAt || 0;
        const pushed = ctx.pushed[c + '\u0000' + r.id];
        const free = !has || (b && b.h === lh) || (pushed && pushed === lh) || (!b && ad.pristine && ad.pristine(r.id, cur.get(r.id))) || r.ts > dirtyAt;
        if (!free) continue;                       // lokalna zmiana nowsza niż ta z serwera: zostaje, pójdzie przy następnej wymianie
        if (r.del) { if (has) { dels.push(r.id); changed = true; } delete base[r.id]; }
        else { if (!has || lh !== hash(r.d)) { ups.push([r.id, r.d]); changed = true; } base[r.id] = { h: hash(r.d), ts: r.ts }; }
      }
      if (ups.length || dels.length) ad.apply(ups, dels);
    }
    return changed;
  }

  async function pull(cfg, m, ctx) {
    let any = false;
    for (let i = 0; i < 200; i++) {
      const res = await call(cfg, '/v1/sync', { since: m.cursor, changes: [] });
      if (applyRemote(m, res.records, ctx)) any = true;
      status.pulled += res.records.length; m.cursor = res.cursor; await kv.set('syncmeta', m);
      if (!res.more) break;
    }
    return any;
  }

  async function run() {
    if (frozen) return;                                  // ta karta straciła prawo do zapisu (aplikacja otwarta w innej karcie)
    if (busy) { again = true; return; }
    const cfg = await kv.get('sync', null); if (!cfg) { emit({ state: 'off' }); return; }
    busy = true; again = false; emit({ state: 'syncing', error: '', pushed: 0, pulled: 0 });
    let changed = false;
    try {
      const m = await meta(); const ctx = { dirtyAt: m.dirtyAt, pushed: {} };
      const startedDirty = m.dirtyAt; m.dirtyAt = null; await kv.set('syncmeta', m);
      try {
        // 1) najpierw pobierz cudze zmiany (mniej konfliktów)
        if (await pull(cfg, m, ctx)) changed = true;
        // 2) policz własne zmiany względem stanu z ostatniej wymiany
        const ts = startedDirty || now(); let out = [];
        for (let pass = 0; pass < 2; pass++) {
          out = []; const sus = [];
          for (const c of Object.keys(adapters)) {
            const cur = new Map(adapters[c].read()), base = (m.base[c] ||= {});
            const dels = Object.keys(base).filter(id => !cur.has(id));
            // ochrona: nagłe usunięcie większości kolekcji bez świadomej decyzji (przycisk „Usuń wszystkie”) to zwykle nieaktualny stan tego urządzenia, a nie wola użytkownika
            if (pass === 0 && !massOK && dels.length >= 20 && dels.length >= 0.5 * Object.keys(base).length) { sus.push([c, dels]); continue; }
            for (const [id, d] of cur) { const h = hash(d); if (!base[id] || base[id].h !== h) { out.push({ c, id, ts, d }); ctx.pushed[c + '\u0000' + id] = h; } }
            for (const id of dels) { out.push({ c, id, ts, del: true }); ctx.pushed[c + '\u0000' + id] = null; }
          }
          if (!sus.length) break;
          for (const [c, dels] of sus) for (const id of dels) delete m.base[c][id];
          m.cursor = 0; await kv.set('syncmeta', m); await pull(cfg, m, ctx); changed = true;   // odtwórz z serwera zamiast kasować tam
        }
        massOK = false;
        // 3) wyślij paczkami; odpowiedź zawiera też wersje, które wygrały z naszymi
        for (let i = 0; i < out.length; i += BATCH) {
          const res = await call(cfg, '/v1/sync', { since: m.cursor, changes: out.slice(i, i + BATCH) });
          if (applyRemote(m, res.records, ctx)) changed = true;
          m.cursor = res.cursor; status.pushed += Math.min(BATCH, out.length - i); await kv.set('syncmeta', m);
          let more = res.more;
          while (more) { const r2 = await call(cfg, '/v1/sync', { since: m.cursor, changes: [] }); if (applyRemote(m, r2.records, ctx)) changed = true; m.cursor = r2.cursor; await kv.set('syncmeta', m); more = r2.more; }
        }
        await kv.set('syncmeta', m);
      } catch (e) { const mm = await meta(); mm.dirtyAt = mm.dirtyAt || startedDirty || now(); await kv.set('syncmeta', mm); throw e; }
      emit({ state: 'ok', last: now(), error: '' });
    } catch (e) { emit({ state: e.offline ? 'offline' : 'error', error: e.message }); }
    finally { busy = false; }
    hooks.onRemote && hooks.onRemote(changed);
    if (again) schedule(500);
    return changed;
  }

  function schedule(ms = 2500) {
    const t = now();   // chwila edycji (a nie chwila, gdy dojdzie do wysyłki)
    kv.get('sync', null).then(cfg => {
      if (!cfg) return;
      meta().then(m => { if (!m.dirtyAt) { m.dirtyAt = t; kv.set('syncmeta', m); } });
      clearTimeout(timer); timer = setTimeout(run, ms);
    });
  }

  async function connect(url, key) {
    url = String(url || '').trim().replace(/\/+$/, ''); key = String(key || '').trim();
    if (!/^https?:\/\//.test(url) || !key) throw new Error('Wpisz adres serwera i klucz');
    const ping = await call({ url, key }, '/v1/ping');
    if (!ping || !ping.ok) throw new Error('To nie jest serwer synchronizacji');
    const old = await kv.get('sync', null);
    await kv.set('sync', { url, key });
    if (!old || old.url !== url) await kv.set('syncmeta', { cursor: 0, base: {}, dirtyAt: now() });
    return run();
  }
  async function disconnect() { clearTimeout(timer); clearInterval(poll); await kv.set('sync', null); await kv.set('syncmeta', null); emit({ state: 'off', error: '' }); }
  function start() {
    kv.get('sync', null).then(cfg => { if (cfg) { emit({ state: 'idle' }); run(); } });
    clearInterval(poll); poll = setInterval(() => { if (typeof document === 'undefined' || document.visibilityState === 'visible') run(); }, 60000);
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') run(); });
    if (typeof window !== 'undefined') window.addEventListener('online', () => run());
  }
  return { freeze: () => { frozen = true; clearTimeout(timer); clearInterval(poll); }, allowMassDelete: () => { massOK = true; }, run, schedule, connect, disconnect, start, status: () => ({ ...status }), config: () => kv.get('sync', null) };
}
