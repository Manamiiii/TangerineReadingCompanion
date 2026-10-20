# The service runs in a separate runspace so HTTP probes and startup locks never
# block the window's dispatcher. Only stage names cross the thread boundary.
function Show-TangerineStartup {
    param(
        [string]$ServiceLauncher,
        [hashtable]$StartupParameters = @{},
        [string]$AppName = 'TangerineComfyRunner',
        [string]$IconFile,
        [scriptblock]$OnReady
    )

    Add-Type -AssemblyName PresentationFramework
    [xml]$markup = @'
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        Title="Tangerine" Width="600" Height="380"
        WindowStartupLocation="CenterScreen" ResizeMode="CanMinimize"
        Background="#FFF9F2" FontFamily="Microsoft YaHei UI" FontSize="14">
    <Grid Margin="28">
        <Grid.RowDefinitions>
            <RowDefinition Height="Auto"/>
            <RowDefinition Height="Auto"/>
            <RowDefinition Height="Auto"/>
            <RowDefinition Height="Auto"/>
            <RowDefinition Height="*"/>
            <RowDefinition Height="Auto"/>
        </Grid.RowDefinitions>
        <TextBlock Name="Heading" FontSize="21" FontWeight="SemiBold" Foreground="#713B16" TextWrapping="Wrap"/>
        <TextBlock Name="Stage" Grid.Row="1" Text="正在准备启动…" Margin="0,22,0,12" TextWrapping="Wrap"/>
        <ProgressBar Name="Activity" Grid.Row="2" Height="6" IsIndeterminate="True" Foreground="#EA8B35" Background="#F3E2CF" BorderThickness="0"/>
        <TextBlock Name="Elapsed" Grid.Row="3" Margin="0,12,0,12" Foreground="#765E49" Text="已等待 0 秒"/>
        <TextBox Name="ErrorDetails" Grid.Row="4" Visibility="Collapsed" IsReadOnly="True" TextWrapping="Wrap" VerticalScrollBarVisibility="Auto" Background="#FFF9F2" BorderThickness="0"/>
        <TextBlock Name="Hint" Grid.Row="4" Text="启动完成后会自动打开页面。&#10;关闭此窗口会停止等待，已启动的服务继续运行。" TextWrapping="Wrap" Foreground="#765E49" FontSize="12"/>
        <Button Name="CloseButton" Grid.Row="5" Content="停止等待" HorizontalAlignment="Right" Padding="18,5" Margin="0,12,0,0"/>
    </Grid>
</Window>
'@
    $reader = [System.Xml.XmlNodeReader]::new($markup)
    $window = [Windows.Markup.XamlReader]::Load($reader)
    $reader.Close()
    if ($IconFile -and (Test-Path -LiteralPath $IconFile)) { $window.Icon = $IconFile }
    $heading = $window.FindName('Heading')
    $window.Title = $AppName
    $heading.Text = "正在启动 $AppName"
    $stageLabel = $window.FindName('Stage')
    $activity = $window.FindName('Activity')
    $elapsedLabel = $window.FindName('Elapsed')
    $errorDetails = $window.FindName('ErrorDetails')
    $hint = $window.FindName('Hint')
    $closeButton = $window.FindName('CloseButton')
    $stages = @{
        'waiting-lock' = '正在等待启动通道…'
        'checking-service' = '正在检查本地网站是否已运行…'
        'starting-review' = '正在启动本地网站…'
        'waiting-review' = '正在等待本地网站响应…'
        'verifying-review' = '正在确认本地网站已就绪…'
        'checking-files' = '正在检查启动所需文件…'
        'checking-storage' = '正在检查本地服务和存储连接…'
        'waiting-storage' = '正在等待服务和存储连接就绪…'
        'ready' = '本地网站已就绪，正在打开页面…'
    }
    $queue = [System.Collections.Concurrent.ConcurrentQueue[string]]::new()
    $state = @{ Success = $false; Finished = $false }
    $watch = [Diagnostics.Stopwatch]::StartNew()
    $worker = [PowerShell]::Create()
    [void]$worker.AddScript({
        param($Launcher, $Parameters, $ProgressQueue)
        $ErrorActionPreference = 'Stop'
        & $Launcher @Parameters -OnProgress {
            param($Stage)
            $ProgressQueue.Enqueue($Stage)
        }
    }).AddArgument($ServiceLauncher).AddArgument($StartupParameters).AddArgument($queue)
    $timer = [Windows.Threading.DispatcherTimer]::new()
    $timer.Interval = [TimeSpan]::FromMilliseconds(100)
    $pending = $null
    $tick = {
        $stage = $null
        while ($queue.TryDequeue([ref]$stage)) {
            if ($stages.ContainsKey($stage)) { $stageLabel.Text = $stages[$stage] }
        }
        $elapsedLabel.Text = "已等待 $([int]$watch.Elapsed.TotalSeconds) 秒"
        if (-not $pending.IsCompleted) { return }
        $timer.Stop()
        $state.Finished = $true
        try {
            $worker.EndInvoke($pending) | Out-Null
            if ($worker.HadErrors) { throw $worker.Streams.Error[0] }
            & $OnReady | Out-Null
            $state.Success = $true
            $window.Close()
        } catch {
            $heading.Text = '启动未完成'
            $stageLabel.Text = '请根据下方原因处理后，重新双击快捷方式。'
            $activity.IsIndeterminate = $false
            $hint.Visibility = 'Collapsed'
            $errorDetails.Text = $_.Exception.Message
            $errorDetails.Visibility = 'Visible'
            $closeButton.Content = '关闭'
        }
    }
    $close = { $window.Close() }
    $timer.Add_Tick($tick)
    $closeButton.Add_Click($close)
    try {
        $pending = $worker.BeginInvoke()
        $timer.Start()
        [void]$window.ShowDialog()
    } finally {
        $timer.Stop()
        $timer.Remove_Tick($tick)
        $closeButton.Remove_Click($close)
        $watch.Stop()
        # Stopping this runspace cancels waiting, not the detached review process.
        if ($pending -and -not $state.Finished) { $worker.Stop() }
        $worker.Dispose()
    }
    return $state.Success
}
