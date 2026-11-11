// The address bar ("omnibox") of a Chromium browser in front: where it is on screen, whether the
// user is typing in it, and how long its text is. The island sits in its right third.
// The UI Automation search for it is slow-ish, so it is done once per browser window (retried
// every 2 s if not found); after that only the element's properties are read each tick.
using System;
using System.Windows.Automation;

static class AddressBar {
  static readonly string[] Browsers = { "chrome", "msedge", "brave", "opera", "vivaldi" };
  static IntPtr hwnd = IntPtr.Zero;
  static AutomationElement edit;
  static DateTime nextSearch = DateTime.MinValue;

  // JSON object for the bridge line, or "null" when no browser address bar is in front
  public static string Json(IntPtr fg, string proc, bool fullscreen) {
    if (fullscreen || fg == IntPtr.Zero || Array.IndexOf(Browsers, (proc ?? "").ToLowerInvariant()) < 0 || Win.ClassOf(fg) != "Chrome_WidgetWin_1") {
      hwnd = IntPtr.Zero;
      edit = null;
      return "null";
    }
    if (fg != hwnd) {
      hwnd = fg;
      edit = null;
      nextSearch = DateTime.MinValue;
    }
    if (edit == null) {
      if (DateTime.UtcNow < nextSearch) return "null";
      nextSearch = DateTime.UtcNow.AddSeconds(2);
      try {
        edit = AutomationElement.FromHandle(fg).FindFirst(TreeScope.Descendants,
          new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.Edit));
      } catch { edit = null; }
      if (edit == null) return "null";
    }
    try {
      var r = edit.Current.BoundingRectangle;
      if (r.IsEmpty || r.Width < 200 || r.Height < 16) return "null";
      bool focus = edit.Current.HasKeyboardFocus;
      int len = 0;
      try { len = (((ValuePattern)edit.GetCurrentPattern(ValuePattern.Pattern)).Current.Value ?? "").Length; } catch { }
      return "{\"x\":" + (int)r.X + ",\"y\":" + (int)r.Y + ",\"w\":" + (int)r.Width + ",\"h\":" + (int)r.Height
        + ",\"focus\":" + (focus ? "true" : "false") + ",\"len\":" + len + "}";
    } catch {
      edit = null; // the window changed under us (navigated, closed): search again
      return "null";
    }
  }
}
