# 🐓 GamFowl AI — Chicken Disease Detector

A mobile/desktop web app that uses **MobileNetV2 CNN** to detect early signs of chicken diseases from camera or uploaded images, then flags them to matching diseases. Fully dynamic — add any disease and feed it datasets.

---

## 📋 Prerequisites

Before you start, install these:

| Tool    | Version         | Download           |
| ------- | --------------- | ------------------ |
| Python  | 3.9 – 3.11      | https://python.org |
| Node.js | 18+             | https://nodejs.org |
| npm     | comes with Node | —                  |

> ⚠️ Python 3.12 may have TensorFlow compatibility issues. Use 3.10 or 3.11 for best results.

---

## 🚀 Step-by-Step Setup

### Step 1 — Unzip the project

Unzip `gamefowl-disease-detector.zip` to any folder, e.g.:

```
C:\Users\YourName\Desktop\gamefowl-disease-detector\
```

### Step 2 — Open VS Code

Open VS Code and select **File → Open Folder**, then select the unzipped folder.

### Step 3 — Install backend (Python/Flask)

Open a **Terminal** in VS Code (`Ctrl + \``), then run:

```bash
cd backend
python -m venv venv
```

**Windows:**

```bash
source venv/Scripts/activate
pip install -r requirements.txt
```

**Mac/Linux:**

```bash
source venv/bin/activate
pip install -r requirements.txt
```

> ⏳ This installs TensorFlow and takes 3–10 minutes depending on internet speed.

### Step 4 — Install frontend (React)

Open a **second terminal** tab in VS Code, then run:

```bash
cd frontend
npm install
```

> ⏳ This takes 1–3 minutes.

---

## ▶️ Running the App

You need **two terminals open** at the same time:

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
npm install

Start the app
npx expo start
```

---

## 🎯 How to Use the App

### Step 1 — Add a Disease (optional, 3 defaults included)

1. Go to the **Diseases** tab in the sidebar
2. Click **"Add Disease"**
3. Fill in: Name, Description, Severity, Color
4. Select affected body parts (eye, wing, etc.) — symptoms auto-fill
5. Add any custom symptoms
6. Click **"Save Disease"**

**Default diseases pre-loaded:**

- ✅ Infectious Coryza — watery/swollen eyes
- ✅ Fowl Pox — eye lesions, skin scabs
- ✅ Newcastle Disease — drooping wings, nervous signs
- ✅ Healthy — normal chicken baseline

### Step 2 — Upload Dataset Images

1. Go to the **Dataset** tab
2. Select a disease class from the list (e.g. "Infectious Coryza")
3. Drag & drop chicken photos or click to browse
4. Upload **at least 3 images per class** (50+ recommended for good accuracy)
5. Repeat for all disease classes including "Healthy"

**Image tips:**

- Clear, well-lit photos
- For eye diseases: close-up of the eye area
- For wing diseases: side view of the full wing
- Variety of angles and lighting conditions

### Step 3 — Train the Model

1. Go to the **Train Model** tab
2. Check that all classes show "ready" status
3. Click **"Start Training"**
4. Wait 2–10 minutes (depends on dataset size)
5. You'll see accuracy results when done

### Step 4 — Detect Diseases

1. Go to the **Detect** tab
2. Allow camera access when browser asks
3. Position the chicken in front of the camera
4. Click **"Capture"** — or use **"Upload Image"** for a saved photo
5. Click **"Analyze"**
6. The system shows:
   - 🔴 **Flagged Disease** with confidence %
   - 💊 **Detected Symptoms**
   - 📊 **All disease probabilities**

---

## 📁 Project Structure

```
gamefowl-disease-detector/
├── backend/
│   ├── app.py              # Flask API server
│   ├── model_trainer.py    # CNN training + inference
│   ├── requirements.txt    # Python dependencies
│   ├── diseases.json       # Disease config (auto-generated)
│   ├── datasets/           # Your uploaded training images
│   │   ├── infectious_coryza/
│   │   ├── fowl_pox/
│   │   ├── newcastle_disease/
│   │   └── healthy/
│   └── models/             # Trained model files (auto-generated)
│       ├── gamefowl_model.h5
│       └── labels.json
└── frontend/
    ├── src/
    │   ├── App.js          # Main router + sidebar
    │   ├── pages/
    │   │   ├── DetectPage.js   # Camera + detection UI
    │   │   ├── DiseasesPage.js # Add/manage diseases
    │   │   ├── DatasetPage.js  # Upload training images
    │   │   └── TrainPage.js    # Train model + log
    │   └── index.css       # Global dark theme
    └── package.json
```

---

## 🔧 API Endpoints (for reference)

| Method | Endpoint              | Description               |
| ------ | --------------------- | ------------------------- |
| GET    | `/api/diseases`       | List all diseases         |
| POST   | `/api/diseases`       | Add a new disease         |
| DELETE | `/api/diseases/:id`   | Delete a disease          |
| POST   | `/api/dataset/upload` | Upload training images    |
| GET    | `/api/dataset/stats`  | Image count per class     |
| POST   | `/api/train`          | Train the CNN model       |
| GET    | `/api/model/status`   | Check if model is trained |
| POST   | `/api/detect`         | Run detection on an image |

---

## ⚠️ Troubleshooting

**"Camera not available"** — Use Chrome or Firefox. Safari may block camera on localhost. Or use "Upload Image" instead.

**"Model not trained yet"** — Go to Train tab and train the model first.

**"Need at least 2 disease classes"** — Upload images to at least 2 disease folders before training.

**TensorFlow install fails** — Try `pip install tensorflow-cpu` instead (no GPU required).

**Port 5000 in use (Mac)** — Mac uses port 5000 for AirPlay. Change `port=5000` to `port=5001` in `backend/app.py` and update the proxy in `frontend/package.json`.

---

## 🎓 Research Context

Built for the study: _"Mobile-Based Early Detection System for Chicken Diseases in Gamefowl Farms in Davao City Using Digital Image Processing and Convolutional Neural Networks"_

Targets: **Infectious Coryza**, **Fowl Pox**, **Newcastle Disease**
Detection regions: **Eye area** (watery eyes, swelling, lesions) + **Wing posture** (drooping, asymmetry)
Model: **MobileNetV2** with fine-tuning (transfer learning from ImageNet)
