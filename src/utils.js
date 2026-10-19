/* Utilidades de data, formatação pt-BR, PRNG determinístico, CSV e hash. */
(function (global) {
  'use strict';

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function toISO(d) {
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function fromISO(texto) {
    var p = String(texto || '').split(/[-T:]/);
    return new Date(Number(p[0]) || 1970, (Number(p[1]) || 1) - 1, Number(p[2]) || 1,
      Number(p[3]) || 0, Number(p[4]) || 0, Number(p[5]) || 0);
  }

  function hojeISO() { return toISO(new Date()); }

  function agoraISO() {
    var d = new Date();
    return toISO(d) + 'T' + pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
  }

  function addDias(iso, n) {
    var d = fromISO(iso);
    d.setDate(d.getDate() + n);
    return toISO(d);
  }

  function diffDias(a, b) {
    return Math.round((fromISO(b) - fromISO(a)) / 86400000);
  }

  function dataLegivel(iso) {
    var d = fromISO(iso);
    return pad2(d.getDate()) + '/' + pad2(d.getMonth() + 1) + '/' + d.getFullYear();
  }

  function dataHora(iso) {
    var d = fromISO(iso);
    return pad2(d.getDate()) + '/' + pad2(d.getMonth() + 1) + ' ' +
      pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }

  function num(valor, casas) {
    var n = Number(valor);
    if (!isFinite(n)) n = 0;
    return n.toLocaleString('pt-BR', { minimumFractionDigits: casas || 0, maximumFractionDigits: casas || 0 });
  }

  function pct(valor, casas) {
    return num(valor, casas == null ? 1 : casas) + '%';
  }

  function dur(ms) {
    if (ms == null) return '—';
    if (ms < 1000) return num(ms) + ' ms';
    var s = ms / 1000;
    if (s < 60) return num(s, 1) + ' s';
    var m = Math.floor(s / 60);
    return m + ' min ' + pad2(Math.round(s % 60));
  }

  var seq = 0;
  function uid(prefixo) {
    seq++;
    return (prefixo || 'id') + '-' + Date.now().toString(36) + '-' + seq.toString(36);
  }

  function round(v, casas) {
    var f = Math.pow(10, casas == null ? 2 : casas);
    return Math.round((Number(v) || 0) * f) / f;
  }

  function sum(lista, fn) {
    return (lista || []).reduce(function (acc, item, i) { return acc + (fn ? fn(item, i) : item); }, 0);
  }

  function groupBy(lista, fn) {
    var out = Object.create(null);
    (lista || []).forEach(function (item, i) {
      var chave = fn(item, i);
      (out[chave] || (out[chave] = [])).push(item);
    });
    return out;
  }

  function clone(obj) { return JSON.parse(JSON.stringify(obj)); }

  function escapeHtml(texto) {
    return String(texto == null ? '' : texto)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function plural(qtd, singular, pluralForma) {
    var n = Number(qtd) || 0;
    return num(n) + ' ' + (n === 1 ? singular : pluralForma);
  }

  function toCSV(lista, colunas) {
    function celula(v) {
      if (v == null) return '';
      var s = String(v);
      if (/[";\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
      return s;
    }
    var cabecalho = colunas.map(function (c) { return celula(c.label); }).join(';');
    var linhas = (lista || []).map(function (linha) {
      return colunas.map(function (c) {
        return celula(typeof c.value === 'function' ? c.value(linha) : linha[c.key]);
      }).join(';');
    });
    return [cabecalho].concat(linhas).join('\r\n');
  }

  function downloadText(nome, texto, mime) {
    var blob = new Blob(['\ufeff' + texto], { type: (mime || 'text/plain') + ';charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = nome;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function debounce(fn, ms) {
    var t;
    return function () {
      var self = this, args = arguments;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, ms || 200);
    };
  }

  /** mulberry32: PRNG determinístico para dados de demonstração reproduzíveis. */
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** FNV-1a em duas passadas para gerar identidade curta de conteúdo. */
  function hashTexto(texto) {
    var s = String(texto || '');
    var h1 = 0x811c9dc5, h2 = 0x01000193;
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
      h2 = Math.imul(h2 + c, 0x85ebca6b) >>> 0;
    }
    return (h1.toString(16) + h2.toString(16)).slice(0, 16).padStart(16, '0');
  }

  global.U = {
    pad2: pad2,
    toISO: toISO,
    fromISO: fromISO,
    hojeISO: hojeISO,
    agoraISO: agoraISO,
    addDias: addDias,
    diffDias: diffDias,
    dataLegivel: dataLegivel,
    dataHora: dataHora,
    num: num,
    pct: pct,
    dur: dur,
    uid: uid,
    round: round,
    sum: sum,
    groupBy: groupBy,
    clone: clone,
    escapeHtml: escapeHtml,
    plural: plural,
    toCSV: toCSV,
    downloadText: downloadText,
    debounce: debounce,
    rng: rng,
    hashTexto: hashTexto
  };
})(window);
