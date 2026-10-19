#!/usr/bin/env bash
# ==============================================================================
# LedgerAE: Microsoft Azure Automated Production Deployment Script (Bash)
# Jurisdiction: UAE (uaenorth - Dubai)
# ==============================================================================

set -euo pipefail

RESOURCE_GROUP="${RESOURCE_GROUP:-rg-ledger-ae-prod}"
LOCATION="${LOCATION:-uaenorth}"
PREFIX="${PREFIX:-ledgeraeprod}"
DB_ADMIN_USER="${DB_ADMIN_USER:-ledger_admin}"
DB_PASSWORD="${DB_PASSWORD:-$(openssl rand -base64 16)!Aa1}"
JWT_SECRET="${JWT_SECRET:-$(openssl rand -base64 32)}"
TOTP_KEY="${TOTP_KEY:-$(openssl rand -base64 32)}"
LANGSMITH_KEY="${LANGSMITH_KEY:-}"

echo -e "\033[1;36m==========================================================\033[0m"
echo -e "\033[1;36m  LedgerAE: Microsoft Azure Production Deployment (UAE)  \033[0m"
echo -e "\033[1;36m==========================================================\033[0m"

# 1. Check Azure CLI
echo -e "\n\033[1;33m[1/7] Verifying Azure CLI authentication...\033[0m"
az account show --output table || { echo "Please run 'az login' first."; exit 1; }

# 2. Create Resource Group in UAE North
echo -e "\n\033[1;33m[2/7] Creating Resource Group: ${RESOURCE_GROUP} in ${LOCATION}...\033[0m"
az group create --name "${RESOURCE_GROUP}" --location "${LOCATION}" --output table

# 3. Deploy Infrastructure via Bicep
echo -e "\n\033[1;33m[3/7] Deploying Infrastructure via Bicep (Postgres, ACA, ACR, OpenAI)...\033[0m"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"

DEPLOY_OUTPUT=$(az deployment group create \
    --resource-group "${RESOURCE_GROUP}" \
    --template-file "${SCRIPT_DIR}/main.bicep" \
    --parameters \
        location="${LOCATION}" \
        prefix="${PREFIX}" \
        dbAdminUser="${DB_ADMIN_USER}" \
        dbAdminPassword="${DB_PASSWORD}" \
        jwtSecret="${JWT_SECRET}" \
        totpEncryptionKey="${TOTP_KEY}" \
        langsmithApiKey="${LANGSMITH_KEY}" \
    --output json)

ACR_SERVER=$(echo "${DEPLOY_OUTPUT}" | jq -r '.properties.outputs.acrLoginServer.value')
BACKEND_URL=$(echo "${DEPLOY_OUTPUT}" | jq -r '.properties.outputs.backendUrl.value')
WEB_URL=$(echo "${DEPLOY_OUTPUT}" | jq -r '.properties.outputs.webPortalUrl.value')
OPENAI_ENDPOINT=$(echo "${DEPLOY_OUTPUT}" | jq -r '.properties.outputs.azureOpenAiEndpoint.value')

# 4. Build and Push Containers
echo -e "\n\033[1;33m[4/7] Logging into ACR: ${ACR_SERVER}...\033[0m"
az acr login --name "${ACR_SERVER}"

echo -e "\n\033[1;33m[5/7] Building & Pushing Container Images...\033[0m"
docker build -t "${ACR_SERVER}/ledger-ae-backend:latest" -f "${ROOT_DIR}/backend/Dockerfile" "${ROOT_DIR}/backend"
docker push "${ACR_SERVER}/ledger-ae-backend:latest"

docker build -t "${ACR_SERVER}/ledger-ae-web:latest" -f "${ROOT_DIR}/infra/docker/Dockerfile.web" "${ROOT_DIR}"
docker push "${ACR_SERVER}/ledger-ae-web:latest"

# 6. Update Container Apps
echo -e "\n\033[1;33m[6/7] Updating Azure Container Apps...\033[0m"
az containerapp update --name "ca-${PREFIX}-backend" --resource-group "${RESOURCE_GROUP}" --image "${ACR_SERVER}/ledger-ae-backend:latest" --output none
az containerapp update --name "ca-${PREFIX}-web" --resource-group "${RESOURCE_GROUP}" --image "${ACR_SERVER}/ledger-ae-web:latest" --output none

# 7. Summary
echo -e "\n\033[1;32m[7/7] Deployment Complete!\033[0m"
echo -e "\033[1;36m==========================================================\033[0m"
echo -e "  Web Portal URL:       \033[1;37m${WEB_URL}\033[0m"
echo -e "  FastAPI Backend API:  \033[1;37m${BACKEND_URL}\033[0m"
echo -e "  Swagger API Docs:     \033[1;37m${BACKEND_URL}/docs\033[0m"
echo -e "  Azure OpenAI Endpoint:\033[1;37m${OPENAI_ENDPOINT}\033[0m"
echo -e "  Region:               \033[1;37m${LOCATION} (Dubai, UAE)\033[0m"
echo -e "\033[1;36m==========================================================\033[0m"
