// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require("vscode");

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  // Use the console to output diagnostic information (console.log) and errors (console.error)
  // This line of code will only be executed once when your extension is activated
  console.log('Congratulations, your extension "myeducator" is now active!');

  // The command has been defined in the package.json file
  // Now provide the implementation of the command with  registerCommand
  // The commandId parameter must match the command field in package.json
  const disposable = vscode.commands.registerCommand(
    "myeducator.helloWorld",
    function () {
      // The code you place here will be executed every time your command is executed

      // Display a message box to the user
      vscode.window.showInformationMessage("Hello World from myEducator!");
      var panel = vscode.window.createWebviewPanel(
        "myEducator",
        "Visual Studio MyEducator Extension",
        vscode.ViewColumn.One,
        { enableScripts: true }
      );
      panel.webview.html = getWebviewContent();
    }
  );

  context.subscriptions.push(disposable);
}

function getWebviewContent() {
  return `<!DOCTYPE html>
	<html lang="en">
		<head>
			<title>MyEducator Webview</title>
			<script>
				const vscode = acquireVsCodeApi();
				document.addEventListener('DOMContentLoaded', function() {
				const p1 = document.getElementById('p1');
				p1.style.color = 'blue';
				});
			</script>
		</head>
		<body>
			<h1 id='p1'>Welcome to MyEducator Webview!</h1>
			<p>This is a simple webview example.</p>
		</body>
	</html>`;
}

// Export the activate function
exports.activate = activate;

// Export the deactivate function (optional, but good practice)
function deactivate() {
  console.log('Extension "myeducator" has been deactivated.');
}
exports.deactivate = deactivate;
