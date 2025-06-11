const vscode = require("vscode");
const util = require("util");
const exec = util.promisify(require("child_process").exec);
const fs = require("fs");
const path = require("path");

async function runDockerCommand(command) {
  try {
    const { stdout, stderr } = await exec(command);
    if (stderr) {
      console.error("Docker error:", stderr);
      return stderr;
    }
    return stdout;
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

          const result = await runDockerCommand(
            `docker run --rm -v "${tmpFilePath}:/code/student_code.py" my-grader`
          );

          // Send the result to the webview
          webviewView.webview.postMessage({
            type: "showResult",
            value: result,
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
    <button class="button" id="submitBtn">Submit</button>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    document.getElementById('codeSubmitBtn').addEventListener('click', () => {
      const code = document.getElementById('accessCode').value;
      vscode.postMessage({ type: 'accessCode', value: code });
    });

    window.addEventListener('message', event => {
      const message = event.data;
      if (message.type === 'showInstructions') {
        document.getElementById('code-entry').style.display = 'none';
        document.getElementById('instructions').style.display = 'block';
      }
    });

    document.getElementById('submitBtn').addEventListener('click', () => {
        vscode.postMessage({ type: 'submitCode' });
    });

    window.addEventListener('message', event => {
      const message = event.data;
      if (message.type === 'showInstructions') {
        document.getElementById('code-entry').style.display = 'none';
        document.getElementById('instructions').style.display = 'block';
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
        resultDiv.innerText = message.value;
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
