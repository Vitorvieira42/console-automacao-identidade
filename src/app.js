/* Bootstrap da console: tema, bindings de controles, ciclo de vida do estado. */
(function (global) {
  'use strict';

  var ATALHOS = {
    '1': 'painel', '2': 'diretorio', '3': 'desejado', '4': 'execucao',
    '5': 'script', '6': 'governanca', '7': 'auditoria'
  };

  function temaInicial() {
    try {
      var salvo = localStorage.getItem(Store.CHAVE_TEMA);
      if (salvo === 'claro' || salvo === 'escuro') return salvo;
    } catch (e) { /* sem persistência de tema */ }
    return 'escuro';
  }

  function aplicarTema(tema) {
    document.documentElement.setAttribute('data-theme', tema);
    try { localStorage.setItem(Store.CHAVE_TEMA, tema); } catch (e) { /* ignora */ }
    UI.render();
  }

  function toggleTema() {
    var atual = document.documentElement.getAttribute('data-theme') === 'claro' ? 'escuro' : 'claro';
    aplicarTema(atual);
  }

  function notaArmazenamento() {
    var n = document.getElementById('storageNote');
    if (!n) return;
    var bytes = 0;
    try {
      var bruto = localStorage.getItem(Store.CHAVE);
      bytes = bruto ? bruto.length : 0;
    } catch (e) { bytes = 0; }
    n.innerHTML = 'Estado em <code>localStorage</code> com escrita a cada 250 ms' +
      (bytes ? ' · ' + U.num(Math.round(bytes / 1024)) + ' KB' : '') +
      '. Nada sai do seu navegador.';
  }

  function bindNav() {
    document.getElementById('nav').addEventListener('click', function (evt) {
      var b = evt.target.closest('.nav-item');
      if (b) UI.go(b.dataset.view);
    });
  }

  function bindChips() {
    document.querySelectorAll('[data-toggle-series]').forEach(function (chip, i) {
      chip.classList.add('is-on');
      chip.addEventListener('click', function () {
        var vis = Charts.alternarSerie('chartDeriva', i);
        chip.classList.toggle('is-on', vis !== false);
      });
    });
  }

  function bindControles() {
    var rederizar = U.debounce(function () { UI.render(); notaArmazenamento(); }, 120);

    document.getElementById('filtraBusca').addEventListener('input', function (e) {
      UI.state.contaBusca = e.target.value;
      rederizar();
    });
    document.getElementById('filtraSetor').addEventListener('change', function (e) {
      UI.state.contaSetor = e.target.value;
      UI.render();
    });
    document.getElementById('filtraGrupo').addEventListener('change', function (e) {
      UI.state.contaGrupo = e.target.value;
      UI.render();
    });
    document.getElementById('filtraStatus').addEventListener('change', function (e) {
      UI.state.contaStatus = e.target.value;
      UI.render();
    });
    document.getElementById('btnLimparFiltros').addEventListener('click', function () {
      UI.state.contaBusca = UI.state.contaSetor = UI.state.contaGrupo = UI.state.contaStatus = '';
      UI.sincronizaCampos();
      UI.render();
    });

    document.getElementById('selGovSeveridade').addEventListener('change', function (e) {
      UI.state.govSeveridade = e.target.value;
      UI.render();
    });
    document.getElementById('chkGovPlano').addEventListener('change', function (e) {
      UI.state.govSoPlano = e.target.checked;
      UI.render();
    });
    document.getElementById('selFilaStatus').addEventListener('change', function (e) {
      UI.state.filaStatus = e.target.value;
      UI.render();
    });

    document.getElementById('selModo').addEventListener('change', function (e) {
      Store.setModo(e.target.value);
      UI.state.planoCache = null;
      UI.toast(e.target.value === 'recursivo'
        ? 'Modo recursivo: contas ativas fora do estado desejado entram no plano para desativação.'
        : 'Modo parcial: só o declarado é consolidado.', 'warn');
      UI.render();
    });

    document.getElementById('inpAtor').addEventListener('change', function (e) {
      var nome = (e.target.value || '').trim().toLowerCase();
      if (!nome) { e.target.value = Store.state.config.ator; return; }
      Store.setConfig('ator', nome);
      UI.toast('Operador conectado como <strong>' + U.escapeHtml(nome) + '</strong> — as execuções assinam por essa identidade.', 'ok');
    });

    var editor = document.getElementById('txtDesejado');
    editor.addEventListener('input', U.debounce(function () {
      Store.setDesejado(editor.value);
      var pl = Store.plano();
      UI.state.planoCache = pl;
      editor.classList.toggle('is-erro', pl.desejado.erros.length > 0);
      UI.render();
    }, 300));
    editor.addEventListener('keydown', function (evt) {
      if (evt.key === 'Tab') {
        evt.preventDefault();
        var i = editor.selectionStart;
        editor.value = editor.value.slice(0, i) + '  ' + editor.value.slice(editor.selectionEnd);
        editor.selectionStart = editor.selectionEnd = i + 2;
      }
      if ((evt.ctrlKey || evt.metaKey) && evt.key === 'Enter') {
        evt.preventDefault();
        document.getElementById('btnValidar').click();
      }
    });

    document.getElementById('btnValidar').addEventListener('click', function () {
      Store.setDesejado(editor.value);
      UI.state.planoCache = null;
      var pl = Store.plano();
      UI.state.planoCache = pl;
      editor.classList.toggle('is-erro', pl.desejado.erros.length > 0);
      UI.render();
      UI.toast(pl.desejado.erros.length
        ? U.plural(pl.desejado.erros.length, 'erro de declaração', 'erros de declaração') + ' — nada é planejado.'
        : U.plural(pl.resumo.total, 'operação', 'operações') + ' no plano · assinatura <code>' + U.escapeHtml(pl.resumo.assinatura) + '</code>',
        pl.desejado.erros.length ? 'bad' : 'ok');
    });

    document.getElementById('btnExemplo').addEventListener('click', function () {
      editor.value = IaC.EXEMPLO;
      Store.setDesejado(IaC.EXEMPLO);
      UI.state.planoCache = null;
      UI.render();
      UI.toast('Exemplo restaurado: onboarding, ajuste de escopo, correção de SoD e dois offboardings.', 'ok');
    });

    document.getElementById('btnFormatar').addEventListener('click', function () {
      editor.value = ordenaBlocos(editor.value);
      Store.setDesejado(editor.value);
      UI.state.planoCache = null;
      UI.render();
      UI.toast('Blocos reordenados por tipo e nome — o diff do plano fica legível em code review.', 'ok');
    });

    document.getElementById('btnGerarRequisicao').addEventListener('click', function () {
      var pl = UI.state.planoCache || Store.plano();
      if (!pl.pronto) { UI.toast('Corrija os erros de declaração antes de abrir a requisição.', 'bad'); return; }
      if (!pl.ops.length) { UI.toast('Sem derivação: não há o que consolidar.', 'warn'); return; }
      var r = Store.requisitarDoPlano(pl);
      if (!r.ok) { UI.toast(r.erro, 'bad'); return; }
      UI.go('execucao');
      UI.toast('Requisição <strong>' + U.escapeHtml(r.requisicao.protocolo) + '</strong> aberta com ' +
        U.plural(pl.ops.length, 'operação', 'operações') + '. Falta aprovação de outra pessoa.', 'ok');
    });

    document.getElementById('btnNovaRequisicao').addEventListener('click', UI.novaReq);

    document.getElementById('btnOqueSao').addEventListener('click', UI.sobreAmbiente);
    document.getElementById('btnTema').addEventListener('click', toggleTema);

    document.getElementById('btnExportContas').addEventListener('click', function () {
      var lista = UI.enrich(Store.state.diretorio);
      var csv = U.toCSV(UI.ordenar(lista, UI.state.ordena.campo, UI.state.ordena.dir), [
        { label: 'sAMAccountName', key: 'sam' },
        { label: 'Nome', key: 'nome' },
        { label: 'UPN', key: 'upn' },
        { label: 'Setor', key: 'setor' },
        { label: 'OU', key: 'ou' },
        { label: 'Ativa', value: function (u) { return u.ativo ? 'true' : 'false'; } },
        { label: 'Grupos', value: function (u) { return u.grupos.join('|'); } },
        { label: 'GruposCriticos', value: function (u) { return u.criticos.join('|'); } },
        { label: 'UltimoLogon', key: 'ultimaAtividade' },
        { label: 'DiasSemLogon', key: 'inatividade' }
      ]);
      U.downloadText('inventario-identidade.csv', csv, 'text/csv');
      UI.toast(U.plural(lista.length, 'linha exportada', 'linhas exportadas') + ' no formato de recertificação (separador ; e BOM).', 'ok');
    });

    document.getElementById('btnExportGov').addEventListener('click', function () {
      var csv = U.toCSV(Store.state.__gov, [
        { label: 'Severidade', key: 'severidade' },
        { label: 'Regra', key: 'regra' },
        { label: 'Conta', key: 'sam' },
        { label: 'Achado', key: 'titulo' },
        { label: 'Detalhe', key: 'detalhe' },
        { label: 'Correcao', key: 'correcao' },
        { label: 'NoPlano', value: function (v) { return v.noPlano ? 'sim' : 'nao'; } }
      ]);
      U.downloadText('conformidade-identidade.csv', csv, 'text/csv');
      UI.toast('Relatório de conformidade exportado para trilha de evidência.', 'ok');
    });

    document.getElementById('btnExportAudit').addEventListener('click', function () {
      U.downloadText('auditoria-identidade.csv', Store.exportarCSV(), 'text/csv');
      UI.toast(U.plural(Store.state.auditoria.length, 'registro assinado exportado', 'registros assinados exportados') +
        ', incluindo hash anterior e hash de cada linha.', 'ok');
    });

    document.getElementById('btnVerificarCadeia').addEventListener('click', function () {
      var c = Store.validarCadeia();
      UI.render();
      UI.toast(c.intacta
        ? 'Cadeia íntegra: ' + U.plural(c.total, 'registro', 'registros') + ' conferem com o hash do anterior.'
        : U.plural(c.falhas.length, 'ponto de ruptura', 'pontos de ruptura') + ' na cadeia — um registro foi alterado depois de assinado.',
        c.intacta ? 'ok' : 'bad');
    });

    document.getElementById('btnTamper').addEventListener('click', function () {
      if (Store.state.auditoria.length < 2) { UI.toast('Trilha muito curta para simular.', 'warn'); return; }
      Store.mudar(function () {
        var i = Math.floor(Store.state.auditoria.length / 2);
        Store.state.auditoria[i].detalhe = Store.state.auditoria[i].detalhe + ' (alterado fora da console)';
      });
      UI.render();
      var c = Store.validarCadeia();
      UI.toast(c.falhas.length
        ? 'Adulteração detectada: a verificação apontou ' + U.plural(c.falhas.length, 'registro', 'registros') + ' fora de sequência.'
        : 'Nada detectado.', 'bad');
    });

    document.querySelectorAll('[data-script]').forEach(function (b) {
      b.addEventListener('click', function () {
        UI.state.script = b.dataset.script;
        UI.render();
      });
    });

    document.getElementById('btnCopiarScript').addEventListener('click', function () {
      var texto = document.getElementById('boxScript').dataset.raw || '';
      var copia = function () {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          return navigator.clipboard.writeText(texto);
        }
        var ta = document.createElement('textarea');
        ta.value = texto;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        var ok = false;
        try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
        ta.remove();
        return ok ? Promise.resolve() : Promise.reject(new Error('copy indisponível'));
      };
      copia().then(function () {
        UI.toast(U.plural(texto.split('\n').length, 'linha', 'linhas') + ' copiadas para a área de transferência.', 'ok');
      }, function () {
        UI.toast('O navegador bloqueou a cópia automática — selecione o texto do painel.', 'warn');
      });
    });

    document.getElementById('btnBaixarScript').addEventListener('click', function () {
      var texto = document.getElementById('boxScript').dataset.raw || '';
      var nome = UI.state.script === 'reversao' ? 'Reverter-Plano.ps1' : 'Consolidar-Identidade.ps1';
      U.downloadText(nome, texto, 'text/plain');
      UI.toast(U.escapeHtml(nome) + ' baixado — rode primeiro com <code>-WhatIf</code> em um laboratório.', 'ok');
    });

    document.getElementById('btnFecharExec').addEventListener('click', function () {
      UI.state.exec = null;
      UI.render();
    });
  }

  /** Reordena grupos antes de usuários e cada bloco por nome, estável para diff. */
  function ordenaBlocos(texto) {
    var linhas = String(texto || '').split(/\r?\n/);
    var cabecalho = [];
    var blocos = [];
    var atual = null;
    linhas.forEach(function (l) {
      if (!l.trim()) return;
      if (/^\s*#/.test(l) && !atual && cabecalho.length < 1 && /^\s*#/.test(l)) { cabecalho.push(l); return; }
      if (/^\s*(usuario|grupo|remover)\b/i.test(l)) {
        atual = { primeiro: l.trim(), linhas: [l] };
        blocos.push(atual);
        return;
      }
      if (atual) atual.linhas.push(l);
    });
    var chave = function (b) {
      var m = /^\s*(usuario|grupo|remover\s+usuario|remover\s+grupo)/i.exec(b.primeiro);
      var tipo = m ? m[1].toLowerCase().replace(/\s+/g, '_') : 'zz';
      return tipo + '|' + b.primeiro.toLowerCase();
    };
    blocos.sort(function (a, b) { return chave(a).localeCompare(chave(b)); });
    var saida = cabecalho.slice();
    blocos.forEach(function (b, i) {
      if (i) saida.push('');
      saida = saida.concat(b.linhas);
    });
    return saida.join('\n');
  }

  function bindTeclado() {
    document.addEventListener('keydown', function (evt) {
      if (evt.ctrlKey || evt.metaKey || evt.altKey) return;
      var tagNome = (evt.target.tagName || '').toLowerCase();
      if (tagNome === 'input' || tagNome === 'textarea' || tagNome === 'select') return;
      if (ATALHOS[evt.key]) { UI.go(ATALHOS[evt.key]); return; }
      if (evt.key === 'r' || evt.key === 'R') UI.resetDemo();
      if (evt.key === '?') UI.sobreAmbiente();
    });
  }

  function init() {
    Store.init();
    Charts.applyDefaults();
    Charts.setHandlers({
      onGroup: function (grupo) {
        UI.irParaContas(grupo);
        UI.toast('Diretório filtrado por <strong>' + U.escapeHtml(grupo) + '</strong>.', 'ok');
      },
      onRequest: function (protocolo) {
        var r = Store.state.requisicoes.filter(function (x) { return x.protocolo.indexOf(protocolo) >= 0; })[0];
        if (r) UI.go('execucao');
      }
    });

    UI.initDelegation();
    document.documentElement.setAttribute('data-theme', temaInicial());
    document.getElementById('txtDesejado').value = Store.state.desejado;
    UI.sincronizaCampos();
    bindNav();
    bindChips();
    bindControles();
    bindTeclado();

    Store.subscribe(function () {
      UI.state.planoCache = null;
      UI.sincronizaCampos();
      UI.render();
      notaArmazenamento();
    });

    UI.render();
    notaArmazenamento();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  global.App = { init: init, aplicarTema: aplicarTema, ordenaBlocos: ordenaBlocos };
})(window);
