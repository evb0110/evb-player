$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot
$sdk = Join-Path $root '.devkit/mpv-sdk'
New-Item -ItemType Directory -Force $sdk | Out-Null
$archive = Join-Path $sdk 'mpv.7z'
$url = 'https://github.com/zhongfly/mpv-winbuild/releases/download/2026-10-18-6a262d11f6/mpv-dev-x86_64-20261018-git-6a262d11f6.7z'
Invoke-WebRequest $url -OutFile $archive
$expected = '6ea45c35854b6571b68646338cd69353b8d8a22bd1c7fffdc82fe379f6263a10'
if ((Get-FileHash $archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expected) { throw 'libmpv SDK checksum mismatch' }
& 7z.exe x $archive "-o$sdk" -y | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'libmpv extraction failed' }
$dll = Get-ChildItem $sdk -Recurse -Filter 'libmpv-2.dll' | Select-Object -First 1
if (-not $dll) { throw 'libmpv runtime missing' }
if ($dll.DirectoryName -ne $sdk) { Copy-Item $dll.FullName (Join-Path $sdk 'libmpv-2.dll') }
# The current libmpv build imports the Vulkan loader even when playback uses
# software rendering. Ship it beside libmpv rather than require a system SDK.
$vulkanArchive = Join-Path $sdk 'vulkan.zip'
Invoke-WebRequest 'https://sdk.lunarg.com/sdk/download/1.4.363.0/windows/VulkanRT-X64-1.4.363.0-Components.zip' -OutFile $vulkanArchive
if ((Get-FileHash $vulkanArchive -Algorithm SHA256).Hash.ToLowerInvariant() -ne 'a25a927aa8b9f0371048f1861cf88ac3b9bc9b1fb332c42d897c8ab32695769a') { throw 'Vulkan loader checksum mismatch' }
$vulkan = Join-Path $sdk 'vulkan'
Expand-Archive $vulkanArchive -DestinationPath $vulkan -Force
$loader = Get-ChildItem $vulkan -Recurse -Filter 'vulkan-1.dll' | Where-Object { $_.FullName -match '[\\/]x64[\\/]' } | Select-Object -First 1
if (-not $loader) { throw 'Vulkan x64 loader missing' }
Copy-Item $loader.FullName (Join-Path $sdk 'vulkan-1.dll')
$vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio/Installer/vswhere.exe'
$vs = & $vswhere -latest -property installationPath
$toolset = Get-ChildItem (Join-Path $vs 'VC/Tools/MSVC') -Directory | Sort-Object Name -Descending | Select-Object -First 1
$env:PATH = (Join-Path $toolset.FullName 'bin/Hostx64/x64') + ';' + $env:PATH
& (Join-Path $root 'vendor/electron-mpv-video/create-libmpv-import-lib.ps1') -DllPath (Join-Path $sdk 'libmpv-2.dll') -OutputPath (Join-Path $sdk 'mpv.lib')
