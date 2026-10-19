/* Regras de governança e conformidade sobre o diretório e sobre o plano. */
(function (global) {
  'use strict';

  var REGRAS = ['conta_dormente', 'vinculo_residual', 'separacao_funcoes', 'menor_privilegio',
    'ou_fora_padrao', 'grupo_critico_vazio', 'externo_em_grupo_interno', 'externo_sem_acesso'];

  var PARES_SOD = [
    { par: ['GG_FINANCEIRO_APROVAR', 'GG_FINANCEIRO_EMITIR'], motivo: 'quem aprova não pode emitir o mesmo título' },
    { par: ['GG_CONHAS_CONSULTA', 'GG_FINANCEIRO_EMITIR'], motivo: 'consulta contábil somada à emissão separa funções' }
  ];

  var PRIVILEGIO_MINIMO = {
    GG_TI_ADMIN_SERVIDOR: ['TI'],
    GG_EXTERNOS_VPN: ['Prestadores'],
    GG_FINANCEIRO_APROVAR: ['Financeiro'],
    GG_FINANCEIRO_EMITIR: ['Financeiro']
  };

  var OU_POR_SETOR = {
    Financeiro: 'OU=Financeiro,OU=Matriz,DC=contoso,DC=local',
    Operacoes: 'OU=Operacoes,OU=Filial,DC=contoso,DC=local',
    TI: 'OU=Sistemas,OU=TI,DC=contoso,DC=local',
    RH: 'OU=Colaboradores,OU=Matriz,DC=contoso,DC=local',
    Prestadores: 'OU=Prestadores,OU=Externos,DC=contoso,DC=local'
  };

  function registrar(lista, regra, severidade, usuario, titulo, detalhe, correcao, sufixo) {
    lista.push({
      id: regra + ':' + (usuario ? usuario.sam : 'diretorio') + (sufixo ? ':' + sufixo : ''),
      regra: regra,
      severidade: severidade,
      sam: usuario ? usuario.sam : null,
      nome: usuario ? usuario.nome : 'Diretório',
      setor: usuario ? usuario.setor : '',
      titulo: titulo,
      detalhe: detalhe,
      correcao: correcao
    });
  }

  function avaliar(estado, config) {
    config = config || {};
    var dormente = config.janelaDormencia || 90;
    var hoje = U.hojeISO();
    var out = [];

    estado.usuarios.forEach(function (u) {
      var inatividade = U.diffDias(u.ultimaAtividade, hoje);
      if (u.ativo && inatividade > dormente) {
        registrar(out, 'conta_dormente', 'media', u, 'Conta ativa sem logon há ' + U.num(inatividade) + ' dias',
          u.sam + ' não autentica desde ' + U.dataLegivel(u.ultimaAtividade) + ', acima da janela de ' + U.num(dormente) + ' dias.',
          'Desativar e revogar vínculos pelo estado desejado (offboarding).');
      }

      if (!u.ativo && u.grupos.length) {
        registrar(out, 'vinculo_residual', 'alta', u, 'Conta desativada mantém ' + U.plural(u.grupos.length, 'grupo', 'grupos'),
          u.sam + ' ainda pertence a ' + u.grupos.join(', ') + '.',
          'Executar revogação completa: Remove-ADGroupMember em todos os vínculos.');
      }

      PARES_SOD.forEach(function (conf) {
        var tem = conf.par.filter(function (g) { return u.grupos.indexOf(g) >= 0; });
        if (tem.length === conf.par.length) {
          registrar(out, 'separacao_funcoes', 'critica', u, 'SoD: ' + conf.par.join(' + '),
            u.sam + ' está em ' + conf.par.join(' e ') + ' — ' + conf.motivo + '.',
            'Remover um dos vínculos e registrar o acesso remanescente como exceção temporária.', conf.par.join('+'));
        }
      });

      Object.keys(PRIVILEGIO_MINIMO).forEach(function (g) {
        if (u.grupos.indexOf(g) < 0) return;
        var permitidos = PRIVILEGIO_MINIMO[g];
        if (permitidos.indexOf(u.setor) < 0) {
          registrar(out, 'menor_privilegio', 'alta', u, 'Privilégio crítico fora do setor: ' + g,
            u.sam + ' (' + (u.setor || 'sem setor') + ') pertence a ' + g + ', permitido apenas para ' + permitidos.join('/') + '.',
            'Revogar ' + g + ' ou abrir exceção com justificativa do dono do recurso.', g);
        }
      });

      var esperado = OU_POR_SETOR[u.setor];
      if (esperado && u.ou !== esperado) {
        registrar(out, 'ou_fora_padrao', 'baixa', u, 'Conta fora da OU do padrão de setor',
          u.sam + ' está em ' + u.ou + ' mas o padrão de ' + u.setor + ' é ' + esperado + '.',
          'Mover a conta (Move-ADObject) para alinhar herança de GPO e delegação.');
      }
    });

    estado.grupos.forEach(function (g) {
      var membros = AD.membrosDoGrupo(estado, g.nome);
      if (g.critico && !membros.length) {
        registrar(out, 'grupo_critico_vazio', 'baixa', null, 'Grupo crítico sem membros',
          g.nome + ' está vazio: delegação ociosa em grupo de alto impacto.',
          'Remover o grupo do estado desejado ou documentar a reserva.');
      }
      membros.filter(function (m) { return m.ou.indexOf('Externos') >= 0 && /^GG_(TI|FINANCEIRO|CONHAS)_/.test(g.nome) && g.nome !== 'GG_EXTERNOS_VPN'; })
        .forEach(function (m) {
          registrar(out, 'externo_em_grupo_interno', 'critica', m, 'Prestador externo em grupo interno',
            m.sam + ' reside em OU=Externos e pertence a ' + g.nome + '.',
            'Revogar imediatamente e migrar o acesso para GG_EXTERNOS_VPN com expiração.', g.nome);
        });
    });

    estado.usuarios.filter(function (u) { return u.ativo && u.ou.indexOf('Externos') >= 0 && !u.grupos.length; })
      .forEach(function (m) {
        registrar(out, 'externo_sem_acesso', 'baixa', m, 'Prestador ativo sem nenhum grupo',
          m.sam + ' está ativo, sem vínculos, e continua com conta habilitada.',
          'Desativar a conta e encerrar o contrato no estado desejado.', 'sem-grupo');
      });

    return out.sort(function (a, b) {
      var peso = { critica: 0, alta: 1, media: 2, baixa: 3 };
      return peso[a.severidade] - peso[b.severidade] || String(a.sam).localeCompare(String(b.sam));
    });
  }

  /** Conformidade sobre o plano: o que ainda não foi aplicado, medido antes da execução. */
  function avaliarPlano(ops) {
    var alertas = [];
    ops.forEach(function (o) {
      if (o.critico && (o.tipo === 'adicionarGrupo' || o.tipo === 'criarUsuario')) {
        alertas.push({ op: o.id, nivel: 'alta', msg: 'Concessão em grupo crítico (' + o.alvo + ') exige aprovador distinto do solicitante.' });
      }
      if (o.tipo === 'excluirGrupo' && o.bloqueado) {
        alertas.push({ op: o.id, nivel: 'critica', msg: 'Exclusão de grupo crítico travada: precisa de registro de mudança.' });
      }
      if (o.tipo === 'desativarUsuario') {
        alertas.push({ op: o.id, nivel: 'media', msg: 'Offboarding de ' + o.alvo + ': confirmar devolução de ativos antes de desativar.' });
      }
    });
    return alertas;
  }

  function resumo(estado, violacoes) {
    var ativos = estado.usuarios.filter(function (u) { return u.ativo; });
    var peso = { critica: 12, alta: 6, media: 2.5, baixa: 1 };
    var porSeveridade = { critica: 0, alta: 0, media: 0, baixa: 0 };
    var porConta = Object.create(null);
    var globais = 0;
    violacoes.forEach(function (v) {
      porSeveridade[v.severidade] = (porSeveridade[v.severidade] || 0) + 1;
      if (!v.sam) { globais += peso[v.severidade]; return; }
      // o peso de cada conta é somado mas limitado: um achado não zera a nota do domínio inteiro
      porConta[v.sam] = Math.min(18, (porConta[v.sam] || 0) + peso[v.severidade]);
    });
    var pontos = U.sum(Object.keys(porConta), function (k) { return porConta[k]; }) + globais;
    var limite = Math.max(ativos.length, 1) * 6;
    return {
      avaliados: estado.usuarios.length,
      ativos: ativos.length,
      violacoes: violacoes.length,
      contasAfetadas: Object.keys(porConta).length,
      porSeveridade: porSeveridade,
      conformidade: U.round(Math.max(0, Math.min(100, 100 - (pontos / limite) * 100)), 1),
      regras: REGRAS
    };
  }

  global.Governanca = {
    avaliar: avaliar,
    avaliarPlano: avaliarPlano,
    resumo: resumo,
    PARES_SOD: PARES_SOD,
    OU_POR_SETOR: OU_POR_SETOR
  };
})(window);
