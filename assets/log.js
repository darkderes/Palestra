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
  const emptySet = () => ({ weight: '', reps: '', done: false });

  const UI = window.PalestraUI || null;
  const reducedMotion = () =>
    UI ? UI.reducedMotion()
      : window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const scrollBehavior = () => (reducedMotion() ? 'auto' : 'smooth');
  const toast = (msg) => { if (UI) UI.toast(msg); };

  // Chip "Guardado" en la cabecera del editor. Se llama tras cada persistencia
  // (blur de peso/reps, toggle ✓, agregar/borrar serie). Nodo estable: sobrevive
  // a los updates quirúrgicos porque vive fuera de .log-sets.
  let savedTimer = null;
  function flashSaved(ok) {
    const chip = view.querySelector('[data-saved]');
    if (!chip) return;
    chip.hidden = false;
    chip.textContent = ok === false ? 'No se pudo guardar' : 'Guardado';
    chip.classList.toggle('error', ok === false);
    chip.classList.add('show');
    clearTimeout(savedTimer);
    savedTimer = setTimeout(() => chip.classList.remove('show'), 1400);
    if (ok === false) toast('No se pudo guardar. Exportá tus datos por las dudas.');
  }

  const persist = () => {
    const ok = Store.save(Store.getData());
    flashSaved(ok);
    return ok;
  };

  function exName(id) {
    const ex = window.Palestra && window.Palestra.getExercise(id);
    return ex ? ex.name : id;
  }

  // ── Miniatura de ejercicio ───────────────────────────
  // .log-thumb: imagen fija + GIF que aparece al hover (GIF cargado
  // perezosamente en el primer hover, ver onThumbHover).
  //   opts.size        -> px (vía la custom prop --thumb; default 40 en CSS)
  //   opts.interactive -> true  => <button data-act="open-exercise"> (spots 1, 3, 4)
  //                       false => <span aria-hidden> inerte, el tap burbujea (spot 2)
  // Devuelve null si el ejercicio todavía no resolvió (dataset sin cargar):
  // render() se re-dispara en 'palestra:ready' y las miniaturas aparecen entonces.
  function exThumb(id, opts) {
    const o = opts || {};
    const ex = window.Palestra && window.Palestra.getExercise(id);
    if (!ex || !ex.image) return null;

    const img = el('img', {
      class: 'log-thumb-img', src: ex.image, alt: '',
      loading: 'lazy', decoding: 'async', width: 40, height: 40,
    });
    const gif = ex.gif_url
      ? el('img', { class: 'log-thumb-gif', 'data-src': ex.gif_url, alt: '', 'aria-hidden': 'true' })
      : null;
    const style = o.size ? `--thumb:${o.size}px` : null;

    if (o.interactive) {
      return el('button', {
        class: 'log-thumb', type: 'button', style,
        'data-act': 'open-exercise', 'data-ex': id,
        'aria-label': `Ver ${ex.name}`,
      }, [img, gif]);
    }
    return el('span', { class: 'log-thumb', 'aria-hidden': 'true', style }, [img, gif]);
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
    const doneAll = v.every((s) => s.done) ? ' ✓' : '';
    const same = v.every((s) => s.weight === v[0].weight && s.reps === v[0].reps);
    if (same) {
      return `${v.length}×${v[0].reps}${v[0].weight !== '' ? ` @ ${v[0].weight} kg` : ''}${doneAll}`;
    }
    return v.map((s) => `${s.weight !== '' ? s.weight : '–'}×${s.reps}`).join(', ') + doneAll;
  }

  function statLabel(st) {
    const n =
      st.done > 0 && st.done < st.count
        ? `${st.done}/${st.count} series`
        : st.count === 1
        ? '1 serie'
        : `${st.count} series`;
    return `${n} · ${st.vol} kg`;
  }

  function sessionVolume(s) {
    let vol = 0;
    let count = 0;
    let done = 0;
    (s.entries || []).forEach((e) =>
      (e.sets || []).forEach((set) => {
        if (set.weight !== '' && set.reps !== '') vol += Number(set.weight) * Number(set.reps);
        if (set.reps !== '') {
          count += 1;
          if (set.done) done += 1;
        }
      })
    );
    return { vol: Math.round(vol), count, done };
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
    if (node) node.scrollIntoView({ behavior: scrollBehavior(), block: 'center' });
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
    Store.pruneEmptySessions(activeSessionId);
    closePicker();
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
      el('span', { class: 'log-saved', 'data-saved': '1', hidden: true, 'aria-live': 'polite', role: 'status' }, ''),
    ]);

    const entries = (s.entries || []).map((entry, ei) => renderEntry(s, entry, ei));

    const foot = el('div', { class: 'log-entry-actions' }, [
      el('button', { class: 'log-btn', type: 'button', 'data-act': 'add-exercise', 'aria-expanded': 'false' }, '＋ ejercicio'),
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
      el('div', { class: 'log-entries', 'data-entries': '1' }, entries),
      foot,
      el('div', { 'data-picker-mount': '1' }),
    ]);
  }

  // Fila de serie. Extraída para reusar en los updates quirúrgicos (appendSetRow).
  function makeSetRow(set, ei, si) {
    return el('div', { class: 'log-set' + (set.done ? ' done' : '') }, [
      el('span', { class: 'log-set-num' }, si + 1),
      el('input', { type: 'number', inputmode: 'decimal', step: 'any', min: '0', enterkeyhint: 'next', value: set.weight, placeholder: 'kg', 'data-field': 'weight', 'data-ei': ei, 'data-si': si, 'aria-label': `Serie ${si + 1} peso` }),
      el('input', { type: 'number', inputmode: 'numeric', step: '1', min: '0', enterkeyhint: 'next', value: set.reps, placeholder: 'reps', 'data-field': 'reps', 'data-ei': ei, 'data-si': si, 'aria-label': `Serie ${si + 1} repeticiones` }),
      el('input', { type: 'checkbox', 'data-field': 'done', 'data-ei': ei, 'data-si': si, 'aria-label': `Serie ${si + 1} completada`, checked: set.done }),
      el('button', { class: 'log-icon-btn', type: 'button', 'data-act': 'del-set', 'data-ei': ei, 'data-si': si, 'aria-label': `Borrar serie ${si + 1}` }, '✕'),
    ]);
  }

  function renderEntry(s, entry, ei) {
    const last = Store.getLastEntry(entry.exerciseId, s.id);
    const lastLine = last
      ? el('div', { class: 'log-last' }, [
          'Última vez: ', el('b', null, fmtSets(last.sets)), ` · ${relDate(last.date)}`,
        ])
      : el('div', { class: 'log-last' }, 'Sin registros previos');

    const fav = Store.isFavorite(entry.exerciseId);
    const sets = (entry.sets || []).map((set, si) => makeSetRow(set, ei, si));

    return el('div', { class: 'log-entry', 'data-entry': entry.exerciseId, 'data-ei': ei }, [
      el('div', { class: 'log-entry-head' }, [
        exThumb(entry.exerciseId, { size: 40, interactive: true }),
        el('span', { class: 'log-entry-name' }, exName(entry.exerciseId)),
        el('button', {
          class: 'log-fav-btn' + (fav ? ' on' : ''), type: 'button', 'data-act': 'fav-entry',
          'data-ex': entry.exerciseId, 'aria-pressed': String(fav),
          'aria-label': fav ? 'Quitar de favoritos' : 'Marcar como favorito',
        }, fav ? '★' : '☆'),
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
        exThumb(it.exerciseId, { size: 32, interactive: true }),
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
      .filter((s) => s.id !== activeSessionId && Store.sessionHasData(s))
      .sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.id).localeCompare(String(a.id)));

    if (!sessions.length) {
      wrap.appendChild(el('div', { class: 'log-last', style: 'padding:4px 2px' }, 'Todavía no hay sesiones registradas.'));
      return wrap;
    }

    sessions.forEach((s) => {
      const st = sessionVolume(s);
      const body = el('div', { class: 'log-hist-body' }, [
        el('ul', null, (s.entries || []).map((e) =>
          el('li', { class: 'log-hist-ex', 'data-ex-id': e.exerciseId },
             `${exName(e.exerciseId)}: ${fmtSets(e.sets)}`))),
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

  // ── Updates quirúrgicos del editor ───────────────────
  // Evitan el render() completo (que borra el DOM y pierde el foco / cierra el
  // teclado en móvil) para las acciones del "hot path": agregar/borrar/repetir
  // serie. render() sigue siendo el default para todo lo estructural.
  function updateStats() {
    const s = curSession();
    if (!s) return;
    const st = sessionVolume(s);
    const node = view.querySelector('[data-stats]');
    if (node) node.textContent = statLabel(st);
  }

  function entryNode(ei) {
    return view.querySelector(`.log-entry[data-ei="${ei}"]`);
  }
  function setsContainer(ei) {
    const node = entryNode(ei);
    return node ? node.querySelector('.log-sets') : null;
  }
  // Reescribe números de serie y data-si tras un splice.
  function renumberSets(ei) {
    const cont = setsContainer(ei);
    if (!cont) return;
    [...cont.children].forEach((row, si) => {
      const numEl = row.querySelector('.log-set-num');
      if (numEl) numEl.textContent = si + 1;
      row.querySelectorAll('[data-si]').forEach((n) => n.setAttribute('data-si', si));
      row.querySelectorAll('[aria-label]').forEach((n) => {
        n.setAttribute('aria-label', n.getAttribute('aria-label').replace(/(serie )\d+/i, `$1${si + 1}`));
      });
    });
  }
  function focusSet(ei, si, field = 'weight') {
    const inp = view.querySelector(
      `.log-entry[data-ei="${ei}"] .log-set [data-field="${field}"][data-si="${si}"]`
    );
    if (inp) { inp.focus(); if (inp.select) inp.select(); }
  }
  // add-set / repeat-set: el caller ya pusheó la serie al modelo.
  function appendSetRow(ei) {
    const s = curSession();
    const cont = setsContainer(ei);
    if (!s || !s.entries[ei] || !cont) return render();
    const list = s.entries[ei].sets;
    const si = list.length - 1;
    cont.appendChild(makeSetRow(list[si], ei, si));
    updateStats();
    focusSet(ei, si, 'weight');
  }
  function removeSetRow(ei, si) {
    const s = curSession();
    const cont = setsContainer(ei);
    if (!s || !s.entries[ei] || !cont) return render();
    if (cont.children[si]) cont.children[si].remove();
    if (!s.entries[ei].sets.length) {
      s.entries[ei].sets.push(emptySet());
      cont.appendChild(makeSetRow(s.entries[ei].sets[0], ei, 0));
    }
    renumberSets(ei);
    updateStats();
  }
  // Nuevo ejercicio agregado desde el buscador inline: append sin teardown.
  function appendEntryNode(exerciseId) {
    const s = curSession();
    const entriesWrap = view.querySelector('[data-entries]');
    if (!s || !entriesWrap) return render();
    const ei = s.entries.length - 1; // el caller ya lo pusheó
    entriesWrap.appendChild(renderEntry(s, s.entries[ei], ei));
    updateStats();
    const node = entryNode(ei);
    if (node) node.scrollIntoView({ behavior: scrollBehavior(), block: 'nearest' });
  }

  // ── Buscador de ejercicios inline ────────────────────
  // Panel colapsable dentro del editor. Reemplaza el salto a la grilla de 1300
  // ejercicios. El link "catálogo completo" conserva ese camino como fallback.
  let pickerDebounce = null;

  function pickerMount() {
    return view.querySelector('[data-picker-mount]');
  }

  function closePicker() {
    const mount = pickerMount();
    if (mount) mount.textContent = '';
    const btn = view.querySelector('[data-act="add-exercise"]');
    if (btn) btn.setAttribute('aria-expanded', 'false');
    clearTimeout(pickerDebounce);
  }

  function openPicker() {
    const mount = pickerMount();
    if (!mount) return;
    if (mount.firstChild) { closePicker(); return; } // toggle
    const btn = view.querySelector('[data-act="add-exercise"]');
    if (btn) btn.setAttribute('aria-expanded', 'true');

    const input = el('input', {
      class: 'log-picker-search', type: 'search', enterkeyhint: 'search',
      placeholder: 'Buscar ejercicio…', 'aria-label': 'Buscar ejercicio',
      autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false',
    });
    const list = el('div', { class: 'log-picker-list', 'data-picker-list': '1' });
    const foot = el('button', {
      class: 'log-picker-catalog', type: 'button', 'data-act': 'picker-catalog',
    }, 'Buscar en el catálogo completo →');

    const panel = el('div', { class: 'log-picker' }, [input, list, foot]);
    mount.appendChild(panel);

    input.addEventListener('input', () => {
      clearTimeout(pickerDebounce);
      pickerDebounce = setTimeout(() => renderPickerResults(input.value), 120);
    });
    list.addEventListener('click', onPickerListClick);

    renderPickerResults('');
    if (!reducedMotion()) panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    input.focus();
  }

  function pickerItem(ex) {
    const fav = Store.isFavorite(ex.id);
    return el('div', { class: 'log-picker-row' }, [
      el('button', { class: 'log-picker-item', type: 'button', 'data-pick': ex.id }, [
        exThumb(ex.id, { size: 36, interactive: false }),
        el('span', { class: 'name' }, ex.name),
        ex.equipment ? el('span', { class: 'equip' }, ex.equipment) : null,
      ]),
      el('button', {
        class: 'log-picker-fav' + (fav ? ' on' : ''), type: 'button', 'data-fav': ex.id,
        'aria-pressed': String(fav),
        'aria-label': fav ? 'Quitar de favoritos' : 'Marcar como favorito',
      }, fav ? '★' : '☆'),
    ]);
  }

  function renderPickerResults(query) {
    const list = view.querySelector('[data-picker-list]');
    if (!list) return;
    const P = window.Palestra;
    const all = P && P.exercises ? P.exercises : [];
    const s = curSession();
    const have = new Set((s && s.entries || []).map((e) => e.exerciseId));
    const resolve = (id) => (P && P.getExercise(id)) || null;
    list.textContent = '';

    if (!all.length) {
      list.appendChild(el('div', { class: 'log-picker-empty' }, 'Cargando ejercicios…'));
      return;
    }

    const q = String(query || '').toLowerCase().trim();
    if (!q) {
      const favs = Store.favorites.map(resolve).filter((x) => x && !have.has(x.id));
      const recents = Store.recentExercises(8, [...have, ...favs.map((x) => x.id)])
        .map(resolve).filter(Boolean);
      if (favs.length) {
        list.appendChild(el('div', { class: 'log-picker-group' }, 'Favoritos'));
        favs.forEach((ex) => list.appendChild(pickerItem(ex)));
      }
      if (recents.length) {
        list.appendChild(el('div', { class: 'log-picker-group' }, 'Recientes'));
        recents.forEach((ex) => list.appendChild(pickerItem(ex)));
      }
      if (!favs.length && !recents.length) {
        list.appendChild(el('div', { class: 'log-picker-empty' }, 'Escribí para buscar un ejercicio.'));
      }
      return;
    }

    const hits = all
      .filter((ex) => !have.has(ex.id) && (ex._idx ? ex._idx.includes(q) : ex.name.toLowerCase().includes(q)))
      .slice(0, 20);
    if (!hits.length) {
      list.appendChild(el('div', { class: 'log-picker-empty' }, 'Sin resultados.'));
      return;
    }
    hits.forEach((ex) => list.appendChild(pickerItem(ex)));
  }

  function onPickerListClick(e) {
    const favBtn = e.target.closest('[data-fav]');
    if (favBtn) {
      const id = favBtn.getAttribute('data-fav');
      const now = Store.toggleFavorite(id);
      toast(now ? 'Agregado a favoritos' : 'Quitado de favoritos');
      const input = view.querySelector('.log-picker-search');
      renderPickerResults(input ? input.value : '');
      syncFavButtons(id);
      return;
    }
    const pickBtn = e.target.closest('[data-pick]');
    if (!pickBtn) return;
    const id = pickBtn.getAttribute('data-pick');
    const s = curSession();
    if (!s) return;
    if (!s.entries.some((x) => x.exerciseId === id)) {
      s.entries.push({ exerciseId: id, note: '', sets: [emptySet()] });
      persist();
      appendEntryNode(id);
    }
    const input = view.querySelector('.log-picker-search');
    if (input) { input.value = ''; input.focus(); }
    renderPickerResults('');
  }

  // Sincroniza el estado ★/☆ de un ejercicio en la cabecera del entry (si está montado).
  function syncFavButtons(id) {
    const fav = Store.isFavorite(id);
    view.querySelectorAll(`[data-act="fav-entry"][data-ex="${cssEscape(id)}"]`).forEach((b) => {
      b.classList.toggle('on', fav);
      b.textContent = fav ? '★' : '☆';
      b.setAttribute('aria-pressed', String(fav));
      b.setAttribute('aria-label', fav ? 'Quitar de favoritos' : 'Marcar como favorito');
    });
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
        .then(() => { activeSessionId = null; render(); toast('Datos importados'); })
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
        updateStats();
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

      case 'open-exercise':
        if (window.Palestra && window.Palestra.openExercise) {
          window.Palestra.openExercise(btn.getAttribute('data-ex'));
        }
        break;

      case 'export':
        Store.exportJSON();
        toast('Archivo exportado');
        break;

      case 'import':
        view.querySelector('[data-act="import-file"]').click();
        break;

      case 'add-exercise':
        openPicker();
        break;

      case 'picker-catalog':
        closePicker();
        pickExerciseFor((exId) => {
          const ss = curSession();
          if (ss && !ss.entries.some((x) => x.exerciseId === exId))
            ss.entries.push({ exerciseId: exId, note: '', sets: [emptySet()] });
        });
        break;

      case 'fav-entry': {
        const id = btn.getAttribute('data-ex');
        const now = Store.toggleFavorite(id);
        syncFavButtons(id);
        toast(now ? 'Agregado a favoritos' : 'Quitado de favoritos');
        break;
      }

      case 'add-set':
        if (s && s.entries[ei]) {
          const prev = s.entries[ei].sets[s.entries[ei].sets.length - 1];
          s.entries[ei].sets.push(
            prev ? { weight: prev.weight, reps: '', done: false } : emptySet()
          );
          persist();
          appendSetRow(ei);
        }
        break;

      case 'repeat-set':
        if (s && s.entries[ei]) {
          const list = s.entries[ei].sets;
          const prev = list[list.length - 1];
          list.push(prev ? { ...prev, done: false } : emptySet());
          persist();
          appendSetRow(ei);
        }
        break;

      case 'del-set': {
        const si = Number(btn.getAttribute('data-si'));
        if (s && s.entries[ei]) {
          s.entries[ei].sets.splice(si, 1);
          persist();
          removeSetRow(ei, si);
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
          toast('Sesión borrada');
        }
        break;
      }

      case 'edit-session':
        activeSessionId = btn.getAttribute('data-session');
        render();
        window.scrollTo({ top: 0, behavior: scrollBehavior() });
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
        window.scrollTo({ top: 0, behavior: scrollBehavior() });
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
          toast('Plantilla borrada');
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

  // Enter en peso → salta a reps. Enter en reps de la última serie → nueva serie
  // (copia el peso) sin cerrar el teclado. Enter en reps intermedia → serie siguiente.
  function onKeydown(e) {
    if (e.key !== 'Enter') return;
    const t = e.target;
    const field = t.getAttribute && t.getAttribute('data-field');
    if (field !== 'weight' && field !== 'reps') return;
    e.preventDefault();
    const ei = Number(t.getAttribute('data-ei'));
    const si = Number(t.getAttribute('data-si'));
    const s = curSession();
    if (!s || !s.entries[ei]) return;
    if (field === 'weight') { focusSet(ei, si, 'reps'); return; }
    const list = s.entries[ei].sets;
    if (si >= list.length - 1) {
      const prev = list[list.length - 1];
      list.push({ weight: prev ? prev.weight : '', reps: '', done: false });
      persist();
      appendSetRow(ei); // enfoca el peso de la nueva
    } else {
      focusSet(ei, si + 1, 'weight');
    }
  }

  // ── API pública ──────────────────────────────────────
  function renderModalLogSection(exerciseId) {
    if (!Store.isAvailable()) return null;
    const cur = curSession();
    const last = Store.getLastEntry(exerciseId, cur ? cur.id : null);
    const inToday =
      cur && cur.date === Store.todayISO() &&
      cur.entries.some((e) => e.exerciseId === exerciseId);
    const box = el('div', { class: 'modal-log' }, [
      last
        ? el('span', { class: 'modal-log-last' }, [
            'Última vez: ', el('b', null, fmtSets(last.sets)), ` · ${relDate(last.date)}`,
          ])
        : el('span', { class: 'modal-log-last' }, 'Sin registros previos'),
      el('button', { class: 'modal-log-btn', type: 'button' },
        inToday ? 'Ir al registro →' : '＋ Agregar a la sesión de hoy'),
    ]);
    box.querySelector('button').addEventListener('click', () => addToCurrentSession(exerciseId));
    return box;
  }

  function show() { view.classList.add('visible'); view.hidden = false; render(); }
  function hide() { view.classList.remove('visible'); view.hidden = true; }

  // Primer hover sobre una miniatura → carga el GIF (igual que las tarjetas del
  // catálogo, app.js). Respeta prefers-reduced-motion: sin GIF.
  function onThumbHover(e) {
    if (reducedMotion()) return;
    const thumb = e.target.closest('.log-thumb');
    if (!thumb) return;
    const gif = thumb.querySelector('.log-thumb-gif');
    if (gif && gif.dataset.src && !gif.src) gif.src = gif.dataset.src;
  }

  // Expandir una sesión del historial → inyecta las miniaturas una sola vez.
  // Evita pedir imágenes de sesiones colapsadas. 'toggle' no burbujea → captura.
  function onHistToggle(e) {
    const d = e.target.closest && e.target.closest('.log-hist-item');
    if (!d || !d.open || d.dataset.thumbs) return;
    d.dataset.thumbs = '1';
    d.querySelectorAll('.log-hist-ex[data-ex-id]').forEach((slot) => {
      const t = exThumb(slot.getAttribute('data-ex-id'), { size: 28, interactive: true });
      if (t) slot.prepend(t);
    });
  }

  view.addEventListener('click', onClick);
  view.addEventListener('change', onChange);
  view.addEventListener('keydown', onKeydown);
  view.addEventListener('mouseover', onThumbHover);
  view.addEventListener('toggle', onHistToggle, true);

  // Re-render cuando el dataset de ejercicios termina de cargar (para resolver
  // nombres en el historial montado antes del fetch).
  document.addEventListener('palestra:ready', () => {
    if (!view.hidden) render();
  });

  // Sesión de hoy = sesión activa al abrir.
  (function initActive() {
    Store.pruneEmptySessions(null);
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
