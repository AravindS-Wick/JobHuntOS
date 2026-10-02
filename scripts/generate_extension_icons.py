import os
import struct
import zlib
import math

def write_png(filename, width, height, rgba_data):
    def chunk(tag, data):
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff)

    header = b'\x89PNG\r\n\x1a\n'
    ihdr = chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0))
    
    raw = bytearray()
    for y in range(height):
        raw.append(0) # filter type 0 (None)
        start = y * width * 4
        raw.extend(rgba_data[start:start + width * 4])
        
    idat = chunk(b'IDAT', zlib.compress(bytes(raw), 9))
    iend = chunk(b'IEND', b'')
    
    with open(filename, 'wb') as f:
        f.write(header + ihdr + idat + iend)

def generate_icon(size):
    rgba = bytearray(size * size * 4)
    cx, cy = size / 2.0, size / 2.0
    corner_radius = size * 0.22

    for y in range(size):
        for x in range(size):
            idx = (y * size + x) * 4
            
            # Rounded rect distance
            dx = max(abs(x + 0.5 - cx) - (cx - corner_radius), 0)
            dy = max(abs(y + 0.5 - cy) - (cy - corner_radius), 0)
            dist_corner = math.sqrt(dx * dx + dy * dy)
            
            if dist_corner > corner_radius:
                # Outside rounded rect
                rgba[idx:idx+4] = b'\x00\x00\x00\x00'
                continue
            
            # Anti-aliasing on boundary
            alpha_edge = min(1.0, max(0.0, corner_radius - dist_corner + 0.5))
            
            # Background Gradient: Dark slate #070a13 to indigo #1e1b4b
            t = (x + y) / (size * 2.0)
            bg_r = int(7 + t * (49 - 7))
            bg_g = int(10 + t * (46 - 10))
            bg_b = int(19 + t * (129 - 19))
            
            # Center distance for radar rings
            dist_center = math.sqrt((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2)
            norm_dist = dist_center / (size * 0.5)

            # Outer glowing ring at radius 0.65
            ring_w = 0.08
            r_diff = abs(norm_dist - 0.65)
            if r_diff < ring_w:
                intensity = 1.0 - (r_diff / ring_w)
                # Cyan/Indigo glow
                bg_r = int(bg_r * (1 - intensity * 0.7) + 6 * intensity * 0.7)
                bg_g = int(bg_g * (1 - intensity * 0.7) + 182 * intensity * 0.7)
                bg_b = int(bg_b * (1 - intensity * 0.7) + 212 * intensity * 0.7)

            # Center target core (emerald / cyan dot)
            if norm_dist < 0.28:
                dot_int = max(0.0, 1.0 - (norm_dist / 0.28))
                bg_r = int(bg_r * (1 - dot_int) + 16 * dot_int)
                bg_g = int(bg_g * (1 - dot_int) + 185 * dot_int)
                bg_b = int(bg_b * (1 - dot_int) + 129 * dot_int)

            # Subtle crosshair ticks
            if (abs(x + 0.5 - cx) < size * 0.04 and norm_dist < 0.75 and norm_dist > 0.45) or \
               (abs(y + 0.5 - cy) < size * 0.04 and norm_dist < 0.75 and norm_dist > 0.45):
                bg_r = min(255, bg_r + 60)
                bg_g = min(255, bg_g + 180)
                bg_b = min(255, bg_b + 220)

            rgba[idx] = min(255, max(0, bg_r))
            rgba[idx + 1] = min(255, max(0, bg_g))
            rgba[idx + 2] = min(255, max(0, bg_b))
            rgba[idx + 3] = int(255 * alpha_edge)
            
    return bytes(rgba)

def main():
    out_dir = os.path.join(os.path.dirname(__file__), '..', 'apps', 'extension', 'icons')
    os.makedirs(out_dir, exist_ok=True)
    
    for s in [16, 32, 48, 128]:
        data = generate_icon(s)
        out_path = os.path.join(out_dir, f'icon-{s}.png')
        write_png(out_path, s, s, data)
        print(f"Generated {out_path} ({s}x{s})")

if __name__ == '__main__':
    main()
