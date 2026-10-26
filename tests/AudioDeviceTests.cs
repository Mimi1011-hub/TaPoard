using System;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Reflection;
using System.Text;
using System.Threading;
using System.Collections.Generic;
using System.Web.Script.Serialization;

class AudioDeviceTests {
 static readonly JavaScriptSerializer Json=new JavaScriptSerializer();
 static void Check(bool ok,string description){if(!ok)throw new Exception(description);Console.WriteLine("PASS "+description);}
 static void Set(string name,object value){typeof(Program).GetField(name,BindingFlags.Static|BindingFlags.NonPublic).SetValue(null,value);}
 static string Request(string path,string token,string body,int expected){
  var listener=new TcpListener(IPAddress.Loopback,0);listener.Start();int port=((IPEndPoint)listener.LocalEndpoint).Port;
  Exception failure=null;var server=new Thread(delegate(){try{var client=listener.AcceptTcpClient();typeof(Program).GetMethod("Handle",BindingFlags.NonPublic|BindingFlags.Static).Invoke(null,new object[]{client});}catch(Exception e){failure=e;}finally{listener.Stop();}});server.Start();
  var request=(HttpWebRequest)WebRequest.Create("http://127.0.0.1:"+port+path);request.Headers["Authorization"]="Bearer "+token;request.Timeout=10000;
  if(body!=null){request.Method="POST";request.ContentType="application/json";byte[] bytes=Encoding.UTF8.GetBytes(body);request.ContentLength=bytes.Length;using(var stream=request.GetRequestStream())stream.Write(bytes,0,bytes.Length);}
  HttpWebResponse response;try{response=(HttpWebResponse)request.GetResponse();}catch(WebException e){response=(HttpWebResponse)e.Response;}
  string text;using(response){Check((int)response.StatusCode==expected,path+" HTTP "+expected);using(var reader=new StreamReader(response.GetResponseStream()))text=reader.ReadToEnd();}
  if(!server.Join(12000))throw new Exception("Test server timeout");if(failure!=null)throw failure;return text;
 }
 [STAThread] static int Main(string[] args){try{Run(args);return 0;}catch(Exception e){Console.WriteLine("ERROR "+e.GetType().FullName+" HR="+e.HResult.ToString("X8")+" "+e.Message);return 1;}}
 static void Run(string[] args){
  var devices=AudioDevices.List();Check(devices.Count>0,"Windows device enumeration");
  foreach(var d in devices)Console.WriteLine("DEVICE "+d.target+" "+d.name+" active="+d.available+" default="+d.selected);
  if(Array.IndexOf(args,"--list")>=0)return;
  var device=devices.Find(d=>d.available&&d.target=="speaker");Check(device!=null,"available output for tests");
  Check(IconPresets.ValidColor("#3569c8")&&!IconPresets.ValidColor("red;bad")&&!IconPresets.ValidColor("#3569c8\n"),"color validation");
  Check(IconPresets.Exists("headset")&&IconPresets.Exists("earbuds"),"new device icons");
  var config=new Settings{token="test-phone",pairingKey="test-short",apps=new List<AppEntry>(),columns=5,rows=3,speakerSlot=0,micSlot=1,keepAwake=true};Set("config",config);Set("admin","test-admin");
  Request("/api/devices","test-phone",null,404);Request("/api/devices","wrong",null,401);
  string listing=Request("/api/devices","test-admin",null,200);Check(listing.Contains(device.id),"admin lists exact endpoint IDs");
  var app=new AppEntry{name="音声テスト",type="audioDevice",deviceTarget="speaker",deviceId=device.id,iconKey="headset",iconColor="#3569c8"};
  Request("/api/settings","test-phone",Json.Serialize(new{apps=new[]{app}}),403);
  app.deviceTarget="mic";Request("/api/settings","test-admin",Json.Serialize(new{apps=new[]{app}}),400);app.deviceTarget="speaker";
  Request("/api/settings","test-admin",Json.Serialize(new{apps=new[]{app}}),200);
  var saved=Json.Deserialize<Settings>(File.ReadAllText(Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"data/settings.json")));
  Check(saved.apps[0].deviceId==device.id&&saved.apps[0].iconColor=="#3569c8"&&saved.token=="test-phone","device identity, color and key persist");
  var state=Request("/api/state","test-phone",null,200);Check(state.Contains(device.id)&&state.Contains("#3569c8"),"phone receives device and icon color");
  Request("/api/action","test-phone","{\"action\":\"launch\",\"id\":\"missing\"}",400);
  app.deviceId="missing-device";Request("/api/settings","test-admin",Json.Serialize(new{apps=new[]{app}}),400);
  var offline=devices.Find(d=>!d.available);if(offline!=null){bool rejected=false;try{AudioDevices.Switch(offline.target,offline.id);}catch{rejected=true;}Check(rejected,"unavailable device cannot switch");}
  // Exercise exact switching, then restore each original Windows role in all cases.
  var original=new string[2,3];for(int f=0;f<2;f++)for(int r=0;r<3;r++)original[f,r]=AudioDevices.DefaultId(f,r);
  try{
   Request("/api/action","test-phone",Json.Serialize(new{action="launch",id=saved.apps[0].id}),200);
   for(int r=0;r<3;r++)Check(AudioDevices.DefaultId(0,r)==device.id,"registered button selects role "+r);
   foreach(string target in new[]{"speaker","mic"}){
    int flow=target=="speaker"?0:1;int tested=0;
    foreach(var d in devices){if(!d.available||d.target!=target)continue;AudioDevices.Switch(target,d.id);for(int r=0;r<3;r++)Check(AudioDevices.DefaultId(flow,r)==d.id,"direct "+target+" switch role "+r);if(++tested==2)break;}
   }
  }finally{
   object instance=Activator.CreateInstance(typeof(AudioDevices).GetNestedType("PolicyClient",BindingFlags.NonPublic));
   Type policy=typeof(AudioDevices).GetNestedType("Policy",BindingFlags.NonPublic);
   try{for(int f=0;f<2;f++)for(int r=0;r<3;r++)if(original[f,r]!=null){int hr=(int)policy.GetMethod("SetDefaultEndpoint").Invoke(instance,new object[]{original[f,r],r});System.Runtime.InteropServices.Marshal.ThrowExceptionForHR(hr);}}
   finally{System.Runtime.InteropServices.Marshal.ReleaseComObject(instance);}
   for(int f=0;f<2;f++)for(int r=0;r<3;r++)Check(AudioDevices.DefaultId(f,r)==original[f,r],"original endpoint restored "+f+"/"+r);
  }
 }
}
