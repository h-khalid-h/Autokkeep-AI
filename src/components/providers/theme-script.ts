// Inline script to prevent flash of wrong theme (FOUC)
// This runs before React hydrates, so the theme is applied immediately
export const themeScript = `
(function() {
  try {
    var stored = localStorage.getItem('autokkeep-theme');
    var theme = stored || 'system';
    if (theme === 'system') {
      var isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      // Don't set data-theme — let the CSS media query handle it
    } else {
      document.documentElement.setAttribute('data-theme', theme);
    }
  } catch (e) {}
})();
`;
