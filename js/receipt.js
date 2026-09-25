/* 小票中间层：订单对象 -> 结构化文本行，供 DOM 预览与 canvas 出图共用 */
var Receipt = (function () {

  // 按 2 位收敛后去掉多余的 0；金额再用千分位逗号，1223 → 1,223
  function fmtRaw(n) {
    return String(Store.round2(n));
  }

  function fmtNum(n) {
    var s = fmtRaw(n);
    var sign = '';
    if (s.charAt(0) === '-') {
      sign = '-';
      s = s.slice(1);
    }
    var parts = s.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return sign + parts.join('.');
  }

  function amountOf(line) {
    return line.amount != null ? line.amount : Store.lineAmount(line.qty, line.price);
  }

  function detailText(line) {
    return fmtNum(line.price) + '元 × ' + fmtNum(line.qty) + (line.unit || '');
  }

  function amountText(line) {
    return fmtNum(amountOf(line)) + '元';
  }

  function pricePerUnit(price, unit) {
    return unit ? fmtNum(price) + '元/' + unit : fmtNum(price) + '元';
  }

  function buildMeta(order) {
    var meta = [];
    meta.push({ label: '时间', value: Store.fmtDateTime(order.createdAt) });
    if (order.plate) meta.push({ label: '车号', value: order.plate });
    if (order.note) meta.push({ label: '备注', value: order.note });
    return meta;
  }

  function build(order) {
    var s = Store.getSettings();
    var lines = order.lines || [];
    return {
      storeName: s.storeName,
      subtitle: s.subtitle,
      meta: buildMeta(order),
      items: lines.map(function (l, i) {
        return {
          no: String(i + 1),
          name: l.name,
          qty: fmtNum(l.qty) + (l.unit || ''),
          price: fmtNum(l.price) + '元',
          amount: fmtNum(amountOf(l)) + '元'
        };
      }),
      totalText: fmtNum(order.total != null ? order.total : Store.orderTotal(lines)) + '元',
      footer: s.footer
    };
  }

  function toText(order) {
    var lines = order.lines || [];
    var s = Store.getSettings();
    var out = [];
    lines.forEach(function (l, i) {
      var unit = l.unit || '';
      var pricePart = unit ? fmtNum(l.price) + '元/' + unit : fmtNum(l.price) + '元';
      out.push(
        (i + 1) + '.' + l.name + '：' +
        pricePart + '，' +
        fmtNum(l.qty) + unit + '，共' + fmtNum(amountOf(l)) + '元'
      );
    });
    if (!lines.length) out.push('（本单还没有商品）');
    out.push('-------------------------------');
    out.push('合计：' + fmtNum(order.total != null ? order.total : Store.orderTotal(lines)) + '元');
    if (s.storeName) out.push('店名：' + s.storeName);
    out.push('时间：' + Store.fmtDateTime(order.createdAt));
    if (order.plate) out.push('车号：' + order.plate);
    if (order.note) out.push('备注：' + order.note);
    return out.join('\n');
  }

  // 历史列表里用一行概括本单卖了什么
  function summarize(order) {
    return (order.lines || []).map(function (l) {
      return l.name + ' ' + fmtNum(l.qty) + (l.unit || '');
    }).join('、');
  }

  return {
    build: build,
    toText: toText,
    summarize: summarize,
    fmtNum: fmtNum,
    fmtRaw: fmtRaw,
    amountOf: amountOf,
    detailText: detailText,
    amountText: amountText,
    pricePerUnit: pricePerUnit
  };
})();
