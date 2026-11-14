(function () {
  'use strict';

  var A = window.AdsApi;
  if (!A) { console.error('api.js не подключён'); return; }

  var loginForm = document.getElementById('login-form');
  var codeForm = document.getElementById('code-form');
  if (!loginForm || !codeForm) return;

  var BASE = document.documentElement.getAttribute('data-base') || '';
  var ru = A.market === 'ru';
  var $ = function (id) { return document.getElementById(id); };
  var KEY = 'ads.auth.pending';
  var TTL = (ru ? 300 : 600) * 1000;
  var COOLDOWN = 60;

  var T = ru
    ? { badPhone: 'Укажите российский номер телефона, например +7 900 123 45 67', badCode: 'Введите 5 цифр из СМС', hint: 'Мы отправили код в СМС на', resend: 'Отправить код ещё раз', wait: 'Повторно через', sec: 'с', sending: 'Отправляем…', checking: 'Проверяем…' }
    : { badPhone: 'Enter a valid email address', badCode: 'Enter the 5 digits from the email', hint: 'We emailed a code to', resend: 'Send the code again', wait: 'Resend in', sec: 's', sending: 'Sending…', checking: 'Checking…' };

  var ident = '';
  var timer = null;

  function normalize(value) {
    if (ru) {
      var d = String(value || '').replace(/\D/g, '');
      if (d.length === 11 && (d[0] === '7' || d[0] === '8')) return '+7' + d.slice(1);
      if (d.length === 10) return '+7' + d;
      return null;
    }
    var e = String(value || '').trim().toLowerCase();
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) && e.length <= 254 ? e : null;
  }

  function mask(v) {
    if (ru) return v.slice(0, 2) + ' ' + v.slice(2, 5) + ' ***-**-' + v.slice(-2);
    var at = v.indexOf('@');
    return v.slice(0, Math.min(2, at)) + '***' + v.slice(at);
  }

  function savePending() {
    try { sessionStorage.setItem(KEY, JSON.stringify({ ident: ident, t: Date.now() })); } catch (e) {}
  }
  function clearPending() {
    try { sessionStorage.removeItem(KEY); } catch (e) {}
  }
  function readPending() {
    try {
      var p = JSON.parse(sessionStorage.getItem(KEY) || 'null');
      return p && p.ident && Date.now() - p.t < TTL ? p : null;
    } catch (e) { return null; }
  }

  function busy(form, on, label) {
    var b = form.querySelector('button[type=submit]');
    if (!b) return;
    if (on) { b.dataset.label = b.textContent; b.textContent = label; } else if (b.dataset.label) { b.textContent = b.dataset.label; }
    b.disabled = on;
  }

  function nextUrl() {
    var n = new URLSearchParams(window.location.search).get('next');
    if (n && /^\/[^\/\\]/.test(n)) return n;
    return BASE + '/profile/';
  }

  function startCooldown() {
    var btn = $('code-resend');
    var left = COOLDOWN;
    clearInterval(timer);
    btn.disabled = true;
    var tick = function () {
      if (left <= 0) { clearInterval(timer); btn.disabled = false; btn.textContent = T.resend; return; }
      btn.textContent = T.wait + ' ' + left + T.sec;
      left--;
    };
    tick();
    timer = setInterval(tick, 1000);
  }

  function showCode() {
    loginForm.hidden = true;
    codeForm.hidden = false;
    $('code-hint').textContent = T.hint + ' ' + mask(ident);
    $('code-err').textContent = '';
    $('code').value = '';
    $('code').focus();
    startCooldown();
  }

  function showLogin() {
    clearInterval(timer);
    clearPending();
    codeForm.hidden = true;
    loginForm.hidden = false;
    $('ident').focus();
  }

  loginForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    var v = normalize($('ident').value);
    $('ident-err').textContent = '';
    if (!v) { $('ident-err').textContent = T.badPhone; return; }
    busy(loginForm, true, T.sending);
    try {
      await A.requestCode(v);
      ident = v;
      savePending();
      showCode();
    } catch (err) {
      $('ident-err').textContent = err.message;
    } finally {
      busy(loginForm, false);
    }
  });

  codeForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    var code = $('code').value.trim();
    $('code-err').textContent = '';
    if (!/^\d{5}$/.test(code)) { $('code-err').textContent = T.badCode; return; }
    busy(codeForm, true, T.checking);
    try {
      await A.verifyCode(ident, code);
      clearPending();
      window.location.href = nextUrl();
    } catch (err) {
      $('code-err').textContent = err.message;
      busy(codeForm, false);
    }
  });

  $('code').addEventListener('input', function () {
    this.value = this.value.replace(/\D/g, '').slice(0, 5);
    if (this.value.length === 5) {
      if (codeForm.requestSubmit) codeForm.requestSubmit();
      else codeForm.dispatchEvent(new Event('submit', { cancelable: true }));
    }
  });

  $('code-back').addEventListener('click', showLogin);

  $('code-resend').addEventListener('click', async function () {
    $('code-err').textContent = '';
    try {
      await A.requestCode(ident);
      startCooldown();
    } catch (err) {
      $('code-err').textContent = err.message;
    }
  });

  var pending = readPending();
  if (A.hasSession()) {
    window.location.href = nextUrl();
  } else if (pending) {
    ident = pending.ident;
    showCode();
  }
})();
