(function () {
  'use strict';
  var BASE = document.documentElement.getAttribute('data-base') || '';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var rub = new Intl.NumberFormat('ru-RU');
  var esc = function (v) { return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };

  var KEY_USER = 'ads.user.v1';
  var KEY_ADS = 'ads.drafts.v1';
  var KEY_PAYMENTS = 'ads.payments.v1';

  var user = null;
  try { var raw = localStorage.getItem(KEY_USER); if (raw) user = JSON.parse(raw); } catch (e) {}

  if (!user) {
    window.location.href = BASE + '/auth/login/';
    return;
  }

  function toast(text, kind) {
    var box = $('[data-toasts]');
    if (!box) return;
    var el = document.createElement('div');
    el.className = 'toast ' + (kind || 'ok');
    el.innerHTML = '<span>' + esc(text) + '</span>';
    box.appendChild(el);
    setTimeout(function () { el.remove(); }, 3000);
  }

  function updateUI() {
    var nameEl = $('[data-user-name]'); if (nameEl) nameEl.textContent = user.displayName || 'Пользователь';
    var phoneEl = $('[data-user-phone]'); if (phoneEl) phoneEl.textContent = user.phone;
    var avatarEl = $('[data-avatar]');
    if (avatarEl) {
      var initials = (user.displayName || 'П').charAt(0).toUpperCase();
      avatarEl.textContent = initials;
    }
    var ads = JSON.parse(localStorage.getItem(KEY_ADS) || '[]');
    var countEl = $('[data-ads-count]'); if (countEl) countEl.textContent = ads.length;
  }

  function logout() {
    localStorage.removeItem(KEY_USER);
    window.location.href = BASE + '/auth/login/';
  }

  $('[data-logout]')?.addEventListener('click', logout);

  var path = window.location.pathname.replace(BASE, '') || '/';
  
  if (path === '/profile/' || path === '/profile') {
    renderProfile(ads);
  } else if (path === '/profile/ads/new/' || path === '/profile/ads/new') {
    renderNewAd();
  } else if (path.startsWith('/profile/ads/edit/')) {
    var id = path.split('/').filter(Boolean).pop();
    renderEditAd(id);
  } else if (path === '/profile/payments/' || path === '/profile/payments') {
    renderPayments();
  } else if (path === '/profile/settings/' || path === '/profile/settings') {
    renderSettings();
  }

  function renderProfile(ads) {
    var content = $('.profile-content');
    if (!content) return;
    var myAds = ads.filter(function (a) { return a.userId === user.id || a.seller === 'Вы'; });
    var html = '<div class="ad-list">';
    if (!myAds.length) {
      html += '<div class="empty" style="padding:40px;text-align:center;border:2px dashed var(--line);border-radius:16px">' +
        '<p style="color:var(--muted);margin-bottom:16px">У вас пока нет объявлений.</p>' +
        '<a class="btn btn-primary" href="' + BASE + '/profile/ads/new/">+ Разместить первое объявление</a></div>';
    } else {
      myAds.forEach(function (a) {
        var statusClass = a.status === 'active' ? 'active' : (a.status === 'moderation' ? 'moderation' : 'removed');
        var statusText = a.status === 'active' ? 'Активно' : (a.status === 'moderation' ? 'На проверке' : 'Снято');
        html += '<div class="ad-item">' +
          '<div class="ad-thumb" style="--h1:' + (a.h1||'#ccc') + ';--h2:' + (a.h2||'#999') + '">' + (a.emoji||'📦') + '</div>' +
          '<div class="ad-info"><h3>' + esc(a.title) + '</h3>' +
          '<div class="meta"><span>' + esc(a.city) + '</span><span>' + (a.days||0) + ' дн. назад</span></div></div>' +
          '<div class="ad-actions"><span class="price">' + rub.format(a.price) + ' ₽</span>' +
          '<span class="ad-status ' + statusClass + '">' + statusText + '</span>' +
          '<div style="display:flex;gap:8px;margin-top:8px">' +
          '<a class="btn btn-sm" href="' + BASE + '/profile/ads/edit/' + a.id + '/">Изменить</a>' +
          '<button class="btn btn-sm btn-ghost" data-del-ad="' + a.id + '" style="color:var(--danger)">Удалить</button>' +
          '</div></div></div>';
      });
    }
    html += '</div>';
    content.insertAdjacentHTML('beforeend', html);

    content.addEventListener('click', function (e) {
      var delBtn = e.target.closest('[data-del-ad]');
      if (delBtn) {
        var id = delBtn.dataset.delAd;
        var updated = myAds.filter(function (a) { return String(a.id) !== String(id); });
        var allAds = JSON.parse(localStorage.getItem(KEY_ADS) || '[]');
        localStorage.setItem(KEY_ADS, JSON.stringify(allAds.filter(function (a) { return String(a.id) !== String(id); })));
        delBtn.closest('.ad-item').remove();
        toast('Объявление удалено', 'warn');
        $('[data-ads-count]').textContent = updated.length;
      }
    });
  }

  function renderNewAd() {
    var content = $('.profile-content');
    if (!content) return;
    content.insertAdjacentHTML('beforeend',
      '<form id="ad-form" novalidate>' +
      '<div class="form-grid">' +
        '<div class="form-group form-full"><label>Заголовок</label><input name="title" maxlength="70" required placeholder="Например, iPhone 14 128 ГБ, отличное состояние"><div class="err" data-e="title"></div></div>' +
        '<div class="form-group"><label>Категория</label><select name="cat" required>' +
          '<option value="">Выберите категорию</option>' +
          '<option value="nedvizhimost">Недвижимость</option>' +
          '<option value="transport">Транспорт</option>' +
          '<option value="elektronika">Электроника</option>' +
          '<option value="rabota-uslugi">Работа и услуги</option>' +
        '</select><div class="err" data-e="cat"></div></div>' +
        '<div class="form-group"><label>Город</label><input name="city" list="citylist" required placeholder="Москва"><datalist id="citylist">' +
          '<option value="Москва"><option value="Санкт-Петербург"><option value="Казань"><option value="Новосибирск"><option value="Екатеринбург">' +
        '</datalist><div class="err" data-e="city"></div></div>' +
        '<div class="form-group"><label>Цена, ₽</label><input name="price" type="number" min="0" step="50" required placeholder="0"><div class="err" data-e="price"></div></div>' +
        '<div class="form-group form-full"><label>Описание</label><textarea name="desc" maxlength="2000" required placeholder="Опишите состояние, комплектацию, причину продажи..."></textarea><div class="err" data-e="desc"></div></div>' +
      '</div>' +
      '<div class="form-actions">' +
        '<button class="btn btn-primary" type="submit">Опубликовать бесплатно</button>' +
        '<a class="btn btn-ghost" href="' + BASE + '/profile/">Отмена</a>' +
      '</div></form>'
    );

    $('#ad-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var f = this.elements, ok = true;
      function err(n, msg) { var el = $('[data-e="' + n + '"]'); if (el) el.textContent = msg || ''; if (msg) ok = false; }
      err('title', f.title.value.trim().length < 5 ? 'Минимум 5 символов' : '');
      err('cat', f.cat.value ? '' : 'Выберите категорию');
      err('city', f.city.value.trim().length < 2 ? 'Укажите город' : '');
      err('price', f.price.value === '' || Number(f.price.value) < 0 ? 'Укажите цену' : '');
      err('desc', f.desc.value.trim().length < 20 ? 'Минимум 20 символов' : '');
      if (!ok) { toast('Проверьте поля формы', 'err'); return; }

      var cats = { nedvizhimost: { emoji: '🏠', h1: '#2B44FF', h2: '#23B5E8' }, transport: { emoji: '🚗', h1: '#FF6B2C', h2: '#F5A524' }, elektronika: { emoji: '💻', h1: '#FF2E88', h2: '#7C5CFF' }, 'rabota-uslugi': { emoji: '🧰', h1: '#C6F02B', h2: '#0FB5A5' } };
      var c = cats[f.cat.value] || cats.elektronika;
      var ad = {
        id: 'a' + Date.now(), userId: user.id, title: f.title.value.trim(), desc: f.desc.value.trim(),
        city: f.city.value.trim(), cat: f.cat.value, price: Math.round(Number(f.price.value)),
        days: 0, views: 0, seller: user.displayName || 'Вы', status: 'moderation',
        emoji: c.emoji, h1: c.h1, h2: c.h2
      };
      var all = JSON.parse(localStorage.getItem(KEY_ADS) || '[]');
      all.unshift(ad);
      localStorage.setItem(KEY_ADS, JSON.stringify(all));
      toast('Объявление отправлено на модерацию');
      setTimeout(function () { window.location.href = BASE + '/profile/'; }, 1000);
    });
  }

  function renderEditAd(id) {
    var all = JSON.parse(localStorage.getItem(KEY_ADS) || '[]');
    var ad = all.find(function (a) { return String(a.id) === String(id); });
    if (!ad) { window.location.href = BASE + '/profile/'; return; }
    
    var content = $('.profile-content');
    content.insertAdjacentHTML('beforeend',
      '<form id="ad-form" novalidate>' +
      '<div class="form-grid">' +
        '<div class="form-group form-full"><label>Заголовок</label><input name="title" maxlength="70" value="' + esc(ad.title) + '"><div class="err" data-e="title"></div></div>' +
        '<div class="form-group"><label>Категория</label><select name="cat">' +
          '<option value="nedvizhimost"' + (ad.cat==='nedvizhimost'?' selected':'') + '>Недвижимость</option>' +
          '<option value="transport"' + (ad.cat==='transport'?' selected':'') + '>Транспорт</option>' +
          '<option value="elektronika"' + (ad.cat==='elektronika'?' selected':'') + '>Электроника</option>' +
          '<option value="rabota-uslugi"' + (ad.cat==='rabota-uslugi'?' selected':'') + '>Работа и услуги</option>' +
        '</select></div>' +
        '<div class="form-group"><label>Город</label><input name="city" value="' + esc(ad.city) + '"></div>' +
        '<div class="form-group"><label>Цена, ₽</label><input name="price" type="number" min="0" value="' + ad.price + '"></div>' +
        '<div class="form-group form-full"><label>Описание</label><textarea name="desc" maxlength="2000">' + esc(ad.desc) + '</textarea></div>' +
      '</div>' +
      '<div class="form-actions">' +
        '<button class="btn btn-primary" type="submit">Сохранить изменения</button>' +
        '<a class="btn btn-ghost" href="' + BASE + '/profile/">Отмена</a>' +
      '</div></form>'
    );

    $('#ad-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var f = this.elements;
      ad.title = f.title.value.trim(); ad.cat = f.cat.value; ad.city = f.city.value.trim();
      ad.price = Math.round(Number(f.price.value)); ad.desc = f.desc.value.trim();
      ad.status = 'moderation';
      localStorage.setItem(KEY_ADS, JSON.stringify(all));
      toast('Объявление обновлено и отправлено на повторную проверку');
      setTimeout(function () { window.location.href = BASE + '/profile/'; }, 1000);
    });
  }

  function renderPayments() {
    var content = $('.profile-content');
    var pays = JSON.parse(localStorage.getItem(KEY_PAYMENTS) || '[]');
    var html = '<table class="pay-table"><thead><tr><th>Дата</th><th>Услуга</th><th>Сумма</th><th>Статус</th></tr></thead><tbody>';
    if (!pays.length) {
      html += '<tr><td colspan="4" style="text-align:center;padding:30px;color:var(--muted)">Истории платежей пока нет</td></tr>';
    } else {
      pays.forEach(function (p) {
        var sc = p.status === 'paid' ? 'paid' : (p.status === 'pending' ? 'pending' : 'failed');
        var st = p.status === 'paid' ? 'Оплачено' : (p.status === 'pending' ? 'Ожидает' : 'Отменено');
        html += '<tr><td>' + p.date + '</td><td>' + esc(p.title) + '</td><td>' + rub.format(p.amount) + ' ₽</td>' +
          '<td><span class="pay-status ' + sc + '">'+ (sc==='paid'?'✓':'') +' ' + st + '</span></td></tr>';
      });
    }
    html += '</tbody></table>';
    html += '<div style="margin-top:24px;padding:20px;background:var(--surface-2);border-radius:14px;border:1px solid var(--line)">' +
      '<b style="display:block;margin-bottom:8px">Пополнить баланс или купить тариф</b>' +
      '<p style="color:var(--muted);font-size:14px;margin:0 0 16px">В демо-режиме платежи не списываются. В рабочей версии здесь будет кнопка оплаты через ЮKassa (карта или СБП).</p>' +
      '<a class="btn btn-primary" href="' + BASE + '/#pricing">Посмотреть тарифы</a></div>';
    content.insertAdjacentHTML('beforeend', html);
  }

  function renderSettings() {
    var content = $('.profile-content');
    content.insertAdjacentHTML('beforeend',
      '<div style="max-width:600px">' +
        '<h2 style="font-size:20px;margin-bottom:16px">Личные данные</h2>' +
        '<div class="form-grid">' +
          '<div class="form-group form-full"><label>Имя в профиле</label><input id="set-name" value="' + esc(user.displayName || '') + '" maxlength="40"></div>' +
        '</div>' +
        '<div class="form-actions" style="margin-top:16px;padding-top:16px"><button class="btn" id="save-settings">Сохранить</button></div>' +
        
        '<div class="danger-zone">' +
          '<h3>Удаление аккаунта</h3>' +
          '<p>Это действие необратимо. Все ваши объявления будут сняты с публикации, сообщения удалены, а персональные данные обезличены в соответствии с политикой конфиденциальности.</p>' +
          '<button class="btn" id="delete-account" style="background:var(--danger);color:#fff;border-color:var(--danger)">Удалить аккаунт навсегда</button>' +
        '</div>' +
      '</div>'
    );

    $('#save-settings').addEventListener('click', function () {
      user.displayName = $('#set-name').value.trim() || 'Пользователь';
      localStorage.setItem(KEY_USER, JSON.stringify(user));
      updateUI();
      toast('Настройки сохранены');
    });

    $('#delete-account').addEventListener('click', function () {
      if (confirm('Вы уверены? Это действие нельзя отменить.')) {
        localStorage.removeItem(KEY_USER);
        localStorage.removeItem(KEY_ADS);
        localStorage.removeItem(KEY_PAYMENTS);
        toast('Аккаунт удалён', 'warn');
        setTimeout(function () { window.location.href = BASE + '/'; }, 1500);
    }
    });
  }

  updateUI();
})();
