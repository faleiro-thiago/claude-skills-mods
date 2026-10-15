#!/usr/bin/env bash
# Uso: scripts/bump.sh <item> <patch|minor|major> "mensagem"
# Itens: clean-view, statusbar, skins
set -euo pipefail
cd "$(dirname "$0")/.."
item=$1; lvl=$2; msg=${3:-"atualização"}
dir=$item
[ -f $dir/VERSION ] || { echo "item inválido"; exit 1; }
IFS=. read -r a b c < $dir/VERSION
case $lvl in major) a=$((a+1));b=0;c=0;; minor) b=$((b+1));c=0;; patch) c=$((c+1));; *) exit 1;; esac
v=$a.$b.$c; echo $v > $dir/VERSION
[ -f $dir/.claude-plugin/plugin.json ] && sed -i '' -E "s/\"version\": \"[^\"]+\"/\"version\": \"$v\"/" $dir/.claude-plugin/plugin.json
{ head -1 $dir/CHANGELOG.md; echo "## $v"; echo "- $msg"; tail -n +2 $dir/CHANGELOG.md; } > $dir/CHANGELOG.tmp && mv $dir/CHANGELOG.tmp $dir/CHANGELOG.md
git add -A "$dir"; git commit -m "$item $v: $msg" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"; git tag "$item/v$v"
echo "$item -> $v (tag $item/v$v). Envie com: git push --follow-tags"
