terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.40"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.26"
    }
  }
  backend "s3" {
    bucket         = "ledger-ae-tfstate-me-central-1"
    key            = "prod/terraform.tfstate"
    region         = "me-central-1"
    encrypt        = true
    dynamodb_table = "ledger-ae-tfstate-locks"
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "LedgerAE"
      Environment = var.environment
      Region      = "UAE-me-central-1"
      Compliance  = "UAE-PDPL-Federal-Decree-Law-45-2021"
      ManagedBy   = "Terraform"
    }
  }
}
