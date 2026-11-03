# LedgerAE Kubernetes (K8s) Production Deployment Guide

Production-grade Kubernetes manifests and Helm Chart for **LedgerAE** — AI-Native Financial ERP engineered for the United Arab Emirates (UAE).

---

## 1. Architecture Overview

```
                                      Internet / Clients
                                              │
                                              ▼
                             ┌─────────────────────────────────┐
                             │       Kubernetes Ingress        │
                             │  (NGINX / AWS ALB / Azure AppGW)│
                             │   TLS Cert via cert-manager     │
                             └───────────────┬─────────────────┘
                                             │
                   ┌─────────────────────────┴────────────────────────┐
                   │                                                  │
                   ▼                                                  ▼
     ┌────────────────────────────┐                     ┌────────────────────────────┐
     │  ledger-web (Next.js)      │                     │  ledger-backend (FastAPI)  │
     │  Port: 3000                │───Internal Proxy───▶│  Port: 8000                │
     │  Replicas: 3 (HPA 3-10)    │                     │  Replicas: 2 (HPA 2-10)    │
     │  RunAsUser: 1001           │                     │  RunAsUser: 10001          │
     └─────────────┬──────────────┘                     └─────────────┬──────────────┘
                   │                                                  │
                   │               ┌──────────────────┐               │
                   └──────────────▶│  Temporal Worker │◀──────────────┘
                                   │  Replicas: 2     │
                                   └─────────┬────────┘
                                             │
       ┌──────────────────┬──────────────────┼──────────────────┬──────────────────┐
       ▼                  ▼                  ▼                  ▼                  ▼
┌──────────────┐   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
│  PostgreSQL  │   │ Redis Cache  │   │ MinIO / S3   │   │   Temporal   │   │ Claude 3.7   │
│  16 + Vector │   │ ClusterLock  │   │ 10-Yr Archive│   │  Server/UI   │   │ Anthropic AI │
└──────────────┘   └──────────────┘   └──────────────┘   └──────────────┘   └──────────────┘
```

### Components Deployed
1. **Frontend**: Next.js App Router standalone container with SSR & RTL Arabic localization.
2. **Backend**: Python FastAPI authoritative financial domain services, double-entry ledger, and UAE tax engine.
3. **Worker**: Temporal worker orchestrating month-end close, automated accruals, WPS SIF generation, and Peppol retries.
4. **Data Layer**: PostgreSQL 16 with pgvector & row-level security (RLS), Redis 7.2 distributed locking, and MinIO S3 immutable storage.
5. **Autoscaling & Resilience**: HorizontalPodAutoscalers (HPA), zero-downtime rolling updates, and least-privilege non-root containers.
6. **Zero-Trust Networking**: Kubernetes NetworkPolicies restricting pod-to-pod communication.

---

## 2. Directory Structure

```
infra/k8s/
├── README.md                     # This deployment guide
├── kustomization.yaml            # Top-level Kustomize orchestrator
├── ledger-ae-prod.yaml           # Consolidated single-file manifest
├── manifests/                    # Modular Kubernetes resources
│   ├── 00-namespace.yaml         # Namespace with Pod Security Standards
│   ├── 01-configmap.yaml         # Shared non-secret configuration
│   ├── 02-secrets.yaml           # Production secret placeholders
│   ├── 03-serviceaccounts.yaml   # Non-root dedicated ServiceAccounts
│   ├── 04-network-policies.yaml  # Zero-trust network segmentation
│   ├── 05-postgres.yaml          # PostgreSQL 16 + pgvector StatefulSet
│   ├── 06-redis.yaml             # Redis 7.2 Alpine deployment
│   ├── 07-minio.yaml             # MinIO S3 object storage deployment
│   ├── 08-temporal.yaml          # Temporal Server deployment
│   ├── 09-migration-job.yaml     # Pre-deployment schema migration Job
│   ├── 10-backend.yaml           # FastAPI Backend Deployment & Service
│   ├── 11-web.yaml               # Next.js Web Deployment & Service
│   ├── 12-worker.yaml            # Temporal Worker Deployment
│   ├── 13-hpa.yaml               # Horizontal Pod Autoscalers
│   ├── 14-ingress.yaml           # Ingress with TLS & SSL redirect
│   └── kustomization.yaml        # Manifests Kustomize index
└── helm/
    └── ledger-ae/                # Production Helm v3 Chart
        ├── Chart.yaml
        ├── values.yaml           # Default deployment parameters
        └── templates/            # Parameterized chart templates
```

---

## 3. Quickstart Deployment

### Option A: Deploy via Kustomize (Recommended)
```bash
# 1. Inspect manifests
kubectl kustomize infra/k8s

# 2. Deploy all components
kubectl apply -k infra/k8s

# 3. Check deployment status
kubectl get pods -n ledger-ae -w
```

### Option B: Deploy via Helm v3
```bash
# 1. Install or upgrade chart
helm upgrade --install ledger-ae ./infra/k8s/helm/ledger-ae \
  --namespace ledger-ae \
  --create-namespace \
  --values ./infra/k8s/helm/ledger-ae/values.yaml

# 2. Verify status
helm status ledger-ae -n ledger-ae
```

### Option C: Deploy via Single-File Manifest
```bash
kubectl apply -f infra/k8s/ledger-ae-prod.yaml
```

---

## 4. Container Image Build & Push

Build all four production images from the monorepo root:

```bash
# Set your container registry (e.g., AWS ECR, Azure ACR, or Docker Hub)
REGISTRY="your-registry.azurecr.io/ledger-ae"
VERSION="1.0.0"

# 1. Build Next.js Web Frontend
docker build -f infra/docker/Dockerfile.web -t ${REGISTRY}/web:${VERSION} .
docker push ${REGISTRY}/web:${VERSION}

# 2. Build Python FastAPI Backend
docker build -f backend/Dockerfile -t ${REGISTRY}/backend:${VERSION} ./backend
docker push ${REGISTRY}/backend:${VERSION}

# 3. Build Temporal Worker
docker build -f infra/docker/Dockerfile.worker -t ${REGISTRY}/worker:${VERSION} .
docker push ${REGISTRY}/worker:${VERSION}

# 4. Build Schema Migration Runner
docker build -f infra/docker/Dockerfile.migrate -t ${REGISTRY}/migrate:${VERSION} .
docker push ${REGISTRY}/migrate:${VERSION}
```

---

## 5. Production Secrets Management

Before launching in production, replace the default secrets in `02-secrets.yaml` with cryptographically random keys or inject them via **External Secrets Operator** / **HashiCorp Vault** / **AWS Secrets Manager** / **Azure Key Vault**:

| Key | Description | Requirement |
| :--- | :--- | :--- |
| `database-url` | Connection string for Web & Worker | PostgreSQL 16 SSL required |
| `backend-database-url` | Connection string for FastAPI AsyncPG | `postgresql+asyncpg://...` |
| `jwt-secret` | HMAC-SHA256 session token signature | ≥ 32 bytes (256-bit entropy) |
| `totp-encryption-key` | AES-256-GCM 2FA secret encryption key | ≥ 32 bytes (256-bit entropy) |
| `nextauth-secret` | NextAuth cookie signing key | ≥ 32 bytes |
| `anthropic-api-key` | Claude 3.7 Sonnet API key | Real production key |
| `s3-access-key` / `s3-secret-key` | S3 / MinIO storage credentials | 10-year immutable archive |
| `redis-password` | Redis authentication token | High entropy string |

---

## 6. Verification & Health Monitoring

### 1. Pod Health & Readiness
```bash
kubectl get pods -n ledger-ae -o wide
```
Expected output:
```
NAME                                     READY   STATUS    RESTARTS   AGE
ledger-backend-7bf4958f6-2z7v9           1/1     Running   0          2m
ledger-backend-7bf4958f6-k8lmn           1/1     Running   0          2m
ledger-web-545c99d6fb-4x8w1              1/1     Running   0          2m
ledger-web-545c99d6fb-b6zqp              1/1     Running   0          2m
ledger-web-545c99d6fb-v9fgt              1/1     Running   0          2m
ledger-temporal-worker-6789fd4f5-5d9p2   1/1     Running   0          2m
ledger-temporal-worker-6789fd4f5-8m2l1   1/1     Running   0          2m
```

### 2. Verify Health Endpoints
```bash
# Port-forward backend service
kubectl port-forward svc/ledger-backend-svc 8000:8000 -n ledger-ae &
curl -i http://localhost:8000/health

# Port-forward web frontend
kubectl port-forward svc/ledger-web-svc 3000:80 -n ledger-ae &
curl -i http://localhost:3000/en/login
```

### 3. Verify Autoscaling (HPA)
```bash
kubectl get hpa -n ledger-ae
```

---

## 7. Zero-Downtime Rolling Upgrades & Rollbacks

```bash
# Trigger rolling upgrade to version 1.0.1
kubectl set image deployment/ledger-web web=${REGISTRY}/web:1.0.1 -n ledger-ae
kubectl set image deployment/ledger-backend backend=${REGISTRY}/backend:1.0.1 -n ledger-ae

# Monitor rollout
kubectl rollout status deployment/ledger-web -n ledger-ae
kubectl rollout status deployment/ledger-backend -n ledger-ae

# Rollback immediately if anomalies occur
kubectl rollout undo deployment/ledger-web -n ledger-ae
kubectl rollout undo deployment/ledger-backend -n ledger-ae
```
