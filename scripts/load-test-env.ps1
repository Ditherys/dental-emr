<#
.SYNOPSIS
  Loads the bash-format test.env credential file into the current PowerShell
  process's environment variables.

.DESCRIPTION
  test.env (see docs/deployment/CLOUD_TEST_PROVISIONING.md and e2e/README.md)
  is deliberately kept OUTSIDE the repository and written in bash `export
  NAME=value` lines, because it originated from the Cloud TEST provisioning
  runbook. This project's primary shell is PowerShell, which has no native
  `source` for that format, so this script bridges the gap.

  It never prints a value. It only reports which variable NAMES were loaded,
  which docs/deployment/CLOUD_TEST_PROVISIONING.md already treats as safe to
  share (only the values are credentials).

.PARAMETER Path
  Path to the bash-format env file. Defaults to the documented location,
  $HOME\.dental-emr\test.env.

.EXAMPLE
  . .\scripts\load-test-env.ps1
  Loads the default test.env into this PowerShell session, then any
  npm run / npx command in the same window picks up the variables.

.EXAMPLE
  . .\scripts\load-test-env.ps1 -Path 'D:\secrets\my-test.env'
  Loads from a non-default location.
#>
param(
    [string]$Path = (Join-Path $HOME ".dental-emr\test.env")
)

if (-not (Test-Path $Path)) {
    Write-Error "No env file found at $Path. It is never committed to Git - see docs/deployment/CLOUD_TEST_PROVISIONING.md."
    return
}

$loaded = @()

Get-Content $Path | ForEach-Object {
    $line = $_.Trim()

    # Skip blank lines and comments.
    if (-not $line -or $line.StartsWith('#')) {
        return
    }

    if ($line -match '^export\s+([A-Za-z_][A-Za-z0-9_]*)=(.*)$') {
        $name = $Matches[1]
        $value = $Matches[2].Trim()

        # Strip one layer of matching surrounding quotes, same as bash export.
        if ($value.Length -ge 2 -and (
                ($value[0] -eq "'" -and $value[-1] -eq "'") -or
                ($value[0] -eq '"' -and $value[-1] -eq '"')
            )) {
            $value = $value.Substring(1, $value.Length - 2)
        }

        Set-Item -Path "Env:$name" -Value $value
        $loaded += $name
    }
}

if ($loaded.Count -eq 0) {
    Write-Warning "No 'export NAME=value' lines were found in $Path."
} else {
    Write-Host "Loaded $($loaded.Count) variable(s) from $Path into this session:" -ForegroundColor Green
    $loaded | Sort-Object | ForEach-Object { Write-Host "  $_" }
    Write-Host "Values were not printed. This only affects the current PowerShell window." -ForegroundColor DarkGray
}
