/* Diretório de identidade simulado: OUs, grupos, usuários e mutações validadas. */
(function (global) {
  'use strict';

  var DOMINIO = 'contoso.local';

  var OUS = [
    'OU=Colaboradores,OU=Matriz,DC=contoso,DC=local',
    'OU=Financeiro,OU=Matriz,DC=contoso,DC=local',
    'OU=Operacoes,OU=Filial,DC=contoso,DC=local',
    'OU=Sistemas,OU=TI,DC=contoso,DC=local',
    'OU=Prestadores,OU=Externos,DC=contoso,DC=local'
  ];

  var GRUPOS = [
    { nome: 'GG_FINANCEIRO_APROVAR', escopo: 'Global', critico: true, descricao: 'Aprovação de títulos a pagar' },
    { nome: 'GG_FINANCEIRO_EMITIR', escopo: 'Global', critico: true, descricao: 'Emissão e liquidação de pagamentos' },
    { nome: 'GG_CONHAS_CONSULTA', escopo: 'Global', critico: true, descricao: 'Consulta ao razão contábil' },
    { nome: 'GG_TI_ADMIN_SERVIDOR', escopo: 'Global', critico: true, descricao: 'Admin local de servidores de aplicação' },
    { nome: 'GG_TI_MONITORACAO', escopo: 'Global', critico: false, descricao: 'Leitura de alertas e dashboards' },
    { nome: 'GG_RH_FOLHA', escopo: 'Domain Local', critico: false, descricao: 'Folha de pagamento' },
    { nome: 'GG_RH_RECRUTAMENTO', escopo: 'Domain Local', critico: false, descricao: 'Vagas e candidatos' },
    { nome: 'GG_OPERACOES_LOJA', escopo: 'Domain Local', critico: false, descricao: 'PDV e estoque de loja' },
    { nome: 'GG_RELATORIOS_GESTAO', escopo: 'Global', critico: false, descricao: 'BI para gestores' },
    { nome: 'GG_EXTERNOS_VPN', escopo: 'Global', critico: true, descricao: 'Acesso remoto de terceiros' }
  ];

  var NOMES = [
    'Ana Beatriz Melo', 'Bruno Tavares', 'Carla Souza Dias', 'Diego Marques', 'Elaine Prado',
    'Fabio Nakamura', 'Gabriela Rios', 'Heitor Vasconcelos', 'Isabela Fagundes', 'Joao Pedro Aleixo',
    'Karina Batista', 'Lucas Ferrari', 'Marcia Gouveia', 'Nelson Pinto', 'Otvia Andrade',
    'Paulo Henrique Lima', 'Quetilin Ramos', 'Rafael Cordeiro', 'Sofia Alencar', 'Thiago Barreto',
    'Ulysses Camargo', 'Valeria Munhoz', 'Wagner Siqueira', 'Xavier Gomes', 'Yara Lemos',
    'Zaira Fontes', 'Adriana Bertoldo', 'Caio Bertoldo', 'Daniela Prestes', 'Eduardo Natali',
    'Fernanda Ottoni', 'Gustavo Vilela', 'Helena Sacchi', 'Igor Brandt', 'Juliana Estanislau',
    'Klaus Antunes'
  ];

  var SETORES = [
    { setor: 'Financeiro', ou: 1, grupos: ['GG_FINANCEIRO_APROVAR', 'GG_CONHAS_CONSULTA', 'GG_RELATORIOS_GESTAO'] },
    { setor: 'Operacoes', ou: 2, grupos: ['GG_OPERACOES_LOJA'] },
    { setor: 'TI', ou: 3, grupos: ['GG_TI_ADMIN_SERVIDOR', 'GG_TI_MONITORACAO'] },
    { setor: 'RH', ou: 0, grupos: ['GG_RH_FOLHA', 'GG_RH_RECRUTAMENTO'] },
    { setor: 'Prestadores', ou: 4, grupos: ['GG_EXTERNOS_VPN'] }
  ];

  function slug(texto) {
    return String(texto).toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '');
  }

  function samDe(nome) {
    var partes = slug(nome).split('.');
    var s = partes.length > 1 ? partes[0] + '.' + partes[partes.length - 1] : partes[0];
    return s.slice(0, 20);
  }

  /** Inverso de samDe: constrói um nome legível a partir de conta como "joao.aleixo". */
  function samLegivel(sam) {
    return String(sam || '').split('.').map(function (p) {
      return p.charAt(0).toUpperCase() + p.slice(1);
    }).join(' ');
  }

  function novoUsuario(nome, cfg, criadoEm, rand) {
    var sam = samDe(nome);
    return {
      id: U.uid('u'),
      sam: sam,
      nome: nome,
      upn: sam + '@' + DOMINIO,
      ou: OUS[cfg.ou],
      setor: cfg.setor,
      ativo: rand() > 0.06,
      grupos: cfg.grupos.slice(),
      criado: criadoEm,
      ultimaAtividade: U.addDias(criadoEm, Math.floor(rand() * 120) + 1)
    };
  }

  /** Monta o diretório inicial com semente fixa: mesma derivação em toda máquina. */
  function buildSeed() {
    var rand = U.rng(20261018);
    var hoje = U.hojeISO();
    var usuarios = NOMES.map(function (nome, i) {
      var cfg = SETORES[i % SETORES.length];
      var criado = U.addDias(hoje, -(40 + Math.floor(rand() * 900)));
      return novoUsuario(nome, cfg, criado, rand);
    });

    var porSam = Object.create(null);
    usuarios.forEach(function (u) { porSam[u.sam] = u; });

    // derivações intencionais para o painel de governança ter o que apontar
    if (porSam['ana.melo']) {
      porSam['ana.melo'].grupos.push('GG_FINANCEIRO_EMITIR');
    }
    if (porSam['bruno.tavares']) {
      porSam['bruno.tavares'].grupos.push('GG_FINANCEIRO_EMITIR', 'GG_TI_ADMIN_SERVIDOR');
      porSam['bruno.tavares'].ativo = true;
    }
    // exatamente duas contas dormentes: o restante dos ativos fica com logon recente
    var DESLIGADOS = [5, 16, 27, 33];
    var REVOGACAO_INCOMPLETA = [11, 22];
    usuarios.forEach(function (u, i) {
      if (DESLIGADOS.indexOf(i) >= 0) { u.ativo = false; u.grupos = []; }
      if (REVOGACAO_INCOMPLETA.indexOf(i) >= 0) u.ativo = false;
    });
    usuarios.forEach(function (u) {
      if (u.ativo) u.ultimaAtividade = U.addDias(hoje, -(2 + Math.floor(rand() * 45)));
    });
    var dormentes = usuarios.filter(function (u) { return u.ativo; }).slice(7, 9);
    dormentes.forEach(function (u, i) {
      u.ultimaAtividade = U.addDias(hoje, -(180 + i * 34));
    });
    var externo = usuarios[25];
    externo.grupos.push('GG_TI_ADMIN_SERVIDOR');
    externo.ou = OUS[4];

    return {
      version: 1,
      dominio: DOMINIO,
      ou: OUS.slice(),
      grupos: U.clone(GRUPOS),
      usuarios: usuarios,
      meta: { criadoEm: hoje, atualizadoEm: hoje }
    };
  }

  function indexGrupos(state) {
    var map = Object.create(null);
    state.grupos.forEach(function (g) { map[g.nome] = g; });
    return map;
  }

  function usuario(state, sam) {
    for (var i = 0; i < state.usuarios.length; i++) {
      if (state.usuarios[i].sam === sam) return state.usuarios[i];
    }
    return null;
  }

  function membrosDoGrupo(state, nome) {
    return state.usuarios.filter(function (u) { return u.grupos.indexOf(nome) >= 0; });
  }

  function ouValida(state, caminho) {
    return state.ou.indexOf(caminho) >= 0;
  }

  function criarUsuario(state, dados) {
    var sam = String(dados.sam || '').trim().toLowerCase();
    if (!sam) return { ok: false, erro: 'sAMAccountName obrigatório.' };
    if (usuario(state, sam)) return { ok: false, erro: 'Ja existe conta com esse sAMAccountName.' };
    if (!ouValida(state, dados.ou)) return { ok: false, erro: 'OU inexistente no diretório.' };
    var desconhecidos = (dados.grupos || []).filter(function (g) { return !indexGrupos(state)[g]; });
    if (desconhecidos.length) return { ok: false, erro: 'Grupo inexistente: ' + desconhecidos.join(', ') + '.' };
    var novo = {
      id: U.uid('u'),
      sam: sam,
      nome: dados.nome || sam,
      upn: sam + '@' + state.dominio,
      ou: dados.ou,
      setor: dados.setor || '',
      ativo: dados.ativo !== false,
      grupos: (dados.grupos || []).slice(),
      criado: U.hojeISO(),
      ultimaAtividade: U.hojeISO()
    };
    state.usuarios.push(novo);
    return { ok: true, usuario: novo };
  }

  function atualizarUsuario(state, sam, mudancas) {
    var u = usuario(state, sam);
    if (!u) return { ok: false, erro: 'Conta nao encontrada.' };
    if (mudancas.ou && !ouValida(state, mudancas.ou)) return { ok: false, erro: 'OU inexistente.' };
    if (mudancas.grupos) {
      var mapa = indexGrupos(state);
      var invalidos = mudancas.grupos.filter(function (g) { return !mapa[g]; });
      if (invalidos.length) return { ok: false, erro: 'Grupo inexistente: ' + invalidos.join(', ') + '.' };
    }
    ['nome', 'ou', 'setor', 'ativo'].forEach(function (campo) {
      if (mudancas[campo] !== undefined) u[campo] = mudancas[campo];
    });
    if (mudancas.grupos) u.grupos = mudancas.grupos.slice();
    return { ok: true, usuario: u };
  }

  function desativarUsuario(state, sam) {
    var u = usuario(state, sam);
    if (!u) return { ok: false, erro: 'Conta nao encontrada.' };
    u.ativo = false;
    u.grupos = [];
    return { ok: true, usuario: u };
  }

  function criarGrupo(state, dados) {
    var mapa = indexGrupos(state);
    if (mapa[dados.nome]) return { ok: false, erro: 'Grupo ja existe.' };
    state.grupos.push({
      nome: dados.nome,
      escopo: dados.escopo || 'Global',
      critico: dados.critico === true,
      descricao: dados.descricao || ''
    });
    return { ok: true, grupo: dados.nome };
  }

  function resumo(state) {
    var ativos = state.usuarios.filter(function (u) { return u.ativo; });
    return {
      total: state.usuarios.length,
      ativos: ativos.length,
      inativos: state.usuarios.length - ativos.length,
      grupos: state.grupos.length,
      criticos: state.grupos.filter(function (g) { return g.critico; }).length,
      externos: ativos.filter(function (u) { return u.ou.indexOf('Externos') >= 0; }).length,
      vinculos: U.sum(state.usuarios, function (u) { return u.grupos.length; })
    };
  }

  global.AD = {
    DOMINIO: DOMINIO,
    OUS: OUS,
    GRUPOS: GRUPOS,
    buildSeed: buildSeed,
    samDe: samDe,
    samLegivel: samLegivel,
    slug: slug,
    usuario: usuario,
    membrosDoGrupo: membrosDoGrupo,
    indexGrupos: indexGrupos,
    ouValida: ouValida,
    criarUsuario: criarUsuario,
    atualizarUsuario: atualizarUsuario,
    desativarUsuario: desativarUsuario,
    criarGrupo: criarGrupo,
    resumo: resumo
  };
})(window);
