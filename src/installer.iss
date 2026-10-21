; Built by publish.ps1: ISCC /DVersion=x.y.z /DSource=<staged folder> installer.iss
#ifndef Version
  #error Pass /DVersion=x.y.z
#endif
#ifndef Source
  #error Pass /DSource=<folder>
#endif
#define AppId "{{982DBBF8-9DA8-4E70-8C9D-514A38FD61C4}"
#define Brand AddBackslash(SourcePath) + "..\brand\logo\"

[Setup]
AppId={#AppId}
AppName=Bramble
AppVersion={#Version}
AppVerName=Bramble {#Version}
AppPublisher=Brieuc Garrigoux
AppPublisherURL=https://github.com/brieucgarrigoux/Bramble-Desktop
AppSupportURL=https://github.com/brieucgarrigoux/Bramble-Desktop/issues
AppUpdatesURL=https://github.com/brieucgarrigoux/Bramble-Desktop/releases
VersionInfoVersion={#Version}
PrivilegesRequired=lowest
DefaultDirName={autopf}\Bramble
DisableDirPage=yes
DisableProgramGroupPage=yes
DisableReadyPage=yes
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
WizardStyle=modern dark
WizardImageFile={#Brand}logo-bramble-192.png
WizardImageStretch=no
WizardSmallImageFile={#Brand}logo-bramble-192.png
SetupIconFile=icon.ico
UninstallDisplayIcon={app}\Bramble.exe
UninstallDisplayName=Bramble
RestartApplications=no
OutputBaseFilename=Bramble-Setup-{#Version}
Compression=lzma2
SolidCompression=yes

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"
Name: "french"; MessagesFile: "compiler:Languages\French.isl"

[CustomMessages]
english.Options=Options
french.Options=Options
english.DesktopIcon=Shortcut on the desktop
french.DesktopIcon=Raccourci sur le Bureau
english.Startup=Start with Windows
french.Startup=Lancer avec Windows
english.NeedWebView2=Bramble needs the Microsoft Edge WebView2 Runtime, which is missing on this PC.%n%nOpen the Microsoft download page?
french.NeedWebView2=Bramble a besoin du runtime Microsoft Edge WebView2, absent de ce PC.%n%nOuvrir la page de téléchargement de Microsoft ?
english.NeedDotNet=Bramble needs .NET Framework 4.8, part of Windows 10 since version 1903.%n%nOpen the Microsoft download page?
french.NeedDotNet=Bramble a besoin de .NET Framework 4.8, inclus dans Windows 10 depuis la version 1903.%n%nOuvrir la page de téléchargement de Microsoft ?
english.DeleteData=Also delete the settings and files of Bramble (added wallpapers, cursors, icons, sounds)?%n%nKeeping them brings everything back after a new install.
french.DeleteData=Supprimer aussi les réglages et les fichiers de Bramble (fonds ajoutés, curseurs, icônes, sons) ?%n%nLes garder permet de tout retrouver après une nouvelle installation.

[Tasks]
Name: "desktopicon"; Description: "{cm:DesktopIcon}"; GroupDescription: "{cm:Options}"; Check: not IsUpgrade
Name: "startup"; Description: "{cm:Startup}"; GroupDescription: "{cm:Options}"; Flags: unchecked; Check: not IsUpgrade

[Files]
Source: "{#Source}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\Bramble"; Filename: "{app}\Bramble.exe"; WorkingDir: "{app}"
Name: "{autodesktop}\Bramble"; Filename: "{app}\Bramble.exe"; WorkingDir: "{app}"; Tasks: desktopicon

[Registry]
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "Bramble"; ValueData: """{app}\Bramble.exe"" --background"; Tasks: startup

[Run]
Filename: "{app}\Bramble.exe"; Description: "{cm:LaunchProgram,Bramble}"; Flags: nowait postinstall skipifsilent
Filename: "{app}\Bramble.exe"; Flags: nowait; Check: WizardSilent

[UninstallRun]
Filename: "{app}\Bramble.exe"; Parameters: "--uninstall"; Flags: runhidden waituntilterminated; RunOnceId: "UndoWindowsChanges"

[Code]
const
  WebView2Client = 'Software\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}';

var
  Upgrade: Boolean;

function IsUpgrade: Boolean;
begin
  Result := Upgrade;
end;

function HasWebView2(Root: Integer): Boolean;
var
  Version: String;
begin
  Result := RegQueryStringValue(Root, WebView2Client, 'pv', Version) and (Version <> '') and (Version <> '0.0.0.0');
end;

function Ask(Message, Url: String): Boolean;
var
  Code: Integer;
begin
  if SuppressibleMsgBox(Message, mbError, MB_YESNO, IDNO) = IDYES then
    ShellExec('open', Url, '', '', SW_SHOWNORMAL, ewNoWait, Code);
  Result := False;
end;

function InitializeSetup: Boolean;
var
  Release: Cardinal;
begin
  Upgrade := RegKeyExists(HKCU, 'Software\Microsoft\Windows\CurrentVersion\Uninstall\{#AppId}_is1');
  Result := True;
  if not (RegQueryDWordValue(HKLM, 'SOFTWARE\Microsoft\NET Framework Setup\NDP\v4\Full', 'Release', Release) and (Release >= 528040)) then
    Result := Ask(CustomMessage('NeedDotNet'), 'https://dotnet.microsoft.com/download/dotnet-framework/net48')
  else if not (HasWebView2(HKLM32) or HasWebView2(HKCU)) then
    Result := Ask(CustomMessage('NeedWebView2'), 'https://developer.microsoft.com/microsoft-edge/webview2/');
end;

// A running Bramble locks its own files: it is asked to quit before they are replaced.
function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  Code, Waited: Integer;
begin
  Result := '';
  if FileExists(ExpandConstant('{app}\Bramble.exe')) then
  begin
    Exec(ExpandConstant('{app}\Bramble.exe'), '--quit', '', SW_HIDE, ewWaitUntilTerminated, Code);
    Waited := 0;
    while CheckForMutexes('Bramble.SingleInstance') and (Waited < 15000) do
    begin
      Sleep(250);
      Waited := Waited + 250;
    end;
  end;
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  if (CurUninstallStep = usPostUninstall) and not UninstallSilent then
    if MsgBox(CustomMessage('DeleteData'), mbConfirmation, MB_YESNO or MB_DEFBUTTON2) = IDYES then
      DelTree(ExpandConstant('{app}'), True, True, True);
end;
