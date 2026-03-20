# FocusEDu 🎓

FocusEDu is an AI-powered learning platform designed to help users discover the best educational content tailored to their skill level. It seamlessly integrates YouTube and Udemy to provide personalized learning paths, while also offering powerful AI-driven career tools such as **ATS Resume Scoring** and **GitHub Profile Analysis**.

## 🌟 What Does This Project Do?

FocusEDu acts as a comprehensive portal for both learning and career preparation:

1. **AI-Powered Learning Suggestions**: Analyzes your skill level and interests to recommend YouTube videos and Udemy courses that fit your exact needs.
2. **ATS Resume Scorer**: A sophisticated tool that uses Machine Learning (TF-IDF + Random Forest) and NLP (spaCy & SentenceTransformers) to score your resume against a specific Job Description. It highlights missing keywords, formatting issues, and predicts rejection risk (especially tailored for IT roles).
3. **GitHub Profile Analysis**: Analyzes your GitHub profile to derive insights about your coding habits, tech stack preferences, and provides suggestions to improve your developer portfolio.
4. **Beautiful, Interactive UI**: Offers an engaging user experience with 3D elements (via React Three Fiber & Spline), beautiful animations, and dark-mode gradients designed using modern UI/UX principles.

## 🛠 Tech Stack

FocusEDu is built with a monorepo-style structure containing a modern frontend and a powerful Python backend.

### Frontend
- **Framework**: Next.js 16 (App Router), React 19
- **Styling**: Tailwind CSS, Framer Motion for animations
- **3D Graphics**: React Three Fiber, Drei, Spline
- **Authentication**: Firebase Auth
- **AI Integrations**: Langchain, Groq SDK (for fast LLM inference)
- **Other Tools**: Chart.js (Data Visualization), Lucide React (Icons), React Markdown

### Backend (Python Server)
- **Framework**: FastAPI, Uvicorn
- **Machine Learning & NLP**: scikit-learn, spaCy (`en_core_web_sm`), SentenceTransformers (`all-MiniLM-L6-v2`), NumPy, Joblib
- **Data Extraction**: pdfplumber (for parsing resumes)
- **Features**: Endpoints to dynamically evaluate and score resumes based on trained `.pkl` models.

## 🔑 Environment Variables Setup

To run this application properly and use its AI features, you **must** configure your environment variables. 

### 1. Defining the Frontend `.env` file

Navigate to the `app/` directory and create an `.env` file:

```bash
cd app
touch .env
```

Add your **Groq API Key** to this file to enable LangChain-powered functionalities:

```env
# app/.env
GROQ_API_KEY=your_groq_api_key_here
```

**Where to get your Groq API Key:**
1. Go to the [Groq Console](https://console.groq.com/keys)
2. Sign in or create a new account.
3. Click on **Create API Key**.
4. Copy the generated key and paste it into your `app/.env` file.

## ⚙️ Installation & Setup

### Prerequisites
- **Node.js** (v18+ recommended)
- **Bun** or **npm** (Bun recommended)
- **Python 3.9+** 

### Frontend Setup
From the root directory, install the required frontend dependencies:

```bash
bun install
# or npm install
```

### Python Backend Setup
The backend runs the ATS model via FastAPI. Open a new terminal and set it up:

```bash
# 1. Navigate to the Python server directory
cd python_server

# 2. Create a virtual environment
python -m venv venv

# 3. Activate the virtual environment
# Windows:
venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate

# 4. Install ML/NLP dependencies
pip install -r requirements.txt

# 5. Download the necessary spaCy English model
python -m spacy download en_core_web_sm
```

## 🚀 Running the Application

### 1. Start the Python Backend
Ensure your virtual environment is activated, then run the FastAPI server:

```bash
cd python_server
uvicorn ats_server:app --reload
```
The backend API server will start on `http://localhost:8000`.

### 2. Start the Next.js Frontend
Open a new terminal window, navigate to the root directory, and start the development server:

```bash
bun dev
# or npm run dev
```

Visit `http://localhost:3000` in your browser to view the application!
