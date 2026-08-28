/* Palestra · helpers de UI compartidos (sin dependencias).
 *
 * Expone window.PalestraUI:
 *   - toast(msg)       breve aviso abajo-centro, anunciado a lectores de pantalla
 *   - reducedMotion()  true si el usuario pidió menos movimiento
 */
(() => {
  'use strict';

  let region = null;

  function ensureRegion() {
    if (region && document.body.contains(region)) return region;
    region = document.createElement('div');
    region.className = 'toast-region';
    region.setAttribute('role', 'status');
    region.setAttribute('aria-live', 'polite');
    region.setAttribute('aria-atomic', 'true');
    document.body.appendChild(region);
    return region;
  }

  function reducedMotion() {
    return !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function toast(msg) {
    if (!msg) return;
    const host = ensureRegion();
    const node = document.createElement('div');
    node.className = 'toast';
    node.textContent = String(msg);
    host.appendChild(node);

    const rm = reducedMotion();
    if (rm) {
      node.classList.add('in');
    } else {
      requestAnimationFrame(() => node.classList.add('in'));
    }

    setTimeout(() => {
      if (rm) { node.remove(); return; }
      node.classList.remove('in');
      setTimeout(() => node.remove(), 250);
    }, 1800);
  }

  window.PalestraUI = { toast, reducedMotion };
})();
