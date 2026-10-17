// SC-19's client: the whole wizard is rendered by this script on one URL, the way a React form
// renders its steps (spec 032 US1). Step 1 relies on the browser's own validation (required, type,
// pattern, maxlength: the messages are never in the DOM); step 2 validates in script and renders its
// messages as alerts; its Next posts to the quote API, so a blocked, failed or slow request shows
// what the user would see. "Business" on step 2 leads to a code confirmation instead of the summary.

export const SC19_SCRIPT = String.raw`
const root = document.getElementById('wizard');
const values = {};
const field = (label, name, attrs = '') =>
  '<p><label for="' + name + '">' + label + '</label> <input id="' + name + '" name="' + name + '" ' + attrs + '></p>' +
  '<p class="error" role="alert" id="' + name + '-error"></p>';
const radio = (name, value, label) =>
  '<label><input type="radio" name="' + name + '" value="' + value + '"> ' + label + '</label> ';

function step1() {
  root.innerHTML = '<h2>Step 1 of 3: your details</h2>' +
    '<form id="f1" aria-label="Your details">' +
    field('Full name', 'name', 'required maxlength="40"') +
    field('E-mail', 'email', 'type="email" required') +
    field('Postal code', 'postal', 'required pattern="[0-9]{2}-[0-9]{3}" title="Format 00-000"') +
    field('Year of birth', 'year', 'type="number" required min="1900" max="2008"') +
    '<p><button type="submit">Next</button></p></form>';
  document.getElementById('f1').addEventListener('submit', (e) => {
    e.preventDefault();
    for (const [k, v] of new FormData(e.target)) values[k] = v;
    step2();
  });
}

function businessFields(on) {
  document.getElementById('business').innerHTML = on
    ? field('Company name', 'company', '') + field('Tax number', 'tax', '')
    : '';
}

function showErrors(errors) {
  for (const el of root.querySelectorAll('.error')) el.textContent = '';
  for (const el of root.querySelectorAll('[aria-invalid]')) el.removeAttribute('aria-invalid');
  for (const [k, msg] of Object.entries(errors)) {
    const out = document.getElementById(k + '-error');
    if (out) out.textContent = msg;
    document.getElementById(k)?.setAttribute('aria-invalid', 'true');
  }
}

function check2(v) {
  const errors = {};
  if (!v.type) errors.type = 'Choose a customer type.';
  if (!/^\d{2}\.\d{2}\.\d{4}$/.test(v.start || '')) errors.start = 'Enter the start date as DD.MM.YYYY.';
  if (v.type === 'business') {
    if (!v.company) errors.company = 'Enter the company name.';
    if (!/^\d{10}$/.test(v.tax || '')) errors.tax = 'The tax number has 10 digits.';
  }
  return errors;
}

function step2() {
  root.innerHTML = '<h2>Step 2 of 3: your contract</h2>' +
    '<form id="f2" aria-label="Your contract" novalidate>' +
    '<fieldset><legend>Customer type</legend>' + radio('type', 'private', 'Private') +
    radio('type', 'business', 'Business') + '<p class="error" role="alert" id="type-error"></p></fieldset>' +
    '<div id="business"></div>' +
    field('Start date', 'start', 'placeholder="DD.MM.YYYY"') +
    field('Promo code (optional)', 'promo', '') +
    '<p id="status" role="status"></p><p><button type="submit">Next</button></p></form>';
  for (const r of root.querySelectorAll('input[name=type]'))
    r.addEventListener('change', () => businessFields(r.value === 'business' && r.checked));
  document.getElementById('f2').addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = Object.fromEntries(new FormData(e.target));
    const errors = check2(v);
    showErrors(errors);
    if (Object.keys(errors).length) return;
    Object.assign(values, v);
    const status = document.getElementById('status');
    status.textContent = 'Calculating your quote…';
    let res;
    try {
      res = await fetch('/sc19/api/quote', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(values) });
    } catch {
      status.textContent = '';
      return showErrors({ type: 'Something went wrong. Check your connection and try again.' });
    }
    status.textContent = '';
    if (res.status >= 500) return technical(res.status);
    const body = await res.json();
    if (res.status === 422) return showErrors(body.errors);
    values.price = body.price;
    v.type === 'business' ? confirmCode() : step3();
  });
}

function technical(status) {
  root.innerHTML = '<h2>We could not calculate your quote</h2>' +
    '<p role="alert">The quote service is not available (error ' + status + '). Please try again later.</p>' +
    '<p><button type="button" id="again">Start again</button></p>';
  document.getElementById('again').addEventListener('click', step1);
}

function step3() {
  root.innerHTML = '<h2>Step 3 of 3: summary</h2>' +
    '<p>Your yearly price: <strong>' + values.price + ' EUR</strong></p>' +
    '<form id="f3" aria-label="Summary"><p><label><input type="checkbox" id="ok" required> I accept the terms</label></p>' +
    '<p><button type="submit">Buy now</button></p></form>';
  document.getElementById('f3').addEventListener('submit', async (e) => {
    e.preventDefault();
    await fetch('/sc19/api/buy', { method: 'POST', body: JSON.stringify(values) });
    root.innerHTML = '<h2>Thank you</h2><p>Your policy is on its way.</p>';
  });
}

function confirmCode() {
  root.innerHTML = '<h2>Step 3 of 3: confirm with a code</h2><p>We sent a code to your phone.</p>' +
    '<form id="f4" aria-label="Confirm with a code">' +
    field('SMS code', 'otp', 'autocomplete="one-time-code" inputmode="numeric" required') +
    '<p><button type="submit">Confirm</button></p></form>';
}

step1();
`;
