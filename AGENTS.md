# Rules for AI agents

- NEVER run, dispatch or trigger the "Full Database Refresh" process (`.github/workflows/full-database-refresh.yml`, action id `full-database-refresh`, or `qogita_weekly_sync_upscayl.py --all`). It is a danger-zone operation that only the owner may start manually from the privileged panel.
