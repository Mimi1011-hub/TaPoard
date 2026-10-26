using System;
using System.Net;
using System.Collections.Generic;
using System.Text;
class NetworkTests {
 static void Check(bool ok,string label){if(!ok)throw new Exception(label);Console.WriteLine("PASS "+label);}
 static byte[] Query(string host,int type){var b=new List<byte>(new byte[]{0,9,0,0,0,1,0,0,0,0,0,0});foreach(string x in host.Split('.')){b.Add((byte)x.Length);b.AddRange(Encoding.ASCII.GetBytes(x));}b.AddRange(new byte[]{0,0,(byte)type,0,1});return b.ToArray();}
 static void Main(){
  var a=IPAddress.Parse("192.168.11.18");var m=IPAddress.Parse("255.255.255.0");
  Check(LanNetwork.SameSubnet(IPAddress.Parse("192.168.11.22"),a,m),"local subnet accepted");
  Check(!LanNetwork.SameSubnet(IPAddress.Parse("192.168.12.22"),a,m),"different subnet rejected");
  Check(!LanNetwork.SameSubnet(IPAddress.Parse("100.64.0.1"),a,m),"VPN rejected");
  bool u;byte[] q;string name="tapoard-test.local";
  Check(LanNetwork.Matches(Query(name,1),name,out u,out q),"A query recognized");
  Check(!LanNetwork.Matches(Query("other.local",1),name,out u,out q),"other hostname ignored");
  Check(!LanNetwork.Matches(Query(name,28),name,out u,out q),"AAAA not incorrectly answered");
  Check(!LanNetwork.Matches(new byte[3],name,out u,out q),"short packet ignored");
  var before=LanNetwork.BuildAnswer(name,a,120,null);var after=LanNetwork.BuildAnswer(name,IPAddress.Parse("192.168.11.42"),120,null);
  Check(before[before.Length-1]==18&&after[after.Length-1]==42,"updated IP encoded in DNS response");
  Check(after[2]==0x84&&after[7]==1,"authoritative single answer");
  Check(!LanNetwork.Matches(after,name,out u,out q),"responses do not create response loops");
  var corrupt=new byte[]{0,0,0,0,0,1,0,0,0,0,0,0,192,12};bool rejected=false;
  try{LanNetwork.Matches(corrupt,name,out u,out q);}catch(FormatException){rejected=true;}
  Check(rejected,"cyclic compression pointer rejected");
 }
}
