---
description: Reativa a statusbar manualmente (normalmente ela já se ativa sozinha ao iniciar a sessão). Use "restaurar" para voltar ao statusLine anterior.
argument-hint: "[restaurar]"
allowed-tools: Bash
---

A statusbar se ativa sozinha no início da sessão, inclusive no lugar de um `statusLine` de outra ferramenta na primeira vez (o anterior fica em `~/.claude/statusbar/statusline-anterior.json`).

Argumento recebido: `$ARGUMENTS`

- Se o argumento for `restaurar`, devolva o `statusLine` anterior:

  ```bash
  bash "${CLAUDE_PLUGIN_ROOT}/hooks/ensure-statusline.sh" --restaurar
  ```

- Caso contrário, force a ativação agora (assume o lugar mesmo que outro `statusLine` tenha sido configurado depois, guardando-o no backup):

  ```bash
  bash "${CLAUDE_PLUGIN_ROOT}/hooks/ensure-statusline.sh" --forcar
  ```

Repasse ao usuário a mensagem que o comando imprimir. Se não imprimir nada, o `statusLine` já aponta para a statusbar.
