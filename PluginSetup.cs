using System;
using System.IO;
using System.Diagnostics;
using System.Windows.Forms;
using System.Drawing;

namespace NovaPluginInstaller
{
    class Program
    {
        [STAThread]
        static void Main(string[] args)
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            string targetDir = AppDomain.CurrentDomain.BaseDirectory;
            if (args.Length > 0 && Directory.Exists(args[0]))
            {
                targetDir = args[0];
            }

            // Verify if target has package.json or nova.js
            if (!File.Exists(Path.Combine(targetDir, "package.json")) && !File.Exists(Path.Combine(targetDir, "nova.js")))
            {
                using (FolderBrowserDialog fbd = new FolderBrowserDialog())
                {
                    fbd.Description = "Select Nova Island App Directory:";
                    if (fbd.ShowDialog() == DialogResult.OK)
                    {
                        targetDir = fbd.SelectedPath;
                    }
                    else
                    {
                        return;
                    }
                }
            }

            try
            {
                // Run node install-plugin.js if node exists or launch embedded powershell
                string scriptPath = Path.Combine(targetDir, "install-plugin.js");
                if (File.Exists(scriptPath))
                {
                    ProcessStartInfo psi = new ProcessStartInfo();
                    psi.FileName = "node";
                    psi.Arguments = string.Format("\"{0}\" \"{1}\"", scriptPath, targetDir);
                    psi.WorkingDirectory = targetDir;
                    psi.CreateNoWindow = true;
                    psi.UseShellExecute = false;
                    psi.RedirectStandardOutput = true;
                    psi.RedirectStandardError = true;

                    Process p = Process.Start(psi);
                    string outMsg = p.StandardOutput.ReadToEnd();
                    string errMsg = p.StandardError.ReadToEnd();
                    p.WaitForExit();

                    if (p.ExitCode == 0)
                    {
                        MessageBox.Show("Nova Share & FTP Plugin installed successfully!\n\nTarget:\n" + targetDir, "Nova Plugin Setup", MessageBoxButtons.OK, MessageBoxIcon.Information);
                    }
                    else
                    {
                        MessageBox.Show("Installation completed with notes:\n" + outMsg + "\n" + errMsg, "Nova Plugin Setup", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                    }
                }
                else
                {
                    MessageBox.Show("Could not find install-plugin.js in:\n" + targetDir, "File Not Found", MessageBoxButtons.OK, MessageBoxIcon.Error);
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show("Error running plugin setup: " + ex.Message, "Setup Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }
    }
}

