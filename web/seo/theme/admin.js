(function () {
  'use strict';

  var A = window.AdsApi;
  if (!A) { console.error('api.js не подключён'); return; }

  var BASE = document.documentElement.getAttribute('data-base') || '';
  var L = A.market === 'ru' ? 'ru' : 'en';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var esc = function (v) { return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
  var ident = function (v) { return String(v || '').replace(/^email:/, ''); };

  var T = {
    ru: {
      noAccess: 'Нет доступа. Раздел только для администратора и модератора.',
      stats: 'Сводка', moderation: 'Модерация', complaints: 'Жалобы', users: 'Пользователи', tariffs: 'Тарифы', log: 'Журнал',
      usersN: 'Пользователей', complaintsN: 'Новых жалоб', paymentsN: 'Оплат', revenue: 'Выручка', adsBy: 'Объявления по статусам',
      queueEmpty: 'Очередь пуста', approve: 'Одобрить', reject: 'Отклонить', remove: 'Снять', reasonAsk: 'Причина отказа (минимум 3 символа)',
      done: 'Готово', noComplaints: 'Новых жалоб нет', dismiss: 'Закрыть жалобу', removeAd: 'Снять объявление', blockUser: 'Заблокировать',
      search: 'Поиск по телефону, email или имени', find: 'Найти', block: 'Заблокировать', unblock: 'Разблокировать', blocked: 'заблокирован',
      role: 'Роль', save: 'Сохранить', price: 'Цена', active: 'Активен', tariff: 'Тариф', date: 'Дата', actor: 'Кто', action: 'Действие', target: 'Объект', details: 'Детали',
      from: 'Автор', loadError: 'Ошибка: '
    },
    en: {
      noAccess: 'No access. This section is for administrators and moderators only.',
      stats: 'Overview', moderation: 'Moderation', complaints: 'Complaints', users: 'Users', tariffs: 'Plans', log: 'Log',
      usersN: 'Users', complaintsN: 'New complaints', paymentsN: 'Payments', revenue: 'Revenue', adsBy: 'Listings by status',
      queueEmpty: 'The queue is empty', approve: 'Approve', reject: 'Reject', remove: 'Remove', reasonAsk: 'Reason for rejection (at least 3 characters)',
      done: 'Done', noComplaints: 'No new complaints', dismiss: 'Dismiss', removeAd: 'Remove listing', blockUser: 'Block user',
      search: 'Search by phone, email or name', find: 'Search', block: 'Block', unblock: 'Unblock', blocked: 'blocked',
      role: 'Role', save: 'Save', price: 'Price', active: 'Active', tariff: 'Plan', date: 'Date', actor: 'Actor', action: 'Action', target: 'Target', details: 'Details',
      from: 'Author', loadError: 'Error: '
    }
  };
  var t = function (k) { return T[L][k] || k; };
  var go = function (p) { window.location.href = BASE + p; };

  if (!A.hasSession()) { go('/auth/login/'); return; }

  var host = $('.profile-content') || $('main') || document.body;
  var isAdmin = false;

  function toast(text, kind) {
    var box = $('[data-toasts]');
    if (!box) return;
    var el = document.createElement('div');
    el.className = 'toast ' + (kind || 'ok');
    el.innerHTML = '<span>' + esc(text) + '</span>';
    box.appendChild(el);
    setTimeout(function () { el.remove(); }, 3000);
  }

  var body = null;
  var fail = function (e) {
    if (e && e.status === 401) { go('/auth/login/'); return; }
    body.innerHTML = '<p style="color:var(--danger)">' + esc(t('loadError') + (e && e.message ? e.message : e)) + '</p>';
  };
  var table = function (head, rows) {
    return '<table class="pay-table"><thead><tr>' + head.map(function (h) { return '<th>' + esc(h) + '</th>'; }).join('') + '</tr></thead><tbody>' + rows.join('') + '</tbody></table>';
  };

  async function act(path, payload, after) {
    try {
      await A.post(path, payload);
      toast(t('done'));
      if (after) after();
    } catch (e) { toast(e.message, 'err'); }
  }

  var views = {
    stats: async function () {
      var s = await A.get('/api/admin/stats');
      var box = function (label, value) { return '<div style="padding:16px;border:1px solid var(--line);border-radius:14px;background:var(--surface-2)"><div style="color:var(--muted);font-size:13px">' + esc(label) + '</div><div style="font-size:26px;font-weight:700">' + esc(value) + '</div></div>'; };
      var by = Object.keys(s.ads || {}).map(function (k) { return esc(k) + ': <b>' + s.ads[k] + '</b>'; }).join(' &nbsp; ');
      body.innerHTML = '<div class="form-grid">' + box(t('usersN'), s.users) + box(t('complaintsN'), s.complaints_new) + box(t('paymentsN'), s.payments_paid) + box(t('revenue'), A.money(Number(s.revenue_rub))) + '</div>' +
        '<p style="margin-top:16px"><b>' + esc(t('adsBy')) + ':</b> ' + (by || '-') + '</p>';
    },

    moderation: async function () {
      var d = await A.get('/api/admin/moderation');
      var items = d.items || [];
      if (!items.length) { body.innerHTML = '<p style="color:var(--muted)">' + esc(t('queueEmpty')) + '</p>'; return; }
      body.innerHTML = items.map(function (a) {
        var thumb = a.photo ? '<img src="' + esc(a.photo) + '" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:inherit">' : '&#128230;';
        return '<div class="ad-item" data-ad="' + a.id + '"><div class="ad-thumb">' + thumb + '</div>' +
          '<div class="ad-info"><h3>' + esc(a.title) + '</h3><p style="margin:4px 0;color:var(--muted);font-size:14px">' + esc(String(a.description).slice(0, 300)) + '</p>' +
          '<div class="meta"><span>' + esc(a.category) + '</span><span>' + esc(a.city) + '</span><span>' + esc(t('from')) + ': ' + esc(a.display_name) + ' ' + esc(ident(a.phone)) + '</span></div></div>' +
          '<div class="ad-actions"><span class="price">' + esc(A.money(a.price_rub)) + '</span><div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">' +
          '<button class="btn btn-sm btn-primary" data-approve="' + a.id + '">' + esc(t('approve')) + '</button>' +
          '<button class="btn btn-sm" data-reject="' + a.id + '">' + esc(t('reject')) + '</button></div></div></div>';
      }).join('');
    },

    complaints: async function () {
      var d = await A.get('/api/admin/complaints');
      var items = d.items || [];
      if (!items.length) { body.innerHTML = '<p style="color:var(--muted)">' + esc(t('noComplaints')) + '</p>'; return; }
      body.innerHTML = table(['#', t('target'), t('details'), t('from'), ''], items.map(function (c) {
        var acts = '<button class="btn btn-sm" data-cres="' + c.id + '" data-act="dismiss">' + esc(t('dismiss')) + '</button>' +
          (c.target_type === 'ad' ? ' <button class="btn btn-sm" data-cres="' + c.id + '" data-act="remove_ad">' + esc(t('removeAd')) + '</button>' : '') +
          (c.target_type === 'user' ? ' <button class="btn btn-sm" data-cres="' + c.id + '" data-act="block_user">' + esc(t('blockUser')) + '</button>' : '');
        return '<tr><td>' + c.id + '</td><td>' + esc(c.target_type) + ' #' + c.target_id + '</td><td>' + esc(c.reason) + '</td><td>' + esc(ident(c.reporter_phone)) + '</td><td>' + acts + '</td></tr>';
      }));
    },

    users: async function (query) {
      var d = await A.get('/api/admin/users', { q: query || '' });
      var rows = (d.items || []).map(function (u) {
        var roleCell = isAdmin
          ? '<select data-role="' + u.id + '"><option value="user"' + (u.role === 'user' ? ' selected' : '') + '>user</option><option value="moderator"' + (u.role === 'moderator' ? ' selected' : '') + '>moderator</option><option value="admin"' + (u.role === 'admin' ? ' selected' : '') + '>admin</option></select>'
          : esc(u.role);
        var blockCell = isAdmin ? '<button class="btn btn-sm" data-block="' + u.id + '" data-to="' + (u.is_blocked ? 0 : 1) + '">' + esc(u.is_blocked ? t('unblock') : t('block')) + '</button>' : '';
        return '<tr><td>' + u.id + '</td><td>' + esc(u.display_name) + '</td><td>' + esc(ident(u.phone)) + '</td><td>' + roleCell + '</td><td>' + (u.is_blocked ? esc(t('blocked')) : '') + '</td><td>' + blockCell + '</td></tr>';
      });
      body.innerHTML = '<div style="display:flex;gap:8px;margin-bottom:12px"><input id="adm-q" placeholder="' + esc(t('search')) + '" value="' + esc(query || '') + '" style="flex:1"><button class="btn" id="adm-find">' + esc(t('find')) + '</button></div>' +
        table(['#', 'Name', 'Contact', t('role'), '', ''], rows);
    },

    tariffs: async function () {
      var d = await A.get('/api/admin/tariffs');
      body.innerHTML = table([t('tariff'), t('price') + ' (' + A.currency + ')', t('active'), ''], (d.items || []).map(function (x) {
        return '<tr><td>' + esc(x.title) + ' <small>(' + esc(x.code) + ')</small></td>' +
          '<td><input type="number" min="0" step="0.01" value="' + x.price_rub + '" data-tprice="' + esc(x.code) + '" style="width:110px"></td>' +
          '<td><input type="checkbox" data-tactive="' + esc(x.code) + '"' + (x.active ? ' checked' : '') + '></td>' +
          '<td><button class="btn btn-sm btn-primary" data-tsave="' + esc(x.code) + '">' + esc(t('save')) + '</button></td></tr>';
      }));
    },

    log: async function () {
      var d = await A.get('/api/admin/log');
      body.innerHTML = table([t('date'), t('actor'), t('action'), t('target'), t('details')], (d.items || []).map(function (r) {
        return '<tr><td>' + esc(r.created_at) + '</td><td>' + esc(r.actor_id) + '</td><td>' + esc(r.action) + '</td><td>' + esc(r.target) + '</td><td>' + esc(r.details || '') + '</td></tr>';
      }));
    }
  };

  var current = 'stats';
  async function show(name, arg) {
    current = name;
    Array.prototype.forEach.call(document.querySelectorAll('[data-tab]'), function (b) {
      b.classList.toggle('btn-primary', b.getAttribute('data-tab') === name);
    });
    try { await views[name](arg); } catch (e) { fail(e); }
  }

  function bind() {
    host.addEventListener('click', function (e) {
      var tab = e.target.closest('[data-tab]');
      if (tab) { show(tab.getAttribute('data-tab')); return; }
      var ap = e.target.closest('[data-approve]');
      if (ap) { act('/api/admin/ads/approve', { id: Number(ap.getAttribute('data-approve')) }, function () { show('moderation'); }); return; }
      var rj = e.target.closest('[data-reject]');
      if (rj) {
        var reason = prompt(t('reasonAsk'));
        if (!reason || reason.trim().length < 3) return;
        act('/api/admin/ads/reject', { id: Number(rj.getAttribute('data-reject')), reason: reason.trim() }, function () { show('moderation'); });
        return;
      }
      var cr = e.target.closest('[data-cres]');
      if (cr) { act('/api/admin/complaints/resolve', { id: Number(cr.getAttribute('data-cres')), action: cr.getAttribute('data-act') }, function () { show('complaints'); }); return; }
      var bl = e.target.closest('[data-block]');
      if (bl) { act('/api/admin/users/block', { id: Number(bl.getAttribute('data-block')), blocked: bl.getAttribute('data-to') === '1' }, function () { show('users', ($('#adm-q') || {}).value); }); return; }
      if (e.target.closest('#adm-find')) { show('users', ($('#adm-q') || {}).value); return; }
      var ts = e.target.closest('[data-tsave]');
      if (ts) {
        var code = ts.getAttribute('data-tsave');
        var price = $('[data-tprice="' + code + '"]').value;
        var on = $('[data-tactive="' + code + '"]').checked;
        act('/api/admin/tariffs/update', { code: code, price_rub: Number(price), active: on }, null);
      }
    });
    host.addEventListener('change', function (e) {
      var r = e.target.closest('[data-role]');
      if (r) act('/api/admin/users/role', { id: Number(r.getAttribute('data-role')), role: r.value }, null);
    });
  }

  async function init() {
    var me;
    try { me = (await A.get('/api/profile/summary')).user; } catch (e) {
      if (e.status === 401) { go('/auth/login/'); return; }
      host.insertAdjacentHTML('beforeend', '<p style="color:var(--danger)">' + esc(e.message) + '</p>');
      return;
    }
    if (!me || (me.role !== 'admin' && me.role !== 'moderator')) {
      host.insertAdjacentHTML('beforeend', '<p style="color:var(--danger)">' + esc(t('noAccess')) + '</p>');
      return;
    }
    isAdmin = me.role === 'admin';
    var tabs = ['stats', 'moderation', 'complaints', 'users'].concat(isAdmin ? ['tariffs', 'log'] : []);
    host.insertAdjacentHTML('beforeend',
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">' + tabs.map(function (k) { return '<button class="btn btn-sm" data-tab="' + k + '">' + esc(t(k)) + '</button>'; }).join('') + '</div><div id="adm-body"></div>');
    body = $('#adm-body');
    bind();
    show('stats');
  }

  init();
})();
