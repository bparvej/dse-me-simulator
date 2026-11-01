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

function Export-Sheet($sheetFile, $outPath) {
    $entry = $zip.GetEntry($sheetFile)
    if (-not $entry) { return }
    $sReader = New-Object System.IO.StreamReader($entry.Open())
    $sXml = [xml]$sReader.ReadToEnd()
    $sReader.Close()

    $lines = @()
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
                # Clean up newlines for display
                $cleanVal = $val.Replace("`r", "").Replace("`n", " ")
                $cells += "$($c.r): $cleanVal"
            }
        }
        if ($cells.Count -gt 0) {
            $lines += "Row $rowNum | " + ($cells -join " | ")
        }
    }
    $lines | Out-File -FilePath $outPath -Encoding utf8
}

Export-Sheet "xl/worksheets/sheet2.xml" "d:\dse-me-simulator\docs\sheet2_SessionTransport.txt"
Export-Sheet "xl/worksheets/sheet3.xml" "d:\dse-me-simulator\docs\sheet3_MarketOrders.txt"
Export-Sheet "xl/worksheets/sheet4.xml" "d:\dse-me-simulator\docs\sheet4_LimitOrders.txt"
Export-Sheet "xl/worksheets/sheet5.xml" "d:\dse-me-simulator\docs\sheet5_BlockOrders.txt"
Export-Sheet "xl/worksheets/sheet6.xml" "d:\dse-me-simulator\docs\sheet6_Misc.txt"

$zip.Dispose()
Write-Output "Successfully exported all sheets to text files."
