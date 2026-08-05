/**
 * Tema claro/escuro — uma preferência para site público, painel e super admin.
 */
(function (g) {
  var KEY = 'vourifarDark';

  function migrate() {
    if (localStorage.getItem(KEY) !== null) return;
    var legacy =
      localStorage.getItem('darkMode') === 'true' ||
      localStorage.getItem('adminDarkMode') === 'true';
    localStorage.setItem(KEY, legacy ? 'true' : 'false');
  }

  function isDark() {
    migrate();
    return localStorage.getItem(KEY) === 'true';
  }

  function apply(dark) {
    var on = !!dark;
    if (document.documentElement) {
      document.documentElement.classList.toggle('dark', on);
    }
    try {
      localStorage.setItem(KEY, on ? 'true' : 'false');
      localStorage.setItem('darkMode', on ? 'true' : 'false');
      localStorage.setItem('adminDarkMode', on ? 'true' : 'false');
    } catch (e) { /* private mode */ }
  }

  function set(dark) {
    apply(dark);
    try {
      g.dispatchEvent(new CustomEvent('vourifar-theme-change', { detail: { dark: !!dark } }));
    } catch (e) { /* IE */ }
  }

  function toggle() {
    set(!isDark());
  }

  migrate();
  apply(isDark());

  g.VouRifarTheme = { isDark: isDark, set: set, toggle: toggle, apply: apply };
})(typeof window !== 'undefined' ? window : globalThis);
