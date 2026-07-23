# ===== AUTO GIT PUSH =====

$Project = "G:\AUTO_MENU_AI"

while ($true)
{
    Set-Location $Project

    $status = git status --porcelain

    if ($status)
    {
        Write-Host "Changes detected..."

        git add .

        $time = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

        git commit -m "Auto Update $time"

        git push origin main
    }
    else
    {
        Write-Host "No changes."
    }

    Start-Sleep -Seconds 300
}