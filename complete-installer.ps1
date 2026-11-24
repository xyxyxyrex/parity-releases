param([Parameter(Mandatory)][string]$Installer)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient,UIAutomationTypes
$actions = [Collections.Generic.List[string]]::new()
$observed = [Collections.Generic.HashSet[string]]::new()
$seen = $false
$lastAction = ''
$deadline = (Get-Date).AddSeconds(105)
while ((Get-Date) -lt $deadline) {
  $process = Get-Process -Name 'Parity-Setup-1.6.5' -ErrorAction SilentlyContinue |
    Where-Object { $_.Path -eq $Installer } | Select-Object -First 1
  if (!$process) {
    if ($seen) { break }
    Start-Sleep -Milliseconds 400
    continue
  }
  $seen = $true
  if ($process.MainWindowHandle -eq 0 -or $process.MainWindowTitle -notlike 'Parity Setup*') {
    Start-Sleep -Milliseconds 400
    continue
  }
  try {
    $window = [Windows.Automation.AutomationElement]::FromHandle($process.MainWindowHandle)
    $condition = [Windows.Automation.PropertyCondition]::new(
      [Windows.Automation.AutomationElement]::ControlTypeProperty,
      [Windows.Automation.ControlType]::Button
    )
    $buttons = $window.FindAll([Windows.Automation.TreeScope]::Descendants, $condition)
    foreach ($button in $buttons) {
      $buttonName = $button.Current.Name
      if ($buttonName) { $null = $observed.Add($buttonName) }
      if (!$button.Current.IsEnabled -or $button.Current.IsOffscreen) { continue }
      $name = ($buttonName -replace '&','').Trim()
      if ($name -notin @('Next >', 'Next', 'Install', 'Finish') -or $name -eq $lastAction) { continue }
      $invoke = $button.GetCurrentPattern([Windows.Automation.InvokePattern]::Pattern)
      $invoke.Invoke()
      $actions.Add($name)
      $lastAction = $name
      break
    }
  } catch [Windows.Automation.ElementNotAvailableException] {
    # The installer may replace its window as it advances.
  }
  Start-Sleep -Milliseconds 750
}
@{ actions = @($actions); observedButtons = @($observed); seen = $seen } | ConvertTo-Json -Depth 3 -Compress
