#Requires -Version 5.1
<#
.SYNOPSIS
    One-click deploy Madar CRM from Windows to your VPS.
.DESCRIPTION
    This script SSHs into your VPS and runs scripts/deploy.sh to rebuild and restart the CRM.
    Update the variables below with your VPS details before running.
#>

# -------------------- CONFIGURATION --------------------
$VpsUser     = "root"                       # Your VPS username
$VpsHost     = "YOUR.VPS.IP.OR.DOMAIN"      # Your VPS IP address or domain
$VpsKey      = "$env:USERPROFILE\.ssh\id_rsa"  # Path to your SSH private key (optional)
$ProjectDir  = "/var/www/madar-crm"        # Path to madar-crm on the VPS
$DeployScript = "$ProjectDir/scripts/deploy.sh"
# -------------------- END CONFIGURATION --------------------

function Test-SshAvailable {
    try {
        $null = Get-Command ssh -ErrorAction Stop
        return $true
    } catch {
        return $false
    }
}

function Invoke-VpsDeploy {
    $remoteCommand = "bash $DeployScript"

    $sshArgs = @(
        "-o", "StrictHostKeyChecking=no"
        "-o", "UserKnownHostsFile=/dev/null"
    )

    if (Test-Path -LiteralPath $VpsKey) {
        Write-Host "Using SSH key: $VpsKey" -ForegroundColor Cyan
        $sshArgs += @("-i", $VpsKey)
    } else {
        Write-Host "No SSH key found at $VpsKey. Will attempt password authentication." -ForegroundColor Yellow
    }

    $sshArgs += "$VpsUser@$VpsHost"
    $sshArgs += $remoteCommand

    Write-Host "Connecting to $VpsUser@$VpsHost ..." -ForegroundColor Green
    Write-Host "Running: $remoteCommand" -ForegroundColor DarkGray
    Write-Host ""

    & ssh @sshArgs

    if ($LASTEXITCODE -ne 0) {
        Write-Host ""
        Write-Host "Deployment failed with exit code $LASTEXITCODE." -ForegroundColor Red
        exit $LASTEXITCODE
    }
}

# Main
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Madar CRM - Deploy from Windows" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

if (-not (Test-SshAvailable)) {
    Write-Host "ERROR: OpenSSH client (ssh.exe) was not found on this computer." -ForegroundColor Red
    Write-Host "Install it via Settings > Apps > Optional features > OpenSSH Client," -ForegroundColor Yellow
    Write-Host "or use Git Bash / WSL instead." -ForegroundColor Yellow
    exit 1
}

if ($VpsHost -eq "YOUR.VPS.IP.OR.DOMAIN") {
    Write-Host "ERROR: Please edit this script and set your VPS IP address or domain." -ForegroundColor Red
    Write-Host "File: $PSCommandPath" -ForegroundColor Yellow
    exit 1
}

Invoke-VpsDeploy

Write-Host ""
Write-Host "Deployment command completed successfully." -ForegroundColor Green
