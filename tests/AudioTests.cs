using System;
class AudioTests {
 static void Check(bool condition,string message){if(!condition)throw new Exception(message);Console.WriteLine("PASS "+message);}
 static void Main(){
  Check(AudioControl.AdjustedValue(2,-5)==0&&AudioControl.AdjustedValue(98,5)==100&&AudioControl.AdjustedValue(50,-5)==45,"relative volume steps use the current PC value and clamp to range");
  bool invalid=false;try{AudioControl.AdjustedValue(50,0);}catch{invalid=true;}Check(invalid,"zero relative volume step is rejected");
  AudioState state=AudioControl.Read();
  Check(state.speakerAvailable,"default Windows speaker endpoint is available");
  Check(state.speakerVolume>=0&&state.speakerVolume<=100,"speaker volume is in range");
  AudioState after=AudioControl.SetVolume("speaker",state.speakerVolume);
  Check(after.speakerAvailable,"speaker volume accepts an absolute value");
  if(state.micAvailable){Check(state.micVolume>=0&&state.micVolume<=100,"microphone volume is in range");AudioControl.SetVolume("mic",state.micVolume);Console.WriteLine("PASS microphone volume accepts an absolute value");}
  else Console.WriteLine("INFO no default microphone endpoint is currently available");
 }
}
