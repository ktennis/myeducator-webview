import ast
import sys

if len(sys.argv) < 2:
    print("")
    sys.exit(0)

with open(sys.argv[1], "r", encoding="utf-8") as f:
    tree = ast.parse(f.read(), filename=sys.argv[1])

prompts = []
for node in ast.walk(tree):
    if isinstance(node, ast.Call) and getattr(node.func, "id", None) == "input":
        if node.args:
            arg = node.args[0]
            if isinstance(arg, ast.Str):
                prompts.append(arg.s)
            elif isinstance(arg, ast.Constant) and isinstance(arg.value, str):  # Python 3.8+
                prompts.append(arg.value)
            else:
                prompts.append("")
        else:
            prompts.append("")
print("|||".join(prompts))