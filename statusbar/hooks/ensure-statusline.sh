#!/usr/bin/env bash
# Ativa a statusbar sozinha: copia o script para um caminho estável (sem versão)
# e aponta o statusLine do settings.json para ele. Roda a cada início de sessão.
#
# Na primeira ativação assume o lugar de um statusLine de outra ferramenta, guardando
# o anterior em statusline-anterior.json. Depois disso, se o usuário voltar a trocar,
# a escolha dele é respeitada (marcador .ativada).
#
#   --forcar     assume o statusLine mesmo que o usuário tenha trocado depois
#   --restaurar  devolve o statusLine guardado no backup

ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
DEST_DIR="$HOME/.claude/statusbar"
DEST="$DEST_DIR/status-bar.sh"
SETTINGS="$HOME/.claude/settings.json"
BACKUP="$DEST_DIR/statusline-anterior.json"
MARK="$DEST_DIR/.ativada"
CMD="bash $DEST"
MODE="${1:-}"

say() { printf '{"systemMessage":"statusbar: %s"}\n' "$1"; }

# grava o settings.json a partir de um filtro jq, sem deixar arquivo pela metade
write_settings() {
  local tmp
  tmp=$(mktemp "${SETTINGS}.XXXXXX") || return 1
  if jq "$@" "$SETTINGS" > "$tmp"; then
    mv "$tmp" "$SETTINGS"
  else
    rm -f "$tmp"; return 1
  fi
}

mkdir -p "$DEST_DIR" && cp "$ROOT/status-bar.sh" "$DEST" && chmod +x "$DEST" || exit 0

if ! command -v jq >/dev/null 2>&1; then
  say "instale o jq (brew install jq / sudo apt install jq) — sem ele a barra aparece vazia."
  exit 0
fi

[ -f "$SETTINGS" ] || echo '{}' > "$SETTINGS"
jq -e . "$SETTINGS" >/dev/null 2>&1 || { say "settings.json inválido; statusLine não foi configurado."; exit 0; }

if [ "$MODE" = "--restaurar" ]; then
  if [ ! -f "$BACKUP" ]; then say "não há statusLine anterior guardado."; exit 0; fi
  write_settings --slurpfile b "$BACKUP" '.statusLine = $b[0]' \
    && say "statusLine anterior restaurado. Reinicie o Claude Code se não mudar."
  touch "$MARK"   # mantém a escolha: o hook não volta a assumir sozinho
  exit 0
fi

cur=$(jq -r '.statusLine.command // empty' "$SETTINGS")
if [ "$cur" = "$CMD" ]; then touch "$MARK"; exit 0; fi

msg="ativada. Se a barra não aparecer, reinicie o Claude Code."
case "$cur" in
  ""|*statusbar*|*status-bar.sh*) ;;
  *)
    # statusLine de outra ferramenta: só assume na primeira ativação (ou com --forcar)
    [ -f "$MARK" ] && [ "$MODE" != "--forcar" ] && exit 0
    jq '.statusLine' "$SETTINGS" > "$BACKUP" || exit 0
    msg="ativada no lugar do statusLine anterior (guardado em ~/.claude/statusbar/statusline-anterior.json; /statusbar-setup restaurar desfaz). Se a barra não aparecer, reinicie o Claude Code."
    ;;
esac

write_settings --arg c "$CMD" '.statusLine = {type:"command", command:$c, padding:0}' \
  && touch "$MARK" && say "$msg"
exit 0
