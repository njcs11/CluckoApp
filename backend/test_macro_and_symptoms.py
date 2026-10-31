import os, sys, json
from PIL import Image
import numpy as np

os.chdir(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import model_trainer

def load_diseases():
    with open('diseases.json', 'r') as f:
        return json.load(f)

diseases_cfg = load_diseases()
models_dir = 'models'

print("=== MACRO TEST 1: Macro Close-Up of Eye Passes Stage 1 Gatekeeper ===")
# Load actual eye dataset sample and crop tightly around eye (Macro crop)
eye_path = os.path.join('datasets', 'eye', 'infectious_coryza', '0_images_17_1789298471.jpg')
assert os.path.exists(eye_path), "Sample eye image not found"

with Image.open(eye_path) as full_im:
    w, h = full_im.size
    # Tight macro crop around eye
    macro_im = full_im.crop((int(w * 0.25), int(h * 0.25), int(w * 0.75), int(h * 0.75)))
    
    is_chicken, conf, reason = model_trainer._is_likely_chicken(macro_im)
    print("Macro Eye Is Chicken:", is_chicken)
    print("Reason:", reason)
    assert is_chicken == True, f"Failed: macro eye rejected with {reason}"
    print("[PASS] Macro Test 1 Passed: Macro eye successfully verified!\n")

print("=== MACRO TEST 2: Strict Symptom Scoping (No Fowl Pox scabs in Coryza) ===")
with Image.open(eye_path) as im:
    res = model_trainer.predict(im, models_dir, diseases_cfg, 'eye')
    print("Diagnosed Disease:", res.get('top_prediction', {}).get('disease_name'))
    symptom_labels = [s.get('label') if isinstance(s, dict) else s for s in res.get('detected_symptoms', [])]
    print("Detected Symptoms:", symptom_labels)
    assert "Dark Brown Scabs" not in symptom_labels, "Error: Dark Brown Scabs should not appear in Infectious Coryza"
    assert "Swollen Eyes" in symptom_labels or len(symptom_labels) > 0, "Expected Coryza symptoms"
    print("[PASS] Macro Test 2 Passed: Strict symptom scoping confirmed!\n")

print("=== MACRO TEST 3: Strict Non-Chicken Hand Rejection in Macro ===")
hand_macro = np.full((250, 250, 3), [150, 185, 225], dtype=np.uint8) # Hand flesh BGR
hand_im = Image.fromarray(hand_macro[:, :, ::-1])
is_hand_ch, hand_conf, hand_reason = model_trainer._is_likely_chicken(hand_im)
print("Hand Macro Is Chicken:", is_hand_ch)
print("Hand Rejection Reason:", hand_reason)
assert is_hand_ch == False, "Hand was falsely accepted"
print("[PASS] Macro Test 3 Passed: Hand correctly rejected!\n")

print("=== ALL MACRO & SCOPED SYMPTOMS TESTS PASSED CLEANLY ===")

