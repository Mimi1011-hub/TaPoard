using System;
using System.Collections.Generic;

static class IconPresets {
 static readonly HashSet<string> Keys=new HashSet<string>(StringComparer.Ordinal){
  "headphones","headset","earbuds","soundbar","usb-mic","studio-mic","audio-output","audio-input","equalizer","gamepad","laptop","timer","calendar","monitor","recording","radio",
  "star","heart","bolt","check","close","plus","minus","home","settings","power","lock","unlock","search","bell","info","help",
  "play","pause","stop","previous","next","record","music","speaker","mute","microphone","camera","video",
  "chat","mail","phone","users","person","share","link","upload","download","wifi","bluetooth","globe",
  "windows","desktop","folder","file","save","keyboard","mouse","print","screenshot","trash","copy","paste",
  "brush","pen","pencil","eraser","palette","image","layers","eye","eyedropper","zoom-in","zoom-out","rotate",
  "arrow-up","arrow-down","arrow-left","arrow-right","back","forward","refresh","menu","grid","list","fullscreen","target"
 };
 public static bool ValidColor(string value){return String.IsNullOrEmpty(value)||System.Text.RegularExpressions.Regex.IsMatch(value,"\\A#[0-9a-fA-F]{6}\\z");}
 public static bool Exists(string key){return String.IsNullOrEmpty(key)||Keys.Contains(key);}
 public static bool ValidCustomIcon(string value){
  if(String.IsNullOrEmpty(value))return true;
  string[] prefixes={"data:image/png;base64,","data:image/jpeg;base64,","data:image/webp;base64,"};string prefix=null;
  foreach(string candidate in prefixes)if(value.StartsWith(candidate,StringComparison.Ordinal)){prefix=candidate;break;}
  if(prefix==null||value.Length>60000)return false;
  try{
   byte[] data=Convert.FromBase64String(value.Substring(prefix.Length));if(data.Length==0||data.Length>45000)return false;
   if(prefix.IndexOf("png",StringComparison.Ordinal)>=0)return data.Length>=8&&data[0]==0x89&&data[1]==0x50&&data[2]==0x4e&&data[3]==0x47&&data[4]==0x0d&&data[5]==0x0a&&data[6]==0x1a&&data[7]==0x0a;
   if(prefix.IndexOf("jpeg",StringComparison.Ordinal)>=0)return data.Length>=3&&data[0]==0xff&&data[1]==0xd8&&data[2]==0xff;
   return data.Length>=12&&data[0]==0x52&&data[1]==0x49&&data[2]==0x46&&data[3]==0x46&&data[8]==0x57&&data[9]==0x45&&data[10]==0x42&&data[11]==0x50;
  }catch{return false;}
 }
}
