# claude-code-statusbar

Statusline customizada para o [Claude Code](https://claude.com/claude-code), em duas linhas.
Mostra onde você está, com qual modelo, em que conta — e quanto ainda sobra de contexto e de
franquia antes do próximo reset.

```
📁 ~/Workspace/minha-api │ ⎇ feat/checkout* │ Opus 5 │ 🧠 think effort:high │ 💳 Max 5x
▰▰▰▰▱▱▱▱▱▱ 42% │ 5h 12% ⟳ 2h0m │ 7d 88% ⟳ 2d7h │ 🏢 Acme (Team) │ 👤 Ana Souza <ana@exemplo.com>
```

Em cores: o `*` na branch indica alterações não commitadas; as porcentagens de janela ficam
verdes até 49 %, amarelas de 50 % a 79 % e vermelhas a partir de 80 %; a barra de contexto fica
azul até 49 %, amarela de 50 % a 70 % e vermelha a partir de 71 %.

## Requisitos

- `bash` 3.2 ou superior (o bash padrão do macOS serve)
- `jq` — **sem ele a statusline aparece quase vazia**, sem erro visível
- `git` e `awk`
- `stat` — funciona tanto o do macOS/BSD (`-f %m`) quanto o do GNU coreutils (`-c %Y`)

Conferir de uma vez:

```bash
bash --version | head -1 && command -v jq git awk stat
```

## Instalação

O Claude Code chama um comando a cada atualização da statusline. Basta apontar esse comando
para o `status-bar.sh` deste repositório.

### Opção 1 — usar direto do projeto (recomendado)

Nada é copiado: o Claude Code executa o arquivo no lugar onde ele está, então um `git pull` ou
uma edição local já valem na próxima sessão.

Edite `~/.claude/settings.json` e acrescente (trocando o caminho pelo seu clone):

```json
{
  "statusLine": {
    "type": "command",
    "command": "bash /caminho/para/claude-code-statusbar/status-bar.sh"
  }
}
```

### Opção 2 — copiar para `~/.claude`

Se preferir que a statusline não dependa da pasta do clone:

```bash
cp status-bar.sh ~/.claude/statusline-command.sh
```

E aponte o `command` para `bash ~/.claude/statusline-command.sh`. Lembre de repetir o `cp` a cada
alteração — é o passo que costuma ser esquecido quando "a mudança não apareceu".

### Opção 3 — só em um projeto

A mesma chave `statusLine` no `.claude/settings.json` **de um repositório** vale apenas para as
sessões abertas dentro dele, e tem precedência sobre a configuração global.

Em qualquer opção, abra uma nova sessão do Claude Code para ver o resultado.

## Lendo a statusline

### Linha 1 — contexto de trabalho

| Segmento | Significado |
|---|---|
| `📁 ~/Workspace/minha-api` | Diretório da sessão, com `~` no lugar do seu `$HOME` |
| `⎇ feat/checkout*` | Branch atual. O `*` aparece quando há alterações não commitadas (working tree ou stage). Fora de um repositório git, o segmento some |
| `Opus 5` | Modelo em uso |
| `🧠 think effort:high` | Modo ativo — veja abaixo |
| `💳 Max 5x` | Plano da conta (`Pro`, `Max 5x`, `Max 20x`; `Standard` para assento Team/Enterprise sem tier Max) |

O campo **modo** combina o que estiver ligado no momento: `⚡ fast` (fast mode), `🧠 think`
(pensamento estendido), `effort:<nível>` e o nome do output style quando não for o padrão.
Com nada ligado, mostra `—`.

> O modo de permissão (Plan, accept edits, bypass) **não** aparece aqui: o Claude Code não
> informa esse dado para a statusline.

### Linha 2 — consumo

| Segmento | Significado |
|---|---|
| `▰▰▰▰▱▱▱▱▱▱ 42%` | Quanto da janela de contexto da sessão já foi usado |
| `5h 12% ⟳ 2h0m` | Franquia da sessão de 5 horas e quanto falta para zerar |
| `7d 88% ⟳ 2d7h` | Franquia semanal e quanto falta para zerar |
| `🏢 Acme (Team)` | Organização da conta Claude e seu tipo (`Team`, `Enterprise`) |
| `👤 Nome <email>` | Identidade do `git config` — a do repositório, ou a global |

O `👤` é o alerta barato contra commitar com o e-mail errado ao alternar entre repositórios
pessoais e corporativos.

Existem apenas essas duas janelas de franquia; não há uma contagem diária separada.
Um `—` no lugar da porcentagem significa que o Claude Code não enviou o dado naquele refresh.

## Personalização

Tudo mora em `status-bar.sh`, sem dependências. Os pontos mais mexidos:

- **Mover ou remover um segmento** — cada segmento é uma linha de concatenação no bloco
  `# ---------- montagem ----------` (1ª linha, variável `out`) ou no bloco da 2ª linha
  (variável `line2`); mover um é trocá-lo de bloco. Cada segmento já se omite sozinho quando
  o dado está vazio.
- **Cores** — as variáveis `FG_*` no topo do arquivo são códigos ANSI.
- **Limiares de alerta** — os valores `80` e `50` na função `win()` (janelas) e `71` e `50` na
  função `ctxbar()` (contexto).
- **Largura da barra de contexto** — `width=10` na função `ctxbar()`.

Depois de editar, teste sem abrir uma sessão nova:

```bash
echo '{"session_id":"test","model":{"display_name":"Opus 5"},
 "workspace":{"current_dir":"'$PWD'"},"context_window":{"used_percentage":42.7},
 "rate_limits":{"five_hour":{"used_percentage":12,"resets_at":'$(( $(date +%s)+7200 ))'},
                "seven_day":{"used_percentage":88,"resets_at":'$(( $(date +%s)+200000 ))'}},
 "effort":{"level":"high"},"thinking":{"enabled":true},"fast_mode":false,
 "output_style":{"name":"default"}}' | bash status-bar.sh
```

## Solução de problemas

**A statusline aparece quase vazia, só com a barra de contexto zerada.**
É `jq` faltando no `PATH`. O script não reclama — apenas devolve tudo em branco. Instale com
`sudo apt install jq` (Debian/Ubuntu) ou `brew install jq` (macOS).

**Nada aparece.**
Confira se o caminho no `command` existe e se o `settings.json` continua sendo um JSON válido:
`jq . ~/.claude/settings.json`. Um erro de vírgula faz o Claude Code ignorar o arquivo inteiro.

**Editei o script e nada mudou.**
Se instalou pela Opção 2, falta o `cp` para `~/.claude/statusline-command.sh`.

**Troquei de branch e a statusline demorou.**
Normal: o branch tem cache de 5 segundos. Conta, organização, plano e identidade git têm cache de
5 minutos — ao trocar de conta Claude ou mudar `git config user.email`, force a atualização com:

```bash
rm -f /tmp/statusline-git-* /tmp/statusline-acct-*
```

**A organização ou o plano aparecem com um nome estranho.**
Esses dois dados vêm de `~/.claude.json`, e um tier novo pode não estar mapeado ainda. O script
imprime o valor cru nesse caso — basta acrescentá-lo em `plan_label()` ou `org_label()`.

## Limitações conhecidas

- **Modo de permissão não é exibido** — o dado não chega à statusline.
- **Contexto e franquias são o que o Claude Code informou** no último refresh, não uma consulta
  ao vivo.

## Como funciona

O Claude Code executa o script a cada atualização, envia um JSON pelo stdin e imprime na tela o
que sair no stdout — as duas primeiras linhas, com escapes ANSI preservados.

Nem tudo que a barra mostra vem desse JSON: organização e plano são lidos de `~/.claude.json`,
a identidade vem do `git config` e o branch de chamadas ao `git`. Para não pagar esse custo a
cada refresh, os resultados ficam em cache em `/tmp`, chaveados pelo id da sessão.

Detalhes de implementação, para quem for alterar o script, estão em
[`CLAUDE.md`](CLAUDE.md).

## Licença

[MIT](LICENSE).
