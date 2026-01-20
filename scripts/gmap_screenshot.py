import time
import os
import math
from concurrent.futures import ThreadPoolExecutor
from PIL import Image
Image.MAX_IMAGE_PIXELS = None
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from webdriver_manager.chrome import ChromeDriverManager

# --- CONFIGURATION ---
points = [
    (12.868509, 79.972093), (12.908582, 80.057581),
    (12.871173, 80.159481), (12.805976, 80.121649), (12.835758, 80.005973)
]

ZOOM = 17 
WIDTH, HEIGHT = 1400, 1100  # Larger capture to allow more cropping

# CROP SETTINGS (Aggressive to remove UI and avoid edge distortion)
CROP_LEFT = 200
CROP_TOP = 200
CROP_RIGHT = 150
CROP_BOTTOM = 250

FINAL_W = WIDTH - CROP_LEFT - CROP_RIGHT
FINAL_H = HEIGHT - CROP_TOP - CROP_BOTTOM

THREADS = 25 # High speed run

# --- MATH UTILS (Mercator Projection for precise stitching) ---
def lat_lng_to_pixels(lat, lng, zoom):
    """Converts lat/lng to world pixel coordinates at a given zoom."""
    scale = 256 * (2 ** zoom)
    x = (lng + 180) / 360 * scale
    lat_rad = math.radians(lat)
    y = (1 - math.log(math.tan(lat_rad) + 1 / math.cos(lat_rad)) / math.pi) / 2 * scale
    return x, y

def pixels_to_lat_lng(x, y, zoom):
    """Converts world pixel coordinates back to lat/lng."""
    scale = 256 * (2 ** zoom)
    lng = x / scale * 360 - 180
    n = math.pi - 2 * math.pi * y / scale
    lat = math.degrees(math.atan(math.sinh(n)))
    return lat, lng

def get_bounds(pts):
    lats = [p[0] for p in pts]
    lngs = [p[1] for p in pts]
    return min(lats), max(lats), min(lngs), max(lngs)

def setup_browser(driver_path):
    options = Options()
    options.add_argument("--headless")
    options.add_argument(f"--window-size={WIDTH},{HEIGHT}")
    options.add_argument("--disable-gpu")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--blink-settings=imagesEnabled=true")
    options.add_argument("--memory-pressure-off")
    service = Service(executable_path=driver_path)
    driver = webdriver.Chrome(service=service, options=options)
    driver.set_page_load_timeout(30)
    return driver

# Shared progress tracking for threads
progress_counter = 0

def capture_tile(args):
    global progress_counter
    r, c, lat, lng, total_tiles, start_time, driver_path = args
    
    driver = setup_browser(driver_path)
    try:
        url = f"https://www.google.com/maps/@{lat},{lng},{ZOOM}z/data=!3m1!1e3?entry=ttu"
        driver.get(url)
        
        # Nuclear UI Hiding including the Layers button
        hide_ui_script = """
        const selectors = [
            '.ndp-canvas', '#searchbox', '#widget-zoom', '#minimap', 
            '#footer-current-location', '#layer-shortcuts', '.gmnoprint',
            '.gm-style-cc', '#titlecard', '#watermark', '.app-view-layout-button-container',
            '.scene-footer-container', '#gb', '.watermark',
            'button[aria-label="Layers"]', '.w699le', '.L66ur',
            '.gm-svpc', '.gm-style-mtc', '.gm-control-active',
            '.hp-layers-button-container', '.widget-scene'
        ];
        selectors.forEach(s => {
            document.querySelectorAll(s).forEach(el => {
                el.style.setProperty('display', 'none', 'important');
                el.style.setProperty('visibility', 'hidden', 'important');
                el.style.setProperty('opacity', '0', 'important');
            });
        });
        
        // Target the specific bottom left container if classes change
        const leftBottom = document.querySelector('.gm-bundle-control-stack-bottom-left');
        if (leftBottom) leftBottom.style.display = 'none';
        
        // Kill the 'Explore' bar and other overlays
        document.querySelectorAll('.widget-layer').forEach(el => el.style.display = 'none');
        """
        time.sleep(6.5) # Time for tiles to load
        driver.execute_script(hide_ui_script)
        time.sleep(0.5) 
        
        temp_filename = f"temp_{r}_{c}.png"
        driver.save_screenshot(temp_filename)
        
        with Image.open(temp_filename) as img:
            crop_box = (CROP_LEFT, CROP_TOP, WIDTH - CROP_RIGHT, HEIGHT - CROP_BOTTOM)
            cropped_img = img.crop(crop_box)
            filename = f"tile_{r}_{c}.png"
            cropped_img.save(filename)
        
        os.remove(temp_filename)
        
        progress_counter += 1
        elapsed = time.time() - start_time
        avg_time = elapsed / progress_counter
        remaining = total_tiles - progress_counter
        etr = (avg_time * remaining) / 60
        
        print(f"[{progress_counter}/{total_tiles}] {filename} saved. ETR: {etr:.1f} mins")
        return r, c, filename
    except Exception as e:
        print(f"Error at {r},{c}: {e}")
        return r, c, None
    finally:
        driver.quit()

def capture_map(limit=None):
    global progress_counter
    min_lat, max_lat, min_lng, max_lng = get_bounds(points)
    
    start_x, start_y = lat_lng_to_pixels(max_lat, min_lng, ZOOM)
    end_x, end_y = lat_lng_to_pixels(min_lat, max_lng, ZOOM)
    
    cols = math.ceil((end_x - start_x) / FINAL_W) + 1
    rows = math.ceil((end_y - start_y) / FINAL_H) + 1
    
    total_expected = rows * cols
    print(f"Grid: {rows} rows x {cols} columns. Total: {total_expected} tiles")
    
    image_grid = [([None] * cols) for _ in range(rows)]
    tasks = []
    skipped = 0
    start_time = time.time()

    for r in range(rows):
        for c in range(cols):
            filename = f"tile_{r}_{c}.png"
            if os.path.exists(filename):
                image_grid[r][c] = filename
                skipped += 1
                continue

            px_x = start_x + (c * FINAL_W)
            px_y = start_y + (r * FINAL_H)
            lat, lng = pixels_to_lat_lng(px_x, px_y, ZOOM)
            tasks.append((r, c, lat, lng, total_expected, start_time))
            
            if limit and (len(tasks) + skipped) >= limit:
                break
        if limit and (len(tasks) + skipped) >= limit:
            break

    progress_counter = skipped
    if tasks:
        print("Resolving ChromeDriver...")
        driver_path = ChromeDriverManager().install()
        # Add driver_path to all tasks
        tasks = [t + (driver_path,) for t in tasks]
        
        print(f"Starting {len(tasks)} tasks with {THREADS} threads...")
        with ThreadPoolExecutor(max_workers=THREADS) as executor:
            results = list(executor.map(capture_tile, tasks))
            for r, c, path in results:
                if path:
                    image_grid[r][c] = path

    stitch_images(image_grid)

def stitch_images(image_grid):
    active_tiles = []
    for r, row in enumerate(image_grid):
        for c, path in enumerate(row):
            if path:
                active_tiles.append((r, c, path))
    
    if not active_tiles:
        print("No tiles captured.")
        return

    rows_indices = [t[0] for t in active_tiles]
    cols_indices = [t[1] for t in active_tiles]
    min_r, max_r = min(rows_indices), max(rows_indices)
    min_c, max_c = min(cols_indices), max(cols_indices)
    
    num_rows = max_r - min_r + 1
    num_cols = max_c - min_c + 1

    first_tile = Image.open(active_tiles[0][2])
    w, h = first_tile.size
    
    print(f"Stitching {len(active_tiles)} tiles into {num_cols*w}x{num_rows*h} canvas...")
    canvas = Image.new('RGB', (num_cols * w, num_rows * h))
    
    for r, c, path in active_tiles:
        with Image.open(path) as img:
            canvas.paste(img, ((c - min_c) * w, (r - min_r) * h))
        os.remove(path)
    
    output_name = "final_high_res_map.jpg"
    canvas.save(output_name, quality=95)
    print(f"SUCCESS: Saved as {output_name} ({len(active_tiles)} tiles stitched)")

def patch_map(coords):
    min_lat, max_lat, min_lng, max_lng = get_bounds(points)
    start_x, start_y = lat_lng_to_pixels(max_lat, min_lng, ZOOM)
    
    print(f"Patching {len(coords)} tiles...")
    
    print("Resolving ChromeDriver...")
    driver_path = ChromeDriverManager().install()
    
    tasks = []
    start_time = time.time()
    for r, c in coords:
        px_x = start_x + (c * FINAL_W)
        px_y = start_y + (r * FINAL_H)
        lat, lng = pixels_to_lat_lng(px_x, px_y, ZOOM)
        tasks.append((r, c, lat, lng, len(coords), start_time, driver_path))
        
    results = []
    with ThreadPoolExecutor(max_workers=min(len(tasks), THREADS)) as executor:
        results = list(executor.map(capture_tile, tasks))
    
    print("Loading existing map for patching...")
    canvas = Image.open("final_high_res_map.jpg")
    w, h = FINAL_W, FINAL_H
    
    for r, c, path in results:
        if path:
            with Image.open(path) as img:
                print(f"Patching tile at row {r}, col {c}...")
                canvas.paste(img, (c * w, r * h))
            os.remove(path)
            
    canvas.save("final_high_res_map.jpg", quality=95)
    print("SUCCESS: Patched final_high_res_map.jpg")

if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1 and sys.argv[1] == "patch":
        # Rows 10, 11, 12 and Cols 13, 14, 15
        patch_coords = [
            (10, 13), (10, 14), (10, 15),
            (11, 13), (11, 14), (11, 15),
            (12, 13), (12, 14), (12, 15)
        ]
        patch_map(patch_coords)
    elif len(sys.argv) > 1 and sys.argv[1] == "full":
        print("--- STARTING FRESH FULL RUN (25 THREADS) ---")
        capture_map(limit=None)
    else:
        limit = 20
        print(f"--- STARTING FRESH TEST RUN ({limit} tiles) ---")
        capture_map(limit=limit)

    print(f"--- Process Finished at {time.ctime()} ---")