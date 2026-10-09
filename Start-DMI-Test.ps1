# Local static test server. No administrator rights or installations required.
# Close this window to stop. Listens only on this computer's loopback address.
$ErrorActionPreference = 'Stop'
$siteRoot = [IO.Path]::GetFullPath($PSScriptRoot)
$rootPrefix = $siteRoot.TrimEnd('\') + '\'
$port = 8765
$listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $port)
try { $listener.Start(128) } catch { Write-Host 'Port 8765 is already in use. Close the previous test launcher and retry.'; Read-Host 'Press Enter'; exit 1 }
$mime = @{'.html'='text/html; charset=utf-8';'.js'='application/javascript; charset=utf-8';'.css'='text/css; charset=utf-8';'.json'='application/json; charset=utf-8';'.jpg'='image/jpeg';'.jpeg'='image/jpeg';'.png'='image/png';'.svg'='image/svg+xml';'.ico'='image/x-icon';'.mp4'='video/mp4';'.mp3'='audio/mpeg';'.pdf'='application/pdf';'.jfif'='image/jpeg'}
Write-Host 'DMI TEST COPY is running. Keep this window open; close it to stop.'
Write-Host 'Address: http://127.0.0.1:8765/test-start.html'
Start-Process -FilePath 'http://127.0.0.1:8765/test-start.html'
try {
 while ($true) {
  $client = $listener.AcceptTcpClient()
  $stream = $null; $reader = $null; $fileStream = $null
  try {
   $stream = $client.GetStream(); $stream.ReadTimeout = 5000
   $reader = [IO.StreamReader]::new($stream,[Text.Encoding]::ASCII,$false,1024,$true)
   $line = $reader.ReadLine()
   if (!$line) { continue }
   $parts = $line.Split(' ')
   $headerCount = 0
   while (($header = $reader.ReadLine()) -and $headerCount -lt 100) { $headerCount++ }
   $status = '200 OK'; $contentType = 'text/plain; charset=utf-8'; $payload = [byte[]]@()
   if ($parts.Length -lt 2 -or $parts[0] -ne 'GET') {
    $status = '405 Method Not Allowed'; $payload = [Text.Encoding]::UTF8.GetBytes('Static test server accepts GET only.')
   } else {
    $relative = [Uri]::UnescapeDataString($parts[1].Split('?')[0]).TrimStart('/')
    if (!$relative) { $relative = 'test-start.html' }
    $filePath = [IO.Path]::GetFullPath([IO.Path]::Combine($siteRoot,$relative.Replace('/','\')))
    if (!$filePath.StartsWith($rootPrefix,[StringComparison]::OrdinalIgnoreCase)) {
     $status = '403 Forbidden'; $payload = [Text.Encoding]::UTF8.GetBytes('Outside test folder.')
    } elseif (![IO.File]::Exists($filePath)) {
     $status = '404 Not Found'; $payload = [Text.Encoding]::UTF8.GetBytes('File not included in this test copy.')
    } else {
     $ext = [IO.Path]::GetExtension($filePath).ToLowerInvariant()
     if ($mime.ContainsKey($ext)) { $contentType = $mime[$ext] } else { $contentType = 'application/octet-stream' }
     $fileStream = [IO.File]::OpenRead($filePath)
    }
   }
   $length = if ($fileStream) { $fileStream.Length } else { $payload.Length }
   $headers = "HTTP/1.1 $status`r`nContent-Type: $contentType`r`nContent-Length: $length`r`nCache-Control: no-store`r`nConnection: close`r`n`r`n"
   $bytes = [Text.Encoding]::ASCII.GetBytes($headers); $stream.Write($bytes,0,$bytes.Length)
   if ($fileStream) { $fileStream.CopyTo($stream) } elseif ($payload.Length) { $stream.Write($payload,0,$payload.Length) }
   $stream.Flush()
  } catch { Write-Host 'A browser request ended; server remains available.' }
  finally { if ($fileStream) {$fileStream.Dispose()}; if ($reader) {$reader.Dispose()}; if ($stream) {$stream.Dispose()}; $client.Dispose() }
 }
} finally { $listener.Stop() }
