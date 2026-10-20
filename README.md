# Console de Automação de Identidade

Demonstração interativa de *Active Directory como código*: um estado desejado declarativo, detecção de derivação, plano idempotente assinado, PowerShell real gerado com `-WhatIf`, fila de requisições com segregação de funções e trilha de auditoria acorrentada.

- Demo: https://vitorvieira42.github.io/console-automacao-identidade/
- Apresentação em slides: [`slides/console-automacao-identidade.pptx`](slides/console-automacao-identidade.pptx)

É um site estático puro: sem build, sem backend, sem `npm install`. Toda a lógica roda no navegador e o estado persiste em `localStorage`. O diretório é **simulado com dados sintéticos da Contoso** — nenhuma conta real é lida ou alterada.

## Como abrir

Baixe o repositório e abra `index.html` no navegador, ou sirva a pasta:

```bash
# opção 1: abrir direto (funciona por file://)
start index.html

# opção 2: servir localmente
python -m http.server 8080
```

## As sete telas

| Tela | O que faz |
| --- | --- |
| Painel | KPIs do diretório, derivação por risco e a diferença entre o declarado e o real |
| Diretório | Inventário das contas e grupos simulados, com filtros por OU, setor e criticidade |
| Estado desejado | Editor da DSL com validação linha a linha e erros apontando a causa |
| Plano & execução | Diff convertido em operações ordenadas, com dry-run, aplicação e reversão |
| Script PowerShell | O `.ps1` gerado, pronto para baixar e rodar num controlador de domínio |
| Governança | Conformidade por regra, menor privilégio e conflitos de segregação de funções |
| Auditoria | Log append-only com cadeia de hash e simulação de adulteração |

## O pipeline

```
declarar  →  validar  →  derivar  →  planejar  →  assinar  →  aprovar  →  dry-run  →  aplicar  →  reverter
                                                                                              ↓
                                                                                    auditoria acorrentada
```

1. **Declarar.** O estado desejado é escrito numa DSL própria (grupos, membros, OUs, setores), não executado comando por comando.
2. **Validar.** Cada linha passa por checagem de sintaxe, referência existente, duplicidade e criticidade antes de gerar qualquer plano.
3. **Derivar.** O diff entre declarado e diretório real produz operações tipadas.
4. **Planejar.** As operações ganham ordem determinística e risco (`baixo`, `médio`, `alto`) por tipo.
5. **Assinar.** Um hash FNV-1a em duas passadas sobre o plano identifica exatamente aquele conjunto de mudanças.
6. **Aprovar.** A aplicação só destrava depois de aprovação de uma pessoa diferente do solicitante.
7. **Executar.** `-WhatIf` roda primeiro; o apply grava o diário de reversão; a falha no meio aciona `Invoke-Revert`.

## Números da demonstração

| Métrica | Valor |
| --- | --- |
| Inventário simulado | 36 contas · 10 grupos · 5 OUs · 29 ativas |
| Derivação no snapshot inicial | 11 operações no plano parcial · 36 no recursivo (27 de risco alto) |
| Assinatura do plano | `59e4a17444f89b82` |
| PowerShell gerado | ~210 linhas com `SupportsShouldProcess`, `ConfirmImpact = 'High'`, transcript e diário |
| Regras de governança | 8 regras · 2 pares de segregação de funções |
| Conformidade do snapshot | 59,2% com 14 achados em 8 contas |
| Código autoral | 11 arquivos · 4.343 linhas |

Os números são determinísticos: a seed do gerador de dados é fixa, então o mesmo snapshot sempre produz a mesma derivação e a mesma assinatura.

## Decisões técnicas

- **Sem framework.** IIFEs com escopo global por módulo (`U`, `AD`, `IaC`, `Exec`, `Governanca`, `Store`, `Charts`, `UI`, `App`) carregados por `<script>` clássico. Isso mantém o `index.html` funcional por `file://` e hospedável em qualquer lugar estático.
- **Funções puras sobre o estado.** Toda tela deriva do mesmo `Store.state`; nenhuma view guarda cópia da verdade.
- **Idempotência antes de performance.** Cada bloco do script gerado checa o estado atual (`Get-ADUser -Filter`, `Get-ADGroupMember -Recursive`) antes de emitir um `New-`, `Set-` ou `Add-`.
- **Reversão como caminho obrigatório, não opcional.** O diário é gravado durante a aplicação, com o estado anterior de cada alvo; sem diário não existe reversão.
- **Auditoria append-only.** Cada evento guarda o hash do anterior. `validarCadeia()` recalcula tudo e devolve o índice do primeiro elo rompido — o botão *Simular adulteração* existe para provar que a detecção funciona.
- **Dependência vendorizada.** Chart.js 4.4.4 está em `vendor/`, sem CDN, para a demo funcionar offline.

## Estrutura

```
index.html            shell da aplicação e as sete views
styles.css            paleta, tema claro/escuro e componentes
src/utils.js          helpers de formatação, hash e id
src/diretorio.js      gerador do diretório simulado e consultas
src/iac.js            parser da DSL, validação e diff
src/execucao.js       ordenação do plano, risco e geração de PowerShell
src/governanca.js     regras de conformidade e segregação de funções
src/store.js          estado, requisições, auditoria e persistência
src/charts.js         gráficos
src/ui.js             render das sete telas e modais
src/app.js            bootstrap, navegação e tema
vendor/               Chart.js 4.4.4
```

## Limitações conhecidas

- O diretório é um modelo em memória, não uma conexão LDAP: o script gerado é a parte executável de verdade.
- A persistência é local ao navegador; limpar os dados recomeça do snapshot inicial.
- Não há sincronização com um controlador de domínio. O próximo passo planejado é rodar o `.ps1` gerado contra um DC de laboratório e comparar o transcript com o plano previsto, além de incluir `PSScriptAnalyzer` como portão de CI.
