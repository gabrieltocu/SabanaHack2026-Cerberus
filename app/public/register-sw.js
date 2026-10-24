// Solo en producción: el build carga el bundle desde /_expo/static/; el servidor de desarrollo no.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    if (document.querySelector('script[src*="/_expo/static/"]')) {
      navigator.serviceWorker.register('/sw.js').catch(function () {});
    }
  });
}
