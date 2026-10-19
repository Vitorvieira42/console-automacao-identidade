/* Camada de tela: render das views, filtros, modais e ações da console. */
(function (global) {
  'use strict';

  var S = {
    view: 'painel',
    contaBusca: '',
    contaSetor: '',
    contaGrupo: '',
    contaStatus: '',
    ordena: { campo: 'sam', dir: 1 },
    filaStatus: '',
    govSeveridade: '',
    govSoPlano: false,
    script: 'plano',
    exec: null,
    planoCache: null
  };

  var TITULOS = {
    painel: ['Painel de operação', 'Consistência entre o declarado e o que existe no diretório, saúde da fila e exposição de conformidade.'],
    diretorio: ['Diretório de identidade', 'Inventário simulado de contas, grupos e unidades organizacionais do domínio contoso.local.'],
    desejado: ['Estado desejado', 'Contrato declarativo. Edite, valide e veja o plano idempotente que o console calcula contra o diretório.'],
    execucao: ['Plano e execução', 'Cada mudança entra pela fila: aprovação com segregação de funções, pré-visualização com -WhatIf e reversão pelo diário.'],
    script: ['Script PowerShell', 'O plano vira um script real de Active Directory, com ShouldProcess, transcript, diário de reversão e auditoria.'],
    governanca: ['Governança e conformidade', 'Regras de recertificação sobre o inventário: SoD, menor privilégio, dormência e resíduos de vínculo.'],
    auditoria: ['Trilha de auditoria', 'Registros append-only acorrentados por hash — a mesma técnica de imutabilidade usada em log assinado.']
  };

  /* ------------------------------ utilidades ------------------------------ */
  function el(sel) { return document.querySelector(sel); }
  function tag(texto, classe) { return '<span class="tag tag-' + classe + '">' + U.escapeHtml(texto) + '</span>'; }
  function mono(texto) { return '<span class="mono">' + U.escapeHtml(texto) + '</span>'; }
  function vazio(colunas, msg) {
    return '<tr class="table-empty"><td colspan="' + colunas + '">' + U.escapeHtml(msg) + '</td></tr>';
  }
  function riscoTag(r) { return tag(r === 'medio' ? 'médio' : r, r); }
  function statusTag(s) {
    var rotulos = { aberta: 'aberta', planejada: 'planejada', aprovada: 'aprovada', concluida: 'concluída',
      revertida: 'revertida', rejeitada: 'rejeitada', falhou: 'falhou', 'no-op': 'no-op', aplicado: 'aplicado',
      previsto: 'previsto', bloqueado: 'bloqueado' };
    return tag(rotulos[s] || s, s);
  }
  function preench(sel, itens, valorAtual) {
    var node = document.querySelector(sel);
    if (!node) return;
    node.innerHTML = itens.map(function (i) {
      var valor = typeof i === 'string' ? i : i.valor;
      var label = typeof i === 'string' ? i : i.label;
      return '<option value="' + U.escapeHtml(valor) + '"' + (valor === valorAtual ? ' selected' : '') + '>' +
        U.escapeHtml(label) + '</option>';
    }).join('');
  }

  function toast(msg, tipo) {
    var host = el('#toasts');
    if (!host) return;
    var n = document.createElement('div');
    n.className = 'toast' + (tipo ? ' is-' + tipo : '');
    n.innerHTML = msg;
    host.appendChild(n);
    setTimeout(function () { n.remove(); }, 4200);
  }

  /* -------------------------------- modal -------------------------------- */
  var modalState = { onConfirm: null };

  function abrirModal(titulo, corpoHtml, footHtml, onConfirm) {
    el('#modalTitulo').textContent = titulo;
    el('#modalBody').innerHTML = corpoHtml;
    el('#modalFoot').innerHTML = footHtml || '';
    modalState.onConfirm = onConfirm || null;
    el('#modal').hidden = false;
    var primeiro = el('#modal').querySelector('input, select, textarea, button');
    if (primeiro) primeiro.focus();
  }

  function fecharModal() {
    el('#modal').hidden = true;
    modalState.onConfirm = null;
  }

  function confirmar(titulo, corpoHtml, okLabel, onOk, perigoso) {
    abrirModal(titulo, corpoHtml,
      '<button class="btn btn-ghost" type="button" data-close>Cancelar</button>' +
      '<button class="btn ' + (perigoso ? 'btn-danger' : 'btn-primary') + '" type="button" id="modalOk">' + U.escapeHtml(okLabel) + '</button>',
      onOk);
  }

  /* ------------------------------- highlights ------------------------------ */
  var PS_KEYWORDS = /^(if|else|foreach|for|in|switch|function|param|try|catch|finally|return|throw|begin|process|end|\$true|\$false|\$null)\b/;

  function psLinha(linha) {
    var t = U.escapeHtml(linha);
    if (/^\s*#/.test(linha) || /^\s*#&gt;/.test(t) || /^&lt;#/.test(t)) return '<span class="c">' + t + '</span>';
    var out = '';
    var i = 0;
    var re = /('(?:[^']|'')*')|("(?:[^"]|\\")*")|(\$\{?\w+\}?)|(\bNew-ADUser\b|\bGet-ADUser\b|\bSet-ADUser\b|\bAdd-ADGroupMember\b|\bRemove-ADGroupMember\b|\bNew-ADGroup\b|\bSet-ADGroup\b|\bRemove-ADGroup\b|\bGet-ADGroup\b|\bGet-ADGroupMember\b|\bMove-ADObject\b|\bGet-ADObject\b|\bDisable-ADAccount\b|\bEnable-ADAccount\b|\bGet-ADPrincipalGroupMembership\b|\bGet-ADRootDSE\b|\bGet-ADDomain\b|\bStart-Transcript\b|\bStop-Transcript\b|\bExport-Csv\b|\bConvertTo-Json\b|\bConvertFrom-Json\b)|(<\#|#>)|((?:-\w+(?::\w+)?))/g;
    var m;
    while ((m = re.exec(linha)) !== null) {
      out += U.escapeHtml(linha.slice(i, m.index));
      var pedaco = m[0];
      var cls = m[1] || m[2] ? 's' : m[3] ? 'n' : m[4] ? 'k' : m[5] ? 'c' : 'k';
      if (m[6]) cls = 'k';
      out += '<span class="' + cls + '">' + U.escapeHtml(pedaco) + '</span>';
      i = m.index + pedaco.length;
    }
    out += U.escapeHtml(linha.slice(i));
    return out;
  }

  function destacarPS(texto) {
    return String(texto).split(/\r?\n/).map(psLinha).join('\n');
  }

  /* --------------------------------- KPIs -------------------------------- */
  function cartao(rotulo, valor, foot, estado) {
    return '<div class="kpi' + (estado ? ' is-' + estado : '') + '">' +
      '<span class="kpi-label">' + U.escapeHtml(rotulo) + '</span>' +
      '<span class="kpi-value">' + valor + '</span>' +
      '<span class="kpi-foot">' + foot + '</span></div>';
  }

  function renderKpis(resumo, pl, gov, kpi) {
    var slaPct = kpi.slaBase ? U.round(kpi.sla12h / kpi.slaBase * 100, 0) : 100;
    el('#kpiPainel').innerHTML = [
      cartao('Contas ativas', U.num(resumo.ativos),
        U.plural(resumo.inativos, 'desativada', 'desativadas') + ' · ' + U.num(resumo.externos) + ' externas'),
      cartao('Derivação do plano', U.num(pl.resumo.total),
        pl.resumo.total ? U.plural(pl.resumo.porRisco.alto, 'operação de risco alto', 'operações de risco alto') : 'diretório em conformidade com o declarado',
        pl.resumo.total ? (pl.resumo.porRisco.alto ? 'bad' : 'warn') : 'ok'),
      cartao('Conformidade', U.pct(gov.conformidade, 1),
        U.plural(gov.violacoes, 'achado', 'achados') + ' em ' + U.num(gov.contasAfetadas) + ' contas',
        gov.conformidade >= 85 ? 'ok' : gov.conformidade >= 60 ? 'warn' : 'bad'),
      cartao('SLA 12h', U.num(slaPct) + '%',
        U.plural(kpi.sla12h, 'requisição no prazo', 'requisições no prazo') + ' de ' + U.num(kpi.slaBase),
        slaPct >= 90 ? 'ok' : 'warn'),
      cartao('Tempo médio', kpi.tempoMedioMs ? U.num(kpi.tempoMedioMs / 3600000, 1) + ' h' : '—',
        kpi.tempoMaxMs ? 'pico de ' + U.num(kpi.tempoMaxMs / 3600000, 1) + ' h' : 'sem histórico fechado'),
      cartao('Trilha assinada', U.num(resumo.auditoriaTotal),
        resumo.cadeiaIntacta ? 'cadeia íntegra · último ' + resumo.ultimoHash.slice(0, 8) : 'CADEIA QUEBRADA',
        resumo.cadeiaIntacta ? 'ok' : 'bad')
    ].join('');

    el('#kpiDiretorio').innerHTML = [
      cartao('Contas no inventário', U.num(resumo.total), U.plural(resumo.vinculos, 'vínculo ativo', 'vínculos ativos')),
      cartao('Grupos de segurança', U.num(resumo.grupos), U.plural(resumo.criticos, 'grupo crítico', 'grupos críticos'), resumo.criticos ? 'warn' : ''),
      cartao('Contas ativas', U.num(resumo.ativos), U.num(resumo.inativos) + ' desativadas'),
      cartao('Externos na OU=Prestadores', U.num(resumo.externos), 'acesso via GG_EXTERNOS_VPN')
    ].join('');

    el('#kpiExecucao').innerHTML = [
      cartao('Abertas ou planejadas', U.num(kpi.abertas), 'aguardando decisão'),
      cartao('Concluídas', U.num(kpi.concluidas), U.plural(kpi.opsAplicadas, 'operação aplicada', 'operações aplicadas'), 'ok'),
      cartao('Reversões executadas', U.num(kpi.rollback), U.pct(kpi.taxaNoOp, 1) + ' das operações resolvidas como no-op', kpi.rollback ? 'warn' : ''),
      cartao('Rejeitadas', U.num(kpi.rejeitadas), U.pct(kpi.taxaReprovacao, 1) + ' de reprovação da fila', kpi.taxaReprovacao > 20 ? 'bad' : '')
    ].join('');
  }

  /* ------------------------------- diretório ------------------------------ */
  function janelaDormencia() { return Store.state.config.janelaDormencia || 90; }

  function enrich(estado) {
    var criticos = estado.grupos.filter(function (g) { return g.critico; }).map(function (g) { return g.nome; });
    var hoje = U.hojeISO();
    return estado.usuarios.map(function (u) {
      return Object.assign({}, u, {
        criticos: u.grupos.filter(function (g) { return criticos.indexOf(g) >= 0; }),
        inatividade: U.diffDias(u.ultimaAtividade, hoje),
        dormente: u.ativo && U.diffDias(u.ultimaAtividade, hoje) > janelaDormencia()
      });
    });
  }

  function ordenar(lista, campo, dir) {
    return lista.slice().sort(function (a, b) {
      var x = a[campo], y = b[campo];
      if (campo === 'criticos') { x = a.criticos.length; y = b.criticos.length; }
      if (typeof x === 'boolean') { x = x ? 1 : 0; y = y ? 1 : 0; }
      if (typeof x === 'string') return dir * x.localeCompare(String(y), 'pt-BR');
      return dir * ((x || 0) - (y || 0));
    });
  }

  function filtrarContas(lista) {
    var busca = S.contaBusca.toLowerCase();
    return lista.filter(function (u) {
      if (busca && (u.nome + ' ' + u.sam + ' ' + u.upn).toLowerCase().indexOf(busca) < 0) return false;
      if (S.contaSetor && u.setor !== S.contaSetor) return false;
      if (S.contaGrupo && u.grupos.indexOf(S.contaGrupo) < 0) return false;
      if (S.contaStatus === 'ativo' && !u.ativo) return false;
      if (S.contaStatus === 'inativo' && u.ativo) return false;
      if (S.contaStatus === 'dormente' && !u.dormente) return false;
      if (S.contaStatus === 'critico' && !u.criticos.length) return false;
      return true;
    });
  }

  function renderContas(lista) {
    lista = ordenar(filtrarContas(lista), S.ordena.campo, S.ordena.dir);
    var corpos = lista.map(function (u) {
      var ou = u.ou.split(',')[0].replace('OU=', '');
      return '<tr data-sam="' + U.escapeHtml(u.sam) + '">' +
        '<td>' + mono(u.sam) + '</td>' +
        '<td>' + U.escapeHtml(u.nome) + '</td>' +
        '<td>' + U.escapeHtml(u.setor || '—') + '</td>' +
        '<td>' + mono(ou) + '</td>' +
        '<td>' + (u.ativo ? (u.dormente ? tag('dormente', 'medio') : tag('ativa', 'ok')) : tag('desativada', 'informativo')) + '</td>' +
        '<td>' + (u.criticos.length ? u.criticos.map(function (g) { return tag(g.replace(/^GG_/, ''), 'alto'); }).join(' ') : '<span class="hash-cel">—</span>') + '</td>' +
        '<td>' + U.dataLegivel(u.ultimaAtividade) + ' <span class="hash-cel">(' + U.num(u.inatividade) + 'd)</span></td>' +
        '<td class="row-actions"><button class="btn btn-ghost btn-sm" type="button" data-act="conta" data-id="' + U.escapeHtml(u.sam) + '">Detalhes</button></td>' +
        '</tr>';
    });
    var t = el('#tblContas tbody');
    t.innerHTML = corpos.length ? corpos.join('') : vazio(8, 'Nenhuma conta com esses filtros.');
    el('#contasSummary').textContent = U.plural(corpos.length, 'conta exibida', 'contas exibidas') +
      ' de ' + U.num(lista.length) + ' · janela de dormência ' + U.num(janelaDormencia()) + ' dias';
    document.querySelectorAll('#tblContas thead th[data-sort]').forEach(function (th) {
      var ativo = th.dataset.sort === S.ordena.campo;
      th.classList.toggle('is-sorted', ativo);
      th.dataset.dir = ativo ? (S.ordena.dir > 0 ? '↑' : '↓') : '';
    });
  }

  function renderGruposTabela(estado) {
    el('#tblGrupos tbody').innerHTML = estado.grupos.map(function (g) {
      var membros = AD.membrosDoGrupo(estado, g.nome);
      return '<tr>' +
        '<td>' + mono(g.nome) + '</td>' +
        '<td>' + U.escapeHtml(g.escopo) + '</td>' +
        '<td class="num">' + U.num(membros.length) + '</td>' +
        '<td>' + (g.critico ? tag('crítico', 'alto') : '<span class="hash-cel">—</span>') + '</td>' +
        '<td>' + U.escapeHtml(g.descricao) + '</td>' +
        '</tr>';
    }).join('');

    el('#tblOus tbody').innerHTML = estado.ou.map(function (dn) {
      var contas = estado.usuarios.filter(function (u) { return u.ou === dn; });
      var ativos = contas.filter(function (u) { return u.ativo; });
      var padrao = Object.keys(Governanca.OU_POR_SETOR).filter(function (s) {
        return Governanca.OU_POR_SETOR[s] === dn;
      }).join(', ') || '—';
      return '<tr>' +
        '<td>' + mono(dn) + '</td>' +
        '<td class="num">' + U.num(contas.length) + '</td>' +
        '<td class="num">' + U.num(ativos.length) + '</td>' +
        '<td>' + U.escapeHtml(padrao) + '</td>' +
        '</tr>';
    }).join('');
    el('#diretorioSub').textContent = 'sAMAccountName, filiação e último logon lidos do inventário carregado — a mesma base que um export do ADUC entrega.';
  }

  /* ----------------------------- estado desejado --------------------------- */
  function diffCel(o) {
    var partes = [];
    if (o.antes && o.depois) {
      Object.keys(o.depois).forEach(function (k) {
        if (k === 'membro') return;
        var antes = o.antes[k];
        if (antes === undefined || String(antes) === String(o.depois[k])) return;
        partes.push('<span class="antes">' + U.escapeHtml(k + '=' + fmtVal(antes)) + '</span>' +
          '<span class="depois">' + U.escapeHtml(k + '=' + fmtVal(o.depois[k])) + '</span>');
      });
    }
    if (o.depois && o.depois.membro) partes.push('<span class="depois">' + U.escapeHtml('membro +' + o.depois.membro) + '</span>');
    if (o.tipo === 'desativarUsuario' && o.antes && o.antes.grupos) {
      partes.push('<span class="antes">' + U.escapeHtml('grupos: ' + o.antes.grupos.join(',')) + '</span><span class="depois">grupos: (revogado)</span>');
    }
    if (o.tipo === 'criarUsuario' && o.depois) partes.push('<span class="depois">' + U.escapeHtml('nova conta em ' + o.depois.ou.split(',')[0]) + '</span>');
    if (!partes.length) partes.push('<span class="hash-cel">' + U.escapeHtml(o.detalhe) + '</span>');
    return '<div class="diffs">' + partes.join('') + '</div>';
  }

  function fmtVal(v) {
    if (Array.isArray(v)) return v.join('|');
    if (v === true) return 'true';
    if (v === false) return 'false';
    if (v && typeof v === 'object') return JSON.stringify(v);
    return String(v);
  }

  function renderPlano(pl) {
    el('#planoSub').textContent = 'Plano idempotente calculado em memória contra o diretório. Nenhuma escrita acontece antes da aprovação.';
    var t = el('#tblPlano tbody');
    if (!pl.pronto) {
      t.innerHTML = vazio(5, 'Corrija os erros de declaração para o console calcular o plano.');
      el('#planoFoot').innerHTML = tag('declaração inválida', 'alto') + ' ' + U.plural(pl.desejado.erros.length, 'erro', 'erros') + ' de sintaxe.';
      return;
    }
    if (!pl.ops.length) {
      t.innerHTML = vazio(5, 'Sem derivação: o diretório já satisfaz o estado desejado.');
      el('#planoFoot').innerHTML = tag('zero drift', 'ok') + ' Rodar agora produz apenas operações no-op — é assim que se comprova idempotência.';
      return;
    }
    t.innerHTML = pl.ops.map(function (o) {
      return '<tr data-op="' + U.escapeHtml(o.id) + '"' + (o.bloqueado ? ' class="is-bloqueado"' : '') + '>' +
        '<td>' + riscoTag(o.risco) + (o.critico ? ' ' + tag('crítico', 'bloqueada') : '') + '</td>' +
        '<td>' + mono(o.tipo) + '</td>' +
        '<td>' + mono(o.alvo) + (o.bloqueado ? '<br><span class="hash-cel">travada pela governança</span>' : '') + '</td>' +
        '<td>' + diffCel(o) + '</td>' +
        '<td class="hash-cel">' + U.escapeHtml(o.cmdlets.join(', ') || '—') + '</td>' +
        '</tr>';
    }).join('');
    el('#planoFoot').innerHTML =
      'plano <code>' + U.escapeHtml(pl.resumo.assinatura) + '</code> · ' +
      U.plural(pl.resumo.total, 'operação', 'operações') + ' · risco ' +
      U.num(pl.resumo.porRisco.baixo) + ' baixo / ' + U.num(pl.resumo.porRisco.medio) + ' médio / ' + U.num(pl.resumo.porRisco.alto) + ' alto · ' +
      U.plural(pl.resumo.emGruposCriticos, 'alvo crítico', 'alvos críticos') +
      (Object.keys(pl.resumo.porTipo).length > 1 ? ' · ' + U.plural(Object.keys(pl.resumo.porTipo).length, 'tipo distinto', 'tipos distintos') : '');
  }

  function renderErros(pl) {
    var erros = pl.desejado.erros;
    el('#errosWrap').hidden = !erros.length;
    el('#tblErros tbody').innerHTML = erros.map(function (e) {
      return '<tr><td class="num">' + U.num(e.linha) + '</td><td>' + U.escapeHtml(e.msg) + '</td></tr>';
    }).join('');
    el('#parseStatus').innerHTML = erros.length
      ? tag(erros.length + ' erro' + (erros.length > 1 ? 's' : ''), 'alto') + ' a declaração não é aplicada até validar.'
      : tag('declaração válida', 'ok') + ' ' + U.plural(pl.desejado.usuarios.length, 'conta declarada', 'contas declaradas') + ' · ' +
        U.plural(pl.desejado.grupos.length, 'grupo', 'grupos') + ' · ' +
        U.plural(pl.desejado.removerUsuarios.length + pl.desejado.removerGrupos.length, 'remoção', 'remoções');
  }

  /* --------------------------------- fila -------------------------------- */
  function horasDe(r) {
    if (!r.fim) return null;
    return U.round((U.fromISO(r.fim) - U.fromISO(r.aberta)) / 3600000, 1);
  }

  function renderFila() {
    var lista = Store.state.requisicoes.filter(function (r) { return !S.filaStatus || r.status === S.filaStatus; });
    var t = el('#tblFila tbody');
    if (!lista.length) {
      t.innerHTML = vazio(9, 'Nenhuma requisição nesta situação.');
    } else {
      t.innerHTML = lista.map(function (r) {
        var h = horasDe(r);
        return '<tr data-req="' + U.escapeHtml(r.id) + '">' +
          '<td>' + mono(r.protocolo) + '</td>' +
          '<td>' + U.escapeHtml(r.tipo) + '</td>' +
          '<td>' + U.escapeHtml(r.titulo) + (r.nota ? '<br><span class="hash-cel">' + U.escapeHtml(r.nota) + '</span>' : '') + '</td>' +
          '<td>' + mono(r.solicitante) + '</td>' +
          '<td>' + (r.aprovador ? mono(r.aprovador) : '<span class="hash-cel">—</span>') + '</td>' +
          '<td>' + statusTag(r.status) + '</td>' +
          '<td class="num">' + U.num(r.ops.length) + '</td>' +
          '<td class="num">' + (h == null ? '<span class="hash-cel">em aberto</span>' : U.num(h, 1) + ' h') + '</td>' +
          '<td class="row-actions">' +
            '<button class="btn btn-ghost btn-sm" type="button" data-act="req-whatif" data-id="' + r.id + '">-WhatIf</button>' +
            (r.status === 'planejada' || r.status === 'aberta'
              ? '<button class="btn btn-ghost btn-sm" type="button" data-act="req-aprovar" data-id="' + r.id + '">Aprovar</button>' : '') +
            (r.status === 'aprovada'
              ? '<button class="btn btn-primary btn-sm" type="button" data-act="req-aplicar" data-id="' + r.id + '">Aplicar</button>' : '') +
            (r.status === 'concluida'
              ? '<button class="btn btn-ghost btn-sm" type="button" data-act="req-reverter" data-id="' + r.id + '">Reverter</button>' : '') +
            (r.status === 'aberta' || r.status === 'planejada' || r.status === 'aprovada'
              ? '<button class="btn btn-danger btn-sm" type="button" data-act="req-rejeitar" data-id="' + r.id + '">Rejeitar</button>' : '') +
            '<button class="btn btn-ghost btn-sm" type="button" data-act="req" data-id="' + r.id + '">Detalhes</button>' +
          '</td></tr>';
      }).join('');
    }
    var pendentes = Store.state.requisicoes.filter(function (r) { return r.status === 'aberta' || r.status === 'planejada'; }).length;
    el('#filaResumo').innerHTML = U.plural(lista.length, 'requisição na visão', 'requisições na visão') +
      ' · ' + U.plural(pendentes, 'pendente de decisão', 'pendentes de decisão') +
      ' · aplicado só com aprovação, e o aprovador nunca pode ser o solicitante.';
  }

  function renderExecucao() {
    var card = el('#cardExecucao');
    if (!S.exec) { card.hidden = true; return; }
    card.hidden = false;
    var e = S.exec;
    el('#execTitulo').textContent = (e.dryRun ? 'Pré-visualização (-WhatIf) · ' : 'Execução · ') + e.protocolo;
    el('#execSub').textContent = e.dryRun
      ? 'Nenhuma escrita foi feita: o que você vê aqui é exatamente o que o PowerShell faria no controlador de domínio.'
      : 'Operações aplicadas ao inventário. O diário abaixo é o insumo da reversão.';
    el('#tblExecucao tbody').innerHTML = e.entradas.length
      ? e.entradas.map(function (linha) {
        return '<tr><td>' + statusTag(linha.status) + '</td><td>' + mono(linha.tipo) + '</td><td>' + mono(linha.alvo) +
          '</td><td>' + U.escapeHtml(linha.mensagem || '') + '</td></tr>';
      }).join('')
      : vazio(4, 'Plano sem operações.');
  }

  /* ------------------------------- governança ----------------------------- */
  var DESCRITOR = {
    conta_dormente: 'Conta ativa sem autenticação dentro da janela definida',
    vinculo_residual: 'Conta desativada que ainda pertence a grupos de segurança',
    separacao_funcoes: 'Mesma pessoa acumula papéis que deveriam se contrapor',
    menor_privilegio: 'Privilégio crítico fora do setor autorizado',
    ou_fora_padrao: 'Conta fora da OU declarada como padrão do setor',
    grupo_critico_vazio: 'Grupo crítico sem membros — delegação ociosa',
    externo_em_grupo_interno: 'Prestador de OU externa em grupo de equipe interna',
    externo_sem_acesso: 'Prestador ativo sem nenhum vínculo, conta ainda habilitada'
  };

  function renderGovernanca(violacoes, resumoGov) {
    var filtradas = violacoes.filter(function (v) {
      if (S.govSeveridade && v.severidade !== S.govSeveridade) return false;
      if (S.govSoPlano && !v.noPlano) return false;
      return true;
    });
    el('#tblGovernanca tbody').innerHTML = filtradas.length
      ? filtradas.map(function (v) {
        return '<tr><td>' + tag(v.severidade, v.severidade === 'media' ? 'medio' : v.severidade) + '</td>' +
          '<td>' + (v.sam ? mono(v.sam) : '<span class="hash-cel">diretório</span>') + '</td>' +
          '<td>' + mono(v.regra) + '</td>' +
          '<td>' + U.escapeHtml(v.titulo) + '</td>' +
          '<td>' + U.escapeHtml(v.detalhe) + '</td>' +
          '<td class="hash-cel">' + U.escapeHtml(v.correcao) + '</td>' +
          '<td>' + (v.noPlano ? tag('o plano resolve', 'ok') : v.sam ? '<button class="btn btn-ghost btn-sm" type="button" data-act="conta" data-id="' + U.escapeHtml(v.sam) + '">Conta</button>' : '') + '</td>' +
          '</tr>';
      }).join('')
      : vazio(7, 'Nenhum achado com esses filtros.');

    el('#govSub').textContent = U.plural(resumoGov.violacoes, 'achado', 'achados') + ' sobre ' +
      U.plural(resumoGov.contasAfetadas, 'conta afetada', 'contas afetadas') + ' de ' + U.num(resumoGov.avaliados) +
      ' · score ' + U.pct(resumoGov.conformidade, 1) + ' · é a checagem que uma recertificação periódica faria sobre o export do AD.';

    el('#tblRegras tbody').innerHTML = Object.keys(DESCRITOR).map(function (chave) {
      var qtd = violacoes.filter(function (v) { return v.regra === chave; }).length;
      var sev = (violacoes.filter(function (v) { return v.regra === chave; })[0] || {}).severidade || 'baixa';
      return '<tr><td>' + mono(chave) + '</td><td class="num">' + U.num(qtd) + '</td><td>' + tag(sev, sev === 'media' ? 'medio' : sev) +
        '</td><td class="hash-cel">' + U.escapeHtml(DESCRITOR[chave]) + '</td></tr>';
    }).join('');

    el('#gaugeCenter').innerHTML = '<strong>' + U.pct(resumoGov.conformidade, 0) + '</strong><small>conformidade</small>';
  }

  /* -------------------------------- auditoria ------------------------------ */
  function renderAuditoria(cadeia) {
    var lista = Store.state.auditoria.slice().reverse().slice(0, 120);
    el('#tblAuditoria tbody').innerHTML = lista.length
      ? lista.map(function (a) {
        var quebrado = cadeia.falhas.some(function (f) { return f.registro === a.id; });
        return '<tr' + (quebrado ? ' class="is-bloqueado"' : '') + '>' +
          '<td class="mono">' + U.escapeHtml(U.dataHora(a.ts)) + '</td>' +
          '<td>' + mono(a.tipo) + '</td>' +
          '<td>' + mono(a.alvo) + '</td>' +
          '<td>' + U.escapeHtml(a.ator) + '</td>' +
          '<td>' + (a.requisicao ? mono(a.requisicao) : '<span class="hash-cel">—</span>') + '</td>' +
          '<td>' + U.escapeHtml(a.detalhe) + '</td>' +
          '<td class="hash-cel">' + U.escapeHtml(String(a.prev).slice(0, 10)) + '</td>' +
          '<td class="hash-cel">' + U.escapeHtml(a.hash.slice(0, 10)) + (quebrado ? ' ' + tag('rota', 'alto') : '') + '</td>' +
          '</tr>';
      }).join('')
      : vazio(8, 'Nenhum registro na trilha.');
    el('#auditFoot').innerHTML = U.plural(Store.state.auditoria.length, 'registro assinado', 'registros assinados') +
      ' · exibindo os ' + U.num(Math.min(lista.length, 120)) + ' mais recentes · o hash cobre data/hora, tipo, alvo, ator, detalhe, plano e requisição.';
    var st = el('#cadeiaStatus');
    st.textContent = cadeia.intacta ? 'cadeia íntegra' : 'CADEIA QUEBRADA em ' + cadeia.falhas.length + ' ponto(s)';
    st.className = 'stamp ' + (cadeia.intacta ? 'is-ok' : 'is-bad');
  }

  /* --------------------------------- script -------------------------------- */
  function renderScript(pl) {
    var texto = S.script === 'reversao' ? IaC.gerarReversao(pl.ops) : IaC.gerarPowerShell(pl.ops, { ator: Store.state.config.ator });
    el('#boxScript').innerHTML = destacarPS(texto);
    el('#boxScript').dataset.raw = texto;
    document.querySelectorAll('[data-script]').forEach(function (b) {
      b.classList.toggle('is-on', b.dataset.script === S.script);
    });
    el('#scriptFoot').innerHTML = S.script === 'reversao'
      ? 'Reaplica o diário na ordem inversa: ' + U.plural(pl.ops.length, 'entrada', 'entradas') + ' · use quando o -WhatIf aprovou mas a execução falhou no meio.'
      : U.plural(pl.resumo.total, 'bloco', 'blocos') + ' gerados · todos com guarda de leitura, então rodar duas vezes não duplica vínculo. Tamanho ' +
        U.num(texto.split('\n').length) + ' linhas.';
  }

  /* --------------------------------- badges -------------------------------- */
  function renderBadges(resumo, pl, gov, kpi) {
    el('#badgePainel').textContent = pl.resumo.porRisco.alto || '';
    el('#badgeDiretorio').textContent = U.num(resumo.ativos);
    el('#badgeDesejado').textContent = pl.resumo.total || '';
    el('#badgeExecucao').textContent = kpi.abertas || '';
    el('#badgeGovernanca').textContent = (gov.porSeveridade.critica + gov.porSeveridade.alta) || '';
    el('#stampAssinatura').textContent = 'plano ' + pl.resumo.assinatura;
  }

  /* --------------------------------- modais -------------------------------- */
  function detalheConta(sam) {
    var estado = Store.state.diretorio;
    var u = AD.usuario(estado, sam);
    if (!u) { toast('Conta não encontrada no inventário.', 'bad'); return; }
    var lista = enrich(estado).filter(function (x) { return x.sam === sam; })[0];
    var viol = Store.state.__gov.filter(function (v) { return v.sam === sam; });
    var pl = S.planoCache || Store.plano();
    var opsPendentes = pl.ops.filter(function (o) { return o.alvo === sam || (o.depois && o.depois.membro === sam); });

    var grupos = u.grupos.length
      ? u.grupos.map(function (g) {
        var meta = AD.indexGrupos(estado)[g] || {};
        return '<li>' + mono(g) + (meta.critico ? ' ' + tag('crítico', 'alto') : '') +
          ' <span class="hash-cel">' + U.escapeHtml(meta.descricao || '') + '</span></li>';
      }).join('')
      : '<li><span class="hash-cel">sem vínculos</span></li>';

    abrirModal(u.nome + ' · ' + u.sam,
      '<div class="form-grid">' +
      '<div><span class="field-label">UPN</span><br>' + mono(u.upn) + '</div>' +
      '<div><span class="field-label">Setor</span><br>' + U.escapeHtml(u.setor || '—') + '</div>' +
      '<div><span class="field-label">OU</span><br><span class="mono" style="font-size:11px">' + U.escapeHtml(u.ou) + '</span></div>' +
      '<div><span class="field-label">Situação</span><br>' + (u.ativo ? tag('ativa', 'ok') : tag('desativada', 'informativo')) +
        (lista.dormente ? ' ' + tag('dormente ' + U.num(lista.inatividade) + 'd', 'medio') : '') + '</div>' +
      '<div><span class="field-label">Criada em</span><br>' + U.dataLegivel(u.criado) + '</div>' +
      '<div><span class="field-label">Último logon</span><br>' + U.dataLegivel(u.ultimaAtividade) + '</div>' +
      '</div>' +
      '<h3 style="margin:16px 0 6px;font-size:13.5px">Grupos de segurança</h3><ul style="margin:0;padding-left:18px">' + grupos + '</ul>' +
      (viol.length ? '<h3 style="margin:16px 0 6px;font-size:13.5px">Achados de conformidade</h3>' +
        viol.map(function (v) {
          return '<div class="aviso ' + (v.severidade === 'critica' || v.severidade === 'alta' ? 'is-bad' : '') + '">' +
            tag(v.severidade, v.severidade === 'media' ? 'medio' : v.severidade) + ' <strong>' + U.escapeHtml(v.titulo) + '</strong><br>' +
            U.escapeHtml(v.detalhe) + '<br><span class="hash-cel">correção: ' + U.escapeHtml(v.correcao) + '</span></div>';
        }).join('') : '') +
      (opsPendentes.length ? '<h3 style="margin:16px 0 6px;font-size:13.5px">No plano atual</h3>' +
        opsPendentes.map(function (o) {
          return '<div>' + riscoTag(o.risco) + ' ' + mono(o.tipo) + ' → ' + mono(o.alvo) +
            ' <span class="hash-cel">' + U.escapeHtml(o.detalhe) + '</span></div>';
        }).join('') : ''),
      '<button class="btn btn-ghost" type="button" data-close>Fechar</button>');
  }

  function detalheReq(id) {
    var r = Store.requisicao(id);
    if (!r) return;
    var h = horasDe(r);
    var linhas = r.ops.map(function (o) {
      return '<tr><td>' + riscoTag(o.risco || 'medio') + '</td><td>' + mono(o.tipo) + '</td><td>' + mono(o.alvo) +
        '</td><td>' + U.escapeHtml(o.membro ? 'membro ' + o.membro : (o.detalhe || '')) + '</td></tr>';
    }).join('');
    abrirModal('Requisição ' + r.protocolo,
      (r.nota ? '<div class="aviso is-info">' + U.escapeHtml(r.nota) + '</div>' : '') +
      '<div class="form-grid">' +
      '<div><span class="field-label">Título</span><br>' + U.escapeHtml(r.titulo) + '</div>' +
      '<div><span class="field-label">Tipo / prioridade</span><br>' + U.escapeHtml(r.tipo) + ' · ' + U.escapeHtml(r.prioridade) + '</div>' +
      '<div><span class="field-label">Solicitante</span><br>' + mono(r.solicitante) + '</div>' +
      '<div><span class="field-label">Aprovador</span><br>' + (r.aprovador ? mono(r.aprovador) : '<span class="hash-cel">nenhum ainda</span>') + '</div>' +
      '<div><span class="field-label">Situação</span><br>' + statusTag(r.status) + '</div>' +
      '<div><span class="field-label">Duração</span><br>' + (h == null ? 'em aberto desde ' + U.dataHora(r.aberta) : U.num(h, 1) + ' h') + '</div>' +
      '</div>' +
      (r.assinatura ? '<p style="margin-top:12px">Plano assinado <code>' + U.escapeHtml(r.assinatura) + '</code> na aprovação.</p>' : '') +
      '<h3 style="margin:14px 0 6px;font-size:13.5px">Operações declaradas</h3>' +
      '<div class="table-wrap"><table class="table"><thead><tr><th>Risco</th><th>Operação</th><th>Alvo</th><th>Detalhe</th></tr></thead><tbody>' +
      (linhas || vazio(4, 'Sem operações.')) + '</tbody></table></div>' +
      (r.entradas && r.entradas.length
        ? '<h3 style="margin:14px 0 6px;font-size:13.5px">Resultado da aplicação</h3>' +
          r.entradas.map(function (e) { return '<div>' + statusTag(e.status) + ' ' + mono(e.tipo) + ' · ' + U.escapeHtml(e.mensagem || '') + '</div>'; }).join('')
        : ''),
      '<button class="btn btn-ghost" type="button" data-close>Fechar</button>' +
      '<button class="btn btn-ghost" type="button" data-act="req-whatif" data-id="' + r.id + '">Ver -WhatIf</button>' +
      ((r.status === 'planejada' || r.status === 'aberta') ? '<button class="btn btn-ghost" type="button" data-act="req-aprovar" data-id="' + r.id + '">Aprovar</button>' : '') +
      (r.status === 'aprovada' ? '<button class="btn btn-primary" type="button" data-act="req-aplicar" data-id="' + r.id + '">Aplicar ao diretório</button>' : '') +
      (r.status === 'concluida' ? '<button class="btn btn-danger" type="button" data-act="req-reverter" data-id="' + r.id + '">Reverter pelo diário</button>' : ''));
  }

  function formAprovar(id) {
    var r = Store.requisicao(id);
    if (!r) return;
    abrirModal('Aprovar ' + r.protocolo,
      '<div class="aviso is-info">Segregação de funções: o aprovador precisa ser outra identidade. O solicitante atual é <strong>' +
      U.escapeHtml(r.solicitante) + '</strong>.</div>' +
      '<label class="field-label" for="inpAprovador">Aprovador (gestor ou dono do recurso)</label>' +
      '<input id="inpAprovador" class="input" style="width:100%;margin-top:6px" value="' + U.escapeHtml(Store.state.config.aprovador || '') + '" placeholder="ex.: m.gouveia">',
      '<button class="btn btn-ghost" type="button" data-close>Cancelar</button>' +
      '<button class="btn btn-primary" type="button" id="modalOk">Registrar aprovação</button>',
      function () {
        var nome = (document.getElementById('inpAprovador').value || '').trim();
        var res = Store.aprovar(id, nome);
        if (!res.ok) { toast(res.erro, res.sod ? 'warn' : 'bad'); return false; }
        Store.state.config.aprovador = nome;
        toast('Aprovada por ' + U.escapeHtml(nome) + ' · plano <code>' + U.escapeHtml(res.requisicao.assinatura) + '</code>', 'ok');
        return true;
      });
  }

  function formNovaReq() {
    var estado = Store.state.diretorio;
    var declarados = IaC.parse(Store.state.desejado).grupos.map(function (b) { return b.nome; });
    var existentes = estado.grupos.map(function (g) { return g.nome; });
    var nomes = existentes.concat(declarados.filter(function (n) { return existentes.indexOf(n) < 0; })).sort();
    var opcoesGrupo = nomes.map(function (nome) {
      var g = AD.indexGrupos(estado)[nome];
      var rotulo = g && g.critico ? ' · crítico' : (g ? '' : ' · a criar');
      return { valor: nome, label: nome + rotulo };
    });
    abrirModal('Nova requisição de identidade',
      '<div class="form-grid">' +
      '<label><span class="field-label">Modelo</span><select id="nrTipo" class="input">' +
        '<option value="concessao">Concessão de grupo</option>' +
        '<option value="revogacao">Revogação de grupo</option>' +
        '<option value="offboarding">Offboarding (desligamento)</option>' +
        '<option value="onboarding">Onboarding (nova conta)</option>' +
        '<option value="relocacao">Relocar conta de OU</option>' +
      '</select></label>' +
      '<label><span class="field-label">Conta (sAMAccountName)</span><input id="nrSam" class="input" placeholder="ex.: joao.aleixo" list="listaSam"><datalist id="listaSam">' +
        estado.usuarios.map(function (u) { return '<option value="' + U.escapeHtml(u.sam) + '">'; }).join('') + '</datalist></label>' +
      '<label id="nrGrupoWrap"><span class="field-label">Grupo</span><select id="nrGrupo" class="input">' +
        opcoesGrupo.map(function (o) { return '<option value="' + U.escapeHtml(o.valor) + '">' + U.escapeHtml(o.label) + '</option>'; }).join('') +
      '</select></label>' +
      '<label id="nrOuWrap" hidden><span class="field-label">OU destino</span><select id="nrOu" class="input">' +
        estado.ou.map(function (dn) { return '<option value="' + U.escapeHtml(dn) + '">' + U.escapeHtml(dn.split(',')[0]) + '</option>'; }).join('') +
      '</select></label>' +
      '<label id="nrNomeWrap" hidden><span class="field-label">Nome completo</span><input id="nrNome" class="input" placeholder="ex.: Marina Couto"></label>' +
      '<label><span class="field-label">Solicitante</span><input id="nrSolicitante" class="input" value="' + U.escapeHtml(Store.state.config.ator) + '"></label>' +
      '<label><span class="field-label">Gestor aprovador sugerido</span><input id="nrGestor" class="input" value="Gestor TI"></label>' +
      '<label><span class="field-label">Prioridade</span><select id="nrPrio" class="input">' +
        '<option value="normal">normal</option><option value="urgente">urgente</option><option value="baixa">baixa</option></select></label>' +
      '<label class="full"><span class="field-label">Justificativa</span><input id="nrNota" class="input" placeholder="quem pediu, por quê, até quando"></label>' +
      '</div>' +
      '<p class="side-note">A requisição nasce como <em>planejada</em> e só escreve no diretório depois de aprovada por outra pessoa — o -WhatIf está sempre liberado.</p>',
      '<button class="btn btn-ghost" type="button" data-close>Cancelar</button>' +
      '<button class="btn btn-primary" type="button" id="modalOk">Abrir requisição</button>',
      function () {
        var tipo = document.getElementById('nrTipo').value;
        var sam = (document.getElementById('nrSam').value || '').trim().toLowerCase();
        var grupo = document.getElementById('nrGrupo').value;
        var ou = document.getElementById('nrOu').value;
        var nota = (document.getElementById('nrNota').value || '').trim();
        var ops = [];
        var rotulos = { concessao: 'Concessão de grupo', revogacao: 'Revogação de grupo', offboarding: 'Offboarding',
          onboarding: 'Onboarding', relocacao: 'Relocalização de OU' };
        var u = AD.usuario(estado, sam);
        if (!sam) { toast('Informe a conta.', 'bad'); return false; }
        if (tipo !== 'onboarding' && !u) { toast('Conta ' + U.escapeHtml(sam) + ' não existe no inventário.', 'bad'); return false; }
        var criaGrupo = function () {
          if (AD.indexGrupos(estado)[grupo]) return null;
          return { tipo: 'criarGrupo', alvo: grupo, depois: {
            escopo: 'Global', critico: false, descricao: (nota || 'Grupo criado pela requisição').slice(0, 90) } };
        };
        switch (tipo) {
          case 'concessao':
            if (!grupo) { toast('Selecione o grupo.', 'bad'); return false; }
            ops = [criaGrupo(), { tipo: 'adicionarGrupo', alvo: grupo, depois: { membro: sam }, membro: sam }].filter(Boolean);
            break;
          case 'revogacao':
            if (!grupo) { toast('Selecione o grupo.', 'bad'); return false; }
            ops = [{ tipo: 'removerGrupo', alvo: grupo, depois: { membro: sam }, membro: sam }];
            break;
          case 'offboarding': ops = [{ tipo: 'desativarUsuario', alvo: sam, antes: { ativo: true, grupos: u.grupos.slice() }, depois: { ativo: false, grupos: [] } }]; break;
          case 'relocacao': ops = [{ tipo: 'moverOU', alvo: sam, antes: { ou: u.ou }, depois: { ou: ou } }]; break;
          case 'onboarding':
            ops = [{ tipo: 'criarUsuario', alvo: sam, depois: {
              nome: (document.getElementById('nrNome').value || '').trim() || AD.samLegivel(sam),
              ou: ou, setor: '', ativo: true, grupos: grupo ? [grupo] : [] } }];
            break;
        }
        var titulo = rotulos[tipo] + ': ' + sam + (tipo === 'concessao' || tipo === 'revogacao' ? ' → ' + grupo : '');
        var r = Store.criarRequisicao({
          tipo: tipo === 'onboarding' ? 'onboarding' : (tipo === 'offboarding' ? 'offboarding' : 'ajuste'),
          titulo: titulo,
          solicitante: (document.getElementById('nrSolicitante').value || '').trim() || Store.state.config.ator,
          gestor: (document.getElementById('nrGestor').value || '').trim() || 'Gestor TI',
          prioridade: document.getElementById('nrPrio').value,
          ops: ops, nota: nota
        });
        if (!r.ok) { toast(r.erro, 'bad'); return false; }
        toast('Requisição <strong>' + U.escapeHtml(r.requisicao.protocolo) + '</strong> aberta — falta aprovação de outra pessoa.', 'ok');
        return true;
      });

    var troca = function () {
      var tipo = document.getElementById('nrTipo').value;
      document.getElementById('nrGrupoWrap').hidden = (tipo === 'offboarding' || tipo === 'relocacao');
      document.getElementById('nrOuWrap').hidden = (tipo === 'concessao' || tipo === 'revogacao' || tipo === 'offboarding');
      document.getElementById('nrNomeWrap').hidden = tipo !== 'onboarding';
    };
    document.getElementById('nrTipo').addEventListener('change', troca);
    troca();
  }

  /* --------------------------------- ações -------------------------------- */
  function executarAcao(act, id, botao) {
    if (act === 'conta') { detalheConta(id); return; }
    if (act === 'req') { detalheReq(id); return; }
    if (act === 'req-aprovar') { formAprovar(id); return; }
    if (act === 'req-whatif') {
      var dry = Store.executarRequisicao(id, { dryRun: true });
      if (!dry.ok) { toast(dry.erro, 'bad'); return; }
      var r = Store.requisicao(id);
      S.exec = { protocolo: r.protocolo, dryRun: true, entradas: dry.resultado.entradas };
      UI.go('execucao');
      renderExecucao();
      toast(U.plural(dry.resultado.entradas.length, 'operação pré-visualizada', 'operações pré-visualizadas') + ' sem escrita no diretório.', 'ok');
      return;
    }
    if (act === 'req-aplicar') {
      var req = Store.requisicao(id);
      confirmar('Aplicar ' + req.protocolo,
        '<p>' + U.escapeHtml(req.titulo) + '</p><div class="aviso is-bad">' +
        U.plural(req.ops.length, 'operação', 'operações') + ' sobre o diretório' +
        (req.ops.some(function (o) { return o.risco === 'alto'; }) ? ', incluindo remoção de conta ou exclusão de grupo.' : '.') +
        ' O diário de reversão fica gravado nesta requisição.</div>',
        'Aplicar agora', function () {
          var res = Store.executarRequisicao(id, {});
          if (!res.ok && !res.resultado) { toast(res.erro, 'bad'); return false; }
          S.exec = { protocolo: req.protocolo, dryRun: false, entradas: res.resultado.entradas };
          toast(res.ok ? 'Aplicado · diário com ' + U.plural(res.resultado.diario.length, 'entrada', 'entradas') + ' para reversão.'
            : 'Falhou: ' + U.escapeHtml(res.erro || 'operação recusada'), res.ok ? 'ok' : 'bad');
          return true;
        }, true);
      return;
    }
    if (act === 'req-reverter') {
      var rv = Store.requisicao(id);
      confirmar('Reverter ' + rv.protocolo,
        '<div class="aviso">Desfaz as ' + U.plural(rv.diario.length, 'entrada', 'entradas') + ' do diário na ordem inversa. ' +
        'Equivalente a <code>Consolidar-Identidade.ps1 -Reverter -Diario journal\\' + U.escapeHtml(rv.assinatura || '') + '.json</code>.</div>',
        'Reverter', function () {
          var res = Store.reverterRequisicao(id);
          toast(res.ok ? 'Reversão concluída em ' + U.plural(res.trilha.length, 'passo', 'passos') + '.' : res.erro, res.ok ? 'warn' : 'bad');
          return true;
        }, true);
      return;
    }
    if (act === 'req-rejeitar') {
      var rej = Store.requisicao(id);
      abrirModal('Rejeitar ' + rej.protocolo,
        '<label class="field-label" for="rjMotivo">Motivo (vai para a trilha de auditoria)</label>' +
        '<textarea id="rjMotivo" class="input" rows="3" style="width:100%;margin-top:6px" placeholder="ex.: falta de solicitação do gestor dono do recurso"></textarea>',
        '<button class="btn btn-ghost" type="button" data-close>Cancelar</button>' +
        '<button class="btn btn-danger" type="button" id="modalOk">Rejeitar</button>',
        function () {
          var motivo = (document.getElementById('rjMotivo').value || '').trim();
          var res = Store.rejeitar(id, motivo || 'Rejeitada pelo revisor.', Store.state.config.ator);
          if (!res.ok) { toast(res.erro, 'bad'); return false; }
          toast('Requisição rejeitada e registrada na auditoria.', 'warn');
          return true;
        });
      return;
    }
    if (act === 'desejado-linha') {
      el('#txtDesejado').focus();
      return;
    }
  }

  /* ------------------------------- render geral ----------------------------- */
  function renderPainel(resumo, pl, gov, kpi) {
    var estado = Store.state.diretorio;
    var top = Store.state.__gov.filter(function (v) { return v.severidade === 'critica' || v.severidade === 'alta'; }).slice(0, 8);
    el('#tblTopGovernanca tbody').innerHTML = top.length
      ? top.map(function (v) {
        return '<tr><td>' + tag(v.severidade, v.severidade === 'media' ? 'medio' : v.severidade) + '</td><td>' + mono(v.regra) +
          '</td><td>' + (v.sam ? mono(v.sam) : '<span class="hash-cel">diretório</span>') + '</td><td>' + U.escapeHtml(v.titulo) +
          ' <span class="hash-cel">' + U.escapeHtml(v.detalhe) + '</span></td><td class="hash-cel">' + U.escapeHtml(v.correcao) + '</td></tr>';
      }).join('')
      : vazio(5, 'Nenhum achado crítico ou alto no inventário atual.');

    var d = Charts.renderDeriva(estado, pl.ops);
    el('#derivaFoot').innerHTML = pl.resumo.total
      ? U.plural(pl.resumo.total, 'operação em derivação', 'operações em derivação') + ' — ' +
        d.setores.filter(function (s, i) {
          return (d.matriz[s].baixo || 0) + (d.matriz[s].medio || 0) + (d.matriz[s].alto || 0) > 0;
        }).join(', ') + ' concentram o trabalho.'
      : 'Zero derivação: aplique o estado desejado novamente e o plano só produzirá no-op.';

    Charts.renderFila(Store.state.requisicoes);
    var dias = {};
    Store.state.requisicoes.forEach(function (r) { dias[r.aberta.slice(0, 10)] = 1; });
    el('#filaFoot').innerHTML = U.plural(Store.state.requisicoes.length, 'requisição', 'requisições') +
      ' na base · ' + U.plural(Object.keys(dias).length, 'dia distinto', 'dias distintos') + ' no gráfico · cores por modelo de solicitação.';

    var grupos = Charts.renderGrupos(estado, true);
    el('#gruposFoot').innerHTML = U.plural(grupos.length, 'grupo com membros', 'grupos com membros') +
      ' · rosa é grupo crítico declarado no estado desejado · clique para filtrar o diretório.';

    var sla = Charts.renderSla(Store.state.requisicoes, 12);
    var fora = sla.filter(function (r) { return r.horas > 12; }).length;
    el('#slaFoot').innerHTML = U.plural(sla.length, 'requisição encerrada', 'requisições encerradas') +
      ' medidas · ' + U.plural(fora, 'acima', 'acima') + ' do SLA de 12 h' +
      (fora ? ': ' + fora + ' estouraram a janela prometida ao negócio.' : '.');
  }

  function render() {
    var estado = Store.state.diretorio;
    var t = TITULOS[S.view] || ['', ''];
    el('#viewTitulo').textContent = t[0];
    el('#viewSub').textContent = t[1];
    document.querySelectorAll('#nav .nav-item').forEach(function (b) {
      b.classList.toggle('is-active', b.dataset.view === S.view);
    });
    document.querySelectorAll('.view').forEach(function (v) {
      v.classList.toggle('is-active', v.id === 'view-' + S.view);
    });

    var violacoes = Governanca.avaliar(estado, Store.state.config);
    var pl = S.planoCache || Store.plano();
    S.planoCache = pl;
    var resumoGov = Governanca.resumo(estado, violacoes);
    var resumo = AD.resumo(estado);
    var cadeia = Store.validarCadeia();
    var kpi = Exec.kpis(Store.state.requisicoes);

    resumo.auditoriaTotal = Store.state.auditoria.length;
    resumo.cadeiaIntacta = cadeia.intacta;
    resumo.ultimoHash = Store.state.auditoria.length ? Store.state.auditoria[Store.state.auditoria.length - 1].hash : '';

    var idsNoPlano = {};
    pl.ops.forEach(function (o) {
      if (o.alvo) idsNoPlano[o.alvo] = true;
      if (o.depois && o.depois.membro) idsNoPlano[o.depois.membro] = true;
    });
    violacoes.forEach(function (v) { v.noPlano = !!(v.sam && idsNoPlano[v.sam]); });
    Store.state.__gov = violacoes;

    renderKpis(resumo, pl, resumoGov, kpi);
    renderBadges(resumo, pl, resumoGov, kpi);
    if (S.view === 'governanca') Charts.renderConformidade(resumoGov);
    renderGovernanca(violacoes, resumoGov);
    renderAuditoria(cadeia);
    renderFila();
    renderExecucao();
    renderScript(pl);

    if (S.view === 'painel') renderPainel(resumo, pl, resumoGov, kpi);
    if (S.view === 'diretorio') { renderContas(enrich(estado)); renderGruposTabela(estado); }
    if (S.view === 'desejado') { renderPlano(pl); renderErros(pl); }
  }

  function go(view) {
    S.view = view;
    if (view !== 'desejado') S.planoCache = null;
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function irParaContas(grupo) {
    S.contaGrupo = grupo;
    S.contaStatus = '';
    S.contaBusca = '';
    sincronizaCampos();
    go('diretorio');
  }

  function sincronizaCampos() {
    el('#filtraBusca').value = S.contaBusca;
    el('#filtraGrupo').value = S.contaGrupo;
    el('#filtraStatus').value = S.contaStatus;
    el('#selModo').value = Store.state.modo;
    el('#inpAtor').value = Store.state.config.ator;
    preench('#filtraSetor', [{ valor: '', label: 'Setor: todos' }].concat(
      Object.keys(Governanca.OU_POR_SETOR).map(function (s) { return { valor: s, label: s }; })), S.contaSetor);
    preench('#filtraGrupo', [{ valor: '', label: 'Grupo: todos' }].concat(
      Store.state.diretorio.grupos.map(function (g) { return { valor: g.nome, label: g.nome + (g.critico ? ' · crítico' : '') }; })), S.contaGrupo);
    el('#selGovSeveridade').value = S.govSeveridade;
    el('#chkGovPlano').checked = S.govSoPlano;
    el('#selFilaStatus').value = S.filaStatus;
  }

  function validaDesejado(depoisRender) {
    S.planoCache = Store.plano();
    if (depoisRender) render();
  }

  function initDelegation() {
    document.body.addEventListener('click', function (evt) {
      var alvo = evt.target.closest('[data-act]');
      if (alvo) {
        executarAcao(alvo.dataset.act, alvo.dataset.id, alvo);
        return;
      }
      if (evt.target.closest('#modalOk')) {
        var ok = modalState.onConfirm;
        if (ok && ok() !== false) fecharModal();
        return;
      }
      if (evt.target.closest('[data-close]')) { fecharModal(); return; }
      var goto = evt.target.closest('[data-goto]');
      if (goto) { go(goto.dataset.goto); return; }
      var sort = evt.target.closest('#tblContas th[data-sort]');
      if (sort) {
        var campo = sort.dataset.sort;
        S.ordena = { campo: campo, dir: S.ordena.campo === campo ? -S.ordena.dir : 1 };
        render();
      }
    });

    document.addEventListener('keydown', function (evt) {
      if (evt.key === 'Escape' && !el('#modal').hidden) fecharModal();
    });
  }

  function resetDemo() {
    confirmar('Recriar o ambiente de demonstração',
      '<div class="aviso is-bad">Restaura o inventário, a fila e a trilha de auditoria gerados pela semente determinística ' +
      '<code>20261018</code>. Requisições e execuções que você criou aqui são descartadas.</div>',
      'Recriar', function () {
        Store.resetDemo();
        S.planoCache = null;
        S.exec = null;
        toast('Ambiente recriado a partir da semente determinística.', 'ok');
        return true;
      }, true);
  }

  function sobreAmbiente() {
    abrirModal('O que é simulado e o que é real',
      '<p>O <strong>inventário</strong> (contas, grupos, OUs, datas de logon) é uma semente determinística que roda na sua máquina: ' +
      'nenhum domínio real é tocado e você não precisa de servidor, RSAT nem credencial.</p>' +
      '<p style="margin-top:10px">O que <strong>não é maquete</strong>:</p>' +
      '<ul style="margin:6px 0 0 18px;padding:0">' +
      '<li>o PowerShell gerado — filtros, guardas de estado, <code>-WhatIf</code>, transcript, diário e CSV de auditoria;</li>' +
      '<li>o cálculo de derivação e a idempotência do plano (aplicar duas vezes gera no-op);</li>' +
      '<li>a política de segregação de funções e o bloqueio de operações em grupo crítico;</li>' +
      '<li>a cadeia de hash da trilha de auditoria — use "Simular adulteração" e veja a verificação quebrar.</li>' +
      '</ul>' +
      '<p style="margin-top:10px" class="side-note">Para levar a um domínio real, troque o backend simulado por <code>Import-Module ActiveDirectory</code>: ' +
      'o estado desejado, o plano e as regras de governança continuam os mesmos.</p>',
      '<button class="btn btn-primary" type="button" data-close>Entendi</button>');
  }

  global.UI = {
    state: S,
    render: render,
    go: go,
    irParaContas: irParaContas,
    sincronizaCampos: sincronizaCampos,
    validaDesejado: validaDesejado,
    initDelegation: initDelegation,
    novaReq: formNovaReq,
    resetDemo: resetDemo,
    sobreAmbiente: sobreAmbiente,
    fecharModal: fecharModal,
    toast: toast,
    destacarPS: destacarPS,
    enrich: enrich,
    ordenar: ordenar
  };
})(window);
