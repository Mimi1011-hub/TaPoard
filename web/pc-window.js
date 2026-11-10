(function () {
  'use strict';
  // Settings for the 3.0 PC window. Opens only on this PC with the per-launch admin key.
  var key = location.hash.slice(1) || sessionStorage.getItem('tapoard-admin') || '';
  if (key) sessionStorage.setItem('tapoard-admin', key);
  history.replaceState(null, '', '/pc-window');
  var form = document.getElementById('pcw-form'),
    note = document.getElementById('pcw-message'),
    opacityValue = document.getElementById('pcw-opacity-value'),
    saving = Promise.resolve(),
    noteTimer = null;

  function api(path, data) {
    return fetch('/api/' + path, {
      method: data === undefined ? 'GET' : 'POST',
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: data === undefined ? undefined : JSON.stringify(data),
    }).then(function (r) {
      return r.json().then(function (x) {
        if (!r.ok) throw new Error(r.status === 401 || r.status === 403 ? 'TaPoard の通知領域メニューから「PC 用ウィンドウの設定」を開き直してください。' : x.error || '保存できませんでした。');
        return x;
      });
    });
  }
  function say(text) {
    note.textContent = text;
    clearTimeout(noteTimer);
    noteTimer = setTimeout(function () { note.textContent = ''; }, 3000);
  }
  function show(view) {
    var o = view.options;
    ['startup', 'startTopmost', 'buttonSize', 'aspect'].forEach(function (name) { form.elements[name].value = o[name]; });
    form.elements.opacity.value = o.opacity;
    opacityValue.textContent = o.opacity + '%';
    ['autoHideBar', 'showInfo', 'confirmClose'].forEach(function (name) { form.elements[name].checked = !!o[name]; });
    document.getElementById('pcw-runtime').hidden = view.runtimeAvailable;
    document.getElementById('pcw-open').disabled = !view.runtimeAvailable;
    document.getElementById('pcw-open-full').disabled = !view.runtimeAvailable;
    document.getElementById('pcw-open').textContent = view.open ? 'PC 用ウィンドウを前に出す' : 'PC 用ウィンドウを開く';
  }
  function collect() {
    return {
      startup: form.elements.startup.value,
      startTopmost: form.elements.startTopmost.value,
      buttonSize: form.elements.buttonSize.value,
      aspect: form.elements.aspect.value,
      opacity: Number(form.elements.opacity.value),
      autoHideBar: form.elements.autoHideBar.checked,
      showInfo: form.elements.showInfo.checked,
      confirmClose: form.elements.confirmClose.checked,
    };
  }
  // Every change is saved at once and applied to an open window.
  function save() {
    var body = collect();
    saving = saving.then(function () {
      return api('pc-window', body).then(function (view) {
        show(view);
        say('保存しました。');
      }, function (e) { say(e.message); });
    });
  }
  form.addEventListener('change', save);
  form.elements.opacity.addEventListener('input', function () {
    opacityValue.textContent = form.elements.opacity.value + '%';
  });
  form.addEventListener('submit', function (e) { e.preventDefault(); });
  function open(fullscreen) {
    api('pc-window/open', { fullscreen: fullscreen }).then(show, function (e) { say(e.message); });
  }
  document.getElementById('pcw-open').onclick = function () { open(false); };
  document.getElementById('pcw-open-full').onclick = function () { open(true); };
  api('pc-window').then(show, function (e) { say(e.message); });
})();
