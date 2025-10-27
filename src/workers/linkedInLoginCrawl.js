// ...existing code...
require("dotenv").config();
const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const UserAgent = require("user-agents");
puppeteer.use(StealthPlugin());

// Configure constants
const LOGIN_MAX_ATTEMPTS =
  parseInt(process.env.LINKEDIN_LOGIN_MAX_ATTEMPTS, 10) || 1;
const CRAWL_MAX_ATTEMPTS =
  parseInt(process.env.LINKEDIN_CRAWL_MAX_ATTEMPTS, 10) || 1;
const MIN_DELAY = parseInt(process.env.LINKEDIN_MIN_DELAY_MS, 10) || 800;
const MAX_DELAY = parseInt(process.env.LINKEDIN_MAX_DELAY_MS, 10) || 2000;
const TYPE_MIN_DELAY = parseInt(process.env.TYPE_MIN_DELAY_MS, 10) || 100;
const TYPE_MAX_DELAY = parseInt(process.env.TYPE_MAX_DELAY_MS, 10) || 300;

let SESSION = null; // { browser, page, createdAt }

/** Helper functions for human-like behavior */
function randomDelay(min = MIN_DELAY, max = MAX_DELAY) {
  const ms = Math.floor(Math.random() * (max - min + 1) + min);
  return new Promise((r) => setTimeout(r, ms));
}

/** Simulate human-like typing with random delays between keystrokes */
async function humanLikeType(page, selector, text) {
  await page.waitForSelector(selector);
  for (const char of text) {
    await page.type(selector, char);
    await randomDelay(TYPE_MIN_DELAY, TYPE_MAX_DELAY);
  }
}

/** Simulate random scrolling behavior */
async function randomScroll(page) {
  await page.evaluate(async () => {
    const height = document.body.scrollHeight;
    const scrollSteps = Math.floor(Math.random() * 4) + 3; // 3-7 scrolls

    for (let i = 0; i < scrollSteps; i++) {
      const scrollPoint = Math.floor(Math.random() * height);
      window.scrollTo({
        top: scrollPoint,
        behavior: "smooth",
      });
      await new Promise((r) => setTimeout(r, Math.random() * 2000 + 1000));
    }
  });
}

/** Add random mouse movements */
async function randomMouseMovements(page) {
  await page.evaluate(() => {
    const moveCount = Math.floor(Math.random() * 5) + 3; // 3-8 movements
    for (let i = 0; i < moveCount; i++) {
      const x = Math.floor(Math.random() * window.innerWidth);
      const y = Math.floor(Math.random() * window.innerHeight);
      const event = new MouseEvent("mousemove", {
        bubbles: true,
        clientX: x,
        clientY: y,
      });
      document.dispatchEvent(event);
    }
  });
}

/** launch browser + page with enhanced anti-detection */
async function launchBrowser() {
  const chromePath = process.env.CHROME_PATH || undefined;
  const headless = process.env.HEADLESS === "1" ? true : false;

  // Generate random user agent
  const ua = new UserAgent();
  const userAgent = ua.toString();
  console.log("Using User Agent:", userAgent);

  // Enhanced anti-detection options
  const args = [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--start-maximized",
    "--disable-blink-features=AutomationControlled",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    "--disable-notifications",
    "--disable-popup-blocking",
    "--disable-extensions",
    "--disable-infobars",
    "--ignore-certificate-errors",
    "--window-size=1920,1080",
    "--lang=en-US,en",
    "--disable-web-security",
  ];

  const browser = await puppeteer.launch({
    headless,
    args,
    defaultViewport: null,
    executablePath: chromePath,
  });

  const page = await browser.newPage();

  // Add experimental features for better anti-detection
  await page.evaluateOnNewDocument(() => {
    // Override navigator properties
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    Object.defineProperty(navigator, "languages", {
      get: () => ["en-US", "en"],
    });

    // Add chrome properties
    window.chrome = {
      app: {},
      runtime: {},
      loadTimes: function () {},
      csi: function () {},
    };

    // Add plugins
    const plugins = [
      { name: "Chrome PDF Plugin", filename: "internal-pdf-viewer" },
      {
        name: "Chrome PDF Viewer",
        filename: "mhjfbmdgcfjbbpaeojofohoefgiehjai",
      },
      { name: "Native Client", filename: "internal-nacl-plugin" },
    ];
    plugins.__proto__ = PluginArray.prototype;
    Object.defineProperty(navigator, "plugins", { get: () => plugins });
  });

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
      if (page._requestFailCount <= 5)
        console.warn("PAGE_REQUEST_FAILED:", req.url(), errText);
      else if (page._requestFailCount === 6)
        console.warn("PAGE_REQUEST_FAILED: further failures suppressed");
    }
  });

  // intercept to reduce noise but DO NOT block stylesheets/fonts
  try {
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      const url = req.url();
      const resourceType = req.resourceType();
      const blockedTypes = ["image", "media", "websocket"]; // keep stylesheet/font
      const blockedUrls =
        /doubleclick|google-analytics|googlesyndication|adsystem|adservice|tracking|analytics/;
      if (blockedTypes.includes(resourceType) || blockedUrls.test(url))
        return req.abort();
      return req.continue();
    });
  } catch (e) {
    // ignore if not supported in environment
  }

  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36"
  );
  await page.setViewport({ width: 1366, height: 768 });
  // Increase navigation timeout to handle slower responses on LinkedIn
  page.setDefaultNavigationTimeout(120000);

  return { browser, page };
}

/** Perform login once per process. Returns cached SESSION on subsequent calls. Throws on failure. */
async function loginOnce() {
  if (SESSION && SESSION.browser && SESSION.page && !SESSION.page.isClosed()) {
    return SESSION;
  }

  const email = process.env.LINKEDIN_EMAIL;
  const password = process.env.LINKEDIN_PASSWORD;
  if (!email || !password)
    throw new Error("Missing LINKEDIN_EMAIL or LINKEDIN_PASSWORD in .env");

  let lastErr = null;

  for (let attempt = 1; attempt <= LOGIN_MAX_ATTEMPTS; attempt++) {
    let browser, page;
    try {
      ({ browser, page } = await launchBrowser());

      // Random initial delay to simulate page load
      await randomDelay(2000, 4000);

      // First go to homepage, then to login page like a real user
      await page.goto("https://www.linkedin.com", {
        waitUntil: "networkidle2",
      });
      await randomDelay(1000, 2000);

      await page.goto("https://www.linkedin.com/login", {
        waitUntil: "networkidle2",
      });
      await randomDelay(1500, 3000);

      // Human-like typing for credentials
      await humanLikeType(page, "#username", email);
      await randomDelay(1000, 2000);

      await humanLikeType(page, "#password", password);
      await randomDelay(1000, 2000);

      // Add random mouse movements before clicking
      await randomMouseMovements(page);

      // Click the submit button with human-like behavior
      await page.evaluate(() => {
        const button = document.querySelector('button[type="submit"]');
        const rect = button.getBoundingClientRect();
        const x = rect.left + rect.width * Math.random();
        const y = rect.top + rect.height * Math.random();
        const event = new MouseEvent("click", {
          bubbles: true,
          clientX: x,
          clientY: y,
        });
        button.dispatchEvent(event);
      });

      // Wait for successful login
      await Promise.race([
        page.waitForNavigation({ waitUntil: "networkidle2" }),
        page.waitForSelector('input[role="combobox"]'),
      ]);

      // Add random scroll and delay after login
      await randomScroll(page);
      await randomDelay(3000, 5000);

      // Verify successful login
      const url = page.url();
      if (url.includes("/login") || url.includes("/checkpoint")) {
        throw new Error(`Login failed - redirected to ${url}`);
      }

      console.log("Login successful!");
      SESSION = { browser, page, createdAt: Date.now() };
      return SESSION;
    } catch (err) {
      lastErr = err;
      console.error(`Login attempt ${attempt} failed:`, err.message);

      if (page) {
        await page.screenshot({ path: `login-error-${attempt}.png` });
      }
      if (browser) {
        await browser.close();
      }

      if (attempt < LOGIN_MAX_ATTEMPTS) {
        const delayMs = Math.pow(2, attempt) * 1000;
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
  }

  throw new Error(
    `Failed to login after ${LOGIN_MAX_ATTEMPTS} attempts. Last error: ${lastErr.message}`
  );
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

      // Add initial random delay before navigation
      await randomDelay(2000, 4000);

      // Navigate to profile following the Python crawler approach: try a navigation,
      // then attempt several refreshes while waiting for the top-card selector.
      await page
        .goto(profileUrl, { waitUntil: "domcontentloaded", timeout: 120000 })
        .catch(() => {});
      // small human-like pause after navigation
      await randomDelay(2000, 4000);

      // Try waiting for the main profile selectors; refresh up to 2 times if not found
      let topFound = false;
      for (let i = 0; i < 3; i++) {
        try {
          await page.waitForSelector("h1, .pv-top-card, .text-heading-xlarge", {
            timeout: 30000,
          });
          topFound = true;
          break;
        } catch (waitErr) {
          console.warn(
            `Top-card not found (attempt ${i + 1}/3): ${waitErr.message}`
          );
          // try a soft reload like a human navigating
          try {
            await page.reload({
              waitUntil: "domcontentloaded",
              timeout: 120000,
            });
          } catch (reloadErr) {
            console.warn(`Reload ${i + 1} failed: ${reloadErr.message}`);
          }
          // progressively longer pause between attempts
          await randomDelay(2000 + i * 1000, 3500 + i * 1000);
        }
      }

      const currentUrl = page.url();
      if (
        currentUrl.includes("checkpoint") ||
        currentUrl.includes("authwall")
      ) {
        throw new Error("Hit LinkedIn verification page");
      }

      if (!topFound) {
        console.warn(
          "Top-card selectors not found after retries; proceeding but results may be incomplete."
        );
      }

      // Add human-like activity after load
      await randomScroll(page);
      await randomDelay(1500, 3000);
      await randomMouseMovements(page);

      // ensure top card/h1 rendered
      await page
        .waitForSelector("h1, .pv-top-card, .text-heading-xlarge", {
          timeout: 30000,
        })
        .catch(() => null);
      await randomDelay();

      // attempt to open contact modal (best-effort)
      try {
        const contactBtn = await page.$(
          'a[data-control-name="contact_see_more"], button[data-control-name="contact_see_more"], .pv-top-card__contact-info'
        );
        if (contactBtn) {
          await contactBtn.click().catch(() => null);
          await page.waitForTimeout(800).catch(() => null);
        }
      } catch (_) {}

      // guarded evaluation inside page
      const evalResult = await page.evaluate(() => {
        try {
          const pickText = (sel, root = document) =>
            root.querySelector(sel)?.innerText?.trim() || null;

          const name =
            pickText('h1[class*="break-words"], h1, .text-heading-xlarge') ||
            "";
          const headline =
            pickText(
              ".text-body-medium.break-words, .pv-top-card--list .text-body-medium, .pv-top-card__occupation"
            ) || "";
          const location =
            pickText(
              ".pv-top-card--list-bullet, .pv-top-card__location, .t-16.t-black--light"
            ) || "";
          const about =
            pickText(
              "#about .pv-about__summary-text, #about .lt-line-clamp__raw-line, .pv-about__summary-text"
            ) || "";

          const skills = Array.from(
            document.querySelectorAll(
              ".pv-skill-category-entity__name, .skill-pill, .pv-skill-entity__skill-name"
            )
          )
            .map((n) => n.innerText && n.innerText.trim())
            .filter(Boolean);

          const education = Array.from(
            document.querySelectorAll(
              "#education .pv-education-entity, .pv-education-entity, .education-section li"
            )
          ).map((el) => ({
            school:
              el.querySelector("h3")?.innerText?.trim() ||
              el.querySelector(".pv-entity__school-name")?.innerText?.trim() ||
              "",
            degree:
              el.querySelector(".pv-entity__degree-name")?.innerText?.trim() ||
              "",
            period:
              el.querySelector(".pv-entity__dates")?.innerText?.trim() || "",
          }));

          const experiences = Array.from(
            document.querySelectorAll(
              ".experience-section .pv-entity__position-group-pager li, .pv-position-entity, .pv-entity__position-group-item, .pv-profile-section__card-item"
            )
          ).map((el) => ({
            title:
              el.querySelector("h3")?.innerText?.trim() ||
              el.querySelector(".t-bold")?.innerText?.trim() ||
              "",
            company:
              el
                .querySelector(".pv-entity__secondary-title")
                ?.innerText?.trim() ||
              el.querySelector(".pv-entity__company-name")?.innerText?.trim() ||
              "",
            period:
              el
                .querySelector(".pv-entity__date-range span:nth-child(2)")
                ?.innerText?.trim() || "",
            description:
              el
                .querySelector(".pv-entity__description, .pv-entity__summary")
                ?.innerText?.trim() || "",
          }));

          // try reading contact info visible in modal (best-effort)
          const contactModal = document.querySelector(
            ".pv-contact-info__contact-type"
          );
          const contact = {};
          if (contactModal) {
            contact.email =
              contactModal.querySelector(".ci-email a")?.innerText?.trim() ||
              null;
            contact.phone =
              contactModal.querySelector(".ci-phone span")?.innerText?.trim() ||
              null;
            contact.website =
              contactModal.querySelector(".ci-websites a")?.innerText?.trim() ||
              null;
          } else {
            contact.email =
              document.querySelector(".ci-email a")?.innerText?.trim() || null;
            contact.phone =
              document.querySelector(".ci-phone span")?.innerText?.trim() ||
              null;
          }

          return {
            ok: true,
            data: {
              name,
              headline,
              location,
              about,
              skills,
              education,
              experiences,
              contact,
            },
          };
        } catch (e) {
          return { ok: false, error: e && e.message ? e.message : String(e) };
        }
      });

      if (!evalResult || !evalResult.ok) {
        try {
          await page.screenshot({
            path: `linkedin-eval-error-attempt-${attempt}.png`,
            fullPage: true,
          });
        } catch (_) {}
        throw new Error(
          "Profile evaluation failed: " + (evalResult && evalResult.error)
        );
      }

      const profile = evalResult.data;

      try {
        await page.screenshot({
          path: `linkedin-crawl-success-${Date.now()}.png`,
          fullPage: true,
        });
      } catch (_) {}

      // optional: keep browser open for debugging
      if (process.env.KEEP_BROWSER_OPEN === "1") {
        console.log(
          "KEEP_BROWSER_OPEN=1 — session remains open for inspection."
        );
        return { success: true, data: profile };
      }

      // do NOT close browser here; keep session for reuse. If you want to close, use closeSession().
      return { success: true, data: profile };
    } catch (err) {
      // transient error during crawl; retry without re-login
      try {
        await session.page.screenshot({
          path: `linkedin-crawl-exception-${attempt}.png`,
          fullPage: true,
        });
      } catch (_) {}
      if (attempt < CRAWL_MAX_ATTEMPTS) {
        console.warn(
          `Crawl attempt ${attempt} failed: ${err.message}. Retrying...`
        );
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
    try {
      await SESSION.browser.close();
    } catch (_) {}
  }
  SESSION = null;
}

module.exports = { loginOnce, crawlLinkedInProfile, closeSession };
