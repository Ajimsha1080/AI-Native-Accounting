# LedgerAE: Production Deployment Guide on Microsoft Azure

**Region:** `uaenorth` (Dubai, UAE)  
**Secondary / DR:** `uaecentral` (Abu Dhabi, UAE)  
**Statutory Compliance:** UAE Personal Data Protection Law (Federal Decree-Law No. 45 of 2021), UAE Corporate Tax Law (No. 47 of 2022), UAE VAT Law (No. 8 of 2017), and NESA / DESC ISR security standards.

---

## 1. Architectural Topology

```
                                [ Internet Users / Clients ]
                                             |
                         [ Azure Front Door / WAF (DDoS Shield) ]
                                             |
                                  [ UAE Virtual Network ]
                                      (10.0.0.0/16)
                                             |
                   +-------------------------+-------------------------+
                   |                                                   |
      [ Subnet: snet-containers ]                         [ Subnet: snet-database ]
             (10.0.1.0/24)                                       (10.0.2.0/24)
                   |                                                   |
         Azure Container Apps                               Azure Database for PostgreSQL
                   |                                                Flexible Server
         +---------+---------+                               (Private DNS Integration)
         |                   |                                         |
  [ Web Portal ]      [ FastAPI API ]                                  |
  (Next.js 16)         (Python 3.11) ----------------------------------+
   Port: 3000           Port: 8000
   Auto 2-8 rep         Auto 2-10 rep
         |                   |
         +---------+---------+
                   |
     +-------------+-------------+
     |                           |
[ Azure Key Vault ]    [ Azure OpenAI Service ]
(Secrets / TOTP Keys)  (Private VNet Endpoint)
```

---

## 2. Prerequisites

1. **Azure CLI**: Install via `winget install Microsoft.AzureCLI` or `brew install azure-cli`.
2. **Docker Desktop**: Running locally to build and tag container images.
3. **Active Azure Subscription** with permissions to create Resource Groups in `uaenorth`.

---

## 3. Quickstart: 1-Click Automated Deployment

### On Windows (PowerShell):
```powershell
# 1. Login to Azure
az login

# 2. Run the deployment script
.\infra\azure\deploy.ps1 -ResourceGroupName "rg-ledger-ae-prod" -Location "uaenorth"
```

### On Linux / macOS (Bash):
```bash
# 1. Login to Azure
az login

# 2. Make script executable and run
chmod +x ./infra/azure/deploy.sh
./infra/azure/deploy.sh
```

---

## 4. What Gets Provisioned Automatically

| Component | Azure Service | Specification |
| :--- | :--- | :--- |
| **Relational Database** | Azure Database for PostgreSQL Flexible Server | v16, `Standard_D2ds_v5` (2 vCPU, 8GB RAM), 128GB Auto-grow storage, 35-day backup retention. |
| **API Backend** | Azure Container Apps | Python 3.11 / FastAPI, 1.0 vCPU / 2GB RAM, autoscale 2–10 replicas. |
| **Web Portal** | Azure Container Apps | Next.js 16 App Router, 1.0 vCPU / 2GB RAM, autoscale 2–8 replicas. |
| **Image Registry** | Azure Container Registry (ACR) | Standard SKU with private authentication. |
| **AI LLM Gateway** | Azure OpenAI Service | `gpt-4o` deployment with zero-data-retention (ZDR) guarantee for statutory accounting compliance. |
| **Secrets & Encryption** | Azure Key Vault | Hardware-backed isolation for JWT secrets, TOTP master keys, and bank credentials. |
| **Observability** | Azure Log Analytics & App Insights | Centralized structured JSON log capture and performance telemetry. |

---

## 5. Continuous Deployment (CI/CD) with GitHub Actions

The repository includes [`.github/workflows/deploy-azure.yml`](../../.github/workflows/deploy-azure.yml).

To enable automated zero-downtime deployment on git push to `main`:
1. In your GitHub repository, navigate to **Settings > Secrets and variables > Actions**.
2. Add the following secrets:
   - `AZURE_CLIENT_ID`: Service Principal or Managed Identity App ID.
   - `AZURE_TENANT_ID`: Azure Active Directory / Entra ID Tenant ID.
   - `AZURE_SUBSCRIPTION_ID`: Azure Subscription ID.

---

## 6. Estimated Monthly Azure Run Cost (UAE North)

| Resource | Sizing / Tier | Est. Cost (USD) | Est. Cost (AED) |
| :--- | :--- | :--- | :--- |
| **PostgreSQL Flexible Server** | General Purpose `D2ds_v5` (2 vCPU, 8GB) | ~\$140 / mo | ~514 AED |
| **Azure Container Apps** | 2 Apps (min 2 replicas each, serverless active hours) | ~\$60 / mo | ~220 AED |
| **Azure Container Registry** | Standard SKU | ~\$20 / mo | ~73 AED |
| **Azure OpenAI (Inference)** | Pay-as-you-go per 1k tokens | ~\$30 - \$80 / mo | ~110 - 295 AED |
| **Log Analytics & Key Vault** | Pay-as-you-go data ingestion | ~\$15 / mo | ~55 AED |
| **Total Estimated Run Cost** | **Production High-Availability Setup** | **~\$265 - \$315 / mo** | **~970 - 1,155 AED** |
