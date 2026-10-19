# ==============================================================================
# LedgerAE: Microsoft Azure Automated Production Deployment Script
# Jurisdiction: UAE (uaenorth - Dubai)
# ==============================================================================

[CmdletBinding()]
param(
    [string]$ResourceGroupName = "rg-ledger-ae-prod",
    [string]$Location = "uaenorth",
    [string]$Prefix = "ledgeraeprod",
    [string]$DbAdminUser = "ledger_admin",
    [string]$DbPassword = "",
    [string]$JwtSecret = "",
    [string]$TotpKey = "",
    [string]$LangSmithKey = ""
)

$ErrorActionPreference = "Stop"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  LedgerAE: Microsoft Azure Production Deployment (UAE)  " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Check Azure CLI
Write-Host "`n[1/7] Verifying Azure CLI authentication..." -ForegroundColor Yellow
try {
    $account = az account show --output json | ConvertFrom-Json
    Write-Host "  Logged in as: $($account.user.name)" -ForegroundColor Green
    Write-Host "  Subscription: $($account.name) ($($account.id))" -ForegroundColor Green
} catch {
    Write-Error "Please run 'az login' before executing this deployment script."
    exit 1
}

# 2. Generate Cryptographic Secrets if not provided
Write-Host "`n[2/7] Preparing cryptographic keys & credentials..." -ForegroundColor Yellow

if (-not $DbPassword) {
    $bytes = New-Object byte[] 18
    (New-Object Security.Cryptography.RNGCryptoServiceProvider).GetBytes($bytes)
    $DbPassword = [Convert]::ToBase64String($bytes) + "!Aa1"
    Write-Host "  Generated DB Admin Password." -ForegroundColor Gray
}

if (-not $JwtSecret) {
    $bytes = New-Object byte[] 32
    (New-Object Security.Cryptography.RNGCryptoServiceProvider).GetBytes($bytes)
    $JwtSecret = [Convert]::ToBase64String($bytes)
    Write-Host "  Generated 256-bit JWT Secret Key." -ForegroundColor Gray
}

if (-not $TotpKey) {
    $bytes = New-Object byte[] 32
    (New-Object Security.Cryptography.RNGCryptoServiceProvider).GetBytes($bytes)
    $TotpKey = [Convert]::ToBase64String($bytes)
    Write-Host "  Generated 256-bit TOTP Master Key." -ForegroundColor Gray
}

# 3. Create Resource Group in UAE North (Dubai)
Write-Host "`n[3/7] Provisioning Azure Resource Group in $Location..." -ForegroundColor Yellow
az group create --name $ResourceGroupName --location $Location --output table

# 4. Deploy Infrastructure via Bicep
Write-Host "`n[4/7] Deploying Infrastructure via Bicep (Postgres, ACA, ACR, OpenAI)..." -ForegroundColor Yellow
Write-Host "  This provisions private networking, DB v16, and container environments..." -ForegroundColor Gray

$bicepPath = Join-Path $PSScriptRoot "main.bicep"

$deployResult = az deployment group create `
    --resource-group $ResourceGroupName `
    --template-file $bicepPath `
    --parameters `
        location=$Location `
        prefix=$Prefix `
        dbAdminUser=$DbAdminUser `
        dbAdminPassword=$DbPassword `
        jwtSecret=$JwtSecret `
        totpEncryptionKey=$TotpKey `
        langsmithApiKey=$LangSmithKey `
    --output json | ConvertFrom-Json

$acrServer = $deployResult.properties.outputs.acrLoginServer.value
$backendFqdn = $deployResult.properties.outputs.backendUrl.value
$webFqdn = $deployResult.properties.outputs.webPortalUrl.value
$openaiEndpoint = $deployResult.properties.outputs.azureOpenAiEndpoint.value

Write-Host "  Azure Infrastructure deployed successfully!" -ForegroundColor Green

# 5. Build and Push Container Images to ACR
Write-Host "`n[5/7] Building & Pushing Container Images to ACR ($acrServer)..." -ForegroundColor Yellow

Write-Host "  Logging in to Azure Container Registry..." -ForegroundColor Gray
az acr login --name $acrServer

$rootDir = (Get-Item $PSScriptRoot).Parent.Parent.FullName
$backendDir = Join-Path $rootDir "backend"

Write-Host "  Building Backend image (FastAPI)..." -ForegroundColor Gray
docker build -t "$acrServer/ledger-ae-backend:latest" -f "$backendDir/Dockerfile" "$backendDir"
docker push "$acrServer/ledger-ae-backend:latest"

Write-Host "  Building Web Portal image (Next.js)..." -ForegroundColor Gray
docker build -t "$acrServer/ledger-ae-web:latest" -f "$rootDir/infra/docker/Dockerfile.web" "$rootDir"
docker push "$acrServer/ledger-ae-web:latest"

# 6. Refresh Azure Container Apps with New Images
Write-Host "`n[6/7] Updating Container Apps with fresh images..." -ForegroundColor Yellow
az containerapp update `
    --name "ca-$Prefix-backend" `
    --resource-group $ResourceGroupName `
    --image "$acrServer/ledger-ae-backend:latest" `
    --output none

az containerapp update `
    --name "ca-$Prefix-web" `
    --resource-group $ResourceGroupName `
    --image "$acrServer/ledger-ae-web:latest" `
    --output none

# 7. Summary and Verification
Write-Host "`n[7/7] Deployment Complete! Live Sovereign Endpoints:" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  Web Portal URL:       $webFqdn" -ForegroundColor White
Write-Host "  FastAPI Backend API:  $backendFqdn" -ForegroundColor White
Write-Host "  Swagger API Docs:     $backendFqdn/docs" -ForegroundColor White
Write-Host "  Azure OpenAI Endpoint:$openaiEndpoint" -ForegroundColor White
Write-Host "  Region:               $Location (Dubai, UAE)" -ForegroundColor White
Write-Host "  Jurisdiction:         UAE PDPL (Decree-Law 45/2021) Compliant" -ForegroundColor White
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "`nCredentials Saved in Azure Key Vault: kv-$Prefix" -ForegroundColor Yellow
