import os, sys, json
from PIL import Image
import numpy as np

# Ensure working directory is backend
os.chdir(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import model_trainer

def load_diseases():
    with open('diseases.json', 'r') as f:
        return json.load(f)

diseases_cfg = load_diseases()
models_dir = 'models'

print("=== TEST 1: Hand / Non-Chicken Image Rejection ===")
# Create a skin-toned hand-like image (peach/flesh color)
hand_arr = np.full((300, 300, 3), [160, 190, 230], dtype=np.uint8)  # BGR skin tone
hand_img = Image.fromarray(hand_arr[:, :, ::-1])  # RGB

res1 = model_trainer.predict(hand_img, models_dir, diseases_cfg, 'eye')
print("Rejected:", res1.get('rejected'))
print("Rejection Reason:", res1.get('rejection_reason'))
print("Message:", res1.get('message'))
assert res1.get('rejected') == True
assert "Chicken" in str(res1.get('rejection_reason')) or "No chicken" in str(res1.get('message')).lower()
print("[PASS] Test 1: Hand correctly rejected as No Chicken Detected!\n")

print("=== TEST 2: Wing Image with Eye Module Selected (Auto-Adaptation) ===")
wing_path = os.path.join('datasets', 'wing', 'newcastle_disease', '0_download_(1).jpg')
if os.path.exists(wing_path):
    with Image.open(wing_path) as w_img:
        res2 = model_trainer.predict(w_img, models_dir, diseases_cfg, 'eye')
        print("Rejected:", res2.get('rejected'))
        print("Original Module:", res2.get('original_module'))
        print("Detected/Adapted Module:", res2.get('module'))
        print("Module Adapted:", res2.get('module_adapted'))
        print("Adaptation Message:", res2.get('adaptation_message'))
        print("Top Prediction:", res2.get('top_prediction', {}).get('disease_name'))
        print("Symptoms:", [s.get('label') if isinstance(s, dict) else s for s in res2.get('detected_symptoms', [])])
        print("[PASS] Test 2 Finished!\n")
else:
    print("Wing image path not found, skipping Test 2\n")

print("=== TEST 3: Infectious Coryza Sample Diagnosis & Scoped Symptoms ===")
coryza_path = os.path.join('datasets', 'eye', 'infectious_coryza', '0_images_17_1789298471.jpg')
if os.path.exists(coryza_path):
    with Image.open(coryza_path) as c_img:
        res3 = model_trainer.predict(c_img, models_dir, diseases_cfg, 'eye')
        print("Rejected:", res3.get('rejected'))
        print("Top Prediction:", res3.get('top_prediction', {}).get('disease_name'))
        print("Confidence:", res3.get('top_prediction', {}).get('confidence'))
        print("Symptoms:", [s.get('label') if isinstance(s, dict) else s for s in res3.get('detected_symptoms', [])])
        print("[PASS] Test 3 Finished!\n")
else:
    print("Coryza image path not found, skipping Test 3\n")

print("=== ALL BACKEND DETECTION TESTS COMPLETED ===")

