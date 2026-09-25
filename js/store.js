/* 数据层：localStorage 读写、金额计算、单号分配 */
var Store = (function () {
  var KEYS = {
    products: 'bm.products.v2',
    orders: 'bm.orders.v2',
    settings: 'bm.settings.v2',
    seq: 'bm.seq.v2',
    plates: 'bm.plates.v2',
    pin: 'bm.pin.v2'
  };

  var DEFAULT_PRODUCTS = [
    { id: 'p_ginger', name: '生姜', price: 6, unit: '斤', emoji: '🌱', sort: 0 },
    { id: 'p_garlic', name: '大蒜', price: 5, unit: '斤', emoji: '🧄', sort: 1 },
    { id: 'p_yam', name: '山药', price: 9, unit: '斤', emoji: '🥔', sort: 2 },
    { id: 'p_sweetpotato', name: '红薯', price: 3, unit: '斤', emoji: '🍠', sort: 3 }
  ];

  var DEFAULT_SETTINGS = {
    storeName: '蔬菜批发',
    subtitle: '姜蒜山药红薯 · 现称现卖',
    footer: '货已核对 · 谢谢惠顾'
  };

  var MAX_PLATES = 10;
  var errorHandler = null;

  /* ---------- 底层读写 ---------- */

  function read(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      if (raw == null) return fallback;
      var val = JSON.parse(raw);
      return val == null ? fallback : val;
    } catch (e) {
      return fallback;
    }
  }

  function write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      // 隐私模式或配额写满时静默失败会让用户以为存上了，必须上报
      if (errorHandler) errorHandler(e);
      return false;
    }
  }

  /* ---------- 数值与时间 ---------- */

  function round2(n) {
    var v = Number(n);
    if (!isFinite(v)) return 0;
    return Math.round(v * 100) / 100;
  }

  function lineAmount(qty, price) {
    return round2(Number(qty) * Number(price));
  }

  function orderTotal(lines) {
    var sum = 0;
    (lines || []).forEach(function (l) {
      sum += l.amount != null ? Number(l.amount) : lineAmount(l.qty, l.price);
    });
    return round2(sum);
  }

  function pad2(n) {
    return String(n).length < 2 ? '0' + n : String(n);
  }

  function dayKey(ts) {
    var d = new Date(ts);
    return '' + d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate());
  }

  function monthKey(ts) {
    var d = new Date(ts);
    return '' + d.getFullYear() + pad2(d.getMonth() + 1);
  }

  function fmtDateTime(ts) {
    var d = new Date(ts);
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) +
      ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }

  function fmtDay(ts) {
    var d = new Date(ts);
    var week = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + ' 周' + week;
  }

  function uid(prefix) {
    return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  /* ---------- 单号 ---------- */

  function buildNo(day, seq) {
    return day + '-' + ('00' + seq).slice(-3);
  }

  // 只看不写，草稿态展示用
  function peekOrderNo(ts) {
    var day = dayKey(ts);
    var map = read(KEYS.seq, {});
    return buildNo(day, (map[day] || 0) + 1);
  }

  // 结单落库时才真正消耗一个号
  function allocOrderNo(ts) {
    var day = dayKey(ts);
    var map = read(KEYS.seq, {});
    map[day] = (map[day] || 0) + 1;
    write(KEYS.seq, map);
    return buildNo(day, map[day]);
  }

  /* ---------- 商品 ---------- */

  function getProducts() {
    var list = read(KEYS.products, null);
    if (!list || !list.length) {
      list = DEFAULT_PRODUCTS.map(function (p) { return { id: p.id, name: p.name, price: p.price, unit: p.unit, emoji: p.emoji, sort: p.sort }; });
      write(KEYS.products, list);
    }
    return list.slice().sort(function (a, b) { return (a.sort || 0) - (b.sort || 0); });
  }

  function saveProducts(list) {
    list.forEach(function (p, i) { p.sort = i; });
    return write(KEYS.products, list);
  }

  function getProduct(id) {
    var found = null;
    getProducts().forEach(function (p) { if (p.id === id) found = p; });
    return found;
  }

  function addProduct(data) {
    var list = getProducts();
    var item = {
      id: uid('p_'),
      name: data.name,
      price: round2(data.price),
      unit: data.unit || '斤',
      emoji: data.emoji || '📦',
      sort: list.length
    };
    list.push(item);
    saveProducts(list);
    return item;
  }

  function updateProduct(id, patch) {
    var list = getProducts();
    list.forEach(function (p) {
      if (p.id !== id) return;
      if (patch.name != null) p.name = patch.name;
      if (patch.price != null) p.price = round2(patch.price);
      if (patch.unit != null) p.unit = patch.unit;
      if (patch.emoji != null) p.emoji = patch.emoji;
    });
    return saveProducts(list);
  }

  function removeProduct(id) {
    // 历史单据存的是行快照，这里真删不会造成引用悬空
    var list = getProducts().filter(function (p) { return p.id !== id; });
    return saveProducts(list);
  }

  function moveProduct(id, dir) {
    var list = getProducts();
    var idx = -1;
    list.forEach(function (p, i) { if (p.id === id) idx = i; });
    var target = idx + dir;
    if (idx < 0 || target < 0 || target >= list.length) return false;
    var tmp = list[idx];
    list[idx] = list[target];
    list[target] = tmp;
    return saveProducts(list);
  }

  /* ---------- 订单 ---------- */

  function getOrders() {
    var list = read(KEYS.orders, []);
    return list.slice().sort(function (a, b) { return b.createdAt - a.createdAt; });
  }

  function getOrder(id) {
    var found = null;
    getOrders().forEach(function (o) { if (o.id === id) found = o; });
    return found;
  }

  // lines 里存的是值拷贝，之后改价改名删品类都不会篡改历史
  function addOrder(draft) {
    var createdAt = Date.now();
    var lines = (draft.lines || []).map(function (l) {
      return {
        name: l.name,
        unit: l.unit,
        price: round2(l.price),
        qty: round2(l.qty),
        amount: lineAmount(l.qty, l.price)
      };
    });
    var order = {
      id: uid('o_'),
      no: allocOrderNo(createdAt),
      createdAt: createdAt,
      plate: draft.plate || '',
      note: draft.note || '',
      lines: lines,
      total: orderTotal(lines)
    };
    var list = read(KEYS.orders, []);
    list.unshift(order);
    write(KEYS.orders, list);
    if (order.plate) rememberPlate(order.plate);
    return order;
  }

  function removeOrder(id) {
    var list = read(KEYS.orders, []).filter(function (o) { return o.id !== id; });
    return write(KEYS.orders, list);
  }

  function getStats() {
    var now = Date.now();
    var today = dayKey(now);
    var month = monthKey(now);
    var s = { todayCount: 0, todayTotal: 0, monthCount: 0, monthTotal: 0 };
    getOrders().forEach(function (o) {
      var total = o.total != null ? o.total : orderTotal(o.lines);
      if (monthKey(o.createdAt) === month) {
        s.monthCount++;
        s.monthTotal += total;
      }
      if (dayKey(o.createdAt) === today) {
        s.todayCount++;
        s.todayTotal += total;
      }
    });
    s.todayTotal = round2(s.todayTotal);
    s.monthTotal = round2(s.monthTotal);
    return s;
  }

  function groupOrdersByDay() {
    var groups = [];
    var index = {};
    getOrders().forEach(function (o) {
      var key = dayKey(o.createdAt);
      if (!index[key]) {
        index[key] = { key: key, label: fmtDay(o.createdAt), orders: [], total: 0 };
        groups.push(index[key]);
      }
      index[key].orders.push(o);
      index[key].total += o.total != null ? o.total : orderTotal(o.lines);
    });
    groups.forEach(function (g) { g.total = round2(g.total); });
    return groups;
  }

  /* ---------- 设置 ---------- */

  function getSettings() {
    var s = read(KEYS.settings, {});
    return {
      storeName: s.storeName != null ? s.storeName : DEFAULT_SETTINGS.storeName,
      subtitle: s.subtitle != null ? s.subtitle : DEFAULT_SETTINGS.subtitle,
      footer: s.footer != null ? s.footer : DEFAULT_SETTINGS.footer
    };
  }

  function saveSettings(patch) {
    var s = getSettings();
    if (patch.storeName != null) s.storeName = patch.storeName;
    if (patch.subtitle != null) s.subtitle = patch.subtitle;
    if (patch.footer != null) s.footer = patch.footer;
    return write(KEYS.settings, s);
  }

  /* ---------- 车号 ---------- */

  function getPlates() {
    return read(KEYS.plates, []);
  }

  function rememberPlate(plate) {
    if (!plate) return;
    var list = getPlates().filter(function (p) { return p !== plate; });
    list.unshift(plate);
    write(KEYS.plates, list.slice(0, MAX_PLATES));
  }

  function forgetPlate(plate) {
    write(KEYS.plates, getPlates().filter(function (p) { return p !== plate; }));
  }

  /* ---------- 开机密码（只挡住界面，不是加密） ---------- */

  function pinSalt() {
    var s = '';
    for (var i = 0; i < 16; i++) s += ((Math.random() * 16) | 0).toString(16);
    return s;
  }

  function hashPin(pin, salt) {
    var str = String(salt) + '#' + String(pin) + '#veg-bill-pin';
    var a = 2166136261;
    var extra = 0;
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      a ^= c;
      a = Math.imul(a, 16777619);
      extra = (extra * 33 + c) >>> 0;
    }
    return (a >>> 0).toString(16) + extra.toString(16);
  }

  function getPinRecord() {
    var r = read(KEYS.pin, null);
    if (!r || !r.hash || !r.salt) return null;
    return r;
  }

  function hasPin() {
    return !!getPinRecord();
  }

  function setPin(pin) {
    pin = String(pin || '');
    if (!/^\d{4,6}$/.test(pin)) return false;
    var salt = pinSalt();
    return write(KEYS.pin, { salt: salt, hash: hashPin(pin, salt), len: pin.length });
  }

  function checkPin(pin) {
    var r = getPinRecord();
    if (!r) return true;
    return r.hash === hashPin(String(pin), r.salt);
  }

  function pinLen() {
    var r = getPinRecord();
    return r && r.len ? r.len : 0;
  }

  function clearPin() {
    try { localStorage.removeItem(KEYS.pin); } catch (e) { /* 清不掉也没有补救手段 */ }
  }

  /* ---------- 备份 ---------- */

  function exportAll() {
    return {
      app: 'bm-quick-bill',
      version: 1,
      exportedAt: Date.now(),
      products: read(KEYS.products, []),
      orders: read(KEYS.orders, []),
      settings: read(KEYS.settings, {}),
      seq: read(KEYS.seq, {}),
      plates: read(KEYS.plates, []),
      pin: read(KEYS.pin, null)
    };
  }

  function importAll(data) {
    if (!data || data.app !== 'bm-quick-bill') {
      return { ok: false, message: '这不是本应用导出的备份文件' };
    }
    if (!Array.isArray(data.orders) || !Array.isArray(data.products)) {
      return { ok: false, message: '备份内容不完整，无法导入' };
    }
    write(KEYS.products, data.products);
    write(KEYS.orders, data.orders);
    write(KEYS.settings, data.settings || {});
    write(KEYS.seq, data.seq || {});
    write(KEYS.plates, data.plates || []);
    if (Object.prototype.hasOwnProperty.call(data, 'pin')) {
      if (data.pin) write(KEYS.pin, data.pin);
      else try { localStorage.removeItem(KEYS.pin); } catch (e) { /* ignore */ }
    }
    return {
      ok: true,
      message: '已恢复 ' + data.orders.length + ' 张单据、' + data.products.length + ' 个品类'
    };
  }

  function clearAll() {
    Object.keys(KEYS).forEach(function (k) {
      try { localStorage.removeItem(KEYS[k]); } catch (e) { /* 清不掉也没有补救手段 */ }
    });
  }

  return {
    setErrorHandler: function (fn) { errorHandler = fn; },
    round2: round2,
    lineAmount: lineAmount,
    orderTotal: orderTotal,
    dayKey: dayKey,
    fmtDateTime: fmtDateTime,
    fmtDay: fmtDay,
    peekOrderNo: peekOrderNo,
    getProducts: getProducts,
    getProduct: getProduct,
    addProduct: addProduct,
    updateProduct: updateProduct,
    removeProduct: removeProduct,
    moveProduct: moveProduct,
    getOrders: getOrders,
    getOrder: getOrder,
    addOrder: addOrder,
    removeOrder: removeOrder,
    getStats: getStats,
    groupOrdersByDay: groupOrdersByDay,
    getSettings: getSettings,
    saveSettings: saveSettings,
    getPlates: getPlates,
    rememberPlate: rememberPlate,
    forgetPlate: forgetPlate,
    hasPin: hasPin,
    setPin: setPin,
    checkPin: checkPin,
    pinLen: pinLen,
    clearPin: clearPin,
    exportAll: exportAll,
    importAll: importAll,
    clearAll: clearAll
  };
})();
