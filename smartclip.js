// Smart clipboard: recognises what was just copied and offers the one useful thing to do.
//   link  -> open it, or download it with IDM Nova when that is running
//   color -> show the swatch
//   math  -> the result (a click copies it)
//   long text -> word count
// Arithmetic goes through a tiny parser (numbers, + - * / ^ % and parentheses), never eval.

// --- arithmetic ---
function calc(src) {
  const s = src.replace(/×/g, '*').replace(/÷/g, '/').replace(/,/g, '').replace(/\s+/g, '');
  let i = 0;
  const peek = () => s[i];
  function num() {
    const m = s.slice(i).match(/^\d+(\.\d+)?/);
    if (!m) throw new Error('number');
    i += m[0].length;
    return parseFloat(m[0]);
  }
  function atom() {
    if (peek() === '-') { i++; return -atom(); }
    if (peek() === '+') { i++; return atom(); }
    if (peek() === '(') {
      i++;
      const v = expr();
      if (s[i++] !== ')') throw new Error('paren');
      return v;
    }
    let v = num();
    if (peek() === '%') { i++; v /= 100; }
    return v;
  }
  function power() {
    const b = atom();
    if (peek() === '^') { i++; return b ** power(); }
    return b;
  }
  function term() {
    let v = power();
    while (peek() === '*' || peek() === '/') {
      const op = s[i++];
      const r = power();
      v = op === '*' ? v * r : v / r;
    }
    return v;
  }
  function expr() {
    let v = term();
    while (peek() === '+' || peek() === '-') {
      const op = s[i++];
      const r = term();
      v = op === '+' ? v + r : v - r;
    }
    return v;
  }
  const v = expr();
  if (i !== s.length || !Number.isFinite(v)) throw new Error('trailing');
  return v;
}

const fmtNum = (v) => (Number.isInteger(v) ? String(v) : String(+v.toFixed(8)));

function classify(text) {
  const t = text.trim();
  if (!t || t.length > 4000) return null;
  if (/^https?:\/\/[^\s]+$/i.test(t) && t.length <= 2000) return { type: 'url', url: t, host: new URL(t).hostname.replace(/^www\./, '') };
  if (/^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(t) || /^(rgb|rgba|hsl|hsla)\([\d\s.,%/deg]+\)$/i.test(t)) return { type: 'color', color: t };
  // arithmetic: digits with at least one operator between them — but not dates (12-10-2026,
  // 29/10/2026) or dashed phone numbers (010-1234-5678)
  const dateOrPhone = /^\d{1,4}([-/.])\d{1,4}\1\d{1,4}$/.test(t) || /^\+?\d+(-\d+)+$/.test(t);
  if (!dateOrPhone && t.length <= 80 && /^[\d\s+\-*/().,%×÷^]+$/.test(t) && /\d\s*[+\-*/×÷^%]\s*[\d(]/.test(t)) {
    try { return { type: 'math', expr: t, result: fmtNum(calc(t)) }; } catch {}
  }
  const words = t.split(/\s+/).filter(Boolean).length;
  if (words >= 30) return { type: 'text', words, chars: t.length };
  return null;
}

module.exports = { classify, calc };
