# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## O que é

Statusline customizada do Claude Code. Um único script Bash (`status-bar.sh`) que o harness
executa a cada atualização de estado: recebe um JSON no **stdin** e escreve no **stdout** até
duas linhas com escapes ANSI.

Não há build, testes, lint nem dependências instaláveis. O repositório é publicado em
<https://github.com/magacho/claude-code-statusbar> (MIT).
`README.md` é a documentação de usuário (instalação, leitura da barra, troubleshooting); este
arquivo cobre o que é preciso saber para **alterar** o script.

## Comandos

**Testar com payload sintético** — o script só lê stdin, então nunca é preciso um harness rodando:

```bash
echo '{"session_id":"test","model":{"display_name":"Opus 5"},
 "workspace":{"current_dir":"'$PWD'"},"context_window":{"used_percentage":42.7},
 "rate_limits":{"five_hour":{"used_percentage":12,"resets_at":'$(( $(date +%s)+7200 ))'},
                "seven_day":{"used_percentage":88,"resets_at":'$(( $(date +%s)+200000 ))'}},
 "effort":{"level":"high"},"thinking":{"enabled":true},"fast_mode":false,
 "output_style":{"name":"default"}}' | bash status-bar.sh
```

Casos que valem testar junto a qualquer alteração: `echo '{}'` (payload mínimo — tudo precisa
degradar sem erro), um `current_dir` fora de repositório git, e a saída sem cores
(` | sed 's/\x1b\[[0-9;]*m//g'`) para conferir alinhamento e separadores.

**Limpar os caches** antes de testar mudanças em git ou na conta:

```bash
rm -f /tmp/statusline-git-* /tmp/statusline-acct-*
```

**Publicar a alteração** — depende de como o usuário instalou (ver `README.md`). Se o
`statusLine` do `settings.json` aponta para `~/.claude/statusline-command.sh` em vez do caminho
deste repositório, editar aqui não muda nada até copiar:

```bash
cp status-bar.sh ~/.claude/statusline-command.sh
```

## Contrato de dados (o ponto mais importante)

O payload do harness **não contém** vários dados que a linha mostra. O script os reconstrói:

- **Org e plano** não vêm no stdin. São lidos de `~/.claude.json` (`.oauthAccount`) e traduzidos
  por `plan_label()` / `org_label()` — `default_claude_max_5x` → `Max 5x`, `default_raven` → `Standard`, `claude_team` → `Team`.
  Se aparecer um tier novo, o fallback imprime o valor cru sem o prefixo `default_claude_`.
- **Modo Plan / permissões não é exposto** pelo harness. O campo "modo" é um *proxy* honesto
  montado de `fast_mode` + `thinking.enabled` + `effort.level` + `output_style.name`.
  Não tente fazê-lo refletir o modo de permissão real — o dado não existe.
- **Só existem duas janelas de rate limit**: `five_hour` e `seven_day`. Não há janela diária.
- **Identidade git** vem de `git config` (repo primeiro, depois `--global`), não do payload.

Acesso ao JSON é sempre via `j '<filtro jq>'`, que silencia erros e devolve vazio — toda leitura
de campo precisa do próprio `// empty` ou `// default`.

Sem `jq` no `PATH` o script não falha: devolve exit 0 e uma linha quase vazia. É o modo de falha
mais provável em uma máquina nova, e é silencioso — vale suspeitar dele primeiro.

## Caches

Dois arquivos em `/tmp`, chaveados por `session_id`, evitam rodar `git` e `jq` a cada refresh:

| arquivo | TTL | conteúdo |
|---|---|---|
| `/tmp/statusline-git-$sid` | 5 s | branch + `*` de dirty |
| `/tmp/statusline-acct-$sid` | 300 s | `user\|email\|org\|orgtype\|plan` (pipe-separated, lido com `IFS='\|' read`) |

Consequência prática: trocar de branch reflete em ~5 s; trocar `user.email` ou de conta Claude leva
até 5 min. Se um campo novo for adicionado ao cache de conta, o `read` e o `printf` da linha 92
precisam mudar juntos — a ordem dos campos é posicional.

## Layout da saída

- **Linha 1:** `📁 dir │ ⎇ branch │ modelo │ modo │ 💳 plano`
- **Linha 2:** `barra de contexto │ 5h % ⟳ reset │ 7d % ⟳ reset │ 🏢 org (tipo) │ 👤 nome <email>`

Segmentos opcionais (dir, branch, org, plano, identidade) são omitidos junto com seu separador
quando vazios — seguir esse padrão de concatenação condicional ao adicionar segmentos novos.

O `printf` final **não emite newline** ao fim da segunda linha; o harness cuida disso.

Cores de rate limit: verde < 50 %, amarelo 50–79 %, vermelho ≥ 80 % (`win()`).
Cores da barra de contexto: azul < 50 %, amarelo 50–70 %, vermelho ≥ 71 % (`ctxbar()`).

## Ao alterar o script

- A statusline roda a cada refresh: nada de chamada de rede, e qualquer comando externo novo
  precisa de cache, como já acontece com `git`.
- Degradar em silêncio é intencional — um segmento sem dado desaparece, não vira erro na barra.
  Manter esse comportamento em segmentos novos.
- Saída limitada a duas linhas; texto além disso é cortado pelo harness.
- Mudanças visíveis ao usuário (segmento novo, cor, limiar, requisito de sistema) pedem
  atualização das tabelas correspondentes no `README.md`.

## Dependências de ambiente

`jq`, `awk`, `git` e `stat`: tenta `stat -c %Y` (GNU) e cai para `stat -f %m` (macOS/BSD).
A ordem importa: no GNU, `stat -f` é o modo *filesystem* — imprime um bloco de texto no stdout
antes de falhar, e esse texto quebra a aritmética. No BSD, `-c` falha sem imprimir nada.
Usa arrays e `((...))`, compatíveis com o Bash 3.2 do macOS; o shebang é `bash`, não `sh`.
Evite `${var/#$HOME/\~}`: no Bash 3.2 o `\~` sai literal — use `case` + `${var#"$HOME"}`.
