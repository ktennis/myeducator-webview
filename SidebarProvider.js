const vscode = require("vscode");
const util = require("util");
const exec = util.promisify(require("child_process").exec);
const fs = require("fs");
const path = require("path");
const cp = require('child_process');

async function runDockerCommand(command) {
  try {
    const { stdout, stderr } = await exec(command);
    return [stdout, stderr].filter(Boolean).join('\n');
  } catch (err) {
    console.error("Exec error:", err);
    // Return both stderr and message for full diagnostics
    return `${err.stderr || ''}\n${err.stdout || ''}\n${err.message}`;
  }
}

/**
 * Extracts input prompts from a Python file using extract_inputs.py.
 * @param {string} targetFile - The path to the Python file to analyze.
 * @returns {Promise<string[]>} Array of input prompts.
 */
function extractInputsWithAst(targetFile) {
    return new Promise((resolve, reject) => {
        const scriptPath = path.join(__dirname, 'extract_inputs.py');
        const scriptDir = path.dirname(scriptPath);
        const scriptFile = path.basename(scriptPath);
        const targetFileName = path.basename(targetFile);

        // Use forward slashes for Docker on Windows
        const dockerScriptDir = scriptDir.replace(/\\/g, '/');
        const dockerTargetDir = path.dirname(targetFile).replace(/\\/g, '/');

        // Mount both the script and the target file
        const dockerCmd = [
            'docker run --rm',
            `-v "${dockerScriptDir}:/scripts"`,
            `-v "${dockerTargetDir}:/code"`,
            'python:3',
            `python /scripts/${scriptFile} /code/${targetFileName}`
        ].join(' ');

        cp.exec(dockerCmd, (error, stdout, stderr) => {
            if (error) {
                reject(stderr || error.message);
                return;
            }
            const prompts = stdout.trim() ? stdout.trim().split('|||') : [];
            resolve(prompts);
        });
    });
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
          const vscode = require("vscode");
          const fs = require("fs");
          const os = require("os");
          const path = require("path");

          // Prompt user to select a Python file
          const fileUris = await vscode.window.showOpenDialog({
            canSelectMany: false,
            openLabel: "Select Python file to grade",
            filters: { "Python Files": ["py"] }
          });

          if (!fileUris || fileUris.length === 0) {
            vscode.window.showErrorMessage("No file selected.");
            return;
          }

          const selectedFilePath = fileUris[0].fsPath;

          let dockerPath = selectedFilePath;
          if (process.platform === "win32") {
            dockerPath = selectedFilePath.replace(/\\/g, "/");
          }

          const fileName = path.basename(selectedFilePath);
          const dockerCmd = `docker run --rm -v "${dockerPath}:/code/${fileName}" my-grader python /grader/grader.py /code/${fileName}`;          console.log("Running Docker command:", dockerCmd);

          const result = await runDockerCommand(dockerCmd);
          console.log("Docker result:", result);

          let gradeLine = "";
          let feedbackLine = "";
          if (result) {
            const lines = result.split(/\r?\n/);
            for (const line of lines) {
              if (line.startsWith("Assignment Grade")) gradeLine = line;
              if (line.startsWith("Feedback:")) feedbackLine = line;
            }
          }

          let output = "";
          if (gradeLine || feedbackLine) {
            output = [gradeLine, feedbackLine].filter(Boolean).join("<br>");
          } else {
            output = "No grade or feedback found.";
          }

          webviewView.webview.postMessage({
            type: "showResult",
            value: output,
          });
          break;
        }

        case "testCode": {
          const fileUris = await vscode.window.showOpenDialog({
            canSelectMany: false,
            openLabel: "Select Python file to test",
            filters: { "Python Files": ["py"] }
          });

          if (!fileUris || fileUris.length === 0) {
            vscode.window.showErrorMessage("No file selected.");
            return;
          }

          const selectedFilePath = fileUris[0].fsPath;
          const code = fs.readFileSync(selectedFilePath, "utf8");

          // Extract all input prompts
          let inputPrompts = [];
          const inputAST = /input\s*\(\s*["']([^"']+)["']\s*\)/g;
          let match;
          while ((match = inputAST.exec(code)) !== null) {
            inputPrompts.push(match[1]);
          }

          // Extract all input prompts using AST script
          try {
            inputPrompts = await extractInputsWithAst(selectedFilePath);
          } catch (err) {
            vscode.window.showErrorMessage("Failed to extract input prompts: " + err);
          }

          // Save file path for later use
          this._testFilePath = selectedFilePath;

          // Send prompts to webview
          webviewView.webview.postMessage({
            type: "showInputFields",
            prompts: inputPrompts,
          });
          break;
        }
        case "runTestWithInputs": {
          const userInputs = data.inputs;
          const selectedFilePath = this._testFilePath;
          if (!selectedFilePath) {
            vscode.window.showErrorMessage("No file selected.");
            return;
          }

          // Write inputs to temp file
          const os = require("os");
          const tmpInputPath = path.join(os.tmpdir(), "student_input.txt");
          fs.writeFileSync(tmpInputPath, userInputs.join("\n"));

          // Prepare Docker paths
          let dockerInputPath = tmpInputPath;
          if (process.platform === "win32") {
            dockerInputPath = tmpInputPath.replace(/\\/g, "/");
          }
          const fileDir = path.dirname(selectedFilePath).replace(/\\/g, "/");
          const fileName = path.basename(selectedFilePath);

          // Run in Docker
          const dockerCmd = `docker run --rm -v "${fileDir}:/code" -v "${dockerInputPath}:/code/input.txt" python:3 sh -c "python /code/${fileName} < /code/input.txt"`;
          const result = await runDockerCommand(dockerCmd);

          webviewView.webview.postMessage({
            type: "showResult",
            value: result || "No output returned from Docker.",
          });
          break;
        }

        // New case for listing Docker containers
        case "listContainers": {
          const result = await runDockerCommand('docker ps');
          console.log("Docker result:", result);
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

    // Allow Enter key to submit access code
    document.getElementById('accessCode').addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        document.getElementById('codeSubmitBtn').click();
      }
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
          <pre>\${message.value}</pre>
          <button class="button" id="backBtn">Back</button>
        \`;
        document.getElementById('backBtn').onclick = () => {
          resultDiv.style.display = 'none';
          document.getElementById('instructions').style.display = 'block';
        };
        resultDiv.style.display = 'block';
      }
      if (message.type === 'showInputFields') {
        document.getElementById('instructions').style.display = 'none';
        let resultDiv = document.getElementById('result');
        if (!resultDiv) {
          resultDiv = document.createElement('div');
          resultDiv.id = 'result';
          resultDiv.className = 'instructions';
          document.body.appendChild(resultDiv);
        }
        // Render input fields as a form
        let html = '<form id="inputForm">';
        (message.prompts || []).forEach((prompt, idx) => {
          html += \`<label style="display:block; margin-bottom:16px;">\${prompt || 'Input ' + (idx+1)}<br>
            <input type="text" name="input\${idx}" required></label>\`;
        });
        html += \`
          <div style="display:flex; gap:12px; margin-top:12px;">
            <button class="button" type="submit">Submit</button>
            <button class="button" type="button" id="backBtnInput">Back</button>
          </div>
        </form>\`;
        resultDiv.innerHTML = html;
        resultDiv.style.display = 'block';

        document.getElementById('backBtnInput').onclick = () => {
          resultDiv.style.display = 'none';
          document.getElementById('instructions').style.display = 'block';
        };

        document.getElementById('inputForm').onsubmit = (e) => {
          e.preventDefault();
          const form = e.target;
          const inputs = [];
          for (let i = 0; i < (message.prompts || []).length; i++) {
            inputs.push(form['input' + i].value);
          }
          vscode.postMessage({ type: 'runTestWithInputs', inputs });
        };
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
