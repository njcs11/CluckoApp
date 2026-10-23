"""
Test script to verify Dynamic Visible Symptom Detection on localhost.
"""
import os
import json
from PIL import Image
import model_trainer

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODELS_DIR = os.path.join(BASE_DIR, 'models')
DATASETS_DIR = os.path.join(BASE_DIR, 'datasets')

with open(os.path.join(BASE_DIR, 'diseases.json')) as f:
    diseases_config = json.load(f)

print("=" * 60)
print("TESTING DYNAMIC VISIBLE SYMPTOMS DETECTION ON LOCALHOST")
print("=" * 60)

# Test 1: Test with an Infectious Coryza image
coryza_dir = os.path.join(DATASETS_DIR, 'eye', 'infectious_coryza')
coryza_images = [f for f in os.listdir(coryza_dir) if f.lower().endswith(('.jpg', '.png', '.jpeg'))]

if coryza_images:
    sample_img_path = os.path.join(coryza_dir, coryza_images[0])
    print(f"\n[Test 1] Testing Infectious Coryza image: {coryza_images[0]}")
    img = Image.open(sample_img_path).convert('RGB')
    result = model_trainer.predict(img, MODELS_DIR, diseases_config, module='eye')
    
    print(f"  Flagged Disease : {result.get('flagged_disease')}")
    print(f"  Top Confidence  : {result.get('top_prediction', {}).get('confidence')}%")
    print("  Detected Symptoms:")
    for s in result.get('detected_symptoms', []):
        print(f"    - {s.get('label')} ({s.get('confidence')}%) [ID: {s.get('id')}]")
    print("  Dynamic Recommendations:")
    for r in result.get('recommendations', []):
        print(f"    * {r}")

# Test 2: Test with a Fowl Pox image
pox_dir = os.path.join(DATASETS_DIR, 'eye', 'fowl_pox')
pox_images = [f for f in os.listdir(pox_dir) if f.lower().endswith(('.jpg', '.png', '.jpeg'))]

if pox_images:
    sample_img_path = os.path.join(pox_dir, pox_images[0])
    print(f"\n[Test 2] Testing Fowl Pox image: {pox_images[0]}")
    img = Image.open(sample_img_path).convert('RGB')
    result = model_trainer.predict(img, MODELS_DIR, diseases_config, module='eye')
    
    print(f"  Flagged Disease : {result.get('flagged_disease')}")
    print(f"  Top Confidence  : {result.get('top_prediction', {}).get('confidence')}%")
    print("  Detected Symptoms:")
    for s in result.get('detected_symptoms', []):
        print(f"    - {s.get('label')} ({s.get('confidence')}%) [ID: {s.get('id')}]")

# Test 3: Test with a Healthy Eye image
healthy_dir = os.path.join(DATASETS_DIR, 'eye', 'healthy_eye')
healthy_images = [f for f in os.listdir(healthy_dir) if f.lower().endswith(('.jpg', '.png', '.jpeg'))]

if healthy_images:
    sample_img_path = os.path.join(healthy_dir, healthy_images[0])
    print(f"\n[Test 3] Testing Healthy Eye image: {healthy_images[0]}")
    img = Image.open(sample_img_path).convert('RGB')
    result = model_trainer.predict(img, MODELS_DIR, diseases_config, module='eye')
    
    print(f"  Flagged Disease : {result.get('flagged_disease')}")
    print(f"  Top Confidence  : {result.get('top_prediction', {}).get('confidence')}%")
    print("  Detected Symptoms:")
    for s in result.get('detected_symptoms', []):
        print(f"    - {s.get('label')} ({s.get('confidence')}%) [ID: {s.get('id')}]")

print("\n" + "=" * 60)
print("TEST COMPLETED SUCCESSFULLY!")
print("=" * 60)
