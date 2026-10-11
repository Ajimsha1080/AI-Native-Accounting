# ==============================================================================
# AWS S3 Storage for 10-Year Statutory Non-Repudiation E-Invoice Archive
# Compliance: UAE Tax Procedures Law (Federal Decree-Law No. 28 of 2022)
# ==============================================================================

resource "aws_kms_key" "s3_archive_key" {
  description             = "KMS Key for LedgerAE E-Invoice 10-Year Archive"
  deletion_window_in_days = 30
  enable_key_rotation     = true

  tags = {
    Name = "ledger-ae-s3-kms-key"
  }
}

resource "aws_s3_bucket" "invoice_archive" {
  bucket        = "ledger-ae-einvoice-archive-${var.environment}-me-central-1"
  force_destroy = false

  tags = {
    Name       = "ledger-ae-einvoice-archive"
    Retention  = "10-Years-Immutable"
  }
}

resource "aws_s3_bucket_versioning" "archive_versioning" {
  bucket = aws_s3_bucket.invoice_archive.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "archive_encryption" {
  bucket = aws_s3_bucket.invoice_archive.id

  rule {
    apply_server_side_encryption_by_default {
      kms_master_key_id = aws_kms_key.s3_archive_key.arn
      sse_algorithm     = "aws:kms"
    }
  }
}

# Object Lock for Non-Repudiation WORM (Write Once Read Many) statutory compliance
resource "aws_s3_bucket_object_lock_configuration" "archive_lock" {
  bucket = aws_s3_bucket.invoice_archive.id

  rule {
    default_retention {
      mode  = "COMPLIANCE"
      years = 10
    }
  }
}
