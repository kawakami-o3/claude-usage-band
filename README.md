# usage-band

See your Claude plan's **5-hour** and **weekly** usage in the macOS menu bar, at a glance, without opening Settings.

```
5h 19% · 7d 38%
---
5-hour: 19% — resets in 1h22m (20:40)
Weekly: 38% — resets in 1d15h (Nov 8 11:00)
---
Updated 0m ago
Refresh
```

usage-band **never touches your credentials and never spends tokens.**

> Not affiliated with or endorsed by Anthropic.

## How it differs

Most menu bar usage meters read your Claude Code OAuth token from the Keychain, or ask you to paste a browser cookie, and then call an undocumented usage endpoint. That means handing a login credential to a third-party script, which many people cannot do on a work account.

usage-band takes a different route:

```
Claude Code ── rate-limit figures it already has ──▶ usage-band plugin
                                                       │ writes
                                                       ▼
                                          ~/.claude/plan-usage.json
                                                       │ reads every minute
                                                       ▼
                                          SwiftBar script ──▶ menu bar
```

- The **plugin** runs inside Claude Code and receives the same 5-hour and weekly figures that Claude Code shows on its usage card, through the plugin API. Reading them costs no tokens. It writes them to a local JSON file.
- The **SwiftBar script** only reads that file.

Nothing in this repository opens a network connection, reads the Keychain, or reads a cookie. The plugin calls exactly these Claude Code APIs: `$.session.usage()`, `$.clock.now()`, `$.env.get('HOME')`, `$.fs.write()` (to the file above), and, in `band` mode, plugin state and UI rendering. You can confirm this with `claude plugin validate plugins/usage-band`, which lists every call the plugin makes.

## Requirements

- macOS
- Claude Code with plugin hooks support (tested with 2.1.317), in the terminal or the desktop app
- A Claude subscription plan (Pro, Max, Team, …). With an API key there are no plan limits, so there is nothing to show.
- [SwiftBar](https://github.com/swiftbar/SwiftBar)
- `jq` (included with recent macOS at `/usr/bin/jq`; otherwise `brew install jq`)

## Install

### 1. The plugin

In a Claude Code terminal session:

```
/plugin install usage-band --marketplace kawakami-o3/claude-usage-band
```

Or from your shell:

```bash
claude plugin install usage-band --marketplace kawakami-o3/claude-usage-band --scope user
```

In the Claude desktop app: click **+** next to the prompt box → **Plugins** → **Add marketplace**, enter `kawakami-o3/claude-usage-band`, then add **usage-band**.

Choose the **user** scope so it runs in every session. The file appears after Claude Code's first response in a session.

### 2. The SwiftBar script

Install SwiftBar and choose a plugin folder on first launch. Use an empty folder: SwiftBar runs every executable file in it.

```bash
brew install --cask swiftbar
```

Then put the script in that folder. Cloning and linking keeps it updatable:

```bash
git clone https://github.com/kawakami-o3/claude-usage-band.git
ln -s "$PWD/claude-usage-band/swiftbar/plan-usage.1m.sh" "<your SwiftBar plugin folder>/"
```

The `1m` in the file name is the refresh interval. Rename the link to `plan-usage.5m.sh` for every five minutes, and so on.

## Options

The plugin has one option, `display`. Set it when installing (`--config display=band`), later with `claude plugin configure usage-band`, or in Claude Code's config menu:

| Value | What it does |
| --- | --- |
| `file` (default) | Writes `~/.claude/plan-usage.json` only. Nothing appears inside Claude Code. |
| `band` | Shows `5h 19% (1h22m left)  ·  7d 38% (1d15h left)` above the prompt. Writes no file. |
| `both` | Does both. |

The menu bar text turns orange at 75% and red at 90%.

## Limitations

- **Values update only while Claude Code is in use.** The figures arrive with Claude Code's own responses. When you are not using it, the menu bar keeps the last reading and says how old it is. Reset times are still applied: a window whose reset time has passed shows 0%.
- **Usage elsewhere shows up late.** Usage on claude.ai or in other apps counts against the same limits, but appears only after Claude Code's next response.
- **Only the 5-hour and weekly (all models) windows.** Per-model weekly limits and extra usage are not shown.

## File format

Other tools can read the same file. `readAt` and `resetsAtEpoch` are Unix time in seconds.

```json
{
  "version": 1,
  "readAt": 1793944939,
  "windows": [
    {
      "kind": "five_hour",
      "percentUsed": 13,
      "resetsAt": "2026-11-06T06:30:00.000Z",
      "resetsAtEpoch": 1793946600
    },
    {
      "kind": "seven_day",
      "percentUsed": 35,
      "resetsAt": "2026-11-08T02:00:00.000Z",
      "resetsAtEpoch": 1794103200
    }
  ]
}
```

The SwiftBar script reads another path if you set `CLAUDE_PLAN_USAGE_FILE`.

## Uninstall

```bash
claude plugin uninstall usage-band
rm "<your SwiftBar plugin folder>/plan-usage.1m.sh"
rm ~/.claude/plan-usage.json
```

## Development

```bash
claude plugin validate plugins/usage-band
claude plugin test plugins/usage-band
```

## License

[MIT](LICENSE)
