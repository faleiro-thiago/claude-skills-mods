#!/usr/bin/env bash
# Reinstala os itens numa máquina nova. Requer: claude CLI.
set -euo pipefail
D="$(cd "$(dirname "$0")" && pwd)"
claude plugin marketplace add faleiro-thiago/claude-skills-mods || true
claude plugin install skins@faleiro-mods || true
mkdir -p ~/.claude/plugins/store
cp "$D/skins/config/skins_faleiro-mods.json" ~/.claude/plugins/store/skins_faleiro-mods-fed16347994a.json
claude plugin marketplace add data-goblin/claude-code-filetree || true
claude plugin install filetree@claude-code-filetree || true
claude plugin marketplace add jarrodwatts/claude-image-view || true
claude plugin install image-view@claude-image-view || true
mkdir -p ~/mods ~/.claude/tools
rsync -a "$D/clean-view/" ~/mods/clean-view/
rsync -a "$D/statusbar/" ~/.claude/tools/claude-code-statusbar/
echo "Falta apontar no settings.json: CLAUDE_CODE_PLUGIN_DIRS=~/mods/clean-view e statusLine -> bash ~/.claude/tools/claude-code-statusbar/status-bar.sh"
