/* Palestra · registro de entrenamientos — capa de persistencia (localStorage)
 *
 * Todo se guarda en una sola clave JSON. Sin backend, sin red. El backup es
 * responsabilidad del usuario vía exportJSON() / importJSON().
 *
 * Expone window.PalestraStore.
 */
(() => {
  'use strict';

  const STORAGE_KEY = 'palestra-log-v1';
  const SCHEMA_VERSION = 1;
  const SIZE_WARN_BYTES = 2 * 1024 * 1024; // ~2 MB — avisar, no bloquear

  function emptyData() {
    return { version: SCHEMA_VERSION, sessions: [], templates: [] };
  }

  // ── Migraciones ──────────────────────────────────────
  // migrate(raw) recibe lo que había en disco y devuelve datos en el esquema
  // actual. Hoy solo existe v1; futuras versiones ramifican por raw.version.
  function migrate(raw) {
    if (!raw || typeof raw !== 'object') return emptyData();
    const data = { ...emptyData(), ...raw };
    data.sessions = Array.isArray(raw.sessions) ? raw.sessions : [];
    data.templates = Array.isArray(raw.templates) ? raw.templates : [];
    data.version = SCHEMA_VERSION;
    return data;
  }

  // ── Estado en memoria ────────────────────────────────
  let cache = null;
  let available = true;

  function isAvailable() {
    return available;
  }

  function load() {
    if (cache) return cache;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      cache = migrate(raw ? JSON.parse(raw) : null);
    } catch (e) {
      console.warn('PalestraStore: localStorage no disponible o corrupto:', e);
      available = false;
      cache = emptyData();
    }
    return cache;
  }

  function getData() {
    return load();
  }

  function save(data) {
    cache = data || cache;
    if (!available) return false;
    try {
      const json = JSON.stringify(cache);
      if (json.length > SIZE_WARN_BYTES) {
        console.warn(
          'PalestraStore: el registro supera ~2 MB. Conviene exportar y limpiar sesiones viejas.'
        );
      }
      localStorage.setItem(STORAGE_KEY, json);
      return true;
    } catch (e) {
      console.error('PalestraStore: no se pudo guardar:', e);
      available = false;
      return false;
    }
  }

  // ── Helpers de dominio ───────────────────────────────
  function uid() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }

  function todayISO() {
    return new Date().toISOString().slice(0, 10); // AAAA-MM-DD
  }

  // Última serie registrada de un ejercicio en cualquier sesión anterior.
  // Devuelve { date, sets, sessionId, note } o null. Lo usan el modal de
  // detalle y el editor de sesión para mostrar "la vez pasada".
  function getLastEntry(exerciseId, excludeSessionId = null) {
    const d = load();
    const sessions = [...d.sessions]
      .filter((s) => s.id !== excludeSessionId)
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));
    for (const s of sessions) {
      const entry = (s.entries || []).find(
        (e) => e.exerciseId === exerciseId && (e.sets || []).some((set) => set.reps || set.weight)
      );
      if (entry) {
        return { date: s.date, sets: entry.sets, sessionId: s.id, note: entry.note || '' };
      }
    }
    return null;
  }

  // ── Export / Import ──────────────────────────────────
  function exportJSON() {
    const json = JSON.stringify(load(), null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `palestra-entrenamientos-${todayISO()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function validShape(obj) {
    if (!obj || typeof obj !== 'object') return false;
    if (!Array.isArray(obj.sessions) || !Array.isArray(obj.templates)) return false;
    const okSession = (s) =>
      s && typeof s === 'object' && Array.isArray(s.entries) &&
      s.entries.every((e) => e && typeof e === 'object' && Array.isArray(e.sets));
    const okTemplate = (t) =>
      t && typeof t === 'object' && Array.isArray(t.items);
    return obj.sessions.every(okSession) && obj.templates.every(okTemplate);
  }

  // importJSON(file, mode) — mode: 'replace' | 'merge'
  // 'merge' añade sesiones/plantillas cuyo id no exista todavía.
  function importJSON(file, mode = 'replace') {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('No se pudo leer el archivo.'));
      reader.onload = () => {
        let parsed;
        try {
          parsed = JSON.parse(String(reader.result));
        } catch (e) {
          reject(new Error('El archivo no es JSON válido.'));
          return;
        }
        const incoming = migrate(parsed);
        if (!validShape(incoming)) {
          reject(new Error('El archivo no tiene el formato esperado.'));
          return;
        }
        if (mode === 'merge') {
          const cur = load();
          const haveS = new Set(cur.sessions.map((s) => s.id));
          const haveT = new Set(cur.templates.map((t) => t.id));
          incoming.sessions.forEach((s) => {
            if (!haveS.has(s.id)) cur.sessions.push(s);
          });
          incoming.templates.forEach((t) => {
            if (!haveT.has(t.id)) cur.templates.push(t);
          });
          save(cur);
        } else {
          cache = incoming;
          save(cache);
        }
        resolve(load());
      };
      reader.readAsText(file);
    });
  }

  window.PalestraStore = {
    STORAGE_KEY,
    isAvailable,
    load,
    getData,
    save,
    migrate,
    uid,
    todayISO,
    getLastEntry,
    exportJSON,
    importJSON,
  };
})();
