using System;
class AudioTests {
 static void Check(bool condition,string message){if(!condition)throw new Exception(message);Console.WriteLine("PASS "+message);}
 static void Main(){
  AudioState state=AudioControl.Read();
  Check(state.speakerAvailable,"default Windows speaker endpoint is available");
  Check(state.speakerVolume>=0&&state.speakerVolume<=100,"speaker volume is in range");
  AudioState after=AudioControl.SetVolume("speaker",state.speakerVolume);
  Check(after.speakerAvailable,"speaker volume accepts an absolute value");
  if(state.micAvailable){Check(state.micVolume>=0&&state.micVolume<=100,"microphone volume is in range");AudioControl.SetVolume("mic",state.micVolume);Console.WriteLine("PASS microphone volume accepts an absolute value");}
  else Console.WriteLine("INFO no default microphone endpoint is currently available");
 }
}
