export type FactCategory =
  | 'personal'
  | 'contact'
  | 'authorization'
  | 'availability'
  | 'compensation'
  | 'experience'
  | 'education'
  | 'links'
  | 'preferences';

export interface Fact {
  key: string;
  category: FactCategory;
  label: string;
  value: string | number | boolean | string[];
  evidence?: string;
  verifiedAt: string;
  notes?: string;
}

export type FactMap = Record<string, Fact>;

/**
 * Default verified facts (the truth constraint, PRD G4/D3). Every screening
 * answer and application field must resolve against facts or the master
 * resume; the system never infers or fabricates.
 *
 * This repo is public, so contact details, address, postal code and current
 * salary are deliberately NOT here. Contact details come from the master
 * resume; anything else is asked once at the Human Gate and stored only in
 * the local database (.data/, gitignored).
 */
export const DEFAULT_FACTS: Fact[] = [
  // Personal & Contact
  {
    key: 'full_name',
    category: 'personal',
    label: 'Full Legal Name',
    value: 'Aravindhan Sivaraman',
    evidence: 'Government ID / Master Resume',
    verifiedAt: '2026-08-24T00:00:00.000Z',
  },
  {
    key: 'first_name',
    category: 'personal',
    label: 'First Name',
    value: 'Aravindhan',
    evidence: 'Master Resume',
    verifiedAt: '2026-08-24T00:00:00.000Z',
  },
  {
    key: 'last_name',
    category: 'personal',
    label: 'Last Name',
    value: 'Sivaraman',
    evidence: 'Master Resume',
    verifiedAt: '2026-08-24T00:00:00.000Z',
  },
  {
    key: 'phone_country_code',
    category: 'contact',
    label: 'Phone Country Code',
    value: '+91',
    evidence: 'Master Resume',
    verifiedAt: '2026-08-24T00:00:00.000Z',
  },
  {
    key: 'city',
    category: 'personal',
    label: 'Current City',
    value: 'Chennai',
    evidence: 'Master Resume',
    verifiedAt: '2026-08-24T00:00:00.000Z',
  },
  {
    key: 'state',
    category: 'personal',
    label: 'State / Province',
    value: 'Tamil Nadu',
    evidence: 'Master Resume',
    verifiedAt: '2026-08-24T00:00:00.000Z',
  },
  {
    key: 'country',
    category: 'personal',
    label: 'Country of Residence',
    value: 'India',
    evidence: 'Master Resume',
    verifiedAt: '2026-08-24T00:00:00.000Z',
  },

  // Links & Profiles

  // Availability & Notice Period
  {
    key: 'notice_period_days',
    category: 'availability',
    label: 'Notice Period (Days)',
    value: 60,
    evidence: 'Employment Contract',
    verifiedAt: '2026-08-24T00:00:00.000Z',
    notes: '60 days standard, can negotiate buyout down to 30 days.',
  },
  {
    key: 'notice_period_text',
    category: 'availability',
    label: 'Notice Period (Description)',
    value: '60 days (negotiable to 30 days based on official buyout)',
    evidence: 'Employment Contract',
    verifiedAt: '2026-08-24T00:00:00.000Z',
  },
  {
    key: 'currently_serving_notice',
    category: 'availability',
    label: 'Currently Serving Notice Period',
    value: false,
    evidence: 'Current Employment Status',
    verifiedAt: '2026-08-24T00:00:00.000Z',
  },
  {
    key: 'earliest_start_date',
    category: 'availability',
    label: 'Earliest Start Date',
    value: 'Within 30 to 60 days of offer acceptance',
    evidence: 'Calculated from 60-day notice period',
    verifiedAt: '2026-08-24T00:00:00.000Z',
  },

  // Legal & Work Authorization
  {
    key: 'authorized_in_india',
    category: 'authorization',
    label: 'Authorized to Work in India',
    value: true,
    evidence: 'Indian Citizen',
    verifiedAt: '2026-08-24T00:00:00.000Z',
  },
  {
    key: 'requires_india_sponsorship',
    category: 'authorization',
    label: 'Requires Visa Sponsorship in India',
    value: false,
    evidence: 'Indian Citizen',
    verifiedAt: '2026-08-24T00:00:00.000Z',
  },
  {
    key: 'requires_us_sponsorship',
    category: 'authorization',
    label: 'Requires US Visa Sponsorship',
    value: true,
    evidence: 'Indian Citizen residing in India',
    verifiedAt: '2026-08-24T00:00:00.000Z',
  },
  {
    key: 'us_work_authorization',
    category: 'authorization',
    label: 'Legally Authorized to Work in the United States',
    value: false,
    evidence: 'Requires H-1B / O-1 / remote contract',
    verifiedAt: '2026-08-24T00:00:00.000Z',
  },

  // Compensation
  {
    key: 'currency',
    category: 'compensation',
    label: 'Compensation Currency',
    value: 'INR',
    evidence: 'Master Profile',
    verifiedAt: '2026-08-24T00:00:00.000Z',
  },
  {
    key: 'expected_ctc_lpa',
    category: 'compensation',
    label: 'Expected CTC (LPA INR)',
    value: 25,
    evidence: 'Target CTC from PRD §3',
    verifiedAt: '2026-08-24T00:00:00.000Z',
  },
  {
    key: 'minimum_ctc_lpa',
    category: 'compensation',
    label: 'Minimum Acceptable CTC (LPA INR)',
    value: 24,
    evidence: 'PROFILE.minSalaryInrLpa',
    verifiedAt: '2026-08-24T00:00:00.000Z',
  },
  {
    key: 'flex_minimum_ctc_lpa',
    category: 'compensation',
    label: 'Flex Floor for Tier-1 Companies (LPA INR)',
    value: 22,
    evidence: 'PROFILE.flexSalaryInrLpa',
    verifiedAt: '2026-08-24T00:00:00.000Z',
  },
  {
    key: 'compensation_negotiable',
    category: 'compensation',
    label: 'Compensation Negotiable',
    value: true,
    evidence: 'Target range 22-28 LPA depending on equity and benefits',
    verifiedAt: '2026-08-24T00:00:00.000Z',
  },

  // Experience Totals
  {
    key: 'total_experience_years',
    category: 'experience',
    label: 'Total Software Engineering Experience (Years)',
    value: 5.5,
    evidence: 'Master Resume (start date mid-2020)',
    verifiedAt: '2026-08-24T00:00:00.000Z',
  },
  {
    key: 'frontend_experience_years',
    category: 'experience',
    label: 'Frontend Development Experience (Years)',
    value: 5.5,
    evidence: 'Master Resume',
    verifiedAt: '2026-08-24T00:00:00.000Z',
  },
  {
    key: 'backend_experience_years',
    category: 'experience',
    label: 'Backend Development Experience (Years)',
    value: 4.0,
    evidence: 'Master Resume',
    verifiedAt: '2026-08-24T00:00:00.000Z',
  },
  {
    key: 'fullstack_experience_years',
    category: 'experience',
    label: 'Full Stack Experience (Years)',
    value: 5.5,
    evidence: 'Master Resume',
    verifiedAt: '2026-08-24T00:00:00.000Z',
  },

  // Skill-Specific Experience Years (Truth constraint verified)
  {
    key: 'react_experience_years',
    category: 'experience',
    label: 'React.js Experience (Years)',
    value: 5.0,
    evidence: 'Master Resume',
    verifiedAt: '2026-08-24T00:00:00.000Z',
  },
  {
    key: 'typescript_experience_years',
    category: 'experience',
    label: 'TypeScript Experience (Years)',
    value: 5.0,
    evidence: 'Master Resume',
    verifiedAt: '2026-08-24T00:00:00.000Z',
  },
  {
    key: 'javascript_experience_years',
    category: 'experience',
    label: 'JavaScript Experience (Years)',
    value: 5.5,
    evidence: 'Master Resume',
    verifiedAt: '2026-08-24T00:00:00.000Z',
  },
  {
    key: 'nodejs_experience_years',
    category: 'experience',
    label: 'Node.js Experience (Years)',
    value: 5.0,
    evidence: 'Master Resume',
    verifiedAt: '2026-08-24T00:00:00.000Z',
  },
  {
    key: 'python_experience_years',
    category: 'experience',
    label: 'Python / Flask Experience (Years)',
    value: 4.0,
    evidence: 'Master Resume',
    verifiedAt: '2026-08-24T00:00:00.000Z',
  },
  {
    key: 'gcp_experience_years',
    category: 'experience',
    label: 'Google Cloud Platform (GCP) Experience (Years)',
    value: 4.0,
    evidence: 'Master Resume',
    verifiedAt: '2026-08-24T00:00:00.000Z',
  },
  {
    key: 'docker_experience_years',
    category: 'experience',
    label: 'Docker & Containerization Experience (Years)',
    value: 4.0,
    evidence: 'Master Resume',
    verifiedAt: '2026-08-24T00:00:00.000Z',
  },
  {
    key: 'sql_experience_years',
    category: 'experience',
    label: 'SQL & Relational DB Experience (Years)',
    value: 4.0,
    evidence: 'Master Resume',
    verifiedAt: '2026-08-24T00:00:00.000Z',
  },

  // Education
  {
    key: 'degree',
    category: 'education',
    label: 'Degree Completed',
    value: 'Bachelor of Engineering (B.E.)',
    evidence: 'Degree Certificate',
    verifiedAt: '2026-08-24T00:00:00.000Z',
  },
  {
    key: 'field_of_study',
    category: 'education',
    label: 'Field of Study / Major',
    value: 'Computer Science and Engineering',
    evidence: 'Degree Certificate',
    verifiedAt: '2026-08-24T00:00:00.000Z',
  },
  {
    key: 'graduation_year',
    category: 'education',
    label: 'Graduation Year',
    value: 2019,
    evidence: 'Degree Certificate',
    verifiedAt: '2026-08-24T00:00:00.000Z',
  },

  // Preferences & Relocation
  {
    key: 'work_mode_preference',
    category: 'preferences',
    label: 'Preferred Work Mode',
    value: 'remote',
    evidence: 'PRD §5.2 Work Mode Priority',
    verifiedAt: '2026-08-24T00:00:00.000Z',
  },
  {
    key: 'willing_to_relocate_bangalore',
    category: 'preferences',
    label: 'Willing to Relocate to Bengaluru / Bangalore',
    value: true,
    evidence: 'PROFILE.acceptableCities',
    verifiedAt: '2026-08-24T00:00:00.000Z',
  },
  {
    key: 'willing_to_relocate_hyderabad',
    category: 'preferences',
    label: 'Willing to Relocate to Hyderabad',
    value: true,
    evidence: 'PROFILE.acceptableCities',
    verifiedAt: '2026-08-24T00:00:00.000Z',
  },
  {
    key: 'willing_to_relocate_general',
    category: 'preferences',
    label: 'Willing to Relocate (General)',
    value: true,
    evidence: 'Acceptable for Bengaluru or Hyderabad for compelling roles',
    verifiedAt: '2026-08-24T00:00:00.000Z',
  },
];

export const FACTS_BY_KEY: FactMap = Object.fromEntries(
  DEFAULT_FACTS.map((f) => [f.key, f]),
);

export function getFact(key: string, customFacts?: FactMap): Fact | undefined {
  if (customFacts && customFacts[key]) return customFacts[key];
  return FACTS_BY_KEY[key];
}

export function formatFactValue(value: string | number | boolean | string[]): string {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.join(', ');
  return String(value);
}
