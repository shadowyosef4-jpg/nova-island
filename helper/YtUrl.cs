// `nova-helper yturl <process> <title>`: the URL of the browser tab playing a video (was yturl.ps1).
// Prints {"url":"...","how":"..."}.
//   1) reads the address bar of each browser window (windows whose title matches first)
//   2) if the playing tab isn't the active one, briefly selects it, reads the URL, then switches
//      back to the tab that was active
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;
using System.Threading;
using System.Windows.Automation;

static class YtUrl {
  static readonly Regex Video = new Regex(@"(youtube\.com/(watch|shorts/|live/|embed/)|youtu\.be/)", RegexOptions.IgnoreCase);
  static string Norm(string s) { return Regex.Replace(s ?? "", @"\s+", " ").Trim().ToLowerInvariant(); }

  static string UrlOf(AutomationElement w) {
    try {
      var edit = w.FindFirst(TreeScope.Descendants, new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.Edit));
      if (edit == null) return "";
      return ((ValuePattern)edit.GetCurrentPattern(ValuePattern.Pattern)).Current.Value ?? "";
    } catch { return ""; }
  }

  static bool IsSelected(AutomationElement tab) {
    try { return ((SelectionItemPattern)tab.GetCurrentPattern(SelectionItemPattern.Pattern)).Current.IsSelected; } catch { return false; }
  }

  static string Json(string url, string how) {
    return "{\"url\":\"" + (url ?? "").Replace("\\", "\\\\").Replace("\"", "\\\"") + "\",\"how\":\"" + how + "\"}";
  }

  public static void Print(TextWriter outw, string proc, string title) {
    outw.WriteLine(Find(proc, title));
  }

  static string Find(string proc, string title) {
    string want = Norm(title);
    var pids = new HashSet<int>(Process.GetProcessesByName(proc).Select(p => p.Id));
    if (pids.Count == 0) return Json("", "no-browser");

    var all = AutomationElement.RootElement.FindAll(TreeScope.Children,
      new PropertyCondition(AutomationElement.ClassNameProperty, "Chrome_WidgetWin_1"));
    var windows = all.Cast<AutomationElement>()
      .Where(w => { try { return pids.Contains(w.Current.ProcessId) && !string.IsNullOrEmpty(w.Current.Name); } catch { return false; } })
      // windows whose title contains the video title first
      .OrderBy(w => want != "" && Norm(w.Current.Name).Contains(want) ? 0 : 1)
      .ToList();

    foreach (var w in windows) {
      string u = UrlOf(w);
      if (Video.IsMatch(u) && (want == "" || Norm(w.Current.Name).Contains(want) || windows.Count == 1)) return Json(u, "address-bar");
    }

    // not the active tab: select it, read, restore
    if (want != "") {
      foreach (var w in windows) {
        var tabs = w.FindAll(TreeScope.Descendants, new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.TabItem))
          .Cast<AutomationElement>().ToList();
        var target = tabs.FirstOrDefault(t => Norm(t.Current.Name).Contains(want));
        if (target == null) continue;
        var prev = tabs.FirstOrDefault(IsSelected);
        try { ((SelectionItemPattern)target.GetCurrentPattern(SelectionItemPattern.Pattern)).Select(); } catch { continue; }
        Thread.Sleep(250);
        string u = UrlOf(w);
        if (prev != null && !Automation.Compare(prev, target)) {
          try { ((SelectionItemPattern)prev.GetCurrentPattern(SelectionItemPattern.Pattern)).Select(); } catch { }
        }
        if (Video.IsMatch(u)) return Json(u, "tab");
      }
    }

    // last resort: any window showing a video
    foreach (var w in windows) {
      string u = UrlOf(w);
      if (Video.IsMatch(u)) return Json(u, "any");
    }
    return Json("", "not-found");
  }
}
