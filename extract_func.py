#!/usr/bin/env python3
"""Extract buildCompletedTaskWindowHtml from Main.vue to a separate JS file."""
import re

with open('src/renderer/components/Main.vue', 'r') as f:
    content = f.read()

# Find the function and extract it
# From "function buildCompletedTaskWindowHtml(" to the matching closing "}"
start = content.find('      function buildCompletedTaskWindowHtml(')
if start == -1:
    print('Function not found')
    exit(1)

# Find matching closing brace
brace = 0
end = start
in_string = False
string_char = None
escape = False
for i in range(start, len(content)):
    ch = content[i]
    if escape:
        escape = False
        continue
    if ch == '\\':
        escape = True
        continue
    if in_string:
        if ch == string_char:
            in_string = False
            string_char = None
        continue
    if ch == '`' or ch == "'" or ch == '"':
        in_string = True
        string_char = ch
        continue
    if ch == '{':
        brace += 1
    elif ch == '}':
        brace -= 1
        if brace == 0:
            end = i + 1
            break

func_code = content[start:end].strip()
print(f"Function length: {len(func_code)} chars, {func_code.count(chr(10))} lines")

# Create the separate JS file
# We need to pass in: t, getThemeColors, formatBytes, escapeHtml
js_content = """// Extracted from Main.vue to avoid Vue SFC compiler issues with HTML in template literals

export function buildCompletedTaskWindowHtml (task, useCustomFrame, isMac, t, getThemeColors, formatBytes, escapeHtml) {
"""

# Convert the function body (remove the function signature and add it as the export)
func_body = func_code[len('function buildCompletedTaskWindowHtml(task, useCustomFrame = false, isMac = false)'):]
js_content += func_body + '\n}\n'

with open('src/renderer/utils/completedWindowHtml.js', 'w') as f:
    f.write(js_content)

print('Written to src/renderer/utils/completedWindowHtml.js')

# Now replace the function in Main.vue with an import and a wrapper
# Find the function again and replace it
new_content = content[:start] + '      // buildCompletedTaskWindowHtml moved to @/utils/completedWindowHtml' + content[end:]

# Add the import
import_line = "import { buildCompletedTaskWindowHtml } from '@/utils/completedWindowHtml'\n"
# Find a good place to add the import - after the last import
last_import = new_content.rfind('\nimport ')
if last_import == -1:
    last_import = new_content.find('\ndefineOptions')
new_content = new_content[:last_import + 1] + import_line + new_content[last_import + 1:]

# Now replace the call to buildCompletedTaskWindowHtml to pass extra args
# The original call is: const html = buildCompletedTaskWindowHtml(task, useCustomFrame, isMac)
# We need: const html = buildCompletedTaskWindowHtml(task, useCustomFrame, isMac, t, getThemeColors, formatBytes, escapeHtml)
new_content = new_content.replace(
    'const html = buildCompletedTaskWindowHtml(task, useCustomFrame, isMac)',
    'const html = buildCompletedTaskWindowHtml(task, useCustomFrame, isMac, t, getThemeColors, formatBytes, escapeHtml)'
)

with open('src/renderer/components/Main.vue', 'w') as f:
    f.write(new_content)

print('Main.vue updated')
