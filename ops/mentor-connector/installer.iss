; User-scoped pilot installer: no admin, no credentials in Windows files.
#define AppVersion "0.1.0-beta.4"
[Setup]
AppId=LinguistProPersonalTutor
AppName=LinguistPro Tutor
AppVersion={#AppVersion}
DefaultDirName={localappdata}\LinguistProTutor
DefaultGroupName=LinguistPro Tutor
PrivilegesRequired=lowest
OutputDir=..\..\.tmp\tutor-installer
OutputBaseFilename=LinguistProTutor-{#AppVersion}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
UninstallDisplayName=LinguistPro Tutor
CloseApplications=no
[Languages]
Name: "russian"; MessagesFile: "compiler:Languages\Russian.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"
[Files]
Source: "windows\Tutor.ps1"; DestDir: "{app}"; Flags: ignoreversion
Source: "connector.py"; DestDir: "{app}"; Flags: ignoreversion
Source: "hermes_turn.py"; DestDir: "{app}"; Flags: ignoreversion
Source: "mcp_setup.py"; DestDir: "{app}"; Flags: ignoreversion
[Icons]
Name: "{group}\LinguistPro Tutor"; Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -STA -File ""{app}\Tutor.ps1"""; WorkingDir: "{app}"
Name: "{userdesktop}\LinguistPro Tutor"; Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -STA -File ""{app}\Tutor.ps1"""; WorkingDir: "{app}"
[Registry]
Root: HKCU; Subkey: "Software\Classes\linguistpro-tutor"; ValueType: string; ValueData: "URL:LinguistPro Tutor"; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Classes\linguistpro-tutor"; ValueType: string; ValueName: "URL Protocol"; ValueData: ""
Root: HKCU; Subkey: "Software\Classes\linguistpro-tutor\shell\open\command"; ValueType: string; ValueData: """{sys}\WindowsPowerShell\v1.0\powershell.exe"" -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -STA -File ""{app}\Tutor.ps1"""
[Run]
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -STA -File ""{app}\Tutor.ps1"""; Description: "Открыть LinguistPro Tutor"; Flags: nowait postinstall skipifsilent

[UninstallRun]
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""{app}\Tutor.ps1"" -Remove"; Flags: runhidden waituntilterminated; RunOnceId: "StopTutor"
