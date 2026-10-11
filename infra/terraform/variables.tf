variable "aws_region" {
  description = "Target AWS Region for UAE Data Residency"
  type        = string
  default     = "me-central-1" # UAE (Dubai/Abu Dhabi)
}

variable "environment" {
  description = "Deployment Environment (prod, staging, pilot)"
  type        = string
  default     = "production"
}

variable "vpc_cidr" {
  description = "VPC CIDR block"
  type        = string
  default     = "10.100.0.0/16"
}

variable "availability_zones" {
  description = "UAE Region Availability Zones"
  type        = list(string)
  default     = ["me-central-1a", "me-central-1b", "me-central-1c"]
}

variable "db_instance_class" {
  description = "RDS Aurora PostgreSQL Instance Class"
  type        = string
  default     = "db.r6g.xlarge"
}

variable "eks_node_instance_types" {
  description = "EC2 Instance Types for EKS Managed Node Groups"
  type        = list(string)
  default     = ["m6g.xlarge"]
}
