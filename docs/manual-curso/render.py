from playwright.sync_api import sync_playwright
import pathlib
ruta = pathlib.Path('/root/manual/manual.html').resolve().as_uri()
pie = ('<div style="width:100%;font-size:7.5pt;color:#94a3b8;padding:0 16mm;'
       'font-family:Segoe UI,Arial,sans-serif;display:flex;justify-content:space-between;">'
       '<span>SyncroERP + Apache Fineract · Manual de curso</span>'
       '<span class="pageNumber"></span></div>')
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page()
    pg.goto(ruta, wait_until='load')
    pg.wait_for_timeout(2500)
    pg.pdf(path='/root/manual/SyncroERP-Fineract-Manual.pdf', format='Letter',
           print_background=True, display_header_footer=True,
           header_template='<div></div>', footer_template=pie,
           margin={'top':'18mm','bottom':'20mm','left':'16mm','right':'16mm'})
    b.close()
print('listo')
