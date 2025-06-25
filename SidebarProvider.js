const vscode = require("vscode");
const util = require("util");
const exec = util.promisify(require("child_process").exec);
const fs = require("fs");
const path = require("path");

async function runDockerCommand(command) {
  try {
    const { stdout, stderr } = await exec(command);
    // Always return both stdout and stderr
    return [stdout, stderr].filter(Boolean).join('\n');
  } catch (err) {
    console.error("Exec error:", err);
    return err.message;
  }
}

class SidebarProvider {
  constructor(extensionUri) {
    this._extensionUri = extensionUri;
    this._view = undefined;
    this._doc = undefined;
  }

  resolveWebviewView(webviewView) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (data) => {
      console.log('Extension received message:', data); // <-- Add this
      switch (data.type) {
        case "onInfo": {
          if (!data.value) return;
          vscode.window.showInformationMessage(data.value);
          break;
        }

        case "onError": {
          if (!data.value) return;
          vscode.window.showErrorMessage(data.value);
          break;
        }

        case "accessCode": {
          // Only accept "123" as the access code
          if (data.value === "123") {
            webviewView.webview.postMessage({ type: "showInstructions" });
          } else {
            vscode.window.showErrorMessage("Invalid access code.");
          }
          break;
        }

        case "submitCode": {
          const editor = vscode.window.activeTextEditor;
          if (!editor) {
            vscode.window.showErrorMessage("No active editor found.");
            return;
          }
          const code = editor.document.getText();

          const fs = require("fs");
          const os = require("os");
          const path = require("path");
          const tmpFilePath = path.join(os.tmpdir(), "student_code.py");
          fs.writeFileSync(tmpFilePath, code);

          // Convert Windows path to Docker-friendly format
          let dockerPath = tmpFilePath;
          if (process.platform === "win32") {
            dockerPath = tmpFilePath.replace(/\\/g, "/");
            if (dockerPath[1] === ":") {
              dockerPath = `/${dockerPath[0].toLowerCase()}${dockerPath.slice(2)}`;
            }
          }

          const result = await runDockerCommand(
            `docker run --rm -v "${dockerPath}:/code/student_code.py" my-grader`
          );

          // Send the result to the webview
          webviewView.webview.postMessage({
            type: "showResult",
            value: result,
          });
          break;
        }

        case "testCode": {
          const editor = vscode.window.activeTextEditor;
          if (!editor) {
            vscode.window.showErrorMessage("No active editor found.");
            return;
          }
          const code = editor.document.getText();

          const fs = require("fs");
          const os = require("os");
          const path = require("path");
          const tmpFilePath = path.join(os.tmpdir(), "student_code.py");
          fs.writeFileSync(tmpFilePath, code);

          // Convert Windows path to Docker-friendly format
          let dockerPath = tmpFilePath;
          if (process.platform === "win32") {
            dockerPath = tmpFilePath.replace(/\\/g, "/");
            if (dockerPath[1] === ":") {
              dockerPath = `/${dockerPath[0].toLowerCase()}${dockerPath.slice(2)}`;
            }
          }

          const result = await runDockerCommand(
            `docker run --rm -v "${dockerPath}:/code/student_code.py" my-grader`
          );

          webviewView.webview.postMessage({
            type: "showResult",
            value: result || "No output returned from Docker.",
          });
          break;
        }
      }
    });
  }

  revive(panel) {
    this._view = panel;
  }

  _getHtmlForWebview(webview) {
    const styleSidebarUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "SideBar.css")
    );

    // Read add.html from the instructions folder
    let instructionsHtml = "";
    try {
      const instructionsPath = path.join(__dirname, "instructions", "add.html");
      instructionsHtml = fs.readFileSync(instructionsPath, "utf8");
    } catch (e) {
      instructionsHtml =
        "<p style='color:red;'>Could not load instructions.</p>";
    }

    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="${styleSidebarUri}" rel="stylesheet">
</head>
<body>
  <div id="code-entry">
    <input type="text" id="accessCode" placeholder="Enter access code" />
    <button id="codeSubmitBtn">Enter</button>
  </div>
  <div id="instructions" class="instructions" style="display:none;">
    ${instructionsHtml}
    <div style="display: flex; gap: 12px; margin-top: 16px;">
      <button class="button" id="testBtn">Test</button>
      <button class="button" id="submitBtn">Submit</button>
    </div>
  </div>
  <script>
    const vscode = acquireVsCodeApi();

    document.getElementById('codeSubmitBtn').addEventListener('click', () => {
      const code = document.getElementById('accessCode').value;
      vscode.postMessage({ type: 'accessCode', value: code });
    });

    window.addEventListener('message', event => {
      const message = event.data;
      console.log('Webview received message:', message); // <-- Add this

      if (message.type === 'showInstructions') {
        document.getElementById('code-entry').style.display = 'none';
        document.getElementById('instructions').style.display = 'block';
        // Hide result if present
        let resultDiv = document.getElementById('result');
        if (resultDiv) resultDiv.style.display = 'none';

        // Attach listeners now that buttons are visible
        document.getElementById('testBtn').onclick = () => {
          console.log('Test button clicked'); // <-- Add this
          vscode.postMessage({ type: 'testCode' });
        };
        document.getElementById('submitBtn').onclick = () => {
          console.log('Submit button clicked'); // <-- Add this
          vscode.postMessage({ type: 'submitCode' });
        };
      }
      if (message.type === 'showResult') {
        document.getElementById('instructions').style.display = 'none';
        // Create or update a result div
        let resultDiv = document.getElementById('result');
        if (!resultDiv) {
          resultDiv = document.createElement('div');
          resultDiv.id = 'result';
          resultDiv.className = 'instructions';
          document.body.appendChild(resultDiv);
        }
        // Set result text and Back button together
        resultDiv.innerHTML = \`
          <div>\${message.value}</div>
          <button class="button" id="backBtn">Back</button>
        \`;
        document.getElementById('backBtn').onclick = () => {
          resultDiv.style.display = 'none';
          document.getElementById('instructions').style.display = 'block';
        };
        resultDiv.style.display = 'block';
      }
    });
  </script>
</body>
</html>
`;
  }
}

module.exports = {
  SidebarProvider,
};
