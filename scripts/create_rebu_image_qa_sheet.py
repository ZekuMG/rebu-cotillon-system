"""Create a read-only side-by-side QA sheet of completed active/in-stock images."""
import json, sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageOps

root = Path.cwd()
base = root / 'output/rebu-image-production-2026-09-28'
selection = json.loads((base / 'stock-filtered-selection.json').read_text(encoding='utf-8'))
ledgers = base / 'supabase-upload-pilot-2026-10-06/upload-ledger'
applied = set()
if ledgers.exists():
    for f in ledgers.glob('*.json'):
        try:
            item = json.loads(f.read_text(encoding='utf-8'))
            if item.get('status') == 'applied_verified': applied.add(str(item['id']))
        except Exception:
            pass
deferred_file = base / 'upload-review-deferred-2026-10-06.json'
deferred = {str(x['id']) for x in json.loads(deferred_file.read_text(encoding='utf-8'))['deferred']}
excluded_ids = applied | deferred
items = [x for x in selection['completed_targets']
         if x.get('production_status') == 'completed'
         and str(x['id']) not in excluded_ids
         and not x.get('requires_source_recheck')
         and x.get('completion_status', '').startswith('approved_')]
items.sort(key=lambda x: (x.get('title') or '').casefold(), reverse=True)
requested_ids = set(sys.argv[3:])
if requested_ids:
    items = [x for group in ['pending_targets', 'completed_targets'] for x in selection[group]
             if str(x['id']) in requested_ids and x.get('production_status') == 'completed'
             and str(x['id']) not in excluded_ids]
offset = int(sys.argv[1]) if len(sys.argv) > 1 else 0
limit = int(sys.argv[2]) if len(sys.argv) > 2 else 8
chosen = items[offset:offset+limit]
font = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 20)
canvas = Image.new('RGB', (1600, 370 * len(chosen)), 'white')
draw = ImageDraw.Draw(canvas)
manifest = []
for index, item in enumerate(chosen):
    source = Path(item['source_file'])
    out = (base / item['output']).resolve() if item.get('output') else (base / f"approved/{item['id']}.png").resolve()
    y = index * 370
    draw.text((8, y + 4), f"ID {item['id']} | {item['title'][:100]}", fill='black', font=font)
    draw.text((8, y + 34), 'Original con marca', fill='black', font=font)
    draw.text((808, y + 34), 'Resultado corregido', fill='black', font=font)
    for path, x in [(source, 8), (out, 808)]:
        try:
            with Image.open(path) as image:
                image.load()
                thumb = ImageOps.contain(image.convert('RGB'), (780, 322))
                canvas.paste(thumb, (x, y + 60))
        except Exception as e:
            draw.text((x + 20, y + 100), f'ERROR DE LECTURA: {e}', fill='red', font=font)
    manifest.append({'id': str(item['id']), 'title': item['title'], 'source': str(source),
                     'output': str(out), 'completion_status': item.get('completion_status')})
directory = base / 'qa-active-batch'
directory.mkdir(exist_ok=True)
canvas.save(directory / f'batch-{offset:04d}-{offset+len(chosen):04d}.jpg', quality=94)
(directory / f'batch-{offset:04d}-{offset+len(chosen):04d}.json').write_text(
    json.dumps({'eligible_remaining': len(items), 'offset': offset, 'items': manifest}, ensure_ascii=False, indent=2),
    encoding='utf-8')
print(json.dumps({'eligible_remaining': len(items), 'offset': offset, 'prepared': len(chosen),
                  'sheet': str(directory / f'batch-{offset:04d}-{offset+len(chosen):04d}.jpg')}, ensure_ascii=False))
