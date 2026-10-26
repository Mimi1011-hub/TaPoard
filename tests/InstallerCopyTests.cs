using System;
using System.IO;
using System.Threading;

class InstallerCopyTests {
 static void Check(bool condition,string message){if(!condition)throw new Exception(message);Console.WriteLine("PASS "+message);}
 static void Main(){
  string root=Path.Combine(Path.GetTempPath(),"TaPoard-installer-copy-"+Guid.NewGuid().ToString("N"));
  Directory.CreateDirectory(root);
  try{
   string source=Path.Combine(root,"source.exe"),destination=Path.Combine(root,"TaPoard-Setup.exe");
   File.WriteAllText(source,"new installer");File.WriteAllText(destination,"old installer");File.SetAttributes(destination,FileAttributes.ReadOnly);
   Installer.PrepareInstallerCopy(source,destination);
   Check(File.ReadAllText(destination)=="new installer","read-only installer copy is replaced");

   File.WriteAllText(source,"retry installer");File.WriteAllText(destination,"locked installer");
   using(FileStream locked=new FileStream(destination,FileMode.Open,FileAccess.Read,FileShare.None)){
    Thread release=new Thread(delegate(){Thread.Sleep(600);locked.Dispose();});release.Start();
    Installer.PrepareInstallerCopy(source,destination);release.Join();
   }
   Check(File.ReadAllText(destination)=="retry installer","temporarily locked installer copy is retried");
  }finally{try{Directory.Delete(root,true);}catch{}}
 }
}
