# ==============================================================================
# AWS Aurora PostgreSQL 16 Multi-AZ Cluster (UAE me-central-1)
# Storage: Encrypted KMS AES-256 at rest, Continuous WAL Streaming, PITR <= 5 min RPO
# ==============================================================================

resource "aws_db_subnet_group" "rds_subnet_group" {
  name        = "ledger-ae-db-subnet-group"
  subnet_ids  = aws_subnet.database[*].id
  description = "Isolated database subnets for LedgerAE multi-tenant RDS"
}

resource "aws_security_group" "rds_sg" {
  name        = "ledger-ae-rds-sg"
  description = "Controls database traffic from EKS worker nodes only"
  vpc_id      = aws_vpc.ledger_vpc.id

  ingress {
    description = "PostgreSQL 16 from private subnets"
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = aws_subnet.private[*].cidr_block
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "ledger-ae-rds-sg"
  }
}

resource "aws_kms_key" "rds_key" {
  description             = "KMS Key for LedgerAE PostgreSQL Database Encryption at rest"
  deletion_window_in_days = 30
  enable_key_rotation     = true

  tags = {
    Name = "ledger-ae-rds-kms-key"
  }
}

resource "aws_rds_cluster" "aurora_cluster" {
  cluster_identifier      = "ledger-ae-aurora-cluster"
  engine                  = "aurora-postgresql"
  engine_version          = "16.1"
  database_name           = "ledger_ae"
  master_username         = "ledger_admin"
  manage_master_user_password = true
  kms_key_id              = aws_kms_key.rds_key.arn
  storage_encrypted       = true
  db_subnet_group_name    = aws_db_subnet_group.rds_subnet_group.name
  vpc_security_group_ids  = [aws_security_group.rds_sg.id]
  deletion_protection     = true
  backup_retention_period = 35 # Maximum automated retention for statutory compliance
  preferred_backup_window = "01:00-03:00"

  enabled_cloudwatch_logs_exports = ["postgresql"]

  tags = {
    Name = "ledger-ae-aurora-cluster"
  }
}

resource "aws_rds_cluster_instance" "aurora_instances" {
  count                = 2 # Primary + High-Availability Read Replica in separate AZ
  identifier           = "ledger-ae-aurora-node-${count.index + 1}"
  cluster_identifier   = aws_rds_cluster.aurora_cluster.id
  instance_class       = var.db_instance_class
  engine               = aws_rds_cluster.aurora_cluster.engine
  engine_version       = aws_rds_cluster.aurora_cluster.engine_version
  db_subnet_group_name = aws_db_subnet_group.rds_subnet_group.name

  tags = {
    Name = "ledger-ae-aurora-node-${count.index + 1}"
  }
}
