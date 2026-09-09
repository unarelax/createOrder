/* 应用层：页面切换、开单状态机、各弹窗与页面渲染 */
(function () {

  var EMOJI_CHOICES = ['🧱', '⛰️', '🟫', '🔩', '🪵', '🧰', '🪟', '🚪', '🪣', '🛢️', '🪜', '⚙️', '🔧', '🧊', '🎨', '📦'];

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

  // 把还没入账的那一行也算进去，复制出来的文字和屏幕上看到的一致
  function draftAsOrder() {
    var p = draft.pending;
    var qty = p ? Keypad.toNumber(p.qtyStr) : 0;
    var lines = draft.lines.slice();
    if (p && qty > 0) lines.push({ name: p.name, unit: p.unit, price: p.price, qty: Store.round2(qty) });
    return {
      no: Store.peekOrderNo(Date.now()),
      createdAt: Date.now(),
      plate: draft.plate,
      note: draft.note,
      lines: lines,
      total: Store.orderTotal(lines)
    };
  }

  function productNo(productId) {
    var list = Store.getProducts();
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === productId) return String(i + 1);
    }
    return '';
  }

  function renderProducts() {
    var list = Store.getProducts();
    if (!list.length) {
      $('prodCol').innerHTML = '<div class="prod-empty">还没有品类<br>去「☰ → 品类管理」添加</div>';
      return;
    }
    var p = draft.pending;
    $('prodCol').innerHTML = list.map(function (item, idx) {
      var active = p && p.productId === item.id;
      var mod = active && (p.renamed || p.repriced);
      var name = active ? p.name : item.name;
      var price = active ? p.price : item.price;
      return '<button type="button" class="prod-btn ' + (mod ? 'modified' : (active ? 'active' : '')) + '" data-pid="' + item.id + '">' +
        '<span class="pno">' + (idx + 1) + '</span>' +
        '<span class="pn">' + esc(name) + '</span>' +
        '<span class="pp">' + Receipt.fmtNum(price) + '元 / ' + esc(item.unit) + '</span>' +
        '</button>';
    }).join('');
  }

  function renderReceipt() {
    var s = Store.getSettings();
    $('rStore').textContent = s.storeName;
    $('rSub').textContent = s.subtitle;
    $('rFoot').textContent = s.footer;

    var plateHtml = draft.plate
      ? '<span class="r-fill" data-edit="plate">' + esc(draft.plate) + ' ✏️</span>'
      : '<span class="r-fill empty" data-edit="plate">点这里填车号（可不填）</span>';
    var noteHtml = draft.note
      ? '<span class="r-fill" data-edit="note">' + esc(draft.note) + ' ✏️</span>'
      : '<span class="r-fill empty" data-edit="note">点这里写备注 / 客户姓名</span>';

    $('rHead').innerHTML =
      '单号：' + esc(Store.peekOrderNo(Date.now())) + '<br>' +
      '时间：' + esc(Store.fmtDateTime(Date.now())) + '<br>' +
      '车号：' + plateHtml + '<br>' +
      '备注：' + noteHtml;

    function ledgerRow(cls, idx, no, name, qtyHtml, priceHtml, amountHtml, renamed, repriced) {
      return '<tr class="r-line ' + cls + '"' + (idx != null ? ' data-idx="' + idx + '"' : '') + '>' +
        '<td class="c-no">' + esc(no) + '</td>' +
        '<td class="c-name' + (renamed ? ' renamed' : '') + '">' + esc(name) + '</td>' +
        '<td class="c-qty">' + qtyHtml + '</td>' +
        '<td class="c-price' + (repriced ? ' changed' : '') + '">' + priceHtml + '</td>' +
        '<td class="c-amt">' + amountHtml + '</td>' +
        '</tr>';
    }

    var html = '';
    draft.lines.forEach(function (l, i) {
      html += ledgerRow(
        'done',
        i,
        productNo(l.productId) || String(i + 1),
        l.name,
        Receipt.fmtNum(l.qty) + esc(l.unit || ''),
        esc(Receipt.pricePerUnit(l.price, l.unit)),
        esc(Receipt.amountText(l)),
        l.renamed,
        l.repriced
      );
    });

    var p = draft.pending;
    if (p) {
      var qty = Keypad.toNumber(p.qtyStr);
      var amount = p.qtyStr ? Receipt.fmtNum(Store.lineAmount(qty, p.price)) + '元' : '—';
      html += ledgerRow(
        'pending',
        null,
        productNo(p.productId),
        p.name,
        esc(p.qtyStr || '_') + esc(p.unit) + '▌',
        esc(Receipt.pricePerUnit(p.price, p.unit)),
        amount,
        p.renamed,
        p.repriced
      );
    }

    if (!draft.lines.length && !p) {
      html = '<tr><td colspan="5" class="r-empty">点左边品类开始开单<br>再敲数量，最后按「完成本单」</td></tr>';
    }
    $('rLines').innerHTML = html;

    var total = Store.orderTotal(draft.lines);
    if (p && p.qtyStr) total = Store.round2(total + Store.lineAmount(Keypad.toNumber(p.qtyStr), p.price));
    $('rTotal').textContent = Receipt.fmtNum(total) + '元';
  }

  function renderBill() {
    renderProducts();
    renderReceipt();
  }

  // 有有效数量就入账，没敲数量就当作用户改主意，直接丢弃
  function commitPending() {
    var p = draft.pending;
    draft.pending = null;
    if (!p) return false;
    var qty = Keypad.toNumber(p.qtyStr);
    if (!(qty > 0)) return false;
    draft.lines.push({
      productId: p.productId,
      name: p.name,
      unit: p.unit,
      price: p.price,
      qty: Store.round2(qty),
      renamed: p.renamed,
      repriced: p.repriced
    });
    return true;
  }

  function selectProduct(id) {
    var item = Store.getProduct(id);
    if (!item) return;
    commitPending();
    draft.pending = {
      productId: item.id,
      name: item.name,
      unit: item.unit,
      price: item.price,
      qtyStr: '',
      renamed: false,
      repriced: false
    };
    renderBill();
  }

  function inputDigit(ch) {
    if (!draft.pending) { toast('先点左边的品类'); return; }
    draft.pending.qtyStr = Keypad.pushDigit(draft.pending.qtyStr, ch);
    renderReceipt();
  }

  function backspace() {
    var p = draft.pending;
    if (!p) { toast('先点左边的品类'); return; }
    if (p.qtyStr) {
      p.qtyStr = Keypad.popDigit(p.qtyStr);
      renderReceipt();
      return;
    }
    draft.pending = null;   // 数量已空，再退一格就取消这一行
    renderBill();
  }

  function editPendingPrice() {
    var p = draft.pending;
    if (!p) { toast('先点左边的品类'); return; }
    askNumber({
      title: '💲 ' + p.name + ' · 本单单价',
      value: String(p.price),
      checkbox: { label: '同时存为默认价（以后开单都用它）', checked: false },
      onOk: function (value, saveDefault) {
        if (!(value > 0)) { toast('单价要大于 0'); return true; }
        p.price = Store.round2(value);
        var base = Store.getProduct(p.productId);
        p.repriced = !base || base.price !== p.price;
        if (saveDefault && base) {
          Store.updateProduct(p.productId, { price: p.price });
          p.repriced = false;
          toast('已存为默认价');
        }
        renderBill();
      }
    });
  }

  function editPendingName() {
    var p = draft.pending;
    if (!p) { toast('先点左边的品类'); return; }
    askText({
      title: '🏷️ 本单临时改名',
      value: p.name,
      rows: 1,
      placeholder: '例如：水泥（42.5）',
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
    actionSheet(l.name + '  ' + Receipt.detailText(l) + ' = ' + Receipt.amountText(l), [
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
      toast('还没录入商品，先点品类再敲数量');
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

  function copyDraftText() {
    var order = draftAsOrder();
    if (!order.lines.length) { toast('本单还是空的'); return; }
    Exporter.copyText(Receipt.toText(order), function (ok) {
      toast(ok ? '文字已复制，去微信粘贴' : '复制失败，请长按小票手动选择');
    });
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

    var groups = Store.groupOrdersByDay();
    if (!groups.length) {
      $('historyList').innerHTML = '<div class="empty-tip">还没有历史单据<br>完成一单后会自动存在这里</div>';
      return;
    }
    var visible = historyShowAll ? groups : groups.slice(0, HISTORY_DAYS);
    var html = visible.map(function (g) {
      var items = g.orders.map(function (o) {
        var meta = [];
        if (o.plate) meta.push('🚚 ' + o.plate);
        if (o.note) meta.push('📝 ' + o.note);
        return '<div class="order-item" data-oid="' + esc(o.id) + '">' +
          '<div class="order-top">' +
            '<span class="order-no">' + esc(o.no) + ' · ' + esc(Store.fmtDateTime(o.createdAt).slice(11)) + '</span>' +
            '<span class="order-total">' + Receipt.fmtNum(o.total) + '元</span>' +
          '</div>' +
          '<div class="order-goods">' + esc(Receipt.summarize(o)) + '</div>' +
          (meta.length ? '<div class="order-meta">' + esc(meta.join('　')) + '</div>' : '') +
          '</div>';
      }).join('');
      return '<div class="day-group">' +
        '<div class="day-head"><span>' + esc(g.label) + '　' + g.orders.length + ' 单</span><b>' + Receipt.fmtNum(g.total) + '元</b></div>' +
        items + '</div>';
    }).join('');

    if (!historyShowAll && groups.length > HISTORY_DAYS) {
      html += '<button class="wbtn" id="btnMoreHistory">查看更早的单据（还有 ' + (groups.length - HISTORY_DAYS) + ' 天）</button>';
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
    $('prodEmoji').value = p ? p.emoji : '📦';
    $('prodName').value = p ? p.name : '';
    $('prodPrice').value = p ? String(p.price) : '';
    $('prodUnit').value = p ? p.unit : '';
    $('emojiPicker').innerHTML = EMOJI_CHOICES.map(function (e) {
      return '<button type="button" data-emoji="' + e + '">' + e + '</button>';
    }).join('');
    openModal('productModal');
  }

  function saveProductModal() {
    var name = $('prodName').value.trim();
    var price = parseFloat($('prodPrice').value);
    var unit = $('prodUnit').value.trim();
    var emoji = $('prodEmoji').value.trim() || '📦';
    if (!name) { toast('请填名称'); return; }
    if (!isFinite(price) || price <= 0) { toast('单价要大于 0'); return; }
    if (!unit) { toast('请填单位，比如 吨 / 方 / 块'); return; }

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
      toast(ok ? '备份文本已复制，发到微信收藏起来' : '复制失败，请改用「导出备份文件」');
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

  function bindBillPage() {
    $('prodCol').addEventListener('click', function (e) {
      var btn = e.target.closest('.prod-btn');
      if (btn) selectProduct(btn.getAttribute('data-pid'));
    });

    $('rLines').addEventListener('click', function (e) {
      var row = e.target.closest('.r-line.done');
      if (row) editLine(parseInt(row.getAttribute('data-idx'), 10));
    });

    $('rHead').addEventListener('click', function (e) {
      var el = e.target.closest('[data-edit]');
      if (!el) return;
      if (el.getAttribute('data-edit') === 'plate') {
        askPlate(draft.plate, function (value) {
          draft.plate = value;
          if (value) Store.rememberPlate(value);
          renderReceipt();
        });
      } else {
        askText({
          title: '📝 本单备注',
          value: draft.note,
          rows: 3,
          placeholder: '客户姓名、电话、送货地址…',
          hint: '这段文字会印在小票上。',
          onOk: function (text) {
            draft.note = text.trim();
            renderReceipt();
          }
        });
      }
    });

    var keys = document.querySelectorAll('.keypad .k[data-n]');
    for (var i = 0; i < keys.length; i++) {
      (function (key) {
        key.addEventListener('click', function () { inputDigit(key.getAttribute('data-n')); });
      })(keys[i]);
    }

    $('btnBackspace').addEventListener('click', backspace);
    $('btnEditName').addEventListener('click', editPendingName);
    $('btnEditPrice').addEventListener('click', editPendingPrice);
    $('btnFinish').addEventListener('click', finishOrder);
    $('btnClearDraft').addEventListener('click', clearDraft);
    $('btnCopyDraft').addEventListener('click', copyDraftText);

    $('btnMenu').addEventListener('click', function () {
      actionSheet('快速开单', [
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
      Exporter.copyText(Receipt.toText(previewOrder), function (ok) {
        toast(ok ? '文字已复制，去微信粘贴' : '复制失败，请改用图片');
      });
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
      var item = e.target.closest('.order-item');
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
    loadSettingsForm();
    renderBill();
    renderProductList();
    renderHistory();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
