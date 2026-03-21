
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';

dotenv.config();

import Organization from '../models/Organization.js';
import Branch from '../models/Branch.js';
import User from '../models/User.js';
import Patient from '../models/Patient.js';
import PatientMedicalHistory from '../models/PatientMedicalHistory.js';
import MasterSymptom from '../models/MasterSymptom.js';
import MasterDiagnosis from '../models/MasterDiagnosis.js';
import MasterMedication from '../models/MasterMedication.js';
import MasterLabTest from '../models/MasterLabTest.js';
import MasterService from '../models/MasterService.js';
import MasterExaminationFinding from '../models/MasterExaminationFinding.js';
import MasterProcedure from '../models/MasterProcedure.js';
import MasterSalutation from '../models/MasterSalutation.js';
import PrintSettings from '../models/PrintSettings.js';
import Appointment from '../models/Appointment.js';
import Queue from '../models/Queue.js';
import Prescription from '../models/Prescription.js';
import Invoice from '../models/Invoice.js';
import Payment from '../models/Payment.js';
import Receipt from '../models/Receipt.js';
import DropdownOption from '../models/DropdownOption.js';
import PrescriptionConfig from '../models/PrescriptionConfig.js';
import PrescriptionTemplate from '../models/PrescriptionTemplate.js';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/emr-application';

// Fixed IDs matching auth middleware mock user
const ORG_ID = 'org-001';
const BRANCH_MUMBAI_ID = 'branch-001';
const BRANCH_PUNE_ID = 'branch-002';
const DOCTOR_ID = 'dev-doctor-001';
const RECEPTIONIST_ID = 'dev-receptionist-001';
const ADMIN_ID = 'dev-admin-001';

// Today's date for queue/appointments
const TODAY = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

async function seed() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    // Clear existing data
    await Promise.all([
      Organization.deleteMany({}),
      Branch.deleteMany({}),
      User.deleteMany({}),
      Patient.deleteMany({}),
      PatientMedicalHistory.deleteMany({}),
      MasterSymptom.deleteMany({}),
      MasterDiagnosis.deleteMany({}),
      MasterMedication.deleteMany({}),
      MasterLabTest.deleteMany({}),
      MasterService.deleteMany({}),
      MasterExaminationFinding.deleteMany({}),
      MasterProcedure.deleteMany({}),
      MasterSalutation.deleteMany({}),
      PrintSettings.deleteMany({}),
      Appointment.deleteMany({}),
      Queue.deleteMany({}),
      Prescription.deleteMany({}),
      Invoice.deleteMany({}),
      Payment.deleteMany({}),
      Receipt.deleteMany({}),
      DropdownOption.deleteMany({}),
      PrescriptionConfig.deleteMany({}),
      PrescriptionTemplate.deleteMany({}),
    ]);
    console.log('Cleared existing data');

    // 1. Organization
    await Organization.create({
      organizationId: ORG_ID,
      name: 'HealthFirst Clinic',
      timezone: 'Asia/Kolkata',
      address: {
        street: '123 Healthcare Avenue',
        city: 'Mumbai',
        state: 'Maharashtra',
        country: 'India',
        pincode: '400001',
      },
      phone: '+91-22-12345678',
      email: 'info@healthfirst.in',
    });
    console.log('Created organization');

    // 2. Branches
    await Branch.insertMany([
      {
        branchId: BRANCH_MUMBAI_ID,
        organizationId: ORG_ID,
        name: 'Mumbai Main',
        address: { street: '123 Healthcare Avenue', city: 'Mumbai', state: 'Maharashtra', country: 'India', pincode: '400001' },
        timezone: 'Asia/Kolkata',
      },
      {
        branchId: BRANCH_PUNE_ID,
        organizationId: ORG_ID,
        name: 'Pune Branch',
        address: { street: '456 Medical Lane', city: 'Pune', state: 'Maharashtra', country: 'India', pincode: '411001' },
        timezone: 'Asia/Kolkata',
      },
    ]);
    console.log('Created branches');

    // 3. Users
    await User.create({
      userId: DOCTOR_ID,
      organizationId: ORG_ID,
      branchId: BRANCH_MUMBAI_ID,
      email: 'doctor@healthfirst.in',
      passwordHash: 'doctor123',
      role: 'doctor',
      name: 'Dr. Arjun Mehta',
      qualifications: 'MBBS, MD (General Medicine)',
      registrationNumber: 'MH-12345',
      specialization: 'General Medicine',
    });

    await User.create({
      userId: RECEPTIONIST_ID,
      organizationId: ORG_ID,
      branchId: BRANCH_MUMBAI_ID,
      email: 'reception@healthfirst.in',
      passwordHash: 'reception123',
      role: 'receptionist',
      name: 'Priya Sharma',
    });

    await User.create({
      userId: ADMIN_ID,
      organizationId: ORG_ID,
      branchId: BRANCH_MUMBAI_ID,
      email: 'admin@healthfirst.in',
      passwordHash: 'admin123',
      role: 'admin',
      name: 'Admin User',
    });
    console.log('Created users');

    // 4. Master Symptoms (52)
    const symptoms = [
      { name: 'Headache', category: 'Neurological', icdMapping: 'R51' },
      { name: 'Fever', category: 'General', icdMapping: 'R50.9' },
      { name: 'Cough', category: 'Respiratory', icdMapping: 'R05' },
      { name: 'Chest Pain', category: 'Cardiovascular', icdMapping: 'R07.9' },
      { name: 'Nausea', category: 'Gastrointestinal', icdMapping: 'R11.0' },
      { name: 'Fatigue', category: 'General', icdMapping: 'R53.83' },
      { name: 'Dizziness', category: 'Neurological', icdMapping: 'R42' },
      { name: 'Shortness of Breath', category: 'Respiratory', icdMapping: 'R06.02' },
      { name: 'Back Pain', category: 'Musculoskeletal', icdMapping: 'M54.9' },
      { name: 'Abdominal Pain', category: 'Gastrointestinal', icdMapping: 'R10.9' },
      { name: 'Sore Throat', category: 'ENT', icdMapping: 'J02.9' },
      { name: 'Runny Nose', category: 'ENT', icdMapping: 'J00' },
      { name: 'Joint Pain', category: 'Musculoskeletal', icdMapping: 'M25.50' },
      { name: 'Vomiting', category: 'Gastrointestinal', icdMapping: 'R11.10' },
      { name: 'Diarrhea', category: 'Gastrointestinal', icdMapping: 'R19.7' },
      { name: 'Constipation', category: 'Gastrointestinal', icdMapping: 'K59.00' },
      { name: 'Muscle Pain', category: 'Musculoskeletal', icdMapping: 'M79.1' },
      { name: 'Skin Rash', category: 'Dermatological', icdMapping: 'R21' },
      { name: 'Itching', category: 'Dermatological', icdMapping: 'L29.9' },
      { name: 'Swelling', category: 'General', icdMapping: 'R60.9' },
      { name: 'Weight Loss', category: 'General', icdMapping: 'R63.4' },
      { name: 'Weight Gain', category: 'General', icdMapping: 'R63.5' },
      { name: 'Insomnia', category: 'Neurological', icdMapping: 'G47.00' },
      { name: 'Anxiety', category: 'Psychiatric', icdMapping: 'F41.9' },
      { name: 'Depression', category: 'Psychiatric', icdMapping: 'F32.9' },
      { name: 'Palpitations', category: 'Cardiovascular', icdMapping: 'R00.2' },
      { name: 'Blurred Vision', category: 'Ophthalmological', icdMapping: 'H53.8' },
      { name: 'Ear Pain', category: 'ENT', icdMapping: 'H92.09' },
      { name: 'Nasal Congestion', category: 'ENT', icdMapping: 'R09.81' },
      { name: 'Sneezing', category: 'ENT', icdMapping: 'R06.7' },
      { name: 'Loss of Appetite', category: 'Gastrointestinal', icdMapping: 'R63.0' },
      { name: 'Heartburn', category: 'Gastrointestinal', icdMapping: 'R12' },
      { name: 'Bloating', category: 'Gastrointestinal', icdMapping: 'R14.0' },
      { name: 'Urinary Frequency', category: 'Urological', icdMapping: 'R35.0' },
      { name: 'Burning Urination', category: 'Urological', icdMapping: 'R30.0' },
      { name: 'Night Sweats', category: 'General', icdMapping: 'R61' },
      { name: 'Chills', category: 'General', icdMapping: 'R68.83' },
      { name: 'Body Ache', category: 'General', icdMapping: 'M79.3' },
      { name: 'Neck Pain', category: 'Musculoskeletal', icdMapping: 'M54.2' },
      { name: 'Shoulder Pain', category: 'Musculoskeletal', icdMapping: 'M25.519' },
      { name: 'Knee Pain', category: 'Musculoskeletal', icdMapping: 'M25.569' },
      { name: 'Numbness', category: 'Neurological', icdMapping: 'R20.0' },
      { name: 'Tingling', category: 'Neurological', icdMapping: 'R20.2' },
      { name: 'Tremors', category: 'Neurological', icdMapping: 'R25.1' },
      { name: 'Wheezing', category: 'Respiratory', icdMapping: 'R06.2' },
      { name: 'Cold Hands/Feet', category: 'Cardiovascular', icdMapping: 'R20.8' },
      { name: 'Excessive Thirst', category: 'Endocrine', icdMapping: 'R63.1' },
      { name: 'Frequent Urination', category: 'Endocrine', icdMapping: 'R35.0' },
      { name: 'Dry Mouth', category: 'ENT', icdMapping: 'R68.2' },
      { name: 'Hair Loss', category: 'Dermatological', icdMapping: 'L65.9' },
      { name: 'Chest Tightness', category: 'Respiratory', icdMapping: 'R07.89' },
      { name: 'Leg Cramps', category: 'Musculoskeletal', icdMapping: 'R25.2' },
    ];
    await MasterSymptom.insertMany(symptoms);
    console.log(`Created ${symptoms.length} symptoms`);

    // 5. Master Diagnoses (51)
    const diagnoses = [
      { icdCode: 'J06.9', description: 'Acute upper respiratory infection, unspecified', category: 'Respiratory' },
      { icdCode: 'E11', description: 'Type 2 Diabetes Mellitus', category: 'Endocrine' },
      { icdCode: 'I10', description: 'Essential (Primary) Hypertension', category: 'Cardiovascular' },
      { icdCode: 'J18.9', description: 'Pneumonia, unspecified organism', category: 'Respiratory' },
      { icdCode: 'J45.9', description: 'Asthma, unspecified', category: 'Respiratory' },
      { icdCode: 'K21.0', description: 'Gastroesophageal Reflux Disease (GERD)', category: 'Gastrointestinal' },
      { icdCode: 'M54.5', description: 'Low Back Pain', category: 'Musculoskeletal' },
      { icdCode: 'G43.9', description: 'Migraine, unspecified', category: 'Neurological' },
      { icdCode: 'E78.5', description: 'Hyperlipidemia, unspecified', category: 'Endocrine' },
      { icdCode: 'E03.9', description: 'Hypothyroidism, unspecified', category: 'Endocrine' },
      { icdCode: 'J20.9', description: 'Acute Bronchitis, unspecified', category: 'Respiratory' },
      { icdCode: 'N39.0', description: 'Urinary Tract Infection, site not specified', category: 'Urological' },
      { icdCode: 'J30.9', description: 'Allergic Rhinitis, unspecified', category: 'ENT' },
      { icdCode: 'L30.9', description: 'Dermatitis, unspecified', category: 'Dermatological' },
      { icdCode: 'K29.7', description: 'Gastritis, unspecified', category: 'Gastrointestinal' },
      { icdCode: 'F41.1', description: 'Generalized Anxiety Disorder', category: 'Psychiatric' },
      { icdCode: 'F32.9', description: 'Major Depressive Disorder, single episode, unspecified', category: 'Psychiatric' },
      { icdCode: 'M06.9', description: 'Rheumatoid Arthritis, unspecified', category: 'Musculoskeletal' },
      { icdCode: 'M81.0', description: 'Age-related Osteoporosis without pathological fracture', category: 'Musculoskeletal' },
      { icdCode: 'E66.9', description: 'Obesity, unspecified', category: 'Endocrine' },
      { icdCode: 'B34.9', description: 'Viral Infection, unspecified', category: 'Infectious' },
      { icdCode: 'A09', description: 'Infectious Gastroenteritis and Colitis, unspecified', category: 'Gastrointestinal' },
      { icdCode: 'J02.9', description: 'Acute Pharyngitis, unspecified', category: 'ENT' },
      { icdCode: 'H10.9', description: 'Conjunctivitis, unspecified', category: 'Ophthalmological' },
      { icdCode: 'L50.9', description: 'Urticaria, unspecified', category: 'Dermatological' },
      { icdCode: 'R50.9', description: 'Fever, unspecified', category: 'General' },
      { icdCode: 'D50.9', description: 'Iron Deficiency Anemia, unspecified', category: 'Hematological' },
      { icdCode: 'E55.9', description: 'Vitamin D Deficiency, unspecified', category: 'Endocrine' },
      { icdCode: 'B37.0', description: 'Candidal Stomatitis (Oral Thrush)', category: 'Infectious' },
      { icdCode: 'K58.9', description: 'Irritable Bowel Syndrome (IBS)', category: 'Gastrointestinal' },
      { icdCode: 'G47.00', description: 'Insomnia, unspecified', category: 'Neurological' },
      { icdCode: 'J01.9', description: 'Acute Sinusitis, unspecified', category: 'ENT' },
      { icdCode: 'H66.9', description: 'Otitis Media, unspecified', category: 'ENT' },
      { icdCode: 'I25.10', description: 'Coronary Artery Disease', category: 'Cardiovascular' },
      { icdCode: 'I48.91', description: 'Atrial Fibrillation', category: 'Cardiovascular' },
      { icdCode: 'I50.9', description: 'Heart Failure, unspecified', category: 'Cardiovascular' },
      { icdCode: 'J44.1', description: 'Chronic Obstructive Pulmonary Disease (COPD)', category: 'Respiratory' },
      { icdCode: 'M17.9', description: 'Osteoarthritis of Knee', category: 'Musculoskeletal' },
      { icdCode: 'M79.3', description: 'Panniculitis, unspecified / Fibromyalgia', category: 'Musculoskeletal' },
      { icdCode: 'E04.9', description: 'Nontoxic Goiter, unspecified', category: 'Endocrine' },
      { icdCode: 'N18.9', description: 'Chronic Kidney Disease, unspecified', category: 'Urological' },
      { icdCode: 'K80.20', description: 'Cholelithiasis (Gallstones)', category: 'Gastrointestinal' },
      { icdCode: 'E10', description: 'Type 1 Diabetes Mellitus', category: 'Endocrine' },
      { icdCode: 'B01.9', description: 'Varicella (Chickenpox)', category: 'Infectious' },
      { icdCode: 'A15.0', description: 'Tuberculosis of Lung', category: 'Infectious' },
      { icdCode: 'B50.9', description: 'Plasmodium falciparum Malaria', category: 'Infectious' },
      { icdCode: 'A01.0', description: 'Typhoid Fever', category: 'Infectious' },
      { icdCode: 'A90', description: 'Dengue Fever', category: 'Infectious' },
      { icdCode: 'B15.9', description: 'Hepatitis A without hepatic coma', category: 'Infectious' },
      { icdCode: 'M10.9', description: 'Gout, unspecified', category: 'Musculoskeletal' },
      { icdCode: 'L40.9', description: 'Psoriasis, unspecified', category: 'Dermatological' },
    ];
    await MasterDiagnosis.insertMany(diagnoses);
    console.log(`Created ${diagnoses.length} diagnoses`);

    // 6. Master Medications (52)
    const medications = [
      { brandName: 'Crocin', genericName: 'Paracetamol', form: 'Tablet', strength: '500mg', manufacturer: 'GSK' },
      { brandName: 'Dolo', genericName: 'Paracetamol', form: 'Tablet', strength: '650mg', manufacturer: 'Micro Labs' },
      { brandName: 'Mox', genericName: 'Amoxicillin', form: 'Capsule', strength: '500mg', manufacturer: 'Ranbaxy' },
      { brandName: 'Augmentin', genericName: 'Amoxicillin + Clavulanic Acid', form: 'Tablet', strength: '625mg', manufacturer: 'GSK' },
      { brandName: 'Azithral', genericName: 'Azithromycin', form: 'Tablet', strength: '500mg', manufacturer: 'Alembic' },
      { brandName: 'Cifran', genericName: 'Ciprofloxacin', form: 'Tablet', strength: '500mg', manufacturer: 'Ranbaxy' },
      { brandName: 'Glycomet', genericName: 'Metformin', form: 'Tablet', strength: '500mg', manufacturer: 'USV' },
      { brandName: 'Amlong', genericName: 'Amlodipine', form: 'Tablet', strength: '5mg', manufacturer: 'Micro Labs' },
      { brandName: 'Telma', genericName: 'Telmisartan', form: 'Tablet', strength: '40mg', manufacturer: 'Glenmark' },
      { brandName: 'Aten', genericName: 'Atenolol', form: 'Tablet', strength: '50mg', manufacturer: 'Zydus' },
      { brandName: 'Pan', genericName: 'Pantoprazole', form: 'Tablet', strength: '40mg', manufacturer: 'Alkem' },
      { brandName: 'Rantac', genericName: 'Ranitidine', form: 'Tablet', strength: '150mg', manufacturer: 'JB Chemicals' },
      { brandName: 'Emeset', genericName: 'Ondansetron', form: 'Tablet', strength: '4mg', manufacturer: 'Cipla' },
      { brandName: 'Allegra', genericName: 'Fexofenadine', form: 'Tablet', strength: '120mg', manufacturer: 'Sanofi' },
      { brandName: 'Cetrizine', genericName: 'Cetirizine', form: 'Tablet', strength: '10mg', manufacturer: 'Various' },
      { brandName: 'Montair', genericName: 'Montelukast', form: 'Tablet', strength: '10mg', manufacturer: 'Cipla' },
      { brandName: 'Asthalin', genericName: 'Salbutamol', form: 'Inhaler', strength: '100mcg', manufacturer: 'Cipla' },
      { brandName: 'Budecort', genericName: 'Budesonide', form: 'Inhaler', strength: '200mcg', manufacturer: 'Cipla' },
      { brandName: 'Thyronorm', genericName: 'Levothyroxine', form: 'Tablet', strength: '50mcg', manufacturer: 'Abbott' },
      { brandName: 'Ecosprin', genericName: 'Aspirin', form: 'Tablet', strength: '75mg', manufacturer: 'USV' },
      { brandName: 'Clopitab', genericName: 'Clopidogrel', form: 'Tablet', strength: '75mg', manufacturer: 'Lupin' },
      { brandName: 'Atorva', genericName: 'Atorvastatin', form: 'Tablet', strength: '10mg', manufacturer: 'Zydus' },
      { brandName: 'Rozavel', genericName: 'Rosuvastatin', form: 'Tablet', strength: '10mg', manufacturer: 'Sun Pharma' },
      { brandName: 'Combiflam', genericName: 'Ibuprofen + Paracetamol', form: 'Tablet', strength: '400mg+325mg', manufacturer: 'Sanofi' },
      { brandName: 'Voveran', genericName: 'Diclofenac', form: 'Tablet', strength: '50mg', manufacturer: 'Novartis' },
      { brandName: 'Brufen', genericName: 'Ibuprofen', form: 'Tablet', strength: '400mg', manufacturer: 'Abbott' },
      { brandName: 'Shelcal', genericName: 'Calcium + Vitamin D3', form: 'Tablet', strength: '500mg+250IU', manufacturer: 'Torrent' },
      { brandName: 'Becosules', genericName: 'Multivitamin B Complex', form: 'Capsule', strength: 'Various', manufacturer: 'Pfizer' },
      { brandName: 'Zincovit', genericName: 'Multivitamin + Zinc', form: 'Tablet', strength: 'Various', manufacturer: 'Apex' },
      { brandName: 'Oflomac', genericName: 'Ofloxacin', form: 'Tablet', strength: '200mg', manufacturer: 'Macleods' },
      { brandName: 'Metrogyl', genericName: 'Metronidazole', form: 'Tablet', strength: '400mg', manufacturer: 'JB Chemicals' },
      { brandName: 'Norflox', genericName: 'Norfloxacin', form: 'Tablet', strength: '400mg', manufacturer: 'Cipla' },
      { brandName: 'Deriphyllin', genericName: 'Theophylline + Etofylline', form: 'Tablet', strength: '150mg', manufacturer: 'Abbott' },
      { brandName: 'Benadryl', genericName: 'Diphenhydramine', form: 'Syrup', strength: '14mg/5ml', manufacturer: 'Johnson & Johnson' },
      { brandName: 'Grilinctus', genericName: 'Dextromethorphan + Phenylephrine', form: 'Syrup', strength: 'Various', manufacturer: 'Franco-Indian' },
      { brandName: 'Ascoril', genericName: 'Levosalbutamol + Ambroxol + Guaifenesin', form: 'Syrup', strength: 'Various', manufacturer: 'Glenmark' },
      { brandName: 'ORS', genericName: 'Oral Rehydration Salts', form: 'Powder', strength: 'Standard', manufacturer: 'Various' },
      { brandName: 'Dulcoflex', genericName: 'Bisacodyl', form: 'Tablet', strength: '5mg', manufacturer: 'Boehringer' },
      { brandName: 'Cremaffin', genericName: 'Liquid Paraffin + Milk of Magnesia', form: 'Syrup', strength: 'Various', manufacturer: 'Abbott' },
      { brandName: 'Losar', genericName: 'Losartan', form: 'Tablet', strength: '50mg', manufacturer: 'Unichem' },
      { brandName: 'Envas', genericName: 'Enalapril', form: 'Tablet', strength: '5mg', manufacturer: 'Cadila' },
      { brandName: 'Metolar', genericName: 'Metoprolol', form: 'Tablet', strength: '25mg', manufacturer: 'Cipla' },
      { brandName: 'Diamicron', genericName: 'Gliclazide', form: 'Tablet', strength: '80mg', manufacturer: 'Servier' },
      { brandName: 'Januvia', genericName: 'Sitagliptin', form: 'Tablet', strength: '100mg', manufacturer: 'MSD' },
      { brandName: 'Galvus', genericName: 'Vildagliptin', form: 'Tablet', strength: '50mg', manufacturer: 'Novartis' },
      { brandName: 'Amaryl', genericName: 'Glimepiride', form: 'Tablet', strength: '1mg', manufacturer: 'Sanofi' },
      { brandName: 'Volini', genericName: 'Diclofenac Gel', form: 'Gel', strength: '1%', manufacturer: 'Ranbaxy' },
      { brandName: 'Betadine', genericName: 'Povidone-Iodine', form: 'Solution', strength: '5%', manufacturer: 'Win-Medicare' },
      { brandName: 'Candid-B', genericName: 'Clotrimazole + Beclomethasone', form: 'Cream', strength: '1%+0.025%', manufacturer: 'Glenmark' },
      { brandName: 'T-Bact', genericName: 'Mupirocin', form: 'Ointment', strength: '2%', manufacturer: 'GSK' },
      { brandName: 'Sumatriptan', genericName: 'Sumatriptan', form: 'Tablet', strength: '50mg', manufacturer: 'Various' },
      { brandName: 'Cilacar', genericName: 'Cilnidipine', form: 'Tablet', strength: '10mg', manufacturer: 'JB Chemicals' },
    ];
    await MasterMedication.insertMany(medications);
    console.log(`Created ${medications.length} medications`);

    // 7. Master Lab Tests (36)
    const labTests = [
      { name: 'Complete Blood Count (CBC)', category: 'Hematology', normalRange: 'Various', unit: 'Various' },
      { name: 'Hemoglobin (Hb)', category: 'Hematology', normalRange: '12-17 g/dL', unit: 'g/dL' },
      { name: 'Platelet Count', category: 'Hematology', normalRange: '150000-400000', unit: '/mcL' },
      { name: 'ESR (Erythrocyte Sedimentation Rate)', category: 'Hematology', normalRange: '0-20', unit: 'mm/hr' },
      { name: 'Random Blood Sugar (RBS)', category: 'Biochemistry', normalRange: '70-140', unit: 'mg/dL' },
      { name: 'Fasting Blood Sugar (FBS)', category: 'Biochemistry', normalRange: '70-100', unit: 'mg/dL' },
      { name: 'Post-Prandial Blood Sugar (PPBS)', category: 'Biochemistry', normalRange: '<140', unit: 'mg/dL' },
      { name: 'HbA1c (Glycated Hemoglobin)', category: 'Biochemistry', normalRange: '<5.7%', unit: '%' },
      { name: 'Liver Function Test (LFT)', category: 'Biochemistry', normalRange: 'Various', unit: 'Various' },
      { name: 'Renal Function Test (RFT)', category: 'Biochemistry', normalRange: 'Various', unit: 'Various' },
      { name: 'Serum Creatinine', category: 'Biochemistry', normalRange: '0.7-1.3', unit: 'mg/dL' },
      { name: 'Blood Urea Nitrogen (BUN)', category: 'Biochemistry', normalRange: '7-20', unit: 'mg/dL' },
      { name: 'Lipid Profile', category: 'Biochemistry', normalRange: 'Various', unit: 'Various' },
      { name: 'Total Cholesterol', category: 'Biochemistry', normalRange: '<200', unit: 'mg/dL' },
      { name: 'HDL Cholesterol', category: 'Biochemistry', normalRange: '>40', unit: 'mg/dL' },
      { name: 'LDL Cholesterol', category: 'Biochemistry', normalRange: '<100', unit: 'mg/dL' },
      { name: 'Triglycerides', category: 'Biochemistry', normalRange: '<150', unit: 'mg/dL' },
      { name: 'TSH (Thyroid Stimulating Hormone)', category: 'Endocrine', normalRange: '0.4-4.0', unit: 'mIU/L' },
      { name: 'Free T3', category: 'Endocrine', normalRange: '2.3-4.2', unit: 'pg/mL' },
      { name: 'Free T4', category: 'Endocrine', normalRange: '0.8-1.8', unit: 'ng/dL' },
      { name: 'Urine Routine & Microscopy', category: 'Pathology', normalRange: 'Various', unit: 'Various' },
      { name: 'Urine Culture & Sensitivity', category: 'Microbiology', normalRange: 'No growth', unit: 'CFU/mL' },
      { name: 'Blood Culture & Sensitivity', category: 'Microbiology', normalRange: 'No growth', unit: 'N/A' },
      { name: 'Chest X-Ray (PA View)', category: 'Radiology', normalRange: 'Normal', unit: 'N/A' },
      { name: 'ECG (Electrocardiogram)', category: 'Cardiology', normalRange: 'Normal sinus rhythm', unit: 'N/A' },
      { name: 'Echocardiography (2D Echo)', category: 'Cardiology', normalRange: 'EF >55%', unit: '%' },
      { name: 'Serum Uric Acid', category: 'Biochemistry', normalRange: '3.5-7.2', unit: 'mg/dL' },
      { name: 'Vitamin D (25-OH)', category: 'Biochemistry', normalRange: '30-100', unit: 'ng/mL' },
      { name: 'Vitamin B12', category: 'Biochemistry', normalRange: '200-900', unit: 'pg/mL' },
      { name: 'Serum Iron', category: 'Biochemistry', normalRange: '60-170', unit: 'mcg/dL' },
      { name: 'Ferritin', category: 'Biochemistry', normalRange: '20-500', unit: 'ng/mL' },
      { name: 'CRP (C-Reactive Protein)', category: 'Immunology', normalRange: '<10', unit: 'mg/L' },
      { name: 'Widal Test', category: 'Microbiology', normalRange: 'Negative', unit: 'N/A' },
      { name: 'Dengue NS1 Antigen', category: 'Microbiology', normalRange: 'Negative', unit: 'N/A' },
      { name: 'Malarial Parasite (MP) Smear', category: 'Pathology', normalRange: 'Negative', unit: 'N/A' },
      { name: 'Prothrombin Time (PT/INR)', category: 'Hematology', normalRange: '11-13.5 sec / INR 0.8-1.1', unit: 'sec' },
    ];
    await MasterLabTest.insertMany(labTests);
    console.log(`Created ${labTests.length} lab tests`);

    // 8. Master Services (12)
    const services = [
      { organizationId: ORG_ID, name: 'General Consultation', category: 'Consultation', defaultPrice: 500 },
      { organizationId: ORG_ID, name: 'Follow Up Consultation', category: 'Consultation', defaultPrice: 300 },
      { organizationId: ORG_ID, name: 'Emergency Consultation', category: 'Consultation', defaultPrice: 1000 },
      { organizationId: ORG_ID, name: 'Specialist Consultation', category: 'Consultation', defaultPrice: 800 },
      { organizationId: ORG_ID, name: 'Lab Work', category: 'Diagnostics', defaultPrice: 200 },
      { organizationId: ORG_ID, name: 'ECG', category: 'Diagnostics', defaultPrice: 300 },
      { organizationId: ORG_ID, name: 'Wound Dressing', category: 'Procedure', defaultPrice: 250 },
      { organizationId: ORG_ID, name: 'Nebulization', category: 'Procedure', defaultPrice: 200 },
      { organizationId: ORG_ID, name: 'Injection Administration', category: 'Procedure', defaultPrice: 100 },
      { organizationId: ORG_ID, name: 'Blood Pressure Check', category: 'Screening', defaultPrice: 0 },
      { organizationId: ORG_ID, name: 'Blood Sugar Test', category: 'Screening', defaultPrice: 50 },
      { organizationId: ORG_ID, name: 'Health Check-up Package', category: 'Package', defaultPrice: 2000 },
    ];
    await MasterService.insertMany(services);
    console.log(`Created ${services.length} services`);

    // 9. Examination Findings (24)
    const findings = [
      { name: 'Heart sounds normal, no murmur', category: 'Cardiovascular' },
      { name: 'Lungs clear bilaterally', category: 'Respiratory' },
      { name: 'Abdomen soft, non-tender', category: 'Gastrointestinal' },
      { name: 'No lymphadenopathy', category: 'General' },
      { name: 'Throat congested', category: 'ENT' },
      { name: 'Tonsils enlarged', category: 'ENT' },
      { name: 'Bilateral air entry equal', category: 'Respiratory' },
      { name: 'Rhonchi present', category: 'Respiratory' },
      { name: 'Crepitations present', category: 'Respiratory' },
      { name: 'Tenderness in right iliac fossa', category: 'Gastrointestinal' },
      { name: 'Tenderness in epigastric region', category: 'Gastrointestinal' },
      { name: 'Pedal edema present', category: 'Cardiovascular' },
      { name: 'JVP not raised', category: 'Cardiovascular' },
      { name: 'Pupils equal and reactive', category: 'Neurological' },
      { name: 'Reflexes normal', category: 'Neurological' },
      { name: 'Pallor present', category: 'General' },
      { name: 'Icterus present', category: 'General' },
      { name: 'Cyanosis absent', category: 'General' },
      { name: 'Clubbing absent', category: 'General' },
      { name: 'Skin warm and dry', category: 'Dermatological' },
      { name: 'No visible deformity', category: 'Musculoskeletal' },
      { name: 'Range of motion restricted', category: 'Musculoskeletal' },
      { name: 'Swelling noted over affected joint', category: 'Musculoskeletal' },
      { name: 'Tympanic membrane intact', category: 'ENT' },
    ];
    await MasterExaminationFinding.insertMany(findings);
    console.log(`Created ${findings.length} examination findings`);

    // 10. Master Procedures (15)
    const procedures = [
      { name: 'Wound Dressing', category: 'Minor' },
      { name: 'ECG Recording', category: 'Diagnostic' },
      { name: 'Nebulization', category: 'Therapeutic' },
      { name: 'Suturing', category: 'Minor Surgery' },
      { name: 'Incision & Drainage', category: 'Minor Surgery' },
      { name: 'Foreign Body Removal (Eye)', category: 'Minor' },
      { name: 'Foreign Body Removal (Ear)', category: 'Minor' },
      { name: 'Ear Syringing', category: 'Minor' },
      { name: 'Catheterization', category: 'Procedure' },
      { name: 'IM Injection', category: 'Administration' },
      { name: 'IV Injection', category: 'Administration' },
      { name: 'IV Cannulation', category: 'Procedure' },
      { name: 'Blood Sample Collection', category: 'Diagnostic' },
      { name: 'Splinting', category: 'Orthopedic' },
      { name: 'Plaster Cast Application', category: 'Orthopedic' },
    ];
    await MasterProcedure.insertMany(procedures);
    console.log(`Created ${procedures.length} procedures`);

    // 11. Salutations
    const salutations = [
      { label: 'Mr' },
      { label: 'Mrs' },
      { label: 'Ms' },
      { label: 'Dr' },
      { label: 'Master' },
      { label: 'Baby' },
    ];
    await MasterSalutation.insertMany(salutations);
    console.log(`Created ${salutations.length} salutations`);

    // 12. Sample Patients (25 with realistic Indian names)
    const patientIds = Array.from({ length: 25 }, () => uuidv4());
    const patients = [
      { patientId: patientIds[0], uhid: 'UHID00001', organizationId: ORG_ID, branchId: BRANCH_MUMBAI_ID, salutation: 'Mr', name: 'Ramesh Kumar', gender: 'M', dateOfBirth: new Date('1975-03-15'), age: 50, phone: '9876543210', email: 'ramesh.kumar@email.com', address: { street: '10 MG Road', city: 'Mumbai', state: 'Maharashtra', country: 'India', pincode: '400001' }, bloodGroup: 'B+', createdBy: RECEPTIONIST_ID },
      { patientId: patientIds[1], uhid: 'UHID00002', organizationId: ORG_ID, branchId: BRANCH_MUMBAI_ID, salutation: 'Mrs', name: 'Sunita Devi', gender: 'F', dateOfBirth: new Date('1985-08-22'), age: 40, phone: '9876543211', email: 'sunita.devi@email.com', address: { street: '25 Station Road', city: 'Mumbai', state: 'Maharashtra', country: 'India', pincode: '400002' }, bloodGroup: 'O+', createdBy: RECEPTIONIST_ID },
      { patientId: patientIds[2], uhid: 'UHID00003', organizationId: ORG_ID, branchId: BRANCH_MUMBAI_ID, salutation: 'Mr', name: 'Vikram Singh', gender: 'M', dateOfBirth: new Date('1990-01-10'), age: 36, phone: '9876543212', address: { street: '5 Hill Road', city: 'Mumbai', state: 'Maharashtra', country: 'India', pincode: '400050' }, bloodGroup: 'A+', createdBy: RECEPTIONIST_ID },
      { patientId: patientIds[3], uhid: 'UHID00004', organizationId: ORG_ID, branchId: BRANCH_MUMBAI_ID, salutation: 'Ms', name: 'Anjali Patel', gender: 'F', dateOfBirth: new Date('1995-12-05'), age: 30, phone: '9876543213', email: 'anjali.patel@email.com', address: { street: '14 FC Road', city: 'Mumbai', state: 'Maharashtra', country: 'India', pincode: '400003' }, bloodGroup: 'AB+', createdBy: RECEPTIONIST_ID },
      { patientId: patientIds[4], uhid: 'UHID00005', organizationId: ORG_ID, branchId: BRANCH_MUMBAI_ID, salutation: 'Mr', name: 'Rajesh Sharma', gender: 'M', dateOfBirth: new Date('1968-06-18'), age: 57, phone: '9876543214', address: { street: '30 Karve Road', city: 'Mumbai', state: 'Maharashtra', country: 'India', pincode: '400004' }, bloodGroup: 'O-', tags: ['VIP'], createdBy: RECEPTIONIST_ID },
      { patientId: patientIds[5], uhid: 'UHID00006', organizationId: ORG_ID, branchId: BRANCH_MUMBAI_ID, salutation: 'Mrs', name: 'Meena Gupta', gender: 'F', dateOfBirth: new Date('1982-04-12'), age: 43, phone: '9876543215', email: 'meena.gupta@email.com', address: { street: '8 Linking Road', city: 'Mumbai', state: 'Maharashtra', country: 'India', pincode: '400054' }, bloodGroup: 'A-', createdBy: RECEPTIONIST_ID },
      { patientId: patientIds[6], uhid: 'UHID00007', organizationId: ORG_ID, branchId: BRANCH_MUMBAI_ID, salutation: 'Mr', name: 'Anil Deshmukh', gender: 'M', dateOfBirth: new Date('1978-09-25'), age: 47, phone: '9876543216', address: { street: '22 Pali Hill', city: 'Mumbai', state: 'Maharashtra', country: 'India', pincode: '400050' }, bloodGroup: 'B-', createdBy: RECEPTIONIST_ID },
      { patientId: patientIds[7], uhid: 'UHID00008', organizationId: ORG_ID, branchId: BRANCH_MUMBAI_ID, salutation: 'Ms', name: 'Pooja Verma', gender: 'F', dateOfBirth: new Date('1998-02-14'), age: 28, phone: '9876543217', email: 'pooja.verma@email.com', address: { street: '3 Turner Road', city: 'Mumbai', state: 'Maharashtra', country: 'India', pincode: '400050' }, bloodGroup: 'O+', createdBy: RECEPTIONIST_ID },
      { patientId: patientIds[8], uhid: 'UHID00009', organizationId: ORG_ID, branchId: BRANCH_MUMBAI_ID, salutation: 'Mr', name: 'Suresh Joshi', gender: 'M', dateOfBirth: new Date('1960-11-30'), age: 65, phone: '9876543218', address: { street: '45 Peddar Road', city: 'Mumbai', state: 'Maharashtra', country: 'India', pincode: '400026' }, bloodGroup: 'AB-', tags: ['VIP', 'Diabetic'], createdBy: RECEPTIONIST_ID },
      { patientId: patientIds[9], uhid: 'UHID00010', organizationId: ORG_ID, branchId: BRANCH_MUMBAI_ID, salutation: 'Mrs', name: 'Kavita Nair', gender: 'F', dateOfBirth: new Date('1988-07-08'), age: 37, phone: '9876543219', email: 'kavita.nair@email.com', address: { street: '12 Juhu Tara Road', city: 'Mumbai', state: 'Maharashtra', country: 'India', pincode: '400049' }, bloodGroup: 'A+', createdBy: RECEPTIONIST_ID },
      { patientId: patientIds[10], uhid: 'UHID00011', organizationId: ORG_ID, branchId: BRANCH_MUMBAI_ID, salutation: 'Mr', name: 'Deepak Mishra', gender: 'M', dateOfBirth: new Date('1972-05-20'), age: 53, phone: '9876543220', address: { street: '18 Colaba Causeway', city: 'Mumbai', state: 'Maharashtra', country: 'India', pincode: '400005' }, bloodGroup: 'B+', createdBy: RECEPTIONIST_ID },
      { patientId: patientIds[11], uhid: 'UHID00012', organizationId: ORG_ID, branchId: BRANCH_MUMBAI_ID, salutation: 'Ms', name: 'Shreya Kulkarni', gender: 'F', dateOfBirth: new Date('2000-03-28'), age: 25, phone: '9876543221', email: 'shreya.k@email.com', address: { street: '7 Worli Sea Face', city: 'Mumbai', state: 'Maharashtra', country: 'India', pincode: '400018' }, bloodGroup: 'O+', createdBy: RECEPTIONIST_ID },
      { patientId: patientIds[12], uhid: 'UHID00013', organizationId: ORG_ID, branchId: BRANCH_MUMBAI_ID, salutation: 'Mr', name: 'Manoj Tiwari', gender: 'M', dateOfBirth: new Date('1965-01-05'), age: 61, phone: '9876543222', address: { street: '33 Mahim', city: 'Mumbai', state: 'Maharashtra', country: 'India', pincode: '400016' }, bloodGroup: 'A-', tags: ['Hypertensive'], createdBy: RECEPTIONIST_ID },
      { patientId: patientIds[13], uhid: 'UHID00014', organizationId: ORG_ID, branchId: BRANCH_MUMBAI_ID, salutation: 'Mrs', name: 'Lata Iyer', gender: 'F', dateOfBirth: new Date('1955-10-10'), age: 70, phone: '9876543223', address: { street: '50 Dadar West', city: 'Mumbai', state: 'Maharashtra', country: 'India', pincode: '400028' }, bloodGroup: 'B+', tags: ['Senior Citizen'], createdBy: RECEPTIONIST_ID },
      { patientId: patientIds[14], uhid: 'UHID00015', organizationId: ORG_ID, branchId: BRANCH_MUMBAI_ID, salutation: 'Master', name: 'Arjun Reddy', gender: 'M', dateOfBirth: new Date('2015-06-15'), age: 10, phone: '9876543224', address: { street: '9 Bandra West', city: 'Mumbai', state: 'Maharashtra', country: 'India', pincode: '400050' }, bloodGroup: 'O+', createdBy: RECEPTIONIST_ID },
      { patientId: patientIds[15], uhid: 'UHID00016', organizationId: ORG_ID, branchId: BRANCH_MUMBAI_ID, salutation: 'Mr', name: 'Sanjay Patil', gender: 'M', dateOfBirth: new Date('1980-12-01'), age: 45, phone: '9876543225', email: 'sanjay.patil@email.com', address: { street: '15 Andheri East', city: 'Mumbai', state: 'Maharashtra', country: 'India', pincode: '400069' }, bloodGroup: 'AB+', createdBy: RECEPTIONIST_ID },
      { patientId: patientIds[16], uhid: 'UHID00017', organizationId: ORG_ID, branchId: BRANCH_MUMBAI_ID, salutation: 'Mrs', name: 'Nandini Rao', gender: 'F', dateOfBirth: new Date('1992-08-18'), age: 33, phone: '9876543226', email: 'nandini.rao@email.com', address: { street: '27 Goregaon', city: 'Mumbai', state: 'Maharashtra', country: 'India', pincode: '400062' }, bloodGroup: 'A+', createdBy: RECEPTIONIST_ID },
      { patientId: patientIds[17], uhid: 'UHID00018', organizationId: ORG_ID, branchId: BRANCH_MUMBAI_ID, salutation: 'Mr', name: 'Prakash Chandra', gender: 'M', dateOfBirth: new Date('1958-04-22'), age: 67, phone: '9876543227', address: { street: '41 Powai', city: 'Mumbai', state: 'Maharashtra', country: 'India', pincode: '400076' }, bloodGroup: 'O-', tags: ['Diabetic', 'Senior Citizen'], createdBy: RECEPTIONIST_ID },
      { patientId: patientIds[18], uhid: 'UHID00019', organizationId: ORG_ID, branchId: BRANCH_MUMBAI_ID, salutation: 'Baby', name: 'Aisha Khan', gender: 'F', dateOfBirth: new Date('2023-09-10'), age: 2, phone: '9876543228', address: { street: '6 Malad West', city: 'Mumbai', state: 'Maharashtra', country: 'India', pincode: '400064' }, bloodGroup: 'B+', createdBy: RECEPTIONIST_ID },
      { patientId: patientIds[19], uhid: 'UHID00020', organizationId: ORG_ID, branchId: BRANCH_MUMBAI_ID, salutation: 'Mr', name: 'Amit Saxena', gender: 'M', dateOfBirth: new Date('1987-11-03'), age: 38, phone: '9876543229', email: 'amit.saxena@email.com', address: { street: '20 Borivali', city: 'Mumbai', state: 'Maharashtra', country: 'India', pincode: '400066' }, bloodGroup: 'A+', createdBy: RECEPTIONIST_ID },
      { patientId: patientIds[20], uhid: 'UHID00021', organizationId: ORG_ID, branchId: BRANCH_MUMBAI_ID, salutation: 'Mrs', name: 'Priya Menon', gender: 'F', dateOfBirth: new Date('1983-02-28'), age: 42, phone: '9876543230', address: { street: '35 Chembur', city: 'Mumbai', state: 'Maharashtra', country: 'India', pincode: '400071' }, bloodGroup: 'O+', createdBy: RECEPTIONIST_ID },
      { patientId: patientIds[21], uhid: 'UHID00022', organizationId: ORG_ID, branchId: BRANCH_PUNE_ID, salutation: 'Mr', name: 'Vinod Bhatt', gender: 'M', dateOfBirth: new Date('1970-07-14'), age: 55, phone: '9876543231', address: { street: '11 Koregaon Park', city: 'Pune', state: 'Maharashtra', country: 'India', pincode: '411001' }, bloodGroup: 'B+', createdBy: RECEPTIONIST_ID },
      { patientId: patientIds[22], uhid: 'UHID00023', organizationId: ORG_ID, branchId: BRANCH_PUNE_ID, salutation: 'Ms', name: 'Divya Jain', gender: 'F', dateOfBirth: new Date('1993-05-09'), age: 32, phone: '9876543232', email: 'divya.jain@email.com', address: { street: '19 Viman Nagar', city: 'Pune', state: 'Maharashtra', country: 'India', pincode: '411014' }, bloodGroup: 'AB+', createdBy: RECEPTIONIST_ID },
      { patientId: patientIds[23], uhid: 'UHID00024', organizationId: ORG_ID, branchId: BRANCH_PUNE_ID, salutation: 'Mr', name: 'Harish Hegde', gender: 'M', dateOfBirth: new Date('1976-12-20'), age: 49, phone: '9876543233', address: { street: '28 Hinjewadi', city: 'Pune', state: 'Maharashtra', country: 'India', pincode: '411057' }, bloodGroup: 'O+', createdBy: RECEPTIONIST_ID },
      { patientId: patientIds[24], uhid: 'UHID00025', organizationId: ORG_ID, branchId: BRANCH_PUNE_ID, salutation: 'Mrs', name: 'Rekha Agarwal', gender: 'F', dateOfBirth: new Date('1962-08-05'), age: 63, phone: '9876543234', address: { street: '44 Kothrud', city: 'Pune', state: 'Maharashtra', country: 'India', pincode: '411038' }, bloodGroup: 'A-', tags: ['Senior Citizen'], createdBy: RECEPTIONIST_ID },
    ];
    const createdPatients = await Patient.insertMany(patients);
    console.log(`Created ${patients.length} patients`);

    // 13. Medical Histories for first 10 patients
    const histories = [
      {
        patientId: patientIds[0],
        conditions: [
          { name: 'Diabetes', value: 'Y', since: '2015', notes: 'Type 2, on Metformin' },
          { name: 'Hypertension', value: 'Y', since: '2018', notes: 'On Telmisartan 40mg' },
          { name: 'Heart Disease', value: 'N' },
          { name: 'Asthma', value: 'N' },
        ],
        allergies: [{ allergen: 'Penicillin', severity: 'Moderate', reaction: 'Skin rash' }],
        updatedBy: DOCTOR_ID,
      },
      {
        patientId: patientIds[1],
        conditions: [
          { name: 'Hypothyroidism', value: 'Y', since: '2020', notes: 'On Thyronorm 50mcg' },
          { name: 'Diabetes', value: 'N' },
          { name: 'Hypertension', value: 'N' },
        ],
        noHistory: false,
        updatedBy: DOCTOR_ID,
      },
      {
        patientId: patientIds[2],
        noHistory: true,
        conditions: [],
        updatedBy: DOCTOR_ID,
      },
      {
        patientId: patientIds[3],
        conditions: [
          { name: 'Asthma', value: 'Y', since: '2010', notes: 'Seasonal exacerbation' },
        ],
        allergies: [{ allergen: 'Dust', severity: 'Mild', reaction: 'Sneezing, runny nose' }],
        updatedBy: DOCTOR_ID,
      },
      {
        patientId: patientIds[4],
        conditions: [
          { name: 'Diabetes', value: 'Y', since: '2008', notes: 'Type 2, insulin-dependent' },
          { name: 'Hypertension', value: 'Y', since: '2010' },
          { name: 'Heart Disease', value: 'Y', since: '2019', notes: 'CAD, post-stent' },
        ],
        surgicalHistory: [
          { procedure: 'Coronary Angioplasty', date: new Date('2019-04-15'), notes: '2 stents placed' },
        ],
        familyHistory: [
          { relation: 'Father', condition: 'Diabetes, Heart Disease' },
          { relation: 'Mother', condition: 'Hypertension' },
        ],
        updatedBy: DOCTOR_ID,
      },
      {
        patientId: patientIds[5],
        conditions: [
          { name: 'Hypothyroidism', value: 'Y', since: '2019', notes: 'On Thyronorm 75mcg' },
        ],
        updatedBy: DOCTOR_ID,
      },
      {
        patientId: patientIds[8],
        conditions: [
          { name: 'Diabetes', value: 'Y', since: '2005', notes: 'Type 2, on insulin + Metformin' },
          { name: 'Hypertension', value: 'Y', since: '2008', notes: 'On Amlodipine 5mg' },
          { name: 'Hyperlipidemia', value: 'Y', since: '2010', notes: 'On Atorvastatin 20mg' },
        ],
        allergies: [{ allergen: 'Sulfonamides', severity: 'Severe', reaction: 'Anaphylaxis' }],
        updatedBy: DOCTOR_ID,
      },
      {
        patientId: patientIds[13],
        conditions: [
          { name: 'Hypertension', value: 'Y', since: '2000', notes: 'On Losartan 50mg' },
          { name: 'Osteoarthritis', value: 'Y', since: '2015', notes: 'Both knees' },
        ],
        surgicalHistory: [
          { procedure: 'Total Knee Replacement (Right)', date: new Date('2022-01-20'), notes: 'Uneventful recovery' },
        ],
        updatedBy: DOCTOR_ID,
      },
      {
        patientId: patientIds[17],
        conditions: [
          { name: 'Diabetes', value: 'Y', since: '2000', notes: 'Type 2, insulin-dependent' },
          { name: 'Hypertension', value: 'Y', since: '2005' },
          { name: 'Chronic Kidney Disease', value: 'Y', since: '2020', notes: 'Stage 3, on monitoring' },
        ],
        familyHistory: [
          { relation: 'Father', condition: 'Diabetes' },
          { relation: 'Sister', condition: 'Hypertension' },
        ],
        updatedBy: DOCTOR_ID,
      },
    ];
    await PatientMedicalHistory.insertMany(histories);
    console.log(`Created ${histories.length} medical histories`);

    // 14. Default Print Settings
    await PrintSettings.create({
      organizationId: ORG_ID,
      branchId: BRANCH_MUMBAI_ID,
      settings: {
        showClinicLogo: true,
        showClinicName: true,
        showClinicAddress: true,
        showClinicPhone: true,
        showDoctorName: true,
        showDoctorQualifications: true,
        showDoctorRegistration: true,
        showDoctorSignature: true,
        showPatientName: true,
        showPatientAge: true,
        showPatientGender: true,
        showPatientPhone: false,
        showPatientUHID: true,
        showVisitDate: true,
        showVitals: true,
        showBP: true,
        showPulse: true,
        showTemperature: true,
        showWeight: true,
        showHeight: true,
        showBMI: true,
        showSpO2: true,
        showRespiratoryRate: false,
        showHeartRate: false,
        showSymptoms: true,
        showSymptomSeverity: true,
        showSymptomDuration: true,
        showDiagnosis: true,
        showIcdCode: true,
        showDiagnosisType: true,
        showDiagnosisStatus: true,
        showExaminationFindings: true,
        showMedications: true,
        showMedicationGenericName: true,
        showMedicationDosage: true,
        showMedicationFrequency: true,
        showMedicationDuration: true,
        showMedicationInstructions: true,
        showLabInvestigations: true,
        showLabResults: true,
        showProcedures: true,
        showFollowUp: true,
        showReferral: true,
        showAdvice: true,
        showSurgicalNotes: false,
        showPrivateNotes: false,
        showCustomSections: true,
        showMedicalHistory: false,
        showPageNumbers: true,
        showWatermark: false,
        showFooterLine: true,
        paperSize: 'A4',
        marginTop: 20,
        marginBottom: 20,
        marginLeft: 15,
        marginRight: 15,
        fontSize: 10,
        headerFontSize: 14,
      },
    });
    console.log('Created default print settings');

    // 15. Appointments for today (8 appointments)
    const appointmentIds = Array.from({ length: 8 }, () => uuidv4());
    const slots = ['09:00-09:15', '09:15-09:30', '09:30-09:45', '10:00-10:15', '10:15-10:30', '10:30-10:45', '11:00-11:15', '11:15-11:30'];
    const appointmentStatuses = ['Completed', 'Completed', 'Completed', 'Ongoing', 'Booked', 'Booked', 'Booked', 'Booked'];
    const appointmentPatientIndices = [0, 1, 2, 3, 5, 6, 7, 9];

    const appointmentsData = appointmentPatientIndices.map((pIdx, i) => ({
      appointmentId: appointmentIds[i],
      organizationId: ORG_ID,
      branchId: BRANCH_MUMBAI_ID,
      patientId: patientIds[pIdx],
      patientName: patients[pIdx].name,
      phone: patients[pIdx].phone,
      doctorId: DOCTOR_ID,
      slot: slots[i],
      slotDate: TODAY,
      slotStartUTC: new Date(`${TODAY}T${slots[i].split('-')[0]}:00.000Z`),
      slotEndUTC: new Date(`${TODAY}T${slots[i].split('-')[1]}:00.000Z`),
      status: appointmentStatuses[i],
      paymentStatus: i < 3 ? 'Paid' : 'Pending',
      createdBy: RECEPTIONIST_ID,
    }));

    await Appointment.insertMany(appointmentsData);
    console.log(`Created ${appointmentsData.length} appointments`);

    // 16. Queue entries for today (8 queue entries matching appointments)
    const queueIds = Array.from({ length: 8 }, () => uuidv4());
    const queueStatuses = ['Completed', 'Completed', 'Completed', 'Ongoing', 'Waiting', 'Waiting', 'Waiting', 'Waiting'];

    const queueData = appointmentPatientIndices.map((pIdx, i) => ({
      queueId: queueIds[i],
      organizationId: ORG_ID,
      branchId: BRANCH_MUMBAI_ID,
      appointmentId: appointmentIds[i],
      patientId: patientIds[pIdx],
      patientName: patients[pIdx].name,
      uhid: patients[pIdx].uhid,
      tokenNumber: i + 1,
      slot: slots[i],
      queueDate: TODAY,
      arrivalTime: new Date(`${TODAY}T${slots[i].split('-')[0]}:00.000Z`),
      status: queueStatuses[i],
      paymentStatus: i < 3 ? 'Paid' : 'Pending',
      paymentAmount: i < 3 ? 500 : 0,
      createdBy: RECEPTIONIST_ID,
    }));

    await Queue.insertMany(queueData);
    console.log(`Created ${queueData.length} queue entries`);

    // 17. Sample Prescriptions (3 completed visits)
    const prescriptionIds = Array.from({ length: 3 }, () => uuidv4());
    const prescriptionsData = [
      {
        prescriptionId: prescriptionIds[0],
        organizationId: ORG_ID,
        branchId: BRANCH_MUMBAI_ID,
        patientId: patientIds[0],
        appointmentId: appointmentIds[0],
        queueId: queueIds[0],
        doctorId: DOCTOR_ID,
        visitDate: new Date(),
        vitals: { bp: '140/90', pulse: 82, temperature: 98.6, weight: 78, height: 170, bmi: 27.0, spo2: 97 },
        symptoms: [
          { name: 'Headache', severity: 'Moderate', duration: '3 days' },
          { name: 'Fatigue', severity: 'Mild', duration: '1 week' },
        ],
        diagnoses: [
          { icdCode: 'I10', description: 'Essential (Primary) Hypertension', type: 'Primary', status: 'Active', notes: 'BP not well controlled' },
          { icdCode: 'E11', description: 'Type 2 Diabetes Mellitus', type: 'Secondary', status: 'Active' },
        ],
        examinationFindings: [
          { name: 'Heart sounds normal, no murmur' },
          { name: 'Lungs clear bilaterally' },
        ],
        medications: [
          { brandName: 'Telma', genericName: 'Telmisartan', form: 'Tablet', dosage: '40mg', frequency: '1-0-0', timing: 'Before food', duration: '30 days', instructions: 'Take in the morning' },
          { brandName: 'Glycomet', genericName: 'Metformin', form: 'Tablet', dosage: '500mg', frequency: '1-0-1', timing: 'After food', duration: '30 days', instructions: 'Monitor blood sugar' },
          { brandName: 'Ecosprin', genericName: 'Aspirin', form: 'Tablet', dosage: '75mg', frequency: '0-0-1', timing: 'After dinner', duration: '30 days' },
        ],
        labInvestigations: [
          { testName: 'HbA1c (Glycated Hemoglobin)', category: 'Biochemistry', remarks: 'Follow-up test' },
          { testName: 'Lipid Profile', category: 'Biochemistry' },
        ],
        followUp: { date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), notes: 'Review BP and sugar levels' },
        advice: 'Reduce salt intake. Walk 30 minutes daily. Monitor BP at home.',
        createdBy: DOCTOR_ID,
      },
      {
        prescriptionId: prescriptionIds[1],
        organizationId: ORG_ID,
        branchId: BRANCH_MUMBAI_ID,
        patientId: patientIds[1],
        appointmentId: appointmentIds[1],
        queueId: queueIds[1],
        doctorId: DOCTOR_ID,
        visitDate: new Date(),
        vitals: { bp: '120/78', pulse: 76, temperature: 100.2, weight: 62, height: 158, bmi: 24.8, spo2: 98 },
        symptoms: [
          { name: 'Fever', severity: 'Moderate', duration: '2 days' },
          { name: 'Cough', severity: 'Mild', duration: '3 days' },
          { name: 'Sore Throat', severity: 'Moderate', duration: '2 days' },
        ],
        diagnoses: [
          { icdCode: 'J06.9', description: 'Acute upper respiratory infection, unspecified', type: 'Primary', status: 'Active' },
        ],
        examinationFindings: [
          { name: 'Throat congested' },
          { name: 'Bilateral air entry equal' },
        ],
        medications: [
          { brandName: 'Dolo', genericName: 'Paracetamol', form: 'Tablet', dosage: '650mg', frequency: '1-0-1', timing: 'After food', duration: '5 days', instructions: 'Take when fever >100F' },
          { brandName: 'Azithral', genericName: 'Azithromycin', form: 'Tablet', dosage: '500mg', frequency: '1-0-0', timing: 'Before food', duration: '3 days' },
          { brandName: 'Allegra', genericName: 'Fexofenadine', form: 'Tablet', dosage: '120mg', frequency: '0-0-1', timing: 'After dinner', duration: '5 days' },
          { brandName: 'Ascoril', genericName: 'Levosalbutamol + Ambroxol + Guaifenesin', form: 'Syrup', dosage: '10ml', frequency: '1-1-1', timing: 'After food', duration: '5 days' },
        ],
        followUp: { date: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000), notes: 'If fever persists, return immediately' },
        advice: 'Drink warm fluids. Rest adequately. Gargle with warm salt water.',
        createdBy: DOCTOR_ID,
      },
      {
        prescriptionId: prescriptionIds[2],
        organizationId: ORG_ID,
        branchId: BRANCH_MUMBAI_ID,
        patientId: patientIds[2],
        appointmentId: appointmentIds[2],
        queueId: queueIds[2],
        doctorId: DOCTOR_ID,
        visitDate: new Date(),
        vitals: { bp: '118/76', pulse: 72, temperature: 98.4, weight: 85, height: 178, bmi: 26.8, spo2: 99 },
        symptoms: [
          { name: 'Back Pain', severity: 'Severe', duration: '5 days', laterality: 'Lower back' },
          { name: 'Muscle Pain', severity: 'Moderate', duration: '5 days' },
        ],
        diagnoses: [
          { icdCode: 'M54.5', description: 'Low Back Pain', type: 'Primary', status: 'Active', notes: 'Acute episode, no neuro deficit' },
        ],
        examinationFindings: [
          { name: 'No visible deformity' },
          { name: 'Range of motion restricted', notes: 'Lumbar flexion limited' },
        ],
        medications: [
          { brandName: 'Combiflam', genericName: 'Ibuprofen + Paracetamol', form: 'Tablet', dosage: '400mg+325mg', frequency: '1-0-1', timing: 'After food', duration: '5 days', instructions: 'Do not take on empty stomach' },
          { brandName: 'Pan', genericName: 'Pantoprazole', form: 'Tablet', dosage: '40mg', frequency: '1-0-0', timing: 'Before breakfast', duration: '5 days', instructions: 'Take 30 min before food' },
          { brandName: 'Volini', genericName: 'Diclofenac Gel', form: 'Gel', dosage: 'Apply locally', frequency: '1-0-1', duration: '7 days', instructions: 'Apply on affected area and massage gently' },
        ],
        labInvestigations: [
          { testName: 'Chest X-Ray (PA View)', category: 'Radiology', remarks: 'Lumbar spine X-ray' },
        ],
        followUp: { date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), notes: 'If not improving, consider MRI' },
        advice: 'Avoid heavy lifting. Use firm mattress. Apply hot fomentation.',
        createdBy: DOCTOR_ID,
      },
    ];
    await Prescription.insertMany(prescriptionsData);
    console.log(`Created ${prescriptionsData.length} prescriptions`);

    // 18. Sample Invoices (5)
    const invoiceIds = Array.from({ length: 5 }, () => uuidv4());
    const invoicesData = [
      {
        invoiceId: invoiceIds[0],
        organizationId: ORG_ID,
        patientId: patientIds[0],
        appointmentId: appointmentIds[0],
        lineItems: [
          { description: 'General Consultation', quantity: 1, unitPrice: 500, discount: 0, total: 500 },
        ],
        subtotal: 500,
        discount: 0,
        tax: 0,
        totalAmount: 500,
        paidAmount: 500,
        balanceDue: 0,
        status: 'Paid',
      },
      {
        invoiceId: invoiceIds[1],
        organizationId: ORG_ID,
        patientId: patientIds[1],
        appointmentId: appointmentIds[1],
        lineItems: [
          { description: 'General Consultation', quantity: 1, unitPrice: 500, discount: 0, total: 500 },
          { description: 'Lab Work', quantity: 1, unitPrice: 200, discount: 0, total: 200 },
        ],
        subtotal: 700,
        discount: 0,
        tax: 0,
        totalAmount: 700,
        paidAmount: 700,
        balanceDue: 0,
        status: 'Paid',
      },
      {
        invoiceId: invoiceIds[2],
        organizationId: ORG_ID,
        patientId: patientIds[2],
        appointmentId: appointmentIds[2],
        lineItems: [
          { description: 'General Consultation', quantity: 1, unitPrice: 500, discount: 0, total: 500 },
          { description: 'ECG', quantity: 1, unitPrice: 300, discount: 0, total: 300 },
        ],
        subtotal: 800,
        discount: 0,
        tax: 0,
        totalAmount: 800,
        paidAmount: 800,
        balanceDue: 0,
        status: 'Paid',
      },
      {
        invoiceId: invoiceIds[3],
        organizationId: ORG_ID,
        patientId: patientIds[4],
        lineItems: [
          { description: 'Specialist Consultation', quantity: 1, unitPrice: 800, discount: 0, total: 800 },
          { description: 'ECG', quantity: 1, unitPrice: 300, discount: 0, total: 300 },
          { description: 'Lab Work', quantity: 1, unitPrice: 200, discount: 0, total: 200 },
        ],
        subtotal: 1300,
        discount: 100,
        tax: 0,
        totalAmount: 1200,
        paidAmount: 500,
        balanceDue: 700,
        status: 'Partial',
      },
      {
        invoiceId: invoiceIds[4],
        organizationId: ORG_ID,
        patientId: patientIds[8],
        lineItems: [
          { description: 'Health Check-up Package', quantity: 1, unitPrice: 2000, discount: 0, total: 2000 },
        ],
        subtotal: 2000,
        discount: 200,
        tax: 0,
        totalAmount: 1800,
        paidAmount: 0,
        balanceDue: 1800,
        status: 'Unpaid',
      },
    ];
    await Invoice.insertMany(invoicesData);
    console.log(`Created ${invoicesData.length} invoices`);

    // 19. Sample Payments (4)
    const paymentIds = Array.from({ length: 4 }, () => uuidv4());
    const paymentsData = [
      {
        paymentId: paymentIds[0],
        invoiceId: invoiceIds[0],
        amount: 500,
        method: 'Cash',
        collectedBy: RECEPTIONIST_ID,
        collectedAt: new Date(),
      },
      {
        paymentId: paymentIds[1],
        invoiceId: invoiceIds[1],
        amount: 700,
        method: 'UPI',
        transactionRef: 'UPI-TXN-20260302-001',
        collectedBy: RECEPTIONIST_ID,
        collectedAt: new Date(),
      },
      {
        paymentId: paymentIds[2],
        invoiceId: invoiceIds[2],
        amount: 800,
        method: 'Card',
        transactionRef: 'CARD-TXN-20260302-001',
        collectedBy: RECEPTIONIST_ID,
        collectedAt: new Date(),
      },
      {
        paymentId: paymentIds[3],
        invoiceId: invoiceIds[3],
        amount: 500,
        method: 'Cash',
        collectedBy: RECEPTIONIST_ID,
        collectedAt: new Date(),
      },
    ];
    await Payment.insertMany(paymentsData);
    console.log(`Created ${paymentsData.length} payments`);

    // 20. Receipts for payments
    const receiptsData = [
      { paymentId: paymentIds[0], invoiceId: invoiceIds[0], receiptNumber: 'RCT-2026-000001' },
      { paymentId: paymentIds[1], invoiceId: invoiceIds[1], receiptNumber: 'RCT-2026-000002' },
      { paymentId: paymentIds[2], invoiceId: invoiceIds[2], receiptNumber: 'RCT-2026-000003' },
      { paymentId: paymentIds[3], invoiceId: invoiceIds[3], receiptNumber: 'RCT-2026-000004' },
    ];
    await Receipt.insertMany(receiptsData);
    console.log(`Created ${receiptsData.length} receipts`);

    // ─── Dropdown Options (~80 options) ─────────────────────────────
    let dropdownId = 1;
    const dropdownOptions = [
      // Medication - dosage (10)  IDs 1-10
      ...['Once daily (OD)', 'Twice daily (BD)', 'Thrice daily (TDS)', 'Four times daily (QID)', 'Half tablet', 'One tablet', 'Two tablets', '5ml', '10ml', 'As directed'].map((v, i) => ({
        dropdown_option_id: dropdownId++, section: 'medication', option_key: 'dosage', option_value: v, sort_order: i + 1, is_active: true,
      })),
      // Medication - frequency (8)  IDs 11-18
      ...['Once a day', 'Twice a day', 'Three times a day', 'Four times a day', 'Every 6 hours', 'Every 8 hours', 'Every 12 hours', 'As needed (SOS)'].map((v, i) => ({
        dropdown_option_id: dropdownId++, section: 'medication', option_key: 'frequency', option_value: v, sort_order: i + 1, is_active: true,
      })),
      // Medication - timing (8)  IDs 19-26
      ...['Before food', 'After food', 'With food', 'Empty stomach', 'Morning', 'Night', 'Morning and Night', 'Bedtime'].map((v, i) => ({
        dropdown_option_id: dropdownId++, section: 'medication', option_key: 'timing', option_value: v, sort_order: i + 1, is_active: true,
      })),
      // Medication - duration (10)  IDs 27-36
      ...['3 days', '5 days', '7 days', '10 days', '14 days', '1 month', '2 months', '3 months', '6 months', 'Ongoing'].map((v, i) => ({
        dropdown_option_id: dropdownId++, section: 'medication', option_key: 'duration', option_value: v, sort_order: i + 1, is_active: true,
      })),
      // Medication - start_from (5)  IDs 37-41
      ...['Today', 'Tomorrow', 'After 3 days', 'After 1 week', 'As advised'].map((v, i) => ({
        dropdown_option_id: dropdownId++, section: 'medication', option_key: 'start_from', option_value: v, sort_order: i + 1, is_active: true,
      })),
      // Medication - condition (5)  IDs 42-46
      ...['If fever', 'If pain', 'If nausea', 'If needed', 'As required'].map((v, i) => ({
        dropdown_option_id: dropdownId++, section: 'medication', option_key: 'condition', option_value: v, sort_order: i + 1, is_active: true,
      })),
      // Symptoms - severity (5)  IDs 47-51
      ...['Mild', 'Moderate', 'Severe', 'Very Severe', 'Critical'].map((v, i) => ({
        dropdown_option_id: dropdownId++, section: 'symptoms', option_key: 'severity', option_value: v, sort_order: i + 1, is_active: true,
      })),
      // Symptoms - laterality (4)  IDs 52-55
      ...['Left', 'Right', 'Bilateral', 'Not applicable'].map((v, i) => ({
        dropdown_option_id: dropdownId++, section: 'symptoms', option_key: 'laterality', option_value: v, sort_order: i + 1, is_active: true,
      })),
      // Diagnosis - status (5)  IDs 56-60
      ...['Confirmed', 'Suspected', 'Provisional', 'Ruled out', 'Chronic'].map((v, i) => ({
        dropdown_option_id: dropdownId++, section: 'diagnosis', option_key: 'status', option_value: v, sort_order: i + 1, is_active: true,
      })),
      // Lab Results - interpretation (4)  IDs 61-64
      ...['Normal', 'Abnormal', 'Critical', 'Borderline'].map((v, i) => ({
        dropdown_option_id: dropdownId++, section: 'labresult', option_key: 'interpretation', option_value: v, sort_order: i + 1, is_active: true,
      })),
      // Lab Results - unit (10)  IDs 65-74
      ...['mg/dL', 'g/dL', 'mmol/L', 'mEq/L', 'IU/L', 'U/L', 'cells/mcL', '%', 'mm/hr', 'ng/mL'].map((v, i) => ({
        dropdown_option_id: dropdownId++, section: 'labresult', option_key: 'unit', option_value: v, sort_order: i + 1, is_active: true,
      })),
    ];
    await DropdownOption.insertMany(dropdownOptions);
    console.log(`Created ${dropdownOptions.length} dropdown options`);

    // ─── Default Prescription Config ─────────────────────────────────
    await PrescriptionConfig.create({
      configId: 'config-001',
      organizationId: ORG_ID,
      branchId: BRANCH_MUMBAI_ID,
      doctorId: DOCTOR_ID,
      section_order: ['vitals', 'symptoms', 'diagnosis', 'examination', 'medications', 'labInvestigations', 'labResults', 'medicalHistory', 'procedures', 'followUp', 'referral', 'advice', 'notes', 'customSections'],
      enabled_sections: { vitals: true, symptoms: true, diagnosis: true, examination: true, medications: true, labInvestigations: true, labResults: true, medicalHistory: true, procedures: true, followUp: true, referral: true, advice: true, notes: true, customSections: true },
      print_enabled_sections: { vitals: true, symptoms: true, diagnosis: true, medications: true, labInvestigations: true, labResults: true, medicalHistory: true, procedures: true, followUp: true, referral: true, advice: true, notes: true },
      custom_sections: [],
    });
    console.log('Created default prescription config');

    // ─── Sample Prescription Templates ───────────────────────────────
    // IDs reference: severity Mild=47, Moderate=48 | laterality N/A=55 | dosage OD=1, BD=2
    // frequency Once=11, Twice=12 | timing After food=20, Before food=19 | duration 3d=27, 5d=28, 7d=29
    // diagnosis status Confirmed=56, Suspected=57
    await PrescriptionTemplate.insertMany([
      {
        organizationId: ORG_ID,
        branchId: BRANCH_MUMBAI_ID,
        doctorId: DOCTOR_ID,
        type: 'symptom',
        name: 'Common Cold Symptoms',
        data: { items: [
          { name: 'Runny nose', duration: '3 days', severity_id: 47, laterality_id: 55 },
          { name: 'Sneezing', duration: '3 days', severity_id: 47, laterality_id: 55 },
          { name: 'Sore throat', duration: '2 days', severity_id: 48, laterality_id: 55 },
        ]},
      },
      {
        organizationId: ORG_ID,
        branchId: BRANCH_MUMBAI_ID,
        doctorId: DOCTOR_ID,
        type: 'medication',
        name: 'Fever Treatment',
        data: { items: [
          { brand_name: 'Paracetamol 500mg', generic_name: 'Paracetamol', type: 'Tablet', dosage_id: 6, frequency_id: 12, timing_id: 20, duration_id: 27 },
          { brand_name: 'Ibuprofen 400mg', generic_name: 'Ibuprofen', type: 'Tablet', dosage_id: 6, frequency_id: 12, timing_id: 20, duration_id: 28 },
        ]},
      },
      {
        organizationId: ORG_ID,
        branchId: BRANCH_MUMBAI_ID,
        doctorId: DOCTOR_ID,
        type: 'diagnosis',
        name: 'Respiratory Infection',
        data: { items: [
          { name: 'Acute upper respiratory infection', codes: 'J06.9', status_id: 56 },
          { name: 'Acute nasopharyngitis', codes: 'J00', status_id: 56 },
        ]},
      },
      {
        organizationId: ORG_ID,
        branchId: BRANCH_MUMBAI_ID,
        doctorId: DOCTOR_ID,
        type: 'global',
        name: 'Common Cold Protocol',
        isGlobal: true,
        data: {
          prescription_data: {
            patient_symptoms: [
              { symptom_name: 'Runny nose', duration: '3 days' },
              { symptom_name: 'Sneezing', duration: '3 days' },
            ],
            patient_medications: [
              { brand_name: 'Paracetamol 500mg', generic_name: 'Paracetamol', type: 'Tablet' },
            ],
            patient_diagnoses: [
              { diagnosis_name: 'Acute upper respiratory infection', codes: 'J06.9' },
            ],
          },
        },
      },
    ]);
    console.log('Created 4 prescription templates');

    console.log('\n=== Seed completed successfully! ===');
    console.log(`\nLogin credentials:`);
    console.log(`  Doctor:       doctor@healthfirst.in / doctor123`);
    console.log(`  Receptionist: reception@healthfirst.in / reception123`);
    console.log(`  Admin:        admin@healthfirst.in / admin123`);
    console.log(`\nOrganization ID: ${ORG_ID}`);
    console.log(`Mumbai Branch ID: ${BRANCH_MUMBAI_ID}`);
    console.log(`Pune Branch ID: ${BRANCH_PUNE_ID}`);
    console.log(`Doctor ID: ${DOCTOR_ID}`);
    console.log(`Today's date (for queue/appointments): ${TODAY}`);
    console.log(`\nSummary:`);
    console.log(`  25 patients, ${histories.length} medical histories`);
    console.log(`  ${appointmentsData.length} appointments, ${queueData.length} queue entries`);
    console.log(`  ${prescriptionsData.length} prescriptions`);
    console.log(`  ${invoicesData.length} invoices, ${paymentsData.length} payments`);
    console.log(`  ${symptoms.length} symptoms, ${diagnoses.length} diagnoses`);
    console.log(`  ${medications.length} medications, ${labTests.length} lab tests`);
    console.log(`  ${services.length} services, ${findings.length} examination findings`);
    console.log(`  ${procedures.length} procedures, ${salutations.length} salutations`);
    console.log(`  ${dropdownOptions.length} dropdown options, 4 prescription templates`);

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('Seed failed:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

seed();
