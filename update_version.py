import re
import os

def read_version():
    with open('version.txt', 'r') as f:
        return f.read().strip()

def bump_patch(version):
    major, minor, patch = map(int, version.split('.'))
    return f"{major}.{minor}.{patch + 1}"

def update_version_file(new_version):
    with open('version.txt', 'w') as f:
        f.write(new_version)

def update_sw_cache(new_version):
    sw_path = 'sw.js'
    if not os.path.exists(sw_path):
        print("sw.js not found")
        return
    with open(sw_path, 'r') as f:
        content = f.read()
    new_cache_name = f"onex-v{new_version.replace('.', '-')}"
    content = re.sub(r"const CACHE_NAME = '.*'", f"const CACHE_NAME = '{new_cache_name}'", content)
    with open(sw_path, 'w') as f:
        f.write(content)

def main():
    current_version = read_version()
    new_version = bump_patch(current_version)
    print(f"Updating version: {current_version} → {new_version}")
    update_version_file(new_version)
    update_sw_cache(new_version)
    print("Done.")

if __name__ == '__main__':
    main()