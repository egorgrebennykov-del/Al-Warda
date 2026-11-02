# Al-Warda - Register Local Windows Task Scheduler for Weekly Sync
# Runs every Monday at 10:00 AM using local Python and Upscayl

$taskName = "AlWarda-WeeklyQogitaSync"
$scriptPath = Join-Path $PSScriptRoot "run_local_upscayl_sync.bat"

Write-Host "Creating Windows Scheduled Task: $taskName" -ForegroundColor Cyan
Write-Host "Target script: $scriptPath" -ForegroundColor Yellow

$action = New-ScheduledTaskAction -Execute $scriptPath
$trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday -At 10:00AM
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description "Weekly Al-Warda Qogita sync, background cutout and Upscayl enhancement" -Force

Write-Host "`nTask '$taskName' successfully registered in Windows Task Scheduler!" -ForegroundColor Green
Write-Host "It will run every Monday at 10:00 AM."
