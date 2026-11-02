"""Generate the checked-in extension PNG icons using only Python's standard library."""
import pathlib, struct, zlib
root = pathlib.Path(__file__).resolve().parent.parent / 'public' / 'icons'
root.mkdir(exist_ok=True)
polygon = [(0.56,0.15),(0.25,0.54),(0.46,0.54),(0.39,0.85),(0.75,0.43),(0.54,0.43)]
def inside(x,y):
    hit=False
    j=len(polygon)-1
    for i,(xi,yi) in enumerate(polygon):
        xj,yj=polygon[j]
        if ((yi>y)!=(yj>y)) and x<(xj-xi)*(y-yi)/(yj-yi)+xi: hit=not hit
        j=i
    return hit
for size in [16,48,128]:
    rows=[]
    for y in range(size):
        row=bytearray([0])
        for x in range(size):
            channels=[0,0,0,0]
            for sy in range(4):
                for sx in range(4):
                    px=(x+(sx+.5)/4)/size;py=(y+(sy+.5)/4)/size
                    rad=.22
                    dx=max(rad-px,0,px-(1-rad));dy=max(rad-py,0,py-(1-rad))
                    rgba=(0,0,0,0) if dx*dx+dy*dy>rad*rad else ((236,241,194,255) if inside(px,py) else (37,79,66,255))
                    channels=[a+b for a,b in zip(channels,rgba)]
            row.extend(round(c/16) for c in channels)
        rows.append(bytes(row))
    def chunk(name,data): return struct.pack('>I',len(data))+name+data+struct.pack('>I',zlib.crc32(name+data)&0xffffffff)
    png=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',size,size,8,6,0,0,0))+chunk(b'IDAT',zlib.compress(b''.join(rows)))+chunk(b'IEND',b'')
    (root/f'{size}.png').write_bytes(png)
