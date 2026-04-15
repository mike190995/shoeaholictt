# LSWOO Deployment Script
# This script ensures that the Cloud SQL instance is ALWAYS attached to the Cloud Run service.

$SERVICE_NAME = "lswoo-middleware"
$PROJECT_ID = "senmizu"
$REGION = "us-east1"
$SQL_INSTANCE = "senmizu:us-east1:middleware"

$IMAGE_TAG = "us-east1-docker.pkg.dev/senmizu/cloud-run-source-deploy/lswoo-middleware:latest"

Write-Host "🚀 Building and pushing image to $IMAGE_TAG..." -ForegroundColor Cyan

# Use Cloud Build to ensure the image ends up in the correct project registry
gcloud builds submit --tag $IMAGE_TAG --project $PROJECT_ID .

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Build failed. Check Artifact Registry permissions for project $PROJECT_ID." -ForegroundColor Red
    exit $LASTEXITCODE
}

Write-Host "🚢 Deploying to Cloud Run with Cloud SQL binding..." -ForegroundColor Cyan

gcloud run deploy $SERVICE_NAME `
    --image $IMAGE_TAG `
    --region $REGION `
    --project $PROJECT_ID `
    --add-cloudsql-instances $SQL_INSTANCE `
    --update-env-vars "CLOUD_SQL_CONNECTION_NAME=$SQL_INSTANCE" `
    --allow-unauthenticated

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Deployment successful! Service is online and connected to Postgres." -ForegroundColor Green
} else {
    Write-Host "❌ Deployment failed." -ForegroundColor Red
    exit $LASTEXITCODE
}
