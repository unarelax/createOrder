/* 键盘层：数量输入缓冲的公共规则 + 车牌省份键盘 */
var Keypad = (function () {

  var PROVINCES = '京津冀晋蒙辽吉黑沪苏浙皖闽赣鲁豫鄂湘粤桂琼渝川贵云藏陕甘青宁新'.split('');
  var ALNUM_ROWS = ['1234567890', 'QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];
  var PLATE_MAX = 8;   // 新能源车牌是 8 位

  var MAX_DIGITS = 8;
  var MAX_DECIMALS = 2;

  /* ---------- 数字缓冲 ---------- */

  function pushDigit(buf, ch) {
    buf = buf || '';
    if (ch === '.') {
      if (buf.indexOf('.') >= 0) return buf;
      return buf === '' ? '0.' : buf + '.';
    }
    if (buf === '0') return ch;
    var dot = buf.indexOf('.');
    if (dot >= 0 && buf.length - dot > MAX_DECIMALS) return buf;
    if (buf.replace('.', '').length >= MAX_DIGITS) return buf;
    return buf + ch;
  }

  function popDigit(buf) {
    return (buf || '').slice(0, -1);
  }

  function toNumber(buf) {
    var n = parseFloat(buf);
    return isFinite(n) ? n : 0;
  }

  /* ---------- 车牌 ---------- */

  function pushPlate(plate, ch) {
    plate = plate || '';
    if (plate.length >= PLATE_MAX) return plate;
    return plate + ch;
  }

  // 第一位永远是省份简称，重复点省份是换省而不是追加
  function setProvince(plate, prov) {
    plate = plate || '';
    if (plate && PROVINCES.indexOf(plate[0]) >= 0) return prov + plate.slice(1);
    return prov + plate;
  }

  function popPlate(plate) {
    return (plate || '').slice(0, -1);
  }

  function buildPlateKeyboard(provEl, alnumEl, onKey) {
    provEl.innerHTML = PROVINCES.map(function (p) {
      return '<button type="button" data-prov="' + p + '">' + p + '</button>';
    }).join('');

    alnumEl.innerHTML = ALNUM_ROWS.map(function (row, i) {
      var keys = row.split('').map(function (c) {
        return '<button type="button" data-key="' + c + '">' + c + '</button>';
      }).join('');
      if (i === ALNUM_ROWS.length - 1) {
        keys += '<button type="button" class="bk" data-key="__del">⌫</button>';
      }
      return '<div class="arow">' + keys + '</div>';
    }).join('');

    provEl.addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-prov]');
      if (btn) onKey('prov', btn.getAttribute('data-prov'));
    });

    alnumEl.addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-key]');
      if (!btn) return;
      var key = btn.getAttribute('data-key');
      if (key === '__del') onKey('del');
      else onKey('char', key);
    });
  }

  return {
    PROVINCES: PROVINCES,
    pushDigit: pushDigit,
    popDigit: popDigit,
    toNumber: toNumber,
    pushPlate: pushPlate,
    setProvince: setProvince,
    popPlate: popPlate,
    buildPlateKeyboard: buildPlateKeyboard
  };
})();
