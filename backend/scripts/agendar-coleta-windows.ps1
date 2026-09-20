<#
  Agenda a coleta diária do FinMind no Agendador de Tarefas do Windows
  (máquina de desenvolvimento). Segue o ADR 0004: o agendamento é EXTERNO ao
  backend (sem node-cron); a tarefa só chama `node scripts/run-coleta.js`, o
  mesmo que `npm run collect` - roda todos os coletores (BCB, FRED, LBMA,
  CFTC, B3/CCM), todos idempotentes.

  Por que existe: a B3 só oferece uma janela rolante de ~15 meses do CCM
  (docs/adr/0009); cada dia sem coletar perde o dia mais antigo.

  Uso (PowerShell, sem admin):
    .\scripts\agendar-coleta-windows.ps1                 # 22:00 todos os dias
    .\scripts\agendar-coleta-windows.ps1 -Horario 21:30
    .\scripts\agendar-coleta-windows.ps1 -Remover

  Limites: só roda com o usuário logado e a máquina ligada (se perder o
  horário, roda quando puder - StartWhenAvailable) e precisa do MariaDB de dev
  no ar (docker/compose.dev.yml). Em produção (VM) o equivalente é um cron
  chamando `docker compose exec backend npm run collect` (ver ADR 0004).
#>
param(
  [string]$Horario = "22:00",
  [switch]$Remover
)

$nome = "FinMind-Coleta-Diaria"

if ($Remover) {
  Unregister-ScheduledTask -TaskName $nome -Confirm:$false -ErrorAction SilentlyContinue
  Write-Output "Tarefa '$nome' removida."
  return
}

$backend = Split-Path -Parent $PSScriptRoot
$node = (Get-Command node -ErrorAction Stop).Source
$logs = Join-Path $backend "storage\logs"
New-Item -ItemType Directory -Force -Path $logs | Out-Null

# cmd /c para redirecionar a saída (pino) para um arquivo; o resultado
# estruturado de cada execução também fica na tabela collection_execution.
$comando = "/c `"`"$node`" scripts\run-coleta.js >> storage\logs\coleta.log 2>&1`""
$acao = New-ScheduledTaskAction -Execute "cmd.exe" -Argument $comando -WorkingDirectory $backend
$gatilho = New-ScheduledTaskTrigger -Daily -At $Horario
$config = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Hours 2)

Register-ScheduledTask -TaskName $nome -Action $acao -Trigger $gatilho -Settings $config `
  -Description "FinMind: coleta diária de dados de mercado (npm run collect). ADR 0004/0009." -Force | Out-Null

Write-Output "Tarefa '$nome' criada: todos os dias às $Horario."
Write-Output "Log: $logs\coleta.log"
