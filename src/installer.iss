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
AppName=lampfish
AppVersion={#Version}
AppVerName=lampfish {#Version}
AppPublisher=Brieuc Garrigoux
AppPublisherURL=https://github.com/brieucgarrigoux/Lampfish-Desktop
AppSupportURL=https://github.com/brieucgarrigoux/Lampfish-Desktop/issues
AppUpdatesURL=https://github.com/brieucgarrigoux/Lampfish-Desktop/releases
VersionInfoVersion={#Version}
PrivilegesRequired=lowest
DefaultDirName={autopf}\Lampfish
UsePreviousAppDir=no
DisableDirPage=yes
DisableProgramGroupPage=yes
DisableReadyPage=yes
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
WizardStyle=modern dark
WizardImageFile={#Brand}logo-lampfish-192.png
WizardImageStretch=no
WizardSmallImageFile={#Brand}logo-lampfish-192.png
SetupIconFile=icon.ico
UninstallDisplayIcon={app}\Lampfish.exe
UninstallDisplayName=lampfish
RestartApplications=no
OutputBaseFilename=Lampfish-Setup-{#Version}
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
english.NeedWebView2=lampfish needs the Microsoft Edge WebView2 Runtime, which is missing on this PC.%n%nOpen the Microsoft download page?
french.NeedWebView2=lampfish a besoin du runtime Microsoft Edge WebView2, absent de ce PC.%n%nOuvrir la page de téléchargement de Microsoft ?
english.NeedDotNet=lampfish needs .NET Framework 4.8, part of Windows 10 since version 1903.%n%nOpen the Microsoft download page?
french.NeedDotNet=lampfish a besoin de .NET Framework 4.8, inclus dans Windows 10 depuis la version 1903.%n%nOuvrir la page de téléchargement de Microsoft ?
english.DeleteData=Also delete the settings and files of lampfish (added wallpapers, cursors, icons, sounds)?%n%nKeeping them brings everything back after a new install.
english.CannotMove=lampfish could not move its folder because a file in it is in use. Restart the PC, then run the update again.
french.CannotMove=lampfish n'a pas pu déplacer son dossier, car un fichier y est encore utilisé. Redémarrez le PC, puis relancez la mise à jour.
french.DeleteData=Supprimer aussi les réglages et les fichiers de lampfish (fonds ajoutés, curseurs, icônes, sons) ?%n%nLes garder permet de tout retrouver après une nouvelle installation.

[Tasks]
Name: "desktopicon"; Description: "{cm:DesktopIcon}"; GroupDescription: "{cm:Options}"; Check: not IsUpgrade
Name: "startup"; Description: "{cm:Startup}"; GroupDescription: "{cm:Options}"; Flags: unchecked; Check: not IsUpgrade

[InstallDelete]
Type: files; Name: "{autoprograms}\Bramble.lnk"
Type: files; Name: "{app}\Bramble.exe"
Type: files; Name: "{app}\Bramble.exe.config"
Type: files; Name: "{app}\wallpapers\bramble-logo.html"
Type: files; Name: "{app}\wallpapers\bramble-dusk.html"
Type: files; Name: "{app}\wallpapers\bramble.html"
Type: filesandordirs; Name: "{app}\app\cursor-themes\Bramble *"
Type: files; Name: "{app}\brand\logo\berry-*.png"
Type: files; Name: "{app}\brand\logo\logo-bramble*.png"
Type: files; Name: "{app}\brand\badge\powered-by-bramble*.png"

[Files]
Source: "{#Source}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\lampfish"; Filename: "{app}\Lampfish.exe"; WorkingDir: "{app}"
Name: "{autodesktop}\lampfish"; Filename: "{app}\Lampfish.exe"; WorkingDir: "{app}"; Tasks: desktopicon

[Registry]
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "Lampfish"; ValueData: """{app}\Lampfish.exe"" --background"; Tasks: startup

[Run]
Filename: "{app}\Lampfish.exe"; Description: "{cm:LaunchProgram,lampfish}"; Flags: nowait postinstall skipifsilent
Filename: "{app}\Lampfish.exe"; Flags: nowait; Check: WizardSilent

[UninstallRun]
Filename: "{app}\Lampfish.exe"; Parameters: "--uninstall"; Flags: runhidden waituntilterminated; RunOnceId: "UndoWindowsChanges"

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

// Without its mutex there is nothing to quit, and --quit would start a version up to 0.4 instead of stopping it.
procedure AskToQuit(Mutex, Exe: String);
var
  Code, Waited: Integer;
begin
  if not CheckForMutexes(Mutex) or not FileExists(Exe) then Exit;
  Exec(Exe, '--quit', '', SW_HIDE, ewWaitUntilTerminated, Code);
  Waited := 0;
  while CheckForMutexes(Mutex) and (Waited < 15000) do
  begin
    Sleep(250);
    Waited := Waited + 250;
  end;
end;

// The folder of a version named Bramble moves whole, so the settings and files beside the exe stay with it.
// The web engine can hold the folder for a moment after the app quit.
function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  Code, Waited: Integer;
  Old: String;
begin
  Result := '';
  Old := ExpandConstant('{autopf}\Bramble');
  AskToQuit('Bramble.SingleInstance', Old + '\Bramble.exe');
  AskToQuit('Lampfish.SingleInstance', ExpandConstant('{app}\Lampfish.exe'));
  if DirExists(Old) and not DirExists(ExpandConstant('{app}')) then
  begin
    Waited := 0;
    while not RenameFile(Old, ExpandConstant('{app}')) do
    begin
      if Waited >= 15000 then
      begin
        Exec(Old + '\Bramble.exe', '', '', SW_SHOW, ewNoWait, Code);
        Result := CustomMessage('CannotMove');
        Exit;
      end;
      Sleep(250);
      Waited := Waited + 250;
    end;
  end;
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  if (CurUninstallStep = usPostUninstall) and not UninstallSilent then
    if MsgBox(CustomMessage('DeleteData'), mbConfirmation, MB_YESNO or MB_DEFBUTTON2) = IDYES then
    begin
      DelTree(ExpandConstant('{app}'), True, True, True);
      DelTree(ExpandConstant('{localappdata}\Lampfish'), True, True, True);
    end;
end;
