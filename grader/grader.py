import sys

try:
    import student_code
except Exception as e:
    print("Assignment Grade = 0%")
    print("Feedback: Could not import your code file. Please make sure it is named correctly and does not contain syntax errors.")
    sys.exit(1)

if hasattr(student_code, "add"):
    try:
        result = student_code.add(2, 3) 
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
