# Save this as detailed-test.ps1
$url = "https://api.aced.live/api/payments/multicard/initiate"
$body = @{
    userId = "test123"
    plan = "start"
    amount = 26000000
    lang = "ru"
} | ConvertTo-Json

Write-Host "Sending POST request..." -ForegroundColor Yellow
Write-Host "Body: $body" -ForegroundColor Gray

try {
    $response = Invoke-WebRequest -Uri $url -Method POST -Body $body -ContentType "application/json" -UseBasicParsing
    Write-Host "✅ Success!" -ForegroundColor Green
    Write-Host $response.Content -ForegroundColor White
} catch {
    Write-Host "Status: $($_.Exception.Response.StatusCode.value__)" -ForegroundColor Red
    $reader = [System.IO.StreamReader]::new($_.Exception.Response.GetResponseStream())
    $errorBody = $reader.ReadToEnd()
    Write-Host "Error Response:" -ForegroundColor Yellow
    Write-Host $errorBody -ForegroundColor White
}