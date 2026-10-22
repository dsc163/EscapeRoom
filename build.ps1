# Builds a single self-contained EscapeRoom.html (no internet or install needed to play).
$ErrorActionPreference = 'Stop'
$src = Join-Path $PSScriptRoot 'src'
$html = [IO.File]::ReadAllText((Join-Path $src 'index.html'))
$scripts = foreach ($f in 'three.min.js', 'engine.js', 'gen.js', 'game.js') {
  "<script>`n" + [IO.File]::ReadAllText((Join-Path $src $f)) + "`n</script>"
}
$out = $html.Replace('<!--SCRIPTS-->', ($scripts -join "`n"))
[IO.File]::WriteAllText((Join-Path $PSScriptRoot 'EscapeRoom.html'), $out, (New-Object Text.UTF8Encoding $false))
Write-Output "Built EscapeRoom.html ($([math]::Round($out.Length / 1KB)) KB)"
