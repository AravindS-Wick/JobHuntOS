import { DEFAULT_FACTS, FACTS_BY_KEY, formatFactValue, type Fact, type FactMap } from './facts.js';
import { PROFILE, type Profile } from './profile.js';
import { mentions, mentionsTech } from './terms.js';

export type ResolutionOutcome = 'answer' | 'ask' | 'abort';

export interface QuestionResolution {
  outcome: ResolutionOutcome;
  key?: string;
  answer?: string | number | boolean | string[];
  formattedAnswer: string;
  confidence: number;
  reason: string;
  fact?: Fact;
}

export interface ResolveOptions {
  options?: string[];
  facts?: FactMap;
  profile?: Profile;
  /** Country of the job ('india', 'us', or other) for questions that don't name one. */
  jobCountry?: string;
}

const US_RE = /\b(united states|u\.s\.(a\.)?|usa)\b|\bin the us\b|\bus[- ](citizen|work|visa|based|employer|person)/i;
const INDIA_RE = /\bindia\b/i;

/** Map a job location string to the country key the resolver understands. */
export function countryOf(location: string | undefined): string | undefined {
  if (!location) return undefined;
  if (/\b(india|bengaluru|bangalore|chennai|hyderabad|pune|mumbai|delhi|gurgaon|gurugram|noida|kolkata|ahmedabad|kochi|coimbatore|remote - india|ind)\b/i.test(location)) return 'india';
  if (/\b(united states|usa|u\.s\.|[A-Z][a-z]+,\s*(CA|NY|WA|TX|MA|IL|CO|GA|NC|VA|FL|OR|PA|NJ)\b|remote - us)\b/.test(location)) return 'us';
  return 'other';
}

/**
 * Which verified fact holds the years for a profile skill. Skills without an
 * entry here have no verified year count, so a "how many years" question about
 * them goes to the human instead of being guessed.
 */
const SKILL_YEARS_FACT: Record<string, string> = {
  react: 'react_experience_years', 'react.js': 'react_experience_years', redux: 'react_experience_years',
  typescript: 'typescript_experience_years',
  javascript: 'javascript_experience_years', es6: 'javascript_experience_years',
  node: 'nodejs_experience_years', nodejs: 'nodejs_experience_years', 'node.js': 'nodejs_experience_years',
  python: 'python_experience_years', flask: 'python_experience_years',
  gcp: 'gcp_experience_years', 'google cloud': 'gcp_experience_years',
  docker: 'docker_experience_years',
  sql: 'sql_experience_years', postgresql: 'sql_experience_years',
};

const BINARY_RE = /^(do you have|are you experienced|have you (worked|used)|proficiency with|are you (familiar|comfortable|proficient))/i;

/** Pick the best matching option from an ATS select/radio list */
function matchOption(target: string | number | boolean | string[], options: string[]): string | undefined {
  if (Array.isArray(target)) {
    return options.find((opt) => target.some((t) => opt.toLowerCase().includes(t.toLowerCase())));
  }

  const targetStr = String(target).toLowerCase().trim();

  // Exact match
  const exact = options.find((opt) => opt.toLowerCase().trim() === targetStr);
  if (exact) return exact;

  // Boolean variations
  if (typeof target === 'boolean') {
    if (target) {
      return options.find((opt) => /^(yes|true|authorized|agree|accept|eligible)/i.test(opt.trim()));
    } else {
      return options.find((opt) => /^(no|false|unauthorized|disagree|decline|ineligible)/i.test(opt.trim()));
    }
  }

  // Numeric/Range match (e.g. "60 days" vs target 60)
  if (typeof target === 'number') {
    const numMatch = options.find((opt) => {
      const match = opt.match(/\d+/);
      return match && parseInt(match[0], 10) === target;
    });
    if (numMatch) return numMatch;
  }

  // Substring match
  const sub = options.find((opt) => opt.toLowerCase().includes(targetStr) || targetStr.includes(opt.toLowerCase()));
  if (sub) return sub;

  return undefined;
}

/**
 * Screening Question Resolver (PRD §5.4 D3).
 *
 * Evaluates candidate facts and profile against arbitrary ATS screening questions.
 * Produces one of three outcomes:
 *  - 'answer': high-confidence truthful answer resolved from FactTable / profile
 *  - 'ask': novel question or low confidence, queued to human for confirmation
 *  - 'abort': question requires falsifying a gap technology or disqualifying condition
 */
export function resolveScreeningQuestion(
  question: string,
  opts: ResolveOptions = {},
): QuestionResolution {
  const q = question.toLowerCase().trim();
  const facts = opts.facts ?? FACTS_BY_KEY;
  const profile = opts.profile ?? PROFILE;
  const options = opts.options;

  const resolveWithFact = (
    key: string,
    reason: string,
    confidence = 0.95,
  ): QuestionResolution => {
    const fact = facts[key] ?? DEFAULT_FACTS.find((f) => f.key === key);
    if (!fact) {
      return {
        outcome: 'ask',
        confidence: 0.4,
        formattedAnswer: '',
        reason: `Matched candidate key '${key}' but no verified fact exists in table.`,
      };
    }

    let finalFormatted = formatFactValue(fact.value);
    if (options && options.length > 0) {
      const chosen = matchOption(fact.value, options);
      if (chosen) finalFormatted = chosen;
    }

    return {
      outcome: 'answer',
      key: fact.key,
      answer: fact.value,
      formattedAnswer: finalFormatted,
      confidence,
      reason,
      fact,
    };
  };

  // 1. Notice Period & Availability. "Currently serving" is a yes/no question,
  // so it must be checked before the generic notice-period match.
  if (/(currently|already)\s+(serving|on)\b.*?(notice|resigned)/i.test(q)) {
    return resolveWithFact('currently_serving_notice', 'Serving-notice status resolved from fact table.');
  }

  if (/notice\s*period/i.test(q)) {
    if (/\b(days|number)\b/i.test(q) || (options && options.some((o) => /\d+/.test(o)))) {
      return resolveWithFact('notice_period_days', 'Notice period resolved in days from employment contract.');
    }
    return resolveWithFact('notice_period_text', 'Notice period description resolved from fact table.');
  }

  if (/(earliest|when|how soon|availability).*?(start|join)/i.test(q)) {
    return resolveWithFact('earliest_start_date', 'Earliest start date calculated from standard notice period.');
  }

  // 2. Work authorization & sponsorship. The truthful answer depends on WHERE:
  // a country named in the question wins, then the job's country; else ask.
  const asksAuth = /(authori[sz]ed|eligible|legally (able|permitted)|right) to work/i.test(q);
  const asksSponsor = /(require|need)\b.*?\b(sponsor|visa|work permit)/i.test(q);
  if (asksAuth || asksSponsor) {
    if (/(you (have )?selected|selected (above|in|earlier)|previous question|mentioned above)/i.test(q)) {
      return {
        outcome: 'ask', confidence: 0.3, formattedAnswer: '',
        reason: 'Depends on an earlier answer on this form (selected location). Queued to Human Gate.',
      };
    }
    // "…in your country of residence" means where the candidate lives, not where the job is.
    const residence = /country of residence|(where|country) you (currently )?(live|reside)|your (current|home) country/i.test(q)
      ? countryOf(String((facts.country ?? FACTS_BY_KEY.country)?.value ?? ''))
      : undefined;
    const country = US_RE.test(q) ? 'us' : INDIA_RE.test(q) ? 'india' : residence ?? opts.jobCountry;
    if (country === 'india') {
      return asksAuth
        ? resolveWithFact('authorized_in_india', 'Work authorization in India from fact table.')
        : resolveWithFact('requires_india_sponsorship', 'Sponsorship need in India from fact table.');
    }
    if (country === 'us') {
      return asksAuth
        ? resolveWithFact('us_work_authorization', 'US work authorization from fact table.')
        : resolveWithFact('requires_us_sponsorship', 'US sponsorship need from fact table.');
    }
    return {
      outcome: 'ask', confidence: 0.3, formattedAnswer: '',
      reason: `Work authorization depends on the job's country${opts.jobCountry ? ` (${opts.jobCountry})` : ''}, which has no verified fact. Queued to Human Gate.`,
    };
  }

  // 3. Compensation & Salary Expectations
  if (/current\s*(ctc|salary|compensation|package|annual)/i.test(q)) {
    return resolveWithFact('current_ctc_lpa', 'Current compensation resolved from fact table (in INR LPA).');
  }

  if (/(expected|desired|target)\s*(ctc|salary|compensation|package|annual)/i.test(q)) {
    return resolveWithFact('expected_ctc_lpa', 'Target compensation resolved from fact table (25 LPA).');
  }

  if (/(negotiable|flexible).*?(ctc|salary|compensation)/i.test(q)) {
    return resolveWithFact('compensation_negotiable', 'Compensation negotiability resolved from profile preferences.');
  }

  // 4. Contact & Profiles
  if (/linkedin(\.com)?/i.test(q)) {
    return resolveWithFact('linkedin_url', 'LinkedIn profile URL from fact table.');
  }

  if (/github(\.com)?/i.test(q)) {
    return resolveWithFact('github_url', 'GitHub profile URL from fact table.');
  }

  if (/(portfolio|website|personal site)/i.test(q)) {
    return resolveWithFact('portfolio_url', 'Portfolio URL from fact table.');
  }

  // 5. Total Years of Experience
  if (/(total|overall).*?(years|yoe).*?(experience|software|engineering)/i.test(q) || /(years of experience).*?(total|overall)?/i.test(q) && !/(with|in|using)\s+[a-z]+/i.test(q)) {
    return resolveWithFact('total_experience_years', 'Total professional experience (5.5 years).');
  }

  // 6. Technology-Specific Experience & Truth Constraint (PRD G4 / D3)
  // Check gaps first: if the question explicitly asks about a technology in PROFILE.gaps
  const matchedGap = profile.gaps.find((gap) => mentionsTech(q, gap));
  if (matchedGap) {
    const isBinaryQuestion = BINARY_RE.test(q) || (options && options.length <= 3 && options.some((o) => /yes|no/i.test(o)));
    const isMandatory = /\b(mandatory|must have|required|minimum \d+ years)\b/i.test(q);

    if (isMandatory) {
      return {
        outcome: 'abort',
        answer: false,
        formattedAnswer: 'No',
        confidence: 1.0,
        reason: `Question specifies mandatory requirement for '${matchedGap}', which is an explicit gap in candidate profile. Aborting to prevent misrepresentation.`,
      };
    }

    if (isBinaryQuestion) {
      let formatted = 'No';
      if (options) {
        const opt = matchOption(false, options);
        if (opt) formatted = opt;
      }
      return {
        outcome: 'answer',
        answer: false,
        formattedAnswer: formatted,
        confidence: 0.99,
        reason: `Truth constraint: Candidate does not have production experience with '${matchedGap}' (listed in PROFILE.gaps). Answered truthfully as No.`,
      };
    }

    // If asking for numeric years with a gap technology
    let formattedZero = '0';
    if (options) {
      const opt = matchOption(0, options);
      if (opt) formattedZero = opt;
    }
    return {
      outcome: 'answer',
      answer: 0,
      formattedAnswer: formattedZero,
      confidence: 0.99,
      reason: `Truth constraint: Candidate has 0 years production experience with '${matchedGap}' (listed in PROFILE.gaps).`,
    };
  }

  // Check verified skills in profile
  for (const [skill] of Object.entries(profile.skills)) {
    if (mentions(q, skill)) {
      const factKey = SKILL_YEARS_FACT[skill];
      const fact = factKey ? (facts[factKey] ?? FACTS_BY_KEY[factKey]) : undefined;
      const isBinaryQuestion = BINARY_RE.test(q) || (options && options.length <= 3 && options.some((o) => /yes|no/i.test(o)));

      // A yes/no "have you used X" is backed by the skill being in the profile.
      if (isBinaryQuestion) {
        let formattedYes = 'Yes';
        if (options) {
          const opt = matchOption(true, options);
          if (opt) formattedYes = opt;
        }
        return {
          outcome: 'answer',
          key: fact?.key,
          answer: true,
          formattedAnswer: formattedYes,
          confidence: 0.95,
          reason: `Verified production skill: '${skill}' is in the candidate profile.`,
          fact,
        };
      }

      // A year count needs a verified fact. Never estimate one.
      if (!fact) {
        return {
          outcome: 'ask',
          confidence: 0.4,
          formattedAnswer: '',
          reason: `'${skill}' is a verified skill but no verified year count exists. Queued to Human Gate; the answer will be saved to the fact table.`,
        };
      }
      const years = Number(fact.value);

      let formattedYears = String(years);
      if (options) {
        const opt = matchOption(years, options);
        if (opt) formattedYears = opt;
      }
      return {
        outcome: 'answer',
        key: fact?.key,
        answer: years,
        formattedAnswer: formattedYears,
        confidence: 0.95,
        reason: `Verified production experience: candidate has ${years} years with ${skill}.`,
        fact,
      };
    }
  }

  // 7. Relocation & Location Questions
  if (/(willing|open|comfortable).*?(relocat|move).*?(bangalore|bengaluru)/i.test(q)) {
    return resolveWithFact('willing_to_relocate_bangalore', 'Relocation to Bengaluru accepted in profile preferences.');
  }

  if (/(willing|open|comfortable).*?(relocat|move).*?(hyderabad)/i.test(q)) {
    return resolveWithFact('willing_to_relocate_hyderabad', 'Relocation to Hyderabad accepted in profile preferences.');
  }

  if (/(willing|open|comfortable).*?(relocat|move)/i.test(q)) {
    return resolveWithFact('willing_to_relocate_general', 'Relocation preference for major tech hubs (Bengaluru/Hyderabad).');
  }

  if (/(current|resident).*?(city|location)/i.test(q)) {
    return resolveWithFact('city', 'Current residence in Chennai.');
  }

  // 8. Education & Degree
  if (/(highest|completed).*?(degree|education|qualification)/i.test(q)) {
    return resolveWithFact('degree', 'Graduated with Bachelor of Engineering (B.E.) in Computer Science.');
  }

  // 9. Unknown / Unresolvable -> Ask user (PRD D3)
  return {
    outcome: 'ask',
    confidence: 0.2,
    formattedAnswer: '',
    reason: `Unrecognized screening question. Queued to Human Gate for user review. Once answered, it will be saved to the Verified Fact Table.`,
  };
}
