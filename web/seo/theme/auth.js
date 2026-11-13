(function () {
  'use strict';
  var BASE = document.documentElement.getAttribute('data-base') || '';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var KEY_USER = 'ads.user.v1';
  var KEY_PENDING = 'ads.auth.pending';
  var TTL = 300;

  function toast(text, kind) {
    var box = $('[data-toasts]');
    if (!box) { console.log(text); return; }
    var el = document.createElement('div');
    el.className = 'toast ' + (kind || 'ok');
    el.textContent = text;
    box.appendChild(el);
    setTimeout(function () { el.remove(); }, 4000);
  }

  function normPhone(value) {
    var d = String(value || '').replace(/\D/g, '');
    if (d.length === 11 && (d[0] === '7' || d[0] === '8')) return '+7' + d.slice(1);
    if (d.length === 10) return '+7' + d;
    return null;
  }

  function maskPhone(p) {
    return p ? p.slice(0, 2) + ' ' + p.slice(2, 5) + ' ' + p.slice(5, 8) + '-**-**' : '';
  }

  function readPending() {
    try { return JSON.parse(localStorage.getItem(KEY_PENDING) || 'null'); } catch (e) { return null; }
  }
  function writePending(v) {
    try { localStorage.setItem(KEY_PENDING, JSON.stringify(v)); } catch (e) {}
  }
  function saveUser(user) {
    try { localStorage.setItem(KEY_USER, JSON.stringify(user)); } catch (e) {}
    try { localStorage.removeItem(KEY_PENDING); } catch (e) {}
  }

  async function api(path, body) {
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, 5000);
    try {
      var res = await fetch(BASE + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
        signal: ctrl.signal
      });
      var json = await res.json().catch(function () { return {}; });
      if (!res.ok) throw new Error(json.error || ('HTTP ' + res.status));
      return json;
    } finally {
      clearTimeout(timer);
    }
  }

  /* ---------- страница входа ---------- */
  var loginForm = $('#login-form');
  if (loginForm) {
    var phoneInput = $('#phone');
    var errBox = $('#phone-err');
    phoneInput.addEventListener('input', function () {
      errBox.textContent = '';
      var digits = this.value.replace(/\D/g, '').slice(0, 11);
      if (!digits) { this.value = ''; return; }
      if (digits[0] === '8') digits = '7' + digits.slice(1);
      if (digits[0] !== '7') digits = '7' + digits;
      var out = '+7';
      if (digits.length > 1) out += ' ' + digits.slice(1, 4);
      if (digits.length > 4) out += ' ' + digits.slice(4, 7);
      if (digits.length > 7) out += ' ' + digits.slice(7, 9);
      if (digits.length > 9) out += ' ' + digits.slice(9, 11);
      this.value = out;
    });

    loginForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      var phone = normPhone(phoneInput.value);
      if (!phone) { errBox.textContent = 'Введите российский номер: +7 и 10 цифр'; phoneInput.focus(); return; }
      var btn = loginForm.querySelector('button[type=submit]');
      btn.disabled = true; btn.textContent = 'Отправляем…';
      var demo = false, code = null;
      try {
        await api('/api/auth/phone/request', { phone: phone });
      } catch (err) {
        demo = true;
        code = String(Math.floor(10000 + Math.random() * 90000));
      }
      writePending({ phone: phone, code: code, demo: demo, expires: Date.now() + TTL * 1000, attempts: 0, sentAt: Date.now() });
      btn.disabled = false; btn.textContent = 'Получить код в СМС';
      toast(demo ? 'Демо-режим: код ' + code : 'Код отправлен на ' + maskPhone(phone), demo ? 'warn' : 'ok');
      setTimeout(function () { window.location.href = BASE + '/auth/verify/'; }, 700);
    });
  }

  /* ---------- страница подтверждения ---------- */
  var verifyForm = $('#verify-form');
  if (verifyForm) {
    var pending = readPending();
    if (!pending || !pending.phone) {
      window.location.href = BASE + '/auth/login/';
      return;
    }
    var phoneLabel = $('[data-phone-label]');
    if (phoneLabel) phoneLabel.textContent = maskPhone(pending.phone);
    var demoBox = $('[data-demo-code]');
    if (demoBox) {
      if (pending.demo && pending.code) {
        demoBox.hidden = false;
        demoBox.innerHTML = 'Демо-режим, СМС не отправляется. Ваш код: <b style="font-size:20px;letter-spacing:.18em">' + pending.code + '</b>';
      } else {
        demoBox.hidden = false;
        demoBox.textContent = 'Код отправлен на номер. Если он не пришёл в течение минуты, запросите новый.';
      }
    }
    var codeInput = $('#code');
    var codeErr = $('#code-err');
    codeInput.addEventListener('input', function () {
      this.value = this.value.replace(/\D/g, '').slice(0, 5);
      codeErr.textContent = '';
      if (this.value.length === 5) verifyForm.requestSubmit();
    });

    var resendBtn = $('[data-resend]');
    function tickResend() {
      var left = Math.max(0, 60 - Math.floor((Date.now() - (pending.sentAt || 0)) / 1000));
      resendBtn.disabled = left > 0;
      resendBtn.textContent = left > 0 ? ('Новый код через ' + left + ' с') : 'Отправить код повторно';
    }
    tickResend();
    var timerId = setInterval(tickResend, 1000);
    resendBtn.addEventListener('click', async function () {
      var demo = false, code = null;
      try {
        await api('/api/auth/phone/request', { phone: pending.phone });
      } catch (err) {
        demo = true;
        code = String(Math.floor(10000 + Math.random() * 90000));
      }
      pending = { phone: pending.phone, code: code, demo: demo, expires: Date.now() + TTL * 1000, attempts: 0, sentAt: Date.now() };
      writePending(pending);
      if (demoBox) {
        demoBox.hidden = false;
        demoBox.innerHTML = demo
          ? 'Демо-режим, СМС не отправляется. Ваш код: <b style="font-size:20px;letter-spacing:.18em">' + code + '</b>'
          : 'Новый код отправлен.';
      }
      toast(demo ? 'Новый демо-код: ' + code : 'Код отправлен повторно', demo ? 'warn' : 'ok');
      tickResend();
    });

    verifyForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      var code = codeInput.value.trim();
      if (!/^\d{5}$/.test(code)) { codeErr.textContent = 'Код состоит из 5 цифр'; return; }
      if (Date.now() > pending.expires) { codeErr.textContent = 'Код истёк, запросите новый'; return; }
      var btn = verifyForm.querySelector('button[type=submit]');
      btn.disabled = true; btn.textContent = 'Проверяем…';
      try {
        var out = await api('/api/auth/phone/verify', { phone: pending.phone, code: code });
        saveUser({ id: out.user.id, phone: out.user.phone, displayName: out.user.display_name || 'Пользователь', mode: 'api' });
        toast('Вход выполнен');
        clearInterval(timerId);
        setTimeout(function () { window.location.href = BASE + '/profile/'; }, 600);
        return;
      } catch (err) {
        if (!pending.demo) {
          codeErr.textContent = err.message || 'Не удалось проверить код';
          btn.disabled = false; btn.textContent = 'Подтвердить и войти';
          return;
        }
      }
      pending.attempts = (pending.attempts || 0) + 1;
      writePending(pending);
      if (pending.attempts >= 5) {
        codeErr.textContent = 'Слишком много попыток, запросите новый код';
        btn.disabled = false; btn.textContent = 'Подтвердить и войти';
        return;
      }
      if (code !== pending.code) {
        codeErr.textContent = 'Неверный код. Осталось попыток: ' + (5 - pending.attempts);
        btn.disabled = false; btn.textContent = 'Подтвердить и войти';
        codeInput.select();
        return;
      }
      saveUser({ id: 'u' + Date.now(), phone: pending.phone, displayName: 'Пользователь ' + pending.phone.slice(-4), mode: 'demo' });
      toast('Вход выполнен в демо-режиме');
      clearInterval(timerId);
      setTimeout(function () { window.location.href = BASE + '/profile/'; }, 600);
    });
  }
})();
