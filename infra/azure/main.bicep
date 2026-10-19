// ==============================================================================
// LedgerAE: Azure Enterprise Production Infrastructure (Bicep)
// Jurisdiction: UAE (uaenorth - Dubai / uaecentral - Abu Dhabi)
// Statutory Compliance: UAE PDPL (Federal Decree-Law No. 45/2021) & NESA/DESC ISR
// ==============================================================================

@description('Azure deployment region. Default: uaenorth (Dubai)')
param location string = 'uaenorth'

@description('Deployment environment tag')
param environment string = 'prod'

@description('Base prefix for all resource naming')
param prefix string = 'ledgeraeprod'

@description('PostgreSQL Administrator Login Name')
param dbAdminUser string = 'ledger_admin'

@description('PostgreSQL Administrator Password')
@secure()
param dbAdminPassword string

@description('Application JWT Secret Key (minimum 32 characters)')
@secure()
param jwtSecret string

@description('TOTP Encryption Key (minimum 32 characters)')
@secure()
param totpEncryptionKey string

@description('LangSmith API Key for Enterprise Observability (Optional)')
@secure()
param langsmithApiKey string = ''

@description('LangSmith Project Name')
param langsmithProject string = 'ledger-ae-accounting'

// ------------------------------------------------------------------------------
// 1. Log Analytics & Application Insights
// ------------------------------------------------------------------------------
resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: 'log-${prefix}'
  location: location
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 90
  }
}

resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: 'appi-${prefix}'
  location: location
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logAnalytics.id
  }
}

// ------------------------------------------------------------------------------
// 2. Azure Key Vault (OWASP ASVS L2 Secret Isolation)
// ------------------------------------------------------------------------------
resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: 'kv-${prefix}'
  location: location
  properties: {
    sku: {
      family: 'A'
      name: 'standard'
    }
    tenantId: subscription().tenantId
    enableRbacAuthorization: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 90
  }
}

// ------------------------------------------------------------------------------
// 3. Azure Container Registry (ACR)
// ------------------------------------------------------------------------------
resource acr 'Microsoft.ContainerRegistry/registries@2023-11-01-preview' = {
  name: 'cr${prefix}'
  location: location
  sku: {
    name: 'Standard'
  }
  properties: {
    adminUserEnabled: true
  }
}

// ------------------------------------------------------------------------------
// 4. Virtual Network & Subnets
// ------------------------------------------------------------------------------
resource vnet 'Microsoft.Network/virtualNetworks@2023-11-01' = {
  name: 'vnet-${prefix}'
  location: location
  properties: {
    addressSpace: {
      addressPrefixes: [
        '10.0.0.0/16'
      ]
    }
    subnets: [
      {
        name: 'snet-containers'
        properties: {
          addressPrefix: '10.0.1.0/24'
          delegations: [
            {
              name: 'delegation-aca'
              properties: {
                serviceName: 'Microsoft.App/environments'
              }
            }
          ]
        }
      }
      {
        name: 'snet-database'
        properties: {
          addressPrefix: '10.0.2.0/24'
          delegations: [
            {
              name: 'delegation-postgres'
              properties: {
                serviceName: 'Microsoft.DBforPostgreSQL/flexibleServers'
              }
            }
          ]
        }
      }
    ]
  }
}

resource privateDnsZonePostgres 'Microsoft.Network/privateDnsZones@2020-06-01' = {
  name: '${prefix}.private.postgres.database.azure.com'
  location: 'global'
}

resource privateDnsZoneLink 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2020-06-01' = {
  parent: privateDnsZonePostgres
  name: 'link-${prefix}'
  location: 'global'
  properties: {
    virtualNetwork: {
      id: vnet.id
    }
    registrationEnabled: false
  }
}

// ------------------------------------------------------------------------------
// 5. Azure Database for PostgreSQL Flexible Server (UAE North)
// ------------------------------------------------------------------------------
resource postgresServer 'Microsoft.DBforPostgreSQL/flexibleServers@2023-12-01-preview' = {
  name: 'psql-${prefix}'
  location: location
  sku: {
    name: 'Standard_D2ds_v5'
    tier: 'GeneralPurpose'
  }
  properties: {
    version: '16'
    administratorLogin: dbAdminUser
    administratorLoginPassword: dbAdminPassword
    network: {
      delegatedSubnetResourceId: '${vnet.id}/subnets/snet-database'
      privateDnsZoneArmResourceId: privateDnsZonePostgres.id
    }
    highAvailability: {
      mode: 'Disabled'
    }
    storage: {
      storageSizeGB: 128
      autoGrow: 'Enabled'
    }
    backup: {
      backupRetentionDays: 35
      geoRedundantBackup: 'Disabled'
    }
  }
  dependsOn: [
    privateDnsZoneLink
  ]
}

resource postgresDatabase 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2023-12-01-preview' = {
  parent: postgresServer
  name: 'ledger_ae_prod'
  properties: {
    charset: 'UTF8'
    collation: 'en_US.utf8'
  }
}

// ------------------------------------------------------------------------------
// 6. Azure OpenAI Service (Private Statutory AI Grounding)
// ------------------------------------------------------------------------------
resource cognitiveAccount 'Microsoft.CognitiveServices/accounts@2023-10-01-preview' = {
  name: 'oai-${prefix}'
  location: location
  sku: {
    name: 'S0'
  }
  kind: 'OpenAI'
  properties: {
    customSubDomainName: 'oai-${prefix}'
    publicNetworkAccess: 'Enabled'
  }
}

resource gpt4oDeployment 'Microsoft.CognitiveServices/accounts/deployments@2023-10-01-preview' = {
  parent: cognitiveAccount
  name: 'gpt-4o'
  sku: {
    name: 'Standard'
    capacity: 30
  }
  properties: {
    model: {
      format: 'OpenAI'
      name: 'gpt-4o'
      version: '2024-05-13'
    }
    versionUpgradeOption: 'OnceCurrentVersionExpired'
  }
}

// ------------------------------------------------------------------------------
// 7. Azure Container Apps Managed Environment
// ------------------------------------------------------------------------------
resource containerAppEnv 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: 'cae-${prefix}'
  location: location
  properties: {
    vnetConfiguration: {
      infrastructureSubnetId: '${vnet.id}/subnets/snet-containers'
      internal: false
    }
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalytics.properties.customerId
        sharedKey: logAnalytics.listKeys().primarySharedKey
      }
    }
  }
}

// ------------------------------------------------------------------------------
// 8. Azure Container App: FastAPI Backend
// ------------------------------------------------------------------------------
resource backendApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: 'ca-${prefix}-backend'
  location: location
  properties: {
    managedEnvironmentId: containerAppEnv.id
    configuration: {
      ingress: {
        external: true
        targetPort: 8000
        transport: 'auto'
        corsPolicy: {
          allowedOrigins: [
            '*'
          ]
          allowedMethods: [
            'GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'
          ]
          allowedHeaders: [
            '*'
          ]
          allowCredentials: true
        }
      }
      registries: [
        {
          server: acr.properties.loginServer
          username: acr.listCredentials().username
          passwordSecretRef: 'acr-password'
        }
      ]
      secrets: [
        {
          name: 'acr-password'
          value: acr.listCredentials().passwords[0].value
        }
        {
          name: 'db-url'
          value: 'postgresql+asyncpg://${dbAdminUser}:${dbAdminPassword}@${postgresServer.properties.fullyQualifiedDomainName}/ledger_ae_prod'
        }
        {
          name: 'jwt-secret'
          value: jwtSecret
        }
        {
          name: 'totp-key'
          value: totpEncryptionKey
        }
        {
          name: 'openai-key'
          value: cognitiveAccount.listKeys().key1
        }
        {
          name: 'langsmith-key'
          value: langsmithApiKey
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'backend'
          image: '${acr.properties.loginServer}/ledger-ae-backend:latest'
          resources: {
            cpu: json('1.0')
            memory: '2.0Gi'
          }
          env: [
            {
              name: 'NODE_ENV'
              value: environment
            }
            {
              name: 'PORT'
              value: '8000'
            }
            {
              name: 'DATABASE_URL'
              secretRef: 'db-url'
            }
            {
              name: 'JWT_SECRET'
              secretRef: 'jwt-secret'
            }
            {
              name: 'TOTP_ENCRYPTION_KEY'
              secretRef: 'totp-key'
            }
            {
              name: 'OPENAI_API_KEY'
              secretRef: 'openai-key'
            }
            {
              name: 'AZURE_OPENAI_ENDPOINT'
              value: cognitiveAccount.properties.endpoint
            }
            {
              name: 'LANGSMITH_API_KEY'
              secretRef: 'langsmith-key'
            }
            {
              name: 'LANGSMITH_PROJECT'
              value: langsmithProject
            }
            {
              name: 'LANGSMITH_TRACING'
              value: !empty(langsmithApiKey) ? 'true' : 'false'
            }
          ]
          probes: [
            {
              type: 'Liveness'
              httpGet: {
                path: '/health'
                port: 8000
              }
              periodSeconds: 15
            }
          ]
        }
      ]
      scale: {
        minReplicas: 2
        maxReplicas: 10
        rules: [
          {
            name: 'http-scaling'
            http: {
              metadata: {
                concurrentRequests: '50'
              }
            }
          }
        ]
      }
    }
  }
}

// ------------------------------------------------------------------------------
// 9. Azure Container App: Next.js Web Portal
// ------------------------------------------------------------------------------
resource webApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: 'ca-${prefix}-web'
  location: location
  properties: {
    managedEnvironmentId: containerAppEnv.id
    configuration: {
      ingress: {
        external: true
        targetPort: 3000
        transport: 'auto'
      }
      registries: [
        {
          server: acr.properties.loginServer
          username: acr.listCredentials().username
          passwordSecretRef: 'acr-password'
        }
      ]
      secrets: [
        {
          name: 'acr-password'
          value: acr.listCredentials().passwords[0].value
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'web'
          image: '${acr.properties.loginServer}/ledger-ae-web:latest'
          resources: {
            cpu: json('1.0')
            memory: '2.0Gi'
          }
          env: [
            {
              name: 'NODE_ENV'
              value: 'production'
            }
            {
              name: 'PORT'
              value: '3000'
            }
            {
              name: 'BACKEND_API_URL'
              value: 'https://${backendApp.properties.configuration.ingress.fqdn}'
            }
          ]
        }
      ]
      scale: {
        minReplicas: 2
        maxReplicas: 8
        rules: [
          {
            name: 'http-scaling'
            http: {
              metadata: {
                concurrentRequests: '100'
              }
            }
          }
        ]
      }
    }
  }
}

// ------------------------------------------------------------------------------
// Outputs
// ------------------------------------------------------------------------------
output acrLoginServer string = acr.properties.loginServer
output postgresFqdn string = postgresServer.properties.fullyQualifiedDomainName
output backendUrl string = 'https://${backendApp.properties.configuration.ingress.fqdn}'
output webPortalUrl string = 'https://${webApp.properties.configuration.ingress.fqdn}'
output azureOpenAiEndpoint string = cognitiveAccount.properties.endpoint
