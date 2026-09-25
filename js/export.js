/* 导出层：原生 canvas 绘制小票、生成 PNG、复制文字、下载文件
   暖色送货单：序 / 名称 / 单价 / 数量 / 金额，表格齐、字体统一、行距留白 */
var Exporter = (function () {

  var W = 700;
  var PAD = 44;
  var STACK = '-apple-system,"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';
  var LABEL_W = 92;

  var FONT = {
    store: '800 36px ' + STACK,
    sub: '400 24px ' + STACK,
    meta: '500 28px ' + STACK,
    th: '600 28px ' + STACK,
    cell: '600 30px ' + STACK,
    totalLabel: '700 30px ' + STACK,
    total: '800 56px ' + STACK,
    foot: '400 24px ' + STACK
  };

  var COLOR = {
    paper: '#F4EFE3',
    ink: '#2C3D33',
    muted: '#6B7A70',
    sage: '#2F6B4A',
    sageSoft: '#5A8F6E',
    headBg: '#D7E6D8',
    stripe: '#EEF4EC',
    grid: '#8EAD96',
    amount: '#C45C2A',
    bar: '#3D7A58'
  };

  var COLS = [
    { key: 'no', title: '序', width: 56, align: 'center' },
    { key: 'name', title: '名称', ratio: 1, align: 'left' },
    { key: 'price', title: '单价', width: 118, align: 'right' },
    { key: 'qty', title: '数量', width: 118, align: 'right' },
    { key: 'amount', title: '金额', width: 152, align: 'right' }
  ];
  var CELL_PAD = 14;

  // 按字符断行，中英文混排都安全
  function wrap(ctx, text, maxWidth) {
    var out = [];
    String(text).split('\n').forEach(function (para) {
      var cur = '';
      for (var i = 0; i < para.length; i++) {
        var next = cur + para[i];
        if (cur && ctx.measureText(next).width > maxWidth) {
          out.push(cur);
          cur = para[i];
        } else {
          cur = next;
        }
      }
      out.push(cur);
    });
    return out;
  }

  function colLayout() {
    var inner = W - PAD * 2;
    var x = PAD;
    var used = 0;
    COLS.forEach(function (c) { if (c.width) used += c.width; });
    var rest = inner - used;
    var ratioSum = 0;
    COLS.forEach(function (c) { if (!c.width) ratioSum += (c.ratio || 1); });
    return COLS.map(function (c, i) {
      var w;
      if (c.width) w = c.width;
      else w = Math.round(rest * (c.ratio || 1) / (ratioSum || 1));
      if (i === COLS.length - 1) w = PAD + inner - x;
      var col = { key: c.key, title: c.title, align: c.align, x: x, w: w };
      x += w;
      return col;
    });
  }

  function cellColor(key, isHead) {
    if (isHead) return COLOR.sage;
    if (key === 'amount') return COLOR.amount;
    return COLOR.ink;
  }

  /* 先排版算出总高度，再按算好的坐标绘制 */
  function layout(model) {
    var mc = document.createElement('canvas').getContext('2d');
    var inner = W - PAD * 2;
    var ops = [];
    var y = PAD;

    function line(str, font, align, color, lh, baseline) {
      ops.push({
        type: 'text',
        str: str,
        font: font,
        align: align,
        color: color,
        y: baseline === 'alphabetic' ? y + lh : y + lh / 2,
        baseline: baseline || 'middle'
      });
      y += lh;
    }

    function block(str, font, align, color, lh) {
      mc.font = font;
      wrap(mc, str, inner).forEach(function (l) { line(l, font, align, color, lh); });
    }

    function rule(color, width, gapBefore, gapAfter) {
      y += gapBefore == null ? 22 : gapBefore;
      ops.push({ type: 'rule', y: y, color: color || COLOR.grid, width: width || 1 });
      y += gapAfter == null ? 22 : gapAfter;
    }

    function cellParts(ctx, col, text) {
      var raw = String(text == null ? '' : text);
      if (col.key !== 'name') return [raw];
      ctx.font = FONT.cell;
      return wrap(ctx, raw, Math.max(12, col.w - CELL_PAD * 2));
    }

    function tableRow(cols, values, lh, opts) {
      opts = opts || {};
      var font = opts.head ? FONT.th : FONT.cell;
      var linesPerCol = cols.map(function (c) {
        mc.font = font;
        return cellParts(mc, c, values[c.key]);
      });
      var n = 1;
      linesPerCol.forEach(function (ls) { if (ls.length > n) n = ls.length; });
      var padY = opts.head ? 18 : 22;
      var h = Math.max(lh + padY * 2, n * lh + padY * 2);
      if (opts.fill) {
        ops.push({ type: 'rect', x: PAD, y: y, w: inner, h: h, fill: opts.fill });
      }
      cols.forEach(function (c, i) {
        var parts = linesPerCol[i];
        var color = cellColor(c.key, !!opts.head);
        parts.forEach(function (part, pi) {
          var tx = c.align === 'right' ? c.x + c.w - CELL_PAD
            : c.align === 'center' ? c.x + c.w / 2
            : c.x + CELL_PAD;
          ops.push({
            type: 'text',
            str: part,
            font: font,
            align: c.align,
            color: color,
            x: tx,
            y: y + padY + pi * lh + lh / 2,
            baseline: 'middle'
          });
        });
      });
      y += h;
      return h;
    }

    ops.push({ type: 'rect', x: 0, y: 0, w: W, h: 14, fill: COLOR.bar });
    y = PAD + 10;

    block(model.storeName, FONT.store, 'center', COLOR.sage, 50);
    if (model.subtitle) {
      y += 6;
      block(model.subtitle, FONT.sub, 'center', COLOR.sageSoft, 36);
    }

    rule(COLOR.grid, 2, 28, 32);

    model.meta.forEach(function (m) {
      ops.push({
        type: 'text', str: m.label, font: FONT.meta, align: 'left',
        color: COLOR.muted, x: PAD, y: y + 22, baseline: 'middle'
      });
      mc.font = FONT.meta;
      var valueLines = wrap(mc, String(m.value), inner - LABEL_W);
      valueLines.forEach(function (part, pi) {
        ops.push({
          type: 'text',
          str: part,
          font: FONT.meta,
          align: 'left',
          color: COLOR.ink,
          x: PAD + LABEL_W,
          y: y + 22 + pi * 40,
          baseline: 'middle'
        });
      });
      y += Math.max(48, valueLines.length * 40 + 8);
    });

    y += 48;
    var cols = colLayout();
    var tableTop = y;
    ops.push({ type: 'hline', x1: PAD, x2: W - PAD, y: tableTop, color: COLOR.grid, width: 2 });
    tableRow(cols, {
      no: '序', name: '名称', price: '单价', qty: '数量', amount: '金额'
    }, 32, { head: true, fill: COLOR.headBg });
    ops.push({ type: 'hline', x1: PAD, x2: W - PAD, y: y, color: COLOR.grid, width: 2 });

    if (!model.items.length) {
      tableRow(cols, { no: '', name: '（本单还没有商品）', price: '', qty: '', amount: '' }, 36, {});
    } else {
      model.items.forEach(function (it, i) {
        tableRow(cols, it, 36, { fill: i % 2 ? COLOR.stripe : null });
        if (i < model.items.length - 1) {
          ops.push({ type: 'hline', x1: PAD, x2: W - PAD, y: y, color: COLOR.grid, width: 1 });
        }
      });
    }
    var tableBottom = y;
    ops.push({ type: 'box', x: PAD, y: tableTop, w: inner, h: tableBottom - tableTop, color: COLOR.grid, width: 2 });
    cols.forEach(function (c, i) {
      if (i === 0) return;
      ops.push({ type: 'vline', x: c.x, y1: tableTop, y2: tableBottom, color: COLOR.grid, width: 1 });
    });

    y += 36;
    var totalMid = y + 40;
    ops.push({
      type: 'text', str: '合计', font: FONT.totalLabel, align: 'left',
      color: COLOR.sage, x: PAD, y: totalMid, baseline: 'middle'
    });
    ops.push({
      type: 'text', str: model.totalText, font: FONT.total, align: 'right',
      color: COLOR.amount, x: W - PAD, y: totalMid, baseline: 'middle'
    });
    mc.font = FONT.total;
    var totalW = mc.measureText(model.totalText).width;
    ops.push({
      type: 'hline',
      x1: W - PAD - totalW,
      x2: W - PAD,
      y: totalMid + 30,
      color: COLOR.amount,
      width: 3
    });
    y += 86;

    if (model.footer) {
      y += 36;
      block(model.footer, FONT.foot, 'center', COLOR.muted, 36);
    }

    y += PAD;
    return { ops: ops, height: Math.ceil(y) };
  }

  function render(model) {
    var lay = layout(model);
    var dpr = Math.min(3, Math.max(2, window.devicePixelRatio || 1));
    var cv = document.createElement('canvas');
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(lay.height * dpr);

    var ctx = cv.getContext('2d');
    ctx.scale(dpr, dpr);

    ctx.fillStyle = COLOR.paper;
    ctx.fillRect(0, 0, W, lay.height);

    lay.ops.forEach(function (op) {
      if (op.type === 'rule') {
        ctx.save();
        ctx.strokeStyle = op.color || COLOR.grid;
        ctx.lineWidth = op.width || 1;
        ctx.setLineDash(op.dash || []);
        ctx.beginPath();
        ctx.moveTo(PAD, op.y);
        ctx.lineTo(W - PAD, op.y);
        ctx.stroke();
        ctx.restore();
        return;
      }
      if (op.type === 'hline') {
        ctx.save();
        ctx.strokeStyle = op.color || COLOR.grid;
        ctx.lineWidth = op.width || 1;
        ctx.beginPath();
        ctx.moveTo(op.x1, op.y);
        ctx.lineTo(op.x2, op.y);
        ctx.stroke();
        ctx.restore();
        return;
      }
      if (op.type === 'vline') {
        ctx.save();
        ctx.strokeStyle = op.color || COLOR.grid;
        ctx.lineWidth = op.width || 1;
        ctx.beginPath();
        ctx.moveTo(op.x, op.y1);
        ctx.lineTo(op.x, op.y2);
        ctx.stroke();
        ctx.restore();
        return;
      }
      if (op.type === 'box') {
        ctx.save();
        ctx.strokeStyle = op.color || COLOR.grid;
        ctx.lineWidth = op.width || 1;
        ctx.strokeRect(op.x + 0.5, op.y + 0.5, op.w - 1, op.h - 1);
        ctx.restore();
        return;
      }
      if (op.type === 'rect') {
        ctx.fillStyle = op.fill;
        ctx.fillRect(op.x, op.y, op.w, op.h);
        return;
      }
      ctx.font = op.font;
      ctx.fillStyle = op.color;
      ctx.textAlign = op.align;
      ctx.textBaseline = op.baseline || 'middle';
      var x = op.x;
      if (x == null) x = op.align === 'left' ? PAD : (op.align === 'right' ? W - PAD : W / 2);
      ctx.fillText(op.str, x, op.y);
    });

    ctx.strokeStyle = COLOR.bar;
    ctx.lineWidth = 3;
    ctx.strokeRect(1.5, 1.5, W - 3, lay.height - 3);

    return cv;
  }

  function renderOrder(order) {
    return render(Receipt.build(order));
  }

  // blob URL 在 iOS 微信里长按可存相册，toDataURL 只作兜底
  function toImageURL(canvas, cb) {
    if (canvas.toBlob) {
      canvas.toBlob(function (blob) {
        if (!blob) { cb(canvas.toDataURL('image/png')); return; }
        cb(URL.createObjectURL(blob), blob);
      }, 'image/png');
    } else {
      cb(canvas.toDataURL('image/png'));
    }
  }

  /* ---------- 复制文字 ---------- */

  function isWeChat() {
    return /MicroMessenger/i.test(navigator.userAgent || '');
  }

  function isIOS() {
    var ua = navigator.userAgent || '';
    return /ipad|iphone|ipod/i.test(ua) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  // 必须在点击的同步调用栈里 execCommand。微信里 clipboard API 常报成功、粘贴却是空的。
  function legacyCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', 'readonly');
    ta.style.cssText = [
      'position:fixed',
      'top:0',
      'left:0',
      'width:80%',
      'height:80px',
      'padding:8px',
      'font-size:16px',
      'z-index:99999',
      'opacity:0.01',
      'border:0',
      'background:transparent',
      '-webkit-user-select:text',
      'user-select:text'
    ].join(';');
    document.body.appendChild(ta);
    ta.focus();

    var ok = false;
    try {
      ta.select();
      ta.setSelectionRange(0, ta.value.length);
      ok = document.execCommand('copy');
      if (!ok && window.getSelection) {
        var range = document.createRange();
        range.selectNodeContents(ta);
        var sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        ok = document.execCommand('copy');
      }
    } catch (e) {
      ok = false;
    }
    document.body.removeChild(ta);
    return !!ok;
  }

  function copyText(text, cb) {
    text = text == null ? '' : String(text);
    if (!text) { cb(false); return; }

    var copied = legacyCopy(text);
    if (copied) { cb(true); return; }

    // 微信 / iOS 不要再走 clipboard：会假成功
    if (isWeChat() || isIOS() || !navigator.clipboard || !window.isSecureContext) {
      cb(false);
      return;
    }
    navigator.clipboard.writeText(text).then(
      function () { cb(true); },
      function () { cb(false); }
    );
  }

  function downloadFile(filename, content, mime) {
    try {
      var blob = new Blob([content], { type: mime || 'application/octet-stream' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 3000);
      return true;
    } catch (e) {
      return false;
    }
  }

  return {
    render: render,
    renderOrder: renderOrder,
    toImageURL: toImageURL,
    copyText: copyText,
    downloadFile: downloadFile
  };
})();
