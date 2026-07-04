$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$temporaryDirectory = Join-Path $projectRoot '.integration-temp'
$brokerName = 'mqtttree-test-broker'
$certificateName = 'mqtttree-cert-generator'

function Remove-TestContainer([string]$name) {
  $existing = docker ps -aq --filter "name=^/$name$"
  if ($existing) {
    docker rm -f $name | Out-Null
  }
}

function Assert-PortAvailable([int]$port) {
  $listener = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  if ($listener) {
    throw "Port $port is already in use. Stop that listener before running integration tests."
  }
}

Push-Location $projectRoot
try {
  Assert-PortAvailable 8883
  Assert-PortAvailable 8084
  New-Item -ItemType Directory -Force $temporaryDirectory | Out-Null
  Remove-TestContainer $brokerName
  Remove-TestContainer $certificateName

  docker run -d --name $certificateName emqx:5 | Out-Null
  docker exec $certificateName openssl req `
    -x509 `
    -newkey rsa:2048 `
    -nodes `
    -keyout /tmp/localhost.key `
    -out /tmp/localhost.crt `
    -days 2 `
    -subj /CN=localhost `
    -addext subjectAltName=DNS:localhost,IP:127.0.0.1 | Out-Null
  docker cp "${certificateName}:/tmp/localhost.crt" "$temporaryDirectory/localhost.crt" | Out-Null
  docker cp "${certificateName}:/tmp/localhost.key" "$temporaryDirectory/localhost.key" | Out-Null
  Remove-TestContainer $certificateName

  $certificatePath = (Resolve-Path $temporaryDirectory).Path
  docker run -d `
    --name $brokerName `
    -p 8883:8883 `
    -p 8084:8084 `
    -v "${certificatePath}:/certs:ro" `
    -e EMQX_LISTENERS__SSL__DEFAULT__SSL_OPTIONS__CACERTFILE=/certs/localhost.crt `
    -e EMQX_LISTENERS__SSL__DEFAULT__SSL_OPTIONS__CERTFILE=/certs/localhost.crt `
    -e EMQX_LISTENERS__SSL__DEFAULT__SSL_OPTIONS__KEYFILE=/certs/localhost.key `
    -e EMQX_LISTENERS__WSS__DEFAULT__SSL_OPTIONS__CACERTFILE=/certs/localhost.crt `
    -e EMQX_LISTENERS__WSS__DEFAULT__SSL_OPTIONS__CERTFILE=/certs/localhost.crt `
    -e EMQX_LISTENERS__WSS__DEFAULT__SSL_OPTIONS__KEYFILE=/certs/localhost.key `
    emqx:5 | Out-Null

  $deadline = (Get-Date).AddSeconds(45)
  do {
    $logs = docker logs $brokerName 2>&1
    $logText = $logs | Out-String
    if ($logText -match 'EMQX .* is running now') {
      break
    }
    Start-Sleep -Seconds 2
  } while ((Get-Date) -lt $deadline)
  if ($logText -notmatch 'EMQX .* is running now') {
    throw "EMQX did not become ready within 45 seconds.`n$logText"
  }

  $env:RUN_MQTT_INTEGRATION = '1'
  $env:MQTT_TEST_CA = Join-Path $temporaryDirectory 'localhost.crt'
  & npm.cmd test -- src/integration/emqx.integration.test.ts
  if ($LASTEXITCODE -ne 0) {
    throw "MQTT integration tests failed with exit code $LASTEXITCODE."
  }
}
finally {
  Remove-TestContainer $certificateName
  Remove-TestContainer $brokerName
  Pop-Location
}
