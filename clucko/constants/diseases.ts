export interface DiseaseInfo {
  name: string;
  symptoms: string[];
  severity: 'none' | 'moderate' | 'high' | 'critical';
  icon: string;
  color: string;
  affectedRegion: string;
  care_recommendations: { title: string; detail: string }[];
}

export const DETECTABLE_DISEASES: Record<string, DiseaseInfo> = {
  coryza: {
    name: 'Infectious Coryza',
    affectedRegion: 'Eye & Peri-Orbital Face',
    symptoms: [
      'Facial swelling around the eyes',
      'Closed or swollen eyes preventing bird from seeing feed and water',
      'Watery and inflamed ocular discharge'
    ],
    severity: 'moderate',
    icon: 'alert-circle',
    color: '#FF9800',
    care_recommendations: [
      {
        title: 'Antimicrobial Treatment',
        detail: 'Early stages can be managed with antibiotics (such as erythromycin, oxytetracycline, or sulfonamides) prescribed by a veterinarian.'
      },
      {
        title: 'Isolation and Biosecurity',
        detail: 'Isolate sick birds immediately, practice an "all-in, all-out" flock management system, and thoroughly clean and disinfect coops.'
      }
    ]
  },
  fowlPox: {
    name: 'Fowl Pox',
    affectedRegion: 'Eye & Peri-Orbital Facial Skin',
    symptoms: [
      'Wart-like nodules and yellow bumps on eyelids',
      'Dark brown scabs on peri-orbital facial skin',
      'Ocular irritation and vision impairment'
    ],
    severity: 'high',
    icon: 'alert-triangle',
    color: '#F44336',
    care_recommendations: [
      {
        title: 'No Direct Cure',
        detail: 'There is no specific antiviral treatment for fowl pox. The dry cutaneous form usually resolves in 2 to 4 weeks.'
      },
      {
        title: 'Supportive Care',
        detail: 'Isolate sick birds, keep coop clean, ensure easy access to feed and water, and apply mild antiseptics or iodine on dry skin lesions. Broad-spectrum antibiotics may treat secondary bacterial infections. Do not pick at scabs to avoid spreading the virus.'
      },
      {
        title: 'Prevention',
        detail: 'Vaccinate the flock using live attenuated fowl pox or pigeon pox vaccines (administered via the wing-web method) and control mosquito populations around the coop.'
      }
    ]
  },
  newcastle: {
    name: 'Newcastle Disease',
    affectedRegion: 'Wing Region & Neurological Posture',
    symptoms: [
      'Wing Drooping or Sagging (One or both wings hang loosely away from body)',
      'Severe muscular weakness & loss of muscle tone',
      'Inability to tuck wings against the flank'
    ],
    severity: 'critical',
    icon: 'warning',
    color: '#9C27B0',
    care_recommendations: [
      {
        title: 'Strict Isolation',
        detail: 'Move affected gamefowl immediately to a completely separate quarantine pen far away from healthy birds. NDV spreads rapidly through the air and dander from flapping wings.'
      },
      {
        title: 'Sanitize and Clean Housing',
        detail: 'Wash down cages, feeders, and waterers with a reliable disinfectant (such as Virkon, bleach solution, or iodine-based cleaners).'
      },
      {
        title: 'Supportive Care',
        detail: 'Provide clean water mixed with electrolytes and water-soluble Vitamin B-complex for nervous system support. Place feed and water directly in front of the bird\'s breast so it does not have to walk.'
      },
      {
        title: 'Culling and Safe Disposal',
        detail: 'If gamefowl is severely paralyzed or dying, cull the bird humanely. Never throw carcasses in open dumps or waterways. Burn or bury deep in the ground (at least 3 feet down) away from water sources, coated with quicklime (apog).'
      },
      {
        title: 'Emergency Vaccination',
        detail: 'Immediately vaccinate all other healthy, asymptomatic gamefowl in your yard using a live NDV vaccine (such as LaSota strain) to boost flock immunity before exposure.'
      }
    ]
  },
};

export const NON_DETECTABLE = [
  'Internal organ infections',
  'Respiratory sounds/breathing issues',
  'Footpad problems',
  'Digestive system disorders',
  'Blood-borne diseases',
];