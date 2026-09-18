from pathlib import Path

root = Path("/home/deployer/immotopia-saas")
paths = list((root / "infra").rglob("*"))
paths += list((root / "packages" / "api").glob("Dockerfile*"))
count = 0
for path in paths:
    if not path.is_file():
        continue
    if path.suffix not in {".sh", ".yml", ".conf"} and not path.name.startswith("Dockerfile"):
        continue
    data = path.read_bytes()
    if b"\r" not in data:
        continue
    path.write_bytes(data.replace(b"\r\n", b"\n").replace(b"\r", b"\n"))
    count += 1
print(f"stripped_crlf {count}")
