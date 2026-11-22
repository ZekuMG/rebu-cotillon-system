"""Run the offline fixtures against a packaged Electron renderer over CDP."""
import importlib.util
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

spec = importlib.util.spec_from_file_location('loading', Path(__file__).with_name('offline-loading-qa.py'))
loading = importlib.util.module_from_spec(spec)
spec.loader.exec_module(loading)


with sync_playwright() as playwright:
    browser = playwright.chromium.connect_over_cdp(sys.argv[1])
    context = browser.contexts[0]
    page = context.pages[0]
    page.set_default_timeout(15000)
    page.wait_for_load_state('domcontentloaded')
    assert 'app.asar' in page.url, 'The test requires a packaged renderer'
    loading.smoke.URL = page.url

    class PackagedContext:
        def new_page(self): return page
        def close(self): pass  # The launcher closes Electron after each case.

    class PackagedBrowser:
        def new_context(self, viewport):
            page.set_viewport_size(viewport)
            return PackagedContext()

    scenario = sys.argv[2]
    # Hidden native windows do not produce compositor frames for screenshots.
    # Keep all interaction, persistence, network and DOM assertions enabled.
    if scenario == 'sale': loading.smoke.sale_scenario(PackagedBrowser(), capture_screenshots=False)
    elif scenario == 'lost-response': loading.smoke.sale_scenario(PackagedBrowser(), lose_response=True, capture_screenshots=False)
    elif scenario == 'pos-recovery': loading.smoke.sale_scenario(PackagedBrowser(), lose_response=True, recover_in_pos=True, capture_screenshots=False)
    else:
        loading.run_case(PackagedBrowser(), capture_screenshots=False, **{
            'cold': {'cold': True}, 'live': {}, 'in-flight': {'in_flight': True}, 'wan': {'wan_loss': True},
        }[scenario])
