/* Estado desejado em DSL declarativa, diff contra o diretório e geração de PowerShell. */
(function (global) {
  'use strict';

  var CHAVES_USUARIO = ['nome', 'ou', 'ativo', 'grupos', 'setor'];
  var CHAVES_GRUPO = ['escopo', 'critico', 'descricao'];

  var RISCO = {
    criarUsuario: 'baixo',
    ajustarUsuario: 'baixo',
    ativarUsuario: 'medio',
    desativarUsuario: 'alto',
    moverOU: 'medio',
    adicionarGrupo: 'baixo',
    removerGrupo: 'medio',
    criarGrupo: 'baixo',
    ajustarGrupo: 'medio',
    excluirGrupo: 'alto'
  };

  var CMDLETS = {
    criarUsuario: ['New-ADUser', 'Set-ADUser', 'Add-ADGroupMember'],
    ajustarUsuario: ['Set-ADUser'],
    ativarUsuario: ['Enable-ADAccount'],
    desativarUsuario: ['Disable-ADAccount', 'Remove-ADGroupMember'],
    moverOU: ['Get-ADObject', 'Move-ADObject'],
    adicionarGrupo: ['Add-ADGroupMember'],
    removerGrupo: ['Remove-ADGroupMember'],
    criarGrupo: ['New-ADGroup'],
    ajustarGrupo: ['Set-ADGroup'],
    excluirGrupo: ['Remove-ADGroup']
  };

  var ORDEM = {
    criarUsuario: 0, criarGrupo: 1, ativarUsuario: 1, ajustarGrupo: 2,
    ajustarUsuario: 2, moverOU: 3, adicionarGrupo: 4, removerGrupo: 5,
    desativarUsuario: 6, excluirGrupo: 7
  };

  /** Parser linha a linha, com erro por número de linha como um validador de YAML. */
  function parse(texto) {
    var erros = [];
    var blocos = { grupos: [], usuarios: [], removerUsuarios: [], removerGrupos: [] };
    var atual = null;

    String(texto || '').split(/\r?\n/).forEach(function (bruta, i) {
      var n = i + 1;
      var linha = bruta.replace(/\s+$/g, '');
      if (!linha.trim() || /^\s*#/.test(linha)) return;

      var rem = /^\s*remover\s+(usuario|grupo)\s+(\S+)\s*$/i.exec(linha);
      if (rem) {
        atual = null;
        if (rem[1].toLowerCase() === 'usuario') blocos.removerUsuarios.push(rem[2].toLowerCase());
        else blocos.removerGrupos.push(rem[2].toUpperCase());
        return;
      }

      var ini = /^\s*(usuario|grupo)\s+(\S+)\s*$/i.exec(linha);
      if (ini) {
        var tipo = ini[1].toLowerCase();
        var nome = tipo === 'usuario' ? ini[2].toLowerCase() : ini[2].toUpperCase();
        var lista = tipo === 'usuario' ? blocos.usuarios : blocos.grupos;
        if (lista.some(function (b) { return b.nome === nome; })) {
          erros.push({ linha: n, msg: 'Bloco duplicado para "' + nome + '".' });
          atual = null;
          return;
        }
        atual = { tipo: tipo, nome: nome, linha: n, atributos: {} };
        lista.push(atual);
        return;
      }

      var atrib = /^\s+([A-Za-z][\w]*)\s*=\s*(.+)$/.exec(linha);
      if (!atrib) {
        erros.push({ linha: n, msg: 'Linha fora de bloco: use "usuario <sam>", "grupo <NOME>" ou um atributo recuado.' });
        return;
      }
      if (!atual) {
        erros.push({ linha: n, msg: 'Atributo sem bloco "usuario"/"grupo" acima.' });
        return;
      }
      var chave = atrib[1].toLowerCase();
      var permitido = atual.tipo === 'usuario' ? CHAVES_USUARIO : CHAVES_GRUPO;
      if (permitido.indexOf(chave) < 0) {
        erros.push({ linha: n, msg: 'Atributo "' + chave + '" não é válido para ' + atual.tipo + '. Aceitos: ' + permitido.join(', ') + '.' });
        return;
      }
      var valor = atrib[2].trim().replace(/^"|"$/g, '');
      if (chave === 'ativo' || chave === 'critico') {
        if (!/^(true|false)$/i.test(valor)) {
          erros.push({ linha: n, msg: 'Esperava true ou false, veio "' + valor + '".' });
          return;
        }
        valor = /^true$/i.test(valor);
      }
      if (chave === 'grupos') {
        valor = valor.split(/[,;]/).map(function (g) { return g.trim().toUpperCase(); }).filter(Boolean);
      }
      if (chave === 'ou' && !/^OU=.*DC=/i.test(valor)) {
        erros.push({ linha: n, msg: 'Caminho de OU precisa ser um DN completo (OU=...,DC=contoso,DC=local).' });
        return;
      }
      atual.atributos[chave] = valor;
    });

    blocos.usuarios.forEach(function (b) {
      (b.atributos.grupos || []).forEach(function (g) {
        var declarado = blocos.grupos.some(function (x) { return x.nome === g; }) ||
          AD.GRUPOS.some(function (x) { return x.nome === g; });
        if (!declarado) erros.push({ linha: b.linha, msg: 'Grupo "' + g + '" usado sem estar declarado no estado desejado nem no diretório.' });
      });
      if (!b.atributos.ou) {
        erros.push({ linha: b.linha, msg: 'Bloco de usuário sem "ou": o console não cria conta sem destino de unidade organizacional.' });
      }
    });

    return {
      erros: erros,
      grupos: blocos.grupos,
      usuarios: blocos.usuarios,
      removerUsuarios: blocos.removerUsuarios,
      removerGrupos: blocos.removerGrupos
    };
  }

  function grupoCritico(nome, estado) {
    if (estado && AD.indexGrupos(estado)[nome]) return !!AD.indexGrupos(estado)[nome].critico;
    var base = AD.GRUPOS.filter(function (g) { return g.nome === nome; })[0];
    if (base) return !!base.critico;
    return /^GG_(TI_ADMIN|FINANCEIRO|CONHAS|EXTERNOS)/.test(nome);
  }

  function op(tipo, alvo, antes, depois, detalhe, estado) {
    return {
      id: U.uid('op'),
      tipo: tipo,
      alvo: alvo,
      antes: antes,
      depois: depois,
      detalhe: detalhe,
      risco: RISCO[tipo] || 'medio',
      critico: grupoCritico(alvo, estado),
      cmdlets: CMDLETS[tipo] || []
    };
  }

  function chaveOp(o) {
    return [o.tipo, o.alvo, (o.depois && o.depois.membro) || ''].join('::');
  }

  function diffGrupo(nome, atributos, estado) {
    var atual = AD.indexGrupos(estado)[nome];
    if (!atual) {
      return [op('criarGrupo', nome, null, {
        escopo: atributos.escopo || 'Global',
        critico: atributos.critico === true,
        descricao: atributos.descricao || ''
      }, 'Grupo declarado e ausente no diretório.', estado)];
    }
    var mudado = {};
    var mudancas = [];
    ['escopo', 'critico', 'descricao'].forEach(function (campo) {
      if (atributos[campo] === undefined) return;
      if (String(atual[campo]) !== String(atributos[campo])) {
        mudado[campo] = atributos[campo];
        mudancas.push(campo + ': ' + atual[campo] + ' → ' + atributos[campo]);
      }
    });
    if (!mudancas.length) return [];
    return [op('ajustarGrupo', nome, U.clone(atual), mudado, 'Derivação de atributo de grupo: ' + mudancas.join('; '), estado)];
  }

  function diffUsuario(nome, atributos, estado) {
    var atual = AD.usuario(estado, nome);
    if (!atual) {
      return [op('criarUsuario', nome, null, {
        nome: atributos.nome || nome,
        ou: atributos.ou || '',
        setor: atributos.setor || '',
        ativo: atributos.ativo !== false,
        grupos: atributos.grupos || []
      }, 'Conta declarada e ausente no diretório (onboarding).', estado)];
    }

    var ops = [];
    if (atributos.ativo === true && !atual.ativo) {
      ops.push(op('ativarUsuario', nome, { ativo: false }, { ativo: true },
        'Conta desativada no diretório mas declarada ativa.', estado));
    }
    var ajuste = {};
    if (atributos.setor && atributos.setor !== atual.setor) ajuste.setor = atributos.setor;
    if (atributos.nome && atributos.nome !== atual.nome) ajuste.nome = atributos.nome;
    if (Object.keys(ajuste).length) {
      ops.push(op('ajustarUsuario', nome, { setor: atual.setor, nome: atual.nome }, ajuste,
        'Atributos de conta divergentes do declarado.', estado));
    }
    if (atributos.ou && atributos.ou !== atual.ou) {
      ops.push(op('moverOU', nome, { ou: atual.ou }, { ou: atributos.ou },
        'Conta em OU diferente da declarada.', estado));
    }
    (atributos.grupos || []).forEach(function (g) {
      if (atual.grupos.indexOf(g) < 0) {
        ops.push(op('adicionarGrupo', g, null, { membro: nome },
          nome + ': membresia declarada e ausente no diretório.', estado));
      }
    });
    atual.grupos.forEach(function (g) {
      if (atributos.grupos && atributos.grupos.indexOf(g) < 0) {
        ops.push(op('removerGrupo', g, null, { membro: nome },
          nome + ': vínculo existe no diretório mas não está declarado — menor privilégio.', estado));
      }
    });
    return ops;
  }

  /**
   * Plano idempotente.
   * modo 'parcial'   → corrige apenas o que está declarado (padrão seguro)
   * modo 'recursivo' → também desativa contas ativas que não foram declaradas
   */
  function plan(estado, desejado, modo) {
    var ops = [];
    desejado.grupos.forEach(function (b) { ops = ops.concat(diffGrupo(b.nome, b.atributos, estado)); });
    desejado.usuarios.forEach(function (b) { ops = ops.concat(diffUsuario(b.nome, b.atributos, estado)); });

    desejado.removerGrupos.forEach(function (nome) {
      var g = AD.indexGrupos(estado)[nome];
      if (!g) return;
      var membros = AD.membrosDoGrupo(estado, nome);
      var o = op('excluirGrupo', nome, { membros: membros.length, grupo: U.clone(g) }, null,
        g.critico
          ? 'Grupo crítico: a exclusão exige registro de mudança aprovado — o plano trava a operação.'
          : 'Exclusão explícita declarada no estado desejado.', estado);
      o.bloqueado = !!g.critico;
      ops.push(o);
    });

    desejado.removerUsuarios.forEach(function (nome) {
      var u = AD.usuario(estado, nome);
      if (!u || !u.ativo) return;
      ops.push(op('desativarUsuario', nome, { ativo: true, grupos: u.grupos.slice() }, { ativo: false, grupos: [] },
        'Offboarding declarado: desativar conta e revogar todos os vínculos.', estado));
    });

    if (modo === 'recursivo') {
      var declarados = desejado.usuarios.map(function (b) { return b.nome; });
      estado.usuarios.forEach(function (u) {
        if (!u.ativo || declarados.indexOf(u.sam) >= 0) return;
        ops.push(op('desativarUsuario', u.sam, { ativo: true, grupos: u.grupos.slice() }, { ativo: false, grupos: [] },
          'Conta ativa fora do estado desejado (modo recursivo).', estado));
      });
    }

    var vistos = {};
    ops = ops.filter(function (o) {
      var k = chaveOp(o);
      if (vistos[k]) return false;
      vistos[k] = true;
      return true;
    });
    ops.sort(function (a, b) {
      return (ORDEM[a.tipo] || 0) - (ORDEM[b.tipo] || 0) || String(a.alvo).localeCompare(String(b.alvo));
    });
    return ops;
  }

  function resumo(ops) {
    var porRisco = { baixo: 0, medio: 0, alto: 0 };
    var criticos = 0;
    var tipos = Object.create(null);
    ops.forEach(function (o) {
      porRisco[o.risco] = (porRisco[o.risco] || 0) + 1;
      tipos[o.tipo] = (tipos[o.tipo] || 0) + 1;
      if (o.critico) criticos++;
    });
    return {
      total: ops.length,
      porRisco: porRisco,
      porTipo: tipos,
      emGruposCriticos: criticos,
      assinaveis: ops.filter(function (o) { return !o.bloqueado; }).length,
      assinatura: U.hashTexto(JSON.stringify(ops.map(function (o) { return [o.tipo, o.alvo, o.depois]; })))
    };
  }

  function cmdlets(tipo) { return CMDLETS[tipo] || []; }

  /** Valor do plano literal em PowerShell: objeto vira hashtable, array vira @(). */
  function qt(valor) {
    if (valor === true) return '$true';
    if (valor === false) return '$false';
    if (valor === null || valor === undefined) return '$null';
    if (Array.isArray(valor)) return valor.length ? '@(' + valor.map(qt).join(', ') + ')' : '@()';
    if (typeof valor === 'number') return String(valor);
    if (typeof valor === 'object') {
      return '@{ ' + Object.keys(valor).map(function (k) { return k + ' = ' + qt(valor[k]); }).join('; ') + ' }';
    }
    return "'" + String(valor).replace(/'/g, "''") + "'";
  }

  function rdnDe(caminho) {
    return String(caminho || '').split(',')[0].trim();
  }

  /** Valor dentro de um -Filter entre aspas duplas: escapa o simples interno. */
  function sq(valor) {
    return "'" + String(valor).replace(/'/g, "''") + "'";
  }

  /** Um bloco por operação, com guarda de leitura para o script ficar idempotente. */
  function blocoPowerShell(o) {
    var alvo = o.alvo;
    var b = ['# [' + o.risco.toUpperCase() + '] ' + o.tipo + ' :: ' + alvo + ' — ' + o.detalhe];
    switch (o.tipo) {
      case 'criarGrupo':
        b.push('if (-not (Get-ADGroup -Filter "Name -eq ' + sq(alvo) + '" -Server $Servidor -ErrorAction SilentlyContinue)) {');
        b.push('  $descricao = ' + qt(o.depois.descricao + (o.depois.critico ? ' [CRITICO]' : '')) + ';');
        b.push('  New-ADGroup -Name ' + qt(alvo) + ' -GroupCategory Security -GroupScope ' +
          qt(o.depois.escopo === 'Domain Local' ? 'DomainLocal' : 'Global') +
          ' -Path $RaizGrupos -Description $descricao -Server $Servidor');
        b.push('  Write-AuditEvent -Tipo "GrupoCriado" -Alvo ' + qt(alvo) + ' -Detalhe $descricao');
        b.push('}');
        break;
      case 'ajustarGrupo':
        b.push('Set-ADGroup -Identity ' + qt(alvo) + ' -Server $Servidor ' +
          (o.depois.descricao !== undefined ? '-Description ' + qt(o.depois.descricao) : '-Replace @{ adminDescription = \'Ajustado por plano \' + $AssinaturaPlano }') +
          ' -Confirm:$false');
        break;
      case 'excluirGrupo':
        b.push('Get-ADGroupMember -Identity ' + qt(alvo) + ' -Server $Servidor -Recursive |');
        b.push('  ForEach-Object { Remove-ADGroupMember -Identity ' + qt(alvo) + ' -Members $_ -Confirm:$false -Server $Servidor }');
        b.push('Remove-ADGroup -Identity ' + qt(alvo) + ' -Server $Servidor -Confirm:$false');
        b.push('Write-AuditEvent -Tipo "GrupoExcluido" -Alvo ' + qt(alvo) + ' -Detalhe ' + qt(o.antes.membros + ' membros revogados'));
        break;
      case 'criarUsuario':
        b.push('if (-not (Get-ADUser -Filter "SamAccountName -eq ' + sq(alvo) + '" -Server $Servidor -ErrorAction SilentlyContinue)) {');
        b.push('  $senha = Read-Host -AsSecureString -Prompt ("Senha inicial de {0}" -f ' + qt(alvo) + ')');
        b.push('  New-ADUser -SamAccountName ' + qt(alvo) + ' -Name ' + qt(o.depois.nome) +
          ' -UserPrincipalName (' + qt(alvo) + ' + \'@\' + $Dominio) -Path ' + qt(o.depois.ou) +
          ' -AccountPassword $senha -ChangePasswordAtLogon $true -Enabled ' + qt(o.depois.ativo) + ' -Server $Servidor');
        (o.depois.grupos || []).forEach(function (g) {
          b.push('  Add-ADGroupMember -Identity ' + qt(g) + ' -Members ' + qt(alvo) + ' -Server $Servidor');
        });
        b.push('  Write-AuditEvent -Tipo "Onboard" -Alvo ' + qt(alvo) + ' -Detalhe ' + qt(o.depois.ou));
        b.push('}');
        break;
      case 'ajustarUsuario':
        b.push('Set-ADUser -Identity ' + qt(alvo) + ' -Server $Servidor ' +
          (o.depois.setor !== undefined ? '-Department ' + qt(o.depois.setor) + ' ' : '') +
          (o.depois.nome !== undefined ? '-DisplayName ' + qt(o.depois.nome) : '-Replace @{ description = \'Ajustado por plano \' + $AssinaturaPlano }') +
          ' -Confirm:$false');
        b.push('Write-AuditEvent -Tipo "AjusteConta" -Alvo ' + qt(alvo) + ' -Detalhe ' + qt(Object.keys(o.depois).join('+')));
        break;
      case 'ativarUsuario':
        b.push('Enable-ADAccount -Identity ' + qt(alvo) + ' -Server $Servidor');
        b.push('Write-AuditEvent -Tipo "Reativacao" -Alvo ' + qt(alvo));
        break;
      case 'desativarUsuario':
        b.push('$alvo = Get-ADUser -Identity ' + qt(alvo) + ' -Server $Servidor -Properties MemberOf');
        b.push('Get-ADPrincipalGroupMembership -Identity $alvo -Server $Servidor |');
        b.push('  Where-Object { $_.Name -ne \'Domain Users\' } |');
        b.push('  ForEach-Object {');
        b.push('    $revogados += @($_.Name)');
        b.push('    Remove-ADGroupMember -Identity $_ -Members $alvo -Confirm:$false -Server $Servidor');
        b.push('  }');
        b.push('Disable-ADAccount -Identity ' + qt(alvo) + ' -Server $Servidor');
        b.push('Write-AuditEvent -Tipo "Offboard" -Alvo ' + qt(alvo) + ' -Detalhe ($revogados -join \',\')');
        break;
      case 'moverOU':
        b.push('$obj = Get-ADObject -Filter "SamAccountName -eq ' + sq(alvo) + '" -Server $Servidor');
        b.push('if ($obj.DistinguishedName -notlike \'*,' + rdnDe(o.depois.ou).replace(/'/g, "''") + ',*\') {');
        b.push('  Move-ADObject -Identity $obj -TargetPath ' + qt(o.depois.ou) + ' -Server $Servidor');
        b.push('  Write-AuditEvent -Tipo "MoverOU" -Alvo ' + qt(alvo) + ' -Detalhe ' + qt(o.depois.ou));
        b.push('}');
        break;
      case 'adicionarGrupo':
        b.push('if (-not (Get-ADGroupMember -Identity ' + qt(alvo) + ' -Server $Servidor -Recursive |');
        b.push('  Where-Object { $_.SamAccountName -eq ' + sq(o.depois.membro) + ' })) {');
        b.push('  Add-ADGroupMember -Identity ' + qt(alvo) + ' -Members ' + qt(o.depois.membro) + ' -Server $Servidor');
        b.push('  Write-AuditEvent -Tipo "Concessao" -Alvo ' + qt(alvo) + ' -Detalhe ' + qt(o.depois.membro));
        b.push('}');
        break;
      case 'removerGrupo':
        b.push('if (Get-ADGroupMember -Identity ' + qt(alvo) + ' -Server $Servidor |');
        b.push('  Where-Object { $_.SamAccountName -eq ' + sq(o.depois.membro) + ' }) {');
        b.push('  Remove-ADGroupMember -Identity ' + qt(alvo) + ' -Members ' + qt(o.depois.membro) + ' -Server $Servidor -Confirm:$false');
        b.push('  Write-AuditEvent -Tipo "Revogacao" -Alvo ' + qt(alvo) + ' -Detalhe ' + qt(o.depois.membro));
        b.push('}');
        break;
    }
    return b.join('\n');
  }

  function cabecalho(r, opts) {
    return [
      '<#',
      '  Consolidar-Identidade.ps1',
      '  Gerado pelo Console de Automação de Identidade em ' + U.dataHora(U.agoraISO()) + ' · operador ' + (opts.ator || 'operador'),
      '  Plano: ' + r.total + ' operações (' + r.assinaveis + ' executáveis) · risco alto ' + r.porRisco.alto + ' · alvos críticos ' + r.emGruposCriticos,
      '  Assinatura do plano: ' + r.assinatura,
      '',
      '  Como usar:',
      '    .\\Consolidar-Identidade.ps1 -WhatIf     # pré-visualização, nenhuma escrita',
      '    .\\Consolidar-Identidade.ps1             # aplica e grava o diário de reversão',
      '    .\\Consolidar-Identidade.ps1 -Reverter -Diario journal\\' + r.assinatura + '.json',
      '#>'
    ];
  }

  function corpo(r) {
    return [
      '[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = \'High\')]',
      'param(',
      '  [string]$Servidor = \'dc01.contoso.local\',',
      '  [string]$Dominio = \'contoso.local\',',
      '  [string]$RaizGrupos = $null,',
      '  [switch]$Reverter,',
      '  [string]$Diario = \'\'',
      ')',
      '',
      'Set-StrictMode -Version Latest',
      '$ErrorActionPreference = \'Stop\'',
      'Import-Module ActiveDirectory -ErrorAction Stop',
      '',
      '$AssinaturaPlano = \'' + r.assinatura + '\'',
      '$Raiz = $PSScriptRoot',
      'if (-not $Raiz) { $Raiz = (Get-Location).Path }',
      'foreach ($sub in \'auditoria\', \'journal\', \'transcripts\') {',
      '  New-Item -ItemType Directory -Force -Path (Join-Path $Raiz $sub) | Out-Null',
      '}',
      '$RotaAuditoria = Join-Path $Raiz \'auditoria\\identidade.csv\'',
      '$Inicio = Get-Date',
      'Start-Transcript -Path (Join-Path $Raiz (\'transcripts\\{0}-{1}.log\' -f $AssinaturaPlano, $Inicio.ToString(\'yyyyMMddHHmmss\'))) -Append',
      '',
      'if (-not $RaizGrupos) { $RaizGrupos = (Get-ADRootDSE -Server $Servidor).defaultNamingContext }',
      '$revogados = @()',
      '',
      'function Write-AuditEvent {',
      '  param([string]$Tipo, [string]$Alvo, [string]$Detalhe = \'\')',
      '  [pscustomobject]@{',
      '    DataHora = (Get-Date).ToString(\'o\')',
      '    Tipo     = $Tipo',
      '    Alvo     = $Alvo',
      '    Detalhe  = $Detalhe',
      '    Plano    = $AssinaturaPlano',
      '    Executor = (\'{0}\\{1}\' -f $env:USERDOMAIN, $env:USERNAME)',
      '  } | Export-Csv -Path $RotaAuditoria -NoTypeInformation -Append -Encoding utf8',
      '}',
      '',
      'function Invoke-Revert {',
      '  param([object[]]$Entradas)',
      '  foreach ($e in ($Entradas | Reverse)) {',
      '    switch ($e.Tipo) {',
      '      \'desativarUsuario\' {',
      '        Enable-ADAccount -Identity $e.Alvo -Server $Servidor',
      '        foreach ($g in @($e.Antes.grupos)) { Add-ADGroupMember -Identity $g -Members $e.Alvo -Server $Servidor }',
      '      }',
      '      \'adicionarGrupo\' { Remove-ADGroupMember -Identity $e.Alvo -Members $e.Membro -Confirm:$false -Server $Servidor }',
      '      \'removerGrupo\'   { Add-ADGroupMember -Identity $e.Alvo -Members $e.Membro -Server $Servidor }',
      '      \'moverOU\'        { Move-ADObject -Identity (Get-ADUser -Identity $e.Alvo -Server $Servidor) -TargetPath $e.Antes.ou -Server $Servidor }',
      '      \'ajustarUsuario\' { Set-ADUser -Identity $e.Alvo -Server $Servidor -Department $e.Antes.setor -DisplayName $e.Antes.nome -Confirm:$false }',
      '      \'excluirGrupo\'   { Write-Warning ("Grupo {0} não tem reversão automática: recrie pelo estado desejado." -f $e.Alvo) }',
      '    }',
      '    Write-AuditEvent -Tipo \'Reversao\' -Alvo $e.Alvo -Detalhe $e.Tipo',
      '  }',
      '}',
      '',
      'if ($Reverter) {',
      '  if (-not $Diario) { throw \'Para -Reverter informe -Diario com o caminho do journal do plano.\' }',
      '  Invoke-Revert -Entradas @((Get-Content $Diario -Raw | ConvertFrom-Json))',
      '  Stop-Transcript',
      '  return',
      '}',
      '',
      '$Journal = [System.Collections.Generic.List[object]]::new()'
    ];
  }

  function gerarPowerShell(ops, opts) {
    opts = opts || {};
    var r = resumo(ops);
    var l = cabecalho(r, opts).concat(corpo(r), ['try {']);
    ops.forEach(function (o) {
      if (o.bloqueado) {
        l.push('  Write-Warning ' + qt(o.tipo + ' ' + o.alvo + ' — ' + o.detalhe));
        l.push('');
        return;
      }
      l.push('  # ' + o.cmdlets.join(', '));
      l.push('  if ($PSCmdlet.ShouldProcess(' + qt(o.alvo) + ', ' + qt(o.tipo) + ')) {');
      blocoPowerShell(o).split('\n').forEach(function (linha) { l.push('    ' + linha); });
      l.push('    $Journal.Add([pscustomobject]@{ Tipo = ' + qt(o.tipo) + '; Alvo = ' + qt(o.alvo) +
        '; Membro = ' + qt(o.depois && o.depois.membro ? o.depois.membro : null) +
        '; Antes = (' + qt(o.antes === undefined ? null : o.antes) + ') })');
      l.push('  }');
      l.push('');
    });
    l = l.concat([
      '  $Journal | ConvertTo-Json -Depth 5 |',
      '    Set-Content -Path (Join-Path $Raiz (\'journal\\{0}.json\' -f $AssinaturaPlano)) -Encoding utf8',
      '} catch {',
      '  Write-Error (\'Falha na consolidação: {0}\' -f $_.Exception.Message)',
      '  if ($Journal.Count) { Invoke-Revert -Entradas @($Journal) }',
      '  throw',
      '} finally {',
      '  Write-Output (\'Duração {0:N1}s · {1} operações registradas · plano {2}\' -f ((Get-Date) - $Inicio).TotalSeconds, $Journal.Count, $AssinaturaPlano)',
      '  Stop-Transcript',
      '}',
      ''
    ]);
    return l.join('\r\n');
  }

  function gerarReversao(ops) {
    var l = [
      '# Reverter-Plano.ps1 — reaplica o estado anterior na ordem inversa do diário',
      '$Diario = \'journal\\' + (resumo(ops).assinatura) + '.json\'',
      'if (-not (Test-Path $Diario)) { throw "Diário não encontrado em $Diario" }',
      'Import-Module ActiveDirectory -ErrorAction Stop',
      '$Entradas = Get-Content $Diario -Raw | ConvertFrom-Json',
      'foreach ($e in ($Entradas | Reverse)) {',
      '  switch ($e.Tipo) {',
      '    \'desativarUsuario\' { Enable-ADAccount -Identity $e.Alvo; @($e.Antes.grupos) | ForEach-Object { Add-ADGroupMember -Identity $_ -Members $e.Alvo } }',
      '    \'adicionarGrupo\'   { Remove-ADGroupMember -Identity $e.Alvo -Members $e.Membro -Confirm:$false }',
      '    \'removerGrupo\'     { Add-ADGroupMember -Identity $e.Alvo -Members $e.Membro }',
      '    \'moverOU\'          { Move-ADObject -Identity (Get-ADUser -Identity $e.Alvo) -TargetPath $e.Antes.ou }',
      '    \'ajustarUsuario\'   { Set-ADUser -Identity $e.Alvo -Department $e.Antes.setor -DisplayName $e.Antes.nome -Confirm:$false }',
      '    \'excluirGrupo\'     { Write-Warning ("Recrie {0} pelo estado desejado — exclusão não tem reversão automática." -f $e.Alvo) }',
      '  }',
      '  Write-Output ("Revertido {0} :: {1}" -f $e.Tipo, $e.Alvo)',
      '}'
    ];
    return l.join('\r\n');
  }

  var EXEMPLO = [
    '# estado-desejado — identidade declarativa do domínio contoso.local',
    '# Declarar é o contrato: o console calcula o diff contra o diretório e gera o PowerShell.',
    '',
    'grupo GG_FINANCEIRO_APROVAR',
    '  escopo = Global',
    '  critico = true',
    '  descricao = Aprovação de títulos a pagar',
    '',
    'grupo GG_OPERACOES_LOJA',
    '  escopo = Domain Local',
    '  critico = false',
    '  descricao = Caixa e frente de loja das filiais',
    '',
    'grupo GG_TI_HISTORICO_LOG',
    '  escopo = Global',
    '  critico = false',
    '  descricao = Leitura de log de aplicação por 90 dias',
    '',
    'usuario ana.melo',
    '  nome = Ana Beatriz Melo',
    '  ou = OU=Financeiro,OU=Matriz,DC=contoso,DC=local',
    '  ativo = true',
    '  grupos = GG_FINANCEIRO_APROVAR, GG_CONHAS_CONSULTA, GG_RELATORIOS_GESTAO',
    '',
    'usuario joao.aleixo',
    '  nome = Joao Pedro Aleixo',
    '  ou = OU=Operacoes,OU=Filial,DC=contoso,DC=local',
    '  setor = Operacoes',
    '  ativo = true',
    '  grupos = GG_OPERACOES_LOJA, GG_TI_HISTORICO_LOG',
    '',
    'usuario marina.couto',
    '  nome = Marina Couto',
    '  ou = OU=Sistemas,OU=TI,DC=contoso,DC=local',
    '  setor = TI',
    '  ativo = true',
    '  grupos = GG_TI_MONITORACAO',
    '',
    'remover usuario bruno.tavares',
    'remover usuario zaira.fontes',
    'remover grupo GG_TI_HISTORICO_TEMP'
  ].join('\n');

  global.IaC = {
    parse: parse,
    plan: plan,
    resumo: resumo,
    cmdlets: cmdlets,
    risco: function (tipo) { return RISCO[tipo] || 'medio'; },
    gerarPowerShell: gerarPowerShell,
    gerarReversao: gerarReversao,
    EXEMPLO: EXEMPLO
  };
})(window);
