using System;
using System.Collections.Generic;
class ShortcutTests {
 static void Check(bool condition,string message){if(!condition)throw new Exception(message);Console.WriteLine("PASS "+message);}
 static void Main(){
  string[] actions=ShortcutKeys.Actions();
  Check(actions.Length==109,"shortcut catalog contains 109 allowlisted actions");
  var unique=new HashSet<string>(actions,StringComparer.OrdinalIgnoreCase);
  Check(unique.Count==actions.Length,"shortcut action ids are unique");
  Check(ShortcutKeys.Exists("discord-mute"),"Discord mute is allowlisted");
  Check(ShortcutKeys.Exists("discord-soundboard-overlay"),"Discord soundboard overlay is allowlisted");
  Check(ShortcutKeys.Exists("windows-screenshot"),"Windows screenshot is allowlisted");
  Check(ShortcutKeys.Exists("windows-printscreen")&&ShortcutKeys.Exists("windows-taskmanager"),"additional Windows shortcuts are allowlisted");
  Check(ShortcutKeys.Exists("common-copy")&&ShortcutKeys.Exists("common-save"),"common application shortcuts are allowlisted");
  Check(ShortcutKeys.IsAudio("audio-speaker-mute")&&ShortcutKeys.IsAudio("audio-mic-up"),"speaker and microphone actions are allowlisted");
  Check(ShortcutKeys.Exists("media-playpause"),"media play/pause is allowlisted");
  Check(ShortcutKeys.Exists("browser-reopen"),"browser reopen-tab is allowlisted");
  Check(!ShortcutKeys.Exists("arbitrary-keys"),"arbitrary shortcut is rejected");
  Check(ShortcutKeys.Exists("clip-undo")&&ShortcutKeys.Exists("clip-brush")&&ShortcutKeys.Exists("clip-palettes")&&ShortcutKeys.Exists("clip-new-raster")&&ShortcutKeys.Exists("clip-clip-below")&&ShortcutKeys.Exists("clip-eyedropper"),"CLIP STUDIO shortcuts are allowlisted");
  Check(ShortcutKeys.RequiresDiscordFocus("discord-mute")&&!ShortcutKeys.RequiresDiscordFocus("discord-soundboard-overlay")&&!ShortcutKeys.RequiresDiscordFocus("media-playpause"),"Discord overlay shortcut preserves the active game");
 }
}
