param(
  [string]$AppUrl = "https://aegis-sigma-ten.vercel.app",
  [string]$VoiceBridgeUrl = "https://aegis-voice-bridge.onrender.com",
  [string]$ToNumber = "+447367172076",
  [string]$FromNumber = "+447380729111"
)

$ErrorActionPreference = "Stop"

function Invoke-Check {
  param(
    [string]$Name,
    [scriptblock]$Action
  )

  try {
    $result = & $Action
    [pscustomobject]@{
      Check = $Name
      Status = "PASS"
      Detail = $result
    }
  }
  catch {
    [pscustomobject]@{
      Check = $Name
      Status = "FAIL"
      Detail = $_.Exception.Message
    }
  }
}

$voiceResponse = Invoke-Check "Voice webhook" {
  $response = Invoke-WebRequest `
    -Uri "$AppUrl/api/twilio/voice-script" `
    -Method Post `
    -UseBasicParsing `
    -Body @{
      From = $FromNumber
      To = $ToNumber
      Direction = "inbound"
    } `
    -TimeoutSec 20

  if ($response.Content -notmatch "<Connect><Stream") {
    throw "Unexpected TwiML: $($response.Content)"
  }

  "release=$($response.Headers['X-AEGIS-Release'])"
}

$smsResponse = Invoke-Check "SMS webhook" {
  $response = Invoke-WebRequest `
    -Uri "$AppUrl/api/twilio/sms" `
    -Method Post `
    -UseBasicParsing `
    -Body @{
      From = $FromNumber
      To = $ToNumber
      Body = "healthcheck"
      MessageSid = "SM-healthcheck"
    } `
    -TimeoutSec 20

  if ($response.Content -notmatch "<Message>") {
    throw "Unexpected TwiML: $($response.Content)"
  }

  "release=$($response.Headers['X-AEGIS-Release'])"
}

$appHealth = Invoke-Check "App ops health" {
  $response = Invoke-WebRequest -Uri "$AppUrl/api/health/ops" -UseBasicParsing -TimeoutSec 20
  $payload = $response.Content | ConvertFrom-Json

  if (-not $payload.ok) {
    throw "App health not ok: $($response.Content)"
  }

  if (-not $payload.twilio.matchedWorkspaceId) {
    throw "Twilio number is not mapped to a workspace: $($response.Content)"
  }

  "release=$($payload.releaseVersion); workspace=$($payload.twilio.matchedWorkspaceName)"
}

$bridgeHealth = Invoke-Check "Voice bridge health" {
  $response = Invoke-WebRequest -Uri "$VoiceBridgeUrl/health" -UseBasicParsing -TimeoutSec 20
  $payload = $response.Content | ConvertFrom-Json

  if (-not $payload.ok) {
    throw "Bridge health not ok: $($response.Content)"
  }

  "release=$($payload.releaseVersion)"
}

$results = @($voiceResponse, $smsResponse, $appHealth, $bridgeHealth)
$results | Format-Table -AutoSize

$failed = $results | Where-Object { $_.Status -eq "FAIL" }
if ($failed) {
  exit 1
}
