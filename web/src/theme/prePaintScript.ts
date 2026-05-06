// What belongs here: a string template the standalone dev shell injects
// into <head> to set data-theme on the documentElement before first paint.
// Prevents the dark/light flash. Federated deployments rely on the host
// to do its own pre-paint scripting; this file is for the dev `index.html`.
// Mirrors the inline script that already lives in /web/index.html.

export const PRE_PAINT_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem('theme-preference');
    if (stored === 'light' || stored === 'dark') {
      document.documentElement.setAttribute('data-theme', stored);
    } else {
      var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
    }
  } catch (e) {}
})();
`;
