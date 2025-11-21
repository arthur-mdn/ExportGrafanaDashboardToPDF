'use strict';

const puppeteer = require('puppeteer');
const fs = require('fs');
const logger = require('./logger');

logger.info("Script: grafana_pdf.js started");

const args = process.argv.slice(2);
const url = args[0];
const auth_string = args[1];
const widthArg = args.find(arg => arg.startsWith('--pdfWidthPx='));
const heightArg = args.find(arg => arg.startsWith('--pdfHeightPx='));
const useServiceAccount = process.env.GRAFANA_SERVICE_ACCOUNT === 'true';
let outfile = null;

const width_px = widthArg ? parseInt(widthArg.split('=')[1], 10) : parseInt(process.env.PDF_WIDTH_PX, 10) || 1920;
const envHeight = process.env.PDF_HEIGHT_PX;
const overrideHeight = heightArg
    ? parseInt(heightArg.split('=')[1], 10)
    : (envHeight && envHeight !== 'auto') ? parseInt(envHeight, 10) : null;
logger.info("PDF width set to:", width_px);
logger.info("PDF height set to:", overrideHeight !== null ? overrideHeight : "auto (auto-detected)");

const auth_header = useServiceAccount ? 'Bearer ' + auth_string : 'Basic ' + Buffer.from(auth_string).toString('base64');
logger.info("Using authentication:",  useServiceAccount ? "Service Account" : "Basic Auth");

(async () => {
    try {
        logger.info("Checking URL accessibility");
        logger.debug("URL provided:", url);
        const response = await fetch(url, {
            method: 'GET',
            headers: {'Authorization': auth_header}
        });

        if (!response.ok) {
            throw new Error(`Unable to access URL. HTTP status: ${response.status}`);
        }

        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('text/html')) {
            throw new Error("The URL provided is not a valid Grafana instance.");
        }

        let finalUrl = url;
        if(process.env.FORCE_KIOSK_MODE === 'true') {
            logger.info("Checking if kiosk mode is enabled");
            const urlObj = new URL(finalUrl);
            if (!urlObj.searchParams.has('kiosk')) {
                logger.debug("Kiosk mode not enabled. Enabling it");
                urlObj.searchParams.set('kiosk', '1');
                finalUrl = urlObj.toString();
            }
            logger.debug("Final URL with kiosk mode:", finalUrl);
        }

        logger.info("Starting browser...");
        const browser = await puppeteer.launch({
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
            headless: true,
            args: [
              '--no-sandbox',
              '--disable-setuid-sandbox',
              '--disable-gpu',
              '--disable-dev-shm-usage'
            ]
        });

        const page = await browser.newPage();
        logger.debug("Browser started...");

        await page.setExtraHTTPHeaders({'Authorization': auth_header});
        await page.setDefaultNavigationTimeout(process.env.PUPPETEER_NAVIGATION_TIMEOUT || 120000);

        await page.setViewport({
            width: width_px,
            height: 800,
            deviceScaleFactor: 2,
            isMobile: false
        });

        logger.debug("Navigating to URL");
        await page.goto(finalUrl, {
          waitUntil: ['networkidle0', 'domcontentloaded'],
          timeout: process.env.PUPPETEER_NAVIGATION_TIMEOUT || 120000
        });
        logger.debug("Page loaded...");

        page.on('console', msg => {
            for (let i = 0; i < msg.args().length; ++i)
                msg.args()[i].jsonValue().then(val => logger.debug(`[Browser console] ${msg.type()}:`, val));
        });

        let dashboardName = 'output_grafana';
        let date = new Date().toISOString().split('T')[0];
        const addRandomStr = process.env.ADD_RANDOM_STRING_TO_FILE_NAME === 'true';

        if (process.env.EXTRACT_DATE_AND_DASHBOARD_NAME_FROM_HTML_PANEL_ELEMENTS === 'true') {
            logger.debug("Extracting dashboard name and date from the HTML page...");
            let scrapedDashboardName = await page.evaluate(() => {
                const dashboardElement = document.getElementById('gfexp_display_actual_dashboard_title');
                return dashboardElement ? dashboardElement.innerText.trim() : null;
            });

            let scrapedDate = await page.evaluate(() => {
                const dateElement = document.getElementById('gfexp_display_actual_date');
                return dateElement ? dateElement.innerText.trim() : null;
            });

            let scrapedPanelName = await page.evaluate(() => {
                const scrapedPanelName = document.querySelectorAll('h6');
                if (scrapedPanelName.length > 1) { // Multiple panels detected
                    logger.warn("Set to extract name and date from dashboard. Multiple panels detected. Unable to fetch a unique panel name. Using default value")
                    return null;
                }
                if (scrapedPanelName[0] && scrapedPanelName[0].innerText.trim() === '') {
                    logger.warn("Set to extract name and date from dashboard. Empty panel name detected. Using default value")
                    return null;
                }
                return scrapedPanelName[0] ? scrapedPanelName[0].innerText.trim() : null;
            });

            if (scrapedPanelName && !scrapedDashboardName) {
                logger.debug("Panel name fetched:", scrapedPanelName);
                dashboardName = scrapedPanelName;
            } else if (!scrapedDashboardName) {
                logger.warn("Set to extract name and date from dashboard. Dashboard name not found. Using default value");
            } else {
                logger.debug("Dashboard name fetched:", scrapedDashboardName);
                dashboardName = scrapedDashboardName;
            }

            if (scrapedPanelName && !scrapedDate) {
                const urlParts = new URL(url);
                const from = urlParts.searchParams.get('from');
                const to = urlParts.searchParams.get('to');
                if (from && to) {
                    const fromDate = isNaN(from) ? from.replace(/[^\w\s-]/g, '_') : new Date(parseInt(from)).toISOString().split('T')[0];
                    const toDate = isNaN(to) ? to.replace(/[^\w\s-]/g, '_') : new Date(parseInt(to)).toISOString().split('T')[0];
                    date = `${fromDate}_to_${toDate}`;
                } else {
                    // using date in URL
                    date = new Date().toISOString().split('T')[0];
                }
            } else if (!scrapedDate) {
                logger.warn("Set to extract name and date from dashboard. Date not found. Using default value");
            } else {
                logger.debug("Date fetched:", date);
                date = scrapedDate;
            }
        } else {
            logger.debug("Extracting dashboard name and date from the URL");
            const urlParts = new URL(url);
            const pathSegments = urlParts.pathname.split('/');
            dashboardName = pathSegments[pathSegments.length - 1] || dashboardName;
            const from = urlParts.searchParams.get('from');
            const to = urlParts.searchParams.get('to');
            if (from && to) {
                const fromDate = isNaN(from) ? from.replace(/[^\w\s-]/g, '_') : new Date(parseInt(from)).toISOString().split('T')[0];
                const toDate = isNaN(to) ? to.replace(/[^\w\s-]/g, '_') : new Date(parseInt(to)).toISOString().split('T')[0];
                date = `${fromDate}_to_${toDate}`;
            } else {
                date = new Date().toISOString().split('T')[0];
            }
            logger.debug("Dashboard name fetched from URL:", dashboardName);
            logger.debug("Trying to fetch the panel name from the page")
            let scrapedPanelName = await page.evaluate(() => {
                const scrapedPanelName = document.querySelectorAll('h6');
                logger.debug("Scraped panel name:", scrapedPanelName);
                if (scrapedPanelName.length > 1) { // Multiple panels detected
                    logger.warn("Tried to extract panel name. Multiple panels detected. Unable to fetch a unique panel name. Using default value")
                    return null;
                }
                if (scrapedPanelName[0] && scrapedPanelName[0].innerText.trim() === '') {
                    logger.warn("Tried to extact panel name. Empty panel name detected. Using default value.")
                    return null;
                }
                return scrapedPanelName[0] ? scrapedPanelName[0].innerText.trim() : null;
            });

            if (scrapedPanelName) {
                logger.debug("Panel name fetched:", scrapedPanelName);
                dashboardName = scrapedPanelName;
            }

            logger.debug("Date fetched from URL:", date);
        }

        logger.debug("Should add random string to filename:", addRandomStr);
        outfile = `./output/${dashboardName.replace(/\s+/g, '_')}_${date.replace(/\s+/g, '_')}${addRandomStr ? '_' + Math.random().toString(36).substring(7) : ''}.pdf`;

        const loginPageDetected = await page.evaluate(() => {
            const resetPasswordButton = document.querySelector('a[href*="reset-email"]');
            return !!resetPasswordButton;
        })

        if (loginPageDetected) {
            throw new Error("Login page detected. Check your credentials.");
        }

        // Debug panel count and status - improved for Grafana 12
        const panelCount = await page.evaluate(() => {
            const panelSelectors = [
                '[data-testid="panel"]',
                '.panel-container',
                '.react-grid-item',
                '.dashboard-panel'
            ];

            let counts = {};
            for (const selector of panelSelectors) {
                const elements = document.querySelectorAll(selector);
                counts[selector] = elements.length;
            }
            return counts;
        });
        logger.debug("Panel detection counts:", panelCount);

        if(process.env.DEBUG_MODE === 'true') {
            const documentHTML = await page.evaluate(() => {
                return document.querySelector("*").outerHTML;
            });
            if (!fs.existsSync('./debug')) {
                fs.mkdirSync('./debug');
            }
            const filename = `./debug/debug_${dashboardName.replace(/\s+/g, '_')}_${date.replace(/\s+/g, '_')}${'_' + Math.random().toString(36).substring(7)}.html`;
            fs.writeFileSync(filename, documentHTML);
            logger.info("Debug HTML file saved at:", filename);

            // Enhanced debug information for panel visibility
            const panelInfo = await page.evaluate(() => {
                const allSelectors = [
                    '[data-testid="panel"]',
                    '.panel-container',
                    '.react-grid-item',
                    '.dashboard-panel'
                ];

                // Find which selector works for this Grafana version
                let panels = [];
                let usedSelector = '';

                for (const selector of allSelectors) {
                    const elements = document.querySelectorAll(selector);
                    if (elements && elements.length > 0) {
                        panels = Array.from(elements);
                        usedSelector = selector;
                        break;
                    }
                }

                return {
                    usedSelector,
                    panelCount: panels.length,
                    panels: panels.map((panel, index) => {
                        const rect = panel.getBoundingClientRect();
                        const style = window.getComputedStyle(panel);
                        return {
                            index,
                            visible: rect.width > 0 && rect.height > 0,
                            displayed: style.display !== 'none',
                            position: {
                                top: rect.top,
                                left: rect.left,
                                width: rect.width,
                                height: rect.height
                            },
                            computedStyle: {
                                display: style.display,
                                visibility: style.visibility,
                                opacity: style.opacity
                            }
                        };
                    })
                };
            });
            logger.info("Panel detection details:", JSON.stringify(panelInfo, null, 2));
        }

        // IMPROVED: Enhanced panel detection and rendering for Grafana 12 compatibility
        logger.info("Ensuring panels are properly rendered...");
        await page.evaluate(async () => {
            // Force all known panel types to be visible
            const panelSelectors = [
                '[data-testid="panel"]',
                '.panel-container',
                '.react-grid-item',
                '.dashboard-panel',
                '.grafana-dashboard-panel'
            ];

            for (const selector of panelSelectors) {
                const panels = document.querySelectorAll(selector);
                if (panels.length > 0) {
                    logger.debug(`Found ${panels.length} panels with selector ${selector}`);

                    // Make sure all panels are visible
                    Array.from(panels).forEach((panel, i) => {
                        panel.style.display = 'block';
                        panel.style.visibility = 'visible';
                        panel.style.opacity = '1';
                        logger.debug(`Ensured visibility of panel ${i+1}`);
                    });
                }
            }
        });

        async function expandCollapsedPanels(page) {
            const debugMode = process.env.DEBUG_MODE === 'true';
            if (debugMode) logger.debug('Searching for collapsed panels/rows...');

            // Panel and row selectors for different Grafana versions
            const selectors = [
                '[data-testid="panel"][aria-expanded="false"]',
                '.panel-collapsed',
                '.row-collapsed',
                '.dashboard-row--collapsed',
                '.dashboard-row[aria-expanded="false"]',
                '.panel-title-container .fa-chevron-right',
                '.panel-title-container .fa-angle-right',
                '.panel-title-container .fa-caret-right',
                '.dashboard-row__title .fa-chevron-right',
                '.dashboard-row__title .fa-angle-right',
                '.dashboard-row__title .fa-caret-right',
                '.row-title-container .fa-chevron-right',
                '.row-title-container .fa-angle-right',
                '.row-title-container .fa-caret-right',
                'button[aria-label="Expand row"]'
            ];

            const expanded = await page.evaluate(async (selectors, debugMode) => {
                let expandedCount = 0;

                for (const selector of selectors) {
                    const elements = document.querySelectorAll(selector);
                    if (elements.length > 0 && debugMode) {
                        logger.debug(`Found expandable elements for ${selector}: ${elements.length}`);
                    }

                    for (const el of elements) {
                        try {
                            // Try clicking on the expand icon
                            if (typeof el.click === 'function') {
                                el.click();
                                expandedCount++;
                                if (debugMode) logger.debug(`Clicked on element: ${selector}`);
                            } else {
                                // Fallback: Try clicking on parent element
                                if (el.parentElement && typeof el.parentElement.click === 'function') {
                                    el.parentElement.click();
                                    expandedCount++;
                                    if (debugMode) logger.debug(`Clicked on parent element: ${selector}`);
                                }
                            }
                        } catch (error) {
                            if (debugMode) logger.debug(`Error clicking on ${selector}: ${error.message}`);
                        }
                    }
                }

                // Wait after clicks so content can load
                if (expandedCount > 0) {
                    await new Promise(resolve => setTimeout(resolve, 2000 + expandedCount * 500));
                }

                return expandedCount;
            }, selectors, debugMode);

            if (debugMode) logger.debug(`Number of expanded panels/rows: ${expanded}`);
            return expanded;
        }

        const expandPanels = process.env.EXPAND_COLLAPSED_PANELS !== 'false';
        if (expandPanels) {
            logger.info("Searching and expanding collapsed panels/rows...");
            const expanded = await expandCollapsedPanels(page);
            if (expanded > 0) {
                logger.info(`Expanded ${expanded} panels/rows. Waiting for content to load...`);
                await page.evaluate(timeout => new Promise(resolve => setTimeout(resolve, timeout)), 2000 + expanded * 500);
            } else {
                logger.warn("No collapsed panels/rows found.");
            }
        } else {
            logger.debug("Automatic expansion of collapsed panels is disabled.");
        }

        const expandTables = process.env.EXPAND_TABLES !== 'false';
        if (expandTables) {
            logger.info("Looking for tables to expand...");

            const expandedTables = await page.evaluate(async () => {
                const panelSelectors = [
                    'div.react-grid-item',
                    'div[data-griditem-key]',
                    'div[class*="react-grid-item"]'
                ];

                const tableSelectors = [
                    'div[role="table"]',
                    '[data-testid*="panel content"] div[role="table"]',
                    '[data-panel-id] div[role="table"]'
                ];

                const strategies = [
                    {
                        name: 'Grafana ≥ v11.5 – nested scrollable view',
                        selector: '.scrollbar-view > div div[data-testid*="table body"] .scrollbar-view > div > div',
                    },
                    {
                        name: 'Grafana ≤ v11 – fallback inner wrapper',
                        selector: '.scrollbar-view > div > div',
                    },
                    {
                        name: 'Fallback: direct inner content with height',
                        selector: '.scrollbar-view div[style*="height"]',
                    }
                ];

                const expandedPanels = new Set();

                for (const panelSel of panelSelectors) {
                    const panels = Array.from(document.querySelectorAll(panelSel));
                    for (const panel of panels) {
                        if (expandedPanels.has(panel)) continue;

                        let table = null;
                        for (const tSel of tableSelectors) {
                            table = panel.querySelector(tSel);
                            if (table) break;
                        }
                        if (!table) continue;

                        for (const strat of strategies) {
                            const target = table.querySelector(strat.selector);
                            if (!target) continue;

                            const originalHeight = target.offsetHeight;
                            const panelHeight = panel.offsetHeight;

                            if (originalHeight > panelHeight) {
                                const newHeight = originalHeight + 100;
                                panel.style.height = `${newHeight}px`;
                                panel.style.minHeight = `${newHeight}px`;

                                await new Promise(resolve => setTimeout(resolve, 100));

                                const updatedHeight = target.offsetHeight;
                                logger.debug(`Height after layout update: ${updatedHeight}px (was: ${originalHeight})`);

                                if (updatedHeight !== newHeight) {
                                    const finalHeight = updatedHeight + 100;
                                    panel.style.height = `${finalHeight}px`;
                                    panel.style.minHeight = `${finalHeight}px`;
                                    logger.debug(`Re-adjusted panel to match updated child height: ${finalHeight}px`);
                                }

                                logger.debug(`Table panel expanded using strategy: ${strat.name}`);
                                expandedPanels.add(panel);
                                break;
                            }
                        }
                    }
                }

                return expandedPanels.size;
            });

            logger.info(`Expanded ${expandedTables} scrollable table(s).`);
        }

        await page.evaluate((hideDashboardControls) => {
            const selectorsToHide = [
                '.panel-info-corner',
                '.react-resizable-handle',
                'div[data-testid*="Alert error"]',
                'div[data-testid*="title-items-container"]',
                'div[class*="toolbar-button-panel-menu"]'
            ];

            if (hideDashboardControls) {
                selectorsToHide.push(
                    '.dashboard-controls',
                    '.dashboard-toolbar',
                    'div[data-testid*="dashboard controls"]',
                );
            }

            selectorsToHide.forEach(selector => {
                document.querySelectorAll(selector).forEach(el => {
                    el.hidden = true;
                });
            });
        }, process.env.HIDE_DASHBOARD_CONTROLS === 'true');

        // IMPROVED: Enhanced height detection with Grafana 12 specific selectors
        let scrollableSection = null;

        logger.debug("Forcing DOM reflow and layout recalculation...");
        await page.evaluate(() => {
            // try to resize the window to force layout recalculation
            window.dispatchEvent(new Event('resize'));

           // try to force a reflow
            document.body.style.display = 'none';
            document.body.offsetHeight;
            document.body.style.display = 'block';

            return new Promise(resolve => setTimeout(resolve, 500));
        });
        logger.debug("Layout reflow completed. Re-calculating content height.");

        const totalHeight = await page.evaluate(() => {
            logger.debug("Attempting to detect page height with multiple selectors...");

            // Priority list of selectors for different Grafana versions
            const selectors = [
                '#pageContent div[class*="canvas-wrapper-old"]',                          // Grafana 12.0.2+
                '[data-testid="dashboard-grid"]',       // Grafana 12 dashboard grid (highest priority)
                '[data-testid="scrollbar-view"]',       // Grafana 11.5+
                '.scrollbar-view',                      // Grafana <= 11.4
                '.main-view',                           // Alternative main view
                '.dashboard-container',                 // Dashboard container
                '.react-grid-layout',                   // Dashboard panels grid
                '.dashboard-scroll',                    // Scrollable dashboard area
                'main',                                 // Main HTML element
                '.panel-container',                     // Panel container fallback
                'body'                                  // Ultimate fallback
            ];

            let selectorUsed = '';

            // Try each selector until we find one
            for (const selector of selectors) {
                logger.debug(`Trying selector: ${selector}`);
                scrollableSection = document.querySelector(selector);
                if (scrollableSection) {
                    selectorUsed = selector;
                    logger.debug(`Successfully found element with selector: ${selector}`);
                    break;
                }
            }

            if (!scrollableSection) {
                logger.debug("No suitable element found, using document.body as fallback");
                scrollableSection = document.body;
                selectorUsed = 'body (fallback)';
            }

            // Different height calculation strategies
            let height = null;

            // NEW: Grafana 12 specific panel height calculation
            const allPanelSelectors = [
                '#pageContent div[class*="canvas-wrapper-old"]',
                '[data-testid="panel"]',
                '.panel-container',
                '.react-grid-item',
                '.dashboard-panel'
            ];

            let panels = [];
            for (const selector of allPanelSelectors) {
                const elements = document.querySelectorAll(selector);
                if (elements && elements.length > 0) {
                    panels = Array.from(elements);
                    logger.debug(`Using ${selector} for panel height calculation, found ${panels.length} panels`);
                    break;
                }
            }

            if (panels.length > 0) {
                let maxBottom = 0;
                panels.forEach((panel, idx) => {
                    const rect = panel.getBoundingClientRect();
                    logger.debug(`Panel ${idx+1} position: top=${rect.top}, bottom=${rect.bottom}`);
                    maxBottom = Math.max(maxBottom, rect.bottom);
                });

                if (maxBottom > 100) {
                    height = Math.ceil(maxBottom + 100); // Add padding
                    logger.debug(`Height calculated from ${panels.length} panels: ${height}`);
                    return height;
                }
            }

            // Original height calculation strategies as fallback
            if (!height && scrollableSection.firstElementChild && scrollableSection.firstElementChild.scrollHeight > 100) {
                height = scrollableSection.firstElementChild.scrollHeight;
                logger.debug(`Height from firstElementChild.scrollHeight: ${height} (selector: ${selectorUsed})`);
            }

            if (!height && scrollableSection.scrollHeight > 100) {
                height = scrollableSection.scrollHeight;
                logger.debug(`Height from element.scrollHeight: ${height} (selector: ${selectorUsed})`);
            }

            if (!height) {
                const rect = scrollableSection.getBoundingClientRect();
                if (rect.height > 100) {
                    height = Math.ceil(rect.height);
                    logger.debug(`Height from getBoundingClientRect: ${height} (selector: ${selectorUsed})`);
                }
            }

            // Fallback height
            if (!height) {
                height = Math.max(window.innerHeight * 2, 1600);
                logger.debug(`Using fallback height: ${height}`);
            }

            logger.debug(`Final height determined: ${height} using selector: ${selectorUsed}`);
            return height;
        });

        if (!totalHeight || totalHeight < 100) {
            logger.warn("Could not determine reliable page height, using fallback of 1600px");
            const fallbackHeight = 1600;

            // Advanced scrolling technique for Grafana 12
            await page.evaluate(async () => {
                logger.debug("Performing comprehensive scrolling to ensure all content is loaded...");

                // Progressive scrolling with pauses
                const viewportHeight = window.innerHeight;
                const maxScrolls = 25;  // Increased for Grafana 12
                const scrollDelay = 750;

                for (let i = 0; i < maxScrolls; i++) {
                    window.scrollTo(0, i * viewportHeight / 2);
                    await new Promise(resolve => setTimeout(resolve, scrollDelay));
                }

                // Scroll back to top
                window.scrollTo(0, 0);
                await new Promise(resolve => setTimeout(resolve, scrollDelay));
            });

            logger.info("Page height set to fallback:", fallbackHeight);
        } else {
            logger.info("Page height successfully determined:", totalHeight);

            // Enhanced scrolling for Grafana 12
            await page.evaluate(async () => {
                logger.debug("Performing enhanced scrolling to load all content...");

                // Progressive scroll approach
                const viewportHeight = window.innerHeight;
                const totalScrolls = Math.ceil(document.body.scrollHeight / (viewportHeight / 3));
                const scrollDelay = 750;

                logger.debug(`Planning ${totalScrolls} scroll steps`);

                // First scroll down gradually
                for (let i = 0; i < totalScrolls; i++) {
                    window.scrollTo(0, i * viewportHeight / 3);
                    await new Promise(resolve => setTimeout(resolve, scrollDelay));
                }

                // Then scroll back up gradually
                for (let i = totalScrolls; i >= 0; i--) {
                    window.scrollTo(0, i * viewportHeight / 3);
                    await new Promise(resolve => setTimeout(resolve, scrollDelay));
                }

                logger.debug("Progressive scrolling completed");
            });
        }

        if (process.env.CHECK_QUERIES_TO_COMPLETE === 'true' && !finalUrl.includes('viewPanel=')) {
            logger.info("Waiting for all queries to complete...");

            await page.evaluate(async () => {
                if (scrollableSection) {
                    logger.info("Scrolling to the bottom of the page to trigger all queries...");
                    const totalHeight = scrollableSection.scrollHeight;
                    const viewportHeight = window.innerHeight;
                    let scrolled = 0;
                    while (scrolled < totalHeight) {
                        scrollableSection.scrollBy(0, viewportHeight);
                        scrolled += viewportHeight;
                        await new Promise(res => setTimeout(res, 500));
                    }
                }
            });

            const dashboardQueryInfo = await page.evaluate(async (excludedTypes) => {
                const entry = performance.getEntriesByType("resource").find(r => {
                    if (!['fetch','xmlhttprequest'].includes(r.initiatorType)) return false;
                    const u = r.name;
                    return /\/api\/dashboards\/uid\/[^/?#]+/.test(u) ||
                        /\/apis\/dashboard\.grafana\.app\/v1beta1\/namespaces\/[^/]+\/dashboards\/[^/]+\/dto(?:\?|$)/.test(u);
                });
                if (!entry) throw new Error("Dashboard request not found.");

                const res = await fetch(entry.name, { credentials: 'include' });
                if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
                const json = await res.json();

                const root =
                    json?.spec ??
                    json?.model ??
                    json?.dashboard ??
                    json;

                const panels = Array.isArray(root?.panels) ? root.panels : [];
                const templating = root?.templating?.list ?? [];

                function countPanels(list) {
                    let n = 0;
                    for (const p of list) {
                        if (!p || excludedTypes.includes(p.type)) continue;
                        if (p.type === 'row' && Array.isArray(p.panels)) { n += countPanels(p.panels); continue; }
                        const hasDs = !!p.datasource || (Array.isArray(p.targets) && p.targets.some(t => t?.datasource));
                        if (hasDs) n++;
                    }
                    return n;
                }

                const valid = countPanels(panels);
                const templatingQueries = templating.filter(v => v?.type === 'query').length;

                logger.info(`✔ Expected queries: ${valid + templatingQueries}`);
                return { valid, templating: templatingQueries };
            }, ['text']);

            const panelErrorSelectors = [
                '.panel-content .alert-error',
                '.panel-content .panel-error',
                '.panel-content .panel-alert-error',
                '.react-panel-error',
                '[data-testid="panel-error-container"]',
                '.panel-content .render-error',
                '.react-grid-item div[data-testid*="header-container"] button[data-testid*="status error"]'
            ];

            const panelErrorCount = await page.evaluate((selectors) => {
                const matchedErrors = selectors.flatMap(selector =>
                    Array.from(document.querySelectorAll(selector))
                );

                const uniquePanels = new Set();

                matchedErrors.forEach(errEl => {
                    const panel =
                        errEl.closest('.panel-container') ||
                        errEl.closest('.panel') ||
                        errEl.closest('[data-testid*="panel"]') ||
                        errEl.closest('.react-grid-item');

                    if (panel) {
                        uniquePanels.add(panel);

                        const titleSelectors = [
                            'div[class*="panel-title"] h2',
                            '[data-testid="panel-title"]',
                            '.panel-header span',
                            'h2', 'h3', 'h4',
                        ];

                        let title = '[Untitled Panel]';
                        for (const selector of titleSelectors) {
                            const el = panel.querySelector(selector);
                            if (el?.textContent?.trim()) {
                                title = el.textContent.trim();
                                break;
                            }
                        }

                        logger.warn(`🛑 Panel with error detected: "${title}"`);
                    }
                });

                logger.info(`🛑 Total panels with errors: ${uniquePanels.size}`);
                return uniquePanels.size;
            }, panelErrorSelectors);

            const variableErrorSelectors = [
                'div[data-testid*="template variable"] label svg',
            ];

            const variableQueryErrorCount = await page.evaluate((selectors) => {
                const matched = selectors.flatMap(sel => Array.from(document.querySelectorAll(sel)));

                const variableWrappers = new Set();

                matched.forEach(el => {
                    const variableWrapper = el.closest('.variable-wrapper') ||
                        el.closest('.template-variable-wrapper') ||
                        el.closest('div[data-testid*="template variable"]');

                    if (variableWrapper) {
                        variableWrappers.add(variableWrapper);
                        const titleSelectors = [
                            'span.variable-label',
                            'label[data-testid*="template variable"]',
                            '.variable-name',
                            '.variable-title'
                        ];
                        let title = '[Untitled Variable]';
                        for (const selector of titleSelectors) {
                            const el = variableWrapper.querySelector(selector);
                            if (el?.textContent?.trim()) {
                                title = el.textContent.trim();
                                break;
                            }
                        }
                        logger.warn(`🛑 Variable with query error detected: "${title}"`);
                    }
                });

                logger.info(`🛑 Variables with query errors detected: ${variableWrappers.size}`);
                return variableWrappers.size;
            }, variableErrorSelectors);

            const panelCountFromJson = dashboardQueryInfo.valid;
            const variableQueryCount = dashboardQueryInfo.templating;

            const effectiveVariableQueryCount = Math.max(0, variableQueryCount - variableQueryErrorCount);

            const effectivePanelQueryCount = Math.max(0, (panelCountFromJson - panelErrorCount)) + effectiveVariableQueryCount;

            const maxWaitTime = parseInt(process.env.CHECK_QUERIES_TO_COMPLETE_QUERIES_COMPLETION_TIMEOUT, 10) || 60000;
            const maxStableWait = parseInt(process.env.CHECK_QUERIES_TO_COMPLETE_MAX_QUERY_COMPLETION_TIME, 10) || 30000;
            const interval = parseInt(process.env.CHECK_QUERIES_TO_COMPLETE_QUERIES_INTERVAL, 10) || 4000;

            let elapsedTime = 0;
            let lastCompletedCount = 0;
            let stableCountTime = 0;

            logger.info(`Waiting for queries to complete... Expected: ${effectivePanelQueryCount}, Timeout: ${maxWaitTime}ms, Interval: ${interval}ms`);

            while (elapsedTime < maxWaitTime) {
                const completedQueryCount = await page.evaluate(() =>
                    performance.getEntriesByType("resource")
                        .filter(r => r.initiatorType === 'fetch' && r.name.includes('query')).length
                );

                logger.debug(`Completed Queries: ${completedQueryCount} / ${effectivePanelQueryCount}`);

                if (completedQueryCount >= effectivePanelQueryCount) {
                    logger.info("All expected queries have completed.");
                    break;
                }

                if (completedQueryCount === lastCompletedCount) {
                    stableCountTime += interval;
                    if (stableCountTime >= maxStableWait) {
                        throw new Error(`❌ Query completion seems stuck — no progress after ${maxStableWait}ms.`);
                    }
                } else {
                    stableCountTime = 0;
                }

                lastCompletedCount = completedQueryCount;
                await new Promise(res => setTimeout(res, interval));
                elapsedTime += interval;
                logger.debug(`Waiting... Elapsed: ${elapsedTime}ms`);
            }

            if (elapsedTime >= maxWaitTime) {
                throw new Error("Timeout: Not all queries completed in time.");
            }
        }


        // Add a final check for all panels and ensure they're visible
        await page.evaluate(async () => {
            logger.debug("Final check for panel visibility...");

            // Find all panels with any known selector
            const panelSelectors = [
                '#pageContent div[class*="canvas-wrapper-old"]',
                '[data-testid="panel"]',
                '.panel-container',
                '.react-grid-item',
                '.dashboard-panel',
                '.grafana-panel'
            ];

            let allPanels = [];
            for (const selector of panelSelectors) {
                const panels = document.querySelectorAll(selector);
                if (panels && panels.length > 0) {
                    allPanels = Array.from(panels);
                    logger.debug(`Found ${panels.length} panels with selector ${selector}`);
                    break;
                }
            }

            if (allPanels.length > 0) {
                // Make sure all panels are visible
                allPanels.forEach((panel, i) => {
                    panel.style.display = 'block';
                    panel.style.visibility = 'visible';
                    panel.style.opacity = '1';

                    // Ensure any lazy-loaded content inside panels is visible
                    const charts = panel.querySelectorAll('.graph-canvas, .graph-panel, canvas, svg');
                    charts.forEach(chart => {
                        chart.style.visibility = 'visible';
                        chart.style.opacity = '1';
                    });
                });

                logger.debug(`Ensured visibility of ${allPanels.length} panels`);
            }

            // Extra wait to ensure charts render
            await new Promise(resolve => setTimeout(resolve, 2000));
        });

        // Final wait for all panels to be fully rendered
        logger.debug("Final wait for all panels to render completely...");
        await page.evaluate(timeout => {
            return new Promise(resolve => setTimeout(resolve, timeout));
        }, 5000);

        const finalHeight = totalHeight && totalHeight >= 100 ? totalHeight : 1600;

        await page.setViewport({
            width: width_px,
            height: finalHeight,
            deviceScaleFactor: 2,
            isMobile: false
        });

        logger.info("Generating PDF");
        let pdfHeight = finalHeight;
        if (overrideHeight && !isNaN(overrideHeight)) {
            pdfHeight = overrideHeight;
            logger.info(`Forcing PDF page height to override: ${pdfHeight}px`);
        } else {
            logger.info(`PDF page height will follow auto-detected content height: ${pdfHeight}px`);
        }

        await page.emulateMediaType('screen');

        await page.addStyleTag({
            content: `
                html, body {
                  height: auto !important;
                  overflow: visible !important;
                  -webkit-print-color-adjust: exact !important;
                  print-color-adjust: exact !important;
                }
                @page { size: ${width_px}px ${pdfHeight}px; margin: 0; }
            `
        });

        await page.pdf({
            path: outfile,
            width: width_px + 'px',
            height: pdfHeight + 'px',
            printBackground: true,
            scale: 1,
            displayHeaderFooter: false,
            margin: {top: 0, right: 0, bottom: 0, left: 0}
        });
        logger.debug(`PDF generated: ${outfile}`);

        await browser.close();
        logger.debug("Browser closed.");

        process.send({ success: true, path: outfile });
    } catch (error) {
        logger.error("Error during PDF generation:", error.message);
        process.send({ success: false, error: error.message });
        process.exit(1);
    }
})();
