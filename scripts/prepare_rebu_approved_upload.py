"""Validate existing approved files and prepare upload previews/thumbnails only."""
import hashlib
import json
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageOps

root = Path.cwd()
production = root / 'output/rebu-image-production-2026-09-28'
backup = Path(sys.argv[1]).resolve()
ids = sys.argv[2:]
if not ids:
    raise SystemExit('Specify reviewed product IDs.')
selection = json.loads((production / 'stock-filtered-selection.json').read_text(encoding='utf-8'))
approved = {str(x['id']): x for x in selection['completed_targets']}
supplier_qa = json.loads((production / 'provider-replacements-qa.json').read_text(encoding='utf-8'))
supplier_approved = {str(x['id']): x for x in supplier_qa['approved'] if x.get('status') == 'approved'}
live = json.loads((backup / 'product-image-snapshot.json').read_text(encoding='utf-8'))
products = {str(x['id']): x for x in live['products']}
out = production / 'supabase-upload-pilot-2026-10-06'
out.mkdir(exist_ok=True)
font = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 22)
sheet = Image.new('RGB', (1200, 420 * len(ids)), 'white')
draw = ImageDraw.Draw(sheet)
plan = []
for index, product_id in enumerate(ids):
    target = approved[product_id]
    current = products[product_id]
    if current['is_active'] is False or float(current['stock'] or 0) <= 0:
        raise ValueError(f'{product_id}: out of stock/inactive')
    if current['title'] != target['title'] or current['image'] != target['current_image']:
        raise ValueError(f'{product_id}: live product changed since approval')
    approval = target.get('completion_status') or ('approved_supplier_record' if product_id in supplier_approved else '')
    if not approval.startswith('approved_'):
        raise ValueError(f'{product_id}: lacks explicit visual approval')
    filename = (production / (target.get('output') or supplier_approved[product_id]['output'])).resolve()
    image = Image.open(filename)
    image.load()
    if image.size != (3000, 2400):
        raise ValueError(f'{product_id}: wrong size {image.size}')
    dpi = image.info.get('dpi', (0, 0))
    if any(abs(x - 300) > 1 for x in dpi):
        raise ValueError(f'{product_id}: wrong DPI {dpi}')
    rgb = image.convert('RGB')
    if any(rgb.getpixel(point) != (255, 255, 255) for point in
           [(0, 0), (2999, 0), (0, 2399), (2999, 2399)]):
        raise ValueError(f'{product_id}: non-white corners')
    # Match the application's 320-square center-cover thumbnail operation.
    thumb = ImageOps.fit(rgb, (320, 320), method=Image.Resampling.LANCZOS)
    thumbnail_path = out / f'{product_id}-thumb.webp'
    thumb.save(thumbnail_path, 'WEBP', quality=82)
    y = 420 * index
    draw.text((12, y + 8), f"{product_id} | {current['title']}", font=font, fill='black')
    draw.text((12, y + 42), 'Actual en inventario', font=font, fill='black')
    draw.text((612, y + 42), 'Imagen aprobada para subir', font=font, fill='black')
    original = Image.open(target['source_file']).convert('RGB')
    sheet.paste(ImageOps.contain(original, (570, 330)), (12, y + 76))
    sheet.paste(ImageOps.contain(rgb, (570, 330)), (612, y + 76))
    plan.append({
        'id': product_id, 'title': current['title'], 'file': str(filename),
        'thumb_file': str(thumbnail_path),
        'sha256': hashlib.sha256(filename.read_bytes()).hexdigest(),
        'thumb_sha256': hashlib.sha256(thumbnail_path.read_bytes()).hexdigest(),
        'before': current, 'approval': approval,
        'supplier_qa': supplier_approved.get(product_id, {}).get('qa', ''),
    })
sheet.save(out / 'qa-contact-sheet.jpg', quality=95)
(out / 'upload-plan.json').write_text(json.dumps({
    'backup_directory': str(backup), 'products': plan,
}, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({'prepared': len(plan), 'directory': str(out)}, ensure_ascii=False))
