# 🐓 Clucko : A Mobile System for Early Detection of chicken Diseases using DIP/CNN in Gamefoul Farms in Davao City

Clucko aims to develop and implement a mobile-based early detection system for chicken diseases in gamefowl farms in Davao City using Digital Image Processing (DIP) and Convolutional Neural Networks (CNN).  The system will assist caretakers and owners in identifying early visual signs of illness, which will facilitate timely intervention and improve chicken health  management.

---

## ▶️ Running the App

You need **three terminals open** at the same time:

### Terminal 1 — Start the Backend

```bash
cd backend
python -m venv venv
source venv/Scripts/activate
pip install -r requirements.txt
python app.py
```

You should see:

```
 * Running on http://127.0.0.1:5000
 * Debug mode: on
```

### Terminal 2 — Start the Frontend

```bash
cd frontend
npm start
```

After ~30 seconds, your browser opens automatically at:
**http://localhost:3000**

### Terminal 3 — Start the clucko

```bash
Install dependencies
cd clucko
npm install

Start the app
npx expo start
```

## 🎓 Research Context

Built for the study: _"Mobile-Based Early Detection System for Chicken Diseases in Gamefowl Farms in Davao City Using Digital Image Processing and Convolutional Neural Networks"_

Targets: **Infectious Coryza**, **Fowl Pox**, **Newcastle Disease**
Detection regions: **Eye area** (watery eyes, swelling, lesions) + **Wing posture** (drooping, asymmetry)
Model: **MobileNetV2** with fine-tuning (transfer learning from ImageNet)
