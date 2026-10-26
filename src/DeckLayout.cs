using System;
using System.Collections.Generic;

class TilePosition { public int page {get;set;} public int row {get;set;} public int column {get;set;} }
static class DeckLayout {
 internal static int Columns(Settings s,bool portrait){return portrait?s.portraitColumns:s.landscapeColumns;}
 internal static int Rows(Settings s,bool portrait){return portrait?s.portraitRows:s.landscapeRows;}
 internal static TilePosition At(int page,int slot,int columns){return new TilePosition{page=page,row=slot/columns,column=slot%columns};}
 internal static void MigrateGrid(Settings s){
  int oldColumns=s.columns>=3&&s.columns<=8?s.columns:5,oldRows=s.rows>=2&&s.rows<=5?s.rows:3;
  if(s.landscapeColumns<2||s.landscapeColumns>8)s.landscapeColumns=Math.Max(oldColumns,oldRows);
  if(s.landscapeRows<2||s.landscapeRows>8)s.landscapeRows=Math.Min(oldColumns,oldRows);
  if(s.portraitColumns<2||s.portraitColumns>8)s.portraitColumns=Math.Min(oldColumns,oldRows);
  if(s.portraitRows<2||s.portraitRows>8)s.portraitRows=Math.Max(oldColumns,oldRows);
  s.columns=s.landscapeColumns;s.rows=s.landscapeRows;
 }
 internal static void MigrateControls(Settings s){
  if(s.landscapeSpeakerSize==0){s.landscapeSpeakerSlot=s.speakerSlot;s.landscapeMicSlot=s.micSlot;s.landscapeSpeakerSize=s.speakerSize==2?2:1;s.landscapeMicSize=s.micSize==2?2:1;}
  if(s.portraitSpeakerSize==0){s.portraitSpeakerSlot=s.speakerSlot;s.portraitMicSlot=s.micSlot;s.portraitSpeakerSize=s.speakerSize==2?2:1;s.portraitMicSize=s.micSize==2?2:1;}
  if(s.landscapeSpeakerSize!=2)s.landscapeSpeakerSize=1;if(s.landscapeMicSize!=2)s.landscapeMicSize=1;if(s.portraitSpeakerSize!=2)s.portraitSpeakerSize=1;if(s.portraitMicSize!=2)s.portraitMicSize=1;
 }
 internal static void Migrate(Settings s){
  MigrateGrid(s);MigrateControls(s);if(s.pageCount<1)s.pageCount=1;if(s.landscapePageCount<1)s.landscapePageCount=s.pageCount;if(s.portraitPageCount<1)s.portraitPageCount=s.pageCount;
  foreach(var a in s.apps){if(a.size==0)a.size=1;if(a.fontSize==0)a.fontSize=11;if(a.iconScale==0)a.iconScale=82;if(!a.labelOpacity.HasValue)a.labelOpacity=45;}
  foreach(bool portrait in new[]{false,true}){
   var occupied=new HashSet<string>();int cols=Columns(s,portrait),rows=Rows(s,portrait);
   string orientation=portrait?"portrait":"landscape";foreach(var a in s.apps){if(a.orientation!=orientation)continue;var p=portrait?a.portrait:a.landscape;if(p!=null)Mark(occupied,p,a.size,cols,rows,s,portrait);}
   foreach(var a in s.apps){if(a.orientation!=orientation||((portrait?a.portrait:a.landscape)!=null))continue;TilePosition p=null;
    for(int page=0;page<40&&p==null;page++)for(int slot=0;slot<cols*rows&&p==null;slot++){var candidate=At(page,slot,cols);if(Fits(occupied,candidate,a.size,cols,rows,s,portrait))p=candidate;}
    if(p==null)throw new Exception("配置する空き枠がありません。");if(portrait)a.portrait=p;else a.landscape=p;Mark(occupied,p,a.size,cols,rows,s,portrait);
   }
  }
  s.landscapePageCount=Math.Max(s.landscapePageCount,RequiredPages(s,"landscape"));s.portraitPageCount=Math.Max(s.portraitPageCount,RequiredPages(s,"portrait"));
 }
 internal static void Reflow(Settings s,string orientation,int oldColumns){
  bool portrait=orientation=="portrait";int cols=Columns(s,portrait),rows=Rows(s,portrait);var controls=new HashSet<string>();
  int speakerSlot=portrait?s.portraitSpeakerSlot:s.landscapeSpeakerSlot,micSlot=portrait?s.portraitMicSlot:s.landscapeMicSlot,speakerSize=portrait?s.portraitSpeakerSize:s.landscapeSpeakerSize,micSize=portrait?s.portraitMicSize:s.landscapeMicSize;
  TilePosition speaker=FindControl(controls,speakerSlot/Math.Max(1,oldColumns),speakerSlot%Math.Max(1,oldColumns),speakerSize,cols,rows);
  MarkControl(controls,speaker,speakerSize);TilePosition mic=FindControl(controls,micSlot/Math.Max(1,oldColumns),micSlot%Math.Max(1,oldColumns),micSize,cols,rows);MarkControl(controls,mic,micSize);
  if(portrait){s.portraitSpeakerSlot=speaker.row*cols+speaker.column;s.portraitMicSlot=mic.row*cols+mic.column;}else{s.landscapeSpeakerSlot=speaker.row*cols+speaker.column;s.landscapeMicSlot=mic.row*cols+mic.column;}
  var occupied=new HashSet<string>();foreach(var a in s.apps){if(a.orientation!=orientation)continue;var original=portrait?a.portrait:a.landscape;TilePosition placed=null;if(original!=null&&Fits(occupied,original,a.size,cols,rows,s,portrait))placed=original;else placed=FindNearest(occupied,original,a.size,cols,rows,s,portrait);if(portrait)a.portrait=placed;else a.landscape=placed;Mark(occupied,placed,a.size,cols,rows,s,portrait);}
  if(portrait)s.portraitPageCount=Math.Max(s.portraitPageCount,RequiredPages(s,orientation));else s.landscapePageCount=Math.Max(s.landscapePageCount,RequiredPages(s,orientation));
 }
 static TilePosition FindControl(HashSet<string> occupied,int wantedRow,int wantedColumn,int size,int cols,int rows){TilePosition best=null;int score=int.MaxValue;for(int y=0;y+size<=rows;y++)for(int x=0;x+size<=cols;x++){bool free=true;for(int yy=y;yy<y+size;yy++)for(int xx=x;xx<x+size;xx++)if(occupied.Contains(Cell(0,yy,xx)))free=false;if(!free)continue;int candidate=Math.Abs(y-wantedRow)+Math.Abs(x-wantedColumn);if(candidate<score){score=candidate;best=new TilePosition{page=0,row=y,column=x};}}if(best==null)throw new Exception("フェーダーを配置できる空き枠がありません。");return best;}
 static void MarkControl(HashSet<string> occupied,TilePosition p,int size){for(int y=p.row;y<p.row+size;y++)for(int x=p.column;x<p.column+size;x++)occupied.Add(Cell(0,y,x));}
 static TilePosition FindNearest(HashSet<string> occupied,TilePosition original,int size,int cols,int rows,Settings s,bool portrait){TilePosition best=null;int score=int.MaxValue,wantedPage=original==null?0:original.page,wantedRow=original==null?0:original.row,wantedColumn=original==null?0:original.column;for(int page=0;page<40;page++)for(int y=0;y+size<=rows;y++)for(int x=0;x+size<=cols;x++){var candidate=new TilePosition{page=page,row=y,column=x};if(!Fits(occupied,candidate,size,cols,rows,s,portrait))continue;int value=Math.Abs(page-wantedPage)*1000+Math.Abs(y-wantedRow)*10+Math.Abs(x-wantedColumn);if(value<score){score=value;best=candidate;}}if(best==null)throw new Exception("配置する空き枠がありません。");return best;}
 static string Cell(int page,int row,int col){return page+":"+row+":"+col;}
 static bool Fits(HashSet<string> occupied,TilePosition p,int size,int cols,int rows,Settings s,bool portrait){
  if(p.page<0||p.page>=40||p.row<0||p.column<0||p.row+size>rows||p.column+size>cols)return false;
  int speakerSlot=portrait?s.portraitSpeakerSlot:s.landscapeSpeakerSlot,micSlot=portrait?s.portraitMicSlot:s.landscapeMicSlot,speakerSize=portrait?s.portraitSpeakerSize:s.landscapeSpeakerSize,micSize=portrait?s.portraitMicSize:s.landscapeMicSize;
  for(int y=p.row;y<p.row+size;y++)for(int x=p.column;x<p.column+size;x++){if(ControlCell(speakerSlot,speakerSize,y,x,cols,rows)||ControlCell(micSlot,micSize,y,x,cols,rows)||occupied.Contains(Cell(p.page,y,x)))return false;}return true;
 }
 static void Mark(HashSet<string> occupied,TilePosition p,int size,int cols,int rows,Settings s,bool portrait){
  if(!Fits(occupied,p,size,cols,rows,s,portrait))throw new Exception("ボタンが重なるか枠からはみ出します。縦・横の配置を確認し、空き枠へ移動してください。");
  for(int y=p.row;y<p.row+size;y++)for(int x=p.column;x<p.column+size;x++)occupied.Add(Cell(p.page,y,x));
 }
 internal static int RequiredPages(Settings s,string orientation){int count=1;foreach(var a in s.apps)if(a.orientation==orientation){var p=orientation=="portrait"?a.portrait:a.landscape;if(p!=null)count=Math.Max(count,p.page+1);}return count;}
 internal static int Pages(Settings s,string orientation){return Math.Max(orientation=="portrait"?s.portraitPageCount:s.landscapePageCount,RequiredPages(s,orientation));}
 static bool ControlCell(int slot,int size,int row,int column,int cols,int rows){int top=slot/cols,left=slot%cols;return top>=0&&left>=0&&top+size<=rows&&left+size<=cols&&row>=top&&row<top+size&&column>=left&&column<left+size;}
 static bool ControlsValid(Settings s,int cols,int rows,bool portrait){int speakerSlot=portrait?s.portraitSpeakerSlot:s.landscapeSpeakerSlot,micSlot=portrait?s.portraitMicSlot:s.landscapeMicSlot,speakerSize=portrait?s.portraitSpeakerSize:s.landscapeSpeakerSize,micSize=portrait?s.portraitMicSize:s.landscapeMicSize;int sy=speakerSlot/cols,sx=speakerSlot%cols,my=micSlot/cols,mx=micSlot%cols;if(sy+speakerSize>rows||sx+speakerSize>cols||my+micSize>rows||mx+micSize>cols)return false;return !(sy<my+micSize&&sy+speakerSize>my&&sx<mx+micSize&&sx+speakerSize>mx);}
 internal static void Validate(Settings s){
  if(s.pageCount<1||s.pageCount>40)throw new Exception("ページ数は1～40です。");
  if(s.landscapePageCount<1||s.landscapePageCount>40||s.portraitPageCount<1||s.portraitPageCount>40)throw new Exception("縦・横のページ数はそれぞれ1～40です。");
  if((s.landscapeSpeakerSize!=1&&s.landscapeSpeakerSize!=2)||(s.landscapeMicSize!=1&&s.landscapeMicSize!=2)||(s.portraitSpeakerSize!=1&&s.portraitSpeakerSize!=2)||(s.portraitMicSize!=1&&s.portraitMicSize!=2))throw new Exception("フェーダーサイズは1×1または2×2です。");
  foreach(bool portrait in new[]{false,true})if(!ControlsValid(s,Columns(s,portrait),Rows(s,portrait),portrait))throw new Exception((portrait?"縦":"横")+"配置でフェーダー同士が重なるか枠からはみ出します。先に空き枠へ移動してください。");
  if(s.landscapeColumns<2||s.landscapeColumns>8||s.portraitColumns<2||s.portraitColumns>8||s.landscapeRows<2||s.landscapeRows>8||s.portraitRows<2||s.portraitRows>8)throw new Exception("縦・横の枠数が範囲外です。");
  foreach(var a in s.apps){if(a.size!=1&&a.size!=2)throw new Exception("ボタンサイズは1×1または2×2です。");if(a.fontSize<8||a.fontSize>28||a.iconScale<20||a.iconScale>100||!a.labelOpacity.HasValue||a.labelOpacity.Value<0||a.labelOpacity.Value>100)throw new Exception("文字・アイコンの表示設定が範囲外です。");}
  foreach(bool portrait in new[]{false,true}){var occupied=new HashSet<string>();string orientation=portrait?"portrait":"landscape";foreach(var a in s.apps){if(a.orientation!=orientation)continue;var p=portrait?a.portrait:a.landscape;if(p==null)throw new Exception("ボタンの配置がありません。");Mark(occupied,p,a.size,Columns(s,portrait),Rows(s,portrait),s,portrait);}}
 }
}
