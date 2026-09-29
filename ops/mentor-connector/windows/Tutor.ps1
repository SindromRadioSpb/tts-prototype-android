param([switch]$Diagnose,[switch]$Remove)
$ErrorActionPreference='Stop'
$Relay='https://linguistpro.kolosei.com'
$Container='linguistpro-tutor'
$Bundle=$PSScriptRoot
$PinnedImage='nousresearch/hermes-agent@sha256:fca358f12efd65bfaaca05884166f15c0e2788375ca30d77061ac1ebc96452b7'
function Quote-Argument([string]$Value) {
 if($Value -match '["\r\n]'){throw 'Unsupported command argument'}
 return '"'+[regex]::Replace($Value,'(\\+)$','$1$1')+'"'
}
function Invoke-Docker([string[]]$DockerArgs) {
 $info=New-Object System.Diagnostics.ProcessStartInfo
 $info.FileName='docker.exe';$info.Arguments=($DockerArgs|ForEach-Object{Quote-Argument $_}) -join ' '
 $info.UseShellExecute=$false;$info.CreateNoWindow=$true;$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
 $proc=New-Object System.Diagnostics.Process;$proc.StartInfo=$info
 [void]$proc.Start();$stdout=$proc.StandardOutput.ReadToEndAsync();$stderr=$proc.StandardError.ReadToEndAsync()
 if(-not $proc.WaitForExit(20000)){$proc.Kill();throw 'Docker did not respond'}
 $text=$stdout.Result;[void]$stderr.Result
 if($proc.ExitCode -ne 0){throw 'Docker operation failed'}
 return $text
}
function Get-Runtime {
 $runtime=(Invoke-Docker @('inspect','hermes-agent')|ConvertFrom-Json)[0]
 if($runtime.Config.Image -ne $PinnedImage){throw 'Нужна поддержанная версия Hermes 0.21.5. Обновите личный Hermes перед подключением.'}
 $entry=@($runtime.Config.Env|Where-Object{$_ -like 'HERMES_HOME=*'})[0]
 $agentHome=if($entry){$entry.Substring(12)}else{'/home/hermes/.hermes'}
 if($agentHome -notmatch '^/[A-Za-z0-9_./-]+$'){throw 'Unsupported Hermes home'}
 $homeMount=@($runtime.Mounts|Where-Object{$_.Destination -eq $agentHome -and $_.Type -eq 'volume'})[0]
 $sourceMount=@($runtime.Mounts|Where-Object{$_.Destination -eq '/opt/hermes' -and $_.Type -eq 'volume'})[0]
 if(-not $homeMount -or -not $sourceMount){throw 'Нужен Docker-профиль Hermes с отдельными томами home и source.'}
 return @{Home=$agentHome;HomeVolume=$homeMount.Name;SourceVolume=$sourceMount.Name;State=($agentHome+'/linguistpro-tutor')}
}
function Common-Args($runtime){
 return @('--user','1000:1000','-e',('HERMES_HOME='+$runtime.Home),'-v',($runtime.HomeVolume+':'+$runtime.Home),'-v',($runtime.SourceVolume+':/opt/hermes'),'-v',($Bundle+':/lp-tutor:ro'),'--entrypoint','/opt/hermes/.venv/bin/python')
}
if($Remove){
 try{
  $runtime=Get-Runtime
  try{[void](Invoke-Docker (@('run','--rm')+(Common-Args $runtime)+@($PinnedImage,'/lp-tutor/connector.py','--origin',$Relay,'--credentials',($runtime.State+'/connection.json'),'--revoke')))}catch{}
  try{[void](Invoke-Docker @('rm','-f',$Container))}catch{}
  $cleanup="from pathlib import Path; p=Path('"+$runtime.State+"'); (p/'connection.json').unlink(missing_ok=True); (p/'status.json').unlink(missing_ok=True)"
  [void](Invoke-Docker (@('run','--rm')+(Common-Args $runtime)+@($PinnedImage,'-c',$cleanup)))
 }catch{}
 exit
}
if($Diagnose){
 $runtime=Get-Runtime
 [pscustomobject]@{Docker=$true;SupportedRuntime=$true;PrivateStateInDocker=$true}|ConvertTo-Json -Compress
 exit
}
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()
$form=New-Object System.Windows.Forms.Form
$form.Text='LinguistPro Tutor';$form.Size=New-Object System.Drawing.Size(630,555);$form.MinimumSize=$form.Size;$form.StartPosition='CenterScreen'
$form.BackColor=[System.Drawing.ColorTranslator]::FromHtml('#f9f8f3');$form.Font=New-Object System.Drawing.Font('Segoe UI',11)
$title=New-Object System.Windows.Forms.Label;$title.Text='Личный наставник';$title.Font=New-Object System.Drawing.Font('Segoe UI',23,[System.Drawing.FontStyle]::Bold);$title.SetBounds(28,26,560,50)
$intro=New-Object System.Windows.Forms.Label;$intro.Text='Hermes и ваша подписка ChatGPT. Подключение подтверждается в браузере LinguistPro.';$intro.SetBounds(30,91,545,65)
$status=New-Object System.Windows.Forms.Label;$status.Text='Нажмите «Подключить», если Hermes уже установлен в Docker.';$status.SetBounds(30,167,545,85)
$connect=New-Object System.Windows.Forms.Button;$connect.Text='Подключить';$connect.SetBounds(30,265,173,48)
$open=New-Object System.Windows.Forms.Button;$open.Text='Открыть LinguistPro';$open.SetBounds(215,265,205,48)
$stop=New-Object System.Windows.Forms.Button;$stop.Text='Остановить';$stop.SetBounds(432,265,145,48)
$chat=New-Object System.Windows.Forms.Button;$chat.Text='Подключить чат с наставником';$chat.SetBounds(30,328,300,48)
$note=New-Object System.Windows.Forms.Label;$note.Text='Наставник отвечает в LinguistPro. Кнопка чата добавляет его учебные инструменты в ваш Hermes без изменения прежних подключений. Вы отдельно разрешаете передачу выбранного фрагмента.';$note.SetBounds(30,395,545,85)
$form.Controls.AddRange(@($title,$intro,$status,$connect,$open,$stop,$chat,$note))
$script:OpenedUrl='';$script:Runtime=$null;$script:Working=$false;$script:McpJob=$null;$script:McpOpenedUrl=''
$script:McpListener=$null;$script:McpPending=$null;$script:McpExpectedState='';$script:McpChatConnected=$false
function Close-McpCallback {
 if($script:McpListener){$script:McpListener.Close();$script:McpListener=$null}
 $script:McpPending=$null;$script:McpExpectedState=''
}
function Start-McpCallback([string]$AuthorizationUrl) {
 $scope=[regex]::Match($AuthorizationUrl,'[?&]scope=([^&]+)')
 $redirect=[regex]::Match($AuthorizationUrl,'[?&]redirect_uri=([^&]+)')
 $expectedScopes='tutor.capabilities.read tutor.context.read tutor.session.read tutor.artifact.propose'
 if(-not $scope.Success -or -not $redirect.Success -or
    [uri]::UnescapeDataString($scope.Groups[1].Value.Replace('+',' ')) -cne $expectedScopes -or
    [uri]::UnescapeDataString($redirect.Groups[1].Value) -cne 'http://127.0.0.1:8766/callback'){
  throw 'Подключение запросило неожиданные права. Доступ не выдан.'
 }
 $state=[regex]::Match($AuthorizationUrl,'[?&]state=([^&]+)')
 if(-not $state.Success){throw 'OAuth state missing'}
 Close-McpCallback
 $script:McpExpectedState=[uri]::UnescapeDataString($state.Groups[1].Value)
 $script:McpListener=[System.Net.HttpListener]::new()
 $script:McpListener.Prefixes.Add('http://127.0.0.1:8766/')
 try{$script:McpListener.Start();$script:McpPending=$script:McpListener.GetContextAsync()}
 catch{Close-McpCallback;throw 'Не удалось открыть локальный возврат чата.'}
}
function Complete-McpCallback {
 if(-not $script:McpPending -or -not $script:McpPending.IsCompleted){return}
 $context=$script:McpPending.GetAwaiter().GetResult()
 $response=$context.Response
 try{
  $request=$context.Request
  if($request.Url.AbsolutePath -ne '/callback' -or
     $request.QueryString['state'] -cne $script:McpExpectedState -or
     -not $request.QueryString['code'] -or
     -not [System.Net.IPAddress]::IsLoopback($request.RemoteEndPoint.Address)){
   $response.StatusCode=400;throw 'Неверный ответ подключения.'
  }
  # Hermes listens on container loopback. Docker's published localhost port cannot
  # reach that listener, so forward only this verified one-time callback inside it.
  [void](Invoke-Docker @('exec','-e',('LP_TUTOR_CALLBACK='+$request.Url.AbsoluteUri),'hermes-agent',
   '/opt/hermes/.venv/bin/python','-c',"import os,urllib.request; urllib.request.urlopen(os.getenv('LP_TUTOR_CALLBACK'),timeout=8).read()"))
  $response.StatusCode=200
  $message='Наставник подключён. Можно вернуться в LinguistPro.'
  $status.Text='Подключение подтверждено. Проверяем инструменты наставника…'
 }catch{
  if($response.StatusCode -ne 400){$response.StatusCode=502}
  $message='Не удалось завершить подключение. Вернитесь в окно наставника и повторите.'
  $status.Text=$message
 }finally{
  $bytes=[Text.Encoding]::UTF8.GetBytes($message)
  $response.ContentType='text/plain; charset=utf-8'
  $response.ContentLength64=$bytes.Length
  $response.OutputStream.Write($bytes,0,$bytes.Length)
  $response.Close()
  Close-McpCallback
 }
}
$form.Add_FormClosed({Close-McpCallback})
$open.Add_Click({Start-Process ($Relay+'/tutor-connect.html')})
$connect.Add_Click({
 if($script:Working){return};$script:Working=$true;$connect.Enabled=$false;$status.Text='Проверяем Hermes и подключение…';$form.Refresh()
 try{
  $runtime=Get-Runtime;$script:Runtime=$runtime
  $probe=Invoke-Docker (@('run','--rm')+(Common-Args $runtime)+@($PinnedImage,'/lp-tutor/hermes_turn.py','--inspect'))|ConvertFrom-Json
  if($probe.text -ne 'RUNTIME_CONTRACT_PASS'){throw 'Hermes требует входа в ChatGPT или проверки модели. Откройте Hermes и восстановите авторизацию.'}
  # Replace only our connector container, never the owner gateway or its volumes.
  try{[void](Invoke-Docker @('rm','-f',$Container))}catch{}
  $remove="from pathlib import Path; Path('"+$runtime.State+"/connection.json').unlink(missing_ok=True)"
  [void](Invoke-Docker (@('run','--rm')+(Common-Args $runtime)+@($PinnedImage,'-c',$remove)))
  $cmd=@('run','-d','--init','--restart','unless-stopped','--name',$Container)+(Common-Args $runtime)+@($PinnedImage,'/lp-tutor/connector.py','--origin',$Relay,'--credentials',($runtime.State+'/connection.json'),'--auto-pair','--status-file',($runtime.State+'/status.json'),'--device-name','Hermes on Windows','--','/opt/hermes/.venv/bin/python','/lp-tutor/hermes_turn.py')
  [void](Invoke-Docker $cmd);$script:OpenedUrl='';$status.Text='Ожидаем страницу подтверждения в браузере…'
 }catch{$status.Text=$_.Exception.Message+" Проверьте, что Docker Desktop и Hermes установлены и запущены."}
 finally{$script:Working=$false;$connect.Enabled=$true}
})
$stop.Add_Click({try{[void](Invoke-Docker @('stop','-t','5',$Container));$status.Text='Агент остановлен. Подключение сохранено в LinguistPro.'}catch{$status.Text='Агент уже остановлен или Docker недоступен.'}})
$chat.Add_Click({
 if($script:Working -or ($script:McpJob -and $script:McpJob.State -eq 'Running')){return}
 $script:Working=$true;$chat.Enabled=$false;$status.Text='Готовим отдельное подключение чата…';$form.Refresh()
 try{
  Close-McpCallback
  $runtime=Get-Runtime;$script:Runtime=$runtime
  $prepared=(Invoke-Docker (@('run','--rm')+(Common-Args $runtime)+@($PinnedImage,'/lp-tutor/mcp_setup.py','--apply')))|ConvertFrom-Json
  if(-not $prepared.prepared){throw 'Не удалось подготовить подключение чата.'}
  $script:McpChatConnected=$false
  $privateDir=Join-Path $env:LOCALAPPDATA 'LinguistProTutor'
  [void](New-Item -ItemType Directory -Force -Path $privateDir)
  $script:McpAuthLog=Join-Path $privateDir 'mcp-login.log'
  Remove-Item -LiteralPath $script:McpAuthLog -Force -ErrorAction SilentlyContinue
  $script:McpOpenedUrl=''
  $script:McpJob=Start-Job -ArgumentList $script:McpAuthLog -ScriptBlock {
   param($log)
   & docker.exe exec --user hermes hermes-agent /opt/hermes/.venv/bin/hermes mcp login linguistpro_tutor --flow browser 2>&1 | ForEach-Object { Add-Content -LiteralPath $log -Value ([string]$_) }
   if($LASTEXITCODE -ne 0){throw 'Hermes MCP login failed'}
  }
  $status.Text='Ожидаем страницу согласия в браузере…'
 }catch{$status.Text=$_.Exception.Message}
 finally{$script:Working=$false;$chat.Enabled=$true}
})
$timer=New-Object System.Windows.Forms.Timer;$timer.Interval=3000
$timer.Add_Tick({
 if($script:Working){return}
 if($script:McpJob){
 try{
   Complete-McpCallback
   if(Test-Path -LiteralPath $script:McpAuthLog){
    $output=Get-Content -LiteralPath $script:McpAuthLog -Raw
    $match=[regex]::Match($output,'https://linguistpro\.kolosei\.com/oauth/auth\?[^\s]+')
    if($match.Success -and $script:McpOpenedUrl -ne $match.Value){
     Start-McpCallback $match.Value
     $script:McpOpenedUrl=$match.Value;Start-Process $match.Value
     $status.Text='Подтвердите подключение чата на открывшейся странице.'
    }
   }
   if($script:McpJob.State -ne 'Running'){
    $state=$script:McpJob.State
    Receive-Job $script:McpJob -ErrorAction SilentlyContinue | Out-Null
    Remove-Job $script:McpJob -Force -ErrorAction SilentlyContinue
    $script:McpJob=$null
    Close-McpCallback
    Remove-Item -LiteralPath $script:McpAuthLog -Force -ErrorAction SilentlyContinue
    if($state -eq 'Completed'){
     try{
      $probe=Invoke-Docker @('exec','--user','hermes','hermes-agent','/opt/hermes/.venv/bin/hermes','mcp','test','linguistpro_tutor')
      if($probe -notmatch 'Connected' -or $probe -notmatch 'get_tutor_capabilities'){throw 'MCP check failed'}
      $script:McpChatConnected=$true
      $status.Text='Чат подключён. Доступ к конкретному фрагменту вы дадите из разговора с наставником.'
     }catch{$status.Text='Подтверждение не завершилось. Нажмите «Подключить чат» ещё раз; прежний чат сохранён.'}
    }else{$status.Text='Подключение чата не завершилось. Нажмите кнопку ещё раз; прежний чат сохранён.'}
   }
  }catch{$status.Text='Не удалось открыть согласие. Повторите подключение чата.'}
 }
 try{
  if(-not $script:Runtime){$script:Runtime=Get-Runtime}
  $value=Invoke-Docker @('exec',$Container,'cat',($script:Runtime.State+'/status.json'))|ConvertFrom-Json
  switch($value.state){
   'browser_approval'{
    $uri=[string]$value.verification_url
    if($uri -match '^https://linguistpro\.kolosei\.com/tutor-connect\.html#connect=[a-f0-9]{18}$'){
     $status.Text='Подтвердите подключение на открывшейся странице LinguistPro.'
     if($script:OpenedUrl -ne $uri){$script:OpenedUrl=$uri;Start-Process $uri}
    }
   }
   'connected'{if($script:McpChatConnected){$status.Text='Чат подключён. Откройте разбор в LinguistPro и продолжите разговор в Hermes.'}else{$status.Text='Наставник подключён. Откройте текст в LinguistPro и задайте вопрос у нужной строки.'}}
   'answering'{$status.Text='Наставник готовит объяснение по выбранному вами фрагменту…'}
   'offline'{$status.Text='Нет связи с LinguistPro. Агент повторит подключение автоматически.'}
   'connection_revoked'{$status.Text='Доступ отозван. Для новой связи нажмите «Подключить».'}
   'connection_failed'{$status.Text='Не удалось завершить подключение. Проверьте доступ в LinguistPro и нажмите «Подключить» ещё раз.'}
  }
 }catch{}
})
$form.Add_FormClosed({
 $timer.Stop();$timer.Dispose()
 if($script:McpJob){Stop-Job $script:McpJob -ErrorAction SilentlyContinue;Remove-Job $script:McpJob -Force -ErrorAction SilentlyContinue}
 if($script:McpAuthLog){Remove-Item -LiteralPath $script:McpAuthLog -Force -ErrorAction SilentlyContinue}
});$timer.Start()
[void]$form.ShowDialog()
