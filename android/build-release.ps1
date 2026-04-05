Set-Location $PSScriptRoot
$stdout = Join-Path $PSScriptRoot 'release-out.txt'
$stderr = Join-Path $PSScriptRoot 'release-err.txt'
Remove-Item $stdout, $stderr -ErrorAction SilentlyContinue
$process = Start-Process -FilePath .\gradlew.bat -ArgumentList 'assembleRelease --stacktrace --console=plain --no-daemon' -PassThru -Wait -NoNewWindow -RedirectStandardOutput $stdout -RedirectStandardError $stderr
Write-Output "EXIT:$($process.ExitCode)"
if (Test-Path $stdout) {
  Write-Output 'STDOUT'
  Get-Content $stdout -Tail 200
}
if (Test-Path $stderr) {
  Write-Output 'STDERR'
  Get-Content $stderr -Tail 200
}
