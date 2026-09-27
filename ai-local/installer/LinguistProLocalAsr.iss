#define MyAppName "LinguistPro Local AI Companion"
; The version is passed in by scripts/build_companion.ps1 from ai_local/version.py, the one
; place it is written. Compiling this file by hand still works, and then it says so: an
; installer named "unset" is a visible mistake, unlike a stale number that looks plausible.
#ifndef MyAppVersion
  #define MyAppVersion "unset-compile-via-build_companion.ps1"
#endif
#ifndef MyAppFileVersion
  #define MyAppFileVersion "0.0.0.0"
#endif
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
OutputBaseFilename=LinguistProLocalAsrCompanion-{#MyAppVersion}-unsigned-internal
Compression=lzma2/fast
SolidCompression=yes
WizardStyle=modern
DisableProgramGroupPage=yes
UninstallDisplayIcon={app}\{#MyAppExeName}
InfoBeforeFile=..\THIRD_PARTY_NOTICES.md
VersionInfoVersion={#MyAppFileVersion}
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
; Started through Explorer, never as a child of Setup: processes Setup creates inherit its redirection
; mitigation, and the Companion then could not open its own model files (WinError 448, 2026-09-28).
Name: "{app}\Start Companion service"; Filename: "{app}\{#MyAppExeName}"; Parameters: "--autostart"

[Run]
Filename: "{win}\explorer.exe"; Parameters: """{app}\Start Companion service.lnk"""; Flags: runhidden nowait skipifdoesntexist; Check: RestartOwnedService
Filename: "{win}\explorer.exe"; Parameters: """{app}\{#MyAppExeName}"""; Description: "Open the Local ASR Companion"; Flags: nowait postinstall skipifsilent

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

{ Owner decision 2026-09-28: the owner chooses where temporary media copies live (a film may need
  three times its size). The choice is written by the Companion itself (--set-work-dir), so the
  settings file keeps a single writer; this page only asks and remembers the previous answer. }
var
  WorkDirPage: TInputDirWizardPage;
  UninstallWorkDir: String;

function SettingsFile: String;
begin
  Result := ExpandConstant('{localappdata}\LinguistPro\LocalASR\state\settings.json');
end;

{ settings.json is written with ASCII escapes; decode \, \", \/ and \uXXXX for a Cyrillic path. }
function JsonUnescape(const S: String): String;
var
  I: Integer;
  C: Char;
begin
  Result := '';
  I := 1;
  while I <= Length(S) do
  begin
    C := S[I];
    if (C = '\') and (I < Length(S)) then
    begin
      C := S[I + 1];
      if (C = 'u') and (I + 5 <= Length(S)) then
      begin
        Result := Result + Chr(StrToInt('$' + Copy(S, I + 2, 4)));
        I := I + 6;
      end
      else
      begin
        Result := Result + C;
        I := I + 2;
      end;
    end
    else
    begin
      Result := Result + C;
      I := I + 1;
    end;
  end;
end;

function StoredWorkDir: String;
var
  Raw: AnsiString;
  S: String;
  P: Integer;
begin
  Result := '';
  if not LoadStringFromFile(SettingsFile, Raw) then
    Exit;
  S := String(Raw);
  P := Pos('"work_dir": "', S);
  if P = 0 then
    Exit;
  S := Copy(S, P + 13, Length(S));
  P := 1;
  while (P <= Length(S)) and not ((S[P] = '"') and ((P = 1) or (S[P - 1] <> '\'))) do
    P := P + 1;
  Result := JsonUnescape(Copy(S, 1, P - 1));
end;

procedure InitializeWizard;
var
  Current: String;
begin
  WorkDirPage := CreateInputDirPage(wpSelectDir,
    'Folder for temporary video copies',
    'Where should the Companion keep videos while Studio prepares them?',
    'A film can need up to three times its size here while it is prepared. ' +
    'Copies are removed as soon as they are no longer needed. ' +
    'Choose a disk with plenty of free space.',
    False, '');
  WorkDirPage.Add('');
  Current := StoredWorkDir;
  if Current = '' then
    Current := ExpandConstant('{localappdata}\LinguistPro\LocalASR\work');
  WorkDirPage.Values[0] := Current;
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  ResultCode: Integer;
begin
  if CurStep = ssPostInstall then
  begin
    if not Exec(ExpandConstant('{app}\{#MyAppExeName}'), '--set-work-dir "' + WorkDirPage.Values[0] + '"',
                '', SW_HIDE, ewWaitUntilTerminated, ResultCode) or (ResultCode <> 0) then
      SuppressibleMsgBox('The folder for temporary video copies could not be used: ' + WorkDirPage.Values[0] +
        '. The Companion keeps its previous folder; you can change it later in the Companion window.',
        mbError, MB_OK, IDOK);
  end;
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  if CurUninstallStep = usUninstall then
    UninstallWorkDir := StoredWorkDir;
  if (CurUninstallStep = usPostUninstall) and (UninstallWorkDir <> '') then
  begin
    { Only the Companion's own subfolders; the chosen folder may hold other files. }
    DelTree(AddBackslash(UninstallWorkDir) + 'media-jobs', True, True, True);
    DelTree(AddBackslash(UninstallWorkDir) + 'asr-jobs', True, True, True);
    RemoveDir(UninstallWorkDir);
  end;
end;
