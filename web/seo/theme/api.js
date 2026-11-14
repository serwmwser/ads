(function () {
  'use strict';

  var cfg = window.ADS_CONFIG || {};
  var html = document.documentElement;
  var MARKET = cfg.market || html.getAttribute('data-market') || 'ru';
  var API = (cfg.api != null ? cfg.api : html.getAttribute('data-api') || '').replace(/\/+$/, '');
  var LOCALE = cfg.locale || (MARKET === 'ru' ? 'ru-RU' : 'en-US');
  var CURRENCY = cfg.currency || (MARKET === 'ru' ? 'RUB' : 'USD');

  var KEY_TOKEN = 'ads.token.v1';
  var KEY_USER = 'ads.user.v1';

  function store(key, value) {
    try {
      if (value == null) localStorage.removeItem(key);
      else localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
    } catch (e) {}
  }
  function load(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }

  function ApiError(message, status, data) {
    this.name = 'ApiError';
    this.message = message;
    this.status = status;
    this.data = data;
  }
  ApiError.prototype = Object.create(Error.prototype);

  async function request(method, path, body) {
    var headers = { Accept: 'application/json' };
    var token = load(KEY_TOKEN);
    if (token) headers.Authorization = 'Bearer ' + token;
    var init = { method: method, headers: headers, credentials: 'include' };
    if (body !== undefined && method !== 'GET') {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    var res;
    try {
      res = await fetch(API + path, init);
    } catch (e) {
      throw new ApiError(MARKET === 'ru' ? 'Нет связи с сервером. Проверьте интернет.' : 'Cannot reach the server. Check your connection.', 0, null);
    }
    var data = null;
    try { data = await res.json(); } catch (e) { data = null; }
    if (res.status === 401) { store(KEY_TOKEN, null); store(KEY_USER, null); }
    if (!res.ok || (data && data.ok === false)) {
      throw new ApiError((data && data.error) || ('HTTP ' + res.status), res.status, data);
    }
    return data;
  }

  function qs(params) {
    var parts = [];
    Object.keys(params || {}).forEach(function (k) {
      var v = params[k];
      if (v !== undefined && v !== null && v !== '') parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(v));
    });
    return parts.length ? '?' + parts.join('&') : '';
  }

  function cacheUser(user) {
    if (!user) return;
    store(KEY_USER, {
      id: user.id, phone: user.phone || '', email: user.email || '',
      displayName: user.display_name || user.displayName || '', role: user.role || 'user'
    });
  }

  var formatter = null;
  function money(value) {
    if (!formatter) {
      try { formatter = new Intl.NumberFormat(LOCALE, { style: 'currency', currency: CURRENCY, maximumFractionDigits: 2, minimumFractionDigits: 0 }); }
      catch (e) { formatter = { format: function (n) { return n + ' ' + CURRENCY; } }; }
    }
    return formatter.format(Number(value) || 0);
  }

  function shrink(file, maxSide, quality) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        try {
          var w = img.naturalWidth, h = img.naturalHeight;
          var k = Math.min(1, maxSide / Math.max(w, h));
          var c = document.createElement('canvas');
          c.width = Math.max(1, Math.round(w * k));
          c.height = Math.max(1, Math.round(h * k));
          var ctx = c.getContext('2d');
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, c.width, c.height);
          ctx.drawImage(img, 0, 0, c.width, c.height);
          URL.revokeObjectURL(url);
          resolve(c.toDataURL('image/jpeg', quality));
        } catch (e) { reject(e); }
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('image')); };
      img.src = url;
    });
  }

  var AdsApi = {
    market: MARKET, locale: LOCALE, currency: CURRENCY, base: API,
    ApiError: ApiError, money: money, qs: qs,
    get: function (path, params) { return request('GET', path + qs(params)); },
    post: function (path, body) { return request('POST', path, body || {}); },
    del: function (path, body) { return request('DELETE', path, body || {}); },

    cachedUser: function () {
      var raw = load(KEY_USER);
      if (!raw) return null;
      try { return JSON.parse(raw); } catch (e) { return null; }
    },
    hasSession: function () { return !!load(KEY_TOKEN) || !!load(KEY_USER); },

    requestCode: function (identifier) {
      if (MARKET === 'ru') return request('POST', '/api/auth/phone/request', { phone: identifier });
      return request('POST', '/api/auth/email/request', { email: identifier });
    },
    verifyCode: async function (identifier, code) {
      var data = MARKET === 'ru'
        ? await request('POST', '/api/auth/phone/verify', { phone: identifier, code: code })
        : await request('POST', '/api/auth/email/verify', { email: identifier, code: code });
      if (data.token) store(KEY_TOKEN, data.token);
      cacheUser(data.user);
      return data;
    },
    me: async function () {
      var data = await request('GET', '/api/auth/me');
      cacheUser(data.user);
      return data;
    },
    logout: async function () {
      try { await request('POST', '/api/auth/logout', {}); } catch (e) {}
      store(KEY_TOKEN, null);
      store(KEY_USER, null);
    },
    deleteAccount: async function () {
      var data = await request('DELETE', '/api/auth/account', {});
      store(KEY_TOKEN, null);
      store(KEY_USER, null);
      return data;
    },

    regions: function () { return request('GET', '/api/geo/regions'); },
    cities: function (region) { return request('GET', '/api/geo/cities' + qs({ region: region })); },
    categories: function () { return request('GET', '/api/categories'); },

    feed: function (filters) { return request('GET', '/api/ads' + qs(filters)); },
    item: function (id) { return request('GET', '/api/ads/item' + qs({ id: id })); },
    mine: function () { return request('GET', '/api/ads/mine'); },
    createAd: function (ad) { return request('POST', '/api/ads/create', ad); },
    updateAd: function (ad) { return request('POST', '/api/ads/update', ad); },
    removeAd: function (id) { return request('POST', '/api/ads/remove', { id: id }); },
    toggleFavorite: function (id) { return request('POST', '/api/ads/favorite', { id: id }); },
    favorites: function () { return request('GET', '/api/ads/favorites'); },

    tariffs: function () { return request('GET', '/api/payments/tariffs'); },
    createPayment: function (tariff, method) { return request('POST', '/api/payments/create', { tariff: tariff, method: method || 'checkout' }); },
    myPayments: function () { return request('GET', '/api/payments/my'); },

    uploadPhoto: async function (file) {
      var bad = MARKET === 'ru' ? 'Выберите фото в формате JPEG, PNG или WebP' : 'Choose a JPEG, PNG or WebP image';
      if (!file || !/^image\/(jpeg|png|webp)$/.test(file.type)) throw new ApiError(bad, 400, null);
      var dataUrl;
      try { dataUrl = await shrink(file, 1600, 0.82); } catch (e) { throw new ApiError(bad, 400, null); }
      if (dataUrl.length > 3200000) {
        try { dataUrl = await shrink(file, 1200, 0.7); } catch (e) { throw new ApiError(bad, 400, null); }
      }
      var data = await request('POST', '/api/upload/photo', { data: dataUrl });
      return data.url;
    }
  };

  window.AdsApi = AdsApi;
})();
