param(
  [string]$ProjectId = "whtdk-500801"
)

$ErrorActionPreference = "Stop"
gcloud config set project $ProjectId
gcloud services enable secretmanager.googleapis.com

function Ensure-Secret {
  param([string]$Name)
  gcloud secrets describe $Name 2>$null
  if ($LASTEXITCODE -ne 0) {
    gcloud secrets create $Name --replication-policy automatic
  }
}

function Add-SecretVersion {
  param(
    [string]$Name,
    [string]$Prompt,
    [switch]$Plain
  )
  Ensure-Secret $Name
  if ($Plain) {
    $Value = Read-Host $Prompt
  } else {
    $Secure = Read-Host $Prompt -AsSecureString
    $Ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secure)
    try {
      $Value = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($Ptr)
    } finally {
      [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($Ptr)
    }
  }
  $Temp = New-TemporaryFile
  try {
    [System.IO.File]::WriteAllText(
      $Temp,
      $Value,
      [System.Text.UTF8Encoding]::new($false)
    )
    gcloud secrets versions add $Name --data-file $Temp
  } finally {
    Remove-Item -LiteralPath $Temp -Force -ErrorAction SilentlyContinue
  }
}

Add-SecretVersion "trcloud-erp-url" "TRCLOUD_ERP_URL" -Plain
Add-SecretVersion "trcloud-username" "TRCLOUD_USERNAME" -Plain
Add-SecretVersion "trcloud-password" "TRCLOUD_PASSWORD"
Add-SecretVersion "trcloud-device-id" "TRCLOUD_DEVICE_ID"
Add-SecretVersion "trcloud-company-passkey" "TRCLOUD_PASSKEY for company 14"
Add-SecretVersion "trcloud-origin-passkey" "TRCLOUD_ORIGIN_PASSKEY for origin company"

Write-Host "Secret versions added."
