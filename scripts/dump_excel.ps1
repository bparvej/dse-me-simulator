Add-Type -AssemblyName System.IO.Compression.FileSystem

$zip = [System.IO.Compression.ZipFile]::OpenRead("d:\dse-me-simulator\docs\DSE FIX Certification Test Cases v1.3.4 - 2024.xlsx")

# Load shared strings
$sstEntry = $zip.GetEntry("xl/sharedStrings.xml")
$reader = New-Object System.IO.StreamReader($sstEntry.Open())
$sstXml = [xml]$reader.ReadToEnd()
$reader.Close()

$sst = @()
foreach ($si in $sstXml.sst.si) {
    if ($si.t) {
        $sst += $si.t
    } elseif ($si.r) {
        $text = ($si.r | ForEach-Object { $_.t }) -join ""
        $sst += $text
    } else {
        $sst += ""
    }
}

function Dump-Sheet($sheetFile, $name) {
    Write-Output "=================================================="
    Write-Output "SHEET: $name ($sheetFile)"
    Write-Output "=================================================="
    $entry = $zip.GetEntry($sheetFile)
    if (-not $entry) { return }
    $sReader = New-Object System.IO.StreamReader($entry.Open())
    $sXml = [xml]$sReader.ReadToEnd()
    $sReader.Close()

    foreach ($row in $sXml.worksheet.sheetData.row) {
        $rowNum = $row.r
        $cells = @()
        foreach ($c in $row.c) {
            $val = ""
            if ($c.t -eq "s") {
                $idx = [int]$c.v
                $val = $sst[$idx]
            } elseif ($c.v) {
                $val = $c.v
            }
            if ($val) {
                $cells += "$($c.r): $val"
            }
        }
        if ($cells.Count -gt 0) {
            Write-Output ("Row " + $rowNum + " -> " + ($cells -join " | "))
        }
    }
}

# Dump overview
Dump-Sheet "xl/worksheets/sheet1.xml" "Overview"

$zip.Dispose()
