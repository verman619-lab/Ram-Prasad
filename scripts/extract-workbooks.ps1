<#
  Extract every sheet from the manual workbooks in Template/ to CSV under import/csv/.

  Reads cell values directly through Excel COM (no workbook copy/SaveAs, which can
  hang). Works on a Windows machine with Excel installed, which is the owner's
  machine. The importer (npm run import:excel) reads the CSVs; no spreadsheet
  library is required.

  Usage:
    powershell -ExecutionPolicy Bypass -File scripts/extract-workbooks.ps1
#>
param(
  [string]$TemplateDir = (Join-Path $PSScriptRoot "..\Template"),
  [string]$OutDir = (Join-Path $PSScriptRoot "..\import\csv")
)

$ErrorActionPreference = "Stop"
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

function Safe-Name([string]$name) {
  return ($name -replace '[^a-zA-Z0-9]+', '_').Trim('_')
}

function ConvertTo-CsvField([object]$value) {
  if ($null -eq $value) { return "" }
  $s = [string]$value
  if ($s -match '[",\r\n]') {
    return '"' + ($s -replace '"', '""') + '"'
  }
  return $s
}

if (-not (Test-Path -LiteralPath $TemplateDir)) {
  Write-Error "Template directory not found: $TemplateDir"
}

$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
$excel.ScreenUpdating = $false

$files = Get-ChildItem -LiteralPath $TemplateDir -File | Where-Object { $_.Extension -match '^\.xlsx?$' }
$written = 0

try {
  foreach ($file in $files) {
    Write-Host "Extracting $($file.Name)"
    $wb = $excel.Workbooks.Open($file.FullName, 0, $true)
    try {
      foreach ($ws in $wb.Worksheets) {
        $csvPath = Join-Path $OutDir ("{0}__{1}.csv" -f (Safe-Name $file.BaseName), (Safe-Name $ws.Name))
        try {
          $ur = $ws.UsedRange
          $rows = [int]$ur.Rows.Count
          $cols = [int]$ur.Columns.Count
          $data = $ur.Value2

          $sb = New-Object System.Text.StringBuilder
          if ($rows -eq 1 -and $cols -eq 1) {
            [void]$sb.AppendLine((ConvertTo-CsvField $data))
          } else {
            for ($r = 1; $r -le $rows; $r++) {
              $fields = New-Object System.Collections.ArrayList
              for ($c = 1; $c -le $cols; $c++) {
                $v = $null
                try { $v = $data[$r, $c] } catch { $v = $null }
                [void]$fields.Add((ConvertTo-CsvField $v))
              }
              [void]$sb.AppendLine(($fields -join ","))
            }
          }

          Set-Content -LiteralPath $csvPath -Value $sb.ToString() -Encoding UTF8
          $written++
          Write-Host "  -> $([System.IO.Path]::GetFileName($csvPath)) ($rows x $cols)"
        } catch {
          Write-Warning "  skipped sheet '$($ws.Name)': $($_.Exception.Message)"
        }
      }
    } finally {
      $wb.Close($false)
    }
  }
} finally {
  $excel.Quit()
  [System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null
}

Write-Host "Extracted $written sheet(s) to $OutDir"
