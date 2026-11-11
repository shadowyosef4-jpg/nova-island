// Nova Island system bridge, compiled (replaces media.ps1, same protocol).
// Prints one JSON line about every 500 ms: media session (SMTC, or VLC: Vlc.cs), volume, brightness, fullscreen,
// window in front, keyboard layout, Caps Lock.
// Reads commands on stdin: toggle | next | prev | seek <sec> | vol <0-1> | mute | bright <0-100>
//   | pauseapp <appId> | playapp <appId> | seekapp <appId> <sec>
//   | focusapp	<id>	<exe>            -> {"focusapp":id,"result":"focused"|"none"}
//   | runningapps	<id>	<exe>	...    -> {"running":[ids]}
// Build: helper/build.cmd (uses the C# compiler that ships with Windows).
using System;
using System.Collections.Concurrent;
using System.Globalization;
using System.IO;
using System.Management;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using Windows.Media.Control;
using Windows.Storage.Streams;

[ComImport, Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioEndpointVolume {
  int f(); int g(); int h(); int i();
  int SetMasterVolumeLevelScalar(float fLevel, Guid pguidEventContext);
  int j();
  int GetMasterVolumeLevelScalar(out float pfLevel);
  int k(); int l(); int m(); int n();
  int SetMute([MarshalAs(UnmanagedType.Bool)] bool bMute, Guid pguidEventContext);
  int GetMute(out bool pbMute);
}
[ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDevice {
  int Activate(ref Guid id, int clsCtx, int activationParams, [MarshalAs(UnmanagedType.IUnknown)] out object aev);
}
[ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator {
  int f();
  int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice endpoint);
}
[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
class MMDeviceEnumeratorComObject { }

static class Audio {
  static IAudioEndpointVolume Vol() {
    var en = (IMMDeviceEnumerator)(new MMDeviceEnumeratorComObject());
    IMMDevice dev;
    Marshal.ThrowExceptionForHR(en.GetDefaultAudioEndpoint(0, 1, out dev));
    Guid iid = typeof(IAudioEndpointVolume).GUID;
    object o;
    Marshal.ThrowExceptionForHR(dev.Activate(ref iid, 23, 0, out o));
    return (IAudioEndpointVolume)o;
  }
  public static float GetVolume() { float v; Marshal.ThrowExceptionForHR(Vol().GetMasterVolumeLevelScalar(out v)); return v; }
  public static void SetVolume(float v) { Marshal.ThrowExceptionForHR(Vol().SetMasterVolumeLevelScalar(v, Guid.Empty)); }
  public static bool GetMute() { bool m; Marshal.ThrowExceptionForHR(Vol().GetMute(out m)); return m; }
  public static void SetMute(bool m) { Marshal.ThrowExceptionForHR(Vol().SetMute(m, Guid.Empty)); }
}

static class Win {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  [StructLayout(LayoutKind.Sequential)] public struct MONITORINFO { public int cbSize; public RECT rcMonitor; public RECT rcWork; public int dwFlags; }
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] static extern IntPtr MonitorFromWindow(IntPtr h, int flags);
  [DllImport("user32.dll")] static extern bool GetMonitorInfo(IntPtr m, ref MONITORINFO mi);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder sb, int n);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder sb, int n);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] static extern IntPtr GetKeyboardLayout(uint thread);
  [DllImport("user32.dll")] static extern short GetKeyState(int vk);
  [DllImport("user32.dll")] static extern uint GetClipboardSequenceNumber();
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern uint RegisterClipboardFormat(string name);
  [DllImport("user32.dll")] static extern bool IsClipboardFormatAvailable(uint format);
  [DllImport("user32.dll")] static extern bool OpenClipboard(IntPtr owner);
  [DllImport("user32.dll")] static extern bool CloseClipboard();
  [DllImport("user32.dll")] static extern IntPtr GetClipboardData(uint format);
  [DllImport("kernel32.dll")] static extern IntPtr GlobalLock(IntPtr h);
  [DllImport("kernel32.dll")] static extern bool GlobalUnlock(IntPtr h);

  // Password managers mark what they copy so history tools skip it: either format present
  // ("Exclude...") or CanIncludeInClipboardHistory set to 0. Checked once per clipboard change.
  static long privSeq = -1;
  static bool privValue;
  public static bool ClipboardPrivate(long seq) {
    if (seq == privSeq) return privValue;
    privSeq = seq;
    privValue = false;
    if (IsClipboardFormatAvailable(RegisterClipboardFormat("ExcludeClipboardContentFromMonitorProcessing"))) return privValue = true;
    uint can = RegisterClipboardFormat("CanIncludeInClipboardHistory");
    if (!IsClipboardFormatAvailable(can)) return privValue;
    if (!OpenClipboard(IntPtr.Zero)) return privValue = true; // can't look: treat as private
    try {
      IntPtr h = GetClipboardData(can);
      if (h == IntPtr.Zero) return privValue = true;
      IntPtr p = GlobalLock(h);
      try { return privValue = p == IntPtr.Zero || Marshal.ReadInt32(p) == 0; } finally { GlobalUnlock(h); }
    } finally { CloseClipboard(); }
  }
  [StructLayout(LayoutKind.Sequential)] struct SYSTEM_POWER_STATUS {
    public byte ACLineStatus, BatteryFlag, BatteryLifePercent, SystemStatusFlag;
    public int BatteryLifeTime, BatteryFullLifeTime;
  }
  [DllImport("kernel32.dll")] static extern bool GetSystemPowerStatus(out SYSTEM_POWER_STATUS s);

  // battery percent (-1: no battery, e.g. a desktop PC) and whether the charger is plugged in
  public static void Battery(out int pct, out bool ac) {
    SYSTEM_POWER_STATUS s;
    pct = -1; ac = true;
    if (!GetSystemPowerStatus(out s)) return;
    ac = s.ACLineStatus != 0;
    if ((s.BatteryFlag & 128) == 0 && s.BatteryLifePercent <= 100) pct = s.BatteryLifePercent;
  }

  [StructLayout(LayoutKind.Sequential)] struct LASTINPUTINFO { public uint cbSize; public uint dwTime; }
  [DllImport("user32.dll")] static extern bool GetLastInputInfo(ref LASTINPUTINFO lii);

  // seconds since the last keyboard / mouse input anywhere
  public static int IdleSeconds() {
    var lii = new LASTINPUTINFO();
    lii.cbSize = (uint)Marshal.SizeOf(lii);
    if (!GetLastInputInfo(ref lii)) return 0;
    return (int)(((uint)Environment.TickCount - lii.dwTime) / 1000);
  }

  public static long ClipboardSeq() { return GetClipboardSequenceNumber(); }

  public static int KeyboardLayout() {
    IntPtr h = GetForegroundWindow();
    uint pid;
    uint thread = h == IntPtr.Zero ? 0 : GetWindowThreadProcessId(h, out pid);
    return (int)((long)GetKeyboardLayout(thread) & 0xFFFF);
  }

  public static bool CapsLock() { return (GetKeyState(0x14) & 1) != 0; }

  public static IntPtr ForegroundHandle() { return GetForegroundWindow(); }

  // a screen recorder running: NVIDIA's capture helper (Instant Replay / recording), OBS,
  // Streamlabs. While one runs, the island doesn't ask Windows to hide it from captures (that
  // request makes NVIDIA turn Instant Replay off, as if protected video were on screen).
  static readonly string[] Recorders = { "nvsphelper64", "nvsphelper", "obs64", "obs32", "obs", "Streamlabs OBS", "Streamlabs Desktop" };
  public static bool RecorderRunning() {
    foreach (var name in Recorders) {
      var ps = System.Diagnostics.Process.GetProcessesByName(name);
      bool any = ps.Length > 0;
      foreach (var p in ps) p.Dispose();
      if (any) return true;
    }
    return false;
  }

  // the browser window in front (any browser), for "Stay in place": the island goes see-through
  // over it. JSON in physical pixels, or "null".
  static readonly string[] Browsers = { "chrome", "msedge", "brave", "opera", "vivaldi", "firefox" };
  public static string BrowserJson(string proc, bool fullscreen) {
    IntPtr h = GetForegroundWindow();
    RECT r;
    if (fullscreen || h == IntPtr.Zero || Array.IndexOf(Browsers, (proc ?? "").ToLowerInvariant()) < 0 || !GetWindowRect(h, out r)) return "null";
    return "{\"x\":" + r.L + ",\"y\":" + r.T + ",\"w\":" + (r.R - r.L) + ",\"h\":" + (r.B - r.T) + "}";
  }
  public static string ClassOf(IntPtr h) {
    var sb = new StringBuilder(64);
    GetClassName(h, sb, 64);
    return sb.ToString();
  }
  // physical pixels everywhere (UI Automation rectangles, window rects); main converts to DIPs
  [DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr ctx);
  public static void PerMonitorDpi() { try { SetProcessDpiAwarenessContext(new IntPtr(-4)); } catch { } }

  public static void Foreground(out string proc, out string title) {
    proc = ""; title = "";
    IntPtr h = GetForegroundWindow();
    if (h == IntPtr.Zero) return;
    uint pid;
    GetWindowThreadProcessId(h, out pid);
    try { proc = System.Diagnostics.Process.GetProcessById((int)pid).ProcessName; } catch { }
    var sb = new StringBuilder(512);
    GetWindowText(h, sb, 512);
    title = sb.ToString();
  }

  public static bool IsFullscreen() {
    IntPtr h = GetForegroundWindow();
    if (h == IntPtr.Zero) return false;
    var sb = new StringBuilder(64);
    GetClassName(h, sb, 64);
    string cls = sb.ToString();
    if (cls == "Progman" || cls == "WorkerW" || cls == "Shell_TrayWnd") return false;
    RECT r;
    if (!GetWindowRect(h, out r)) return false;
    var mi = new MONITORINFO();
    mi.cbSize = Marshal.SizeOf(mi);
    if (!GetMonitorInfo(MonitorFromWindow(h, 2), ref mi)) return false;
    var m = mi.rcMonitor;
    return r.L == m.L && r.T == m.T && r.R == m.R && r.B == m.B;
  }
}

static class Brightness {
  // laptop panels only (WMI); -1 when the screen has no software brightness
  public static int Get() {
    try {
      using (var s = new ManagementObjectSearcher("root\\WMI", "SELECT CurrentBrightness FROM WmiMonitorBrightness"))
        foreach (ManagementObject o in s.Get()) return Convert.ToInt32(o["CurrentBrightness"]);
    } catch { }
    return -1;
  }
  public static void Set(int v) {
    try {
      using (var s = new ManagementObjectSearcher("root\\WMI", "SELECT * FROM WmiMonitorBrightnessMethods"))
        foreach (ManagementObject o in s.Get()) { o.InvokeMethod("WmiSetBrightness", new object[] { (uint)1, (byte)v }); return; }
    } catch { }
  }
}

// Minimal JSON writer for one flat object per line.
class Json {
  readonly StringBuilder sb = new StringBuilder("{");
  bool first = true;
  void Key(string k) { if (!first) sb.Append(','); first = false; Str(k); sb.Append(':'); }
  void Str(string s) {
    sb.Append('"');
    foreach (char c in s ?? "") {
      switch (c) {
        case '"': sb.Append("\\\""); break;
        case '\\': sb.Append("\\\\"); break;
        case '\n': sb.Append("\\n"); break;
        case '\r': sb.Append("\\r"); break;
        case '\t': sb.Append("\\t"); break;
        default:
          if (c < 0x20) sb.Append("\\u").Append(((int)c).ToString("x4")); else sb.Append(c);
          break;
      }
    }
    sb.Append('"');
  }
  public Json Add(string k, string v) { Key(k); Str(v); return this; }
  public Json Add(string k, bool v) { Key(k); sb.Append(v ? "true" : "false"); return this; }
  public Json Add(string k, int v) { Key(k); sb.Append(v.ToString(CultureInfo.InvariantCulture)); return this; }
  public Json Raw(string k, string json) { Key(k); sb.Append(json); return this; }
  public Json Add(string k, double v) { Key(k); sb.Append(Math.Round(v, 3).ToString(CultureInfo.InvariantCulture)); return this; }
  public override string ToString() { return sb.ToString() + "}"; }
}

static class Program {
  static GlobalSystemMediaTransportControlsSessionManager mgr;
  static readonly BlockingCollection<string> commands = new BlockingCollection<string>();
  static TextWriter outw;

  // Waits on a WinRT operation through its own Status/GetResults: the AsTask bridge would need
  // the Windows SDK's union Windows.winmd, which the compiler that ships with Windows lacks.
  static T Await<T>(Windows.Foundation.IAsyncOperation<T> op, int ms = 3000) {
    if (op == null) return default(T);
    try {
      var until = DateTime.UtcNow.AddMilliseconds(ms);
      while (op.Status == Windows.Foundation.AsyncStatus.Started) {
        if (DateTime.UtcNow > until) { op.Cancel(); return default(T); }
        Thread.Sleep(4);
      }
      return op.Status == Windows.Foundation.AsyncStatus.Completed ? op.GetResults() : default(T);
    } catch { return default(T); }
  }

  static GlobalSystemMediaTransportControlsSession Find(string appId) {
    if (mgr == null) return null;
    foreach (var s in mgr.GetSessions()) if (s.SourceAppUserModelId == appId) return s;
    return null;
  }

  static string Thumb(GlobalSystemMediaTransportControlsSessionMediaProperties props) {
    if (props == null || props.Thumbnail == null) return "";
    try {
      using (var s = Await(props.Thumbnail.OpenReadAsync())) {
        if (s == null || s.Size == 0) return "";
        var reader = new DataReader(s.GetInputStreamAt(0));
        uint n = Await(reader.LoadAsync((uint)s.Size));
        if (n == 0) return "";
        var bytes = new byte[n];
        reader.ReadBytes(bytes);
        reader.Dispose();
        return Convert.ToBase64String(bytes);
      }
    } catch { return ""; }
  }

  static readonly Regex AppCmd = new Regex(@"^(pauseapp|playapp) (\S+)$");
  static readonly Regex SeekApp = new Regex(@"^seekapp (\S+) (\d+(\.\d+)?)$");
  static readonly Regex Vol = new Regex(@"^vol (\d+(\.\d+)?)$");
  static readonly Regex Bright = new Regex(@"^bright (\d+)$");
  static readonly Regex Seek = new Regex(@"^seek (\d+(\.\d+)?)$");
  static double Num(string s) { return double.Parse(s, CultureInfo.InvariantCulture); }

  static int bright = -1;
  static bool vlcShown; // the island is showing VLC, so play/pause/next/prev go to it

  static void Handle(string cmd) {
    Match m;
    if (cmd.StartsWith("focusapp	") || cmd.StartsWith("runningapps	")) { AppCommand(cmd); return; }
    if ((m = AppCmd.Match(cmd)).Success) {
      var t = Find(m.Groups[2].Value);
      if (t != null) Await(m.Groups[1].Value == "pauseapp" ? t.TryPauseAsync() : t.TryPlayAsync());
      return;
    }
    if ((m = SeekApp.Match(cmd)).Success) {
      var t = Find(m.Groups[1].Value);
      if (t != null) Await(t.TryChangePlaybackPositionAsync((long)(Num(m.Groups[2].Value) * 10000000)));
      return;
    }
    if ((m = Vol.Match(cmd)).Success) {
      float v = (float)Math.Min(1, Math.Max(0, Num(m.Groups[1].Value)));
      try { Audio.SetVolume(v); if (v > 0) Audio.SetMute(false); } catch { }
      return;
    }
    if (cmd == "mute") { try { Audio.SetMute(!Audio.GetMute()); } catch { } return; }
    if ((m = Bright.Match(cmd)).Success) {
      bright = Math.Min(100, int.Parse(m.Groups[1].Value));
      Brightness.Set(bright);
      return;
    }
    if (vlcShown && (cmd == "toggle" || cmd == "next" || cmd == "prev")) { Vlc.Command(cmd); return; }
    var s = mgr == null ? null : mgr.GetCurrentSession();
    if (s == null) return;
    if ((m = Seek.Match(cmd)).Success) { Await(s.TryChangePlaybackPositionAsync((long)(Num(m.Groups[1].Value) * 10000000))); return; }
    if (cmd == "toggle") Await(s.TryTogglePlayPauseAsync());
    else if (cmd == "next") Await(s.TrySkipNextAsync());
    else if (cmd == "prev") Await(s.TrySkipPreviousAsync());
  }

  static string JsonStr(string s) {
    return new Json().Add("s", s).ToString().Substring(5).TrimEnd('}');
  }

  // Apps tab: focus an app's open window, or list which pinned apps are running
  static void AppCommand(string cmd) {
    var parts = cmd.Split('	');
    if (parts[0] == "focusapp") {
      string id = parts.Length > 1 ? parts[1] : "", exe = parts.Length > 2 ? parts[2] : "";
      string result = "none";
      try { if (id != "") result = AppWindows.Focus(id, exe); } catch { }
      outw.WriteLine(new Json().Add("focusapp", id).Add("result", result).ToString());
      return;
    }
    var apps = new System.Collections.Generic.List<string[]>();
    for (int i = 1; i < parts.Length; i += 2) apps.Add(new[] { parts[i], i + 1 < parts.Length ? parts[i + 1] : "" });
    var on = new System.Collections.Generic.List<string>();
    try { on = AppWindows.Running(apps); } catch { }
    var items = new System.Collections.Generic.List<string>();
    foreach (var id in on) items.Add(JsonStr(id));
    outw.WriteLine("{\"running\":[" + string.Join(",", items) + "]}");
  }

  // one-shot commands (shell and UI Automation want a single-threaded apartment)
  static int RunSta(Action<TextWriter> job) {
    var w = new StreamWriter(Console.OpenStandardOutput(), new UTF8Encoding(false)) { AutoFlush = true };
    int code = 0;
    var t = new Thread(() => {
      try { job(w); } catch (Exception e) { Console.Error.WriteLine(e.Message); code = 1; }
    });
    t.SetApartmentState(ApartmentState.STA);
    t.Start();
    t.Join();
    return code;
  }

  //   nova-helper                    -> the media/system bridge (JSON lines, commands on stdin)
  //   nova-helper apps               -> Start menu apps as JSON
  //   nova-helper yturl <proc> <title> -> URL of the browser tab playing that video
  [MTAThread]
  static int Main(string[] args) {
    Win.PerMonitorDpi();
    if (args.Length >= 1 && args[0] == "apps") return RunSta(w => Apps.Print(w));
    if (args.Length >= 2 && args[0] == "yturl") return RunSta(w => YtUrl.Print(w, args[1], args.Length > 2 ? args[2] : ""));
    outw = new StreamWriter(Console.OpenStandardOutput(), new UTF8Encoding(false)) { AutoFlush = true };
    mgr = Await(GlobalSystemMediaTransportControlsSessionManager.RequestAsync(), 8000);
    if (mgr == null) outw.WriteLine("{\"error\":\"smtc-unavailable\"}");

    // stdin on its own thread; when the island closes the pipe, exit
    var reader = new Thread(() => {
      var stdin = new StreamReader(Console.OpenStandardInput(), new UTF8Encoding(false));
      string line;
      while ((line = stdin.ReadLine()) != null) commands.Add(line.Trim());
      Environment.Exit(0);
    }) { IsBackground = true };
    reader.Start();

    string lastKey = null, prevThumb = "";
    bool thumbOk = false;
    int thumbTries = 0, loop = 0;
    bright = Brightness.Get();
    bool brightOk = bright >= 0;
    bool rec = false;
    var next = DateTime.UtcNow;

    while (true) {
      // run commands as they come; report right after one so the island sees the effect
      string cmd;
      bool acted = false;
      while (commands.TryTake(out cmd, acted || DateTime.UtcNow >= next ? 0 : Math.Max(0, (int)(next - DateTime.UtcNow).TotalMilliseconds))) {
        try { Handle(cmd); } catch { }
        acted = true;
      }
      if (!acted && DateTime.UtcNow < next) continue;
      next = DateTime.UtcNow.AddMilliseconds(500);
      loop++;

      var o = new Json();
      var s = mgr == null ? null : mgr.GetCurrentSession();
      // VLC (no media session): shown while it plays and the session isn't playing,
      // or paused with no session at all
      bool vlcPlaying = false;
      vlcShown = false;
      try {
        if (Vlc.Find()) {
          vlcPlaying = Vlc.Playing();
          var si = s == null ? null : s.GetPlaybackInfo();
          bool sessionPlaying = si != null && si.PlaybackStatus == GlobalSystemMediaTransportControlsSessionPlaybackStatus.Playing;
          vlcShown = vlcPlaying ? !sessionPlaying : s == null;
        }
      } catch { }
      if (vlcShown) {
        o.Add("has", true).Add("title", Vlc.Title).Add("artist", "").Add("album", "")
         .Add("app", "vlc.exe").Add("playing", vlcPlaying).Add("pos", 0).Add("dur", 0);
        string key = Vlc.Title + "||vlc.exe";
        if (key != lastKey) { lastKey = key; o.Add("thumb", ""); }
        thumbOk = true;
      } else if (s != null) {
        var props = Await(s.TryGetMediaPropertiesAsync());
        var info = s.GetPlaybackInfo();
        var tl = s.GetTimelineProperties();
        bool playing = info != null && info.PlaybackStatus == GlobalSystemMediaTransportControlsSessionPlaybackStatus.Playing;
        double pos = tl.Position.TotalSeconds;
        double dur = (tl.EndTime - tl.StartTime).TotalSeconds;
        if (playing && dur > 0) {
          pos += (DateTimeOffset.Now - tl.LastUpdatedTime).TotalSeconds;
          if (pos > dur) pos = dur;
        }
        string title = props == null ? "" : props.Title, artist = props == null ? "" : props.Artist;
        string app = s.SourceAppUserModelId ?? "";
        o.Add("has", true).Add("title", title).Add("artist", artist).Add("album", props == null ? "" : props.AlbumTitle)
         .Add("app", app).Add("playing", playing).Add("pos", Math.Round(pos, 2)).Add("dur", Math.Round(dur, 2));

        // browsers publish the thumbnail after the title, so keep retrying for ~10 s
        string key = title + "|" + artist + "|" + app;
        if (key != lastKey) { lastKey = key; thumbOk = false; thumbTries = 0; o.Add("thumb", ""); }
        if (!thumbOk && thumbTries < 20) {
          thumbTries++;
          string t = Thumb(props);
          // identical to the previous track's thumbnail is usually stale: wait a little longer
          if (t != "" && (t != prevThumb || thumbTries >= 8)) { o.Add("thumb", t); prevThumb = t; thumbOk = true; }
        }
      } else {
        o.Add("has", false);
        lastKey = null;
      }

      try { o.Add("vol", Math.Round(Audio.GetVolume(), 3)).Add("muted", Audio.GetMute()); } catch { }
      if (brightOk && loop % 4 == 0) bright = Brightness.Get();
      o.Add("bright", brightOk ? bright : -1);
      try { o.Add("fs", Win.IsFullscreen()); } catch { o.Add("fs", false); }
      try { o.Add("kl", Win.KeyboardLayout()).Add("caps", Win.CapsLock()); } catch { }
      try { long seq = Win.ClipboardSeq(); o.Add("clip", (double)seq).Add("clipPriv", Win.ClipboardPrivate(seq)); } catch { }
      try { o.Add("idle", Win.IdleSeconds()); } catch { }
      try { int pct; bool ac; Win.Battery(out pct, out ac); o.Add("bat", pct).Add("ac", ac); } catch { }
      if (loop % 4 == 1) { try { rec = Win.RecorderRunning(); } catch { } }
      o.Add("rec", rec);
      string fgProc = "";
      try { string t; Win.Foreground(out fgProc, out t); o.Add("fgProc", fgProc).Add("fgTitle", t); } catch { }
      try { o.Raw("omni", AddressBar.Json(Win.ForegroundHandle(), fgProc, Win.IsFullscreen())); } catch { o.Raw("omni", "null"); }
      try { o.Raw("browser", Win.BrowserJson(fgProc, Win.IsFullscreen())); } catch { o.Raw("browser", "null"); }

      try { outw.WriteLine(o.ToString()); } catch (IOException) { return 0; }
    }
  }
}
