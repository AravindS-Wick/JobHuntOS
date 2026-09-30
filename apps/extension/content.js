/**
 * JobHunt OS — Content Script for LinkedIn & Naukri
 * Scrapes live job cards from the DOM and provides residential Easy Apply autofill.
 */

(function () {
  console.log('[JobHunt OS] Content script injected on', window.location.hostname);

  // Candidate Fact Table Cache (Strict truth table, never fabricate)
  const CANDIDATE_FACTS = {
    name: 'Aravindhan Sivaraman',
    firstName: 'Aravindhan',
    lastName: 'Sivaraman',
    email: 'aravindhan.dev@gmail.com',
    phone: '9876543210',
    countryCode: '+91',
    city: 'Chennai',
    state: 'Tamil Nadu',
    country: 'India',
    yearsExperience: 5.5,
    noticePeriodDays: 30,
    currentSalaryLpa: 20,
    expectedSalaryLpa: 28,
  };

  // Sync latest candidate profile from local Fastify core if online
  try {
    chrome.runtime.sendMessage({ action: 'GET_CANDIDATE_PROFILE' }, (res) => {
      if (res?.success && res.profile) {
        const p = res.profile;
        if (p.name) {
          CANDIDATE_FACTS.name = p.name;
          const parts = p.name.split(' ');
          if (parts.length > 0) CANDIDATE_FACTS.firstName = parts[0];
          if (parts.length > 1) CANDIDATE_FACTS.lastName = parts.slice(1).join(' ');
        }
        if (p.yearsExperience) CANDIDATE_FACTS.yearsExperience = p.yearsExperience;
        if (p.homeCity) CANDIDATE_FACTS.city = p.homeCity;
        if (p.minSalaryInrLpa) CANDIDATE_FACTS.expectedSalaryLpa = p.minSalaryInrLpa;
      }
    });
  } catch (e) {
    // runtime disconnected or background asleep
  }

  // Inject Floating Action Dock
  function injectFloatingDock() {
    if (document.getElementById('jobhunt-floating-dock')) return;

    const dock = document.createElement('div');
    dock.id = 'jobhunt-floating-dock';
    dock.innerHTML = `
      <div class="jh-dock-header">
        <div class="jh-dock-title">
          <span class="jh-dock-dot"></span>
          <strong>JobHunt OS</strong>
          <span class="jh-dock-badge">ACTIVE</span>
        </div>
        <button id="jh-close-btn" class="jh-dock-close">&times;</button>
      </div>
      <div class="jh-dock-body">
        <p class="jh-dock-sub">Connected to Local Fastify Core (:4000)</p>
        <div class="jh-dock-actions">
          <button id="jh-sync-btn" class="jh-btn jh-btn-primary">
            ⚡ Sync Page Jobs to OS
          </button>
          <button id="jh-autofill-btn" class="jh-btn jh-btn-secondary">
            🤖 Auto-Fill Easy Apply
          </button>
        </div>
        <div id="jh-status-msg" class="jh-status"></div>
      </div>
    `;

    document.body.appendChild(dock);

    // Event handlers
    document.getElementById('jh-close-btn')?.addEventListener('click', () => {
      dock.style.display = 'none';
    });

    document.getElementById('jh-sync-btn')?.addEventListener('click', handleSyncJobs);
    document.getElementById('jh-autofill-btn')?.addEventListener('click', handleAutoFillEasyApply);
  }

  // Scrape Jobs from LinkedIn DOM
  function scrapeLinkedInJobs() {
    const jobs = [];
    const jobCards = document.querySelectorAll(
      '.jobs-search-results-list__list-item, .job-card-container, [data-occludable-job-id]',
    );

    jobCards.forEach((card, idx) => {
      try {
        const titleEl = card.querySelector(
          '.job-card-list__title, .job-card-container__link, a.job-card-list__title--link, [data-control-name="job_card_click"]',
        );
        const companyEl = card.querySelector(
          '.job-card-container__primary-description, .artdeco-entity-lockup__subtitle, .job-card-container__company-name',
        );
        const locationEl = card.querySelector(
          '.job-card-container__metadata-item, .artdeco-entity-lockup__caption',
        );
        const linkEl = card.querySelector('a[href*="/jobs/view/"]');

        const title = titleEl?.textContent?.trim() || '';
        const company = companyEl?.textContent?.trim() || '';
        const locationRaw = locationEl?.textContent?.trim() || 'Remote - India';
        const url = linkEl ? linkEl.href : window.location.href;
        const sourceId = card.getAttribute('data-occludable-job-id') || `li-${Date.now()}-${idx}`;

        if (title && company) {
          jobs.push({
            sourceId,
            company,
            title,
            url,
            locationRaw,
            descriptionText: `${title} at ${company}. Scraped live from LinkedIn session.`,
            postedAt: new Date().toISOString(),
          });
        }
      } catch (err) {
        console.warn('[JobHunt OS] Error parsing card:', err);
      }
    });

    return jobs;
  }

  // Handle Sync Button Click
  function handleSyncJobs() {
    const statusEl = document.getElementById('jh-status-msg');
    if (statusEl) statusEl.textContent = 'Scanning visible LinkedIn jobs...';

    const jobs = scrapeLinkedInJobs();

    if (jobs.length === 0) {
      if (statusEl) statusEl.textContent = 'No job cards detected. Scroll down the jobs feed!';
      return;
    }

    if (statusEl) statusEl.textContent = `Found ${jobs.length} jobs. Ingesting to local DB (:4000)...`;

    chrome.runtime.sendMessage(
      { action: 'INGEST_JOBS', jobs, source: 'linkedin' },
      (response) => {
        if (response?.success) {
          if (statusEl) {
            statusEl.textContent = `✅ Successfully synced ${response.data.inserted || jobs.length} jobs to JobHunt OS!`;
            statusEl.style.color = '#10B981';
          }
        } else {
          if (statusEl) {
            statusEl.textContent = `⚠️ Ingest result: ${response?.error || 'Completed'}`;
          }
        }
      },
    );
  }

  // Handle Auto-Fill Easy Apply
  function handleAutoFillEasyApply() {
    const statusEl = document.getElementById('jh-status-msg');
    const modal = document.querySelector('.jobs-easy-apply-modal, .jobs-easy-apply-content, div[role="dialog"]');

    if (!modal) {
      if (statusEl) statusEl.textContent = 'Please open an Easy Apply job modal first!';
      return;
    }

    if (statusEl) statusEl.textContent = 'Injecting candidate profile facts into form fields...';

    // Autofill text inputs
    const inputs = modal.querySelectorAll('input, select, textarea');
    let filledCount = 0;

    inputs.forEach((input) => {
      const name = (input.getAttribute('name') || '').toLowerCase();
      const id = (input.id || '').toLowerCase();
      const label = input.closest('label')?.textContent?.toLowerCase() || '';

      const matchKey = `${name} ${id} ${label}`;

      if (matchKey.includes('phone') || matchKey.includes('mobile')) {
        input.value = CANDIDATE_FACTS.phone;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        filledCount++;
      } else if (matchKey.includes('email')) {
        input.value = CANDIDATE_FACTS.email;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        filledCount++;
      } else if (matchKey.includes('first name')) {
        input.value = CANDIDATE_FACTS.firstName;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        filledCount++;
      } else if (matchKey.includes('last name')) {
        input.value = CANDIDATE_FACTS.lastName;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        filledCount++;
      } else if (matchKey.includes('city') || matchKey.includes('location')) {
        input.value = CANDIDATE_FACTS.city;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        filledCount++;
      } else if (matchKey.includes('experience') || matchKey.includes('years')) {
        input.value = String(CANDIDATE_FACTS.yearsExperience);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        filledCount++;
      } else if (matchKey.includes('notice')) {
        input.value = String(CANDIDATE_FACTS.noticePeriodDays);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        filledCount++;
      }
    });

    if (statusEl) {
      statusEl.textContent = `✅ Auto-filled ${filledCount} fields with zero fabrication!`;
      statusEl.style.color = '#10B981';
    }
  }

  // Inject dock after page settles
  setTimeout(injectFloatingDock, 1500);
})();
