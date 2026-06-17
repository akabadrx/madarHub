@echo off
setlocal EnableExtensions

set "SERVER=root@72.62.132.37"
set "REMOTE_ROOT=/var/www/madarorbit"
set "REMOTE_ARCHIVE=/tmp/madarorbit-site-deploy.tar.gz"
set "PUBLIC_URL=https://madarorbit.com/contact.html"
set "ARCHIVE_DIR=%~dp0deploy\release"
set "ARCHIVE="
set "DRY_RUN="
set "NO_PAUSE="

for %%A in (%*) do (
  if /I "%%~A"=="--dry-run" set "DRY_RUN=1"
  if /I "%%~A"=="--no-pause" set "NO_PAUSE=1"
)

cd /d "%~dp0"
if errorlevel 1 goto fail_cd

echo.
echo Madar Orbit deploy
echo ==================
echo Local folder: %CD%
echo Server:       %SERVER%
echo Live folder:  %REMOTE_ROOT%
if defined DRY_RUN echo Mode:         dry run, no upload
echo.

call :require_command ssh
if errorlevel 1 goto fail_missing_command
call :require_command scp
if errorlevel 1 goto fail_missing_command
call :require_command tar
if errorlevel 1 goto fail_missing_command
call :require_command powershell
if errorlevel 1 goto fail_missing_command

for /f %%I in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd-HHmmss"') do set "STAMP=%%I"
if not defined STAMP goto fail_timestamp
set "ARCHIVE=%ARCHIVE_DIR%\madarorbit-site-deploy-%STAMP%.tar.gz"

echo Packaging site files...
if not exist "%ARCHIVE_DIR%" mkdir "%ARCHIVE_DIR%"
if errorlevel 1 goto fail_package
tar -czf "%ARCHIVE%" index.html about.html pricing.html events.html badr-academy.html contact.html README.md robots.txt sitemap.xml assets
if errorlevel 1 goto fail_package

if defined DRY_RUN (
  echo.
  echo Dry run complete.
  echo Archive created: %ARCHIVE%
  echo No files were uploaded.
  exit /b 0
)

echo Uploading archive...
scp "%ARCHIVE%" "%SERVER%:%REMOTE_ARCHIVE%"
if errorlevel 1 goto fail_upload

echo Deploying on server...
ssh "%SERVER%" "set -e; backup=/var/backups/madarorbit-%STAMP%.tar.gz; release=/tmp/madarorbit-release-%STAMP%; mkdir -p /var/backups $release; tar -czf $backup -C /var/www madarorbit; tar -xzf /tmp/madarorbit-site-deploy.tar.gz -C $release; rsync -a --delete --exclude=.well-known/ $release/ /var/www/madarorbit/; chown -R www-data:www-data /var/www/madarorbit; nginx -t; echo backup=$backup; echo live_folder=/var/www/madarorbit"
if errorlevel 1 goto fail_deploy

echo Verifying public site...
where curl.exe >nul 2>&1
if errorlevel 1 (
  echo curl.exe was not found, skipping public HTTP verification.
) else (
  curl.exe -L --max-time 20 "%PUBLIC_URL%" 2>nul | findstr /C:"maps/embed" >nul
  if errorlevel 1 (
    echo WARNING: Deploy finished, but public verification did not find maps/embed on %PUBLIC_URL%.
    echo Check the page in your browser in case a cache or proxy is serving an older copy.
  ) else (
    echo Public verification passed: %PUBLIC_URL%
  )
)

echo.
echo Deploy complete.
if not defined NO_PAUSE pause
exit /b 0

:require_command
where %1 >nul 2>&1
if errorlevel 1 (
  echo Missing required command: %1
  exit /b 1
)
exit /b 0

:fail_cd
echo Could not open the folder containing this deploy script.
goto fail

:fail_missing_command
echo Install or enable the missing command above, then run deploy.bat again.
goto fail

:fail_package
echo Packaging failed. No files were deployed.
goto fail

:fail_timestamp
echo Could not create a deployment timestamp with PowerShell.
goto fail

:fail_upload
echo Upload failed. Check your SSH connection and server access.
goto fail

:fail_deploy
echo Server deployment failed. The previous live folder backup should still be in /var/backups.
goto fail

:fail
echo.
echo Deploy failed.
if not defined NO_PAUSE pause
exit /b 1
