#define MyAppName "LinguistPro Local AI Companion"
#define MyAppVersion "0.3.0-beta.5"
#define MyAppExeName "LinguistProLocalAsrCompanion.exe"

[Setup]
AppId={{7DA33E48-2194-4D80-9E80-4C856F27A731}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppName} {#MyAppVersion}
DefaultDirName={localappdata}\Programs\LinguistPro Local ASR
DefaultGroupName=LinguistPro
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir=..\artifacts
OutputBaseFilename=LinguistProLocalAsrCompanion-0.3.0-beta.5-unsigned-internal
Compression=lzma2/fast
SolidCompression=yes
WizardStyle=modern
DisableProgramGroupPage=yes
UninstallDisplayIcon={app}\{#MyAppExeName}
InfoBeforeFile=..\THIRD_PARTY_NOTICES.md
VersionInfoVersion=0.3.0.2
VersionInfoDescription=Unsigned internal Local ASR, MADLAD and Media Readiness beta Companion
RestartApplications=no

[Tasks]
Name: "startup"; Description: "Start the Local ASR Companion when I sign in"; GroupDescription: "Startup:"; Flags: checkedonce

[Files]
Source: "..\dist\LinguistProLocalAsrCompanion\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\THIRD_PARTY_NOTICES.md"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\LinguistPro Local ASR Companion"; Filename: "{app}\{#MyAppExeName}"
Name: "{group}\Local ASR help (RU)"; Filename: "{sys}\notepad.exe"; Parameters: """{app}\_internal\docs\LOCAL_ASR_COMPANION_GUIDE.md"""
Name: "{group}\Local ASR third-party notices"; Filename: "{app}\THIRD_PARTY_NOTICES.md"
Name: "{userstartup}\LinguistPro Local ASR Companion"; Filename: "{app}\{#MyAppExeName}"; Parameters: "--autostart"; Tasks: startup

[Run]
Filename: "{app}\{#MyAppExeName}"; Parameters: "--start"; Flags: runhidden waituntilterminated skipifdoesntexist; Check: RestartOwnedService
Filename: "{app}\{#MyAppExeName}"; Description: "Open the Local ASR Companion"; Flags: nowait postinstall skipifsilent

[UninstallRun]
Filename: "{app}\{#MyAppExeName}"; Parameters: "--stop"; Flags: runhidden waituntilterminated skipifdoesntexist

[UninstallDelete]
Type: filesandordirs; Name: "{localappdata}\LinguistPro\LocalASR"
Type: dirifempty; Name: "{localappdata}\LinguistPro"

[Code]
var
  RestartServiceAfterUpgrade: Boolean;

function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  ExistingExe: String;
  ServicePidFile: String;
  ResultCode: Integer;
begin
  Result := '';
  ExistingExe := ExpandConstant('{app}\{#MyAppExeName}');
  ServicePidFile := ExpandConstant(
    '{localappdata}\LinguistPro\LocalASR\state\control\service.json'
  );
  RestartServiceAfterUpgrade := FileExists(ServicePidFile);

  if FileExists(ExistingExe) then
  begin
    if not Exec(ExistingExe, '--stop', '', SW_HIDE, ewWaitUntilTerminated, ResultCode) then
      Result := 'The existing Local ASR Companion could not be stopped safely.'
    else if ResultCode <> 0 then
      Result := 'The existing Local ASR Companion refused the safe update stop (exit ' +
        IntToStr(ResultCode) + ').';
  end;
end;

function RestartOwnedService: Boolean;
begin
  Result := RestartServiceAfterUpgrade;
end;
