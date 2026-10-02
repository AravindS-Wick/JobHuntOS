import type { Seniority, WorkMode } from './types.js';

/**
 * The candidate profile. This is configuration, not code — edit it freely.
 *
 * IMPORTANT: `gaps` is a hard-honesty list. Anything here is a technology the
 * candidate does NOT have production experience with. The system must never
 * claim it. It is used to flag JD requirements, never to pad a match score.
 */
export interface Profile {
  name: string;
  location: string;
  /** Weighted skills the candidate genuinely has. weight 1-5. */
  skills: Record<string, number>;
  /** Technologies the candidate does not have. Never claimed. */
  gaps: string[];
  targetTitles: string[];
  /** Titles that instantly disqualify (wrong discipline). */
  excludeTitles: string[];
  minSalaryInrLpa: number;
  /** Flex floor for high-reputation companies. */
  flexSalaryInrLpa: number;
  acceptableSeniority: Seniority[];
  /** Ordered best-first. */
  workModePriority: WorkMode[];
  homeCity: string;
  acceptableCities: string[];
  yearsExperience: number;
}

export const PROFILE: Profile = {
  name: 'Aravindhan Sivaraman',
  location: 'Tambaram, Chennai, India',
  homeCity: 'chennai',
  acceptableCities: ['chennai', 'bengaluru', 'bangalore', 'hyderabad', 'remote', 'anywhere'],
  yearsExperience: 5.5,

  skills: {
    react: 5, 'react.js': 5, redux: 5, typescript: 5, javascript: 5, es6: 4,
    angular: 4, angularjs: 4, 'next.js': 3, nextjs: 3,
    'node.js': 5, nodejs: 5, node: 5, express: 3,
    python: 4, flask: 4,
    'rest api': 5, 'restful': 5, 'api design': 4,
    jest: 4, vitest: 3, cucumber: 3, selenium: 3, bdd: 3, tdd: 3,
    docker: 4, 'github actions': 4, 'ci/cd': 4,
    webpack: 4, vite: 4,
    mongodb: 4, sql: 4, postgresql: 3, firestore: 3,
    gcp: 5, 'google cloud': 5, 'cloud functions': 4, 'cloud run': 4, 'pub/sub': 4,
    'cloud storage': 4, 'cloud monitoring': 3,
    html: 5, html5: 5, css: 5, css3: 5, 'tailwind': 4, 'material-ui': 4, mui: 4,
    'micro frontend': 1,
    git: 5, agile: 4, scrum: 4,
    'ai tools': 4, 'claude code': 4, copilot: 4, cursor: 4, genai: 3, llm: 3,
  },

  gaps: [
    'aws', 'amazon web services', 'lambda', 'dynamodb', 'step functions',
    'appsync', 'sqs', 'sns', 'aurora', 'cognito', 'cloudfront', 'glue',
    'kubernetes', 'k8s', 'eks', 'gke',
    'graphql', 'apollo',
    'terraform', 'pulumi',
    'cypress', 'playwright',
    'sass', 'less', 'scss',
    'storybook', 'turborepo',
    'tanstack query', 'react query',
    'bigquery', 'jenkins', 'tekton',
    'kafka', 'cassandra', 'java', 'j2ee', 'spring boot',
    'rust', 'go', 'golang', '.net', 'c#', 'php', 'ruby',
  ],

  targetTitles: [
    'senior full stack', 'full stack', 'senior software engineer', 'software engineer',
    'senior frontend', 'frontend', 'front end', 'front-end', 'react developer',
    'senior react', 'ui engineer', 'web developer', 'javascript developer',
    'typescript developer', 'node developer', 'mern', 'sde', 'member of technical staff',
    'tech lead', 'technical lead', 'lead engineer', 'senior associate',
  ],

  excludeTitles: [
    'data scientist', 'machine learning engineer', 'ml engineer', 'devops engineer',
    'site reliability', 'sre', 'security engineer', 'qa engineer', 'test engineer',
    'android developer', 'ios developer', 'salesforce', 'sap ', 'sales ', 'marketing ',
    'recruiter', 'accountant', 'designer', 'product manager', 'business analyst',
    'intern', 'graduate', 'fresher', 'trainee', 'principal engineer', 'director',
    'vp ', 'head of', 'architect ii', 'embedded', 'firmware', 'network engineer',
  ],

  minSalaryInrLpa: 24,
  flexSalaryInrLpa: 22,
  acceptableSeniority: ['mid', 'senior', 'lead', 'staff'],
  workModePriority: ['remote', 'hybrid', 'onsite'],
};
