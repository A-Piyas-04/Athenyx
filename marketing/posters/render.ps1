# Renders the HTML posters in ./src to 1536x2048 PNGs next to this script.
param([string[]]$Names = @())

$chrome = "C:\Program Files\Google\Chrome\Application\chrome.exe"
$src = Join-Path $PSScriptRoot "src"
$files = Get-ChildItem $src -Filter "poster-*.html"
if ($Names.Count) { $files = $files | Where-Object { $Names -contains $_.BaseName } }

foreach ($f in $files) {
  $out = Join-Path $PSScriptRoot ("athenyx-" + $f.BaseName + ".png")
  $url = "file:///" + ($f.FullName -replace '\\', '/')
  & $chrome --headless=new --disable-gpu --hide-scrollbars --window-size=768,1024 `
    --force-device-scale-factor=2 --virtual-time-budget=8000 `
    --screenshot="$out" $url 2>$null | Out-Null
  Write-Output "rendered $out"
}
