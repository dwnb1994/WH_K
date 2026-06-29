param(
  [string]$ProjectId = "whtdk-500801",
  [string]$Region = "asia-southeast1",
  [string]$Bucket = "kitchen-sepon-data",
  [string]$Repository = "kitchen",
  [string]$ImageName = "python-trcloud-fetch",
  [string]$JobName = "python-trcloud-fetch",
  [string]$SchedulerName = "trcloud-delta-every-30-min",
  [string]$Schedule = "*/30 * * * *",
  [string]$TimeZone = "Asia/Bangkok"
)

$ErrorActionPreference = "Stop"

function Test-GcloudCommand {
  param([string[]]$CommandArgs)
  $Previous = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    & gcloud @CommandArgs 1>$null 2>$null
    return $LASTEXITCODE -eq 0
  } finally {
    $ErrorActionPreference = $Previous
  }
}

gcloud config set project $ProjectId
gcloud services enable `
  run.googleapis.com `
  cloudbuild.googleapis.com `
  artifactregistry.googleapis.com `
  cloudscheduler.googleapis.com `
  pubsub.googleapis.com `
  secretmanager.googleapis.com `
  storage.googleapis.com

if (-not (Test-GcloudCommand -CommandArgs @("storage", "buckets", "describe", "gs://$Bucket"))) {
  gcloud storage buckets create "gs://$Bucket" --project $ProjectId --location $Region --uniform-bucket-level-access
}

if (-not (Test-GcloudCommand -CommandArgs @("artifacts", "repositories", "describe", $Repository, "--location", $Region))) {
  gcloud artifacts repositories create $Repository --repository-format docker --location $Region --description "Kitchen Sepon containers"
}

$TopicName = "trcloud-snapshot-updated"
if (-not (Test-GcloudCommand -CommandArgs @("pubsub", "topics", "describe", $TopicName))) {
  gcloud pubsub topics create $TopicName
}

$Secrets = @(
  "trcloud-erp-url",
  "trcloud-username",
  "trcloud-password",
  "trcloud-device-id",
  "trcloud-company-passkey",
  "trcloud-origin-passkey"
)

foreach ($Secret in $Secrets) {
  if (-not (Test-GcloudCommand -CommandArgs @("secrets", "describe", $Secret))) {
    gcloud secrets create $Secret --replication-policy automatic
    Write-Host "Created secret $Secret. Add a version before running the job."
  }
}

foreach ($Secret in $Secrets) {
  $Latest = gcloud secrets versions list $Secret --filter "state=enabled" --format "value(name)" --limit 1
  if (-not $Latest) {
    throw "Secret $Secret has no enabled version. Run gcp/add_trcloud_secrets.ps1 first."
  }
}

$Image = "$Region-docker.pkg.dev/$ProjectId/$Repository/$ImageName`:latest"
gcloud builds submit . --config gcp/cloudbuild-trcloud-sync.yaml --substitutions "_IMAGE=$Image"

$ProjectNumber = gcloud projects describe $ProjectId --format "value(projectNumber)"
$ServiceAccount = "$ProjectNumber-compute@developer.gserviceaccount.com"
gcloud projects add-iam-policy-binding $ProjectId `
  --member "serviceAccount:$ServiceAccount" `
  --role "roles/storage.objectAdmin" `
  --condition None
gcloud projects add-iam-policy-binding $ProjectId `
  --member "serviceAccount:$ServiceAccount" `
  --role "roles/pubsub.publisher" `
  --condition None
gcloud projects add-iam-policy-binding $ProjectId `
  --member "serviceAccount:$ServiceAccount" `
  --role "roles/secretmanager.secretAccessor" `
  --condition None
gcloud projects add-iam-policy-binding $ProjectId `
  --member "serviceAccount:$ServiceAccount" `
  --role "roles/run.developer" `
  --condition None
gcloud projects add-iam-policy-binding $ProjectId `
  --member "serviceAccount:$ServiceAccount" `
  --role "roles/iam.serviceAccountUser" `
  --condition None

if (-not (Test-GcloudCommand -CommandArgs @("run", "jobs", "describe", $JobName, "--region", $Region))) {
  gcloud run jobs create $JobName --region $Region --image $Image
} else {
  gcloud run jobs update $JobName --region $Region --image $Image
}

gcloud run jobs update $JobName `
  --region $Region `
  --memory 1Gi `
  --cpu 1 `
  --task-timeout 3600 `
  --max-retries 1 `
  --set-env-vars "GCP_PROJECT_ID=$ProjectId,TZ=Asia/Bangkok,TRCLOUD_TIMEZONE=Asia/Bangkok,TRCLOUD_GCS_BUCKET=$Bucket,TRCLOUD_RELOAD_TOPIC=$TopicName,TRCLOUD_COMPANY_ID=14,TRCLOUD_USE_COMPANY_SWITCH=true,TRCLOUD_SCAN_FROM=2026-01-01" `
  --set-secrets "TRCLOUD_ERP_URL=trcloud-erp-url:latest,TRCLOUD_USERNAME=trcloud-username:latest,TRCLOUD_PASSWORD=trcloud-password:latest,TRCLOUD_DEVICE_ID=trcloud-device-id:latest,TRCLOUD_PASSKEY=trcloud-company-passkey:latest,TRCLOUD_ORIGIN_PASSKEY=trcloud-origin-passkey:latest"

if (Test-GcloudCommand -CommandArgs @("scheduler", "jobs", "describe", $SchedulerName, "--location", $Region)) {
  gcloud scheduler jobs delete $SchedulerName --location $Region --quiet
}

gcloud scheduler jobs create http $SchedulerName `
  --location $Region `
  --schedule $Schedule `
  --time-zone $TimeZone `
  --uri "https://$Region-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/$ProjectId/jobs/${JobName}:run" `
  --http-method POST `
  --oauth-service-account-email $ServiceAccount

Write-Host "Deploy complete."
Write-Host "Run now: gcloud run jobs execute $JobName --region $Region --wait --args=--mode=backfill,--from=2026-01-01,--to=$(Get-Date -Format yyyy-MM-dd)"
