# Save this as multicard-full-test.ps1
# Run: .\multicard-full-test.ps1

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "🧪 FULL MULTICARD INTEGRATION TEST" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# Step 1: Test authentication
Write-Host "📍 Step 1: Testing Authentication..." -ForegroundColor Yellow
try {
    $authResponse = Invoke-RestMethod -Uri "https://api.aced.live/api/multicard/test-connection" -Method Get
    Write-Host "✅ Auth Response:" -ForegroundColor Green
    $authResponse | ConvertTo-Json -Depth 5
} catch {
    Write-Host "❌ Auth failed: $_" -ForegroundColor Red
    exit
}

Write-Host "`n" -ForegroundColor White

# Step 2: Create invoice via YOUR API
Write-Host "📍 Step 2: Creating Invoice via api.aced.live..." -ForegroundColor Yellow

$timestamp = Get-Date -Format 'yyyyMMddHHmmss'
$createBody = @"
{
    "userId": "test-user-$timestamp",
    "plan": "start",
    "amount": 26000000,
    "ofd": [
        {
            "qty": 1,
            "price": 26000000,
            "mxik": "10899002001000000",
            "total": 26000000,
            "package_code": "1",
            "name": "ACED Start Plan Test"
        }
    ],
    "lang": "ru"
}
"@

Write-Host "Request Body:" -ForegroundColor Gray
Write-Host $createBody -ForegroundColor Gray
Write-Host ""

try {
    $createResponse = Invoke-RestMethod -Uri "https://api.aced.live/api/multicard/initiate" `
        -Method Post `
        -Headers @{"Content-Type"="application/json"} `
        -Body $createBody

    Write-Host "✅ Invoice Created Successfully!" -ForegroundColor Green
    Write-Host "Full Response:" -ForegroundColor Green
    $createResponse | ConvertTo-Json -Depth 10
    
    $uuid = $createResponse.data.uuid
    $invoiceId = $createResponse.data.invoiceId
    $checkoutUrl = $createResponse.data.checkoutUrl
    
    Write-Host "`n📋 Invoice Details:" -ForegroundColor Cyan
    Write-Host "   UUID: $uuid" -ForegroundColor White
    Write-Host "   Invoice ID: $invoiceId" -ForegroundColor White
    Write-Host "   Checkout URL: $checkoutUrl" -ForegroundColor White
    
} catch {
    Write-Host "❌ Invoice Creation Failed!" -ForegroundColor Red
    Write-Host "Error: $_" -ForegroundColor Red
    
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "Response Body: $responseBody" -ForegroundColor Red
    }
    exit
}

Write-Host "`n" -ForegroundColor White

# Step 3: Wait a moment for DB sync
Write-Host "📍 Step 3: Waiting 2 seconds for database sync..." -ForegroundColor Yellow
Start-Sleep -Seconds 2

# Step 4: Try to get invoice by UUID via YOUR API
Write-Host "`n📍 Step 4: Getting Invoice by UUID via YOUR API..." -ForegroundColor Yellow
Write-Host "   Trying: https://api.aced.live/api/multicard/invoice/$uuid" -ForegroundColor Gray

try {
    $getByUuidResponse = Invoke-RestMethod -Uri "https://api.aced.live/api/multicard/invoice/$uuid" -Method Get
    Write-Host "✅ Got invoice by UUID!" -ForegroundColor Green
    $getByUuidResponse | ConvertTo-Json -Depth 10
} catch {
    Write-Host "❌ Failed to get invoice by UUID" -ForegroundColor Red
    Write-Host "Error: $_" -ForegroundColor Red
    
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "Response Body: $responseBody" -ForegroundColor Red
    }
}

Write-Host "`n" -ForegroundColor White

# Step 5: Try to get invoice by invoiceId via YOUR API
Write-Host "📍 Step 5: Getting Invoice by InvoiceId via YOUR API..." -ForegroundColor Yellow
Write-Host "   Trying: https://api.aced.live/api/multicard/invoice/$invoiceId" -ForegroundColor Gray

try {
    $getByInvoiceIdResponse = Invoke-RestMethod -Uri "https://api.aced.live/api/multicard/invoice/$invoiceId" -Method Get
    Write-Host "✅ Got invoice by InvoiceId!" -ForegroundColor Green
    $getByInvoiceIdResponse | ConvertTo-Json -Depth 10
} catch {
    Write-Host "❌ Failed to get invoice by InvoiceId" -ForegroundColor Red
    Write-Host "Error: $_" -ForegroundColor Red
    
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "Response Body: $responseBody" -ForegroundColor Red
    }
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "🏁 TEST COMPLETE" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

if ($checkoutUrl) {
    Write-Host "🌐 You can test the payment page here:" -ForegroundColor Green
    Write-Host "   $checkoutUrl" -ForegroundColor White
    Write-Host ""
}