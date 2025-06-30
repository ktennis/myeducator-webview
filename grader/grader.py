import sys
import importlib
import ast
import io
from contextlib import redirect_stdout
from unittest.mock import patch

def count_inputs(filename):
    with open(filename, "r", encoding="utf-8") as f:
        tree = ast.parse(f.read(), filename=filename)
    return sum(
        1
        for node in ast.walk(tree)
        if isinstance(node, ast.Call) and getattr(node.func, "id", None) == "input"
    )

def run_student_code_with_inputs(filename, inputs):
    # Read the code
    with open(filename, "r", encoding="utf-8") as f:
        code = f.read()
    # Prepare input and output capture
    input_iter = iter(inputs)
    def fake_input(prompt=""):
        return next(input_iter)
    f_output = io.StringIO()
    try:
        with patch("builtins.input", fake_input):
            with redirect_stdout(f_output):
                exec(code, {})
        return f_output.getvalue()
    except Exception as e:
        return f"ERROR: {e}"

try:
    # Check for two input() calls
    filename = sys.argv[1] if len(sys.argv) > 1 else "student_code.py"    
    num_inputs = count_inputs(filename)
    if num_inputs == 2:
        output = run_student_code_with_inputs(filename, ["2", "3"])
        # Check if output contains the correct sum
        if "5" in output:
            print("Assignment Grade = 100%")
            print("Feedback: Your program correctly adds 2 and 3 and outputs 5.")
        else:
            print("Assignment Grade = 20%")
            print("Feedback: Your program ran, but did not output the correct sum for 2 and 3.")
    else:
        # Fallback to function-based grading
        import importlib.util
        import os

        module_path = filename
        module_name = os.path.splitext(os.path.basename(filename))[0]
        spec = importlib.util.spec_from_file_location(module_name, module_path)
        student_mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(student_mod)

        if hasattr(student_mod, "add"):
            try:
                result = student_mod.add(2, 3)
                if result == 5:
                    print("Assignment Grade = 100%")
                    print("Feedback: Your function performed the addition as expected.")
                else:
                    print("Assignment Grade = 20%")
                    print("Feedback: Your function was found, but the result was not correct.")
            except Exception as e:
                print("Assignment Grade = 20%")
                print("Feedback: Your function exists, but an error occurred while running it.")
        else:
            print("Assignment Grade = 0%")
            print("Feedback: Your code does not include a function named 'add'.")
except Exception as e:
    print("Assignment Grade = 0%")
    print("Feedback: Could not import or run your code file. Please make sure it is named correctly and does not contain syntax errors.")