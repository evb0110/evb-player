#!/usr/bin/env bash
# Runs a command inside a private nested KWin Wayland session with its own D-Bus and runtime
# directory, so Electron on Linux gets a display without touching the user's desktop. A hidden
# Wayland window gets no frames, so windows are shown inside this session (EVB_PLAYER_HIDE_WINDOW=0).
#
#   scripts/with-nested-display.sh <work-directory> <command> [args...]
set -euo pipefail

work=$(realpath -m "$1")
shift
run="$work/nested-display"
rm -rf "$run"
mkdir -p "$run/runtime"
chmod 700 "$run/runtime"
export TMPDIR="${TMPDIR:-$work/tmp}"
mkdir -p "$TMPDIR"
export XDG_RUNTIME_DIR="$run/runtime" XDG_SESSION_TYPE=wayland XDG_CURRENT_DESKTOP=KDE EVB_PLAYER_HIDE_WINDOW=0
unset DISPLAY WAYLAND_DISPLAY SESSION_MANAGER
export NESTED_RUN="$run"

exec dbus-run-session -- bash -c '
set -euo pipefail
KWIN_SCREENSHOT_NO_PERMISSION_CHECKS=1 kwin_wayland --virtual --no-lockscreen --socket evb-player-nested --width 1920 --height 1200 >"$NESTED_RUN/kwin.log" 2>&1 &
kwin=$!
trap "kill $kwin 2>/dev/null || true; wait $kwin 2>/dev/null || true" EXIT
for _ in $(seq 100); do [[ -S $XDG_RUNTIME_DIR/evb-player-nested ]] && break; sleep 0.1; done
export WAYLAND_DISPLAY=evb-player-nested
"$@"
' nested-display "$@"
