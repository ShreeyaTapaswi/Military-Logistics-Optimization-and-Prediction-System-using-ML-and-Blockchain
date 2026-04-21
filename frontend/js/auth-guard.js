(function () {
  var SESSION_KEY = 'avms_session';

  function hasSession() {
    try {
      var raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) {
        return false;
      }
      JSON.parse(raw);
      return true;
    } catch (error) {
      return false;
    }
  }

  function ensureLoginFirst() {
    if (hasSession()) {
      return;
    }

    var path = window.location.pathname || '/frontend/dashboard.html';
    if (!path.startsWith('/frontend/')) {
      path = '/frontend/dashboard.html';
    }
    window.location.replace('/frontend/index.html?next=' + encodeURIComponent(path));
  }

  ensureLoginFirst();
})();
