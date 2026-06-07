export const DETECTABLE_DISEASES = {
  coryza: {
    name: 'Infectious Coryza',
    symptoms: ['Watery eyes', 'Facial swelling', 'Nasal discharge'],
    severity: 'high',
    icon: 'alert-circle',
    color: '#FF9800',
  },
  fowlPox: {
    name: 'Fowl Pox',
    symptoms: ['Lesions on comb', 'Scabs on skin', 'Difficulty eating'],
    severity: 'medium',
    icon: 'alert-triangle',
    color: '#F44336',
  },
  newcastle: {
    name: 'Newcastle Disease',
    symptoms: ['Wing droop', 'Twisted neck', 'Respiratory distress'],
    severity: 'critical',
    icon: 'warning',
    color: '#9C27B0',
  },
};

export const NON_DETECTABLE = [
  'Internal organ infections',
  'Respiratory sounds/breathing issues',
  'Footpad problems',
  'Digestive system disorders',
  'Blood-borne diseases',
];