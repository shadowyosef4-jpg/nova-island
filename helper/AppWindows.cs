// The Apps tab: bring an app's open window to the front instead of starting it again, and tell
// which pinned apps are running (the dot under their icon). Windows are matched to an app by
// their AppUserModelID (what the taskbar groups by), Store apps through the window inside their
// ApplicationFrameHost frame, and other apps by the path of their exe. Nothing runs between
// clicks: the windows are listed only when asked.
using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;

static class AppWindows {
  delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc cb, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumChildWindows(IntPtr parent, EnumProc cb, IntPtr l);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr h, uint cmd);
  [DllImport("user32.dll")] static extern int GetWindowLong(IntPtr h, int index);
  [DllImport("user32.dll")] static extern int GetWindowTextLength(IntPtr h);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder sb, int n);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] static extern bool BringWindowToTop(IntPtr h);
  [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("user32.dll")] static extern bool AttachThreadInput(uint a, uint b, bool attach);
  [DllImport("user32.dll")] static extern void SwitchToThisWindow(IntPtr h, bool altTab);
  [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
  [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr h, int attr, out int value, int size);
  [DllImport("kernel32.dll")] static extern IntPtr OpenProcess(uint access, bool inherit, uint pid);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern bool QueryFullProcessImageName(IntPtr p, int flags, StringBuilder sb, ref int size);
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern int GetApplicationUserModelId(IntPtr p, ref int len, StringBuilder sb);
  [DllImport("shell32.dll")] static extern int SHGetPropertyStoreForWindow(IntPtr h, ref Guid iid, out IPropertyStore store);
  [DllImport("ole32.dll")] static extern int PropVariantClear(ref PROPVARIANT pv);

  [StructLayout(LayoutKind.Sequential)] struct PROPERTYKEY { public Guid fmtid; public uint pid; }
  [StructLayout(LayoutKind.Sequential)] struct PROPVARIANT { public ushort vt; public ushort r1, r2, r3; public IntPtr p; public IntPtr p2; }
  [ComImport, Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IPropertyStore {
    int GetCount(out uint n);
    int GetAt(uint i, out PROPERTYKEY key);
    int GetValue(ref PROPERTYKEY key, out PROPVARIANT pv);
  }

  const int GWL_EXSTYLE = -20;
  const int WS_EX_TOOLWINDOW = 0x80;
  const uint GW_OWNER = 4;
  const int DWMWA_CLOAKED = 14;
  const uint QUERY_LIMITED = 0x1000;

  // the window's own AppUserModelID (Chrome, VS Code, Telegram and others set one)
  static string WindowAumid(IntPtr h) {
    IPropertyStore store = null;
    try {
      Guid iid = typeof(IPropertyStore).GUID;
      if (SHGetPropertyStoreForWindow(h, ref iid, out store) != 0 || store == null) return "";
      var key = new PROPERTYKEY { fmtid = new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3"), pid = 5 };
      PROPVARIANT pv;
      if (store.GetValue(ref key, out pv) != 0) return "";
      string s = pv.vt == 31 && pv.p != IntPtr.Zero ? Marshal.PtrToStringUni(pv.p) : "";
      PropVariantClear(ref pv);
      return s ?? "";
    } catch { return ""; } finally { if (store != null) Marshal.ReleaseComObject(store); }
  }

  // a packaged app's ID from its process, and the exe path of any process
  static void ProcessInfo(uint pid, out string aumid, out string exe) {
    aumid = ""; exe = "";
    IntPtr p = OpenProcess(QUERY_LIMITED, false, pid);
    if (p == IntPtr.Zero) return;
    try {
      var sb = new StringBuilder(1024);
      int n = sb.Capacity;
      if (QueryFullProcessImageName(p, 0, sb, ref n)) exe = sb.ToString();
      var ab = new StringBuilder(256);
      int len = ab.Capacity;
      if (GetApplicationUserModelId(p, ref len, ab) == 0) aumid = ab.ToString();
    } finally { CloseHandle(p); }
  }

  static string ClassOf(IntPtr h) {
    var sb = new StringBuilder(64);
    GetClassName(h, sb, 64);
    return sb.ToString();
  }

  class Entry { public IntPtr h; public string cls, aumid, procAumid, exe; }

  // top-level windows a user would call open (as the taskbar shows them), front to back
  static List<Entry> Windows() {
    var list = new List<Entry>();
    EnumWindows((h, l) => {
      if (!IsWindowVisible(h) || GetWindow(h, GW_OWNER) != IntPtr.Zero) return true;
      if ((GetWindowLong(h, GWL_EXSTYLE) & WS_EX_TOOLWINDOW) != 0 || GetWindowTextLength(h) == 0) return true;
      int cloaked;
      if (DwmGetWindowAttribute(h, DWMWA_CLOAKED, out cloaked, 4) == 0 && cloaked != 0) return true;
      var e = new Entry { h = h, cls = ClassOf(h), aumid = WindowAumid(h) };
      uint pid;
      GetWindowThreadProcessId(h, out pid);
      // a Store app's frame belongs to ApplicationFrameHost; the app is the window inside it
      if (e.cls == "ApplicationFrameWindow") {
        EnumChildWindows(h, (c, l2) => {
          uint cp;
          GetWindowThreadProcessId(c, out cp);
          if (cp != pid && ClassOf(c) == "Windows.UI.Core.CoreWindow") { pid = cp; return false; }
          return true;
        }, IntPtr.Zero);
      }
      ProcessInfo(pid, out e.procAumid, out e.exe);
      list.Add(e);
      return true;
    }, IntPtr.Zero);
    return list;
  }

  static bool Same(string a, string b) {
    return a != "" && b != "" && string.Equals(a, b, StringComparison.OrdinalIgnoreCase);
  }

  static bool Matches(Entry e, string id, string exe) {
    if (Same(e.aumid, id) || Same(e.procAumid, id)) return true;
    // File Explorer: its folder windows only, not the desktop or the taskbar
    if (Same(id, "Microsoft.Windows.Explorer")) return e.cls == "CabinetWClass";
    // otherwise by the exe: a window without an ID of its own, or another profile of the same
    // browser ("Chrome.Profile 2"), but never a web app installed from it ("Chrome._crx_...")
    if (exe == "" || !Same(e.exe, exe)) return false;
    if (e.aumid == "") return true;
    return e.aumid.StartsWith(id + ".", StringComparison.OrdinalIgnoreCase) && e.aumid.IndexOf("_crx_", StringComparison.OrdinalIgnoreCase) < 0;
  }

  static string FullExe(string exe) {
    try { return exe == "" ? "" : Path.GetFullPath(exe); } catch { return ""; }
  }

  static void Activate(IntPtr h) {
    if (IsIconic(h)) ShowWindow(h, 9); // SW_RESTORE
    IntPtr fg = GetForegroundWindow();
    uint pid;
    uint fgThread = fg == IntPtr.Zero ? 0 : GetWindowThreadProcessId(fg, out pid);
    uint me = GetCurrentThreadId();
    // Windows lets the thread that owns the keyboard focus hand it on; share its input for a moment
    bool attached = fgThread != 0 && fgThread != me && AttachThreadInput(me, fgThread, true);
    try {
      BringWindowToTop(h);
      SetForegroundWindow(h);
    } finally { if (attached) AttachThreadInput(me, fgThread, false); }
    if (GetForegroundWindow() != h) SwitchToThisWindow(h, true);
  }

  // "focused" when one of the app's windows came to the front, "none" when it has none open.
  // Clicking an app whose window is already in front moves on to its next window.
  public static string Focus(string id, string exe) {
    exe = FullExe(exe);
    var mine = new List<IntPtr>();
    foreach (var e in Windows()) if (Matches(e, id, exe)) mine.Add(e.h);
    if (mine.Count == 0) return "none";
    IntPtr target = mine[0];
    if (target == GetForegroundWindow()) {
      if (mine.Count == 1) return "focused";
      target = mine[mine.Count - 1]; // the one used longest ago, like the taskbar's cycle
    }
    Activate(target);
    return "focused";
  }

  // of the given apps (id \t exe pairs), the ones with a window open
  public static List<string> Running(List<string[]> apps) {
    var wins = Windows();
    var on = new List<string>();
    foreach (var a in apps) {
      string exe = FullExe(a[1]);
      foreach (var e in wins) if (Matches(e, a[0], exe)) { on.Add(a[0]); break; }
    }
    return on;
  }
}
