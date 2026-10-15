#!/usr/bin/env bash
# Ativa a statusbar sozinha: copia o script para um caminho estável (sem versão)
# e aponta o statusLine do settings.json para ele. Roda a cada início de sessão.
# Nunca sobrescreve um statusLine que pertença a outra ferramenta.

ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
DEST_DIR="$HOME/.claude/statusbar"
DEST="$DEST_DIR/status-bar.sh"
SETTINGS="$HOME/.claude/settings.json"
CMD="bash $DEST"

say() { printf '{"systemMessage":"statusbar: %s"}\n' "$1"; }

mkdir -p "$DEST_DIR" && cp "$ROOT/status-bar.sh" "$DEST" && chmod +x "$DEST" || exit 0

if ! command -v jq >/dev/null 2>&1; then
  say "instale o jq (brew install jq / sudo apt install jq) — sem ele a barra aparece vazia."
  exit 0
fi

[ -f "$SETTINGS" ] || echo '{}' > "$SETTINGS"
jq -e . "$SETTINGS" >/dev/null 2>&1 || { say "settings.json inválido; statusLine não foi configurado."; exit 0; }

cur=$(jq -r '.statusLine.command // empty' "$SETTINGS")
[ "$cur" = "$CMD" ] && exit 0

case "$cur" in
  ""|*statusbar*|*status-bar.sh*) ;;
  *) exit 0 ;;   # statusLine de outra ferramenta: respeita
esac

tmp=$(mktemp "${SETTINGS}.XXXXXX") || exit 0
if jq --arg c "$CMD" '.statusLine = {type:"command", command:$c, padding:0}' "$SETTINGS" > "$tmp"; then
  mv "$tmp" "$SETTINGS"
  say "ativada. Ela aparece na próxima atualização da tela ou ao reiniciar a sessão."
else
  rm -f "$tmp"
fi
exit 0
