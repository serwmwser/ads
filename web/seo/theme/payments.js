(function () {
  'use strict';

  var A = window.AdsApi;
  if (!A) { console.error('api.js не подключён'); return; }

  var BASE = document.documentElement.getAttribute('data-base') || '';
  var L = A.market === 'ru' ? 'ru' : 'en';
  var esc = function (v) { return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };

  var T = {
    ru: {
      pending: 'Ждём подтверждение платежа…', pendingText: 'Обычно это занимает несколько секунд. Не закрывайте страницу.',
      paid: 'Оплата прошла', paidText: 'Спасибо! Купленное уже на вашем аккаунте.', amount: 'Сумма',
      canceled: 'Платёж отменён', canceledText: 'Деньги не списаны. Можно попробовать ещё раз.',
      mismatch: 'Ошибка суммы платежа', mismatchText: 'Сумма платежа не совпала с тарифом. Напишите в поддержку, указав номер платежа:',
      none: 'Платёж не найден', noneText: 'Проверьте историю платежей в профиле.',
      slow: 'Подтверждение задерживается', slowText: 'Банк ещё не подтвердил платёж. Обычно это не больше нескольких минут: загляните в историю платежей позже.',
      error: 'Не удалось проверить платёж: ', newAd: 'Подать объявление', profile: 'Мой профиль', retry: 'Выбрать тариф', history: 'История платежей', refresh: 'Проверить ещё раз'
    },
    en: {
      pending: 'Waiting for payment confirmation…', pendingText: 'It usually takes a few seconds. Please keep this page open.',
      paid: 'Payment received', paidText: 'Thank you! Your purchase is already on your account.', amount: 'Amount',
      canceled: 'Payment canceled', canceledText: 'You were not charged. You can try again.',
      mismatch: 'Payment amount error', mismatchText: 'The amount did not match the plan. Contact support and quote the payment number:',
      none: 'Payment not found', noneText: 'Check the payment history in your profile.',
      slow: 'Confirmation is taking longer than usual', slowText: 'The bank has not confirmed the payment yet. It usually takes a few minutes: check your payment history later.',
      error: 'Could not check the payment: ', newAd: 'Post a listing', profile: 'My profile', retry: 'Choose a plan', history: 'Payment history', refresh: 'Check again'
    }
  };
  var t = function (k) { return T[L][k] || k; };
  var go = function (p) { window.location.href = BASE + p; };

  if (!A.hasSession()) { go('/auth/login/'); return; }

  var host = document.querySelector('.profile-content') || document.querySelector('main') || document.body;
  host.insertAdjacentHTML('beforeend', '<div id="pay-state" aria-live="polite" style="max-width:560px"></div>');
  var box = document.getElementById('pay-state');

  var wantId = Number(new URLSearchParams(window.location.search).get('id')) || 0;
  var interval = Number(window.ADS_POLL_MS) || 3000;
  var maxTries = Number(window.ADS_POLL_TRIES) || 20;
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

  var btn = function (href, label, primary) {
    return '<a class="btn ' + (primary ? 'btn-primary' : 'btn-ghost') + '" href="' + BASE + href + '" style="margin:6px 8px 0 0">' + esc(label) + '</a>';
  };
  var card = function (color, title, text, extra) {
    box.innerHTML = '<div style="padding:22px;border:1px solid var(--line);border-left:5px solid ' + color + ';border-radius:14px;background:var(--surface-2)">' +
      '<h2 style="margin:0 0 8px;font-size:22px">' + esc(title) + '</h2><p style="margin:0 0 12px;color:var(--muted)">' + esc(text) + '</p>' + (extra || '') + '</div>';
  };

  function render(state, p, err) {
    var amount = p ? (p.amount != null ? p.amount : Number(p.amount_rub)) : 0;
    if (state === 'pending') card('var(--warn)', t('pending'), t('pendingText'));
    else if (state === 'paid') card('var(--ok)', t('paid'), t('paidText'),
      '<p style="margin:0 0 8px"><b>' + esc(t('amount')) + ':</b> ' + esc(A.money(amount)) + '</p>' + btn('/profile/ads/new/', t('newAd'), true) + btn('/profile/', t('profile'), false));
    else if (state === 'canceled') card('var(--danger)', t('canceled'), t('canceledText'), btn('/profile/payments/', t('retry'), true));
    else if (state === 'mismatch') card('var(--danger)', t('mismatch'), t('mismatchText') + ' #' + (p ? p.id : ''), btn('/profile/payments/', t('history'), false));
    else if (state === 'none') card('var(--line)', t('none'), t('noneText'), btn('/profile/payments/', t('history'), true));
    else if (state === 'slow') card('var(--warn)', t('slow'), t('slowText'),
      '<button class="btn btn-primary" id="pay-again" type="button" style="margin:6px 8px 0 0">' + esc(t('refresh')) + '</button>' + btn('/profile/payments/', t('history'), false));
    else if (state === 'error') card('var(--danger)', t('error') + (err && err.message ? err.message : ''), '');
    var again = document.getElementById('pay-again');
    if (again) again.addEventListener('click', run);
  }

  async function find() {
    var data = await A.myPayments();
    var list = data.payments || [];
    if (wantId) return list.filter(function (x) { return x.id === wantId; })[0] || null;
    return list[0] || null;
  }

  async function run() {
    render('pending');
    for (var i = 0; i < maxTries; i++) {
      try {
        var p = await find();
        if (!p) { render('none'); return; }
        if (p.status === 'paid') { render('paid', p); return; }
        if (p.status === 'canceled') { render('canceled', p); return; }
        if (p.status === 'amount_mismatch') { render('mismatch', p); return; }
      } catch (e) {
        if (e.status === 401) { go('/auth/login/'); return; }
        render('error', null, e);
      }
      await sleep(interval);
    }
    render('slow');
  }

  run();
})();
