using System;
using System.IO;
class ImportTests {
 static void Check(bool condition,string message){if(!condition)throw new Exception(message);Console.WriteLine("PASS "+message);}
 [STAThread]static void Main(string[] args){
  var exe=AppImporter.FromPath(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Windows),"notepad.exe"));
  Check(exe.name=="notepad"&&File.Exists(exe.path),"exe name and absolute path");
  Check(exe.icon!=null&&exe.icon.StartsWith("data:image/png;base64,iVBOR"),"exe icon extracted as PNG");
  var shortcut=AppImporter.FromPath(args[0]);
  Check(shortcut.name=="日本語 アプリ"&&shortcut.path.EndsWith(".lnk")&&shortcut.args=="","shortcut preserves launch properties via original .lnk");
  Check(AppImporter.ValidPath(shortcut.path),"shortcut accepted for settings persistence");
  Check(shortcut.icon!=null&&shortcut.icon.StartsWith("data:image/png;base64,iVBOR"),"shortcut icon extracted as PNG");
  Check(AppIcons.Read(args[0]+".missing")==null,"missing icon falls back without failure");
  Check(!AppImporter.ValidPath(Path.Combine(Path.GetDirectoryName(args[0]),"missing.exe")),"missing app rejected");
  Check(!AppImporter.ValidPath("relative.exe"),"relative path rejected");
  bool rejected=false;try{AppImporter.FromPath(args[1]);}catch(Exception){rejected=true;}Check(rejected,"non-app file rejected");
 }
}
