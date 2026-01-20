import json
import math
import shutil
import os
from datetime import datetime

# Ramer-Douglas-Peucker algorithm for polygon simplification

def distance_point_line(point, start, end):
    if start == end:
        return math.sqrt((point[0] - start[0])**2 + (point[1] - start[1])**2)
    
    n = abs((end[1] - start[1]) * point[0] - (end[0] - start[0]) * point[1] + end[0] * start[1] - end[1] * start[0])
    d = math.sqrt((end[1] - start[1])**2 + (end[0] - start[0])**2)
    return n / d

def rdp(points, epsilon):
    if len(points) < 3:
        return points
        
    dmax = 0
    index = 0
    end = len(points) - 1
    
    for i in range(1, end):
        d = distance_point_line(points[i], points[0], points[end])
        if d > dmax:
            index = i
            dmax = d
            
    if dmax > epsilon:
        # Recursive call
        rec_results1 = rdp(points[:index+1], epsilon)
        rec_results2 = rdp(points[index:], epsilon)
        
        # Build the result list
        result = rec_results1[:-1] + rec_results2
        return result
    else:
        return [points[0], points[end]]

def simplify_boundaries(file_path, epsilon=2.0):
    print(f"Processing {file_path}...")
    
    if not os.path.exists(file_path):
        print(f"Error: File {file_path} not found.")
        return

    # Backup
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_path = f"{file_path}.{timestamp}.bak"
    shutil.copy2(file_path, backup_path)
    print(f"Backup created at {backup_path}")
    
    # Load data
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except Exception as e:
        print(f"Failed to load JSON: {e}")
        return

    # Process regions
    regions = data.get('extractedRegions', [])
    total_points_before = 0
    total_points_after = 0
    
    for region in regions:
        polygon = region.get('polygon', [])
        if not polygon:
            continue
            
        total_points_before += len(polygon)
        
        # Apply simplification
        # Ensure start and end points match if it's a closed loop (usually usually implied in SVG but good to check)
        # RDP works on polyline. If closed, we might want to treat it as such, but RDP on open line 
        # from P0 to Pn (where P0==Pn) works.
        
        simplified = rdp(polygon, epsilon)
        
        # Update polygon
        region['polygon'] = simplified
        region['vertices'] = len(simplified) # Update vertex count if stored
        
        total_points_after += len(simplified)
        
    # Save back
    try:
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2)
        print("Successfully saved simplified data.")
    except Exception as e:
        print(f"Failed to save JSON: {e}")
        return

    reduction = 0
    if total_points_before > 0:
        reduction = ((total_points_before - total_points_after) / total_points_before) * 100
        
    print("-" * 30)
    print(f"Simplification Complete (epsilon={epsilon})")
    print(f"Total points before: {total_points_before}")
    print(f"Total points after:  {total_points_after}")
    print(f"Reduction:           {reduction:.2f}%")
    print("-" * 30)

if __name__ == "__main__":
    # Simplify extracted_regions.json
    # Epsilon of 50.0 pixels for aggressive reduction (14k px width)
    # Previous run at 20.0 yielded 40% reduction. User requested more.
    # Note: Assumes script is run from project root directory
    target_file = 'data/extracted_regions.json'
    simplify_boundaries(target_file, epsilon=50.0)
