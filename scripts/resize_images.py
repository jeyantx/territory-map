#!/usr/bin/env python3
"""
Image Resize Script

Creates multiple resolution versions of the background map image
for responsive display on different devices.

Output sizes:
- background-mobile.png (800px width)
- background-tablet.png (1200px width)
- background-laptop.png (1920px width)
- background-full.png (original)
"""

import os
from pathlib import Path

try:
    from PIL import Image
    PIL_AVAILABLE = True
except ImportError:
    PIL_AVAILABLE = False

try:
    import cv2
    CV2_AVAILABLE = True
except ImportError:
    CV2_AVAILABLE = False

# Base directory
BASE_DIR = Path(__file__).parent.parent
MAP_DIR = BASE_DIR / "Map"
IMAGES_DIR = BASE_DIR / "images"

# Target sizes (width in pixels, height will be calculated to maintain aspect ratio)
TARGET_SIZES = {
    "mobile": 800,
    "tablet": 1200,
    "laptop": 2560,
    "desktop": 3840,
    "highres": 8000,
}


def resize_with_pillow(input_path, output_path, target_width):
    """Resize image using Pillow (PIL)."""
    with Image.open(input_path) as img:
        # Calculate new height maintaining aspect ratio
        aspect_ratio = img.height / img.width
        target_height = int(target_width * aspect_ratio)
        
        # Use high-quality downsampling
        resized = img.resize((target_width, target_height), Image.Resampling.LANCZOS)
        
        # Save with high quality
        if output_path.suffix.lower() == '.png':
            resized.save(output_path, 'PNG', optimize=False)
        else:
            resized.save(output_path, 'JPEG', quality=95)
        
        return target_width, target_height


def resize_with_opencv(input_path, output_path, target_width):
    """Resize image using OpenCV."""
    img = cv2.imread(str(input_path))
    
    if img is None:
        raise ValueError(f"Could not load image: {input_path}")
    
    # Calculate new height maintaining aspect ratio
    height, width = img.shape[:2]
    aspect_ratio = height / width
    target_height = int(target_width * aspect_ratio)
    
    # Use high-quality interpolation
    resized = cv2.resize(img, (target_width, target_height), interpolation=cv2.INTER_LANCZOS4)
    
    # Save
    cv2.imwrite(str(output_path), resized)
    
    return target_width, target_height


def copy_original(input_path, output_path):
    """Copy original file."""
    import shutil
    shutil.copy2(input_path, output_path)
    
    # Get dimensions
    if PIL_AVAILABLE:
        with Image.open(input_path) as img:
            return img.width, img.height
    elif CV2_AVAILABLE:
        img = cv2.imread(str(input_path))
        return img.shape[1], img.shape[0]
    else:
        return None, None


def main():
    """Main entry point."""
    print("=" * 60)
    print("Image Resize Script")
    print("=" * 60)
    
    # Check for available libraries
    if not PIL_AVAILABLE and not CV2_AVAILABLE:
        print("\nERROR: Neither Pillow nor OpenCV is installed.")
        print("Please install one of them:")
        print("  pip install Pillow")
        print("  pip install opencv-python")
        return 1
    
    resize_func = resize_with_pillow if PIL_AVAILABLE else resize_with_opencv
    print(f"\nUsing: {'Pillow' if PIL_AVAILABLE else 'OpenCV'}")
    
    # Process multiple input files
    targets = [
        {"input": "Background.png", "output_prefix": "background"},
        {"input": "Background Earth.png", "output_prefix": "background-earth"},
        {"input": "Only Boundary.png", "output_prefix": "boundary"},
    ]
    
    for target in targets:
        input_path = MAP_DIR / target["input"]
        if not input_path.exists():
            print(f"\nSkipping {target['input']}: File not found")
            continue
            
        print(f"\nProcessing: {input_path}")
        
        # Get original dimensions
        if PIL_AVAILABLE:
            with Image.open(input_path) as img:
                original_width, original_height = img.width, img.height
        else:
            img = cv2.imread(str(input_path))
            original_height, original_width = img.shape[:2]
        
        print(f"  Original size: {original_width}x{original_height}")
        
        # Process each target size
        for size_name, target_width in TARGET_SIZES.items():
            output_path = IMAGES_DIR / f"{target['output_prefix']}-{size_name}.png"
            
            # Skip if target is larger than original
            if target_width >= original_width:
                continue
            
            try:
                width, height = resize_func(input_path, output_path, target_width)
                file_size = output_path.stat().st_size / 1024 / 1024  # MB
                print(f"    {size_name}: {width}x{height} ({file_size:.2f} MB) -> {output_path.name}")
            except Exception as e:
                print(f"    {size_name}: ERROR - {e}")
        
        # Copy original
        output_full = IMAGES_DIR / f"{target['output_prefix']}-full.png"
        try:
            width, height = copy_original(input_path, output_full)
            file_size = output_full.stat().st_size / 1024 / 1024  # MB
            print(f"    full: {width}x{height} ({file_size:.2f} MB) -> {output_full.name}")
        except Exception as e:
            print(f"    full: ERROR - {e}")
    
    # Summary
    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    print(f"\nImages created in {IMAGES_DIR}")
    print("=" * 60)
    
    return 0


if __name__ == "__main__":
    exit(main())

