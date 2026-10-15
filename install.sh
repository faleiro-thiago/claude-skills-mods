#!/usr/bin/env bash
# Reinstala os itens numa máquina nova. Requer: claude CLI.
set -euo pipefail
D="$(cd "$(dirname "$0")" && pwd)"
for r in "$D"/plugins/*/plugin.ref.json; do
  repo=$(python3 -c "import json,sys;print(json.load(open('$r'))['marketplaceRepo'])")
  plug=$(python3 -c "import json,sys;print(json.load(open('$r'))['plugin'])")
  claude plugin marketplace add "$repo" || true
  claude plugin install "$plug" || true
done
mkdir -p ~/mods ~/.claude/tools
rsync -a "$D/clean-view/" ~/mods/clean-view/
rsync -a "$D/statusbar/" ~/.claude/tools/claude-code-statusbar/
echo "Falta apontar no settings.json: CLAUDE_CODE_PLUGIN_DIRS=~/mods/clean-view e statusLine -> bash ~/.claude/tools/claude-code-statusbar/status-bar.sh"
