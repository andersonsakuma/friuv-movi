/*
 * Armazenamento local (IndexedDB) com reserva em memória quando o navegador
 * bloquear o banco. Dados ficam somente neste aparelho: use o backup em Ajustes.
 */
(function () {
  "use strict";
  const STORES = { kv: "k", lotes: "id", movs: "id", leituras: "t", eventos: "id" };

  class MemoryDB {
    constructor() {
      this.m = Object.fromEntries(Object.keys(STORES).map((s) => [s, new Map()]));
      this.persistent = false;
    }
    async all(s) {
      return [...this.m[s].values()];
    }
    async get(s, k) {
      return this.m[s].get(k);
    }
    async put(s, o) {
      this.m[s].set(o[STORES[s]], structuredClone(o));
    }
    async putMany(s, list) {
      for (const o of list) await this.put(s, o);
    }
    async del(s, k) {
      this.m[s].delete(k);
    }
    async range(s, from, to) {
      return [...this.m[s].values()].filter((o) => o.t >= from && o.t <= to).sort((a, b) => a.t - b.t);
    }
    async clear(s) {
      this.m[s].clear();
    }
    async deleteBefore(s, t) {
      for (const [k, o] of this.m[s]) if (o.t < t) this.m[s].delete(k);
    }
  }

  class IDB {
    constructor(db) {
      this.db = db;
      this.persistent = true;
    }
    static open(name) {
      return new Promise((resolve, reject) => {
        const req = indexedDB.open(name, 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          for (const [s, key] of Object.entries(STORES)) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: key });
        };
        req.onsuccess = () => resolve(new IDB(req.result));
        req.onerror = () => reject(req.error);
        req.onblocked = () => reject(new Error("Banco bloqueado"));
      });
    }
    _tx(s, mode, fn) {
      return new Promise((resolve, reject) => {
        const tx = this.db.transaction(s, mode);
        const st = tx.objectStore(s);
        let out;
        const r = fn(st);
        if (r && "onsuccess" in r) r.onsuccess = () => (out = r.result);
        tx.oncomplete = () => resolve(out);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    }
    all(s) {
      return this._tx(s, "readonly", (st) => st.getAll());
    }
    get(s, k) {
      return this._tx(s, "readonly", (st) => st.get(k));
    }
    put(s, o) {
      return this._tx(s, "readwrite", (st) => st.put(o));
    }
    putMany(s, list) {
      return this._tx(s, "readwrite", (st) => {
        for (const o of list) st.put(o);
      });
    }
    del(s, k) {
      return this._tx(s, "readwrite", (st) => st.delete(k));
    }
    range(s, from, to) {
      return this._tx(s, "readonly", (st) => st.getAll(IDBKeyRange.bound(from, to)));
    }
    clear(s) {
      return this._tx(s, "readwrite", (st) => st.clear());
    }
    deleteBefore(s, t) {
      return this._tx(s, "readwrite", (st) => st.delete(IDBKeyRange.upperBound(t, true)));
    }
  }

  async function openStore(name) {
    try {
      if (!("indexedDB" in window)) throw new Error("sem IndexedDB");
      return await IDB.open(name);
    } catch (e) {
      console.warn("Usando armazenamento em memória:", e);
      return new MemoryDB();
    }
  }

  window.ABStore = { openStore, STORES };
})();
