    (function () {
      try {
        var t = localStorage.getItem('palestra-theme');
        if (t === 'dark' || t === 'light') document.documentElement.setAttribute('data-theme', t);
      } catch (e) {}
    })();
