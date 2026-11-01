Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead("d:\dse-me-simulator\docs\DSE FIX Certification Test Cases v1.3.4 - 2024.xlsx")
$workbookEntry = $zip.GetEntry("xl/workbook.xml")
$reader = New-Object System.IO.StreamReader($workbookEntry.Open())
$xml = [xml]$reader.ReadToEnd()
$reader.Close()
$zip.Dispose()
$xml.workbook.sheets.sheet | Format-Table -AutoSize
