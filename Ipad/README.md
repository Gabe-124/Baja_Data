# Baja Telemetry iPad (SwiftUI, iPadOS 17+)

Single-target SwiftUI iPad app that mirrors the desktop telemetry client.

## Project layout
- BajaTelemetryApp.swift – app entry
- Models/ – telemetry, track, lap, competitor, preferences
- Services/ – telemetry providers (gateway/ws, HTTP poll, simulation), feeds, race clock, laps, track manager, persistence
- ViewModels/ – AppViewModel binding everything together
- Views/ – dashboard header, map panel + track tools, laps, race clock, feeds, competitors, settings, errors

## Run
1) Open `Ipad/BajaTelemetryApp` in Xcode 15+ (iPadOS 17 target).
2) Select an iPad simulator or device; build & run.
3) Use the dashboard header to choose a source (Gateway/HTTP Poll/Simulation) and tap Connect.
4) Double-tap map to set start/finish; use Walk Track or Draw/Edit to build a reference track; Save/Import for GeoJSON/GPX.
5) Start the 4h race clock tile; adjust via the Adj sheet.
6) Start/stop polling endurance/leaderboard/penalties in the Feeds panel.
7) Import competitor CSV via the Competitors panel or paste inline.

Keyboard shortcut: Cmd+, opens Settings (theme/map, connection URLs, mock injectors).

## Testing hooks
- Simulation source (steady circle with jitter) feeds all UI.
- "Start Test TX" bursts a short circular path to exercise laps/track without a network connection.
- Feed sheet includes mock injectors for endurance/leaderboard/penalties.

## Persistence & export
- Preferences, last track, start/finish, laps, competitors persist in the app sandbox.
- Export track as GeoJSON, laps as JSON; import track via GPX/GeoJSON; import competitors via CSV.

## Notes / next steps
- Draw/Edit mode is basic freehand; add undo stack depth and on-canvas handles if needed.
- Background handling: pause simulation/test TX when backgrounded if you integrate scene phase awareness.
