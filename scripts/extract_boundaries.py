#!/usr/bin/env python3
"""
Territory Boundary Extraction Script - Clean Image Version

This script extracts territory boundaries from a clean black-and-white
boundary image (no colors, no numbers - just black lines on white background).

Approach:
1. Load the clean boundary image
2. Threshold to get black lines
3. Find all closed regions (white areas bounded by black lines)
4. Filter out tiny regions (noise) and the outer background
5. Extract polygon coordinates for each territory region
6. Also extract the overall congregation boundary (outer thick line)
"""

import cv2
import numpy as np
import json
import os
from pathlib import Path

# Base directory
BASE_DIR = Path(__file__).parent.parent
MAP_DIR = BASE_DIR / "Map"
DATA_DIR = BASE_DIR / "data"

def extract_boundaries():
    """Extract territory boundaries from the clean boundary image."""
    
    # Load the clean boundary image
    boundary_path = MAP_DIR / "Real Boundary.png"
    print(f"Loading boundary image: {boundary_path}")
    
    img = cv2.imread(str(boundary_path))
    if img is None:
        print(f"Error: Could not load image from {boundary_path}")
        return None
    
    height, width = img.shape[:2]
    print(f"Image dimensions: {width} x {height}")
    
    # Convert to grayscale
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    
    # Threshold to get binary image (black lines become white, white background becomes black)
    # Since lines are black on white, we invert after thresholding
    _, binary = cv2.threshold(gray, 200, 255, cv2.THRESH_BINARY)
    
    # The binary image now has: white = background/territories, black = boundary lines
    # We want to find the white regions (territories)
    
    # Invert so that territories are white and boundaries are black
    # Actually, we need to find contours of the white regions
    # OpenCV findContours finds white objects on black background
    # So we should NOT invert - we want to find white regions
    
    # But first, let's clean up the image a bit
    # Close small gaps in boundary lines
    kernel = np.ones((3, 3), np.uint8)
    binary_cleaned = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel)
    
    # Find contours of all white regions
    # We use RETR_CCOMP to get hierarchy (parent-child relationships)
    contours, hierarchy = cv2.findContours(binary_cleaned, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)
    
    print(f"Found {len(contours)} contours total")
    
    if hierarchy is None:
        print("No hierarchy found")
        return None
    
    hierarchy = hierarchy[0]  # Get the actual hierarchy array
    
    # Filter contours to find territory regions
    # - Should have reasonable area (not too small, not too large)
    # - The largest contour is likely the outer boundary or background
    
    total_area = width * height
    min_area = total_area * 0.0005  # At least 0.05% of image
    max_area = total_area * 0.15    # At most 15% of image (single territory shouldn't be huge)
    
    regions = []
    congregation_boundary = None
    max_contour_area = 0
    
    for i, contour in enumerate(contours):
        area = cv2.contourArea(contour)
        
        # Skip tiny contours (noise)
        if area < min_area:
            continue
        
        # Check if this is an outer contour (no parent) or inner contour
        # hierarchy[i] = [next, previous, first_child, parent]
        parent = hierarchy[i][3]
        
        # Simplify the contour to reduce points
        epsilon = 0.001 * cv2.arcLength(contour, True)
        approx = cv2.approxPolyDP(contour, epsilon, True)
        
        # Convert contour to list of [x, y] points
        polygon = [[int(pt[0][0]), int(pt[0][1])] for pt in approx]
        
        # Skip if too few points
        if len(polygon) < 4:
            continue
        
        # Calculate centroid
        M = cv2.moments(contour)
        if M["m00"] != 0:
            cx = int(M["m10"] / M["m00"])
            cy = int(M["m01"] / M["m00"])
        else:
            cx, cy = polygon[0]
        
        # Track the largest contour as potential congregation boundary
        if area > max_contour_area:
            max_contour_area = area
            # Only consider as congregation boundary if it's really large
            if area > total_area * 0.3:  # More than 30% of image
                congregation_boundary = polygon
        
        # Add as territory region if within size bounds
        if area <= max_area:
            regions.append({
                "regionId": len(regions) + 1,
                "polygon": polygon,
                "centroid": [cx, cy],
                "area": float(area),
                "vertices": len(polygon)
            })
    
    print(f"Found {len(regions)} territory regions")
    
    # Sort regions by area (largest first, for easier manual assignment)
    regions.sort(key=lambda x: x["area"], reverse=True)
    
    # Re-number regions after sorting
    for i, region in enumerate(regions):
        region["regionId"] = i + 1
    
    # If we didn't find a congregation boundary from large contours,
    # try to find the outer boundary differently
    if congregation_boundary is None:
        print("Finding congregation boundary from outer edge...")
        # Find the contour with the largest perimeter that's also large area
        max_perimeter = 0
        for i, contour in enumerate(contours):
            area = cv2.contourArea(contour)
            perimeter = cv2.arcLength(contour, True)
            if area > total_area * 0.1 and perimeter > max_perimeter:
                max_perimeter = perimeter
                epsilon = 0.001 * perimeter
                approx = cv2.approxPolyDP(contour, epsilon, True)
                congregation_boundary = [[int(pt[0][0]), int(pt[0][1])] for pt in approx]
    
    # Create output data
    output = {
        "extractedRegions": regions,
        "congregationBoundary": congregation_boundary,
        "imageWidth": width,
        "imageHeight": height,
        "sourceImage": "Map/Real Boundary.png",
        "extractionDate": None  # Will be set when saved
    }
    
    return output


def save_extracted_data(data):
    """Save extracted boundary data to JSON file."""
    
    # Ensure data directory exists
    DATA_DIR.mkdir(exist_ok=True)
    
    # Add extraction timestamp
    from datetime import datetime
    data["extractionDate"] = datetime.now().isoformat()
    
    # Save to file
    output_path = DATA_DIR / "extracted_regions.json"
    with open(output_path, 'w') as f:
        json.dump(data, f, indent=2)
    
    print(f"Saved {len(data['extractedRegions'])} regions to {output_path}")
    
    # Print summary
    print("\n=== Extraction Summary ===")
    print(f"Total regions: {len(data['extractedRegions'])}")
    print(f"Image dimensions: {data['imageWidth']} x {data['imageHeight']}")
    print(f"Congregation boundary: {'Yes' if data['congregationBoundary'] else 'No'}")
    
    # Show area distribution
    areas = [r["area"] for r in data["extractedRegions"]]
    if areas:
        print(f"Region areas: min={min(areas):.0f}, max={max(areas):.0f}, avg={sum(areas)/len(areas):.0f}")


def visualize_extraction(data):
    """Create a visualization of the extracted boundaries."""
    
    # Load original image
    boundary_path = MAP_DIR / "Real Boundary.png"
    img = cv2.imread(str(boundary_path))
    
    # Create a colored overlay
    overlay = img.copy()
    
    # Draw each region with a random color
    np.random.seed(42)  # For consistent colors
    for region in data["extractedRegions"]:
        color = tuple(np.random.randint(50, 200, 3).tolist())
        pts = np.array(region["polygon"], np.int32).reshape((-1, 1, 2))
        cv2.fillPoly(overlay, [pts], color)
        
        # Draw region ID at centroid
        cx, cy = region["centroid"]
        cv2.putText(overlay, str(region["regionId"]), (cx-10, cy+5),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 0), 2)
    
    # Draw congregation boundary in red
    if data.get("congregationBoundary"):
        pts = np.array(data["congregationBoundary"], np.int32).reshape((-1, 1, 2))
        cv2.polylines(overlay, [pts], True, (0, 0, 255), 3)
    
    # Blend with original
    result = cv2.addWeighted(overlay, 0.5, img, 0.5, 0)
    
    # Save visualization
    viz_path = DATA_DIR / "extraction_visualization.png"
    cv2.imwrite(str(viz_path), result)
    print(f"Saved visualization to {viz_path}")


if __name__ == "__main__":
    print("=" * 50)
    print("Territory Boundary Extraction")
    print("=" * 50)
    
    # Extract boundaries
    data = extract_boundaries()
    
    if data:
        # Save to JSON
        save_extracted_data(data)
        
        # Create visualization
        visualize_extraction(data)
        
        print("\nExtraction complete!")
    else:
        print("\nExtraction failed!")
