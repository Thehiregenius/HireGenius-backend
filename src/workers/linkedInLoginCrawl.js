// ...existing code...
require("dotenv").config();
const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
puppeteer.use(StealthPlugin());

const LOGIN_MAX_ATTEMPTS = parseInt(process.env.LINKEDIN_LOGIN_MAX_ATTEMPTS, 10) || 1; // login only once by default
const CRAWL_MAX_ATTEMPTS = parseInt(process.env.LINKEDIN_CRAWL_MAX_ATTEMPTS, 10) || 1;
const MIN_DELAY = parseInt(process.env.LINKEDIN_MIN_DELAY_MS, 10) || 800;
const MAX_DELAY = parseInt(process.env.LINKEDIN_MAX_DELAY_MS, 10) || 2000;

let SESSION = null; // { browser, page, createdAt }

/** small random delay helper */
function randomDelay(min = MIN_DELAY, max = MAX_DELAY) {
  const ms = Math.floor(Math.random() * (max - min + 1) + min);
  return new Promise((r) => setTimeout(r, ms));
}

/** launch browser + page with conservative request interception and de-noised logging */
async function launchBrowser() {
  const chromePath = process.env.CHROME_PATH || undefined;
  // debug-friendly default: visible unless HEADLESS=1
  const headless = process.env.HEADLESS === "1" ? true : false;

  const browser = await puppeteer.launch({
    headless,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--start-maximized"],
    defaultViewport: null,
    executablePath: chromePath,
  });

  const page = await browser.newPage();

  // avoid flooding logs
  page._seenConsole = new Set();
  page._requestFailCount = 0;

  page.on("console", (msg) => {
    const text = typeof msg.text === "function" ? msg.text() : String(msg);
    const type = typeof msg.type === "function" ? msg.type() : "log";
    if (text.includes("Failed to load resource")) {
      if (page._seenConsole.has(text)) return;
      page._seenConsole.add(text);
      console.warn("PAGE_LOG:", text);
      return;
    }
    if (type === "error" || type === "warning") {
      if (page._seenConsole.has(text)) return;
      page._seenConsole.add(text);
      console[type === "error" ? "error" : "warn"]("PAGE_LOG:", type, text);
    }
  });

  page.on("pageerror", (err) => {
    const text = err?.toString?.() || String(err);
    if (!page._seenConsole.has(text)) {
      page._seenConsole.add(text);
      console.error("PAGE_ERROR:", text);
    }
  });

  page.on("requestfailed", (req) => {
    const f = req.failure && req.failure();
    const errText = f ? f.errorText : "request failed";
    if (errText && errText.includes("net::ERR_FAILED")) {
      page._requestFailCount++;
      if (page._requestFailCount <= 5) console.warn("PAGE_REQUEST_FAILED:", req.url(), errText);
      else if (page._requestFailCount === 6) console.warn("PAGE_REQUEST_FAILED: further failures suppressed");
    }
  });

  // intercept to reduce noise but DO NOT block stylesheets/fonts
  try {
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      const url = req.url();
      const resourceType = req.resourceType();
      const blockedTypes = ["image", "media", "websocket"]; // keep stylesheet/font
      const blockedUrls = /doubleclick|google-analytics|googlesyndication|adsystem|adservice|tracking|analytics/;
      if (blockedTypes.includes(resourceType) || blockedUrls.test(url)) return req.abort();
      return req.continue();
    });
  } catch (e) {
    // ignore if not supported in environment
  }

  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36"
  );
  await page.setViewport({ width: 1366, height: 768 });
  page.setDefaultNavigationTimeout(60000);

  return { browser, page };
}

/** Perform login once per process. Returns cached SESSION on subsequent calls. Throws on failure. */
async function loginOnce() {
  if (SESSION && SESSION.browser && SESSION.page && !SESSION.page.isClosed()) {
    return SESSION;
  }

  const email = process.env.LINKEDIN_EMAIL;
  const password = process.env.LINKEDIN_PASSWORD;
  if (!email || !password) throw new Error("Missing LINKEDIN_EMAIL or LINKEDIN_PASSWORD in .env");

  let lastErr = null;

  for (let attempt = 1; attempt <= LOGIN_MAX_ATTEMPTS; attempt++) {
    let browser, page;
    try {
      ({ browser, page } = await launchBrowser());

      // navigate to login
      await page.goto("https://www.linkedin.com/login", { waitUntil: "networkidle2", timeout: 60000 });
      await randomDelay();

      await page.waitForSelector("#username", { timeout: 15000 }).catch(() => null);
      await page.waitForSelector("#password", { timeout: 15000 }).catch(() => null);

      await page.type("#username", email, { delay: Math.floor(Math.random() * 30) + 30 }).catch(() => null);
      await page.type("#password", password, { delay: Math.floor(Math.random() * 30) + 30 }).catch(() => null);
      await randomDelay();

      await Promise.all([
        page.click("button[type='submit']").catch(() => null),
        Promise.race([
          page.waitForNavigation({ waitUntil: "networkidle2", timeout: 45000 }).catch(() => null),
          page.waitForSelector('input[role="combobox"], nav[aria-label="Main"], .search-global-typeahead__input', { timeout: 45000 }).catch(() => null),
        ]),
      ]).catch(() => null);

      await randomDelay();

      // detect immediate login errors or challenge
      const loginError = await page.$(".alert.error, .form__error, .signin-form__error, .login__error");
      const currentUrl = page.url();
      if (loginError) {
        lastErr = new Error("LinkedIn shows login error");
        try { await page.screenshot({ path: `linkedin-login-error-${attempt}.png`, fullPage: true }); } catch (_) {}
        await browser.close();
        continue;
      }
      if (currentUrl.includes("checkpoint/challenge")) {
        lastErr = new Error("LinkedIn checkpoint/challenge detected");
        try { await page.screenshot({ path: `linkedin-login-checkpoint-${attempt}.png`, fullPage: true }); } catch (_) {}
        await browser.close();
        continue;
      }

      // consider logged in if nav shows feed/jobs or a logged-in selector present
      const loggedInSelector = await page.$('input[role="combobox"], nav[aria-label="Main"], .search-global-typeahead__input');
      const loggedIn = currentUrl.includes("/feed") || currentUrl.includes("/jobs") || !!loggedInSelector;

      if (!loggedIn) {
        lastErr = new Error("Unable to confirm logged-in state");
        try { await page.screenshot({ path: `linkedin-login-unknown-${attempt}.png`, fullPage: true }); } catch (_) {}
        await browser.close();
        continue;
      }

      // success: cache session and return
      SESSION = { browser, page, createdAt: Date.now() };
      console.log("LinkedIn login successful — session cached.");
      return SESSION;
    } catch (err) {
      lastErr = err;
      try { if (page) await page.screenshot({ path: `linkedin-login-exception-${attempt}.png`, fullPage: true }); } catch (_) {}
      if (browser) try { await browser.close(); } catch (_) {}
      // do not retry login more than LOGIN_MAX_ATTEMPTS
      if (attempt < LOGIN_MAX_ATTEMPTS) await randomDelay(2000, 4000);
    }
  }

  throw lastErr || new Error("LinkedIn login failed");
}

/**
 * Crawl a profile using the cached session. Login is attempted only once via loginOnce().
 * Crawling has its own retry attempts (does NOT re-run login).
 * @param {string} profileUrl
 * @returns {Promise<Object>} { success: boolean, data: object }
 */
async function crawlLinkedInProfile(profileUrl) {
  if (!profileUrl) throw new Error("Missing profileUrl");

  // ensure logged in (loginOnce throws if cannot authenticate)
  const session = await loginOnce();
  const page = session.page;

  for (let attempt = 1; attempt <= CRAWL_MAX_ATTEMPTS; attempt++) {
    try {
      if (page.isClosed()) throw new Error("Session page is closed");

      // navigate to profile
      await page.goto(profileUrl, { waitUntil: "networkidle2", timeout: 60000 });
      await randomDelay(800, 1600);

      // ensure top card/h1 rendered
      await page.waitForSelector("h1, .pv-top-card, .text-heading-xlarge", { timeout: 30000 }).catch(() => null);
      await randomDelay();

      // attempt to open contact modal (best-effort)
      try {
        const contactBtn = await page.$('a[data-control-name="contact_see_more"], button[data-control-name="contact_see_more"], .pv-top-card__contact-info');
        if (contactBtn) {
          await contactBtn.click().catch(() => null);
          await page.waitForTimeout(800).catch(() => null);
        }
      } catch (_) {}

      // guarded evaluation inside page
      const evalResult = await page.evaluate(() => {
        try {
          const pickText = (sel, root = document) => root.querySelector(sel)?.innerText?.trim() || null;

          const name = pickText('h1[class*="break-words"], h1, .text-heading-xlarge') || "";
          const headline = pickText('.text-body-medium.break-words, .pv-top-card--list .text-body-medium, .pv-top-card__occupation') || "";
          const location = pickText('.pv-top-card--list-bullet, .pv-top-card__location, .t-16.t-black--light') || "";
          const about = pickText('#about .pv-about__summary-text, #about .lt-line-clamp__raw-line, .pv-about__summary-text') || "";

          const skills = Array.from(document.querySelectorAll('.pv-skill-category-entity__name, .skill-pill, .pv-skill-entity__skill-name'))
            .map(n => n.innerText && n.innerText.trim())
            .filter(Boolean);

          const education = Array.from(document.querySelectorAll('#education .pv-education-entity, .pv-education-entity, .education-section li'))
            .map(el => ({
              school: el.querySelector('h3')?.innerText?.trim() || el.querySelector('.pv-entity__school-name')?.innerText?.trim() || "",
              degree: el.querySelector('.pv-entity__degree-name')?.innerText?.trim() || "",
              period: el.querySelector('.pv-entity__dates')?.innerText?.trim() || ""
            }));

          const experiences = Array.from(document.querySelectorAll('.experience-section .pv-entity__position-group-pager li, .pv-position-entity, .pv-entity__position-group-item, .pv-profile-section__card-item'))
            .map(el => ({
              title: el.querySelector('h3')?.innerText?.trim() || el.querySelector('.t-bold')?.innerText?.trim() || "",
              company: el.querySelector('.pv-entity__secondary-title')?.innerText?.trim() || el.querySelector('.pv-entity__company-name')?.innerText?.trim() || "",
              period: el.querySelector('.pv-entity__date-range span:nth-child(2)')?.innerText?.trim() || "",
              description: el.querySelector('.pv-entity__description, .pv-entity__summary')?.innerText?.trim() || ""
            }));

          // try reading contact info visible in modal (best-effort)
          const contactModal = document.querySelector('.pv-contact-info__contact-type');
          const contact = {};
          if (contactModal) {
            contact.email = contactModal.querySelector('.ci-email a')?.innerText?.trim() || null;
            contact.phone = contactModal.querySelector('.ci-phone span')?.innerText?.trim() || null;
            contact.website = contactModal.querySelector('.ci-websites a')?.innerText?.trim() || null;
          } else {
            contact.email = document.querySelector('.ci-email a')?.innerText?.trim() || null;
            contact.phone = document.querySelector('.ci-phone span')?.innerText?.trim() || null;
          }

          return { ok: true, data: { name, headline, location, about, skills, education, experiences, contact } };
        } catch (e) {
          return { ok: false, error: e && e.message ? e.message : String(e) };
        }
      });

      if (!evalResult || !evalResult.ok) {
        try { await page.screenshot({ path: `linkedin-eval-error-attempt-${attempt}.png`, fullPage: true }); } catch (_) {}
        throw new Error("Profile evaluation failed: " + (evalResult && evalResult.error));
      }

      const profile = evalResult.data;

      try { await page.screenshot({ path: `linkedin-crawl-success-${Date.now()}.png`, fullPage: true }); } catch (_) {}

      // optional: keep browser open for debugging
      if (process.env.KEEP_BROWSER_OPEN === "1") {
        console.log("KEEP_BROWSER_OPEN=1 — session remains open for inspection.");
        return { success: true, data: profile };
      }

      // do NOT close browser here; keep session for reuse. If you want to close, use closeSession().
      return { success: true, data: profile };
    } catch (err) {
      // transient error during crawl; retry without re-login
      try { await session.page.screenshot({ path: `linkedin-crawl-exception-${attempt}.png`, fullPage: true }); } catch (_) {}
      if (attempt < CRAWL_MAX_ATTEMPTS) {
        console.warn(`Crawl attempt ${attempt} failed: ${err.message}. Retrying...`);
        await randomDelay(1500 + attempt * 1000, 3000 + attempt * 1000);
        continue;
      }
      // final failure
      throw new Error("Crawl failed after attempts: " + err.message);
    }
  }

  // unreachable
  throw new Error("Crawl failed - loop exit");
}

/** Close cached session/browser (call from worker shutdown or tests) */
async function closeSession() {
  if (SESSION && SESSION.browser) {
    try { await SESSION.browser.close(); } catch (_) {}
  }
  SESSION = null;
}

module.exports = { loginOnce, crawlLinkedInProfile, closeSession };
// ...existing code...