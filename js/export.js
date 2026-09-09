/* 导出层：原生 canvas 绘制小票、生成 PNG、复制文字、下载文件 */
var Exporter = (function () {

  var W = 700;   // 画布逻辑宽度
  var PAD = 40;
  var STACK = '-apple-system,"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';

  var FONT = {
    store: '700 38px ' + STACK,
    sub: '400 19px ' + STACK,
    meta: '400 21px ' + STACK,
    th: '700 18px ' + STACK,
    cell: '700 22px ' + STACK,
    totalLabel: '700 24px ' + STACK,
    total: '700 36px ' + STACK,
    foot: '400 19px ' + STACK
  };

  var COLOR = {
    ink: '#111111',
    gray: '#8a8a8a',
    red: '#d4380d',
    line: '#111111',
    paper: '#fffdf5',
    border: '#111111',
    head: '#f3efe3'
  };

  var COLS = [
    { key: 'name', title: '名称', ratio: 0.28, align: 'left' },
    { key: 'qty', title: '数量', ratio: 0.22, align: 'right' },
    { key: 'price', title: '单价', ratio: 0.28, align: 'right' },
    { key: 'amount', title: '金额', ratio: 0.22, align: 'right' }
  ];
  var CELL_PAD = 8;

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

  /* 先排版算出总高度，再按算好的坐标绘制 */
  function layout(model) {
    var mc = document.createElement('canvas').getContext('2d');
    var inner = W - PAD * 2;
    var ops = [];
    var y = PAD;

    function line(str, font, align, color, lh) {
      ops.push({ type: 'text', str: str, font: font, align: align, color: color, y: y + lh / 2 });
      y += lh;
    }

    function block(str, font, align, color, lh) {
      mc.font = font;
      wrap(mc, str, inner).forEach(function (l) { line(l, font, align, color, lh); });
    }

    function divider(before, after) {
      y += before;
      ops.push({ type: 'divider', y: y });
      y += after;
    }

    function colLayout() {
      var inner = W - PAD * 2;
      var x = PAD;
      var last = COLS.length - 1;
      return COLS.map(function (c, i) {
        var w = i === last ? (PAD + inner - x) : Math.round(inner * c.ratio);
        var col = { key: c.key, title: c.title, align: c.align, x: x, w: w };
        x += w;
        return col;
      });
    }

    function cellWrap(ctx, text, maxWidth) {
      return wrap(ctx, text, Math.max(12, maxWidth - CELL_PAD * 2));
    }

    function tableRow(cols, values, font, fill, lh) {
      mc.font = font;
      var linesPerCol = cols.map(function (c) {
        return cellWrap(mc, values[c.key] == null ? '' : String(values[c.key]), c.w);
      });
      var n = 1;
      linesPerCol.forEach(function (ls) { if (ls.length > n) n = ls.length; });
      var h = Math.max(lh + 10, n * lh + 12);
      if (fill) ops.push({ type: 'rect', x: PAD, y: y, w: W - PAD * 2, h: h, fill: fill });
      ops.push({ type: 'box', x: PAD, y: y, w: W - PAD * 2, h: h });
      cols.forEach(function (c, i) {
        if (i > 0) ops.push({ type: 'vline', x: c.x, y: y, h: h });
        var parts = linesPerCol[i];
        parts.forEach(function (part, pi) {
          var tx = c.align === 'right' ? c.x + c.w - CELL_PAD : c.x + CELL_PAD;
          ops.push({
            type: 'text',
            str: part,
            font: font,
            align: c.align,
            color: COLOR.ink,
            x: tx,
            y: y + 8 + pi * lh + lh / 2
          });
        });
      });
      y += h;
    }

    block(model.storeName, FONT.store, 'center', COLOR.ink, 50);
    if (model.subtitle) block(model.subtitle, FONT.sub, 'center', COLOR.gray, 28);

    divider(16, 14);
    model.meta.forEach(function (m) {
      block(m.label + '：' + m.value, FONT.meta, 'left', COLOR.ink, 32);
    });

    y += 16;
    var cols = colLayout();
    tableRow(cols, { name: '名称', qty: '数量', price: '单价', amount: '金额' }, FONT.th, COLOR.head, 26);

    if (!model.items.length) {
      tableRow(cols, { name: '（本单还没有商品）', qty: '', price: '', amount: '' }, FONT.cell, null, 30);
    } else {
      model.items.forEach(function (it) {
        tableRow(cols, it, FONT.cell, null, 30);
      });
    }

    y += 16;
    ops.push({ type: 'text', str: '合计', font: FONT.totalLabel, align: 'left', color: COLOR.red, x: PAD, y: y + 22 });
    ops.push({ type: 'text', str: model.totalText, font: FONT.total, align: 'right', color: COLOR.red, x: W - PAD, y: y + 22 });
    y += 44;

    if (model.footer) {
      divider(16, 14);
      block(model.footer, FONT.foot, 'center', COLOR.gray, 28);
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
    ctx.strokeStyle = COLOR.border;
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, W - 2, lay.height - 2);

    ctx.textBaseline = 'middle';
    lay.ops.forEach(function (op) {
      if (op.type === 'divider') {
        ctx.save();
        ctx.strokeStyle = COLOR.line;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([7, 6]);
        ctx.beginPath();
        ctx.moveTo(PAD, op.y);
        ctx.lineTo(W - PAD, op.y);
        ctx.stroke();
        ctx.restore();
        return;
      }
      if (op.type === 'rect') {
        ctx.fillStyle = op.fill;
        ctx.fillRect(op.x, op.y, op.w, op.h);
        return;
      }
      if (op.type === 'box') {
        ctx.strokeStyle = COLOR.line;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([]);
        ctx.strokeRect(op.x + 0.5, op.y + 0.5, op.w, op.h);
        return;
      }
      if (op.type === 'vline') {
        ctx.strokeStyle = COLOR.line;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(op.x + 0.5, op.y);
        ctx.lineTo(op.x + 0.5, op.y + op.h);
        ctx.stroke();
        return;
      }
      ctx.font = op.font;
      ctx.fillStyle = op.color;
      ctx.textAlign = op.align;
      var x = op.x;
      if (x == null) x = op.align === 'left' ? PAD : (op.align === 'right' ? W - PAD : W / 2);
      ctx.fillText(op.str, x, op.y);
    });

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

  function legacyCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '0';
    ta.style.left = '0';
    ta.style.width = '1px';
    ta.style.height = '1px';
    ta.style.opacity = '0';
    document.body.appendChild(ta);

    var ok = false;
    try {
      if (/ipad|iphone|ipod/i.test(navigator.userAgent)) {
        // iOS Safari 不认 textarea.select()，得走 Range 选区
        ta.contentEditable = 'true';
        ta.readOnly = false;
        var range = document.createRange();
        range.selectNodeContents(ta);
        var sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        ta.setSelectionRange(0, 999999);
      } else {
        ta.select();
        ta.setSelectionRange(0, ta.value.length);
      }
      ok = document.execCommand('copy');
    } catch (e) {
      ok = false;
    }
    document.body.removeChild(ta);
    return ok;
  }

  // file:// 和微信内置浏览器拿不到 clipboard API，必须有降级路径
  function copyText(text, cb) {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(
        function () { cb(true); },
        function () { cb(legacyCopy(text)); }
      );
      return;
    }
    cb(legacyCopy(text));
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
