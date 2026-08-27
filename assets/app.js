  // Exercise data is loaded at runtime from data/exercises.min.json — see boot().

  // ── State ──────────────────────────────────────────
  const state = {
    exercises: [],
    filtered: [],
    search: '',
    filters: {
      category: new Set(),
      equipment: new Set(),
      target: new Set(),
    },
    page: 0,
    pageSize: 60,
    top3: false,
    logOpen: false,
  };

  // Equipment items to show initially (rest behind "show more")
  const EQUIP_INITIAL = 10;

  // ── Top 3 por músculo objetivo ─────────────────────
  // Selección orientativa a partir de la literatura de electromiografía (EMG)
  // y biomecánica: se priorizan ejercicios compuestos, con carga libre y rango
  // completo de movimiento. Los IDs corresponden a data/exercises.json.
  const TOP3 = [
    { target: 'pectorals',           ids: ['0025', '0047', '0251'] },
    { target: 'lats',                ids: ['0652', '2330', '0027'] },
    { target: 'upper back',          ids: ['0027', '0180', '1351'] },
    { target: 'delts',               ids: ['0091', '0334', '0383'] },
    { target: 'traps',               ids: ['0095', '0406', '0548'] },
    { target: 'biceps',              ids: ['0031', '0318', '0070'] },
    { target: 'triceps',             ids: ['1755', '0060', '0200'] },
    { target: 'forearms',            ids: ['0126', '0082', '0364'] },
    { target: 'quads',               ids: ['2287', '1760', '0585'],
      note: 'En el dataset la sentadilla con barra y la prensa con barra están etiquetadas como «glúteos»; aquí solo aparecen los ejercicios marcados como cuádriceps.' },
    { target: 'hamstrings',          ids: ['0586', '0116', '3193'] },
    { target: 'glutes',              ids: ['0043', '0085', '1409'],
      note: 'La sentadilla profunda y el peso muerto rumano también cargan de forma intensa cuádriceps e isquiotibiales.' },
    { target: 'calves',              ids: ['1372', '0594', '0284'] },
    { target: 'abs',                 ids: ['0472', '0832', '0084'] },
    { target: 'spine',               ids: ['0489', '0835', '0573'],
      note: 'El dataset etiqueta los "buenos días" y el peso muerto como isquiotibiales/glúteos; aquí se listan las extensiones lumbares disponibles.' },
    { target: 'adductors',           ids: ['0168', '0598', '1775'],
      note: 'Datos limitados en el dataset para este músculo.' },
    { target: 'abductors',           ids: ['0597', '3006', '0710'],
      note: 'Datos limitados en el dataset para este músculo.' },
    { target: 'serratus anterior',   ids: ['0050', '3011', '3021'],
      note: 'Datos limitados en el dataset para este músculo.' },
    { target: 'levator scapulae',    ids: ['1403', '0716'],
      note: 'El dataset solo incluye estiramientos para este músculo.' },
    { target: 'cardiovascular system', ids: ['1160', '2612', '0685'],
      note: 'Ranking por demanda cardiorrespiratoria, no por activación muscular (EMG).' },
  ];

  // ── DOM Refs ───────────────────────────────────────
  const gridEl        = document.getElementById('exercise-grid');
  const sentinelEl    = document.getElementById('load-sentinel');
  const spinnerEl     = document.getElementById('load-spinner');
  const countEl       = document.getElementById('results-count');
  const activeFilEl   = document.getElementById('active-filters');
  const searchEl      = document.getElementById('search');
  const searchClearEl = document.getElementById('search-clear');
  const modalOverlay  = document.getElementById('modal-overlay');
  const modalTitle    = document.getElementById('modal-title');
  const modalGif      = document.getElementById('modal-gif');
  const modalMeta     = document.getElementById('modal-meta');
  const modalMuscles  = document.getElementById('modal-muscles');
  const modalInstr    = document.getElementById('modal-instructions');
  const modalClose    = document.getElementById('modal-close');
  const themeToggleEl = document.getElementById('theme-toggle');
  const filtersToggleEl      = document.getElementById('filters-toggle');
  const filtersToggleCountEl = document.getElementById('filters-toggle-count');
  const filtersWrapEl        = document.getElementById('filters-wrap');
  const top3ToggleEl         = document.getElementById('top3-toggle');
  const top3ViewEl           = document.getElementById('top3-view');
  const logToggleEl          = document.getElementById('log-toggle');
  const logViewEl            = document.getElementById('log-view');
  const pickCancelEl         = document.getElementById('pick-cancel');
  const appShellEl           = document.querySelector('.app-shell');
  const modalPanelEl         = document.getElementById('modal-panel');
  let   lastFocusedEl        = null;
  let   pickCallback         = null;   // registro: modo "elegir ejercicio"

  // ── Utility ────────────────────────────────────────
  function debounce(fn, ms) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }

  function capitalize(str) {
    return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
  }

  function uniqueSorted(arr) {
    return [...new Set(arr)].sort();
  }

  // ── ES translations for data values (display only; filter keys stay English) ──
  const ES = {
    // category / body_part
    'back': 'espalda', 'cardio': 'cardio', 'chest': 'pecho', 'lower arms': 'antebrazos',
    'lower legs': 'pantorrillas', 'neck': 'cuello', 'shoulders': 'hombros',
    'upper arms': 'brazos', 'upper legs': 'piernas', 'waist': 'abdomen',
    // equipment
    'assisted': 'asistido', 'band': 'banda', 'barbell': 'barra', 'body weight': 'peso corporal',
    'bosu ball': 'bosu', 'cable': 'polea', 'dumbbell': 'mancuerna',
    'elliptical machine': 'elíptica', 'ez barbell': 'barra z', 'hammer': 'martillo',
    'kettlebell': 'pesa rusa', 'leverage machine': 'máquina de palanca',
    'medicine ball': 'balón medicinal', 'olympic barbell': 'barra olímpica',
    'resistance band': 'banda de resistencia', 'roller': 'rodillo', 'rope': 'cuerda',
    'skierg machine': 'máquina skierg', 'sled machine': 'trineo', 'smith machine': 'máquina smith',
    'stability ball': 'fitball', 'stationary bike': 'bicicleta estática',
    'stepmill machine': 'escaladora', 'tire': 'neumático', 'trap bar': 'barra hexagonal',
    'upper body ergometer': 'ergómetro de brazos', 'weighted': 'con peso',
    'wheel roller': 'rueda abdominal',
    // target / muscles
    'abductors': 'abductores', 'abs': 'abdominales', 'adductors': 'aductores',
    'biceps': 'bíceps', 'calves': 'pantorrillas', 'cardiovascular system': 'sistema cardiovascular',
    'delts': 'deltoides', 'forearms': 'antebrazos', 'glutes': 'glúteos',
    'hamstrings': 'isquiotibiales', 'lats': 'dorsales', 'levator scapulae': 'elevador de la escápula',
    'pectorals': 'pectorales', 'quads': 'cuádriceps', 'serratus anterior': 'serrato anterior',
    'spine': 'columna', 'traps': 'trapecios', 'triceps': 'tríceps', 'upper back': 'espalda alta',
    'abdominals': 'abdominales', 'ankle stabilizers': 'estabilizadores del tobillo',
    'ankles': 'tobillos', 'core': 'core', 'deltoids': 'deltoides', 'hands': 'manos',
    'hip flexors': 'flexores de cadera', 'latissimus dorsi': 'dorsal ancho',
    'lower back': 'zona lumbar', 'obliques': 'oblicuos', 'quadriceps': 'cuádriceps',
    'rhomboids': 'romboides', 'rotator cuff': 'manguito rotador', 'soleus': 'sóleo',
    'trapezius': 'trapecio', 'wrist extensors': 'extensores de muñeca',
    'wrist flexors': 'flexores de muñeca', 'wrists': 'muñecas',
    'brachialis': 'braquial', 'feet': 'pies', 'grip muscles': 'músculos de agarre',
    'groin': 'ingle', 'inner thighs': 'cara interna del muslo', 'lower abs': 'abdomen bajo',
    'rear deltoids': 'deltoides posteriores', 'shins': 'espinillas',
    'sternocleidomastoid': 'esternocleidomastoideo', 'upper chest': 'pecho superior',
  };
  function tr(v) {
    if (v == null) return '';
    return ES[String(v).toLowerCase()] ?? v;
  }

  // ── Data Loading ───────────────────────────────────
  const DATA_URL = 'data/exercises.min.json';

  function init(data) {
    state.exercises = data;

    // Pre-compute search index per exercise
    state.exercises.forEach(ex => {
      ex._idx = `${ex.name} ${ex.category} ${ex.target} ${ex.equipment} ${ex.muscle_group} ${tr(ex.category)} ${tr(ex.target)} ${tr(ex.equipment)} ${tr(ex.muscle_group)}`.toLowerCase();
    });

    buildFilterOptions();
    readURL();
    applyFilters();

    document.dispatchEvent(new CustomEvent('palestra:ready'));

    if (location.hash === '#top3') setTop3(true);
    else if (location.hash === '#log') setLog(true);
  }

  // ── URL State (filters + search in ?query, view mode in #hash) ──
  const URL_KEYS = ['category', 'equipment', 'target'];

  function readURL() {
    const p = new URLSearchParams(location.search);
    state.search = p.get('q') || '';
    searchEl.value = state.search;
    searchClearEl.classList.toggle('visible', state.search.length > 0);
    URL_KEYS.forEach(k => {
      // Only accept values that actually exist in the dataset. Prevents junk
      // filters and blocks untrusted strings from the query string reaching
      // the DOM (see updateActiveBadges).
      const valid = new Set(state.exercises.map(e => e[k]));
      state.filters[k] = new Set(
        (p.get(k) || '').split(',').filter(v => valid.has(v))
      );
    });
    document.querySelectorAll('.chip[data-filter]').forEach(c => {
      if (c.classList.contains('filter-show-more')) return;
      c.classList.toggle('active', !!state.filters[c.dataset.filter]?.has(c.dataset.value));
    });
  }

  function syncURL() {
    const p = new URLSearchParams();
    if (state.search) p.set('q', state.search);
    URL_KEYS.forEach(k => {
      if (state.filters[k].size) p.set(k, [...state.filters[k]].join(','));
    });
    const qs = p.toString();
    const hash = state.top3 ? '#top3' : state.logOpen ? '#log' : '';
    const url = location.pathname + (qs ? '?' + qs : '') + hash;
    history.replaceState(null, '', url);
  }

  function loadData() {
    renderSkeletons(24);
    countEl.textContent = 'Cargando ejercicios…';

    fetch(DATA_URL)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(init)
      .catch(err => {
        console.error('No se pudo cargar el dataset:', err);
        countEl.textContent = '';
        gridEl.innerHTML = '';
        const box = document.createElement('div');
        box.className = 'empty-state';
        box.setAttribute('role', 'alert');
        box.innerHTML =
          '<p>⚠️</p><p>No se pudieron cargar los ejercicios.</p>'
          + '<p style="font-size:12px;margin-top:4px">'
          + 'Esta página necesita servirse por HTTP (GitHub Pages o un servidor local); '
          + 'no funciona abriendo el archivo directamente.</p>';
        const retry = document.createElement('button');
        retry.className = 'top3-toggle';
        retry.style.marginTop = '14px';
        retry.textContent = 'Reintentar';
        retry.addEventListener('click', loadData);
        box.appendChild(retry);
        gridEl.appendChild(box);
      });
  }

  // ── Build Filter Chips ─────────────────────────────
  function buildFilterOptions() {
    const cats   = uniqueSorted(state.exercises.map(e => e.category));
    const equips = uniqueSorted(state.exercises.map(e => e.equipment));
    const targets = uniqueSorted(state.exercises.map(e => e.target));

    renderChips('category-chips',  cats,   'category');
    renderChips('equipment-chips', equips, 'equipment');
    renderChips('target-chips',    targets,'target');
  }

  function renderChips(containerId, values, filterKey, initialLimit = null) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';

    const toShow = initialLimit ? values.slice(0, initialLimit) : values;
    const rest   = initialLimit ? values.slice(initialLimit) : [];

    toShow.forEach(val => {
      container.appendChild(makeChip(val, filterKey));
    });

    if (rest.length > 0) {
      // Hidden chips
      const hiddenWrap = document.createElement('div');
      hiddenWrap.style.cssText = 'display:none;flex-wrap:wrap;gap:8px;width:100%;';
      rest.forEach(val => hiddenWrap.appendChild(makeChip(val, filterKey)));
      container.appendChild(hiddenWrap);

      // Show more button
      const moreBtn = document.createElement('button');
      moreBtn.className = 'chip filter-show-more';
      moreBtn.textContent = `+${rest.length} más`;
      moreBtn.addEventListener('click', () => {
        hiddenWrap.style.display = 'flex';
        moreBtn.remove();
      });
      container.appendChild(moreBtn);
    }
  }

  function makeChip(value, filterKey) {
    const btn = document.createElement('button');
    btn.className = 'chip';
    btn.textContent = tr(value);
    btn.dataset.filter = filterKey;
    btn.dataset.value  = value;
    return btn;
  }

  // ── Filter Logic ───────────────────────────────────
  function toggleFilter(key, value) {
    const set = state.filters[key];
    if (set.has(value)) set.delete(value);
    else set.add(value);
  }

  function applyFilters() {
    if (state.top3) setTop3(false, false);
    if (state.logOpen && !pickCallback) setLog(false, false);
    const q = state.search.toLowerCase().trim();
    const { category, equipment, target } = state.filters;

    state.filtered = state.exercises.filter(ex => {
      if (q && !ex._idx.includes(q)) return false;
      if (category.size  && !category.has(ex.category))   return false;
      if (equipment.size && !equipment.has(ex.equipment))  return false;
      if (target.size    && !target.has(ex.target))        return false;
      return true;
    });

    state.page = 0;
    renderGrid();
    updateResultsBar();
    updateActiveBadges();
    updateFiltersToggleCount();
    syncURL();
  }

  function updateFiltersToggleCount() {
    const { category, equipment, target } = state.filters;
    const n = category.size + equipment.size + target.size;
    filtersToggleCountEl.textContent = n;
    filtersToggleCountEl.hidden = n === 0;
  }

  // ── Rendering ──────────────────────────────────────
  function renderGrid() {
    gridEl.innerHTML = '';
    const slice = state.filtered.slice(0, state.pageSize);

    if (slice.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.setAttribute('role', 'status');
      empty.innerHTML = '<p>🔍</p><p>No se encontraron ejercicios</p>';
      gridEl.appendChild(empty);
      spinnerEl.classList.remove('visible');
      return;
    }

    const frag = document.createDocumentFragment();
    slice.forEach(ex => frag.appendChild(createCard(ex)));
    gridEl.appendChild(frag);

    const hasMore = state.filtered.length > state.pageSize;
    spinnerEl.classList.toggle('visible', hasMore);
  }

  function appendNextPage() {
    state.page++;
    const start = state.page * state.pageSize;
    const end   = start + state.pageSize;
    const slice = state.filtered.slice(start, end);
    if (slice.length === 0) return;

    const frag = document.createDocumentFragment();
    slice.forEach(ex => frag.appendChild(createCard(ex)));
    gridEl.appendChild(frag);

    const hasMore = end < state.filtered.length;
    spinnerEl.classList.toggle('visible', hasMore);
  }

  function createCard(ex) {
    const article = document.createElement('article');
    article.className = 'exercise-card';
    article.dataset.id = ex.id;
    article.tabIndex = 0;
    article.setAttribute('role', 'button');
    article.setAttribute('aria-label',
      pickCallback ? `${ex.name} — agregar a la sesión` : `${ex.name} — ver detalles`);

    // Media
    const media = document.createElement('div');
    media.className = 'card-media';

    const thumb = document.createElement('img');
    thumb.className = 'card-thumb';
    thumb.src = ex.image;
    thumb.alt = ex.name;
    thumb.loading = 'lazy';

    const gif = document.createElement('img');
    gif.className = 'card-gif';
    gif.dataset.src = ex.gif_url;
    gif.alt = '';

    media.appendChild(thumb);
    media.appendChild(gif);

    // Body
    const body = document.createElement('div');
    body.className = 'card-body';

    const name = document.createElement('h3');
    name.className = 'card-name';
    name.textContent = ex.name;

    const tags = document.createElement('div');
    tags.className = 'card-tags';

    const catTag = document.createElement('span');
    catTag.className = 'tag tag-cat';
    catTag.textContent = tr(ex.category);

    const equipTag = document.createElement('span');
    equipTag.className = 'tag tag-equip';
    equipTag.textContent = tr(ex.equipment);

    tags.appendChild(catTag);
    tags.appendChild(equipTag);
    body.appendChild(name);
    body.appendChild(tags);
    article.appendChild(media);
    article.appendChild(body);

    return article;
  }

  function renderSkeletons(count) {
    gridEl.innerHTML = '';
    const frag = document.createDocumentFragment();
    for (let i = 0; i < count; i++) {
      const card = document.createElement('div');
      card.className = 'skeleton-card';
      card.innerHTML = `
        <div class="skeleton-media"></div>
        <div class="skeleton-body">
          <div class="skeleton-line"></div>
          <div class="skeleton-line short"></div>
        </div>`;
      frag.appendChild(card);
    }
    gridEl.appendChild(frag);
  }

  // ── Top 3 View ─────────────────────────────────────
  const MEDALS = ['🥇', '🥈', '🥉'];
  let _exById = null;
  function exById(id) {
    if (!_exById) _exById = new Map(state.exercises.map(e => [e.id, e]));
    return _exById.get(id);
  }

  function renderTop3() {
    top3ViewEl.innerHTML = '';

    const intro = document.createElement('p');
    intro.className = 'top3-intro';
    intro.textContent = 'Selección orientativa basada en la literatura de electromiografía (EMG) y '
      + 'biomecánica: se priorizan ejercicios compuestos, con carga libre y rango completo de '
      + 'movimiento. No sustituye la individualización del entrenamiento. Al usar un filtro '
      + 'o la búsqueda volverás a la lista completa.';
    top3ViewEl.appendChild(intro);

    const frag = document.createDocumentFragment();

    TOP3.forEach(({ target, ids, note }) => {
      const exs = ids.map(exById).filter(Boolean);
      if (exs.length === 0) return;

      const section = document.createElement('section');
      section.className = 'top3-section';

      const head = document.createElement('div');
      head.className = 'top3-section-head';
      const headTitle = document.createElement('span');
      headTitle.className = 'top3-section-title';
      headTitle.textContent = tr(target);
      const headSub = document.createElement('span');
      headSub.className = 'top3-section-sub';
      headSub.textContent = target;
      head.append(headTitle, headSub);
      section.appendChild(head);

      if (note) {
        const noteEl = document.createElement('p');
        noteEl.className = 'top3-section-note';
        noteEl.textContent = note;
        section.appendChild(noteEl);
      }

      const row = document.createElement('div');
      row.className = 'top3-row';
      exs.forEach((ex, i) => {
        const item = document.createElement('div');
        item.className = 'top3-item';
        const card = createCard(ex);
        const badge = document.createElement('span');
        badge.className = 'medal-badge';
        badge.textContent = `${MEDALS[i] || ''} ${i + 1}º`;
        card.querySelector('.card-media').appendChild(badge);
        item.appendChild(card);
        row.appendChild(item);
      });
      section.appendChild(row);
      frag.appendChild(section);
    });

    top3ViewEl.appendChild(frag);
  }

  function setTop3(on, sync = true) {
    if (on && state.logOpen) setLog(false, false);
    state.top3 = on;
    top3ToggleEl.classList.toggle('active', on);
    top3ToggleEl.setAttribute('aria-pressed', String(on));
    top3ViewEl.classList.toggle('visible', on);
    updateViewVisibility();
    if (on) {
      if (!top3ViewEl.hasChildNodes()) renderTop3();
      window.scrollTo({ top: 0 });
    }
    if (sync) syncURL();
  }

  // ── Vista "Mis entrenamientos" (assets/log.js) ─────
  function updateViewVisibility() {
    const hideGrid = state.top3 || state.logOpen;
    gridEl.style.display     = hideGrid ? 'none' : '';
    sentinelEl.style.display = hideGrid ? 'none' : '';
  }

  function setLog(on, sync = true) {
    if (on && state.top3) setTop3(false, false);
    state.logOpen = on;
    logToggleEl.classList.toggle('active', on);
    logToggleEl.setAttribute('aria-pressed', String(on));
    logViewEl.hidden = !on;
    updateViewVisibility();
    if (window.PalestraLog) on ? window.PalestraLog.show() : window.PalestraLog.hide();
    if (on) window.scrollTo({ top: 0 });
    if (sync) syncURL();
  }

  // Modo "elegir ejercicio": la grilla se usa como selector; un clic en una
  // tarjeta llama a cb(id) en vez de abrir el modal. cb = null desactiva.
  let pickReturnToLog = false;
  function setPickMode(cb) {
    const active = !!cb;
    pickCancelEl.hidden = !active;
    if (active) {
      pickReturnToLog = state.logOpen;
      pickCallback = cb;
      setLog(false, false);
      setTop3(false, false);
      countEl.textContent = 'Elegí un ejercicio para agregarlo a la sesión…';
      renderGrid();
    } else {
      pickCallback = null;
      updateResultsBar();
      renderGrid();
      if (pickReturnToLog) setLog(true, false);
      pickReturnToLog = false;
    }
  }

  // ── Results Bar ────────────────────────────────────
  function updateResultsBar() {
    const total = state.filtered.length;
    const all   = state.exercises.length;
    countEl.textContent = total === all
      ? `${all.toLocaleString()} ejercicios`
      : `${total.toLocaleString()} de ${all.toLocaleString()} ejercicios`;
  }

  function updateActiveBadges() {
    activeFilEl.innerHTML = '';
    const { category, equipment, target } = state.filters;
    let hasAny = false;

    const addBadges = (set, key) => {
      set.forEach(val => {
        hasAny = true;
        const badge = document.createElement('span');
        badge.className = 'active-badge';
        badge.textContent = tr(val);

        const rm = document.createElement('button');
        rm.className = 'active-badge-remove';
        rm.dataset.filter = key;
        rm.dataset.value = val;
        rm.setAttribute('aria-label', `Quitar ${tr(val)}`);
        rm.textContent = '×';

        badge.appendChild(rm);
        activeFilEl.appendChild(badge);
      });
    };

    addBadges(category,  'category');
    addBadges(equipment, 'equipment');
    addBadges(target,    'target');

    if (hasAny) {
      const clearAll = document.createElement('button');
      clearAll.className = 'clear-all';
      clearAll.textContent = 'Limpiar todo';
      clearAll.addEventListener('click', clearAllFilters);
      activeFilEl.appendChild(clearAll);
    }
  }

  function clearAllFilters() {
    state.filters.category.clear();
    state.filters.equipment.clear();
    state.filters.target.clear();
    state.search = '';
    searchEl.value = '';
    searchClearEl.classList.remove('visible');

    // Deactivate all chips
    document.querySelectorAll('.chip.active').forEach(c => c.classList.remove('active'));
    applyFilters();
  }

  // ── Modal ──────────────────────────────────────────
  function openModal(id) {
    const ex = state.exercises.find(e => e.id === id);
    if (!ex) return;

    modalTitle.textContent = ex.name;
    modalGif.src = ex.gif_url;
    modalGif.alt = ex.name;

    // Meta chips
    modalMeta.innerHTML = '';
    const metaItems = [
      { label: 'Zona del cuerpo', value: ex.body_part || ex.category },
      { label: 'Equipamiento',    value: ex.equipment },
      { label: 'Músculo objetivo', value: ex.target },
    ];
    metaItems.forEach(({ label, value }) => {
      const chip = document.createElement('div');
      chip.className = 'meta-chip';
      const lbl = document.createElement('span');
      lbl.className = 'meta-chip-label';
      lbl.textContent = label;
      const val = document.createElement('span');
      val.className = 'meta-chip-value';
      val.textContent = tr(value);
      chip.append(lbl, val);
      modalMeta.appendChild(chip);
    });

    // Registro: "última vez" + botón para registrar (assets/log.js)
    if (window.PalestraLog) {
      const logSection = window.PalestraLog.renderModalLogSection(ex.id);
      if (logSection) modalMeta.appendChild(logSection);
    }

    // Muscles
    modalMuscles.innerHTML = '';
    const primaryMuscles = ex.target ? [ex.target] : [];
    const secondaryRaw = ex.secondary_muscles || (ex.muscle_group ? [ex.muscle_group] : []);
    const secondaryMuscles = secondaryRaw.filter(m => m !== ex.target);

    const musclesHeader = document.createElement('div');
    musclesHeader.className = 'modal-muscles-label';
    musclesHeader.textContent = 'Músculos';
    modalMuscles.appendChild(musclesHeader);

    const musclesGrid = document.createElement('div');
    musclesGrid.className = 'muscles-grid';

    const makeMuscleGroup = (title, names, isPrimary) => {
      const group = document.createElement('div');
      group.className = 'muscles-group';
      const lbl = document.createElement('div');
      lbl.className = 'muscles-group-label';
      lbl.textContent = title;
      const row = document.createElement('div');
      row.className = 'muscle-tags';
      names.forEach(name => {
        const t = document.createElement('span');
        t.className = 'muscle-tag' + (isPrimary ? ' primary' : '');
        t.textContent = tr(name);
        row.appendChild(t);
      });
      group.appendChild(lbl);
      group.appendChild(row);
      return group;
    };

    if (primaryMuscles.length > 0)   musclesGrid.appendChild(makeMuscleGroup('Principal', primaryMuscles, true));
    if (secondaryMuscles.length > 0)  musclesGrid.appendChild(makeMuscleGroup('Secundario', secondaryMuscles, false));
    if (primaryMuscles.length > 0 || secondaryMuscles.length > 0) modalMuscles.appendChild(musclesGrid);

    // Instructions — Spanish only
    modalInstr.innerHTML = '';
    const steps = ex.instruction_steps?.es ?? [];

    if (steps.length > 0) {
      const instrLabel = document.createElement('span');
      instrLabel.className = 'modal-instructions-label';
      instrLabel.textContent = 'Instrucciones';
      modalInstr.appendChild(instrLabel);

      const list = document.createElement('ol');
      list.className = 'instructions-list';
      steps.forEach((step, i) => {
        const li = document.createElement('li');
        li.className = 'instruction-step';
        const num = document.createElement('span');
        num.className = 'step-num';
        num.textContent = i + 1;
        const text = document.createElement('span');
        text.className = 'step-text';
        text.textContent = step;
        li.append(num, text);
        list.appendChild(li);
      });
      modalInstr.appendChild(list);
    }

    lastFocusedEl = document.activeElement;
    modalOverlay.classList.add('open');
    document.body.style.overflow = 'hidden';
    if (appShellEl) appShellEl.inert = true;
    modalClose.focus();
  }

  function closeModal() {
    if (!modalOverlay.classList.contains('open')) return;
    modalOverlay.classList.remove('open');
    document.body.style.overflow = '';
    modalGif.src = '';
    if (appShellEl) appShellEl.inert = false;
    if (lastFocusedEl && document.contains(lastFocusedEl)) lastFocusedEl.focus();
    lastFocusedEl = null;
  }

  // Keep Tab focus inside the open modal
  function trapModalFocus(e) {
    if (e.key !== 'Tab' || !modalOverlay.classList.contains('open')) return;
    const items = modalPanelEl.querySelectorAll(
      'a[href], button:not([disabled]), input, [tabindex]:not([tabindex="-1"])'
    );
    if (!items.length) { e.preventDefault(); return; }
    const first = items[0];
    const last = items[items.length - 1];
    if (!modalPanelEl.contains(document.activeElement)) {
      e.preventDefault(); first.focus();
    } else if (e.shiftKey && document.activeElement === first) {
      e.preventDefault(); last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault(); first.focus();
    }
  }

  // ── Theme ──────────────────────────────────────────
  function currentTheme() {
    const attr = document.documentElement.getAttribute('data-theme');
    if (attr === 'dark' || attr === 'light') return attr;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  // Activar una tarjeta: en modo selección la agrega a la sesión; si no, abre el modal.
  function activateCard(id) {
    if (pickCallback) {
      const cb = pickCallback;
      setPickMode(null);
      cb(id);
    } else {
      openModal(id);
    }
  }

  // Keyboard activation for exercise cards (role="button")
  function onCardKeydown(e) {
    if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
    const card = e.target.closest('.exercise-card');
    if (!card) return;
    e.preventDefault();
    activateCard(card.dataset.id);
  }

  // ── Events ─────────────────────────────────────────
  function wireEvents() {
    // Theme toggle
    themeToggleEl.addEventListener('click', () => {
      const next = currentTheme() === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      try { localStorage.setItem('palestra-theme', next); } catch (e) {}
    });

    // Top 3 por músculo toggle
    top3ToggleEl.addEventListener('click', () => setTop3(!state.top3));

    // Mis entrenamientos (registro) toggle
    logToggleEl.addEventListener('click', () => setLog(!state.logOpen));
    pickCancelEl.addEventListener('click', () => setPickMode(null));

    // Top 3 view: card hover → load GIF, card click → modal
    top3ViewEl.addEventListener('mouseover', e => {
      const card = e.target.closest('.exercise-card');
      if (!card) return;
      const gif = card.querySelector('.card-gif');
      if (gif && gif.dataset.src && !gif.src) gif.src = gif.dataset.src;
    });
    top3ViewEl.addEventListener('click', e => {
      const card = e.target.closest('.exercise-card');
      if (card) activateCard(card.dataset.id);
    });

    // Filters collapse (mobile)
    filtersToggleEl.addEventListener('click', () => {
      const open = filtersWrapEl.classList.toggle('open');
      filtersToggleEl.setAttribute('aria-expanded', String(open));
    });

    // Search
    searchEl.addEventListener('input', debounce(() => {
      state.search = searchEl.value;
      searchClearEl.classList.toggle('visible', state.search.length > 0);
      applyFilters();
    }, 250));

    searchClearEl.addEventListener('click', () => {
      searchEl.value = '';
      state.search = '';
      searchClearEl.classList.remove('visible');
      applyFilters();
    });

    // Filter chips (delegated)
    document.querySelector('.sidebar-body').addEventListener('click', e => {
      const chip = e.target.closest('[data-filter]');
      if (!chip || chip.classList.contains('filter-show-more')) return;
      const { filter, value } = chip.dataset;
      toggleFilter(filter, value);
      chip.classList.toggle('active');
      applyFilters();
    });

    // Remove active badge
    activeFilEl.addEventListener('click', e => {
      const btn = e.target.closest('.active-badge-remove');
      if (!btn) return;
      const { filter, value } = btn.dataset;
      state.filters[filter].delete(value);
      // Deactivate corresponding chip
      const chip = document.querySelector(`.chip[data-filter="${filter}"][data-value="${value}"]`);
      if (chip) chip.classList.remove('active');
      applyFilters();
    });

    // Card hover → load GIF
    gridEl.addEventListener('mouseover', e => {
      const card = e.target.closest('.exercise-card');
      if (!card) return;
      const gif = card.querySelector('.card-gif');
      if (gif && gif.dataset.src && !gif.src) {
        gif.src = gif.dataset.src;
      }
    });

    // Card activate → modal / selección (click + keyboard)
    gridEl.addEventListener('click', e => {
      const card = e.target.closest('.exercise-card');
      if (card) activateCard(card.dataset.id);
    });
    gridEl.addEventListener('keydown', onCardKeydown);
    top3ViewEl.addEventListener('keydown', onCardKeydown);

    // Modal close
    modalClose.addEventListener('click', closeModal);
    modalOverlay.addEventListener('click', e => {
      if (e.target === modalOverlay) closeModal();
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        if (pickCallback) { setPickMode(null); return; }
        closeModal();
      } else {
        trapModalFocus(e);
      }
    });

    // Infinite scroll
    const observer = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && spinnerEl.classList.contains('visible')) {
        appendNextPage();
      }
    }, { rootMargin: '200px' });
    observer.observe(sentinelEl);
  }


  // API mínima para assets/log.js (evita colisión de nombres de nivel superior)
  window.Palestra = {
    getExercise: exById,
    get exercises() { return state.exercises; },
    openExercise: openModal,
    closeModal,
    setPickMode,
    showLog: (on = true) => setLog(on),
    isLogOpen: () => state.logOpen,
  };

  // ── Boot ───────────────────────────────────────────
  wireEvents();
  loadData();

  // Service worker — soporte offline / PWA (no rompe si falla)
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(err =>
        console.warn('Service worker no registrado:', err));
    });
  }

  // Back/forward and manual hash edits — filters/search live in ?query, view in #hash
  window.addEventListener('popstate', () => {
    if (!state.exercises.length) return;
    if (location.hash === '#top3') setTop3(true, false);
    else if (location.hash === '#log') setLog(true, false);
    else { readURL(); applyFilters(); }
  });
  window.addEventListener('hashchange', () => {
    if (!state.exercises.length) return;
    if (location.hash === '#top3') setTop3(true, false);
    else if (location.hash === '#log') setLog(true, false);
    else if (state.top3 || state.logOpen) applyFilters();
  });

