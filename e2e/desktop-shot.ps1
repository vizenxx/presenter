# Starts the app with a deck, waits, captures the whole desktop (native views included), closes the app.
# Usage: powershell -File e2e/desktop-shot.ps1 -Deck <path> -Out <png> [-Wait 9]
# It sends no keys: OS-level keys can reach another app's window (e.g. a live presentation).
param(
  [Parameter(Mandatory = $true)][string]$Deck,
  [Parameter(Mandatory = $true)][string]$Out,
  [int]$Wait = 9
)
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
if ([System.Windows.Forms.Screen]::AllScreens.Count -gt 1 -and $env:PRESENTER_E2E_ALLOW_MULTI -ne '1') {
  Write-Error 'Refusing to run: a second display is connected (a class may be on the projector).'
  exit 2
}
$root = Split-Path -Parent $PSScriptRoot
$env:PRESENTER_OPEN = $Deck
$env:PRESENTER_TEST = '1'
# A separate data folder, so screenshots never touch the teacher's recent files or zoom memory.
$env:PRESENTER_USER_DATA = Join-Path $PSScriptRoot 'out\userdata-shot'
$p = Start-Process -FilePath (Join-Path $root 'node_modules\electron\dist\electron.exe') -ArgumentList "`"$root`"" -WorkingDirectory $root -PassThru
Start-Sleep -Seconds $Wait
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
Add-Type -Namespace Win32 -Name Dpi -MemberDefinition '[DllImport("user32.dll")] public static extern bool SetProcessDPIAware();'
$null = [Win32.Dpi]::SetProcessDPIAware()
$b = [System.Windows.Forms.SystemInformation]::VirtualScreen
$bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($b.Left, $b.Top, 0, 0, $bmp.Size)
$bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()
Get-Process -Id $p.Id -ErrorAction SilentlyContinue | Stop-Process -Force
Get-Process electron -ErrorAction SilentlyContinue | Where-Object { $_.Path -like "$root*" } | Stop-Process -Force
"saved $Out ($($b.Width)x$($b.Height))"
