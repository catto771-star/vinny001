# Skill sources

The skills in `.claude/skills/` were copied from these repositories. Each keeps
its upstream license; check the source repository before redistributing.

| Source | Skills |
|---|---|
| https://github.com/ComposioHQ/awesome-claude-skills | 859 |
| https://github.com/alirezarezvani/claude-skills | 393 |
| https://github.com/Jeffallan/claude-skills | 67 |
| https://github.com/heydamir/unslop | 1 |

Notes:

- The Composio copies of `docx`, `pdf`, `pptx`, `xlsx` and `skill-creator` were
  left out because they collide with Claude's built-in skills.
- Skills whose names collided across sources carry an `alireza-` or `composio-`
  prefix.
- The 832 `*-automation` skills need the Rube MCP server (https://rube.app/mcp).
- The REA and Craft Anything skills are not stored here. Run
  `bash scripts/install-rea.sh` to install REA, the Ghidra engine, its MCP
  server and its skill.