/* Motor de execução: aplica operações ao diretório, grava diário reversível e auditoria acorrentada. */
(function (global) {
  'use strict';

  /** Cadeia de hash: cada registro assina o anterior, então apagar o meio quebra a trilha. */
  function encadear(prev, corpo) {
    var hash = U.hashTexto(String(prev || 'genesis') + '|' + JSON.stringify(corpo));
    return { prev: prev || 'genesis', hash: hash };
  }

  function linhaAuditoria(tipo, alvo, ator, detalhe, extra) {
    var corpo = {
      ts: U.agoraISO(),
      tipo: tipo,
      alvo: alvo,
      ator: ator || 'automacao',
      detalhe: detalhe || '',
      plano: (extra && extra.plano) || null,
      requisicao: (extra && extra.requisicao) || null
    };
    return corpo;
  }

  /** Um handler por tipo de operação: valida, muta o diretório e devolve o que mudou. */
  var APLICADORES = {
    criarGrupo: function (estado, o) {
      var r = AD.criarGrupo(estado, {
        nome: o.alvo,
        escopo: o.depois.escopo,
        critico: o.depois.critico,
        descricao: o.depois.descricao
      });
      return r.ok ? { ok: true, detalhe: 'Grupo ' + o.alvo + ' criado (' + o.depois.escopo + ').' }
        : { ok: false, erro: r.erro };
    },
    ajustarGrupo: function (estado, o) {
      var g = AD.indexGrupos(estado)[o.alvo];
      if (!g) return { ok: false, erro: 'Grupo não encontrado.' };
      ['escopo', 'critico', 'descricao'].forEach(function (campo) {
        if (o.depois[campo] !== undefined) g[campo] = o.depois[campo];
      });
      return { ok: true, detalhe: 'Grupo ' + o.alvo + ' ajustado para o estado desejado.' };
    },
    excluirGrupo: function (estado, o) {
      var idx = -1;
      estado.grupos.forEach(function (g, i) { if (g.nome === o.alvo) idx = i; });
      if (idx < 0) return { ok: false, erro: 'Grupo não encontrado.' };
      var removidos = [];
      estado.usuarios.forEach(function (u) {
        var p = u.grupos.indexOf(o.alvo);
        if (p >= 0) { u.grupos.splice(p, 1); removidos.push(u.sam); }
      });
      estado.grupos.splice(idx, 1);
      return { ok: true, detalhe: 'Grupo removido com ' + U.plural(removidos.length, 'vínculo', 'vínculos') + '.',
        reversao: { membros: removidos } };
    },
    criarUsuario: function (estado, o) {
      if (o.depois.ou && !AD.ouValida(estado, o.depois.ou)) {
        return { ok: false, erro: 'OU declarada não existe no diretório: ' + o.depois.ou };
      }
      var r = AD.criarUsuario(estado, {
        sam: o.alvo,
        nome: o.depois.nome,
        ou: o.depois.ou,
        setor: o.depois.setor,
        ativo: o.depois.ativo,
        grupos: o.depois.grupos
      });
      return r.ok ? { ok: true, detalhe: 'Conta ' + o.alvo + ' criada em ' + o.depois.ou + '.' }
        : { ok: false, erro: r.erro };
    },
    ajustarUsuario: function (estado, o) {
      var alvo = AD.usuario(estado, o.alvo);
      if (!alvo) return { ok: false, erro: 'Conta não encontrada.' };
      var antes = { setor: alvo.setor, nome: alvo.nome };
      var r = AD.atualizarUsuario(estado, o.alvo, o.depois);
      return r.ok ? { ok: true, detalhe: 'Conta ' + o.alvo + ': ' +
        Object.keys(o.depois).map(function (c) { return c + ' → ' + o.depois[c]; }).join(', ') + '.', reversao: antes }
        : { ok: false, erro: r.erro };
    },
    ativarUsuario: function (estado, o) {      var r = AD.atualizarUsuario(estado, o.alvo, { ativo: true });
      return r.ok ? { ok: true, detalhe: 'Conta ' + o.alvo + ' reativada.' } : { ok: false, erro: r.erro };
    },
    desativarUsuario: function (estado, o) {
      var u = AD.usuario(estado, o.alvo);
      if (!u) return { ok: false, erro: 'Conta não encontrada.' };
      var grupos = u.grupos.slice();
      var r = AD.desativarUsuario(estado, o.alvo);
      return r.ok ? { ok: true, detalhe: 'Conta ' + o.alvo + ' desativada e ' +
        U.plural(grupos.length, 'vínculo revogado', 'vínculos revogados') + '.', reversao: { grupos: grupos } }
        : { ok: false, erro: r.erro };
    },
    moverOU: function (estado, o) {
      var r = AD.atualizarUsuario(estado, o.alvo, { ou: o.depois.ou });
      return r.ok ? { ok: true, detalhe: 'Conta ' + o.alvo + ' movida para ' + o.depois.ou + '.' }
        : { ok: false, erro: r.erro };
    },
    adicionarGrupo: function (estado, o) {
      var u = AD.usuario(estado, o.depois.membro);
      if (!u) return { ok: false, erro: 'Membro ' + o.depois.membro + ' não existe.' };
      if (!AD.indexGrupos(estado)[o.alvo]) return { ok: false, erro: 'Grupo ' + o.alvo + ' não existe.' };
      if (u.grupos.indexOf(o.alvo) >= 0) return { ok: true, noOp: true, detalhe: 'Membresia já existia — operação idempotente.' };
      u.grupos.push(o.alvo);
      return { ok: true, detalhe: u.sam + ' adicionado a ' + o.alvo + '.' };
    },
    removerGrupo: function (estado, o) {
      var u = AD.usuario(estado, o.depois.membro);
      if (!u) return { ok: false, erro: 'Membro ' + o.depois.membro + ' não existe.' };
      var p = u.grupos.indexOf(o.alvo);
      if (p < 0) return { ok: true, noOp: true, detalhe: 'Vínculo já inexistente — operação idempotente.' };
      u.grupos.splice(p, 1);
      return { ok: true, detalhe: u.sam + ' removido de ' + o.alvo + '.' };
    }
  };

  function aplicadorDisponivel(tipo) { return !!APLICADORES[tipo]; }

  function aplicarOperacao(estado, o) {
    var fn = APLICADORES[o.tipo];
    if (o.bloqueado) return { ok: false, erro: 'Operação travada por governança: ' + o.detalhe };
    if (!fn) return { ok: false, erro: 'Tipo de operação sem executor: ' + o.tipo };
    return fn(estado, o);
  }

  /**
   * Executa o plano contra uma cópia do diretório.
   * dryRun não muta nada; apply devolve novo estado + diário para reversão.
   */
  function executar(estado, ops, opts) {
    opts = opts || {};
    var proximo = opts.dryRun ? estado : U.clone(estado);
    var resultado = { inicio: U.agoraISO(), assinatura: opts.assinatura || null, ator: opts.ator || 'automacao',
      entradas: [], auditoria: [], ok: true, noOps: 0, falhas: 0 };

    ops.forEach(function (o) {
      var linha = { opId: o.id, tipo: o.tipo, alvo: o.alvo, risco: o.risco, critico: !!o.critico,
        antes: o.antes, depois: o.depois, detalhe: o.detalhe };
      if (opts.dryRun) {
        linha.status = o.bloqueado ? 'bloqueado' : 'previsto';
        linha.mensagem = o.detalhe;
        resultado.entradas.push(linha);
        if (o.bloqueado) resultado.falhas++;
        return;
      }
      var r = aplicarOperacao(proximo, o);
      linha.status = r.ok ? (r.noOp ? 'no-op' : 'aplicado') : 'falhou';
      linha.mensagem = r.ok ? r.detalhe : r.erro;
      if (r.ok) {
        if (r.noOp) resultado.noOps++;
        if (r.reversao) linha.reversao = r.reversao;
        resultado.entradas.push(linha);
      } else {
        resultado.falhas++;
        resultado.ok = false;
        resultado.entradas.push(linha);
        return;
      }
      var corpo = linhaAuditoria('Aplicar:' + o.tipo, o.alvo, opts.ator, r.detalhe,
        { plano: opts.assinatura, requisicao: opts.requisicao });
      resultado.auditoria.push(corpo);
    });

    resultado.fim = U.agoraISO();
    resultado.estado = proximo;
    resultado.diario = resultado.entradas.filter(function (e) {
      return e.status === 'aplicado' || e.status === 'no-op';
    }).map(function (e) {
      return { tipo: e.tipo, alvo: e.alvo, antes: e.antes, depois: e.depois, reversao: e.reversao || null,
        membro: (e.depois && e.depois.membro) || null };
    });
    return resultado;
  }

  /** Reversão em ordem inversa, reconstruindo o que o diário encontrou antes de mudar. */
  function reverter(estado, diario) {
    var alvo = U.clone(estado);
    var trilha = [];
    U.clone(diario).reverse().forEach(function (e) {
      var msg;
      var u = AD.usuario(alvo, e.membro || e.alvo);
      switch (e.tipo) {
        case 'desativarUsuario':
          var re = AD.atualizarUsuario(alvo, e.alvo, { ativo: true, grupos: (e.reversao && e.reversao.grupos) || [] });
          msg = re.ok ? 'Conta reativada com ' + U.plural((e.reversao && e.reversao.grupos || []).length, 'vínculo', 'vínculos') : re.erro;
          break;
        case 'criarUsuario':
          alvo.usuarios = alvo.usuarios.filter(function (x) { return x.sam !== e.alvo; });
          msg = 'Conta criada pelo plano foi removida.';
          break;
        case 'criarGrupo':
          alvo.grupos = alvo.grupos.filter(function (g) { return g.nome !== e.alvo; });
          msg = 'Grupo criado pelo plano foi removido.';
          break;
        case 'adicionarGrupo':
          if (u) { var p = u.grupos.indexOf(e.alvo); if (p >= 0) u.grupos.splice(p, 1); msg = 'Concessão desfeita.'; }
          else msg = 'Membro não encontrado.';
          break;
        case 'removerGrupo':
          if (u && e.membro) { if (u.grupos.indexOf(e.alvo) < 0) u.grupos.push(e.alvo); msg = 'Revogação desfeita.'; }
          else msg = 'Membro não encontrado.';
          break;
        case 'ajustarUsuario':
          if (e.antes) {
            var ra = AD.atualizarUsuario(alvo, e.alvo, { setor: e.antes.setor, nome: e.antes.nome });
            msg = ra.ok ? 'Atributos da conta devolvidos ao valor anterior.' : ra.erro;
          } else msg = 'Sem foto anterior da conta.';
          break;
        case 'moverOU':
          var rm = AD.atualizarUsuario(alvo, e.alvo, { ou: (e.antes && e.antes.ou) || alvo.ou[0] });
          msg = rm.ok ? 'Conta devolvida à OU anterior.' : rm.erro;
          break;
        case 'ajustarGrupo':
          var g = AD.indexGrupos(alvo)[e.alvo];
          if (g && e.antes) { ['escopo', 'critico', 'descricao'].forEach(function (c) { if (e.antes[c] !== undefined) g[c] = e.antes[c]; }); msg = 'Atributos do grupo restaurados.'; }
          else msg = 'Sem foto anterior do grupo.';
          break;
        case 'excluirGrupo':
          if (e.antes && e.antes.grupo && !AD.indexGrupos(alvo)[e.alvo]) {
            alvo.grupos.push(U.clone(e.antes.grupo));
            ((e.reversao && e.reversao.membros) || []).forEach(function (sam) {
              var x = AD.usuario(alvo, sam);
              if (x && x.grupos.indexOf(e.alvo) < 0) x.grupos.push(e.alvo);
            });
            msg = 'Grupo recriado com os vínculos do diário.';
          } else msg = 'Grupo já existia ou diário sem foto anterior.';
          break;
        default:
          msg = 'Tipo sem reversão conhecida: ' + e.tipo;
      }
      trilha.push({ tipo: e.tipo, alvo: e.alvo, mensagem: msg });
    });
    return { estado: alvo, trilha: trilha, ts: U.agoraISO() };
  }

  /** KPIs de esteira: tempo de atendimento, taxa de derivação e retrabalho. */
  function kpis(requisicoes, estadoInicial, estadoAtual) {
    var concluidas = requisicoes.filter(function (r) { return r.status === 'concluida'; });
    var tempos = concluidas.map(function (r) { return U.fromISO(r.fim) - U.fromISO(r.aberta); });
    var aprovadas = requisicoes.filter(function (r) { return r.status !== 'rascunho'; });
    var rejeitadas = requisicoes.filter(function (r) { return r.status === 'rejeitada'; });
    return {
      abertas: requisicoes.filter(function (r) { return r.status === 'aberta' || r.status === 'planejada'; }).length,
      concluidas: concluidas.length,
      total: requisicoes.length,
      tempoMedioMs: tempos.length ? Math.round(U.sum(tempos) / tempos.length) : null,
      tempoMaxMs: tempos.length ? Math.max.apply(null, tempos) : null,
      sla12h: concluidas.filter(function (r) { return (U.fromISO(r.fim) - U.fromISO(r.aberta)) <= 12 * 3600 * 1000; }).length,
      slaBase: concluidas.length,
      opsAplicadas: U.sum(requisicoes, function (r) { return (r.diario || []).length; }),
      noOps: U.sum(requisicoes, function (r) { return r.noOps || 0; }),
      taxaNoOp: U.sum(requisicoes, function (r) { return (r.entradas || []).length; })
        ? U.round(U.sum(requisicoes, function (r) { return r.noOps || 0; }) / U.sum(requisicoes, function (r) { return (r.entradas || []).length; }) * 100, 1)
        : 0,
      rejeitadas: rejeitadas.length,
      taxaReprovacao: aprovadas.length ? U.round(rejeitadas.length / aprovadas.length * 100, 1) : 0,
      rollback: requisicoes.filter(function (r) { return r.status === 'revertida'; }).length
    };
  }

  global.Exec = {
    encadear: encadear,
    linhaAuditoria: linhaAuditoria,
    aplicarOperacao: aplicarOperacao,
    aplicadorDisponivel: aplicadorDisponivel,
    executar: executar,
    reverter: reverter,
    kpis: kpis
  };
})(window);
