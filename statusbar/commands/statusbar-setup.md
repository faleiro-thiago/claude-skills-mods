---
description: Ativa a statusbar apontando o statusLine do settings.json para o script deste plugin
allowed-tools: Read, Edit, Bash
---

Configure o `statusLine` em `~/.claude/settings.json` (preserve todas as outras chaves) com:

```json
"statusLine": {
  "type": "command",
  "command": "bash ${CLAUDE_PLUGIN_ROOT}/status-bar.sh",
  "padding": 0
}
```

Se já existir um `statusLine`, mostre o valor atual e peça confirmação antes de substituir. Ao terminar, avise que a barra aparece na próxima atualização da tela.
