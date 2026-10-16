# Changelog — statusbar
## 0.3.0
- ativação assume o lugar de um statusLine de outra ferramenta na primeira vez, com backup em ~/.claude/statusbar/statusline-anterior.json; troca posterior do usuário é respeitada
- /statusbar-setup força a ativação; /statusbar-setup restaurar devolve o statusLine anterior
## 0.2.2
- Windows: o diretório mostra só o nome da pasta também quando o caminho vem com contrabarra (C:\Users\...\proj)
## 0.2.1
- docs e mensagem do hook: SessionStart só roda ao iniciar a sessão, /reload-plugins não o dispara; reiniciar o Claude Code
## 0.2.0
- ativação automática via hook SessionStart: copia script para caminho sem versão e configura statusLine; avisa se faltar jq
## 0.1.0
- Base: magacho/claude-code-statusbar @ f31c3fa (MIT), inclui alteração local: mostra só o nome do diretório atual.
