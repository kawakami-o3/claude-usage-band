#!/bin/bash
# <xbar.title>Claude Plan Usage</xbar.title>
# <xbar.version>v0.1.0</xbar.version>
# <xbar.desc>Shows your Claude plan's 5-hour and weekly usage. Reads the file the usage-band plugin writes; uses no credentials and no network.</xbar.desc>
# <xbar.dependencies>jq</xbar.dependencies>
# <swiftbar.hideAbout>true</swiftbar.hideAbout>
# <swiftbar.hideRunInTerminal>true</swiftbar.hideRunInTerminal>
# <swiftbar.hideLastUpdated>true</swiftbar.hideLastUpdated>

FILE="${CLAUDE_PLAN_USAGE_FILE:-$HOME/.claude/plan-usage.json}"
STALE_AFTER=1800 # seconds; older readings get a note

JQ=$(command -v jq || echo /usr/bin/jq)
NOW=$(date +%s)

if [ ! -r "$FILE" ] || [ ! -x "$JQ" ]; then
  echo "Claude —"
  echo "---"
  if [ ! -x "$JQ" ]; then
    echo "jq not found"
  else
    echo "No data yet"
    echo "Install the usage-band plugin and use Claude Code once | size=11"
  fi
  exit 0
fi

# Formats seconds as 2d3h, 3h19m or 12m
fmt_remaining() {
  local s=$1
  local m=$((s / 60)) d h
  d=$((m / 1440)); h=$(((m % 1440) / 60)); m=$((m % 60))
  if [ "$d" -gt 0 ]; then echo "${d}d${h}h"
  elif [ "$h" -gt 0 ]; then echo "${h}h${m}m"
  else echo "${m}m"
  fi
}

# Prints "<percent> <reset epoch> <live|reset>" for a window kind.
# A window whose reset time has passed counts as 0%.
read_window() {
  local kind=$1
  local line pct reset
  line=$("$JQ" -r --arg k "$kind" \
    '.windows[] | select(.kind == $k) | "\(.percentUsed) \(.resetsAtEpoch // 0)"' "$FILE" 2>/dev/null | head -1)
  [ -z "$line" ] && return 1
  pct=${line% *}; reset=${line#* }
  if [ "$reset" -gt 0 ] && [ "$reset" -le "$NOW" ]; then
    echo "0 $reset reset"
  else
    echo "$pct $reset live"
  fi
}

TITLE=""
MENU=""
MAX=0
for pair in "five_hour:5h:5-hour" "seven_day:7d:Weekly"; do
  kind=${pair%%:*}; rest=${pair#*:}; short=${rest%%:*}; long=${rest#*:}
  w=$(read_window "$kind") || continue
  set -- $w
  pct=$1; reset=$2; state=$3
  pct_int=${pct%.*}
  [ "$pct_int" -gt "$MAX" ] && MAX=$pct_int

  [ -n "$TITLE" ] && TITLE="$TITLE · "
  TITLE="$TITLE$short ${pct}%"

  if [ "$state" = "reset" ]; then
    MENU="$MENU${long}: 0% (reset)\n"
  elif [ "$reset" -gt 0 ]; then
    if [ "$kind" = "seven_day" ]; then at=$(date -r "$reset" "+%b %-d %H:%M"); else at=$(date -r "$reset" "+%H:%M"); fi
    MENU="$MENU${long}: ${pct}% — resets in $(fmt_remaining $((reset - NOW))) (${at})\n"
  else
    MENU="$MENU${long}: ${pct}%\n"
  fi
done

if [ -z "$TITLE" ]; then
  echo "Claude —"
  echo "---"
  echo "The file has no usage windows | size=11"
  exit 0
fi

COLOR=""
if [ "$MAX" -ge 90 ]; then COLOR=" | color=#ff453a"
elif [ "$MAX" -ge 75 ]; then COLOR=" | color=#ff9f0a"
fi

READ_AT=$("$JQ" -r '.readAt // 0' "$FILE")
AGE=$((NOW - READ_AT))

echo "$TITLE$COLOR"
echo "---"
printf "%b" "$MENU"
echo "---"
echo "Updated $(fmt_remaining "$AGE") ago | size=11"
if [ "$AGE" -gt "$STALE_AFTER" ]; then
  echo "Not updated while Claude Code is idle | size=11"
fi
echo "Refresh | refresh=true"
