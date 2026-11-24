param([Parameter(Mandatory)][string]$Installer)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient,UIAutomationTypes
Add-Type @'
using System;
using System.Runtime.InteropServices;
using System.Text;

public static class SetupWindow {
  public delegate bool ChildCallback(IntPtr window, IntPtr argument);
  [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr window, int command);
  [DllImport("user32.dll")] public static extern bool EnumChildWindows(IntPtr window, ChildCallback callback, IntPtr argument);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr window, StringBuilder text, int length);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetClassName(IntPtr window, StringBuilder text, int length);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr window);
  [DllImport("user32.dll")] public static extern bool IsWindowEnabled(IntPtr window);
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr window, uint message, IntPtr wParam, IntPtr lParam);
}
'@
$actions = [Collections.Generic.List[string]]::new()
$observed = [Collections.Generic.HashSet[string]]::new()
$seen = $false
$invoked = [Collections.Generic.HashSet[string]]::new()
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
  $handle = $process.MainWindowHandle
  if (![SetupWindow]::IsWindowVisible($handle)) { $null = [SetupWindow]::ShowWindowAsync($handle, 1) }
  $nativeButtons = [Collections.Generic.List[object]]::new()
  $callback = [SetupWindow+ChildCallback]{
    param($window, $argument)
    $class = [Text.StringBuilder]::new(64)
    $null = [SetupWindow]::GetClassName($window, $class, 64)
    if ($class.ToString() -eq 'Button') {
      $label = [Text.StringBuilder]::new(160)
      $null = [SetupWindow]::GetWindowText($window, $label, 160)
      $nativeButtons.Add(@{ handle = $window; name = $label.ToString() })
    }
    return $true
  }
  $null = [SetupWindow]::EnumChildWindows($handle, $callback, [IntPtr]::Zero)
  $clicked = $false
  foreach ($button in $nativeButtons) {
    if ($button.name) { $null = $observed.Add($button.name) }
    $name = ($button.name -replace '&','').Trim()
    if ($name -notin @('Next >', 'Next', 'Install', 'Finish')) { continue }
    if (![SetupWindow]::IsWindowVisible($button.handle) -or ![SetupWindow]::IsWindowEnabled($button.handle)) { continue }
    if (!$invoked.Add("$($button.handle):$name")) { continue }
    # BM_CLICK on a verified child of the exact updater-launched Setup process.
    if (![SetupWindow]::PostMessage($button.handle, 0x00F5, [IntPtr]::Zero, [IntPtr]::Zero)) { continue }
    $actions.Add($name)
    $clicked = $true
    break
  }
  if ($clicked) { Start-Sleep -Milliseconds 750; continue }
  try {
    $window = [Windows.Automation.AutomationElement]::FromHandle($handle)
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
      if ($name -notin @('Next >', 'Next', 'Install', 'Finish')) { continue }
      if (!$invoked.Add("$($button.Current.NativeWindowHandle):$name")) { continue }
      $invoke = $button.GetCurrentPattern([Windows.Automation.InvokePattern]::Pattern)
      $invoke.Invoke()
      $actions.Add($name)
      break
    }
  } catch [Windows.Automation.ElementNotAvailableException] {
    # The installer may replace its window as it advances.
  }
  Start-Sleep -Milliseconds 750
}
@{ actions = @($actions); observedButtons = @($observed); seen = $seen } | ConvertTo-Json -Depth 3 -Compress
