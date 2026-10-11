output "vpc_id" {
  description = "VPC ID in UAE me-central-1"
  value       = aws_vpc.ledger_vpc.id
}

output "aurora_cluster_endpoint" {
  description = "PostgreSQL 16 Aurora Cluster Writer Endpoint"
  value       = aws_rds_cluster.aurora_cluster.endpoint
}

output "aurora_reader_endpoint" {
  description = "PostgreSQL 16 Aurora Cluster Reader Endpoint"
  value       = aws_rds_cluster.aurora_cluster.reader_endpoint
}

output "eks_cluster_name" {
  description = "EKS Cluster Name"
  value       = aws_eks_cluster.ledger_eks.name
}

output "eks_cluster_endpoint" {
  description = "EKS Cluster API Endpoint"
  value       = aws_eks_cluster.ledger_eks.endpoint
}

output "s3_archive_bucket" {
  description = "10-Year E-Invoicing Non-Repudiation S3 Bucket"
  value       = aws_s3_bucket.invoice_archive.bucket
}
