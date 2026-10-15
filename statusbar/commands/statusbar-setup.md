---
description: Reativa a statusbar manualmente (normalmente ela já se ativa sozinha ao iniciar a sessão)
allowed-tools: Bash
---

A statusbar se ativa sozinha no início de cada sessão. Use este comando só para forçar a ativação agora:

```bash
bash "${CLAUDE_PLUGIN_ROOT}/hooks/ensure-statusline.sh"
```

Se o comando não imprimir nada, o `statusLine` já está correto ou pertence a outra ferramenta (o hook não sobrescreve). Nesse caso mostre o valor atual de `statusLine` em `~/.claude/settings.json` e pergunte se o usuário quer substituí-lo.
