# CSRF Protection Test Script
# Tests all CSRF security scenarios

$baseUrl = "http://localhost:3000"
Write-Host "`n=== CSRF Protection Test Suite ===`n" -ForegroundColor Cyan

# Test 1: GET /csrf-token should succeed (safe method, no CSRF check)
Write-Host "Test 1: GET /csrf-token (should succeed)" -ForegroundColor Yellow
$response = curl.exe -X GET "$baseUrl/api/v1/auth/csrf-token" -s | ConvertFrom-Json
if ($response.success -and $response.csrfToken) {
    $csrfToken = $response.csrfToken
    Write-Host "✓ PASS: Got CSRF token: $($csrfToken.Substring(0, 20))..." -ForegroundColor Green
} else {
    Write-Host "✗ FAIL: No CSRF token received" -ForegroundColor Red
    exit 1
}

# Test 2: POST without CSRF token should fail (403)
Write-Host "`nTest 2: POST /request-otp without CSRF token (should fail 403)" -ForegroundColor Yellow
$response = curl.exe -X POST "$baseUrl/api/v1/auth/phone/request-otp" `
    -H "Content-Type: application/json" `
    -d '{"phoneNumber":"+996700123456"}' `
    -s -w "\n%{http_code}" 2>$null
$statusCode = ($response | Select-Object -Last 1)
if ($statusCode -eq "403") {
    Write-Host "✓ PASS: Request blocked with 403" -ForegroundColor Green
} else {
    Write-Host "✗ FAIL: Expected 403, got $statusCode" -ForegroundColor Red
}

# Test 3: POST with invalid CSRF token should fail (403)
Write-Host "`nTest 3: POST /request-otp with invalid token (should fail 403)" -ForegroundColor Yellow
$response = curl.exe -X POST "$baseUrl/api/v1/auth/phone/request-otp" `
    -H "Content-Type: application/json" `
    -H "X-CSRF-Token: invalid-token-12345" `
    -d '{"phoneNumber":"+996700123456"}' `
    -s -w "\n%{http_code}" 2>$null
$statusCode = ($response | Select-Object -Last 1)
if ($statusCode -eq "403") {
    Write-Host "✓ PASS: Invalid token rejected with 403" -ForegroundColor Green
} else {
    Write-Host "✗ FAIL: Expected 403, got $statusCode" -ForegroundColor Red
}

# Test 4: POST with valid CSRF token should succeed
Write-Host "`nTest 4: POST /request-otp with valid token (should succeed)" -ForegroundColor Yellow
# First get a fresh token with cookies
$cookieJar = "csrf-cookies.txt"
curl.exe -X GET "$baseUrl/api/v1/auth/csrf-token" -c $cookieJar -s | Out-Null
$tokenResponse = curl.exe -X GET "$baseUrl/api/v1/auth/csrf-token" -b $cookieJar -s | ConvertFrom-Json
$validToken = $tokenResponse.csrfToken

$response = curl.exe -X POST "$baseUrl/api/v1/auth/phone/request-otp" `
    -H "Content-Type: application/json" `
    -H "X-CSRF-Token: $validToken" `
    -b $cookieJar `
    -d '{"phoneNumber":"+996700123456"}' `
    -s -w "\n%{http_code}" 2>$null

$body = $response[0..($response.Length - 2)] -join "`n"
$statusCode = $response[-1]

if ($statusCode -eq "200") {
    Write-Host "✓ PASS: Request succeeded with valid token" -ForegroundColor Green
    $parsed = $body | ConvertFrom-Json
    Write-Host "  Response: $($parsed.message)" -ForegroundColor Gray
} else {
    Write-Host "✗ FAIL: Expected 200, got $statusCode" -ForegroundColor Red
    Write-Host "  Body: $body" -ForegroundColor Gray
}

# Test 5: Cross-origin request should fail
Write-Host "`nTest 5: Cross-origin POST (should fail 403)" -ForegroundColor Yellow
$response = curl.exe -X POST "$baseUrl/api/v1/auth/phone/request-otp" `
    -H "Content-Type: application/json" `
    -H "X-CSRF-Token: $validToken" `
    -H "Origin: https://evil.com" `
    -b $cookieJar `
    -d '{"phoneNumber":"+996700123456"}' `
    -s -w "\n%{http_code}" 2>$null
$statusCode = ($response | Select-Object -Last 1)
if ($statusCode -eq "403") {
    Write-Host "✓ PASS: Cross-origin request blocked" -ForegroundColor Green
} else {
    Write-Host "✗ FAIL: Expected 403, got $statusCode" -ForegroundColor Red
}

# Test 6: Safe methods (GET) should not require CSRF token
Write-Host "`nTest 6: GET /session without token (should not check CSRF)" -ForegroundColor Yellow
$response = curl.exe -X GET "$baseUrl/api/v1/auth/session" -s -w "\n%{http_code}" 2>$null
$statusCode = ($response | Select-Object -Last 1)
# Should be 401 (unauthorized) not 403 (CSRF failure)
if ($statusCode -ne "403") {
    Write-Host "✓ PASS: GET request not blocked by CSRF (status: $statusCode)" -ForegroundColor Green
} else {
    Write-Host "✗ FAIL: GET incorrectly blocked by CSRF" -ForegroundColor Red
}

# Test 7: DELETE should require CSRF token
Write-Host "`nTest 7: DELETE /logout without token (should fail 403)" -ForegroundColor Yellow
$response = curl.exe -X DELETE "$baseUrl/api/v1/auth/logout" -s -w "\n%{http_code}" 2>$null
$statusCode = ($response | Select-Object -Last 1)
if ($statusCode -eq "403") {
    Write-Host "✓ PASS: DELETE without token blocked" -ForegroundColor Green
} else {
    Write-Host "✗ FAIL: Expected 403, got $statusCode" -ForegroundColor Red
}

# Test 8: OPTIONS (preflight) should not require CSRF
Write-Host "`nTest 8: OPTIONS request (should not check CSRF)" -ForegroundColor Yellow
$response = curl.exe -X OPTIONS "$baseUrl/api/v1/auth/session" -s -w "\n%{http_code}" 2>$null
$statusCode = ($response | Select-Object -Last 1)
if ($statusCode -ne "403") {
    Write-Host "✓ PASS: OPTIONS request not blocked by CSRF" -ForegroundColor Green
} else {
    Write-Host "✗ FAIL: OPTIONS incorrectly blocked" -ForegroundColor Red
}

# Cleanup
if (Test-Path $cookieJar) {
    Remove-Item $cookieJar
}

Write-Host "`n=== Test Suite Complete ===`n" -ForegroundColor Cyan
