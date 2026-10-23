"""
Generate Annotations CSV Template for Gamefowl Disease & Symptom Detection
Scans datasets/eye and datasets/wing and creates easy-to-edit CSV templates.
"""
import os
import csv

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATASETS_DIR = os.path.join(BASE_DIR, 'datasets')

IMAGE_EXTS = ('.jpg', '.jpeg', '.png', '.bmp', '.webp', '.heic', '.heif', '.avif')

# Eye Module Symptoms
EYE_SYMPTOMS = [
    'swollen_eyes',
    'watery_eyes',
    'facial_swelling',
    'closed_swollen_eyes',
    'eye_lesions',
    'wart_like_nodules',
    'scabs',
    'yellow_bumps',
    'cloudy_eye',
    'normal_eye'
]

# Wing Module Symptoms
WING_SYMPTOMS = [
    'drooping_wings',
    'severe_droop',
    'wing_weakness',
    'asymmetrical_wings',
    'normal_posture'
]

def generate_eye_template():
    eye_dir = os.path.join(DATASETS_DIR, 'eye')
    if not os.path.exists(eye_dir):
        print(f"Directory {eye_dir} does not exist.")
        return

    output_csv = os.path.join(eye_dir, 'annotations.csv')
    template_csv = os.path.join(eye_dir, 'annotations_template.csv')
    
    rows = []
    headers = ['filename', 'disease_id'] + EYE_SYMPTOMS

    for disease_id in sorted(os.listdir(eye_dir)):
        disease_path = os.path.join(eye_dir, disease_id)
        if not os.path.isdir(disease_path):
            continue
        
        for fname in sorted(os.listdir(disease_path)):
            if not fname.lower().endswith(IMAGE_EXTS):
                continue
            
            # Initial baseline defaults based on disease class
            defaults = {sym: 0 for sym in EYE_SYMPTOMS}
            if disease_id == 'healthy_eye':
                defaults['normal_eye'] = 1
            elif disease_id == 'infectious_coryza':
                # Initial common default: swelling is present in most coryza images
                defaults['swollen_eyes'] = 1
                # You can edit in Excel: set 1 for watery_eyes, facial_swelling, etc. if visible
            elif disease_id == 'fowl_pox':
                # Initial common default: scabs/lesions
                defaults['eye_lesions'] = 1
                defaults['scabs'] = 1

            rel_path = f"{disease_id}/{fname}"
            row = [rel_path, disease_id] + [defaults[sym] for sym in EYE_SYMPTOMS]
            rows.append(row)

    for target_path in (template_csv, output_csv if not os.path.exists(output_csv) else None):
        if target_path:
            with open(target_path, 'w', newline='', encoding='utf-8') as f:
                writer = csv.writer(f)
                writer.writerow(headers)
                writer.writerows(rows)
            print(f"[SUCCESS] Created Eye annotations template at: {target_path} ({len(rows)} images)")

def generate_wing_template():
    wing_dir = os.path.join(DATASETS_DIR, 'wing')
    if not os.path.exists(wing_dir):
        print(f"Directory {wing_dir} does not exist.")
        return

    output_csv = os.path.join(wing_dir, 'annotations.csv')
    template_csv = os.path.join(wing_dir, 'annotations_template.csv')
    
    rows = []
    headers = ['filename', 'disease_id'] + WING_SYMPTOMS

    for disease_id in sorted(os.listdir(wing_dir)):
        disease_path = os.path.join(wing_dir, disease_id)
        if not os.path.isdir(disease_path):
            continue
        
        for fname in sorted(os.listdir(disease_path)):
            if not fname.lower().endswith(IMAGE_EXTS):
                continue
            
            defaults = {sym: 0 for sym in WING_SYMPTOMS}
            if disease_id == 'healthy_wing':
                defaults['normal_posture'] = 1
            elif disease_id in ('newcastle_disease', 'mareks_disease'):
                defaults['drooping_wings'] = 1

            rel_path = f"{disease_id}/{fname}"
            row = [rel_path, disease_id] + [defaults[sym] for sym in WING_SYMPTOMS]
            rows.append(row)

    for target_path in (template_csv, output_csv if not os.path.exists(output_csv) else None):
        if target_path:
            with open(target_path, 'w', newline='', encoding='utf-8') as f:
                writer = csv.writer(f)
                writer.writerow(headers)
                writer.writerows(rows)
            print(f"[SUCCESS] Created Wing annotations template at: {target_path} ({len(rows)} images)")

if __name__ == '__main__':
    generate_eye_template()
    generate_wing_template()
