/* 应用层：页面切换、开单状态机、各弹窗与页面渲染 */
(function () {

  var EMOJI_CHOICES = ['🌱', '🧄', '🥔', '🍠', '🥬', '🧅', '🥕', '🌽', '🥒', '🍅', '🥦', '🌶️', '🍆', '🥜', '🌾', '📦'];

  /* ============ 通用工具 ============ */

  function $(id) { return document.getElementById(id); }

  function esc(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  var toastTimer = null;
  function toast(msg) {
    var el = $('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 1800);
  }

  /* ============ 开机密码 ============ */

  var PIN_SESSION = 'bm.unlocked.v2';
  var PIN_SKIP = 'bm.pinSkip.v2';
  var pinState = { mode: '', buf: '', pending: '' };

  function pinSessionOn() {
    try { return sessionStorage.getItem(PIN_SESSION) === '1'; } catch (e) { return false; }
  }
  function pinSessionSet(on) {
    try {
      if (on) sessionStorage.setItem(PIN_SESSION, '1');
      else sessionStorage.removeItem(PIN_SESSION);
    } catch (e) { /* 隐私模式可能写不了 */ }
  }
  function pinSkipped() {
    try { return localStorage.getItem(PIN_SKIP) === '1'; } catch (e) { return false; }
  }
  function setPinSkipped() {
    try { localStorage.setItem(PIN_SKIP, '1'); } catch (e) { /* ignore */ }
  }

  function showPinLock(mode) {
    pinState.mode = mode;
    pinState.buf = '';
    if (mode === 'set') pinState.pending = '';
    var suggest = $('pinSuggest');
    var entry = $('pinEntry');
    if (mode === 'suggest') {
      suggest.hidden = false;
      entry.hidden = true;
    } else {
      suggest.hidden = true;
      entry.hidden = false;
      var titles = {
        unlock: '输入开机密码',
        set: '设置 4–6 位数字密码',
        confirm: '再输入一遍确认',
        'change-old': '输入旧密码'
      };
      var hints = {
        unlock: '点数字，输完按确定',
        set: '4 到 6 位，自己好记就行',
        confirm: '和刚才输入的要一样',
        'change-old': '先核对旧密码'
      };
      $('pinTitle').textContent = titles[mode] || '';
      $('pinHint').textContent = hints[mode] || '';
      $('pinForgot').hidden = mode !== 'unlock';
      $('pinCancel').hidden = mode === 'unlock';
      renderPinDots();
    }
    $('pinLock').classList.add('show');
  }

  function hidePinLock() {
    pinState.mode = '';
    pinState.buf = '';
    $('pinLock').classList.remove('show');
    document.documentElement.classList.add('pin-ok');
  }

  function renderPinDots() {
    var n = (pinState.mode === 'unlock' || pinState.mode === 'change-old') && Store.pinLen()
      ? Store.pinLen()
      : 6;
    var html = '';
    for (var i = 0; i < n; i++) html += '<i class="' + (i < pinState.buf.length ? 'on' : '') + '"></i>';
    $('pinDots').innerHTML = html;
  }

  function pinSubmit() {
    var buf = pinState.buf;
    if (pinState.mode === 'unlock') {
      if (!Store.checkPin(buf)) {
        pinState.buf = '';
        renderPinDots();
        toast('密码不对');
        return;
      }
      pinSessionSet(true);
      hidePinLock();
      return;
    }
    if (pinState.mode === 'change-old') {
      if (!Store.checkPin(buf)) {
        pinState.buf = '';
        renderPinDots();
        toast('旧密码不对');
        return;
      }
      showPinLock('set');
      return;
    }
    if (pinState.mode === 'set') {
      if (!/^\d{4,6}$/.test(buf)) { toast('请输入 4 到 6 位数字'); return; }
      pinState.pending = buf;
      showPinLock('confirm');
      return;
    }
    if (pinState.mode === 'confirm') {
      if (buf !== pinState.pending) {
        toast('两次不一样，请重新设置');
        showPinLock('set');
        return;
      }
      if (!Store.setPin(buf)) { toast('密码保存失败'); return; }
      pinSessionSet(true);
      hidePinLock();
      refreshPinSettings();
      toast('开机密码已保存');
    }
  }

  function pinInput(n) {
    if (n === 'del') {
      pinState.buf = pinState.buf.slice(0, -1);
      renderPinDots();
      return;
    }
    if (n === 'ok') { pinSubmit(); return; }
    if (!/^\d$/.test(n)) return;
    var max = (pinState.mode === 'unlock' || pinState.mode === 'change-old') && Store.pinLen()
      ? Store.pinLen()
      : 6;
    if (pinState.buf.length >= max) return;
    pinState.buf += n;
    renderPinDots();
    if ((pinState.mode === 'unlock' || pinState.mode === 'change-old') &&
        Store.pinLen() && pinState.buf.length === Store.pinLen()) {
      pinSubmit();
    }
  }

  function refreshPinSettings() {
    var has = Store.hasPin();
    var setBtn = $('btnSetPin');
    if (!setBtn) return;
    setBtn.hidden = has;
    $('btnChangePin').hidden = !has;
    $('btnClearPin').hidden = !has;
    $('pinNote').textContent = has
      ? '已开启。关掉浏览器再打开需要输入密码。解不了只能清空本机数据。'
      : '网页放到网上后，知道地址的人都能看见单据。建议设 4 位数字密码。';
  }

  function bootPin() {
    if (Store.hasPin() && !pinSessionOn()) {
      document.documentElement.classList.remove('pin-ok');
      showPinLock('unlock');
      return;
    }
    document.documentElement.classList.add('pin-ok');
    $('pinLock').classList.remove('show');
    if (!Store.hasPin() && !pinSkipped()) showPinLock('suggest');
  }

  function bindPin() {
    $('pinPad').addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-n]');
      if (btn) pinInput(btn.getAttribute('data-n'));
    });
    $('pinSuggestOk').addEventListener('click', function () { showPinLock('set'); });
    $('pinSuggestLater').addEventListener('click', function () {
      setPinSkipped();
      hidePinLock();
    });
    $('pinCancel').addEventListener('click', hidePinLock);
    $('pinForgot').addEventListener('click', function () {
      confirmDialog('忘记密码', '解不开只能清空这台手机上的全部单据和品类，然后重新设置。', function () {
        Store.clearAll();
        pinSessionSet(true);
        hidePinLock();
        draft = newDraft();
        loadSettingsForm();
        renderBill();
        renderProductList();
        renderHistory();
        toast('已清空，请重新开单');
      });
    });
    $('btnSetPin').addEventListener('click', function () { showPinLock('set'); });
    $('btnChangePin').addEventListener('click', function () { showPinLock('change-old'); });
    $('btnClearPin').addEventListener('click', function () {
      confirmDialog('关闭开机密码', '关闭后打开网页不再询问密码。', function () {
        Store.clearPin();
        refreshPinSettings();
        toast('已关闭开机密码');
      });
    });
  }

  function openModal(id) { $(id).classList.add('show'); }
  function closeModal(id) { $(id).classList.remove('show'); }

  function showPage(id) {
    var pages = document.querySelectorAll('.page');
    for (var i = 0; i < pages.length; i++) pages[i].classList.remove('active');
    $(id).classList.add('active');
    var body = $(id).querySelector('.page-body');
    if (body) body.scrollTop = 0;
  }

  /* ============ 弹窗封装 ============ */

  var confirmCb = null;
  function confirmDialog(title, message, onOk) {
    $('confirmTitle').textContent = title;
    $('confirmMsg').textContent = message;
    confirmCb = onOk;
    openModal('confirmModal');
  }

  var sheetCbs = [];
  function actionSheet(title, actions) {
    $('sheetTitle').textContent = title;
    sheetCbs = actions.map(function (a) { return a.onTap; });
    $('sheetList').innerHTML = actions.map(function (a, i) {
      return '<button class="sheet-item ' + (a.danger ? 'danger' : '') + '" data-sheet="' + i + '">' + esc(a.label) + '</button>';
    }).join('');
    openModal('sheetModal');
  }

  var numState = { buf: '', onOk: null };
  function askNumber(opts) {
    numState.buf = opts.value != null ? String(opts.value) : '';
    numState.onOk = opts.onOk;
    $('numTitle').textContent = opts.title;
    var row = $('numCheckRow');
    if (opts.checkbox) {
      row.classList.add('show');
      $('numCheckLabel').textContent = opts.checkbox.label;
      $('numCheck').checked = !!opts.checkbox.checked;
    } else {
      row.classList.remove('show');
      $('numCheck').checked = false;
    }
    renderNumDisplay();
    openModal('numModal');
  }
  function renderNumDisplay() {
    $('numDisplay').textContent = numState.buf === '' ? '0' : numState.buf;
  }

  var textCb = null;
  function askText(opts) {
    var input = $('textInput');
    $('textTitle').textContent = opts.title;
    input.value = opts.value || '';
    input.placeholder = opts.placeholder || '';
    input.rows = opts.rows || 3;
    $('textHint').textContent = opts.hint || '';
    textCb = opts.onOk;
    openModal('textModal');
    setTimeout(function () { input.focus(); }, 80);
  }

  /* ============ 车牌弹窗 ============ */

  var plateState = { value: '', onOk: null };

  function askPlate(current, onOk) {
    plateState.value = current || '';
    plateState.onOk = onOk;
    renderPlate();
    openModal('plateModal');
  }

  function renderPlate() {
    var el = $('plateDisplay');
    if (plateState.value) {
      el.textContent = plateState.value;
      el.classList.remove('empty');
    } else {
      el.textContent = '先点省份简称，再点字母数字';
      el.classList.add('empty');
    }
    var provs = $('provRow').querySelectorAll('button');
    for (var i = 0; i < provs.length; i++) {
      var p = provs[i].getAttribute('data-prov');
      provs[i].classList.toggle('sel', plateState.value.charAt(0) === p);
    }
    var recent = Store.getPlates();
    $('recentPlates').innerHTML = recent.length
      ? recent.map(function (p) { return '<button class="chip" data-plate="' + esc(p) + '">' + esc(p) + '</button>'; }).join('')
      : '';
  }

  /* ============ 小票预览弹窗 ============ */

  var previewURL = null;
  var previewOrder = null;
  var previewDeleteCb = null;

  function showPreview(order, opts) {
    opts = opts || {};
    previewOrder = order;
    previewDeleteCb = opts.onDelete || null;
    $('previewTitle').textContent = opts.title || '📸 电子小票';
    $('previewExtraRow').style.display = previewDeleteCb ? 'flex' : 'none';

    var canvas = Exporter.renderOrder(order);
    Exporter.toImageURL(canvas, function (url) {
      if (previewURL) URL.revokeObjectURL(previewURL);
      previewURL = url.indexOf('blob:') === 0 ? url : null;
      $('previewImg').src = url;
      var a = $('previewDownload');
      a.href = url;
      a.download = '小票-' + (order.no || 'draft') + '.png';
    });
    openModal('previewModal');
  }

  /* ============ 开单页 ============ */

  function newDraft() {
    return { plate: '', note: '', lines: [], pending: null };
  }
  var draft = newDraft();

  function pendingPrice(p) { return p ? Keypad.toNumber(p.priceStr) : 0; }
  function pendingQty(p) { return p ? Keypad.toNumber(p.qtyStr) : 0; }
  function pendingComplete(p) {
    return !!(p && p.hasTimes && pendingPrice(p) > 0 && pendingQty(p) > 0);
  }
  function pendingRepriced(p) {
    if (!p) return false;
    var base = Store.getProduct(p.productId);
    return !base || base.price !== Store.round2(pendingPrice(p));
  }

  function lcdText() {
    var p = draft.pending;
    if (!p) return '0';
    var price = p.priceStr === '' ? '0' : p.priceStr;
    if (!p.hasTimes) return price + '▌';
    return price + ' × ' + p.qtyStr + '▌';
  }

  // 把还没入账的那一行也算进去，复制出来的文字和屏幕上看到的一致
  function draftAsOrder() {
    var p = draft.pending;
    var lines = draft.lines.slice();
    if (pendingComplete(p)) {
      lines.push({
        name: p.name,
        unit: p.unit,
        price: Store.round2(pendingPrice(p)),
        qty: Store.round2(pendingQty(p))
      });
    }
    return {
      no: Store.peekOrderNo(Date.now()),
      createdAt: Date.now(),
      plate: draft.plate,
      note: draft.note,
      lines: lines,
      total: Store.orderTotal(lines)
    };
  }

  function renderProducts() {
    var list = Store.getProducts();
    if (!list.length) {
      $('prodCol').innerHTML = '<div class="prod-empty">还没有品类<br>去「☰ → 品类管理」添加</div>';
      return;
    }
    var p = draft.pending;
    $('prodCol').innerHTML = list.map(function (item) {
      var active = p && p.productId === item.id;
      var name = active ? p.name : item.name;
      var mod = active && (p.renamed || pendingRepriced(p));
      return '<button type="button" class="prod-key ' + (mod ? 'modified' : (active ? 'active' : '')) + '" data-pid="' + item.id + '">' +
        '<span class="pn">' + esc(name) + '</span>' +
        '<span class="pp">' + Receipt.fmtNum(item.price) + '/' + esc(item.unit) + '</span>' +
        '</button>';
    }).join('');
  }

  function renderMetaKeys() {
    var plate = $('btnPlate');
    var note = $('btnNote');
    if (draft.plate) {
      plate.textContent = draft.plate;
      plate.classList.add('filled');
    } else {
      plate.textContent = '车号';
      plate.classList.remove('filled');
    }
    if (draft.note) {
      note.textContent = draft.note;
      note.classList.add('filled');
    } else {
      note.textContent = '备注';
      note.classList.remove('filled');
    }
  }

  function renderTape() {
    var html = '';
    if (draft.plate || draft.note) {
      html += '<div class="tape-head">' + esc([draft.plate, draft.note].filter(Boolean).join(' · ')) + '</div>';
    }

    draft.lines.forEach(function (l, i) {
      html += '<div class="tape-line done" data-idx="' + i + '">' +
        (l.name ? '<div class="tl-name">' + esc(l.name) + '</div>' : '') +
        '<div class="tl-eq">' + esc(Receipt.fmtNum(l.price) + ' × ' + Receipt.fmtNum(l.qty) + (l.unit || '')) +
        ' = <b>' + esc(Receipt.fmtNum(Store.lineAmount(l.qty, l.price))) + '</b></div>' +
        '</div>';
    });

    var p = draft.pending;
    if (p) {
      var price = pendingPrice(p);
      var amt = p.hasTimes && p.qtyStr ? Store.lineAmount(pendingQty(p), price) : null;
      var eq;
      if (!p.hasTimes) {
        eq = esc(p.priceStr === '' ? '0' : p.priceStr);
      } else {
        var shownPrice = p.priceStr === '' ? '0' : p.priceStr;
        eq = esc(shownPrice + ' × ' + (p.qtyStr || '_') + (p.unit || ''));
        if (p.qtyStr && amt != null) eq += ' = <b>' + esc(Receipt.fmtNum(amt)) + '</b>';
      }
      html += '<div class="tape-line pending">' +
        (p.name ? '<div class="tl-name">' + esc(p.name) + '</div>' : '') +
        '<div class="tl-eq">' + eq + '</div>' +
        '</div>';
    }

    if (!draft.lines.length && !p) {
      html += '<div class="tape-empty">点下面菜品自动填单价<br>或直接敲数字</div>';
    }
    $('tapeBody').innerHTML = html;
    $('tapeBody').scrollTop = $('tapeBody').scrollHeight;

    var total = Store.orderTotal(draft.lines);
    if (pendingComplete(p)) {
      total = Store.round2(total + Store.lineAmount(pendingQty(p), pendingPrice(p)));
    }
    $('rTotal').textContent = Receipt.fmtNum(total) + '元';
    $('calcLcd').textContent = lcdText();
  }

  function renderBill() {
    renderProducts();
    renderMetaKeys();
    renderTape();
  }

  // 敲完数量就入账。不完整的一行（没数量）默认丢掉，equals 时用 keepIncomplete 留着改。
  function commitPending(opts) {
    opts = opts || {};
    var p = draft.pending;
    if (!p) return false;
    if (!pendingComplete(p)) {
      if (!opts.keepIncomplete) draft.pending = null;
      return false;
    }
    var price = Store.round2(pendingPrice(p));
    var qty = Store.round2(pendingQty(p));
    draft.lines.push({
      productId: p.productId,
      name: p.name,
      unit: p.unit,
      price: price,
      qty: qty,
      renamed: p.renamed,
      repriced: pendingRepriced(p)
    });
    draft.pending = null;
    return true;
  }

  function ensurePending() {
    if (!draft.pending) {
      draft.pending = {
        productId: '',
        name: '',
        unit: '',
        priceStr: '',
        hasTimes: false,
        qtyStr: '',
        renamed: false
      };
    }
    return draft.pending;
  }

  function selectProduct(id) {
    var item = Store.getProduct(id);
    if (!item) return;
    commitPending();
    draft.pending = {
      productId: item.id,
      name: item.name,
      unit: item.unit,
      priceStr: Receipt.fmtRaw(item.price),
      hasTimes: true,
      qtyStr: '',
      renamed: false
    };
    renderBill();
  }

  function inputDigit(ch) {
    var p = ensurePending();
    var chars = ch === '00' ? ['0', '0'] : [ch];
    var i;
    for (i = 0; i < chars.length; i++) {
      if (p.hasTimes) p.qtyStr = Keypad.pushDigit(p.qtyStr, chars[i]);
      else p.priceStr = Keypad.pushDigit(p.priceStr, chars[i]);
    }
    renderBill();
  }

  function backspace() {
    var p = draft.pending;
    if (!p) return;
    if (p.hasTimes && p.qtyStr) p.qtyStr = Keypad.popDigit(p.qtyStr);
    else if (p.hasTimes) p.hasTimes = false;
    else if (p.priceStr) p.priceStr = Keypad.popDigit(p.priceStr);
    else draft.pending = null;
    renderBill();
  }

  function pressTimes() {
    var p = draft.pending;
    if (!p) { toast('先输入数字'); return; }
    if (!(pendingPrice(p) > 0)) { toast('单价要大于 0'); return; }
    p.hasTimes = true;
    renderBill();
  }

  function pressEquals() {
    if (!commitPending({ keepIncomplete: true })) {
      toast(draft.pending ? '先敲数量' : '先输入数字');
      return;
    }
    renderBill();
  }

  function editPendingName() {
    var p = draft.pending;
    if (!p) return;
    askText({
      title: '本单临时改名',
      value: p.name,
      rows: 1,
      placeholder: '例如：生姜（新货）',
      hint: '只改这一单显示的名字。要长期改名请去「品类管理」。',
      onOk: function (text) {
        var name = text.trim();
        if (!name) { toast('名称不能为空'); return true; }
        p.name = name;
        var base = Store.getProduct(p.productId);
        p.renamed = !base || base.name !== name;
        renderBill();
      }
    });
  }

  function editLine(idx) {
    var l = draft.lines[idx];
    if (!l) return;
    actionSheet((l.name || '这一行') + '  ' + Receipt.detailText(l) + ' = ' + Receipt.amountText(l), [
      {
        label: '改名称', onTap: function () {
          askText({
            title: '改名称 · ' + l.name,
            value: l.name,
            rows: 1,
            placeholder: '本单显示的名字',
            onOk: function (text) {
              var name = text.trim();
              if (!name) { toast('名称不能为空'); return true; }
              l.name = name;
              l.renamed = true;
              renderBill();
            }
          });
        }
      },
      {
        label: '改数量', onTap: function () {
          askNumber({
            title: '改数量 · ' + l.name + '（' + l.unit + '）',
            value: String(l.qty),
            onOk: function (v) {
              if (!(v > 0)) { toast('数量要大于 0'); return true; }
              l.qty = Store.round2(v);
              renderBill();
            }
          });
        }
      },
      {
        label: '改单价', onTap: function () {
          askNumber({
            title: '改单价 · ' + l.name,
            value: String(l.price),
            onOk: function (v) {
              if (!(v > 0)) { toast('单价要大于 0'); return true; }
              l.price = Store.round2(v);
              l.repriced = true;
              renderBill();
            }
          });
        }
      },
      {
        label: '删除这一行', danger: true, onTap: function () {
          draft.lines.splice(idx, 1);
          renderBill();
          toast('已删除');
        }
      }
    ]);
  }

  function finishOrder() {
    commitPending();
    if (!draft.lines.length) {
      renderBill();
      toast('还没录入，点菜品或直接敲数字');
      return;
    }
    var order = Store.addOrder(draft);
    draft = newDraft();
    renderBill();
    showPreview(order, { title: '✅ 已完成  ' + order.no });
  }

  function clearDraft() {
    if (!draft.lines.length && !draft.pending && !draft.plate && !draft.note) {
      toast('本单还是空的');
      return;
    }
    confirmDialog('清空本单', '当前这单还没完成，清空后内容不保留。单号不会被浪费。', function () {
      draft = newDraft();
      renderBill();
      toast('已清空');
    });
  }

  function showCopyFallback(text) {
    var box = $('copyBox');
    box.value = text;
    openModal('copyModal');
    setTimeout(function () {
      box.focus();
      try { box.setSelectionRange(0, box.value.length); } catch (e) { /* 旧 WebView 可能没有 */ }
    }, 80);
  }

  function copyOut(text, okMsg) {
    Exporter.copyText(text, function (ok) {
      if (ok) toast(okMsg);
      else showCopyFallback(text);
    });
  }

  function copyDraftText() {
    var order = draftAsOrder();
    if (!order.lines.length) { toast('本单还是空的'); return; }
    copyOut(Receipt.toText(order), '文字已复制，去微信粘贴');
  }

  /* ============ 历史页 ============ */

  // 一次全渲染，用满一年后会有上万个卡片，先只出最近这些天
  var HISTORY_DAYS = 30;
  var historyShowAll = false;

  function renderHistory() {
    var s = Store.getStats();
    $('statTodayTotal').textContent = Receipt.fmtNum(s.todayTotal) + '元';
    $('statTodayCount').textContent = s.todayCount + ' 单';
    $('statMonthTotal').textContent = Receipt.fmtNum(s.monthTotal) + '元';
    $('statMonthCount').textContent = s.monthCount + ' 单';

    var allCount = Store.getOrders().length;
    var note = $('histStoreNote');
    if (note) {
      note.textContent = allCount
        ? '已存 ' + allCount + ' 张单，都在这台手机的浏览器里（不上网）。没有过期天数，除非你删单、清浏览器数据或换手机。列表默认先显示最近 ' + HISTORY_DAYS + ' 天。'
        : '单据存在这台手机的浏览器里，不上网，也没有过期天数。清理浏览器数据或换手机会丢，需要的话去设置里备份。';
    }

    var groups = Store.groupOrdersByDay();
    if (!groups.length) {
      $('historyList').innerHTML = '<div class="empty-tip">还没有历史单据<br>完成一单后会自动存在这里</div>';
      return;
    }
    var visible = historyShowAll ? groups : groups.slice(0, HISTORY_DAYS);
    function dash(v) {
      return v ? esc(v) : '<span class="hist-empty">—</span>';
    }
    var rows = visible.map(function (g) {
      var body = g.orders.map(function (o) {
        return '<tr class="hist-row" data-oid="' + esc(o.id) + '">' +
          '<td class="hist-time">' + esc(Store.fmtDateTime(o.createdAt).slice(11)) + '</td>' +
          '<td class="hist-plate">' + dash(o.plate) + '</td>' +
          '<td class="hist-goods">' + esc(Receipt.summarize(o) || '—') + '</td>' +
          '<td class="hist-note">' + dash(o.note) + '</td>' +
          '<td class="num hist-amt">' + Receipt.fmtNum(o.total) + '元</td>' +
          '</tr>';
      }).join('');
      return '<tbody>' +
        '<tr class="hist-day"><td colspan="5"><div class="hist-day-in"><span>' +
        esc(g.label) + '　' + g.orders.length + ' 单</span><b>' + Receipt.fmtNum(g.total) + '元</b></div></td></tr>' +
        body + '</tbody>';
    }).join('');

    var html = '<div class="hist-panel"><div class="hist-scroll"><table class="hist-table">' +
      '<thead><tr><th>时间</th><th>车号</th><th>商品</th><th>备注</th><th class="num">金额</th></tr></thead>' +
      rows + '</table></div></div>';

    if (!historyShowAll && groups.length > HISTORY_DAYS) {
      html += '<button class="wbtn hist-more" id="btnMoreHistory">查看更早的单据（还有 ' + (groups.length - HISTORY_DAYS) + ' 天）</button>';
    }
    $('historyList').innerHTML = html;
  }

  function openHistoryOrder(id) {
    var order = Store.getOrder(id);
    if (!order) return;
    showPreview(order, {
      title: '📄 ' + order.no,
      onDelete: function () {
        confirmDialog('删除单据', order.no + '　' + Receipt.fmtNum(order.total) + '元\n删除后无法恢复。', function () {
          Store.removeOrder(id);
          closeModal('previewModal');
          renderHistory();
          toast('已删除');
        });
      }
    });
  }

  /* ============ 品类管理页 ============ */

  var editingProductId = null;

  function renderProductList() {
    var list = Store.getProducts();
    if (!list.length) {
      $('productList').innerHTML = '<div class="empty-tip">还没有品类<br>点右上角「＋ 新增」添加</div>';
      return;
    }
    $('productList').innerHTML = list.map(function (p, i) {
      return '<div class="prod-item">' +
        '<span class="pi-emoji">' + esc(p.emoji) + '</span>' +
        '<div class="pi-info">' +
          '<div class="pi-name">' + esc(p.name) + '</div>' +
          '<div class="pi-price">¥' + Receipt.fmtNum(p.price) + ' / ' + esc(p.unit) + '</div>' +
        '</div>' +
        '<div class="pi-ops">' +
          '<button class="iconbtn" data-pmove="up" data-pid="' + p.id + '"' + (i === 0 ? ' disabled' : '') + '>↑</button>' +
          '<button class="iconbtn" data-pmove="down" data-pid="' + p.id + '"' + (i === list.length - 1 ? ' disabled' : '') + '>↓</button>' +
          '<button class="iconbtn" data-pedit="' + p.id + '">✏️</button>' +
          '<button class="iconbtn del" data-pdel="' + p.id + '">🗑️</button>' +
        '</div>' +
        '</div>';
    }).join('');
  }

  function openProductModal(id) {
    editingProductId = id || null;
    var p = id ? Store.getProduct(id) : null;
    $('productTitle').textContent = p ? '✏️ 编辑品类' : '＋ 新增品类';
    $('prodEmoji').value = p ? p.emoji : '🥬';
    $('prodName').value = p ? p.name : '';
    $('prodPrice').value = p ? String(p.price) : '';
    $('prodUnit').value = p ? p.unit : '斤';
    $('emojiPicker').innerHTML = EMOJI_CHOICES.map(function (e) {
      return '<button type="button" data-emoji="' + e + '">' + e + '</button>';
    }).join('');
    openModal('productModal');
  }

  function saveProductModal() {
    var name = $('prodName').value.trim();
    var price = parseFloat($('prodPrice').value);
    var unit = $('prodUnit').value.trim();
    var emoji = $('prodEmoji').value.trim() || '🥬';
    if (!name) { toast('请填名称'); return; }
    if (!isFinite(price) || price <= 0) { toast('单价要大于 0'); return; }
    if (!unit) { toast('请填单位，比如 斤'); return; }

    if (editingProductId) Store.updateProduct(editingProductId, { name: name, price: price, unit: unit, emoji: emoji });
    else Store.addProduct({ name: name, price: price, unit: unit, emoji: emoji });

    closeModal('productModal');
    renderProductList();
    renderBill();
    toast('已保存');
  }

  function deleteProduct(id) {
    var p = Store.getProduct(id);
    if (!p) return;
    confirmDialog('删除品类', '删除「' + p.name + '」后开单页就没有这个按钮了。\n已开的历史单据不受影响。', function () {
      Store.removeProduct(id);
      if (draft.pending && draft.pending.productId === id) draft.pending = null;
      renderProductList();
      renderBill();
      toast('已删除');
    });
  }

  /* ============ 设置页 ============ */

  function loadSettingsForm() {
    var s = Store.getSettings();
    $('setStoreName').value = s.storeName;
    $('setSubtitle').value = s.subtitle;
    $('setFooter').value = s.footer;
    refreshPinSettings();
  }

  function saveSettingsForm() {
    var name = $('setStoreName').value.trim();
    if (!name) { toast('店名不能为空'); return; }
    Store.saveSettings({
      storeName: name,
      subtitle: $('setSubtitle').value.trim(),
      footer: $('setFooter').value.trim()
    });
    renderBill();
    toast('已保存');
  }

  function backupFilename() {
    return '开单备份-' + Store.dayKey(Date.now()) + '.json';
  }

  function exportBackupFile() {
    var text = JSON.stringify(Store.exportAll());
    var ok = Exporter.downloadFile(backupFilename(), text, 'application/json');
    toast(ok ? '已导出，注意保存好文件' : '导出失败，请改用「复制备份文本」');
  }

  function exportBackupText() {
    var text = JSON.stringify(Store.exportAll());
    Exporter.copyText(text, function (ok) {
      if (ok) toast('备份文本已复制，发到微信收藏起来');
      else showCopyFallback(text);
    });
  }

  function importBackupText() {
    askText({
      title: '粘贴备份文本',
      value: '',
      rows: 6,
      placeholder: '把之前复制的备份文本粘贴到这里',
      hint: '恢复会覆盖当前手机上的全部数据。',
      onOk: function (text) {
        applyBackup(text);
      }
    });
  }

  function applyBackup(text) {
    var data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      toast('内容不是有效的备份数据');
      return;
    }
    confirmDialog('确认恢复', '恢复会覆盖这台手机上现有的全部单据和品类。', function () {
      var res = Store.importAll(data);
      if (!res.ok) { toast(res.message); return; }
      draft = newDraft();
      loadSettingsForm();
      renderBill();
      renderProductList();
      renderHistory();
      toast(res.message);
    });
  }

  function clearAllData() {
    confirmDialog('清空全部数据', '所有单据、品类、设置都会被删除，无法撤销。建议先导出一份备份。', function () {
      Store.clearAll();
      draft = newDraft();
      loadSettingsForm();
      renderBill();
      renderProductList();
      renderHistory();
      toast('已清空，品类已恢复默认');
    });
  }

  /* ============ 事件绑定 ============ */

  function bindGlobal() {
    // 所有 data-close 按钮和遮罩空白处关闭弹窗
    document.addEventListener('click', function (e) {
      var closer = e.target.closest ? e.target.closest('[data-close]') : null;
      if (closer) {
        var mask = closer.closest('.modal-mask');
        if (mask) mask.classList.remove('show');
        return;
      }
      if (e.target.classList && e.target.classList.contains('modal-mask')) {
        e.target.classList.remove('show');
      }
    });

    var backs = document.querySelectorAll('[data-back]');
    for (var i = 0; i < backs.length; i++) {
      backs[i].addEventListener('click', function () { showPage('pageBill'); });
    }
  }

  function editPlate() {
    askPlate(draft.plate, function (value) {
      draft.plate = value;
      if (value) Store.rememberPlate(value);
      renderBill();
    });
  }

  function editNote() {
    askText({
      title: '本单备注',
      value: draft.note,
      rows: 3,
      placeholder: '客户姓名、电话、送货地址…',
      hint: '这段文字会印在送货单上。',
      onOk: function (text) {
        draft.note = text.trim();
        renderBill();
      }
    });
  }

  function bindBillPage() {
    $('prodCol').addEventListener('click', function (e) {
      var btn = e.target.closest('.prod-key');
      if (btn) selectProduct(btn.getAttribute('data-pid'));
    });

    $('tapeBody').addEventListener('click', function (e) {
      var done = e.target.closest('.tape-line.done');
      if (done) {
        editLine(parseInt(done.getAttribute('data-idx'), 10));
        return;
      }
      if (e.target.closest('.tape-line.pending')) {
        actionSheet(draft.pending.name || '这一行', [
          { label: '改名称', onTap: editPendingName },
          {
            label: '取消这一行', danger: true, onTap: function () {
              draft.pending = null;
              renderBill();
            }
          }
        ]);
      }
    });

    $('btnPlate').addEventListener('click', editPlate);
    $('btnNote').addEventListener('click', editNote);

    var keys = document.querySelectorAll('.keypad .k[data-n]');
    for (var i = 0; i < keys.length; i++) {
      (function (key) {
        key.addEventListener('click', function () { inputDigit(key.getAttribute('data-n')); });
      })(keys[i]);
    }

    $('btnBackspace').addEventListener('click', backspace);
    $('btnTimes').addEventListener('click', pressTimes);
    $('btnEquals').addEventListener('click', pressEquals);
    $('btnFinish').addEventListener('click', finishOrder);
    $('btnClearDraft').addEventListener('click', clearDraft);
    $('btnCopyDraft').addEventListener('click', copyDraftText);

    $('btnMenu').addEventListener('click', function () {
      actionSheet('老板开财', [
        { label: '📚 历史单据', onTap: function () { historyShowAll = false; renderHistory(); showPage('pageHistory'); } },
        { label: '📦 品类管理', onTap: function () { renderProductList(); showPage('pageProducts'); } },
        { label: '⚙️ 设置与备份', onTap: function () { loadSettingsForm(); showPage('pageSettings'); } }
      ]);
    });
  }

  function bindModals() {
    // 数字弹窗
    $('numPad').addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-n]');
      if (!btn) return;
      var n = btn.getAttribute('data-n');
      numState.buf = n === 'del' ? Keypad.popDigit(numState.buf) : Keypad.pushDigit(numState.buf, n);
      renderNumDisplay();
    });
    $('numOk').addEventListener('click', function () {
      var value = Keypad.toNumber(numState.buf);
      // 回调返回 true 表示校验没过，弹窗留在原地让用户改
      var keepOpen = numState.onOk && numState.onOk(value, $('numCheck').checked);
      if (!keepOpen) closeModal('numModal');
    });

    // 文本弹窗
    $('textOk').addEventListener('click', function () {
      var keepOpen = textCb && textCb($('textInput').value);
      if (!keepOpen) closeModal('textModal');
    });

    // 确认框
    $('confirmOk').addEventListener('click', function () {
      closeModal('confirmModal');
      if (confirmCb) confirmCb();
      confirmCb = null;
    });

    // 操作条
    $('sheetList').addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-sheet]');
      if (!btn) return;
      var fn = sheetCbs[parseInt(btn.getAttribute('data-sheet'), 10)];
      closeModal('sheetModal');
      if (fn) fn();
    });

    // 车牌
    Keypad.buildPlateKeyboard($('provRow'), $('alnumPad'), function (kind, value) {
      if (kind === 'prov') plateState.value = Keypad.setProvince(plateState.value, value);
      else if (kind === 'del') plateState.value = Keypad.popPlate(plateState.value);
      else plateState.value = Keypad.pushPlate(plateState.value, value);
      renderPlate();
    });
    $('recentPlates').addEventListener('click', function (e) {
      var chip = e.target.closest('[data-plate]');
      if (!chip) return;
      plateState.value = chip.getAttribute('data-plate');
      renderPlate();
    });
    $('plateOk').addEventListener('click', function () {
      closeModal('plateModal');
      if (plateState.onOk) plateState.onOk(plateState.value);
    });
    $('plateClear').addEventListener('click', function () {
      closeModal('plateModal');
      if (plateState.onOk) plateState.onOk('');
    });

    // 小票预览
    $('previewCopy').addEventListener('click', function () {
      if (!previewOrder) return;
      copyOut(Receipt.toText(previewOrder), '文字已复制，去微信粘贴');
    });
    $('previewDelete').addEventListener('click', function () {
      if (previewDeleteCb) previewDeleteCb();
    });

    // 品类编辑
    $('emojiPicker').addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-emoji]');
      if (btn) $('prodEmoji').value = btn.getAttribute('data-emoji');
    });
    $('prodOk').addEventListener('click', saveProductModal);
  }

  function bindOtherPages() {
    $('historyList').addEventListener('click', function (e) {
      if (e.target.closest('#btnMoreHistory')) {
        historyShowAll = true;
        renderHistory();
        return;
      }
      var item = e.target.closest('.hist-row');
      if (item) openHistoryOrder(item.getAttribute('data-oid'));
    });

    $('btnAddProduct').addEventListener('click', function () { openProductModal(null); });
    $('productList').addEventListener('click', function (e) {
      var move = e.target.closest('[data-pmove]');
      if (move) {
        Store.moveProduct(move.getAttribute('data-pid'), move.getAttribute('data-pmove') === 'up' ? -1 : 1);
        renderProductList();
        renderBill();
        return;
      }
      var edit = e.target.closest('[data-pedit]');
      if (edit) { openProductModal(edit.getAttribute('data-pedit')); return; }
      var del = e.target.closest('[data-pdel]');
      if (del) deleteProduct(del.getAttribute('data-pdel'));
    });

    $('btnSaveSettings').addEventListener('click', saveSettingsForm);
    $('btnExportFile').addEventListener('click', exportBackupFile);
    $('btnExportText').addEventListener('click', exportBackupText);
    $('btnImportText').addEventListener('click', importBackupText);
    $('btnClearAll').addEventListener('click', clearAllData);

    $('btnImportFile').addEventListener('click', function () { $('importFileInput').click(); });
    $('importFileInput').addEventListener('change', function (e) {
      var file = e.target.files && e.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () { applyBackup(String(reader.result)); };
      reader.onerror = function () { toast('文件读取失败'); };
      reader.readAsText(file);
      e.target.value = '';
    });
  }

  /* ============ 启动 ============ */

  function init() {
    Store.setErrorHandler(function () {
      toast('保存失败：浏览器存储已满或处于隐私模式');
    });
    bindGlobal();
    bindBillPage();
    bindModals();
    bindOtherPages();
    bindPin();
    bootPin();
    loadSettingsForm();
    renderBill();
    renderProductList();
    renderHistory();
    if ('serviceWorker' in navigator) {
      var host = location.hostname;
      var ok = location.protocol === 'https:' || host === 'localhost' || host === '127.0.0.1';
      if (ok) navigator.serviceWorker.register('sw.js').catch(function () { /* 注册失败不影响开单 */ });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
