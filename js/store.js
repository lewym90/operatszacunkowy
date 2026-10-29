// Magazyn danych w telefonie (IndexedDB). Dane NIE opuszczają urządzenia ani nie trafiają do repozytorium.
const DB = 'am-wycena', ST = 'kv';
let dbp = null; const mem = new Map();
function open() {
  if (dbp) return dbp;
  dbp = new Promise((res, rej) => {
    try {
      const rq = indexedDB.open(DB, 1);
      rq.onupgradeneeded = () => rq.result.createObjectStore(ST);
      rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error);
    } catch (e) { rej(e); }
  });
  return dbp;
}
export async function get(key, def = null) {
  try {
    const db = await open();
    return await new Promise((res, rej) => { const r = db.transaction(ST).objectStore(ST).get(key); r.onsuccess = () => res(r.result === undefined ? def : r.result); r.onerror = () => rej(r.error); });
  } catch { return mem.has(key) ? mem.get(key) : def; }
}
export async function set(key, val) {
  mem.set(key, val);
  try {
    const db = await open();
    await new Promise((res, rej) => { const tx = db.transaction(ST, 'readwrite'); tx.objectStore(ST).put(val, key); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
  } catch { /* tryb prywatny: dane zostają w pamięci do zamknięcia karty */ }
}
export async function del(key) { mem.delete(key); try { const db = await open(); await new Promise(r => { const tx = db.transaction(ST, 'readwrite'); tx.objectStore(ST).delete(key); tx.oncomplete = r; tx.onerror = r; }); } catch { } }
