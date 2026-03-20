import re
import numpy as np
import joblib

def clean_text(text: str) -> str:
    text = re.sub(r'[^\x00-\x7F]+', ' ', text)
    text = re.sub(r'[\x80-\xFF]', ' ', text)
    text = re.sub(r'\s+', ' ', text).strip()
    return text.lower()

def extract_it_skills(text: str, all_it_skills: dict) -> list:
    found = []
    for skill in all_it_skills.keys():
        if re.search(r'\b' + skill.replace("+", r"\+") + r'\b', text, re.IGNORECASE):
            found.append(skill)
    return list(set(found))

def extract_years_experience(text: str) -> float:
    patterns = [
        r'(\d+)\+?\s*years?\s+of\s+experience',
        r'(\d+)\s*years?\s+(?:in|of)\s+',
    ]
    for pattern in patterns:
        matches = re.findall(pattern, text, re.IGNORECASE)
        if matches:
            return float(max(matches))
    return 0.0

def predict_rejection_risk(resume_text: str, model_data: dict) -> dict:
    rf_model = model_data['model']
    it_skills = model_data['it_skills']
    all_it_skills = model_data['all_it_skills']
    
    clean = clean_text(resume_text)
    found_skills = extract_it_skills(clean, all_it_skills)
    
    skill_counts = {cat: 0 for cat in it_skills.keys()}
    for skill in found_skills:
        if skill in all_it_skills:
            cat = all_it_skills[skill]
            skill_counts[cat] += 1
    
    years_exp = extract_years_experience(clean)
    word_count = len(clean.split())
    
    feature_vector = np.array([[
        len(found_skills),
        years_exp,
        word_count,
        *[skill_counts[cat] for cat in it_skills.keys()]
    ]])
    
    pred = int(rf_model.predict(feature_vector)[0])
    probs = rf_model.predict_proba(feature_vector)[0]
    confidence = float(probs.max())
    
    missing = {cat: [] for cat in it_skills.keys()}
    for cat, skills in it_skills.items():
        for skill in skills:
            if skill not in found_skills:
                missing[cat].append(skill)
    
    return {
        'rejection_risk': pred,
        'confidence': confidence,
        'skills_found': found_skills,
        'missing_skills': missing,
        'skill_counts': skill_counts,
        'years_experience': years_exp,
        'word_count': word_count,
        'total_skills_found': len(found_skills),
    }
