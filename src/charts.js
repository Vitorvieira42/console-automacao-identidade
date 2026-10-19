/* Gráficos Chart.js do painel: derivação, fila, membros por grupo, SLA e conformidade. */
(function (global) {
  'use strict';

  var registry = Object.create(null);
  var handlers = {};

  function cssVar(nome) {
    return getComputedStyle(document.documentElement).getPropertyValue(nome).trim();
  }

  function palette() {
    return {
      texto: cssVar('--text') || '#d9e2ec',
      dim: cssVar('--text-dim') || '#8b99a8',
      grade: cssVar('--line') || '#26313f',
      card: cssVar('--card') || '#161d27',
      accent: cssVar('--accent') || '#4ea1ff',
      ok: cssVar('--ok') || '#3fb984',
      warn: cssVar('--warn') || '#e0a340',
      bad: cssVar('--bad') || '#ec6a5e',
      crit: cssVar('--crit') || '#f0639a',
      roxo: '#b48cf2'
    };
  }

  function rgba(hex, alpha) {
    var h = String(hex).replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + alpha + ')';
  }

  function applyDefaults() {
    if (!global.Chart) return;
    Chart.defaults.font.family = 'ui-monospace, "Cascadia Mono", Consolas, monospace';
    Chart.defaults.font.size = 11;
    Chart.defaults.maintainAspectRatio = false;
    Chart.defaults.animation.duration = 260;
  }

  function baseOptions(o) {
    var c = palette();
    return Object.assign({
      responsive: true,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { color: c.dim, boxWidth: 10, boxHeight: 10, usePointStyle: true, pointStyle: 'rectRounded' } },
        tooltip: {
          backgroundColor: c.card, titleColor: c.texto, bodyColor: c.texto,
          borderColor: c.grade, borderWidth: 1, padding: 9, displayColors: true, cornerRadius: 7
        }
      },
      scales: {
        x: { ticks: { color: c.dim, maxRotation: 0, autoSkip: true }, grid: { color: rgba(c.grade, .5) } },
        y: { ticks: { color: c.dim }, grid: { color: rgba(c.grade, .5) } }
      }
    }, o || {});
  }

  function setEmpty(canvasId, on, msg) {
    var canvas = document.getElementById(canvasId);
    if (!canvas || !canvas.parentNode) return;
    var box = canvas.parentNode.querySelector('.chart-empty');
    if (!box) {
      box = document.createElement('div');
      box.className = 'chart-empty';
      canvas.parentNode.appendChild(box);
    }
    box.textContent = msg || 'Sem dados no período.';
    box.classList.toggle('is-on', !!on);
  }

  function mount(canvasId, type, data, options) {
    var canvas = document.getElementById(canvasId);
    if (!canvas) return null;
    var chart = registry[canvasId];
    if (chart && chart.config.type === type) {
      chart.data = data;
      Object.keys(options || {}).forEach(function (key) { chart.options[key] = options[key]; });
      chart.update();
      return chart;
    }
    if (chart) chart.destroy();
    registry[canvasId] = new Chart(canvas, { type: type, data: data, options: options || {} });
    return registry[canvasId];
  }

  function recolor() {
    Object.keys(registry).forEach(function (id) {
      registry[id].destroy();
      delete registry[id];
    });
    if (typeof global.Charts !== 'undefined' && global.Charts.renderAll) global.Charts.renderAll();
  }

  function clickBars(fn) {
    return function (evt, els, chart) {
      if (!els.length) return;
      var label = chart.data.labels[els[0].index];
      fn(label, els[0]);
    };
  }

  /* --------------------- 1. derivação do plano por setor --------------------- */
  var RISCOS = ['baixo', 'medio', 'alto'];

  function setorDaOperacao(estado, o) {
    if (/^(GG_|grupo)/i.test(o.alvo) || /Grupo$/.test(o.tipo)) return 'Grupos';
    var u = AD.usuario(estado, o.alvo) || (o.depois && o.depois.membro ? AD.usuario(estado, o.depois.membro) : null);
    return (u && u.setor) || 'Grupos';
  }

  function renderDeriva(estado, ops) {
    var c = palette();
    var setores = ['Financeiro', 'Operacoes', 'TI', 'RH', 'Prestadores', 'Grupos'];
    var cores = { baixo: c.ok, medio: c.warn, alto: c.bad };
    var matriz = {};
    setores.forEach(function (s) { matriz[s] = { baixo: 0, medio: 0, alto: 0 }; });
    ops.forEach(function (o) {
      var s = setorDaOperacao(estado, o);
      matriz[s][o.risco] = (matriz[s][o.risco] || 0) + 1;
    });
    var ds = RISCOS.map(function (r) {
      return {
        label: r === 'medio' ? 'médio' : r,
        data: setores.map(function (s) { return matriz[s][r] || 0; }),
        backgroundColor: rgba(cores[r], .78),
        borderColor: cores[r],
        borderWidth: 1,
        borderRadius: 3
      };
    });
    setEmpty('chartDeriva', !ops.length, 'Nenhuma derivação: o diretório bate com o estado desejado.');
    mount('chartDeriva', 'bar', { labels: setores, datasets: ds }, baseOptions({
      plugins: { legend: { position: 'bottom', labels: { color: c.dim, usePointStyle: true, pointStyle: 'rectRounded' } },
        tooltip: Object.assign({}, baseOptions().plugins.tooltip, {
          footer: function (itens) {
            var t = itens.reduce(function (a, i) { return a + i.parsed.y; }, 0);
            return U.plural(t, 'operação no grupo', 'operações no grupo');
          }
        }) },
      scales: {
        x: { stacked: true, ticks: { color: c.dim }, grid: { color: rgba(c.grade, .4) } },
        y: { stacked: true, beginAtZero: true, ticks: { color: c.dim, precision: 0 }, grid: { color: rgba(c.grade, .5) } }
      }
    }));
    return { setores: setores, matriz: matriz };
  }

  function alternarSerie(canvasId, indice) {
    var chart = registry[canvasId];
    if (!chart || !chart.data.datasets[indice]) return null;
    var vis = chart.isDatasetVisible(indice);
    chart.setDatasetVisibility(indice, !vis);
    chart.update();
    return !vis;
  }

  /* --------------------------- 2. fila por dia --------------------------- */
  var TIPOS_FILA = ['onboarding', 'offboarding', 'ajuste', 'consolidacao'];

  function renderFila(requisicoes) {
    var c = palette();
    var dias = [];
    var hoje = U.hojeISO();
    for (var i = 13; i >= 0; i--) dias.push(U.addDias(hoje, -i));
    var cores = { onboarding: c.accent, offboarding: c.bad, ajuste: c.warn, consolidacao: c.roxo };
    var nomes = { onboarding: 'onboarding', offboarding: 'offboarding', ajuste: 'ajuste', consolidacao: 'consolidação' };
    var ds = TIPOS_FILA.map(function (t) {
      return {
        label: nomes[t],
        data: dias.map(function (d) {
          return requisicoes.filter(function (r) { return r.aberta.slice(0, 10) === d && r.tipo === t; }).length;
        }),
        backgroundColor: rgba(cores[t], .72),
        borderColor: cores[t],
        borderWidth: 1,
        borderRadius: 3
      };
    });
    var total = dias.reduce(function (acc, d, i) {
      return acc + ds.reduce(function (a, s) { return a + s.data[i]; }, 0);
    }, 0);
    setEmpty('chartFila', !total, 'Sem requisições nos últimos 14 dias.');
    mount('chartFila', 'bar', { labels: dias.map(function (d) { return U.dataLegivel(d).slice(0, 5); }), datasets: ds }, baseOptions({
      plugins: { legend: { position: 'bottom', labels: { color: c.dim, usePointStyle: true, pointStyle: 'rectRounded' } },
        tooltip: Object.assign({}, baseOptions().plugins.tooltip, {
          callbacks: {
            footer: function (itens) {
              var t = itens.reduce(function (a, i) { return a + i.parsed.y; }, 0);
              return U.plural(t, 'requisição no dia', 'requisições no dia');
            }
          }
        }) },
      scales: {
        x: { stacked: true, ticks: { color: c.dim }, grid: { color: rgba(c.grade, .4) } },
        y: { stacked: true, beginAtZero: true, ticks: { color: c.dim, precision: 0 }, grid: { color: rgba(c.grade, .5) } }
      }
    }));
    return { dias: dias, total: total };
  }

  /* ------------------------ 3. membros por grupo ------------------------ */
  function renderGrupos(estado, filtrar) {
    var c = palette();
    var lista = estado.grupos.map(function (g) {
      var membros = AD.membrosDoGrupo(estado, g.nome).filter(function (u) { return u.ativo; });
      return { nome: g.nome, membros: membros.length, critico: !!g.critico, escopo: g.escopo,
        externos: membros.filter(function (m) { return m.ou.indexOf('Externos') >= 0; }).length };
    }).filter(function (g) { return filtrar ? g.membros > 0 : true; })
      .sort(function (a, b) { return b.membros - a.membros; });

    mount('chartGrupos', 'bar', {
      labels: lista.map(function (g) { return g.nome.replace(/^GG_/, ''); }),
      datasets: [{
        label: 'Membros ativos',
        data: lista.map(function (g) { return g.membros; }),
        backgroundColor: lista.map(function (g) { return rgba(g.critico ? c.crit : c.accent, .7); }),
        borderColor: lista.map(function (g) { return g.critico ? c.crit : c.accent; }),
        borderWidth: 1,
        borderRadius: 4
      }]
    }, baseOptions({
      indexAxis: 'y',
      onClick: clickBars(function (label) { if (handlers.onGroup) handlers.onGroup('GG_' + label); }),
      plugins: { legend: { display: false },
        tooltip: Object.assign({}, baseOptions().plugins.tooltip, {
          mode: 'nearest', intersect: true,
          callbacks: {
            title: function (itens) { return lista[itens[0].dataIndex].nome; },
            label: function (item) {
              var g = lista[item.dataIndex];
              return U.num(g.membros) + ' membros ativos · escopo ' + g.escopo +
                (g.critico ? ' · crítico' : '') + (g.externos ? ' · ' + g.externos + ' externo(s)' : '');
            }
          }
        }) },
      scales: {
        x: { beginAtZero: true, ticks: { color: c.dim, precision: 0 }, grid: { color: rgba(c.grade, .5) } },
        y: { ticks: { color: c.dim, font: { size: 10.5 } }, grid: { display: false } }
      }
    }));
    return lista;
  }

  /* --------------------------- 4. SLA por req --------------------------- */
  function renderSla(requisicoes, slaHoras) {
    var c = palette();
    var lista = requisicoes.filter(function (r) { return r.fim && r.aberta; })
      .map(function (r) {
        return { protocolo: r.protocolo.replace(/^REQ-\d+-/, ''), horas: U.round((U.fromISO(r.fim) - U.fromISO(r.aberta)) / 3600000, 1),
          status: r.status, tipo: r.tipo, titulo: r.titulo };
      })
      .sort(function (a, b) { return b.horas - a.horas; })
      .slice(0, 12);
    var cor = function (r) {
      if (r.status === 'revertida') return c.roxo;
      if (r.status === 'rejeitada' || r.status === 'falhou') return c.bad;
      return r.horas > slaHoras ? c.warn : c.ok;
    };
    setEmpty('chartSla', !lista.length, 'Ainda não há requisições encerradas para medir SLA.');
    mount('chartSla', 'bar', {
      labels: lista.map(function (r) { return r.protocolo; }),
      datasets: [{
        label: 'Horas',
        data: lista.map(function (r) { return r.horas; }),
        backgroundColor: lista.map(function (r) { return rgba(cor(r), .7); }),
        borderColor: lista.map(cor),
        borderWidth: 1,
        borderRadius: 4
      }]
    }, baseOptions({
      onClick: clickBars(function (label, el) { if (handlers.onRequest) handlers.onRequest(lista[el.index].protocolo); }),
      plugins: { legend: { display: false },
        tooltip: Object.assign({}, baseOptions().plugins.tooltip, {
          mode: 'nearest', intersect: true,
          callbacks: {
            title: function (itens) { return lista[itens[0].dataIndex].protocolo; },
            label: function (item) {
              var r = lista[item.dataIndex];
              return U.num(r.horas, 1) + ' h · ' + r.tipo + ' · ' + r.status + (r.horas > slaHoras ? ' · fora do SLA' : '');
            }
          }
        }) },
      scales: {
        x: { ticks: { color: c.dim }, grid: { color: rgba(c.grade, .3) } },
        y: { beginAtZero: true, ticks: { color: c.dim, callback: function (v) { return v + 'h'; } }, grid: { color: rgba(c.grade, .5) } }
      }
    }));
    return lista;
  }

  /* ----------------------- 5. conformidade (rosca) ----------------------- */
  function renderConformidade(resumoGov, centroHtml) {
    var c = palette();
    var ordem = ['critica', 'alta', 'media', 'baixa'];
    var rotulo = { critica: 'crítica', alta: 'alta', media: 'média', baixa: 'baixa' };
    var cores = { critica: c.crit, alta: c.bad, media: c.warn, baixa: c.dim };
    var rot = resumoGov.porSeveridade;
    var total = resumoGov.violacoes;
    var box = document.getElementById('gaugeCenter');
    if (box) box.innerHTML = centroHtml || '';
    setEmpty('chartConformidade', !total, 'Nenhum achado de conformidade no inventário atual.');
    mount('chartConformidade', 'doughnut', {
      labels: ordem.map(function (k) { return rotulo[k]; }),
      datasets: [{
        data: ordem.map(function (k) { return rot[k] || 0; }),
        backgroundColor: ordem.map(function (k) { return rgba(cores[k], .82); }),
        borderColor: c.card,
        borderWidth: 2,
        hoverOffset: 6
      }]
    }, baseOptions({
      cutout: '68%',
      plugins: { legend: { position: 'bottom', labels: { color: c.dim, usePointStyle: true, pointStyle: 'circle' } },
        tooltip: Object.assign({}, baseOptions().plugins.tooltip, {
          callbacks: {
            label: function (item) {
              var pctual = total ? U.round(item.parsed / total * 100, 1) : 0;
              return item.label + ': ' + U.num(item.parsed) + ' (' + U.num(pctual, 1) + '%)';
            }
          }
        }) }
    }));
    return resumoGov;
  }

  function setHandlers(h) { handlers = h || {}; }

  global.Charts = {
    applyDefaults: applyDefaults,
    palette: palette,
    setHandlers: setHandlers,
    alternarSerie: alternarSerie,
    renderDeriva: renderDeriva,
    renderFila: renderFila,
    renderGrupos: renderGrupos,
    renderSla: renderSla,
    renderConformidade: renderConformidade,
    recolor: recolor,
    setEmpty: setEmpty,
    TIPOS_FILA: TIPOS_FILA
  };
})(window);
