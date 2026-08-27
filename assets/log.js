/* Palestra · registro de entrenamientos — UI.
 *
 * Vista "Mis entrenamientos": sesiones con series (peso/reps), plantillas
 * reutilizables e historial. Persiste vía window.PalestraStore. Resuelve
 * ejercicios vía window.Palestra (definido en app.js). Solo local.
 *
 * Expone window.PalestraLog.
 */
(() => {
  'use strict';

  const Store = window.PalestraStore;
  const view = document.getElementById('log-view');
  if (!view || !Store) return;

  let activeSessionId = null;
  let editingTemplateId = null;

  // ── Helpers ──────────────────────────────────────────
  function el(tag, attrs, kids) {
    const n = document.createElement(tag);
    if (attrs) {
      for (const k in attrs) {
        const v = attrs[k];
        if (v == null || v === false) continue;
        if (k === 'class') n.className = v;
        else if (k === 'text') n.textContent = v;
        else if (v === true) n.setAttribute(k, '');
        else n.setAttribute(k, v);
      }
    }
    (Array.isArray(kids) ? kids : kids != null ? [kids] : []).forEach((c) => {
      if (c == null || c === false) return;
      n.appendChild(typeof c === 'string' || typeof c === 'number'
        ? document.createTextNode(String(c))
        : c);
    });
    return n;
  }

  const data = () => Store.getData();
  const persist = () => Store.save(Store.getData());
  const emptySet = () => ({ weight: '', reps: '', done: false });

  function exName(id) {
    const ex = window.Palestra && window.Palestra.getExercise(id);
    return ex ? ex.name : id;
  }

  function curSession() {
    return data().sessions.find((s) => s.id === activeSessionId) || null;
  }

  function num(v) {
    return v === '' || v == null ? '' : Number(v);
  }

  function relDate(iso) {
    const then = new Date(iso + 'T00:00:00');
    const days = Math.round((Date.now() - then.getTime()) / 86400000);
    if (isNaN(days)) return iso;
    if (days <= 0) return 'hoy';
    if (days === 1) return 'ayer';
    if (days < 21) return `hace ${days} días`;
    if (days < 60) return `hace ${Math.round(days / 7)} semanas`;
    return `hace ${Math.round(days / 30)} meses`;
  }

  function fmtSets(sets) {
    const v = (sets || []).filter((s) => s.reps !== '' && s.reps != null);
    if (!v.length) return '—';
    const same = v.every((s) => s.weight === v[0].weight && s.reps === v[0].reps);
    if (same) {
      return `${v.length}×${v[0].reps}${v[0].weight !== '' ? ` @ ${v[0].weight} kg` : ''}`;
    }
    return v.map((s) => `${s.weight !== '' ? s.weight : '–'}×${s.reps}`).join(', ');
  }

  function statLabel(st) {
    const n = st.count === 1 ? '1 serie' : `${st.count} series`;
    return `${n} · ${st.vol} kg`;
  }

  function sessionVolume(s) {
    let vol = 0;
    let count = 0;
    (s.entries || []).forEach((e) =>
      (e.sets || []).forEach((set) => {
        if (set.weight !== '' && set.reps !== '') vol += Number(set.weight) * Number(set.reps);
        if (set.reps !== '') count += 1;
      })
    );
    return { vol: Math.round(vol), count };
  }

  // ── Acciones de dominio ──────────────────────────────
  function startSession(template) {
    const s = {
      id: Store.uid(),
      date: Store.todayISO(),
      name: template ? template.name : '',
      note: '',
      entries: [],
    };
    if (template) {
      s.templateId = template.id;
      s.entries = (template.items || []).map((it) => ({
        exerciseId: it.exerciseId,
        note: '',
        sets: Array.from({ length: Math.max(1, Number(it.targetSets) || 1) }, emptySet),
      }));
    }
    data().sessions.push(s);
    persist();
    activeSessionId = s.id;
    render();
  }

  function addToCurrentSession(exerciseId) {
    let s = curSession();
    if (!s) {
      s = { id: Store.uid(), date: Store.todayISO(), name: '', note: '', entries: [] };
      data().sessions.push(s);
      activeSessionId = s.id;
    }
    if (!s.entries.some((e) => e.exerciseId === exerciseId)) {
      s.entries.push({ exerciseId, note: '', sets: [emptySet()] });
    }
    persist();
    if (window.Palestra && window.Palestra.closeModal) window.Palestra.closeModal();
    if (window.Palestra && window.Palestra.showLog) window.Palestra.showLog(true);
    render();
    const node = view.querySelector(`[data-entry="${cssEscape(exerciseId)}"]`);
    if (node) node.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function cssEscape(s) {
    return window.CSS && CSS.escape ? CSS.escape(s) : String(s).replace(/"/g, '\\"');
  }

  function pickExerciseFor(onPick) {
    if (!window.Palestra || !window.Palestra.setPickMode) return;
    window.Palestra.setPickMode((exerciseId) => {
      onPick(exerciseId);
      persist();
      if (window.Palestra.showLog) window.Palestra.showLog(true);
      render();
    });
  }

  // ── Render ───────────────────────────────────────────
  function render() {
    view.textContent = '';
    view.appendChild(renderHeader());

    if (!Store.isAvailable()) {
      view.appendChild(
        el('div', { class: 'log-empty' },
          'El almacenamiento local no está disponible en este navegador (modo privado o ' +
          'bloqueado). El registro de entrenamientos no puede guardarse.')
      );
      return;
    }

    if (editingTemplateId) view.appendChild(renderTemplateEditor());

    const s = curSession();
    if (s) view.appendChild(renderEditor(s));
    else
      view.appendChild(
        el('div', { class: 'log-empty' },
          'No hay ninguna sesión abierta. Creá una con «＋ Nueva sesión» o desde una plantilla.')
      );

    view.appendChild(renderTemplates());
    view.appendChild(renderHistory());
  }

  function renderHeader() {
    const tpls = data().templates;
    const select = el('select', { class: 'log-select', 'data-act': 'new-from-template', 'aria-label': 'Nueva sesión desde plantilla' }, [
      el('option', { value: '' }, 'Desde plantilla…'),
      ...tpls.map((t) => el('option', { value: t.id }, t.name || 'Sin nombre')),
    ]);

    return el('div', { class: 'log-header' }, [
      el('h2', null, 'Mis entrenamientos'),
      el('div', { class: 'log-actions' }, [
        el('button', { class: 'log-btn primary', type: 'button', 'data-act': 'new-session' }, '＋ Nueva sesión'),
        tpls.length ? select : null,
        el('button', { class: 'log-btn', type: 'button', 'data-act': 'export' }, 'Exportar'),
        el('button', { class: 'log-btn', type: 'button', 'data-act': 'import' }, 'Importar'),
        el('input', { type: 'file', accept: 'application/json,.json', hidden: true, 'data-act': 'import-file' }),
      ]),
    ]);
  }

  function setHead() {
    return el('div', { class: 'log-set-head' }, [
      el('span', null, '#'),
      el('span', null, 'Peso'),
      el('span', null, 'Reps'),
      el('span', null, '✓'),
      el('span', null, ''),
    ]);
  }

  function renderEditor(s) {
    const stats = sessionVolume(s);
    const head = el('div', { class: 'log-editor-head' }, [
      el('input', {
        class: 'log-input title', type: 'text', value: s.name || '',
        placeholder: 'Nombre de la sesión (opcional)', 'data-field': 'session-name',
        'aria-label': 'Nombre de la sesión',
      }),
      el('span', { class: 'log-date' }, s.date),
      el('span', { class: 'log-editor-stats', 'data-stats': '1' }, statLabel(stats)),
    ]);

    const entries = (s.entries || []).map((entry, ei) => renderEntry(s, entry, ei));

    const foot = el('div', { class: 'log-entry-actions' }, [
      el('button', { class: 'log-btn', type: 'button', 'data-act': 'add-exercise' }, '＋ ejercicio'),
      el('button', { class: 'log-btn', type: 'button', 'data-act': 'finish-session' }, 'Finalizar'),
      el('button', { class: 'log-btn danger', type: 'button', 'data-act': 'del-session', 'data-session': s.id }, 'Borrar sesión'),
    ]);

    return el('div', { class: 'log-editor' }, [
      head,
      el('input', {
        class: 'log-input note', type: 'text', value: s.note || '',
        placeholder: 'Notas de la sesión…', 'data-field': 'session-note',
        'aria-label': 'Notas de la sesión',
      }),
      ...entries,
      foot,
    ]);
  }

  function renderEntry(s, entry, ei) {
    const last = Store.getLastEntry(entry.exerciseId, s.id);
    const lastLine = last
      ? el('div', { class: 'log-last' }, [
          'Última vez: ', el('b', null, fmtSets(last.sets)), ` · ${relDate(last.date)}`,
        ])
      : el('div', { class: 'log-last' }, 'Sin registros previos');

    const sets = (entry.sets || []).map((set, si) => {
      const row = el('div', { class: 'log-set' + (set.done ? ' done' : '') }, [
        el('span', { class: 'log-set-num' }, si + 1),
        el('input', { type: 'number', inputmode: 'decimal', step: 'any', min: '0', value: set.weight, placeholder: 'kg', 'data-field': 'weight', 'data-ei': ei, 'data-si': si, 'aria-label': `Serie ${si + 1} peso` }),
        el('input', { type: 'number', inputmode: 'numeric', step: '1', min: '0', value: set.reps, placeholder: 'reps', 'data-field': 'reps', 'data-ei': ei, 'data-si': si, 'aria-label': `Serie ${si + 1} repeticiones` }),
        el('input', { type: 'checkbox', 'data-field': 'done', 'data-ei': ei, 'data-si': si, 'aria-label': `Serie ${si + 1} completada`, checked: set.done }),
        el('button', { class: 'log-icon-btn', type: 'button', 'data-act': 'del-set', 'data-ei': ei, 'data-si': si, 'aria-label': `Borrar serie ${si + 1}` }, '✕'),
      ]);
      return row;
    });

    return el('div', { class: 'log-entry', 'data-entry': entry.exerciseId }, [
      el('div', { class: 'log-entry-head' }, [
        el('span', { class: 'log-entry-name' }, exName(entry.exerciseId)),
        el('button', { class: 'log-icon-btn', type: 'button', 'data-act': 'del-entry', 'data-ei': ei, 'aria-label': 'Quitar ejercicio' }, '✕'),
      ]),
      lastLine,
      setHead(),
      el('div', { class: 'log-sets' }, sets),
      el('div', { class: 'log-entry-actions' }, [
        el('button', { class: 'log-btn small', type: 'button', 'data-act': 'add-set', 'data-ei': ei }, '＋ serie'),
        el('button', { class: 'log-btn small', type: 'button', 'data-act': 'repeat-set', 'data-ei': ei }, 'Repetir última'),
      ]),
    ]);
  }

  function renderTemplates() {
    const wrap = el('div', { class: 'log-templates' }, [
      el('div', { class: 'log-section-title' }, 'Plantillas / rutinas'),
    ]);
    data().templates.forEach((t) => {
      wrap.appendChild(
        el('div', { class: 'log-tpl' }, [
          el('span', { class: 'log-tpl-name' }, t.name || 'Sin nombre'),
          el('span', { class: 'log-tpl-meta' }, `${(t.items || []).length} ejercicios`),
          el('div', { class: 'log-tpl-actions' }, [
            el('button', { class: 'log-btn small primary', type: 'button', 'data-act': 'session-from-template', 'data-template': t.id }, 'Nueva sesión'),
            el('button', { class: 'log-btn small', type: 'button', 'data-act': 'edit-template', 'data-template': t.id }, 'Editar'),
            el('button', { class: 'log-btn small danger', type: 'button', 'data-act': 'del-template', 'data-template': t.id }, 'Borrar'),
          ]),
        ])
      );
    });
    wrap.appendChild(
      el('button', { class: 'log-btn', type: 'button', 'data-act': 'new-template' }, '＋ Nueva plantilla')
    );
    return wrap;
  }

  function renderTemplateEditor() {
    const t = data().templates.find((x) => x.id === editingTemplateId);
    if (!t) { editingTemplateId = null; return el('div'); }

    const items = (t.items || []).map((it, ii) =>
      el('div', { class: 'log-tpl-item', 'data-ii': ii }, [
        el('span', { class: 'name' }, exName(it.exerciseId)),
        el('input', { type: 'number', min: '1', step: '1', value: it.targetSets || '', placeholder: 'series', 'data-field': 'tpl-sets', 'data-ii': ii, 'aria-label': 'Series objetivo' }),
        el('input', { type: 'text', value: it.targetReps || '', placeholder: 'reps', 'data-field': 'tpl-reps', 'data-ii': ii, 'aria-label': 'Repeticiones objetivo' }),
        el('button', { class: 'log-icon-btn', type: 'button', 'data-act': 'del-template-item', 'data-ii': ii, 'aria-label': 'Quitar ejercicio' }, '✕'),
      ])
    );

    return el('div', { class: 'log-tpl-editor' }, [
      el('div', { class: 'log-section-title' }, 'Editar plantilla'),
      el('input', { class: 'log-input title', type: 'text', value: t.name || '', placeholder: 'Nombre de la plantilla', 'data-field': 'tpl-name', 'aria-label': 'Nombre de la plantilla' }),
      el('div', { style: 'margin:10px 0' }, items),
      el('div', { class: 'log-tpl-actions', style: 'margin-left:0' }, [
        el('button', { class: 'log-btn small', type: 'button', 'data-act': 'add-template-exercise' }, '＋ ejercicio'),
        el('button', { class: 'log-btn small primary', type: 'button', 'data-act': 'close-template' }, 'Listo'),
      ]),
    ]);
  }

  function renderHistory() {
    const wrap = el('div', { class: 'log-history' }, [
      el('div', { class: 'log-section-title' }, 'Historial'),
    ]);
    const sessions = data().sessions
      .filter((s) => s.id !== activeSessionId)
      .sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.id).localeCompare(String(a.id)));

    if (!sessions.length) {
      wrap.appendChild(el('div', { class: 'log-last', style: 'padding:4px 2px' }, 'Todavía no hay sesiones registradas.'));
      return wrap;
    }

    sessions.forEach((s) => {
      const st = sessionVolume(s);
      const body = el('div', { class: 'log-hist-body' }, [
        el('ul', null, (s.entries || []).map((e) =>
          el('li', null, `${exName(e.exerciseId)}: ${fmtSets(e.sets)}`))),
        s.note ? el('div', null, s.note) : null,
        el('div', { class: 'log-tpl-actions', style: 'margin-left:0' }, [
          el('button', { class: 'log-btn small', type: 'button', 'data-act': 'edit-session', 'data-session': s.id }, 'Editar'),
          el('button', { class: 'log-btn small danger', type: 'button', 'data-act': 'del-session', 'data-session': s.id }, 'Borrar'),
        ]),
      ]);
      wrap.appendChild(
        el('details', { class: 'log-hist-item' }, [
          el('summary', null, [
            el('span', { class: 'log-hist-date' }, s.date),
            el('span', null, s.name || 'Sesión'),
            el('span', { class: 'log-hist-sub' }, statLabel(st)),
          ]),
          body,
        ])
      );
    });
    return wrap;
  }

  // ── Eventos ──────────────────────────────────────────
  function updateStats() {
    const s = curSession();
    if (!s) return;
    const st = sessionVolume(s);
    const node = view.querySelector('[data-stats]');
    if (node) node.textContent = statLabel(st);
  }

  function onChange(e) {
    const t = e.target;
    const act = t.getAttribute('data-act');

    if (act === 'new-from-template') {
      const tpl = data().templates.find((x) => x.id === t.value);
      t.value = '';
      if (tpl) startSession(tpl);
      return;
    }

    if (act === 'import-file') {
      const file = t.files && t.files[0];
      if (!file) return;
      const merge = window.confirm(
        'Aceptar = combinar con tus datos actuales.\nCancelar = reemplazar todo por el archivo.'
      );
      Store.importJSON(file, merge ? 'merge' : 'replace')
        .then(() => { activeSessionId = null; render(); })
        .catch((err) => window.alert('No se pudo importar: ' + err.message));
      t.value = '';
      return;
    }

    const field = t.getAttribute('data-field');
    if (!field) return;
    const s = curSession();

    if (field === 'session-name' && s) { s.name = t.value; persist(); return; }
    if (field === 'session-note' && s) { s.note = t.value; persist(); return; }

    if ((field === 'weight' || field === 'reps' || field === 'done') && s) {
      const ei = Number(t.getAttribute('data-ei'));
      const si = Number(t.getAttribute('data-si'));
      const set = s.entries[ei] && s.entries[ei].sets[si];
      if (!set) return;
      if (field === 'done') {
        set.done = t.checked;
        const row = t.closest('.log-set');
        if (row) row.classList.toggle('done', t.checked);
      } else {
        set[field] = num(t.value);
        updateStats();
      }
      persist();
      return;
    }

    if (field === 'tpl-name') {
      const t2 = data().templates.find((x) => x.id === editingTemplateId);
      if (t2) { t2.name = t.value; persist(); }
      return;
    }
    if (field === 'tpl-sets' || field === 'tpl-reps') {
      const t2 = data().templates.find((x) => x.id === editingTemplateId);
      const ii = Number(t.getAttribute('data-ii'));
      if (t2 && t2.items[ii]) {
        t2.items[ii][field === 'tpl-sets' ? 'targetSets' : 'targetReps'] =
          field === 'tpl-sets' ? num(t.value) : t.value;
        persist();
      }
      return;
    }
  }

  function onClick(e) {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.getAttribute('data-act');
    const s = curSession();
    const ei = btn.hasAttribute('data-ei') ? Number(btn.getAttribute('data-ei')) : null;

    switch (act) {
      case 'new-session':
        startSession(null);
        break;

      case 'export':
        Store.exportJSON();
        break;

      case 'import':
        view.querySelector('[data-act="import-file"]').click();
        break;

      case 'add-exercise':
        pickExerciseFor((exId) => {
          const ss = curSession();
          if (ss && !ss.entries.some((x) => x.exerciseId === exId))
            ss.entries.push({ exerciseId: exId, note: '', sets: [emptySet()] });
        });
        break;

      case 'add-set':
        if (s && s.entries[ei]) {
          const prev = s.entries[ei].sets[s.entries[ei].sets.length - 1];
          s.entries[ei].sets.push(
            prev ? { weight: prev.weight, reps: '', done: false } : emptySet()
          );
          persist();
          render();
        }
        break;

      case 'repeat-set':
        if (s && s.entries[ei]) {
          const list = s.entries[ei].sets;
          const prev = list[list.length - 1];
          list.push(prev ? { ...prev, done: false } : emptySet());
          persist();
          render();
        }
        break;

      case 'del-set': {
        const si = Number(btn.getAttribute('data-si'));
        if (s && s.entries[ei]) {
          s.entries[ei].sets.splice(si, 1);
          if (!s.entries[ei].sets.length) s.entries[ei].sets.push(emptySet());
          persist();
          render();
        }
        break;
      }

      case 'del-entry':
        if (s && s.entries[ei] && window.confirm('¿Quitar este ejercicio de la sesión?')) {
          s.entries.splice(ei, 1);
          persist();
          render();
        }
        break;

      case 'finish-session':
        activeSessionId = null;
        render();
        break;

      case 'del-session': {
        const id = btn.getAttribute('data-session');
        if (window.confirm('¿Borrar esta sesión definitivamente?')) {
          const d = data();
          d.sessions = d.sessions.filter((x) => x.id !== id);
          if (activeSessionId === id) activeSessionId = null;
          persist();
          render();
        }
        break;
      }

      case 'edit-session':
        activeSessionId = btn.getAttribute('data-session');
        render();
        window.scrollTo({ top: 0, behavior: 'smooth' });
        break;

      case 'new-template': {
        const t = { id: Store.uid(), name: '', items: [] };
        data().templates.push(t);
        persist();
        editingTemplateId = t.id;
        render();
        break;
      }

      case 'edit-template':
        editingTemplateId = btn.getAttribute('data-template');
        render();
        window.scrollTo({ top: 0, behavior: 'smooth' });
        break;

      case 'close-template':
        editingTemplateId = null;
        render();
        break;

      case 'del-template': {
        const id = btn.getAttribute('data-template');
        if (window.confirm('¿Borrar esta plantilla?')) {
          const d = data();
          d.templates = d.templates.filter((x) => x.id !== id);
          if (editingTemplateId === id) editingTemplateId = null;
          persist();
          render();
        }
        break;
      }

      case 'session-from-template': {
        const tpl = data().templates.find((x) => x.id === btn.getAttribute('data-template'));
        if (tpl) startSession(tpl);
        break;
      }

      case 'add-template-exercise':
        pickExerciseFor((exId) => {
          const t = data().templates.find((x) => x.id === editingTemplateId);
          if (t && !t.items.some((i) => i.exerciseId === exId))
            t.items.push({ exerciseId: exId, targetSets: 3, targetReps: '' });
        });
        break;

      case 'del-template-item': {
        const ii = Number(btn.getAttribute('data-ii'));
        const t = data().templates.find((x) => x.id === editingTemplateId);
        if (t && t.items[ii]) {
          t.items.splice(ii, 1);
          persist();
          render();
        }
        break;
      }
    }
  }

  // ── API pública ──────────────────────────────────────
  function renderModalLogSection(exerciseId) {
    if (!Store.isAvailable()) return null;
    const cur = curSession();
    const last = Store.getLastEntry(exerciseId, cur ? cur.id : null);
    const box = el('div', { class: 'modal-log' }, [
      last
        ? el('span', { class: 'modal-log-last' }, [
            'Última vez: ', el('b', null, fmtSets(last.sets)), ` · ${relDate(last.date)}`,
          ])
        : el('span', { class: 'modal-log-last' }, 'Sin registros previos'),
      el('button', { class: 'modal-log-btn', type: 'button' }, '＋ Registrar serie'),
    ]);
    box.querySelector('button').addEventListener('click', () => addToCurrentSession(exerciseId));
    return box;
  }

  function show() { view.classList.add('visible'); view.hidden = false; render(); }
  function hide() { view.classList.remove('visible'); view.hidden = true; }

  view.addEventListener('click', onClick);
  view.addEventListener('change', onChange);

  // Re-render cuando el dataset de ejercicios termina de cargar (para resolver
  // nombres en el historial montado antes del fetch).
  document.addEventListener('palestra:ready', () => {
    if (!view.hidden) render();
  });

  // Sesión de hoy = sesión activa al abrir.
  (function initActive() {
    const today = Store.todayISO();
    const todays = data().sessions.filter((s) => s.date === today);
    if (todays.length) activeSessionId = todays[todays.length - 1].id;
  })();

  window.PalestraLog = {
    show,
    hide,
    render,
    renderModalLogSection,
    addToCurrentSession,
  };
})();
