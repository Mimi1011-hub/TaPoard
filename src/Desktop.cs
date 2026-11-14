using System.Collections.Generic;

interface IDesktop
{
    object PcWindowView();
    void SavePcWindow(Dictionary<string, object> input);
    void OpenPcWindow(bool fullscreen);
    string StartImport();
}
