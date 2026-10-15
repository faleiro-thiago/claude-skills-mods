# claude-skills-mods
Facilitadores pessoais para Claude Code. Cada item tem versão própria (`VERSION` + `CHANGELOG.md`) e tag `item/vX.Y.Z`.

| Item | Conteúdo |
|---|---|
| clean-view | mod próprio |
| statusbar | cópia modificada de magacho/claude-code-statusbar (MIT) |
| skins | código de hellosverre/claude-skins 0.1.1 (MIT) + skin própria `sunset-peach` |

filetree e image-view são públicos e instalados direto das fontes originais pelo `install.sh`.

Instalar: `./install.sh`. Alterar e versionar: `scripts/bump.sh <item> patch|minor|major "mensagem"` (itens: clean-view, statusbar, skins).
