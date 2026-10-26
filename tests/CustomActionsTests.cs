using System;

class CustomActionsTests {
 static void Check(bool condition,string message){if(!condition)throw new Exception(message);Console.WriteLine("PASS "+message);}
 static bool Rejects(Action action){try{action();return false;}catch{return true;}}
 static void Main(){
  CustomActions.ValidateUrl("https://example.com/path?q=1");
  CustomActions.ValidateUrl("http://192.168.1.10:8080/");
  Check(Rejects(delegate{CustomActions.ValidateUrl("file:///C:/Windows/notepad.exe");}),"URL action rejects local files");
  Check(Rejects(delegate{CustomActions.ValidateUrl("javascript:alert(1)");}),"URL action rejects script schemes");
  Check(Rejects(delegate{CustomActions.ValidateUrl("");}),"URL action rejects empty values");
  CustomActions.ValidateText("定型文\r\n2行目");
  Check(Rejects(delegate{CustomActions.ValidateText("");}),"clipboard action rejects empty text");
  Check(Rejects(delegate{CustomActions.ValidateText(new string('x',CustomActions.MaxTextLength+1));}),"clipboard action limits stored text");
 }
}
