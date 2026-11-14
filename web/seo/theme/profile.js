(function () {
  'use strict';

  var A = window.AdsApi;
  if (!A) { console.error('api.js не подключён'); return; }

  var root = document.documentElement;
  var BASE = root.getAttribute('data-base') || '';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var esc = function (v) { return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
  var L = A.market === 'ru' ? 'ru' : 'en';

  var T = {
    ru: {
      guest: 'Пользователь', plan: 'Объявления', of: 'из', activeAds: 'активных и на проверке',
      noAds: 'У вас пока нет объявлений.', firstAd: '+ Разместить первое объявление',
      edit: 'Изменить', del: 'Удалить', delAsk: 'Удалить объявление?', deleted: 'Объявление удалено',
      st_published: 'Активно', st_moderation: 'На проверке', st_rejected: 'Отклонено', st_removed: 'Снято',
      title: 'Заголовок', titlePh: 'Например, iPhone 14 128 ГБ, отличное состояние', category: 'Категория', choose: 'Выберите',
      region: 'Регион', city: 'Город', price: 'Цена', desc: 'Описание', descPh: 'Опишите состояние, комплектацию, причину продажи...',
      showPhone: 'Показывать мой телефон в объявлении', publish: 'Отправить на проверку', save: 'Сохранить и отправить на проверку', cancel: 'Отмена',
      errTitle: 'Минимум 5 символов', errDesc: 'Минимум 10 символов', errCat: 'Выберите категорию', errCity: 'Выберите регион и город', errPrice: 'Укажите цену',
      checkFields: 'Проверьте поля формы', sent: 'Объявление отправлено на проверку', saved: 'Сохранено, объявление на повторной проверке',
      rejected: 'Объявление отклонено: ', limitBuy: 'Купить дополнительное объявление', noGeo: 'Список регионов пока пуст.',
      tariffs: 'Тарифы', buy: 'Купить', buySbp: 'Оплатить через СБП', history: 'История платежей', noPays: 'Платежей пока нет',
      date: 'Дата', service: 'Услуга', amount: 'Сумма', status: 'Статус',
      pay_paid: 'Оплачено', pay_pending: 'Ожидает', pay_canceled: 'Отменено', pay_amount_mismatch: 'Ошибка суммы',
      settings: 'Личные данные', name: 'Имя в профиле', saveBtn: 'Сохранить', nameSaved: 'Имя сохранено',
      danger: 'Удаление аккаунта', dangerText: 'Действие необратимо: объявления будут сняты, сообщения удалены, персональные данные обезличены.',
      dangerBtn: 'Удалить аккаунт навсегда', typeWord: 'УДАЛИТЬ', typeAsk: 'Для подтверждения введите слово УДАЛИТЬ', accountDeleted: 'Аккаунт удалён',
      logout: 'Вы вышли из аккаунта', loadError: 'Не удалось загрузить данные: ',
      photos: 'Фото (до 8)', addPhoto: '+ Добавить фото', photoUploading: 'Загрузка…', removePhoto: 'Убрать фото'
    },
    en: {
      guest: 'User', plan: 'Listings', of: 'of', activeAds: 'active or under review',
      noAds: 'You have no listings yet.', firstAd: '+ Post your first listing',
      edit: 'Edit', del: 'Delete', delAsk: 'Delete this listing?', deleted: 'Listing deleted',
      st_published: 'Active', st_moderation: 'In review', st_rejected: 'Rejected', st_removed: 'Removed',
      title: 'Title', titlePh: 'e.g. iPhone 14 128 GB, excellent condition', category: 'Category', choose: 'Choose',
      region: 'Region', city: 'City', price: 'Price', desc: 'Description', descPh: 'Describe the condition, what is included, why you are selling...',
      showPhone: 'Show my phone in the listing', publish: 'Submit for review', save: 'Save and resubmit for review', cancel: 'Cancel',
      errTitle: 'At least 5 characters', errDesc: 'At least 10 characters', errCat: 'Choose a category', errCity: 'Choose a region and city', errPrice: 'Enter a price',
      checkFields: 'Please check the form', sent: 'Listing submitted for review', saved: 'Saved, the listing is under review again',
      rejected: 'Listing rejected: ', limitBuy: 'Buy an extra listing', noGeo: 'The list of regions is empty.',
      tariffs: 'Plans', buy: 'Buy', buySbp: 'Pay via SBP', history: 'Payment history', noPays: 'No payments yet',
      date: 'Date', service: 'Item', amount: 'Amount', status: 'Status',
      pay_paid: 'Paid', pay_pending: 'Pending', pay_canceled: 'Canceled', pay_amount_mismatch: 'Amount error',
      settings: 'Personal data', name: 'Display name', saveBtn: 'Save', nameSaved: 'Name saved',
      danger: 'Delete account', dangerText: 'This cannot be undone: listings are removed, messages deleted, personal data anonymized.',
      dangerBtn: 'Delete account forever', typeWord: 'DELETE', typeAsk: 'Type DELETE to confirm', accountDeleted: 'Account deleted',
      logout: 'You have signed out', loadError: 'Could not load data: ',
      photos: 'Photos (up to 8)', addPhoto: '+ Add photo', photoUploading: 'Uploading…', removePhoto: 'Remove photo'
    }
  };
  var t = function (k) { return (T[L] && T[L][k]) || k; };

  function go(p) { window.location.href = BASE + p; }

  function toast(text, kind) {
    var box = $('[data-toasts]');
    if (!box) return;
    var el = document.createElement('div');
    el.className = 'toast ' + (kind || 'ok');
    el.innerHTML = '<span>' + esc(text) + '</span>';
    box.appendChild(el);
    setTimeout(function () { el.remove(); }, 3500);
  }

  function fmtDate(s) {
    if (!s) return '';
    var d = new Date(String(s).replace(' ', 'T') + 'Z');
    return isNaN(d) ? s : d.toLocaleDateString(A.locale);
  }

  if (!A.hasSession()) { go('/auth/login/'); return; }

  var summary = null;
  var content = $('.profile-content');

  function ident(u) {
    if (u.email) return u.email;
    if (u.phone && String(u.phone).indexOf('email:') !== 0) return u.phone;
    return '';
  }

  function updateUI() {
    var u = summary.user || {};
    var name = u.display_name || t('guest');
    var n = $('[data-user-name]'); if (n) n.textContent = name;
    var p = $('[data-user-phone]'); if (p) p.textContent = ident(u);
    var a = $('[data-avatar]'); if (a) a.textContent = name.charAt(0).toUpperCase();
    var c = $('[data-ads-count]'); if (c) c.textContent = summary.used != null ? summary.used : '';
  }

  function setupChrome() {
    var theme = $('[data-theme-toggle]');
    if (theme && !window.__adsAppJs) {
      theme.addEventListener('click', function () {
        var dark = root.getAttribute('data-theme') !== 'dark';
        root.setAttribute('data-theme', dark ? 'dark' : 'light');
        theme.innerHTML = dark ? '&#9728;' : '&#9790;';
        try { localStorage.setItem('ads.theme', dark ? 'dark' : 'light'); } catch (e) {}
      });
    }
    var burger = $('[data-nav-toggle]'), mnav = $('[data-mnav]');
    if (burger && mnav) burger.addEventListener('click', function () {
      burger.setAttribute('aria-expanded', mnav.classList.toggle('open') ? 'true' : 'false');
    });
    var out = $('[data-logout]');
    if (out) out.addEventListener('click', async function () {
      await A.logout();
      go('/auth/login/');
    });
  }

  function showError(e) {
    content.insertAdjacentHTML('beforeend', '<p style="color:var(--danger)">' + esc(t('loadError') + (e && e.message ? e.message : e)) + '</p>');
  }

  /* ---------- Мои объявления ---------- */
  async function renderProfile() {
    var data = await A.mine();
    var items = data.items || [];
    var html = '';
    if (summary.limit) {
      html += '<p style="margin:0 0 16px;color:var(--muted)"><b>' + esc(t('plan')) + ':</b> ' + summary.used + ' ' + esc(t('of')) + ' ' + summary.limit + ' (' + esc(t('activeAds')) + ')</p>';
    }
    html += '<div class="ad-list">';
    if (!items.length) {
      html += '<div class="empty" style="padding:40px;text-align:center;border:2px dashed var(--line);border-radius:16px">' +
        '<p style="color:var(--muted);margin-bottom:16px">' + esc(t('noAds')) + '</p>' +
        '<a class="btn btn-primary" href="' + BASE + '/profile/ads/new/">' + esc(t('firstAd')) + '</a></div>';
    }
    items.forEach(function (a) {
      var cls = a.status === 'published' ? 'active' : (a.status === 'moderation' ? 'moderation' : 'removed');
      var thumb = a.photo
        ? '<img src="' + esc(a.photo) + '" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:inherit">'
        : '&#128230;';
      html += '<div class="ad-item" data-ad="' + a.id + '">' +
        '<div class="ad-thumb">' + thumb + '</div>' +
        '<div class="ad-info"><h3>' + esc(a.title) + '</h3>' +
        '<div class="meta"><span>' + esc(a.city_name || a.city) + '</span><span>' + fmtDate(a.published_at) + '</span><span>' + (a.views || 0) + ' &#128065;</span></div></div>' +
        '<div class="ad-actions"><span class="price">' + esc(A.money(a.price_rub)) + '</span>' +
        '<span class="ad-status ' + cls + '">' + esc(t('st_' + a.status)) + '</span>' +
        '<div style="display:flex;gap:8px;margin-top:8px">' +
        '<a class="btn btn-sm" href="' + BASE + '/profile/ads/edit/?id=' + a.id + '">' + esc(t('edit')) + '</a>' +
        '<button class="btn btn-sm btn-ghost" data-del-ad="' + a.id + '" style="color:var(--danger)">' + esc(t('del')) + '</button>' +
        '</div></div></div>';
    });
    html += '</div>';
    content.insertAdjacentHTML('beforeend', html);
    content.addEventListener('click', async function (e) {
      var b = e.target.closest('[data-del-ad]');
      if (!b || !confirm(t('delAsk'))) return;
      try {
        await A.removeAd(Number(b.getAttribute('data-del-ad')));
        b.closest('.ad-item').remove();
        toast(t('deleted'), 'warn');
      } catch (err) { toast(err.message, 'err'); }
    });
  }

  /* ---------- Форма объявления (создание и правка) ---------- */
  async function renderAdForm(id) {
    var ad = null;
    if (id) {
      ad = (await A.item(id)).ad;
      if (!ad.own) { go('/profile/'); return; }
    }
    var lists = await Promise.all([A.categories(), A.regions()]);
    var cats = lists[0].categories || [];
    var regions = lists[1].regions || [];

    var banner = (ad && ad.status === 'rejected' && ad.reject_reason)
      ? '<p style="padding:12px 16px;border-radius:12px;background:var(--surface-2);border:1px solid var(--danger);color:var(--danger)">' + esc(t('rejected') + ad.reject_reason) + '</p>' : '';
    var opt = function (arr, key, label, sel) {
      return '<option value="">' + esc(t('choose')) + '</option>' + arr.map(function (x) {
        return '<option value="' + esc(x[key]) + '"' + (x[key] === sel ? ' selected' : '') + '>' + esc(x[label]) + '</option>';
      }).join('');
    };
    var photosHtml = '<div class="form-group form-full"><label>' + esc(t('photos')) + '</label>' +
      '<div data-photos style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:8px"></div>' +
      '<input type="file" data-photo-input accept="image/jpeg,image/png,image/webp" multiple hidden>' +
      '<div><button type="button" class="btn btn-sm" data-photo-add>' + esc(t('addPhoto')) + '</button></div></div>';
    var phoneField = A.market === 'ru'
      ? '<div class="form-group form-full"><label><input type="checkbox" name="show_phone"' + (ad && ad.phone ? ' checked' : '') + '> ' + esc(t('showPhone')) + '</label></div>' : '';

    content.insertAdjacentHTML('beforeend', banner +
      '<form id="ad-form" novalidate><div class="form-grid">' +
      '<div class="form-group form-full"><label>' + esc(t('title')) + '</label><input name="title" maxlength="100" placeholder="' + esc(t('titlePh')) + '" value="' + esc(ad ? ad.title : '') + '"><div class="err" data-e="title"></div></div>' +
      '<div class="form-group"><label>' + esc(t('category')) + '</label><select name="category">' + opt(cats, 'code', 'title', ad && ad.category) + '</select><div class="err" data-e="category"></div></div>' +
      '<div class="form-group"><label>' + esc(t('price')) + ', ' + esc(A.currency) + '</label><input name="price" type="number" min="0" step="' + (A.market === 'ru' ? '1' : '0.01') + '" value="' + (ad ? ad.price_rub : '') + '"><div class="err" data-e="price"></div></div>' +
      '<div class="form-group"><label>' + esc(t('region')) + '</label><select name="region">' + opt(regions, 'code', 'name', ad && ad.region) + '</select></div>' +
      '<div class="form-group"><label>' + esc(t('city')) + '</label><select name="city"><option value="">' + esc(t('choose')) + '</option></select><div class="err" data-e="city"></div></div>' +
      '<div class="form-group form-full"><label>' + esc(t('desc')) + '</label><textarea name="description" maxlength="5000" placeholder="' + esc(t('descPh')) + '">' + esc(ad ? ad.description : '') + '</textarea><div class="err" data-e="description"></div></div>' +
      photosHtml + phoneField + '</div>' +
      (regions.length ? '' : '<p style="color:var(--danger)">' + esc(t('noGeo')) + '</p>') +
      '<div class="form-actions"><button class="btn btn-primary" type="submit">' + esc(id ? t('save') : t('publish')) + '</button>' +
      '<a class="btn btn-ghost" href="' + BASE + '/profile/">' + esc(t('cancel')) + '</a></div></form>');

    var form = $('#ad-form');
    var f = form.elements;
    var photos = ad ? (ad.photos || []).slice() : [];
    var box = $('[data-photos]'), fileIn = $('[data-photo-input]'), addBtn = $('[data-photo-add]');
    function drawPhotos() {
      box.innerHTML = photos.map(function (u, i) {
        return '<div style="position:relative;width:84px;height:84px"><img src="' + esc(u) + '" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:10px;border:1px solid var(--line)">' +
          '<button type="button" data-photo-del="' + i + '" aria-label="' + esc(t('removePhoto')) + '" style="position:absolute;top:-6px;right:-6px;width:22px;height:22px;border-radius:50%;border:0;background:var(--danger);color:#fff;cursor:pointer">&times;</button></div>';
      }).join('');
      addBtn.style.display = photos.length >= 8 ? 'none' : '';
    }
    box.addEventListener('click', function (e) {
      var d = e.target.closest('[data-photo-del]');
      if (!d) return;
      photos.splice(Number(d.getAttribute('data-photo-del')), 1);
      drawPhotos();
    });
    addBtn.addEventListener('click', function () { fileIn.click(); });
    fileIn.addEventListener('change', async function () {
      var files = Array.prototype.slice.call(fileIn.files || []);
      fileIn.value = '';
      for (var i = 0; i < files.length && photos.length < 8; i++) {
        addBtn.disabled = true;
        addBtn.textContent = t('photoUploading');
        try { photos.push(await A.uploadPhoto(files[i])); drawPhotos(); }
        catch (er) { toast(er.message, 'err'); }
      }
      addBtn.disabled = false;
      addBtn.textContent = t('addPhoto');
    });
    drawPhotos();

    async function loadCities(region, selected) {
      f.city.innerHTML = '<option value="">' + esc(t('choose')) + '</option>';
      if (!region) return;
      var data = await A.cities(region);
      f.city.innerHTML = '<option value="">' + esc(t('choose')) + '</option>' + (data.cities || []).map(function (c) {
        return '<option value="' + esc(c.slug) + '"' + (c.slug === selected ? ' selected' : '') + '>' + esc(c.name) + '</option>';
      }).join('');
    }
    f.region.addEventListener('change', function () { loadCities(f.region.value, ''); });
    if (ad && ad.region) await loadCities(ad.region, ad.city);

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      var ok = true;
      function err(n, msg) { var el = $('[data-e="' + n + '"]'); if (el) el.textContent = msg || ''; if (msg) ok = false; }
      err('title', f.title.value.trim().length < 5 ? t('errTitle') : '');
      err('description', f.description.value.trim().length < 10 ? t('errDesc') : '');
      err('category', f.category.value ? '' : t('errCat'));
      err('city', f.region.value && f.city.value ? '' : t('errCity'));
      err('price', f.price.value === '' || Number(f.price.value) < 0 ? t('errPrice') : '');
      if (!ok) { toast(t('checkFields'), 'err'); return; }
      var payload = {
        title: f.title.value.trim(), description: f.description.value.trim(),
        price_rub: Number(f.price.value), category: f.category.value,
        region: f.region.value, city: f.city.value,
        show_phone: f.show_phone ? f.show_phone.checked : false,
        photos: photos
      };
      if (id) payload.id = id;
      try {
        if (id) await A.updateAd(payload); else await A.createAd(payload);
        toast(id ? t('saved') : t('sent'));
        setTimeout(function () { go('/profile/'); }, 900);
      } catch (er) {
        toast(er.message, 'err');
        if (er.status === 402) {
          form.insertAdjacentHTML('beforeend', '<p><a class="btn btn-primary" href="' + BASE + '/profile/payments/">' + esc(t('limitBuy')) + '</a></p>');
        }
      }
    });
  }

  /* ---------- Платежи ---------- */
  async function renderPayments() {
    var res = await Promise.all([A.tariffs(), A.myPayments()]);
    var tariffs = res[0].tariffs || [];
    var pays = res[1].payments || [];
    var html = '<h2 style="font-size:20px;margin:0 0 12px">' + esc(t('tariffs')) + '</h2><div class="form-grid">';
    tariffs.forEach(function (x) {
      var price = x.price != null ? x.price : Number(x.price_rub);
      html += '<div style="padding:18px;border:1px solid var(--line);border-radius:14px;background:var(--surface-2)">' +
        '<b>' + esc(x.title) + '</b><p style="color:var(--muted);font-size:14px;margin:6px 0 12px">' + esc(x.description) + '</p>' +
        '<div style="font-size:22px;font-weight:700;margin-bottom:12px">' + esc(A.money(price)) + '</div>' +
        '<button class="btn btn-primary btn-sm" data-buy="' + esc(x.code) + '">' + esc(t('buy')) + '</button>' +
        (A.market === 'ru' ? ' <button class="btn btn-sm" data-buy="' + esc(x.code) + '" data-method="sbp">' + esc(t('buySbp')) + '</button>' : '') +
        '</div>';
    });
    html += '</div><h2 style="font-size:20px;margin:28px 0 12px">' + esc(t('history')) + '</h2>' +
      '<table class="pay-table"><thead><tr><th>' + esc(t('date')) + '</th><th>' + esc(t('service')) + '</th><th>' + esc(t('amount')) + '</th><th>' + esc(t('status')) + '</th></tr></thead><tbody>';
    if (!pays.length) html += '<tr><td colspan="4" style="text-align:center;padding:30px;color:var(--muted)">' + esc(t('noPays')) + '</td></tr>';
    pays.forEach(function (p) {
      var sc = p.status === 'paid' ? 'paid' : (p.status === 'pending' ? 'pending' : 'failed');
      var amount = p.amount != null ? p.amount : Number(p.amount_rub);
      var title = (tariffs.filter(function (x) { return x.code === p.tariff_code; })[0] || {}).title || p.tariff_code;
      html += '<tr><td>' + esc(fmtDate(p.created_at)) + '</td><td>' + esc(title) + '</td><td>' + esc(A.money(amount)) + '</td>' +
        '<td><span class="pay-status ' + sc + '">' + esc(t('pay_' + p.status)) + '</span></td></tr>';
    });
    html += '</tbody></table>';
    content.insertAdjacentHTML('beforeend', html);
    content.addEventListener('click', async function (e) {
      var b = e.target.closest('[data-buy]');
      if (!b) return;
      b.disabled = true;
      try {
        var r = await A.createPayment(b.getAttribute('data-buy'), b.getAttribute('data-method') || 'checkout');
        if (r.confirmationUrl) window.location.href = r.confirmationUrl;
      } catch (er) { toast(er.message, 'err'); b.disabled = false; }
    });
  }

  /* ---------- Настройки ---------- */
  function renderSettings() {
    var u = summary.user || {};
    content.insertAdjacentHTML('beforeend',
      '<div style="max-width:600px"><h2 style="font-size:20px;margin-bottom:16px">' + esc(t('settings')) + '</h2>' +
      '<div class="form-grid"><div class="form-group form-full"><label>' + esc(t('name')) + '</label><input id="set-name" maxlength="40" value="' + esc(u.display_name || '') + '"></div></div>' +
      '<div class="form-actions" style="margin-top:16px"><button class="btn" id="save-settings">' + esc(t('saveBtn')) + '</button></div>' +
      '<div class="danger-zone"><h3>' + esc(t('danger')) + '</h3><p>' + esc(t('dangerText')) + '</p>' +
      '<button class="btn" id="delete-account" style="background:var(--danger);color:#fff;border-color:var(--danger)">' + esc(t('dangerBtn')) + '</button></div></div>');
    $('#save-settings').addEventListener('click', async function () {
      var name = $('#set-name').value.trim();
      try {
        await A.post('/api/profile/update', { display_name: name });
        summary.user.display_name = name || summary.user.display_name;
        updateUI();
        toast(t('nameSaved'));
      } catch (er) { toast(er.message, 'err'); }
    });
    $('#delete-account').addEventListener('click', async function () {
      var word = prompt(t('typeAsk'));
      if (!word || word.trim().toUpperCase() !== t('typeWord')) return;
      try {
        await A.deleteAccount();
        toast(t('accountDeleted'), 'warn');
        setTimeout(function () { go('/'); }, 1200);
      } catch (er) { toast(er.message, 'err'); }
    });
  }

  /* ---------- Старт ---------- */
  async function init() {
    setupChrome();
    try {
      summary = await A.get('/api/profile/summary');
    } catch (e) {
      if (e.status === 401) { go('/auth/login/'); return; }
      summary = { user: A.cachedUser() || {}, limit: 0, used: null, entitlements: [] };
      toast(t('loadError') + e.message, 'err');
    }
    updateUI();
    var path = window.location.pathname;
    if (BASE && path.indexOf(BASE) === 0) path = path.slice(BASE.length);
    path = path.replace(/\/+$/, '') + '/';
    try {
      if (path === '/profile/') await renderProfile();
      else if (path === '/profile/ads/new/') await renderAdForm(null);
      else if (path === '/profile/ads/edit/') {
        var editId = Number(new URLSearchParams(window.location.search).get('id'));
        if (!editId) { go('/profile/'); return; }
        await renderAdForm(editId);
      }
      else if (path === '/profile/payments/') await renderPayments();
      else if (path === '/profile/settings/') renderSettings();
    } catch (e) {
      if (e.status === 401) { go('/auth/login/'); return; }
      showError(e);
    }
  }

  init();
})();
