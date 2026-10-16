#!/usr/bin/env bash
# Claude Code statusline — Magacho
# Linha 1:  dir │ branch git │ modelo │ modo(effort/thinking/fast) │ plano
# Linha 2:  contexto │ 5h │ 7d(semanal) │ org │ identidade git
#
# NOTAS sobre a "franquia" do claude.ai:
#   - O harness expõe apenas duas janelas: five_hour (sessão de 5h) e seven_day (semanal).
#     NÃO existe uma janela "diária" separada.
#   - Modo Plan/permissão NÃO é exposto pelo harness. O "modo" aqui é um proxy honesto
#     montado a partir de effort/thinking/fast_mode/output_style.

input=$(cat)

# ---------- helpers ----------
c() { printf '\033[%sm' "$1"; }
RST=$(c 0); DIM=$(c 2)
FG_GREEN=$(c 32); FG_YELLOW=$(c 33); FG_RED=$(c 31)
FG_CYAN=$(c 36); FG_BLUE=$(c 34); FG_MAG=$(c 35); FG_GREY=$(c 90)

j() { printf '%s' "$input" | jq -r "$1" 2>/dev/null; }

# ---------- dados ----------
model=$(j '.model.display_name // "?"')
cwd=$(j '.workspace.current_dir // .cwd // ""')
effort=$(j '.effort.level // empty')
fast=$(j '.fast_mode // false')
thinking=$(j '.thinking.enabled // false')
style=$(j '.output_style.name // "default"')
ctx=$(j '.context_window.used_percentage // empty'); ctx=${ctx%.*}

# só o nome do diretório atual (ex.: /mcp_noc), não o caminho completo.
# No Windows o harness manda C:\Users\...\proj, então corta em / e em \.
dirdisp=""
if [ -n "$cwd" ]; then
  d="${cwd%[/\\]}"            # tira separador final (ex.: C:\proj\)
  base="${d##*[/\\]}"
  case "$base" in
    "")  dirdisp="/" ;;          # raiz Unix
    *:)  dirdisp="${base}\\" ;;  # raiz de drive (C:\)
    *)   dirdisp="/${base}" ;;
  esac
fi

# ---------- branch (git) com cache por sessão ----------
sid=$(j '.session_id // "x"')
cache="/tmp/statusline-git-${sid}"
branch=""
if [ -d "$cwd" ]; then
  if [ -f "$cache" ] && [ $(( $(date +%s) - $(stat -c %Y "$cache" 2>/dev/null || stat -f %m "$cache" 2>/dev/null || echo 0) )) -lt 5 ]; then
    branch=$(cat "$cache")
  else
    b=$(git -C "$cwd" symbolic-ref --short HEAD 2>/dev/null || git -C "$cwd" rev-parse --short HEAD 2>/dev/null)
    if [ -n "$b" ]; then
      dirty=""
      git -C "$cwd" diff --quiet 2>/dev/null && git -C "$cwd" diff --cached --quiet 2>/dev/null || dirty="*"
      branch="${b}${dirty}"
    fi
    printf '%s' "$branch" > "$cache"
  fi
fi

# ---------- identidade (git) + conta Claude (org/plano) com cache por sessão ----------
# Org e plano NÃO vêm no payload do statusline; são lidos de ~/.claude.json (.oauthAccount).
plan_label() {
  case "$1" in
    *max_20x) printf 'Max 20x' ;;
    *max_5x)  printf 'Max 5x'  ;;
    *pro)     printf 'Pro'     ;;
    *raven)   printf 'Standard' ;;  # assento Team/Enterprise sem tier Max próprio
    "")       printf ''        ;;
    *)        printf '%s' "${1#default_claude_}" ;;
  esac
}
org_label() {
  case "$1" in
    claude_team)       printf 'Team' ;;
    claude_enterprise) printf 'Enterprise' ;;
    claude_max|claude_pro) printf '' ;;
    *) printf '%s' "$1" ;;
  esac
}

ucache="/tmp/statusline-acct-${sid}"
guser=""; gmail=""; org=""; orgtype=""; plan=""
if [ -f "$ucache" ] && [ $(( $(date +%s) - $(stat -c %Y "$ucache" 2>/dev/null || stat -f %m "$ucache" 2>/dev/null || echo 0) )) -lt 300 ]; then
  IFS='|' read -r guser gmail org orgtype plan < "$ucache"
else
  if [ -d "$cwd" ]; then
    guser=$(git -C "$cwd" config --get user.name 2>/dev/null)
    gmail=$(git -C "$cwd" config --get user.email 2>/dev/null)
  fi
  [ -z "$guser" ] && guser=$(git config --global --get user.name 2>/dev/null)
  [ -z "$gmail" ] && gmail=$(git config --global --get user.email 2>/dev/null)
  if [ -r "$HOME/.claude.json" ]; then
    IFS='|' read -r org orgtype plan < <(
      jq -r '.oauthAccount // {} | "\(.organizationName // "")|\(.organizationType // "")|\(.userRateLimitTier // "")"' \
        "$HOME/.claude.json" 2>/dev/null
    )
  fi
  orgtype=$(org_label "$orgtype")
  plan=$(plan_label "$plan")
  printf '%s|%s|%s|%s|%s' "$guser" "$gmail" "$org" "$orgtype" "$plan" > "$ucache"
fi

# ---------- modo (proxy) ----------
parts=()
[ "$fast" = "true" ]     && parts+=("⚡ fast")
[ "$thinking" = "true" ] && parts+=("🧠 think")
[ -n "$effort" ]         && parts+=("effort:${effort}")
[ "$style" != "default" ] && parts+=("$style")
if [ ${#parts[@]} -gt 0 ]; then
  mode="${parts[*]}"   # separados por espaço
else
  mode="—"
fi

# ---------- barra de contexto ----------
ctxbar() {
  local pct=$1 width=10 filled empty bar="" i col
  if [ -z "$pct" ]; then printf '%s▱▱▱▱▱▱▱▱▱▱ --%%%s' "$FG_BLUE" "$RST"; return; fi
  if   [ "$pct" -ge 71 ]; then col=$FG_RED
  elif [ "$pct" -ge 50 ]; then col=$FG_YELLOW
  else col=$FG_BLUE; fi
  filled=$(awk -v p="$pct" -v w="$width" 'BEGIN{printf "%d",(p/100)*w}')
  empty=$((width-filled))
  for ((i=0;i<filled;i++)); do bar="${bar}▰"; done
  for ((i=0;i<empty;i++));  do bar="${bar}▱"; done
  printf '%s%s %d%%%s' "$col" "$bar" "$pct" "$RST"
}

# ---------- janela de rate limit ----------
win() {
  local key=$1 label=$2 pct reset now delta col rstr="" h m
  pct=$(j ".rate_limits.${key}.used_percentage // empty"); pct=${pct%.*}
  reset=$(j ".rate_limits.${key}.resets_at // empty")
  if [ -z "$pct" ]; then printf '%s%s —%s' "$DIM" "$label" "$RST"; return; fi
  if   [ "$pct" -ge 80 ]; then col=$FG_RED
  elif [ "$pct" -ge 50 ]; then col=$FG_YELLOW
  else col=$FG_GREEN; fi
  if [ -n "$reset" ]; then
    now=$(date +%s); delta=$((reset-now))
    if [ "$delta" -gt 0 ]; then
      h=$((delta/3600)); m=$(((delta%3600)/60))
      if   [ "$h" -ge 24 ]; then rstr=" ⟳ $((h/24))d$((h%24))h"
      elif [ "$h" -gt 0 ];  then rstr=" ⟳ ${h}h${m}m"
      else                       rstr=" ⟳ ${m}m"; fi
    fi
  fi
  printf '%s %s%d%%%s%s%s%s' "$label" "$col" "$pct" "$RST" "$DIM" "$rstr" "$RST"
}

# ---------- montagem ----------
SEP="${FG_GREY} │ ${RST}"
out=""
[ -n "$dirdisp" ] && out="${out}${FG_YELLOW}📁 ${dirdisp}${RST}${SEP}"
[ -n "$branch" ] && out="${out}${FG_MAG}⎇ ${branch}${RST}${SEP}"
out="${out}${FG_CYAN}${model}${RST}"
out="${out}${SEP}${DIM}${mode}${RST}"
[ -n "$plan" ] && out="${out}${SEP}${FG_MAG}💳 ${plan}${RST}"

# ---------- 2ª linha: contexto + janelas + org + identidade git ----------
line2="$(ctxbar "$ctx")"
line2="${line2}${SEP}$(win five_hour '5h')"
line2="${line2}${SEP}$(win seven_day '7d')"
if [ -n "$org" ]; then
  line2="${line2}${SEP}${FG_CYAN}🏢 ${org}${RST}"
  [ -n "$orgtype" ] && line2="${line2}${DIM} (${orgtype})${RST}"
fi
if [ -n "$guser" ] || [ -n "$gmail" ]; then
  line2="${line2}${SEP}${FG_GREY}👤 ${RST}${FG_GREEN}${guser:-?}${RST}"
  [ -n "$gmail" ] && line2="${line2}${FG_GREY} <${RST}${DIM}${gmail}${RST}${FG_GREY}>${RST}"
fi
out="${out}"$'\n'"${line2}"

printf '%s' "$out"

