"""
Quick Test Utility for Clucko Hybrid Vision API Gatekeeper
Usage: python test_hybrid_api.py [path_to_image]
"""
import sys
import os
from PIL import Image

# Automatically load .env file from backend directory if present
_env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.env')
if os.path.exists(_env_path):
    with open(_env_path, 'r', encoding='utf-8') as _f:
        for _line in _f:
            _line = _line.strip()
            if _line and not _line.startswith('#') and '=' in _line:
                _k, _v = _line.split('=', 1)
                os.environ.setdefault(_k.strip(), _v.strip())

from model_trainer import verify_gamefowl_via_api, evaluate_gamefowl_breed

def main():
    img_path = sys.argv[1] if len(sys.argv) > 1 else 'test_broiler_head.jpg'
    if not os.path.exists(img_path):
        print(f"File not found: {img_path}")
        return

    print(f"Testing Hybrid Vision Gatekeeper on: {img_path}")
    gemini_key = os.environ.get('GEMINI_API_KEY') or os.environ.get('GOOGLE_API_KEY')
    print(f"GEMINI_API_KEY status: {'Configured (' + gemini_key[:8] + '...)' if gemini_key else 'NOT CONFIGURED (Will use local fallback)'}")

    img = Image.open(img_path)
    api_res = verify_gamefowl_via_api(img, module='eye')
    print("\n--- Direct API Gatekeeper Output ---")
    if api_res:
        print(f"Is Chicken: {api_res.get('is_chicken')}")
        print(f"Is Gamefowl: {api_res.get('is_gamefowl')}")
        print(f"Confidence: {api_res.get('confidence')}%")
        print(f"Phenotype: {api_res.get('phenotype')}")
        print(f"Chicken Silhouette Box (Pic 1): {api_res.get('chicken_box')}")
        print(f"Already Cropped: {api_res.get('is_already_cropped')}")
        print(f"Target ROI Box (Pic 2/3): {api_res.get('roi_box')}")
    else:
        print("No API result (Check GEMINI_API_KEY or network)")

    print("\n--- Full evaluate_gamefowl_breed Output ---")
    overall = evaluate_gamefowl_breed(img, module='eye')
    print(f"Breed Name: {overall.get('breed_name')}")
    print(f"Is Gamefowl: {overall.get('is_gamefowl')}")
    print(f"Confidence: {overall.get('confidence')}%")
    print(f"Benchmark Dataset Match: {overall.get('is_benchmark_dataset', False)}")
    if overall.get('matched_file'):
        print(f"Matched Dataset File: {overall.get('matched_file')}")
    print(f"API Verified: {overall.get('api_verified', False)}")
    print(f"Phenotype: {overall.get('phenotype')}")

if __name__ == '__main__':
    main()
