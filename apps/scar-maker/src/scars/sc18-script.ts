// SC-18's page script: shows each field's message once it was touched and keeps the step's button
// disabled until every rule passes. The rules are the server's own (`FIELDS`), as source text.

import { FIELDS, type Step } from './sc18-validators.js';

export function VALIDATION_SCRIPT(step: Step): string {
  const rules = JSON.stringify(
    FIELDS[step].map((f) => ({ name: f.name, kind: f.kind, rules: f.rules })),
  );
  return `
(function () {
  var fields = ${rules};
  var form = document.querySelector('form');
  var button = document.getElementById('next');
  var touched = {};
  var server = {};
  fields.forEach(function (f) {
    var p = document.getElementById(f.name + '-error');
    if (p && !p.hidden) { touched[f.name] = true; server[f.name] = true; }
  });
  function value(f) {
    var el = form.elements[f.name];
    if (f.kind === 'checkbox') return el.checked ? 'yes' : '';
    return el.value;
  }
  function all() {
    var out = {};
    ${JSON.stringify(
      Object.values(FIELDS)
        .flat()
        .map((f) => f.name),
    )}.forEach(function (n) {
      var el = form.elements[n];
      out[n] = el ? (el.type === 'checkbox' ? (el.checked ? 'yes' : '') : el.value) : (window.__sc18prev || {})[n] || '';
    });
    return out;
  }
  function check() {
    var valid = true;
    var values = all();
    fields.forEach(function (f) {
      var message = '';
      for (var i = 0; i < f.rules.length; i++) {
        var ok = new Function('v', 'all', 'return (' + f.rules[i].test + ');')(value(f), values);
        if (!ok) { message = f.rules[i].message; break; }
      }
      if (message) valid = false;
      var p = document.getElementById(f.name + '-error');
      if (touched[f.name]) { p.textContent = message; p.hidden = !message; }
    });
    button.disabled = !valid;
  }
  fields.forEach(function (f) {
    var el = form.elements[f.name];
    ['input', 'change', 'blur'].forEach(function (t) {
      el.addEventListener(t, function () { touched[f.name] = true; check(); });
    });
  });
  check();
})();`;
}
