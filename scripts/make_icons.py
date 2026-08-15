"""Generate flat PNG icons (navy background, gold rounded square) with stdlib only."""
import struct, zlib, os

NAVY = (17, 18, 40)
GOLD = (245, 184, 24)

def make_png(path, size):
    inset = size // 5
    r2 = (size // 2 - inset) ** 2
    rows = []
    for y in range(size):
        row = bytearray([0])  # filter byte
        for x in range(size):
            dx, dy = x - size // 2, y - size // 2
            row += bytes(GOLD if dx * dx + dy * dy <= r2 else NAVY)
        rows.append(bytes(row))
    raw = b''.join(rows)

    def chunk(tag, data):
        c = tag + data
        return struct.pack('>I', len(data)) + c + struct.pack('>I', zlib.crc32(c))

    ihdr = struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0)
    png = (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ihdr)
           + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))
    with open(path, 'wb') as f:
        f.write(png)
    print(path, os.path.getsize(path), 'bytes')

os.makedirs('icons', exist_ok=True)
make_png('icons/icon-192.png', 192)
make_png('icons/icon-512.png', 512)
make_png('icons/apple-touch-icon.png', 180)
