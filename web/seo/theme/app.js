(function () {
  'use strict';
  var BASE = document.documentElement.getAttribute('data-base') || '';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var rub = new Intl.NumberFormat('ru-RU');
  var esc = function (v) { return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
  var KEY = 'ads.board.v1';
  var state = { drafts: [], favs: [], views: [] };
  try { var raw = localStorage.getItem(KEY); if (raw) state = Object.assign(state, JSON.parse(raw)); } catch (e) {}
  var save = function () { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} };

  function toast(text, kind, action) {
    var box = $('[data-toasts]');
    var el = document.createElement('div');
    el.className = 'toast ' + (kind || 'ok');
    el.innerHTML = '<span>' + esc(text) + '</span>';
    if (action) {
      var b = document.createElement('button');
      b.textContent = action.label;
      b.onclick = function () { action.run(); el.remove(); };
      el.appendChild(b);
    }
    box.appendChild(el);
    setTimeout(function () { el.remove(); }, action ? 7000 : 3600);
  }

  /* theme */
  var root = document.documentElement;
  var stored = null;
  try { stored = localStorage.getItem('ads.theme'); } catch (e) {}
  var dark = stored ? stored === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
  applyTheme(dark);
  function applyTheme(on) {
    root.setAttribute('data-theme', on ? 'dark' : 'light');
    var m = $('meta[name=theme-color]'); if (m) m.setAttribute('content', on ? '#0E131C' : '#F7F2E8');
    var t = $('[data-theme-toggle]'); if (t) t.innerHTML = on ? '&#9728;' : '&#9790;';
  }
  var tbtn = $('[data-theme-toggle]');
  if (tbtn) tbtn.addEventListener('click', function () {
    dark = !dark; applyTheme(dark);
    try { localStorage.setItem('ads.theme', dark ? 'dark' : 'light'); } catch (e) {}
  });

  /* header, progress, mobile nav */
  var hdr = $('#hdr'), prog = $('[data-progress]');
  function onScroll() {
    var y = window.scrollY || 0;
    if (hdr) hdr.classList.toggle('stuck', y > 8);
    var h = document.body.scrollHeight - window.innerHeight;
    if (prog) prog.style.width = (h > 0 ? (y / h) * 100 : 0) + '%';
  }
  window.addEventListener('scroll', onScroll, { passive: true }); onScroll();
  var burger = $('[data-nav-toggle]'), mnav = $('[data-mnav]');
  if (burger) burger.addEventListener('click', function () {
    var open = mnav.classList.toggle('open');
    burger.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  if (mnav) mnav.addEventListener('click', function (e) { if (e.target.tagName === 'A') mnav.classList.remove('open'); });

  /* reveal + counters + bars */
  var io = 'IntersectionObserver' in window ? new IntersectionObserver(function (entries) {
    entries.forEach(function (en) {
      if (!en.isIntersecting) return;
      en.target.classList.add('in');
      $$('[data-count]', en.target).forEach(countUp);
      $$('.bar u', en.target).forEach(function (u) { u.style.width = (u.getAttribute('data-w') || 0) + '%'; });
      io.unobserve(en.target);
    });
  }, { threshold: 0.16 }) : null;
  $$('.rev').forEach(function (el) { if (io) io.observe(el); else el.classList.add('in'); });
  function countUp(el) {
    if (el.dataset.done) return; el.dataset.done = '1';
    var to = Number(el.getAttribute('data-count')) || 0, t0 = performance.now(), dur = 1100;
    (function step(t) {
      var k = Math.min(1, (t - t0) / dur);
      el.textContent = rub.format(Math.round(to * (1 - Math.pow(1 - k, 3))));
      if (k < 1) requestAnimationFrame(step);
    })(t0);
  }

  /* hero tilt */
  var stack = $('.stack');
  if (stack && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    stack.addEventListener('pointermove', function (e) {
      var r = stack.getBoundingClientRect();
      var dx = (e.clientX - r.left) / r.width - 0.5, dy = (e.clientY - r.top) / r.height - 0.5;
      $$('.scard', stack).forEach(function (c, i) {
        c.style.transform = 'rotate(' + ([-7, 3, -2][i] + dx * 5) + 'deg) translate3d(' + (dx * (14 + i * 8)) + 'px,' + (dy * (10 + i * 6)) + 'px,0)';
      });
    });
    stack.addEventListener('pointerleave', function () {
      $$('.scard', stack).forEach(function (c, i) { c.style.transform = 'rotate(' + [-7, 3, -2][i] + 'deg)'; });
    });
  }

  /* overlays */
  var lastFocus = null;
  function openOverlay(node) {
    lastFocus = document.activeElement;
    var ov = document.createElement('div');
    ov.className = 'overlay'; ov.appendChild(node);
    ov.addEventListener('mousedown', function (e) { if (e.target === ov) close(); });
    document.body.appendChild(ov); document.body.classList.add('lock');
    requestAnimationFrame(function () { ov.classList.add('show'); });
    var f = node.querySelector('input,select,textarea,button'); if (f) f.focus();
    function close() {
      ov.classList.remove('show');
      setTimeout(function () { ov.remove(); document.body.classList.remove('lock'); if (lastFocus) lastFocus.focus(); }, 220);
      document.removeEventListener('keydown', key);
    }
    function key(e) {
      if (e.key === 'Escape') close();
      if (e.key === 'Tab') {
        var f = $$('a[href],button,input,select,textarea', node).filter(function (x) { return !x.disabled; });
        if (!f.length) return;
        var first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
    document.addEventListener('keydown', key);
    return close;
  }

  /* geo search palette */
  var geoData = null, geoLoading = false;
  function loadGeo(cb) {
    if (geoData) return cb();
    if (geoLoading) return;
    geoLoading = true;
    var s = document.createElement('script');
    s.src = BASE + '/assets/geo-search.js';
    s.onload = function () { geoData = window.ADS_GEO || []; geoLoading = false; cb(); };
    s.onerror = function () { geoLoading = false; toast('Справочник городов не загрузился', 'err'); };
    document.head.appendChild(s);
  }
  function openPalette() {
    var box = document.createElement('div');
    box.className = 'palette';
    box.innerHTML = '<input type="search" placeholder="Город, регион или категория…" aria-label="Поиск">' +
      '<div class="pres" role="listbox"></div>';
    var close = openOverlay(box);
    var input = $('input', box), res = $('.pres', box), items = [], active = 0;
    function render(list) {
      items = list.slice(0, 40); active = 0;
      res.innerHTML = items.length ? items.map(function (it, i) {
        return '<a href="' + BASE + it.url + '" class="' + (i === 0 ? 'on' : '') + '"><span>' + esc(it.name) + '</span><small>' + esc(it.hint) + '</small></a>';
      }).join('') : '<div class="empty" style="border:none">Ничего не найдено</div>';
    }
    function source() {
      var cats = (window.ADS_CATS || []).map(function (c) { return { name: c.name, hint: 'Категория', url: '/c/' + c.slug + '/' }; });
      var geo = (geoData || []).map(function (c) { return { name: c.n, hint: c.r, url: '/city/' + c.s + '/' }; });
      return cats.concat(geo);
    }
    function filter() {
      var q = input.value.trim().toLowerCase();
      if (!q) { render(source().slice(0, 24)); return; }
      render(source().filter(function (x) { return x.name.toLowerCase().indexOf(q) >= 0 || x.hint.toLowerCase().indexOf(q) >= 0; }));
    }
    input.addEventListener('input', filter);
    input.addEventListener('keydown', function (e) {
      var links = $$('a', res);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (!links.length) return;
        active = (active + (e.key === 'ArrowDown' ? 1 : -1) + links.length) % links.length;
        links.forEach(function (l, i) { l.classList.toggle('on', i === active); });
        links[active].scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter' && links[active]) { window.location.href = links[active].href; }
    });
    loadGeo(filter); filter();
  }
  $$('[data-search-open]').forEach(function (b) { b.addEventListener('click', openPalette); });
  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openPalette(); }
  });

  /* board */
  var board = $('[data-board]');
  if (!board) return;
  var seed = (window.ADS_DEMO || []).slice();
  var cats = window.ADS_CATS || [];
  var filters = { q: '', cat: board.getAttribute('data-cat') || '', city: board.getAttribute('data-city') || '', sort: 'new', fav: false };
  var selected = [];
  var grid = $('[data-grid]', board), countEl = $('[data-count-label]', board), bulk = $('[data-bulk]', board);
  var cities = [];
  seed.forEach(function (a) { if (cities.indexOf(a.city) < 0) cities.push(a.city); });
  var citySel = $('[data-f-city]', board);
  if (citySel) {
    cities.sort(function (a, b) { return a.localeCompare(b, 'ru'); }).forEach(function (c) {
      var o = document.createElement('option'); o.value = c; o.textContent = c; citySel.appendChild(o);
    });
    citySel.value = filters.city;
  }
  var catSel = $('[data-f-cat]', board); if (catSel) catSel.value = filters.cat;

  function all() { return state.drafts.concat(seed); }
  function visible() {
    var list = all().filter(function (a) {
      if (filters.cat && a.cat !== filters.cat) return false;
      if (filters.city && a.city !== filters.city) return false;
      if (filters.fav && state.favs.indexOf(a.id) < 0) return false;
      if (filters.q) {
        var t = (a.title + ' ' + a.desc + ' ' + a.city).toLowerCase();
        if (t.indexOf(filters.q.toLowerCase()) < 0) return false;
      }
      return true;
    });
    var s = filters.sort;
    list.sort(function (a, b) {
      if (s === 'cheap') return a.price - b.price;
      if (s === 'expensive') return b.price - a.price;
      if (s === 'popular') return (b.views || 0) - (a.views || 0);
      return (a.days || 0) - (b.days || 0);
    });
    return list;
  }
  function ago(d) { return d === 0 ? 'сегодня' : d === 1 ? 'вчера' : d + ' дн. назад'; }
  function render() {
    var list = visible();
    countEl.textContent = rub.format(list.length) + ' ' + (list.length % 10 === 1 && list.length % 100 !== 11 ? 'объявление' : 'объявлений');
    grid.className = 'grid' + (filters.view === 'list' ? ' list' : '');
    if (!list.length) {
      grid.innerHTML = '<div class="empty" style="grid-column:1/-1"><b>Ничего не нашлось</b><p>Измените запрос или сбросьте фильтры.</p><button class="btn btn-sm" data-reset>Сбросить фильтры</button></div>';
    } else {
      grid.innerHTML = list.map(function (a) {
        var fav = state.favs.indexOf(a.id) >= 0;
        return '<article class="card" data-id="' + esc(a.id) + '"' + (a.draft ? ' draggable="true"' : '') + '>' +
          '<div class="ph" style="--h1:' + a.h1 + ';--h2:' + a.h2 + '"><b>' + a.emoji + '</b></div>' +
          (a.draft ? '<span class="badge draft">Черновик</span>' : (a.badge ? '<span class="badge">' + esc(a.badge) + '</span>' : '')) +
          '<button class="fav' + (fav ? ' on' : '') + '" data-fav="' + esc(a.id) + '" aria-label="В избранное">' + (fav ? '&#9829;' : '&#9825;') + '</button>' +
          (a.draft ? '<input class="pick" type="checkbox" data-pick="' + esc(a.id) + '"' + (selected.indexOf(a.id) >= 0 ? ' checked' : '') + ' aria-label="Выбрать">' : '') +
          '<div class="cb"><span class="price">' + rub.format(a.price) + ' &#8381;</span>' +
          '<h3>' + esc(a.title) + '</h3>' +
          '<div class="meta"><span>' + esc(a.city) + '</span><span>' + ago(a.days || 0) + '</span></div></div></article>';
      }).join('');
    }
    bulk.hidden = selected.length === 0;
    if (selected.length) $('[data-bulk-n]', bulk).textContent = selected.length;
    renderViews();
  }
  function renderViews() {
    var box = $('[data-views]', board);
    box.innerHTML = state.views.map(function (v, i) {
      return '<button class="chip" data-view="' + i + '">' + esc(v.name) + ' <x data-view-del="' + i + '">&times;</x></button>';
    }).join('') + '<button class="chip" data-view-save>+ Сохранить вид</button>' +
      '<button class="chip" data-export>Экспорт черновиков</button>';
  }
  function byId(id) { return all().filter(function (a) { return String(a.id) === String(id); })[0]; }

  function openDrawer(a) {
    var d = document.createElement('div');
    d.className = 'drawer';
    var lang = 'ru';
    d.innerHTML = '<div class="dhead"><b>' + esc(a.draft ? 'Черновик объявления' : 'Объявление') + '</b><button class="icon-btn" data-close>&times; Закрыть</button></div>' +
      '<div class="dbody"><div class="dph" style="--h1:' + a.h1 + ';--h2:' + a.h2 + '">' + a.emoji + '</div>' +
      '<span class="price" style="font-size:30px">' + rub.format(a.price) + ' &#8381;</span>' +
      '<h2 style="font-size:24px;margin:8px 0">' + esc(a.title) + '</h2>' +
      '<div class="meta" style="margin-bottom:14px"><span>' + esc(a.city) + '</span><span>' + ago(a.days || 0) + '</span><span>Продавец: ' + esc(a.seller || 'Вы') + '</span></div>' +
      '<p>' + esc(a.desc) + '</p>' +
      '<div class="tile" style="--hue:var(--warn);margin:16px 0"><b>Безопасная сделка</b><p style="margin:6px 0 0;font-size:14px">Осматривайте товар при встрече, не переводите предоплату и не сообщайте коды из СМС.</p></div>' +
      '<div class="sec-head" style="margin:18px 0 8px"><h3 style="margin:0">Чат с переводом — демо</h3><button class="btn btn-sm" data-lang>EN</button></div>' +
      '<div class="chat" data-chat></div>' +
      '<form class="frow" data-chat-form style="grid-template-columns:1fr auto"><input placeholder="Написать сообщение…" aria-label="Сообщение"><button class="btn btn-primary" type="submit">Отправить</button></form>' +
      '<div class="hero-cta" style="margin-top:16px">' +
      (a.draft ? '<button class="btn" data-edit>Редактировать</button><button class="btn" data-del style="color:var(--danger)">Удалить</button>' : '<button class="btn btn-lime" data-report>Пожаловаться</button>') +
      '<button class="btn btn-ghost" data-fav-d>' + (state.favs.indexOf(a.id) >= 0 ? 'Убрать из избранного' : 'В избранное') + '</button></div>' +
      '<p style="font-size:13px;color:var(--muted)">Витрина демонстрационная: сообщения и жалобы никуда не отправляются, черновики хранятся только в этом браузере.</p></div>';
    var close = openOverlay(d);
    var chat = $('[data-chat]', d), sent = [];
    function paint() {
      var base = (a.chat || []).map(function (m) {
        var text = lang === 'en' ? (m.en || m.ru) : m.ru;
        return '<div class="msg' + (m.who === 'me' ? ' me' : '') + '">' + esc(text) + '<i>' + (m.who === 'me' ? 'Вы' : esc(a.seller || 'Продавец')) + '</i></div>';
      });
      var extra = sent.map(function (t) { return '<div class="msg me">' + esc(t) + '<i>Вы · перевод доступен в приложении</i></div>'; });
      chat.innerHTML = base.concat(extra).join('') || '<div class="msg">Сообщений пока нет</div>';
      chat.scrollTop = chat.scrollHeight;
    }
    paint();
    $('[data-close]', d).onclick = close;
    $('[data-lang]', d).onclick = function () { lang = lang === 'ru' ? 'en' : 'ru'; this.textContent = lang === 'ru' ? 'EN' : 'RU'; paint(); };
    $('[data-chat-form]', d).onsubmit = function (e) {
      e.preventDefault();
      var i = $('input', this); var v = i.value.trim();
      if (!v) return; sent.push(v); i.value = ''; paint();
    };
    $('[data-fav-d]', d).onclick = function () { toggleFav(a.id); close(); };
    var rep = $('[data-report]', d); if (rep) rep.onclick = function () { toast('Жалоба принята в демо-режиме. В приложении её увидит модератор.', 'warn'); close(); };
    var ed = $('[data-edit]', d); if (ed) ed.onclick = function () { close(); openForm(a); };
    var del = $('[data-del]', d); if (del) del.onclick = function () { close(); removeDrafts([a.id]); };
  }

  function toggleFav(id) {
    var i = state.favs.indexOf(id);
    if (i >= 0) { state.favs.splice(i, 1); toast('Убрано из избранного'); }
    else { state.favs.push(id); toast('Добавлено в избранное'); }
    save(); render();
  }
  function removeDrafts(ids) {
    var backup = state.drafts.slice();
    state.drafts = state.drafts.filter(function (d) { return ids.indexOf(d.id) < 0; });
    selected = []; save(); render();
    toast(ids.length === 1 ? 'Черновик удалён' : 'Черновики удалены: ' + ids.length, 'warn', {
      label: 'Вернуть', run: function () { state.drafts = backup; save(); render(); toast('Восстановлено'); }
    });
  }

  function openForm(existing) {
    var m = document.createElement('div');
    m.className = 'modal';
    m.innerHTML = '<h2 style="font-size:24px">' + (existing ? 'Редактировать черновик' : 'Новое объявление') + '</h2>' +
      '<p style="color:var(--muted);font-size:14px">Черновик сохраняется в этом браузере. Публикация и оплата появятся после запуска сервера в России.</p>' +
      '<form novalidate><div class="field"><label>Заголовок</label><input name="title" maxlength="70" value="' + esc(existing ? existing.title : '') + '"><div class="err" data-e="title"></div></div>' +
      '<div class="frow"><div class="field"><label>Категория</label><select name="cat">' + cats.map(function (c) { return '<option value="' + c.slug + '"' + (existing && existing.cat === c.slug ? ' selected' : '') + '>' + esc(c.name) + '</option>'; }).join('') + '</select><div class="err" data-e="cat"></div></div>' +
      '<div class="field"><label>Город</label><input name="city" list="citylist" value="' + esc(existing ? existing.city : (filters.city || '')) + '"><datalist id="citylist">' + cities.map(function (c) { return '<option value="' + esc(c) + '">'; }).join('') + '</datalist><div class="err" data-e="city"></div></div></div>' +
      '<div class="frow"><div class="field"><label>Цена, &#8381;</label><input name="price" type="number" min="0" step="50" value="' + (existing ? existing.price : '') + '"><div class="err" data-e="price"></div></div>' +
      '<div class="field"><label>Оформление</label><select name="look"><option value="0">Тёплый</option><option value="1">Синий</option><option value="2">Ягодный</option><option value="3">Лайм</option></select></div></div>' +
      '<div class="field"><label>Описание</label><textarea name="desc" maxlength="900">' + esc(existing ? existing.desc : '') + '</textarea><div class="err" data-e="desc"></div></div>' +
      '<div class="hero-cta"><button class="btn btn-primary" type="submit">' + (existing ? 'Сохранить' : 'Добавить в ленту') + '</button><button class="btn btn-ghost" type="button" data-cancel>Отмена</button></div></form>';
    var close = openOverlay(m);
    $('[data-cancel]', m).onclick = close;
    var form = $('form', m);
    form.onsubmit = function (e) {
      e.preventDefault();
      var f = form.elements, ok = true;
      function err(n, msg) { var el = $('[data-e="' + n + '"]', m); if (el) el.textContent = msg || ''; if (msg) ok = false; }
      err('title', f.title.value.trim().length < 5 ? 'Минимум 5 символов' : '');
      err('city', f.city.value.trim().length < 2 ? 'Укажите город' : '');
      err('price', f.price.value === '' || Number(f.price.value) < 0 ? 'Укажите цену в рублях' : '');
      err('desc', f.desc.value.trim().length < 20 ? 'Опишите товар: минимум 20 символов' : '');
      if (!ok) { toast('Проверьте поля формы', 'err'); return; }
      var looks = [['#FF6B2C', '#F5A524'], ['#2B44FF', '#23B5E8'], ['#FF2E88', '#7C5CFF'], ['#C6F02B', '#0FB5A5']];
      var look = looks[Number(f.look.value) || 0];
      var cat = cats.filter(function (c) { return c.slug === f.cat.value; })[0] || cats[0];
      var item = {
        id: existing ? existing.id : 'd' + Date.now(),
        title: f.title.value.trim(), desc: f.desc.value.trim(), city: f.city.value.trim(),
        cat: f.cat.value, price: Math.round(Number(f.price.value)), days: 0, views: 0,
        seller: 'Вы', draft: true, emoji: cat ? cat.emoji : '&#128230;', h1: look[0], h2: look[1], chat: []
      };
      if (existing) state.drafts = state.drafts.map(function (d) { return d.id === existing.id ? item : d; });
      else state.drafts.unshift(item);
      save(); close(); render();
      toast(existing ? 'Черновик обновлён' : 'Объявление добавлено в ленту');
      var card = grid.querySelector('[data-id="' + item.id + '"]');
      if (card) { card.classList.add('flash'); card.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
    };
  }

  grid.addEventListener('click', function (e) {
    var fav = e.target.closest('[data-fav]');
    if (fav) { e.stopPropagation(); toggleFav(isNaN(Number(fav.dataset.fav)) ? fav.dataset.fav : Number(fav.dataset.fav)); return; }
    if (e.target.closest('[data-pick]')) return;
    if (e.target.closest('[data-reset]')) { resetFilters(); return; }
    var card = e.target.closest('.card');
    if (card) { var a = byId(card.dataset.id); if (a) openDrawer(a); }
  });
  grid.addEventListener('change', function (e) {
    var p = e.target.closest('[data-pick]');
    if (!p) return;
    var id = p.dataset.pick;
    if (p.checked) { if (selected.indexOf(id) < 0) selected.push(id); }
    else selected = selected.filter(function (x) { return x !== id; });
    render();
  });
  var dragId = null;
  grid.addEventListener('dragstart', function (e) { var c = e.target.closest('.card'); if (c) { dragId = c.dataset.id; e.dataTransfer.effectAllowed = 'move'; } });
  grid.addEventListener('dragover', function (e) { if (dragId) e.preventDefault(); });
  grid.addEventListener('drop', function (e) {
    e.preventDefault();
    var c = e.target.closest('.card'); if (!c || !dragId) return;
    var to = c.dataset.id, from = state.drafts.findIndex(function (d) { return String(d.id) === String(dragId); });
    var idx = state.drafts.findIndex(function (d) { return String(d.id) === String(to); });
    if (from < 0 || idx < 0) { dragId = null; return; }
    var moved = state.drafts.splice(from, 1)[0];
    state.drafts.splice(idx, 0, moved); dragId = null; save(); render(); toast('Порядок черновиков изменён');
  });

  function resetFilters() {
    filters.q = ''; filters.cat = ''; filters.city = ''; filters.fav = false; filters.sort = 'new';
    $('[data-f-q]', board).value = ''; catSel.value = ''; citySel.value = ''; $('[data-f-sort]', board).value = 'new';
    $('[data-f-fav]', board).classList.remove('on'); render();
  }
  $('[data-f-q]', board).addEventListener('input', function () { filters.q = this.value; render(); });
  catSel.addEventListener('change', function () { filters.cat = this.value; render(); });
  citySel.addEventListener('change', function () { filters.city = this.value; render(); });
  $('[data-f-sort]', board).addEventListener('change', function () { filters.sort = this.value; render(); });
  $('[data-f-fav]', board).addEventListener('click', function () { filters.fav = !filters.fav; this.classList.toggle('on', filters.fav); render(); });
  $('[data-view-toggle]', board).addEventListener('click', function () {
    filters.view = filters.view === 'list' ? 'grid' : 'list';
    this.textContent = filters.view === 'list' ? 'Плитка' : 'Список'; render();
  });
  $$('[data-new]').forEach(function (b) { b.addEventListener('click', function () { openForm(null); }); });
  $('[data-del-selected]', bulk).addEventListener('click', function () { removeDrafts(selected.slice()); });
  $('[data-clear-selected]', bulk).addEventListener('click', function () { selected = []; render(); });
  board.addEventListener('click', function (e) {
    if (e.target.closest('[data-view-save]')) {
      var name = 'Вид ' + (state.views.length + 1);
      state.views.push({ name: name, f: JSON.parse(JSON.stringify(filters)) }); save(); renderViews(); toast('Вид сохранён: ' + name);
    }
    var del = e.target.closest('[data-view-del]');
    if (del) { e.stopPropagation(); state.views.splice(Number(del.dataset.viewDel), 1); save(); renderViews(); return; }
    var v = e.target.closest('[data-view]');
    if (v) {
      filters = Object.assign(filters, state.views[Number(v.dataset.view)].f);
      $('[data-f-q]', board).value = filters.q; catSel.value = filters.cat; citySel.value = filters.city;
      $('[data-f-sort]', board).value = filters.sort; $('[data-f-fav]', board).classList.toggle('on', filters.fav);
      render(); toast('Вид применён');
    }
    if (e.target.closest('[data-export]')) {
      var blob = new Blob([JSON.stringify(state.drafts, null, 2)], { type: 'application/json' });
      var url = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = url; a.download = 'ads-drafts.json'; a.click();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
      toast('Черновики выгружены в JSON');
    }
  });
  $$('[data-city-chip]').forEach(function (c) {
    c.addEventListener('click', function () { filters.city = c.dataset.cityChip; citySel.value = filters.city; render(); board.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  });
  render();
})();
