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
