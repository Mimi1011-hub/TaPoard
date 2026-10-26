using System;

class IconPresetTests {
 static void Check(bool condition,string message){if(!condition)throw new Exception(message);}
 static int Main(){
  Check(IconPresets.Exists("star"),"Known preset rejected");
  Check(!IconPresets.Exists("not-a-preset"),"Unknown preset accepted");
  Check(IconPresets.ValidCustomIcon(""),"Empty automatic icon rejected");
  string png="data:image/png;base64,iVBORw0KGgo=";
  Check(IconPresets.ValidCustomIcon(png),"PNG icon rejected");
  Check(!IconPresets.ValidCustomIcon("data:image/png;base64,SGVsbG8="),"Invalid PNG accepted");
  Check(!IconPresets.ValidCustomIcon("data:text/html;base64,PGgxPk5vPC9oMT4="),"Unexpected media type accepted");
  Console.WriteLine("PASS icon preset and custom image validation");
  return 0;
 }
}
