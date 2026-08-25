import re, os, glob

def process_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()
    original = content
    filters_match = re.search(r'filters\s*:\s*\{([^}]+)\}', content)
    if not filters_match:
        return False
    filters_content = filters_match.group(1)
    filter_names = []
    for m in re.finditer(r'(\w+)[,\s}]', filters_content):
        name = m.group(1)
        if name not in ('function', 'return', 'const', 'let', 'var'):
            filter_names.append(name)
    for m in re.finditer(r'(\w+)\s*\([^)]*\)\s*\{', filters_content):
        filter_names.append(m.group(1))
    filter_names = list(set(filter_names))
    if not filter_names:
        return False
    content = re.sub(r'\s*filters\s*:\s*\{[^}]+\}[,\s]*', '', content, count=1)
    methods_match = re.search(r'methods\s*:\s*\{', content)
    if methods_match:
        insert_pos = methods_match.end()
        additions = []
        for name in filter_names:
            if not re.search(rf'\b{name}\b\s*[:(]', content[insert_pos:insert_pos+5000]):
                additions.append(f'\n    {name},')
        if additions:
            content = content[:insert_pos] + ''.join(additions) + content[insert_pos:]
    for name in filter_names:
        content = re.sub(
            rf'\{{\{{\s*([^|}}]+?)\s*\|\s*{name}\s*\}}\}}',
            lambda m: f'{{{{ {name}({m.group(1).strip()}) }}}}',
            content
        )
        content = re.sub(
            rf'\{{\{{\s*([^|}}]+?)\s*\|\s*{name}\s*\(([^)]*)\)\s*\}}\}}',
            lambda m: f'{{{{ {name}({m.group(1).strip()}, {m.group(2).strip()}) }}}}',
            content
        )
    if content != original:
        with open(filepath, 'w') as f:
            f.write(content)
        print(f'  Processed: {filepath} (filters: {filter_names})')
        return True
    return False

base = 'src/renderer/components'
files = glob.glob(f'{base}/**/*.vue', recursive=True)
count = 0
for f in files:
    if process_file(f):
        count += 1
print(f'Total files processed: {count}')
