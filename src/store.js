/* Estado da console: diretório, estado desejado, fila de requisições e trilha de auditoria. */
(function (global) {
  'use strict';

  var CHAVE = 'contoso.iac.v1';
  var CHAVE_TEMA = 'contoso.iac.tema';
  var ouvintes = [];
  var salvar = null;

  var state = null;

  function novoEstado() {
    return {
      version: 1,
      diretorio: AD.buildSeed(),
      desejado: IaC.EXEMPLO,
      modo: 'parcial',
      requisicoes: [],
      auditoria: [],
      config: { ator: 't.siqueira', aprovador: 'm.gouveia', janelaDormencia: 90 },
      criadoEm: U.agoraISO()
    };
  }

  /** Requisições de demonstração já fechadas, para o painel ter histórico e SLA reais. */
  function requisicoesSeed(estado) {
    var hoje = U.hojeISO();
    var ativos = estado.usuarios.filter(function (u) { return u.ativo; });
    function sam(i) { return ativos.length ? ativos[i % ativos.length].sam : 'demo.' + i; }
    function em(iso, horas) {
      var d = U.fromISO(iso);
      d.setTime(d.getTime() + horas * 3600 * 1000);
      return U.toISO(d) + 'T' + U.pad2(d.getHours()) + ':' + U.pad2(d.getMinutes()) + ':00';
    }
    var base = [
      { tipo: 'onboarding', titulo: 'Admissão de analista de suporte N1', solicitante: 'rh.recrutamento', gestor: 'Gestor TI', prioridade: 'normal', grupos: ['GG_TI_MONITORACAO'], dias: -9, horas: 3 },
      { tipo: 'offboarding', titulo: 'Desligamento de conferente de loja', solicitante: 'rh.folha', gestor: 'Gestor Operações', prioridade: 'urgente', alvo: sam(3), dias: -8, horas: 1.2 },
      { tipo: 'ajuste', titulo: 'Elevar leitura de alertas para o time noturno', solicitante: 'ti.monitoramento', gestor: 'Gestor TI', prioridade: 'normal', grupos: ['GG_TI_MONITORACAO'], alvo: sam(11), dias: -6, horas: 7 },
      { tipo: 'consolidacao', titulo: 'Consolidação semanal do estado desejado', solicitante: 'automacao', gestor: 'Gestor TI', prioridade: 'baixa', grupos: ['GG_RELATORIOS_GESTAO'], alvo: sam(6), dias: -5, horas: 2 },
      { tipo: 'ajuste', titulo: 'Revogar acesso de VPN de prestador encerrado', solicitante: 'ti.admin', gestor: 'Gestor Segurança', prioridade: 'urgente', remover: true, grupos: ['GG_EXTERNOS_VPN'], alvo: sam(9), dias: -4, horas: 1.5 },
      { tipo: 'onboarding', titulo: 'Admissão de estagiário contábil', solicitante: 'rh.recrutamento', gestor: 'Gestor Financeiro', prioridade: 'normal', grupos: ['GG_CONHAS_CONSULTA'], alvo: sam(14), dias: -3, horas: 5 },
      { tipo: 'ajuste', titulo: 'Ajuste de escopo do grupo de BI para Domain Local', solicitante: 'ti.admin', gestor: 'Gestor TI', prioridade: 'baixa', alvo: 'GG_RELATORIOS_GESTAO', dias: -2, horas: 9 }
    ];

    return base.map(function (b, i) {
      var aberta = U.addDias(hoje, b.dias) + 'T' + U.pad2(8 + (i % 9)) + ':' + U.pad2((i * 17) % 60) + ':00';
      var fim = em(aberta, b.horas);
      var ops = (b.grupos || []).map(function (g) {
        var tipo = b.tipo === 'offboarding' ? 'desativarUsuario' : (b.remover ? 'removerGrupo' : 'adicionarGrupo');
        return { tipo: tipo, alvo: b.tipo === 'offboarding' ? b.alvo : g, membro: b.tipo === 'offboarding' ? null : b.alvo,
          risco: IaC.risco(tipo), critico: /^GG_(TI_ADMIN|FINANCEIRO|CONHAS|EXTERNOS)/.test(g) };
      });
      if (b.tipo === 'ajuste' && !b.grupos) {
        ops = [{ tipo: 'ajustarGrupo', alvo: b.alvo, antes: { escopo: 'Global' }, depois: { escopo: 'Domain Local' },
          risco: IaC.risco('ajustarGrupo'), critico: false }];
      }
      return {
        id: U.uid('req'),
        protocolo: 'REQ-2026-' + U.pad2(101 + i),
        tipo: b.tipo,
        titulo: b.titulo,
        solicitante: b.solicitante,
        gestor: b.gestor,
        prioridade: b.prioridade,
        status: i === 5 ? 'aprovada' : (i === 6 ? 'planejada' : 'concluida'),
        aberta: aberta,
        fim: fim,
        assinada: true,
        assinatura: U.hashTexto(b.protocolo + b.titulo),
        aprovador: b.gestor,
        ops: ops,
        diario: ops.map(function (o) { return { tipo: o.tipo, alvo: o.alvo, membro: o.membro, antes: o.antes, depois: o.depois }; }),
        entradas: ops.map(function (o) { return { status: 'aplicado', tipo: o.tipo, alvo: o.alvo }; }),
        noOps: b.tipo === 'consolidacao' ? 1 : 0,
        nota: i === 4 ? 'Prestador teve contrato encerrado; revogação concluída dentro do SLA de 4h.' : ''
      };
    }).concat([{
      id: U.uid('req'),
      protocolo: 'REQ-2026-108',
      tipo: 'offboarding',
      titulo: 'Dormência detectada pela conformidade: ' + sam(7),
      solicitante: 'automacao',
      gestor: 'Gestor Segurança',
      prioridade: 'normal',
      status: 'aberta',
      aberta: U.addDias(U.hojeISO(), -1) + 'T11:02:00',
      fim: null,
      assinada: false,
      assinatura: null,
      aprovador: null,
      ops: [{ tipo: 'desativarUsuario', alvo: sam(7), antes: { ativo: true }, depois: { ativo: false, grupos: [] },
        risco: IaC.risco('desativarUsuario'), critico: false }],
      diario: [],
      entradas: [],
      noOps: 0,
      nota: 'Aberta automaticamente pela regra conta_dormente. Aguarda aprovação do gestor.'
    }]);
  }

  /** Seed de auditoria acorrentada, coerente com as requisições concluídas. */
  function auditoriaSeed(state) {
    var prev = null;
    var linhas = [];
    state.requisicoes.forEach(function (r) {
      if (r.status !== 'concluida') return;
      r.diario.forEach(function (o) {
        linhas.push({ ts: r.fim, tipo: 'Aplicar:' + o.tipo, alvo: o.alvo, ator: state.config.ator,
          detalhe: o.tipo + ' executado pela requisição ' + r.protocolo, plano: r.assinatura, requisicao: r.protocolo });
      });
    });
    linhas.push({ ts: U.addDias(U.hojeISO(), -1) + 'T11:02:00', tipo: 'RequisicaoAberta', alvo: 'REQ-2026-108',
      ator: 'automacao', detalhe: 'Conta dormente convertida em requisição de offboarding.', plano: null, requisicao: 'REQ-2026-108' });
    linhas.push({ ts: U.hojeISO() + 'T07:15:00', tipo: 'BaselineCarga', alvo: state.diretorio.dominio,
      ator: 't.siqueira', detalhe: 'Inventário de identidade carregado: ' + U.plural(state.diretorio.usuarios.length, 'conta', 'contas') + ' e ' + U.plural(state.diretorio.grupos.length, 'grupo', 'grupos') + '.', plano: null, requisicao: null });
    linhas.sort(function (a, b) { return String(a.ts).localeCompare(String(b.ts)); });
    return linhas.map(function (l) {
      var link = Exec.encadear(prev, l);
      prev = link.hash;
      return { id: U.uid('aud'), ts: l.ts, tipo: l.tipo, alvo: l.alvo, ator: l.ator, detalhe: l.detalhe,
        plano: l.plano, requisicao: l.requisicao, prev: link.prev, hash: link.hash };
    });
  }

  function montarSeed() {
    var s = novoEstado();
    s.requisicoes = requisicoesSeed(s.diretorio);
    s.auditoria = auditoriaSeed(s);
    return s;
  }

  function carregar() {
    try {
      var bruto = localStorage.getItem(CHAVE);
      if (!bruto) return montarSeed();
      var salvo = JSON.parse(bruto);
      if (!salvo || !salvo.diretorio || !salvo.diretorio.usuarios) return montarSeed();
      salvo.config = salvo.config || { ator: 't.siqueira', aprovador: 'm.gouveia', janelaDormencia: 90 };
      salvo.modo = salvo.modo || 'parcial';
      return salvo;
    } catch (e) {
      return montarSeed();
    }
  }

  function gravar() {
    try {
      state.criadoEm = state.criadoEm || U.agoraISO();
      localStorage.setItem(CHAVE, JSON.stringify(state));
    } catch (e) { /* modo privado: a console continua em memória */ }
  }

  function notificar() {
    ouvintes.forEach(function (fn) { fn(state); });
  }

  function mudar(mutacao) {
    var r = mutacao(state);
    if (salvar) salvar();
    notificar();
    return r;
  }

  /** Registro assinado: o hash anterior entra no cálculo do próximo, formando a cadeia. */
  function auditar(tipo, alvo, detalhe, extra) {
    var corpo = { ts: U.agoraISO(), tipo: tipo, alvo: alvo, ator: (extra && extra.ator) || state.config.ator,
      detalhe: detalhe || '', plano: (extra && extra.plano) || null, requisicao: (extra && extra.requisicao) || null };
    var ultimo = state.auditoria.length ? state.auditoria[state.auditoria.length - 1] : null;
    var link = Exec.encadear(ultimo ? ultimo.hash : null, corpo);
    var registro = { id: U.uid('aud'), ts: corpo.ts, tipo: corpo.tipo, alvo: corpo.alvo, ator: corpo.ator,
      detalhe: corpo.detalhe, plano: corpo.plano, requisicao: corpo.requisicao, prev: link.prev, hash: link.hash };
    state.auditoria.push(registro);
    return registro;
  }

  function validarCadeia() {
    var prev = null;
    var falhas = [];
    state.auditoria.forEach(function (a, i) {
      var esperado = Exec.encadear(prev, { ts: a.ts, tipo: a.tipo, alvo: a.alvo, ator: a.ator, detalhe: a.detalhe, plano: a.plano, requisicao: a.requisicao });
      if (a.hash !== esperado.hash || a.prev !== esperado.prev) falhas.push({ indice: i, registro: a.id, alvo: a.alvo });
      prev = a.hash;
    });
    return { intacta: !falhas.length, total: state.auditoria.length, falhas: falhas };
  }

  /** Plano atual derivado do texto do estado desejado contra o diretório vigente. */
  function plano(modo) {
    var desejado = IaC.parse(state.desejado);
    var ops = desejado.erros.length ? [] : IaC.plan(state.diretorio, desejado, modo || state.modo);
    return { desejado: desejado, ops: ops, resumo: IaC.resumo(ops),
      alertas: Governanca.avaliarPlano(ops), pronto: !desejado.erros.length };
  }

  function requisicao(id) {
    for (var i = 0; i < state.requisicoes.length; i++) if (state.requisicoes[i].id === id) return state.requisicoes[i];
    return null;
  }

  function criarRequisicao(dados) {
    var protocolo = 'REQ-' + new Date().getFullYear() + '-' + U.pad2(100 + state.requisicoes.length + 1);
    var r = {
      id: U.uid('req'), protocolo: protocolo,
      tipo: dados.tipo || 'ajuste', titulo: dados.titulo || 'Ajuste de identidade',
      solicitante: dados.solicitante || state.config.ator, gestor: dados.gestor || 'Gestor TI',
      prioridade: dados.prioridade || 'normal', status: 'planejada',
      aberta: U.agoraISO(), fim: null, assinada: false, assinatura: null, aprovador: null,
      ops: dados.ops || [], diario: [], entradas: [], noOps: 0, nota: dados.nota || ''
    };
    if (!r.ops.length) return { ok: false, erro: 'Requisição sem operação declarada.' };
    var semAlvo = r.ops.filter(function (o) { return !String(o.alvo || '').trim(); });
    if (semAlvo.length) {
      return { ok: false, erro: 'Operação ' + semAlvo[0].tipo + ' sem alvo: escolha a conta ou o grupo antes de abrir a requisição.' };
    }
    return mudar(function () {
      state.requisicoes.unshift(r);
      auditar('RequisicaoAberta', r.protocolo, r.titulo + ' — ' + U.plural(r.ops.length, 'operação', 'operações') + ' declaradas.',
        { requisicao: r.protocolo, plano: null });
      return { ok: true, requisicao: r };
    });
  }

  function aprovar(id, aprovador) {
    var r = requisicao(id);
    if (!r) return { ok: false, erro: 'Requisição não encontrada.' };
    if (r.status !== 'planejada' && r.status !== 'aberta') return { ok: false, erro: 'Status atual não permite aprovação: ' + r.status + '.' };
    if (!aprovador) return { ok: false, erro: 'Informe o aprovador.' };
    if (String(aprovador).toLowerCase() === String(r.solicitante).toLowerCase()) {
      auditar('AprovacaoRecusada', r.protocolo, 'Segregação de funções: solicitante e aprovador são a mesma pessoa (' + aprovador + ').', { requisicao: r.protocolo });
      return { ok: false, erro: 'Segregação de funções: o aprovador precisa ser distinto do solicitante.', sod: true };
    }
    return mudar(function () {
      r.aprovador = aprovador;
      r.status = 'aprovada';
      r.assinada = true;
      r.assinatura = U.hashTexto(JSON.stringify(r.ops.map(function (o) { return [o.tipo, o.alvo, o.membro]; })) + aprovador);
      auditar('Aprovacao', r.protocolo, 'Aprovada por ' + aprovador + ' · plano ' + r.assinatura + '.', { requisicao: r.protocolo, plano: r.assinatura });
      return { ok: true, requisicao: r };
    });
  }

  function rejeitar(id, motivo, ator) {
    var r = requisicao(id);
    if (!r) return { ok: false, erro: 'Requisição não encontrada.' };
    if (r.status === 'concluida' || r.status === 'revertida') return { ok: false, erro: 'Requisição já encerrada.' };
    return mudar(function () {
      r.status = 'rejeitada';
      r.fim = U.agoraISO();
      r.nota = motivo || 'Rejeitada sem justificativa.';
      auditar('Rejeicao', r.protocolo, r.nota, { requisicao: r.protocolo, ator: ator });
      return { ok: true, requisicao: r };
    });
  }

  function executarRequisicao(id, opts) {
    opts = opts || {};
    var r = requisicao(id);
    if (!r) return { ok: false, erro: 'Requisição não encontrada.' };
    if (r.status === 'concluida') return { ok: false, erro: 'Requisição já aplicada.' };
    if (!opts.dryRun && r.status !== 'aprovada') {
      auditar('ExecucaoBloqueada', r.protocolo, 'Sem aprovação válida — execução travada pelo fluxo.', { requisicao: r.protocolo });
      return { ok: false, erro: 'A requisição precisa de aprovação antes de aplicar (-WhatIf ainda está liberado).' };
    }
    var ops = r.ops.map(function (o) {
      return { id: o.id || U.uid('op'), tipo: o.tipo, alvo: o.alvo, antes: o.antes || null,
        depois: o.depois || (o.membro ? { membro: o.membro } : null), detalhe: o.detalhe || r.titulo,
        risco: o.risco || IaC.risco(o.tipo), critico: !!o.critico, cmdlets: IaC.cmdlets(o.tipo), bloqueado: !!o.bloqueado };
    });
    var res = Exec.executar(state.diretorio, ops, { dryRun: !!opts.dryRun, ator: opts.ator || state.config.ator,
      requisicao: r.protocolo, assinatura: r.assinatura || IaC.resumo(ops).assinatura });
    if (opts.dryRun) return { ok: true, dryRun: true, requisicao: r, resultado: res, resumo: IaC.resumo(ops) };
    return mudar(function () {
      if (res.ok) state.diretorio = res.estado;
      r.entradas = res.entradas;
      r.diario = res.ok ? res.diario : [];
      r.noOps = res.noOps;
      r.fim = U.agoraISO();
      r.status = res.ok ? 'concluida' : 'falhou';
      r.assinatura = r.assinatura || res.assinatura;
      res.auditoria.forEach(function (c) { auditar(c.tipo, c.alvo, c.detalhe, { ator: c.ator, requisicao: r.protocolo, plano: c.plano }); });
      if (!res.ok) auditar('ExecucaoFalhou', r.protocolo, res.entradas.filter(function (e) { return e.status === 'falhou'; }).map(function (e) { return e.mensagem; }).join(' · '), { requisicao: r.protocolo });
      return { ok: res.ok, requisicao: r, resultado: res, erro: res.ok ? null : 'Uma operação falhou; nada foi promovido.' };
    });
  }

  function reverterRequisicao(id) {
    var r = requisicao(id);
    if (!r) return { ok: false, erro: 'Requisição não encontrada.' };
    if (r.status !== 'concluida') return { ok: false, erro: 'Só se reverte requisição concluída.' };
    if (!r.diario.length) return { ok: false, erro: 'Diário vazio: nada a reverter.' };
    return mudar(function () {
      var rev = Exec.reverter(state.diretorio, r.diario);
      state.diretorio = rev.estado;
      r.status = 'revertida';
      r.fim = U.agoraISO();
      rev.trilha.forEach(function (t) {
        auditar('Reversao:' + t.tipo, t.alvo, t.mensagem, { requisicao: r.protocolo, plano: r.assinatura });
      });
      return { ok: true, requisicao: r, trilha: rev.trilha };
    });
  }

  /** Aplica o plano consolidado do estado desejado como requisição do tipo consolidação. */
  function requisitarDoPlano(pl, dados) {
    var ops = pl.ops.map(function (o) {
      return { tipo: o.tipo, alvo: o.alvo, antes: o.antes, depois: o.depois, detalhe: o.detalhe,
        risco: o.risco, critico: o.critico, bloqueado: o.bloqueado, membro: (o.depois && o.depois.membro) || null };
    });
    return criarRequisicao({
      tipo: 'consolidacao',
      titulo: (dados && dados.titulo) || 'Consolidação do estado desejado (' + pl.resumo.total + ' operações · ' + pl.resumo.assinatura + ')',
      solicitante: (dados && dados.solicitante) || state.config.ator,
      gestor: (dados && dados.gestor) || 'Gestor TI',
      prioridade: pl.resumo.porRisco.alto ? 'urgente' : 'normal',
      ops: ops,
      nota: 'Modo ' + state.modo + ' · plano assinado ' + pl.resumo.assinatura
    });
  }

  function setDesejado(texto) { state.desejado = texto; if (salvar) salvar(); }
  function setModo(m) { state.modo = m; auditar('ModoConsole', m, m === 'recursivo' ? 'Modo recursivo ligado: contas fora do estado desejado entram no plano.' : 'Modo parcial: apenas o declarado é corrigido.', null); if (salvar) salvar(); notificar(); }
  function setConfig(campo, valor) { state.config[campo] = valor; if (salvar) salvar(); }

  function resetDemo() {
    return mudar(function () {
      state = montarSeed();
      state.desejado = IaC.EXEMPLO;
      auditar('BaselineRecarregada', state.diretorio.dominio, 'Inventário e fila recriados a partir da semente determinística 20261018.', null);
      return true;
    });
  }

  function exportarCSV() {
    return U.toCSV(state.auditoria, [
      { label: 'DataHora', key: 'ts' },
      { label: 'Tipo', key: 'tipo' },
      { label: 'Alvo', key: 'alvo' },
      { label: 'Ator', key: 'ator' },
      { label: 'Detalhe', key: 'detalhe' },
      { label: 'Plano', key: 'plano' },
      { label: 'Requisicao', key: 'requisicao' },
      { label: 'HashAnterior', key: 'prev' },
      { label: 'Hash', key: 'hash' }
    ]);
  }

  function init() {
    state = carregar();
    salvar = U.debounce(gravar, 250);
    if (!state.auditoria.length) auditar('BaselineCarga', state.diretorio.dominio, 'Inventário carregado.', null);
    return state;
  }

  global.Store = {
    init: init,
    get state() { return state; },
    subscribe: function (fn) { ouvintes.push(fn); },
    mudar: mudar,
    notificar: notificar,
    plano: plano,
    auditar: auditar,
    validarCadeia: validarCadeia,
    requisicao: requisicao,
    criarRequisicao: criarRequisicao,
    aprovar: aprovar,
    rejeitar: rejeitar,
    executarRequisicao: executarRequisicao,
    reverterRequisicao: reverterRequisicao,
    requisitarDoPlano: requisitarDoPlano,
    setDesejado: setDesejado,
    setModo: setModo,
    setConfig: setConfig,
    resetDemo: resetDemo,
    exportarCSV: exportarCSV,
    gravar: gravar,
    CHAVE: CHAVE,
    CHAVE_TEMA: CHAVE_TEMA
  };
})(window);
